// Cliente mínimo da API REST do Gemini (sem SDK). Docs: https://ai.google.dev/api/generate-content
// Qualquer falha vira AppError 502/503; quem chama decide o fallback.
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

let doFetch = (...args) => globalThis.fetch(...args);
export function __setFetchForTests(fn) {
  doFetch = fn ?? ((...args) => globalThis.fetch(...args));
}

export const geminiEnabled = () => Boolean(env.GEMINI_API_KEY);

export function parseJsonLoose(text) {
  const clean = String(text).replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new AppError(502, 'AI_BAD_JSON', 'O Gemini devolveu um JSON inválido.');
  }
}

/**
 * @param {{ system?: string, contents: {role:'user'|'model', parts:{text:string}[]}[],
 *           schema?: object, temperature?: number, maxOutputTokens?: number }} opts
 * Com `schema` (responseSchema do Gemini) devolve o objeto já parseado; sem, devolve o texto.
 */
export async function generate({ system, contents, schema, temperature = 0.8, maxOutputTokens = 2048 }) {
  if (!geminiEnabled()) throw new AppError(503, 'AI_DISABLED', 'GEMINI_API_KEY não configurada.');

  const body = {
    ...(system && { systemInstruction: { parts: [{ text: system }] } }),
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(schema && { responseMimeType: 'application/json', responseSchema: schema }),
    },
  };

  let res;
  try {
    res = await doFetch(`${BASE}/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(env.GEMINI_TIMEOUT_MS),
    });
  } catch {
    throw new AppError(502, 'AI_UNAVAILABLE', 'Não foi possível falar com o Gemini (rede ou timeout).');
  }
  if (!res.ok) throw new AppError(502, 'AI_UNAVAILABLE', `O Gemini respondeu HTTP ${res.status}.`);

  const data = await res.json().catch(() => null);
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
  if (!text) throw new AppError(502, 'AI_EMPTY', 'Resposta vazia do Gemini (pode ter sido bloqueada).');
  return schema ? parseJsonLoose(text) : text;
}
