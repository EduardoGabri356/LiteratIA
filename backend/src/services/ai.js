// Funções de domínio sobre o Gemini. Todas lançam erro se a saída não passar na validação,
// e a rota cai no fallback estático. O gabarito nunca depende de texto livre da IA sem checagem.
import { AppError } from '../utils/AppError.js';
import { generate } from './gemini.js';
import {
  criticTurn1Prompt, criticTurn2Prompt, hintPrompt, hotspotQuestionPrompt, hotspotQuestionSchema, turn1Schema, turn2Schema,
} from './prompts.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const bad = (msg) => new AppError(502, 'AI_BAD_OUTPUT', msg);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

export async function generateHint({ book, quote }) {
  const correct = quote.options.find((o) => o.optionId === quote.correctOptionId);
  const text = await generate({
    ...hintPrompt({ book, quote, correctText: correct.text }),
    temperature: 0.6,
    maxOutputTokens: 300,
  });
  const hint = text.replace(/^["“]|["”]$/g, '').trim();
  if (hint.length < 10 || hint.length > 400) throw bad('Dica fora do tamanho esperado.');
  // Vazamento: a dica não pode conter a alternativa correta (nem uma boa parte dela).
  const h = norm(hint);
  const c = norm(correct.text);
  if (h.includes(c) || (c.length > 40 && h.includes(c.slice(0, Math.floor(c.length * 0.7))))) {
    throw bad('A dica revelou a resposta.');
  }
  return hint;
}

export async function generateHotspotQuestion({ book, hotspot }) {
  const out = await generate({
    ...hotspotQuestionPrompt({ book, hotspot }),
    schema: hotspotQuestionSchema,
    temperature: 0.9,
    maxOutputTokens: 2048,
  });
  if (!nonEmpty(out.questionText) || !nonEmpty(out.explanation)) throw bad('Questão incompleta.');
  if (!Array.isArray(out.options) || out.options.length !== 5 || out.options.some((o) => !nonEmpty(o?.text))) {
    throw bad('A questão precisa de exatamente 5 alternativas.');
  }
  const correctLetter = String(out.correctLetter).trim().toUpperCase();
  if (!LETTERS.includes(correctLetter)) throw bad('correctLetter inválida.');
  const texts = out.options.map((o) => norm(o.text));
  if (new Set(texts).size !== 5) throw bad('Alternativas repetidas.');
  return {
    statement: out.questionText.trim(),
    // As letras são reatribuídas por posição: não confiamos na ordem/letras que a IA mandou.
    options: out.options.map((o, i) => ({ letter: LETTERS[i], text: o.text.trim() })),
    correctOption: correctLetter,
    explanation: out.explanation.trim(),
  };
}

export async function criticTurn1({ book, trial, argument }) {
  const out = await generate({ ...criticTurn1Prompt({ book, trial, argument }), schema: turn1Schema, temperature: 0.8, maxOutputTokens: 700 });
  if (typeof out.isValidArgument !== 'boolean' || !nonEmpty(out.criticResponse)) throw bad('Resposta do crítico incompleta.');
  return { isValidArgument: out.isValidArgument, criticResponse: out.criticResponse.trim() };
}

export async function criticTurn2({ book, trial, messages, argument }) {
  const out = await generate({
    ...criticTurn2Prompt({ book, trial, messages, argument }),
    schema: turn2Schema,
    temperature: 0.5,
    maxOutputTokens: 1200,
  });
  const scores = [out.coherence, out.bookKnowledge, out.argumentation];
  if (!nonEmpty(out.criticResponse) || !nonEmpty(out.feedbackText)) throw bad('Avaliação incompleta.');
  if (scores.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 10)) throw bad('Notas fora de 0-10.');
  return {
    criticResponse: out.criticResponse.trim(),
    feedbackText: out.feedbackText.trim(),
    rubric: { coherence: out.coherence, bookKnowledge: out.bookKnowledge, argumentation: out.argumentation },
  };
}
