import { readFile } from 'node:fs/promises';
import { validateBook } from './transform.js';

export const DATA_PATH = new URL('../../data/books.json', import.meta.url);

export async function loadAndValidate(path = DATA_PATH) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return { books: [], errors: [`Arquivo não encontrado: data/books.json. Salve ali o JSON de conteúdo.`], warnings: [] };
  }
  let books;
  try {
    books = JSON.parse(text);
  } catch (e) {
    return { books: [], errors: [`data/books.json não é JSON válido: ${e.message}`], warnings: [] };
  }
  if (!Array.isArray(books) || books.length === 0) {
    return { books: [], errors: ['data/books.json deve ser um array com pelo menos um livro.'], warnings: [] };
  }
  const errors = [];
  const warnings = [];
  const slugs = new Set();
  for (const [i, b] of books.entries()) {
    const r = validateBook(b, b?.slug ?? `#${i}`);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (b?.slug && slugs.has(b.slug)) errors.push(`slug repetido no arquivo: ${b.slug}`);
    slugs.add(b?.slug);
  }
  return { books, errors, warnings };
}
