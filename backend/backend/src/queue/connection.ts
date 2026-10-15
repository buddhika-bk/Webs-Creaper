import IORedis from 'ioredis';
import { env } from '../config/env';

/** Plain connection options so BullMQ creates its own (blocking) connections per queue/worker. */
export function redisOptions() {
  const u = new URL(env.REDIS_URL);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null as null,
  };
}

/** Shared client used for rate-limit counters and health checks. */
export const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 2, enableReadyCheck: true });
