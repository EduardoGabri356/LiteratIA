import { Router } from 'express';
import { Book, Progress, Session, UserReward } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicBookCard } from '../utils/sanitize.js';

const router = Router();

// GET /api/v1/user/session — cria a sessão se não existir e devolve a estante com o progresso.
router.get(
  '/session',
  asyncHandler(async (req, res) => {
    const { sessionUuid } = req;
    const now = new Date();
    let session;
    try {
      session = await Session.findOneAndUpdate(
        { sessionUuid },
        { $setOnInsert: { sessionUuid, completedBooks: [] }, $set: { lastSeenAt: now } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
    } catch (e) {
      if (e?.code !== 11000) throw e;
      session = await Session.findOne({ sessionUuid }).lean();
    }

    const [books, progressDocs, rewards] = await Promise.all([
      Book.find({ active: true }).sort({ order: 1 }).lean(),
      Progress.find({ sessionUuid }).lean(),
      UserReward.findOne({ sessionUuid }).lean(),
    ]);
    const progressBySlug = new Map(progressDocs.map((p) => [p.bookSlug, p]));
    const unlocked = new Map((rewards?.unlockedItems ?? []).map((i) => [i.bookSlug, i]));

    res.json({
      sessionUuid,
      books: books.map((b) => {
        const p = progressBySlug.get(b.slug);
        const done = (session.completedBooks ?? []).includes(b.slug); // recompensa vale mesmo se o aluno rejogar
        const item = unlocked.get(b.slug);
        return {
          ...publicBookCard(b),
          status: p?.status ?? 'NOT_STARTED',
          currentPhase: p?.currentPhase ?? 1,
          badgeUnlocked: done,
          actionFigureUnlocked: done,
          ...(done && {
            badgeUrl: b.badgeUrl,
            actionFigure: item?.actionFigure
              ? { id: item.actionFigure.figureId, name: item.actionFigure.name, thumbnailUrl: item.actionFigure.thumbnailUrl }
              : { id: b.actionFigureReward.figureId, name: b.actionFigureReward.name, thumbnailUrl: b.actionFigureReward.thumbnailUrl },
          }),
        };
      }),
    });
  }),
);

export default router;
