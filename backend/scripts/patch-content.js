// Aplica as correções de conteúdo combinadas no projeto ao data/books.json. Idempotente; guarda o original em data/books.json.bak.
//   npm run patch:data
//   1. remove o POI do Prudêncio (decisão do projeto: Memórias Póstumas fica com 6 hotspots)
//   2. grava as coordenadas (%) dos hotspots medidas sobre as imagens finais (data/coords.json)
//   3. corrige erros de texto já identificados (cirílico no keyThemes, Pandora, hipopótamo, Zulmira, Barão de Miranda)
// Erros de literatura (citações literais, capítulos) continuam exigindo conferência humana em edição confiável.
import { constants } from 'node:fs';
import { copyFile, readFile, writeFile } from 'node:fs/promises';

const BOOKS = new URL('../data/books.json', import.meta.url);
const COORDS = new URL('../data/coords.json', import.meta.url);

const TEXT_FIXES = [
  [/\s*паразиismo social/g, 'Parasitismo social'],
  [/uma hipopótama/gi, 'um hipopótamo'],
  [/\bA Hipopótama\b/g, 'O Hipopótamo'],
  [/hipopótama/g, 'hipopótamo'],
  [/Natureza ou Pandemia/g, 'Natureza ou Pandora'],
  [/Pandemia/g, 'Pandora'],
  [/Zumira/g, 'Zulmira'],
  [/Visconde de Miranda/g, 'Barão de Miranda'],
];

function fixStrings(value) {
  if (typeof value === 'string') return TEXT_FIXES.reduce((s, [re, to]) => s.replace(re, to), value);
  if (Array.isArray(value)) return value.map(fixStrings);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fixStrings(v)]));
  return value;
}

const raw = await readFile(BOOKS, 'utf8');
const coords = JSON.parse(await readFile(COORDS, 'utf8'));
// O backup só é criado uma vez: rodar de novo não sobrescreve o original.
await copyFile(BOOKS, new URL('../data/books.json.bak', import.meta.url), constants.COPYFILE_EXCL).catch(() => {});

let books = fixStrings(JSON.parse(raw));
const report = [];
books = books.map((book) => {
  const before = book.pointAndClickPhase.length;
  book.pointAndClickPhase = book.pointAndClickPhase.filter((h) => h.elementId !== 'elem_prudencio');
  if (book.pointAndClickPhase.length !== before) report.push(`${book.slug}: Prudêncio removido`);

  const map = coords[book.slug];
  if (map) {
    for (const h of book.pointAndClickPhase) {
      const c = map[h.elementId];
      if (!c) report.push(`AVISO ${book.slug}: sem coordenada para ${h.elementId} (mantida a original)`);
      else h.coords = { x: c[0], y: c[1], width: c[2], height: c[3] };
    }
    const extra = Object.keys(map).filter((id) => !book.pointAndClickPhase.some((h) => h.elementId === id));
    for (const id of extra) report.push(`AVISO ${book.slug}: coordenada "${id}" sem hotspot no JSON`);
  }
  return book;
});

await writeFile(BOOKS, JSON.stringify(books, null, 2) + '\n');
console.log(report.length ? report.join('\n') : 'nada a alterar');
console.log('data/books.json atualizado (backup em data/books.json.bak)');
