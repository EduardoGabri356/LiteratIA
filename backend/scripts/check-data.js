// Valida data/books.json sem tocar no banco.  Uso: npm run check:data
import { loadAndValidate } from './lib/loadData.js';

const { books, errors, warnings } = await loadAndValidate();

for (const w of warnings) console.warn(`AVISO  ${w}`);
for (const e of errors) console.error(`ERRO   ${e}`);

if (errors.length) {
  console.error(`\n${errors.length} erro(s). Corrija o JSON antes de rodar o seed.`);
  process.exit(1);
}
console.log(`\nOK: ${books.length} livro(s) válidos (${warnings.length} aviso(s)).`);
