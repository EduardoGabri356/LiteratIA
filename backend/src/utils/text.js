// Tratamento do texto livre do aluno (debate da Fase 3).

export const ARGUMENT_MIN_CHARS = 100;
export const ARGUMENT_MAX_CHARS = 2000;

// Remove caracteres de controle e normaliza espaços. NÃO escapa HTML: o texto vai ao Gemini como
// dado (delimitado por tags no prompt) e volta ao React, que já escapa na renderização.
export function sanitizeUserText(raw) {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Palavras funcionais do português: texto real tem muitas; teclado aleatório quase nenhuma.
const STOPWORDS = new Set(
  ('a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sobre entre ate que e ou mas se ' +
    'como quando porque pois porem contudo logo nao nem ja so tambem mais menos muito muita sua seu suas seus ' +
    'ele ela eles elas eu voce nos me te lhe isso isto esse essa este esta aquele aquela ao aos pela pelo pelas ' +
    'pelos era foi ser e sao esta estao tem ha ter fosse qual quem onde ainda apenas mesmo ate').split(' '),
);
const strip = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Heurística barata contra "abjavadaskb", "aaaaaaa", repetição de palavra e texto sem estrutura de língua.
export function looksLikeGibberish(text) {
  const t = String(text).toLowerCase();
  const words = t.match(/\p{L}+/gu) ?? [];
  const letters = words.join('');
  if (words.length < 8 || letters.length < 30) return true;
  if (/(.)\1{5,}/u.test(t)) return true; // aaaaaaa

  if (new Set(words).size / words.length < 0.4) return true; // "teste teste teste ..."

  const counts = new Map();
  for (const ch of strip(letters)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const n = [...counts.values()].reduce((a, b) => a + b, 0);
  const entropy = -[...counts.values()].reduce((acc, c) => acc + (c / n) * Math.log2(c / n), 0);
  if (entropy < 2.8) return true;

  const vowelRatio = (strip(letters).match(/[aeiou]/g) ?? []).length / n;
  if (vowelRatio < 0.25 || vowelRatio > 0.65) return true;

  const stop = words.filter((w) => STOPWORDS.has(strip(w))).length / words.length;
  return stop < 0.1;
}
