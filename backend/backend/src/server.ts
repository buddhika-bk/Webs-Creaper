import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { pool } from './db/pool';
import { redis } from './queue/connection';

const app = createApp();
const server = app.listen(env.PORT, () => logger.info(`API listening on :${env.PORT} (${env.NODE_ENV})`));

const shutdown = (signal: string) => {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await pool.end().catch(() => undefined);
    redis.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
