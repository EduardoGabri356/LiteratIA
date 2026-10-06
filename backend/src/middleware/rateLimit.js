import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const base = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Muitas requisições. Aguarde um instante e tente de novo.' },
    }),
};

export const generalLimiter = rateLimit({ ...base, limit: env.RATE_LIMIT_MAX });

// Para rotas que chamam o Gemini (dica, debate): limita por sessão e protege o custo da API.
export const aiLimiter = rateLimit({
  ...base,
  limit: env.AI_RATE_LIMIT_MAX,
  keyGenerator: (req) => req.sessionUuid || req.ip,
});
