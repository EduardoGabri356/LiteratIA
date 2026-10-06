import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { requireSessionUuid } from './middleware/sessionUuid.js';
import apiRouter from './routes/index.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      // Sem Origin (curl, health checks) passa; navegador só se estiver na lista.
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
      allowedHeaders: ['Content-Type', 'X-Session-UUID'],
      methods: ['GET', 'POST', 'OPTIONS'],
    }),
  );
  app.use(express.json({ limit: '50kb' })); // argumentos do debate são curtos
  if (env.NODE_ENV !== 'test') app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  // Fora do /api/v1: não exige sessão.
  app.get('/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down' });
  });

  app.use('/api/v1', generalLimiter, requireSessionUuid, apiRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
