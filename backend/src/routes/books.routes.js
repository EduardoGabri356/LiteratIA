import { Router } from 'express';
import { z } from 'zod';
import { InteractiveScene, Progress, Session, UserReward } from '../models/index.js';
import { loadBook } from '../middleware/loadBook.js';
import { getOrCreateProgress, progressFilter, withProgress } from '../services/progress.js';
import { finalScore, gradeFor } from '../services/scoring.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import phase1 from './phase1.routes.js';
import phase2 from './phase2.routes.js';
import phase3 from './phase3.routes.js';

const router = Router();

const loadBody = z.object({ forceReset: z.boolean().default(false) });

function progressView(book, p, totalHotspots) {
  const p1 = p.phase1 ?? {};
  const p2 = p.phase2 ?? {};
  const p3 = p.phase3 ?? {};
  return {
    bookId: String(book._id),
    slug: book.slug,
    title: book.title,
    status: p.status,
    currentPhase: p.currentPhase ?? 1,
    phase1Data: { completed: !!p1.completed, score: p1.score ?? 0, answeredCount: (p1.answers ?? []).length },
    phase2Data: { completed: !!p2.completed, answeredCount: (p2.resolvedHotspots ?? []).length, totalHotspots },
    phase3Data: { approved: !!p3.approved, turnsUsed: (p3.messages ?? []).filter((m) => m.role === 'user').length },
  };
}

// POST /books/:slug/load
router.post(
  '/:slug/load',
  loadBook,
  asyncHandler(async (req, res) => {
    const { forceReset } = loadBody.parse(req.body ?? {});
    if (forceReset) await Progress.deleteOne(progressFilter(req)); // rewards e completedBooks são mantidos
    const progress = await getOrCreateProgress(req.sessionUuid, req.book.slug);
    res.json(progressView(req.book, progress, req.book.totalHotspots));
  }),
);

// POST /books/:slug/complete — só depois que o debate foi aprovado. Idempotente.
router.post(
  '/:slug/complete',
  loadBook,
  withProgress(3),
  asyncHandler(async (req, res) => {
    const { book, progress, sessionUuid } = req;
    if (!progress.phase3?.approved) {
      throw new AppError(403, 'NOT_APPROVED', 'O debate da Fase 3 precisa ser aprovado antes de concluir o livro.');
    }

    const now = new Date();
    let { finalScore: total, grade, totalTimeSeconds } = progress;
    if (progress.status !== 'COMPLETED') {
      total = finalScore({
        phase1: progress.phase1?.score,
        phase2: progress.phase2?.score,
        phase3Score10: progress.phase3.score,
      });
      grade = gradeFor(total);
      totalTimeSeconds = Math.min(86_400, Math.max(1, Math.round((now - new Date(progress.startedAt)) / 1000)));
      await Progress.updateOne(progressFilter(req), {
        $set: { status: 'COMPLETED', finalScore: total, grade, totalTimeSeconds, completedAt: now },
      });
    }

    const figure = book.actionFigureReward;
    await Session.updateOne({ sessionUuid }, { $addToSet: { completedBooks: book.slug } }, { upsert: true });
    await UserReward.updateOne({ sessionUuid }, { $setOnInsert: { sessionUuid } }, { upsert: true }).catch((e) => {
      if (e?.code !== 11000) throw e;
    });
    await UserReward.updateOne(
      { sessionUuid, 'unlockedItems.bookSlug': { $ne: book.slug } },
      {
        $push: {
          unlockedItems: {
            bookSlug: book.slug,
            badge: `SELO_GOLD_${book.slug.toUpperCase().replace(/-/g, '_')}`,
            actionFigure: { figureId: figure.figureId, name: figure.name, assetUrl: figure.assetUrl, thumbnailUrl: figure.thumbnailUrl },
            unlockedAt: now,
          },
        },
      },
    );

    res.json({
      status: 'SUCCESS',
      bookSlug: book.slug,
      summary: { finalScore: total, grade, totalTimeSeconds },
      rewards: {
        badgeUrl: book.badgeUrl,
        actionFigure: { id: figure.figureId, name: figure.name, modelUrl: figure.assetUrl, thumbnailUrl: figure.thumbnailUrl },
      },
    });
  }),
);

// Fases (cada router usa mergeParams para enxergar :slug).
router.use('/:slug', loadBook, phase1, phase2, phase3);

export default router;
