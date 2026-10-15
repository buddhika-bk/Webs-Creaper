import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { Request } from 'express';
import { redis } from '../queue/connection';
import { tooMany } from '../lib/errors';

interface LimiterOptions {
  name: string;
  windowMs: number;
  limit: number;
  perUser?: boolean;
  skipSuccessfulRequests?: boolean;
  message?: string;
}

export function makeLimiter(o: LimiterOptions) {
  return rateLimit({
    windowMs: o.windowMs,
    limit: o.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: o.skipSuccessfulRequests ?? false,
    passOnStoreError: true,
    keyGenerator: (req: Request) => (o.perUser && req.auth ? `u:${req.auth.userId}` : `ip:${req.ip}`),
    store: new RedisStore({
      prefix: `rl:${o.name}:`,
      sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as Promise<any>,
    }),
    handler: (_req, _res, next) => next(tooMany(o.message ?? 'Too many requests. Please slow down and try again shortly.')),
  });
}

const MIN = 60_000;
const HOUR = 60 * MIN;

export const limiters = {
  api: makeLimiter({ name: 'api', windowMs: MIN, limit: 300 }),
  public: makeLimiter({ name: 'public', windowMs: MIN, limit: 60 }),
  login: makeLimiter({ name: 'login', windowMs: 15 * MIN, limit: 10, skipSuccessfulRequests: true, message: 'Too many sign-in attempts. Try again in 15 minutes.' }),
  refresh: makeLimiter({ name: 'refresh', windowMs: MIN, limit: 30 }),
  searchCreate: makeLimiter({ name: 'search-create', windowMs: HOUR, limit: 40, perUser: true }),
  exportCreate: makeLimiter({ name: 'export-create', windowMs: HOUR, limit: 30, perUser: true }),
  download: makeLimiter({ name: 'download', windowMs: 10 * MIN, limit: 30 }),
  ai: makeLimiter({ name: 'ai', windowMs: 10 * MIN, limit: 30, perUser: true }),
};
