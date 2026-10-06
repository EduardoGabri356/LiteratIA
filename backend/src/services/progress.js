import { Progress } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export async function getOrCreateProgress(sessionUuid, bookSlug) {
  const filter = { sessionUuid, bookSlug };
  try {
    return await Progress.findOneAndUpdate(
      filter,
      { $setOnInsert: { ...filter, status: 'IN_PROGRESS', currentPhase: 1, startedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  } catch (e) {
    if (e?.code === 11000) return Progress.findOne(filter).lean(); // duas abas criando ao mesmo tempo
    throw e;
  }
}

// Exige que o livro tenha sido aberto (/load) e que a fase `minPhase` já esteja liberada.
export const withProgress = (minPhase) =>
  asyncHandler(async (req, _res, next) => {
    const progress = await Progress.findOne({ sessionUuid: req.sessionUuid, bookSlug: req.book.slug }).lean();
    if (!progress) {
      throw new AppError(409, 'BOOK_NOT_STARTED', 'Abra o livro (POST /books/:slug/load) antes de jogar.');
    }
    if (minPhase > (progress.currentPhase ?? 1)) {
      throw new AppError(403, 'PHASE_LOCKED', `Conclua a fase ${minPhase - 1} para liberar a fase ${minPhase}.`);
    }
    req.progress = progress;
    next();
  });

export const progressFilter = (req) => ({ sessionUuid: req.sessionUuid, bookSlug: req.book.slug });
