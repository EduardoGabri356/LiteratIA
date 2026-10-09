// Cliente único da API. Em dev o Vite faz proxy de /api para o backend (vite.config.js);
// em produção defina VITE_API_URL (ex.: https://meu-backend.vercel.app/api/v1).
const RAW_BASE = (import.meta.env.VITE_API_URL ?? '').trim() || '/api/v1';
const BASE = RAW_BASE.replace(/\/+$/, ''); // remove barra final, se houver
const KEY = 'sessionUuid';
let memoryUuid;

function buildUrl(path) {
  return `${BASE}/${String(path).replace(/^\/+/, '')}`; // garante exatamente 1 barra
}

function makeUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getSessionUuid() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = makeUuid();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return (memoryUuid ??= makeUuid());
  }
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(buildUrl(path), {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Session-UUID': getSessionUuid() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Não foi possível falar com o servidor. O backend está rodando?');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? `Erro ${res.status}`, data?.error?.details);
  }
  return data;
}

export const get = (path) => api('GET', path);
export const post = (path, body = {}) => api('POST', path, body);

// Garante que o progresso do livro existe no servidor (idempotente) e devolve o estado atual.
export const openBook = (slug, forceReset = false) => post(`/books/${slug}/load`, { forceReset });

// Rota do front para cada fase do servidor.
export function routeForPhase(slug, phase) {
  if (phase >= 3) return `/game/${slug}/debate`;
  if (phase === 2) return `/game/${slug}/map`;
  return `/game/${slug}/quotes`;
}
