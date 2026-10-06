import { Router } from 'express';
import { z } from 'zod';
import { aiLimiter } from '../middleware/rateLimit.js';
import { Progress, Trial } from '../models/index.js';
import { criticTurn1, criticTurn2 } from '../services/ai.js';
import { fallbackEvaluation, fallbackTurn1, GIBBERISH_REPLY } from '../services/fallbacks.js';
import { progressFilter, withProgress } from '../services/progress.js';
import { weightedRubricScore } from '../services/scoring.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicTrial } from '../utils/sanitize.js';
import { ARGUMENT_MAX_CHARS, ARGUMENT_MIN_CHARS, looksLikeGibberish, sanitizeUserText } from '../utils/text.js';

const router = Router({ mergeParams: true });

const debateBody = z.object({
  turn: z.union([z.literal(1), z.literal(2)]),
  userArgument: z.string().max(ARGUMENT_MAX_CHARS * 2),
});

async function loadTrial(slug) {
  const trial = await Trial.findOne({ bookSlug: slug }).lean();
  if (!trial) throw new AppError(404, 'TRIAL_NOT_FOUND', 'Julgamento da Fase 3 não encontrado.');
  return trial;
}

router.get(
  '/phase-3',
  withProgress(3),
  asyncHandler(async (req, res) => {
    const trial = await loadTrial(req.book.slug);
    const p3 = req.progress.phase3 ?? {};
    res.json({
      ...publicTrial(trial),
      literaryCriticName: trial.criticName, // nome usado na spec
      minChars: ARGUMENT_MIN_CHARS,
      maxChars: ARGUMENT_MAX_CHARS,
      debate: {
        messages: (p3.messages ?? []).map(({ turn, role, text }) => ({ turn, role, text })),
        finished: !!p3.evaluatedAt,
        approved: !!p3.approved,
        ...(p3.evaluatedAt && {
          evaluation: {
            approved: !!p3.approved,
            score: p3.score,
            feedbackText: p3.feedbackText,
            rubricBreakdown: p3.rubricBreakdown,
          },
        }),
      },
    });
  }),
);

router.post(
  '/phase-3/debate',
  withProgress(3),
  aiLimiter,
  asyncHandler(async (req, res) => {
    const body = debateBody.parse(req.body);
    const p3 = req.progress.phase3 ?? {};
    const messages = p3.messages ?? [];
    if (p3.evaluatedAt) throw new AppError(409, 'DEBATE_FINISHED', 'O debate já foi avaliado.');

    const expectedTurn = messages.filter((m) => m.role === 'user').length + 1;
    if (body.turn !== expectedTurn) {
      throw new AppError(409, 'WRONG_TURN', `Este debate está no turno ${expectedTurn}.`, { expectedTurn });
    }

    const argument = sanitizeUserText(body.userArgument);
    if (argument.length < ARGUMENT_MIN_CHARS) {
      throw new AppError(400, 'ARGUMENT_TOO_SHORT', `Escreva pelo menos ${ARGUMENT_MIN_CHARS} caracteres.`);
    }
    if (argument.length > ARGUMENT_MAX_CHARS) {
      throw new AppError(400, 'ARGUMENT_TOO_LONG', `O limite é ${ARGUMENT_MAX_CHARS} caracteres.`);
    }
    // Texto sem sentido: o crítico desdenha, o turno NÃO é consumido e o Gemini nem é chamado.
    if (looksLikeGibberish(argument)) {
      return res.json({ turn: body.turn, isValidArgument: false, criticResponse: GIBBERISH_REPLY });
    }

    const trial = await loadTrial(req.book.slug);
    const now = new Date();
    // Trava otimista: só grava se o histórico ainda estiver no estado que lemos (evita turno duplicado).
    const stateGuard =
      body.turn === 1
        ? { 'phase3.messages.0': { $exists: false } }
        : { 'phase3.messages': { $size: 2 }, 'phase3.evaluatedAt': { $exists: false } };

    if (body.turn === 1) {
      let out;
      try {
        out = await criticTurn1({ book: req.book, trial, argument });
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
        out = fallbackTurn1(trial);
      }
      if (!out.isValidArgument) {
        return res.json({ turn: 1, isValidArgument: false, criticResponse: out.criticResponse });
      }
      const saved = await Progress.updateOne(
        { ...progressFilter(req), ...stateGuard },
        {
          $push: {
            'phase3.messages': {
              $each: [
                { turn: 1, role: 'user', text: argument, createdAt: now },
                { turn: 1, role: 'critic', text: out.criticResponse, createdAt: now },
              ],
            },
          },
        },
      );
      if (!saved.modifiedCount) throw new AppError(409, 'WRONG_TURN', 'Este turno já foi enviado.');
      return res.json({ turn: 1, isValidArgument: true, criticResponse: out.criticResponse });
    }

    // ----- Turno 2: tréplica + avaliação pela rubrica -----
    let evalOut;
    let evaluatedBy = 'ai';
    try {
      evalOut = await criticTurn2({ book: req.book, trial, messages, argument });
      evalOut.score = weightedRubricScore(evalOut.rubric, trial.rubric); // a nota final é calculada aqui
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      evaluatedBy = 'fallback';
      evalOut = fallbackEvaluation({
        book: req.book,
        trial,
        userTexts: [...messages.filter((m) => m.role === 'user').map((m) => m.text), argument],
      });
    }
    const approved = evalOut.score >= (trial.rubric.minimumPassScore ?? 6);

    const saved = await Progress.updateOne(
      { ...progressFilter(req), ...stateGuard },
      {
        $push: {
          'phase3.messages': {
            $each: [
              { turn: 2, role: 'user', text: argument, createdAt: now },
              { turn: 2, role: 'critic', text: evalOut.criticResponse, createdAt: now },
            ],
          },
        },
        $set: {
          'phase3.approved': approved,
          'phase3.score': evalOut.score,
          'phase3.rubricBreakdown': evalOut.rubric,
          'phase3.feedbackText': evalOut.feedbackText,
          'phase3.evaluatedBy': evaluatedBy,
          'phase3.evaluatedAt': now,
        },
      },
    );
    if (!saved.modifiedCount) throw new AppError(409, 'WRONG_TURN', 'Este turno já foi enviado.');

    res.json({
      turn: 2,
      isFinalEvaluation: true,
      criticResponse: evalOut.criticResponse,
      evaluation: {
        approved,
        score: evalOut.score,
        feedbackText: evalOut.feedbackText,
        rubricBreakdown: evalOut.rubric,
        evaluatedBy,
      },
      canComplete: approved,
    });
  }),
);

// Reprovou no debate? Recomeça só a Fase 3 (sem perder as fases 1 e 2).
router.post(
  '/phase-3/retry',
  withProgress(3),
  asyncHandler(async (req, res) => {
    const p3 = req.progress.phase3 ?? {};
    if (!p3.evaluatedAt || p3.approved) {
      throw new AppError(409, 'RETRY_NOT_ALLOWED', 'Só é possível refazer um debate reprovado.');
    }
    await Progress.updateOne(progressFilter(req), { $set: { phase3: { messages: [], approved: false, score: 0 } } });
    res.json({ ok: true });
  }),
);

export default router;
