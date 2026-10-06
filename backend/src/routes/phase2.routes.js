import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { InteractiveScene, Progress } from '../models/index.js';
import { generateHotspotQuestion } from '../services/ai.js';
import { geminiEnabled } from '../services/gemini.js';
import { progressFilter, withProgress } from '../services/progress.js';
import { hotspotPoints } from '../services/scoring.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicQuestion, publicScene } from '../utils/sanitize.js';

const router = Router({ mergeParams: true });

const submitBody = z.object({
  hotspotId: z.string().min(1).max(60),
  questionId: z.string().min(1).max(80),
  selectedOption: z.enum(['A', 'B', 'C', 'D', 'E']),
});

const useAi = () => env.AI_HOTSPOT_QUESTIONS && geminiEnabled();
const maybeAiLimiter = (req, res, next) => (useAi() ? aiLimiter(req, res, next) : next());

async function loadScene(slug) {
  const scene = await InteractiveScene.findOne({ bookSlug: slug }).lean();
  if (!scene) throw new AppError(404, 'SCENE_NOT_FOUND', 'Cena da Fase 2 não encontrada.');
  return scene;
}
const findHotspot = (scene, id) => {
  const h = scene.hotspots.find((x) => x.elementId === id);
  if (!h) throw new AppError(404, 'HOTSPOT_NOT_FOUND', `Hotspot desconhecido: ${id}`);
  return h;
};

// Respostas já dadas: hotspotId -> { selected, correct } (a primeira resposta vale, certa ou errada).
const answeredMap = (p2) => {
  const map = new Map();
  for (const h of p2?.history ?? []) if (!map.has(h.hotspotId)) map.set(h.hotspotId, h);
  return map;
};

router.get(
  '/phase-2',
  withProgress(2),
  asyncHandler(async (req, res) => {
    const scene = await loadScene(req.book.slug);
    const answered = answeredMap(req.progress.phase2);
    const pub = publicScene(scene);
    res.json({
      ...pub,
      hotspots: pub.hotspots.map((h) => {
        const a = answered.get(h.id);
        return { ...h, solved: !!a, status: a ? (a.correct ? 'correct' : 'wrong') : null };
      }),
      progress: {
        totalHotspots: scene.hotspots.length,
        answeredCount: answered.size,
        correctCount: [...answered.values()].filter((a) => a.correct).length,
        completed: !!req.progress.phase2?.completed,
      },
    });
  }),
);

router.get(
  '/phase-2/hotspot/:hotspotId',
  withProgress(2),
  maybeAiLimiter,
  asyncHandler(async (req, res) => {
    const scene = await loadScene(req.book.slug);
    const hotspot = findHotspot(scene, req.params.hotspotId);
    const p2 = req.progress.phase2 ?? {};
    const answered = answeredMap(p2).get(hotspot.elementId);
    const pending = p2.pending?.[hotspot.elementId];

    // Já respondido: devolve a questão que o aluno viu e o resultado (a resposta é definitiva).
    if (answered) {
      const q = pending ?? hotspot.question;
      return res.json({
        hotspotId: hotspot.elementId,
        isAiGenerated: !!pending,
        alreadyAnswered: true,
        question: pending ? pending.public : publicQuestion(hotspot).question,
        result: {
          selectedOption: answered.selected,
          isCorrect: !!answered.correct,
          correctOption: q.correctOption,
          pedagogicalExplanation: q.explanation,
        },
      });
    }

    // Caminho B (IA): reaproveita a questão pendente se o aluno reabriu o modal.
    if (useAi()) {
      if (pending) {
        return res.json({ hotspotId: hotspot.elementId, isAiGenerated: true, alreadyAnswered: false, question: pending.public });
      }
      try {
        const gen = await generateHotspotQuestion({ book: req.book, hotspot });
        const questionId = `${hotspot.question.questionId}_ai_${Date.now().toString(36)}`;
        const pub = { questionId, statement: gen.statement, sourceExam: null, examYear: null, options: gen.options };
        await Progress.updateOne(progressFilter(req), {
          $set: {
            [`phase2.pending.${hotspot.elementId}`]: {
              questionId,
              correctOption: gen.correctOption,
              explanation: gen.explanation,
              public: pub,
            },
          },
        });
        return res.json({ hotspotId: hotspot.elementId, isAiGenerated: true, alreadyAnswered: false, question: pub });
      } catch (e) {
        if (!(e instanceof AppError)) throw e; // cai na questão estática
      }
    }

    res.json({ ...publicQuestion(hotspot), isAiGenerated: false, alreadyAnswered: false });
  }),
);

// A primeira resposta de cada hotspot é definitiva: certa ou errada, ele fica respondido e o gabarito é revelado.
router.post(
  '/phase-2/submit',
  withProgress(2),
  asyncHandler(async (req, res) => {
    const body = submitBody.parse(req.body);
    const scene = await loadScene(req.book.slug);
    const hotspot = findHotspot(scene, body.hotspotId);
    const total = scene.hotspots.length;
    const p2 = req.progress.phase2 ?? {};

    const pending = p2.pending?.[hotspot.elementId];
    let answer;
    if (pending && pending.questionId === body.questionId) answer = pending;
    else if (hotspot.question.questionId === body.questionId) answer = hotspot.question;
    else throw new AppError(400, 'QUESTION_MISMATCH', 'questionId não corresponde a este hotspot.');

    const reveal = (a, isCorrect, selected, extra = {}) => ({
      hotspotId: hotspot.elementId,
      isCorrect,
      selectedOption: selected,
      correctOption: answer.correctOption,
      pedagogicalExplanation: answer.explanation,
      ...extra,
    });
    const progressOf = (answeredCount, correctCount, completed) => ({
      totalHotspots: total,
      answeredCount,
      correctCount,
      canTransitionToPhase3: completed || answeredCount >= total,
    });

    const already = answeredMap(p2).get(hotspot.elementId);
    if (already) {
      const map = answeredMap(p2);
      return res.json(
        reveal(answer, !!already.correct, already.selected, {
          alreadyAnswered: true,
          phase2Progress: progressOf(map.size, [...map.values()].filter((x) => x.correct).length, !!p2.completed),
        }),
      );
    }

    const isCorrect = body.selectedOption === answer.correctOption;
    const now = new Date();
    // O filtro garante que só a primeira resposta grava (duas requisições simultâneas não pontuam duas vezes).
    const saved = await Progress.updateOne(
      { ...progressFilter(req), 'phase2.resolvedHotspots': { $ne: hotspot.elementId } },
      {
        $push: { 'phase2.history': { hotspotId: hotspot.elementId, selected: body.selectedOption, correct: isCorrect, at: now } },
        $addToSet: { 'phase2.resolvedHotspots': hotspot.elementId },
        ...(isCorrect && { $inc: { 'phase2.score': hotspotPoints(total) } }),
      },
    );
    if (!saved.modifiedCount) throw new AppError(409, 'ALREADY_ANSWERED', 'Este elemento já foi respondido.');

    const fresh = await Progress.findOne(progressFilter(req)).lean();
    const map = answeredMap(fresh.phase2);
    let completed = !!fresh.phase2?.completed;
    if (map.size >= total && !completed) {
      completed = true;
      await Progress.updateOne(progressFilter(req), {
        $set: { 'phase2.completed': true, 'phase2.completedAt': now },
        $max: { currentPhase: 3 },
      });
    }
    res.json(reveal(answer, isCorrect, body.selectedOption, {
      attempts: 1,
      phase2Progress: progressOf(map.size, [...map.values()].filter((x) => x.correct).length, completed),
    }));
  }),
);

export default router;
