// Popula o MongoDB a partir de data/books.json.
//   npm run seed          -> upsert por slug (idempotente; preserva sessões e progresso)
//   npm run seed:reset    -> apaga ANTES apenas as coleções de conteúdo (books, quotes_challenges,
//                            interactive_scenes, trials). Nunca toca em sessions/progress/user_rewards.
import { loadAndValidate } from './lib/loadData.js';
import { transformBook } from './lib/transform.js';

const reset = process.argv.includes('--reset');

const { books, errors, warnings } = await loadAndValidate();
for (const w of warnings) console.warn(`AVISO  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`ERRO   ${e}`);
  console.error('\nSeed cancelado: corrija os erros acima (rode `npm run check:data` para repetir a validação).');
  process.exit(1);
}

// Import dinâmico: só carrega env/mongoose depois que o JSON foi validado.
const { connectDb, disconnectDb } = await import('../src/config/db.js');
const { Book, QuotesChallenge, InteractiveScene, Trial } = await import('../src/models/index.js');

const upsert = { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true };

try {
  await connectDb();

  if (reset) {
    await Promise.all([Book, QuotesChallenge, InteractiveScene, Trial].map((m) => m.deleteMany({})));
    console.log('[seed] coleções de conteúdo limpas');
  }

  for (const [i, raw] of books.entries()) {
    const t = transformBook(raw, i);
    const key = { bookSlug: t.book.slug };
    await Book.findOneAndUpdate({ slug: t.book.slug }, { $set: t.book }, upsert);
    await QuotesChallenge.findOneAndUpdate(key, { $set: t.quotes }, upsert);
    await InteractiveScene.findOneAndUpdate(key, { $set: t.scene }, upsert);
    await Trial.findOneAndUpdate(key, { $set: t.trial }, upsert);
    console.log(
      `[seed] ${t.book.slug}: ${t.quotes.quotes.length} citações, ${t.scene.hotspots.length} hotspots, 1 julgamento`,
    );
  }
  console.log('[seed] concluído');
} catch (e) {
  console.error('[seed] falhou:', e.message);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
