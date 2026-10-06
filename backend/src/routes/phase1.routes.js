import { Router } from 'express';
import { z } from 'zod';
import { aiLimiter } from '../middleware/rateLimit.js';
import { Progress, QuotesChallenge } from '../models/index.js';
import { generateHint } from '../services/ai.js';
import { staticHint } from '../services/fallbacks.js';
import { phase1Score } from '../services/scoring.js';
import { progressFilter, withProgress } from '../services/progress.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicQuotesChallenge } from '../utils/sanitize.js';

const router = Router({ mergeParams: true });

const validateBody = z.object({
  challengeId: z.string().min(1).max(40),
  associations: z
    .array(z.object({ quoteId: z.string().min(1).max(60), optionId: z.string().min(1).max(80) }))
    .min(1)
    .max(10),
});
const hintBody = z.object({ quoteId: z.string().min(1).max(60) });

async function loadChallenge(slug) {
  const challenge = await QuotesChallenge.findOne({ bookSlug: slug }).lean();
  if (!challenge) throw new AppError(404, 'CHALLENGE_NOT_FOUND', 'Desafio da Fase 1 não encontrado.');
  return challenge;
}

const answerView = (a, quote) => ({ quoteId: a.quoteId, optionId: a.optionId, correct: !!a.correct, correctOptionId: quote?.correctOptionId });

router.get(
  '/phase-1',
  withProgress(1),
  asyncHandler(async (req, res) => {
    const challenge = await loadChallenge(req.book.slug);
    const p1 = req.progress.phase1 ?? {};
    const byId = new Map(challenge.quotes.map((q) => [q.quoteId, q]));
    res.json({
      ...publicQuotesChallenge(challenge),
      progress: {
        completed: !!p1.completed,
        // O gabarito só aparece para citações JÁ respondidas (a resposta é definitiva).
        answers: (p1.answers ?? []).map((a) => answerView(a, byId.get(a.quoteId))),
        hintsUsed: p1.hintsUsed ?? 0,
        hintedQuotes: p1.hintedQuotes ?? [],
        score: p1.score ?? 0,
      },
    });
  }),
);

// A 1ª resposta de cada citação é definitiva. Aceita uma associação por vez (onDragEnd) ou várias.
router.post(
  '/phase-1/validate',
  withProgress(1),
  asyncHandler(async (req, res) => {
    const body = validateBody.parse(req.body);
    const challenge = await loadChallenge(req.book.slug);
    if (body.challengeId !== String(challenge._id)) {
      throw new AppError(400, 'CHALLENGE_MISMATCH', 'challengeId não corresponde a este livro.');
    }
    const quotes = new Map(challenge.quotes.map((q) => [q.quoteId, q]));
    const stored = new Map((req.progress.phase1?.answers ?? []).map((a) => [a.quoteId, a]));
    const now = new Date();

    const evaluatedResults = [];
    for (const a of body.associations) {
      const q = quotes.get(a.quoteId);
      if (!q) throw new AppError(400, 'UNKNOWN_QUOTE', `Citação desconhecida: ${a.quoteId}`);
      if (!q.options.some((o) => o.optionId === a.optionId)) {
        throw new AppError(400, 'UNKNOWN_OPTION', `Alternativa desconhecida para ${a.quoteId}`);
      }
      if (stored.has(q.quoteId)) {
        evaluatedResults.push({ ...answerView(stored.get(q.quoteId), q), alreadyAnswered: true });
        continue;
      }
      const correct = a.optionId === q.correctOptionId;
      // O filtro garante que só a primeira resposta grava, mesmo com requisições simultâneas.
      const saved = await Progress.updateOne(
        { ...progressFilter(req), 'phase1.answers.quoteId': { $ne: q.quoteId } },
        {
          $push: { 'phase1.answers': { quoteId: q.quoteId, optionId: a.optionId, correct, at: now } },
          $inc: { 'phase1.attempts': 1, ...(!correct && { 'phase1.errorCount': 1 }) },
          $set: { 'phase1.lastAttemptAt': now },
        },
      );
      if (saved.modifiedCount) {
        stored.set(q.quoteId, { quoteId: q.quoteId, optionId: a.optionId, correct });
        evaluatedResults.push(answerView({ quoteId: q.quoteId, optionId: a.optionId, correct }, q));
      } else {
        const fresh = await Progress.findOne(progressFilter(req)).lean();
        const prev = (fresh.phase1?.answers ?? []).find((x) => x.quoteId === q.quoteId);
        stored.set(q.quoteId, prev);
        evaluatedResults.push({ ...answerView(prev, q), alreadyAnswered: true });
      }
    }

    // Fecha a fase quando todas as citações foram respondidas.
    const fresh = await Progress.findOne(progressFilter(req)).lean();
    const p1 = fresh.phase1 ?? {};
    const allCompleted = (p1.answers ?? []).length >= challenge.quotes.length;
    let score = p1.score ?? 0;
    if (allCompleted && !p1.completed) {
      const correct = p1.answers.filter((x) => x.correct).length;
      score = phase1Score({ correct, total: challenge.quotes.length, hintsUsed: p1.hintsUsed ?? 0 });
      await Progress.updateOne(
        { ...progressFilter(req), 'phase1.completed': { $ne: true } },
        { $set: { 'phase1.completed': true, 'phase1.completedAt': now, 'phase1.score': score }, $max: { currentPhase: 2 } },
      );
    }

    res.json({
      isCorrect: evaluatedResults.every((r) => r.correct),
      allCompleted,
      evaluatedResults,
      correctCount: (p1.answers ?? []).filter((x) => x.correct).length,
      totalQuotes: challenge.quotes.length,
      ...(allCompleted && { nextPhaseUnlocked: 2, phase1Score: score }),
    });
  }),
);

router.post(
  '/phase-1/hint',
  withProgress(1),
  aiLimiter,
  asyncHandler(async (req, res) => {
    const { quoteId } = hintBody.parse(req.body);
    const challenge = await loadChallenge(req.book.slug);
    const quote = challenge.quotes.find((q) => q.quoteId === quoteId);
    if (!quote) throw new AppError(404, 'UNKNOWN_QUOTE', `Citação desconhecida: ${quoteId}`);

    let hintText = quote.hint;
    let source = 'stored';
    if (!hintText) {
      try {
        hintText = await generateHint({ book: req.book, quote });
        source = 'ai';
        // Guarda a dica gerada: o próximo aluno não gasta uma chamada à API.
        const idx = challenge.quotes.indexOf(quote); // caminho por índice: funciona em qualquer servidor Mongo-compatível
        await QuotesChallenge.updateOne(
          { bookSlug: req.book.slug, [`quotes.${idx}.quoteId`]: quoteId },
          { $set: { [`quotes.${idx}.hint`]: hintText } },
        );
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
        hintText = staticHint(quote);
        source = 'fallback';
      }
    }

    // A dica só custa pontos uma vez por citação, e não depois de a citação (ou a fase) ser respondida.
    const p1 = req.progress.phase1 ?? {};
    const charged = await Progress.updateOne(
      { ...progressFilter(req), 'phase1.completed': { $ne: true }, 'phase1.hintedQuotes': { $ne: quoteId }, 'phase1.answers.quoteId': { $ne: quoteId } },
      { $addToSet: { 'phase1.hintedQuotes': quoteId }, $inc: { 'phase1.hintsUsed': 1 } },
    );

    res.json({ quoteId, hintText, source, hintsUsed: (p1.hintsUsed ?? 0) + charged.modifiedCount });
  }),
);

export default router;
