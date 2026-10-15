import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { pool } from './db/pool';
import { AppError } from './lib/errors';
import { errorHandler, notFoundHandler } from './middleware/error';
import { limiters } from './middleware/rateLimit';
import { redis } from './queue/connection';
import { api } from './routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' }, serializers: { req: (r) => ({ id: r.id, method: r.method, url: r.url?.split('?')[0] }) } }));
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: env.isProd ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  // CORS: exact production origins only (no wildcards). Requests without Origin (same-origin proxy, curl) are allowed through.
  app.use(
    cors({
      origin: (origin, cb) => (!origin || env.origins.includes(origin) ? cb(null, true) : cb(new AppError(403, 'CORS', 'Origin not allowed'))),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Idempotency-Key'],
      exposedHeaders: ['Idempotent-Replay', 'RateLimit', 'RateLimit-Policy'],
      maxAge: 600,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/health', limiters.public, (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', limiters.public, async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      await redis.ping();
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api/v1', limiters.api, api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
