import { Book } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const loadBook = asyncHandler(async (req, _res, next) => {
  const { slug } = req.params;
  if (!SLUG.test(slug)) throw new AppError(400, 'INVALID_SLUG', 'Slug inválido.');
  const book = await Book.findOne({ slug, active: true }).lean();
  if (!book) throw new AppError(404, 'BOOK_NOT_FOUND', 'Livro não encontrado.');
  req.book = book;
  next();
});
