import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI é obrigatória'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  // Fase 2, caminho B: gera a questão do hotspot com IA (com fallback para a questão estática).
  AI_HOTSPOT_QUESTIONS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(15),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('[env] variáveis de ambiente inválidas:');
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
};
