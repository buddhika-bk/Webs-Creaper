import { logger } from '../config/logger';
import { pool } from '../db/pool';
import { redis } from '../queue/connection';
import { startDiscoveryWorker } from './discovery.worker';
import { startExportWorker } from './export.worker';
import { startMaintenanceWorker } from './maintenance.worker';

async function main() {
  const workers = [startDiscoveryWorker(), startExportWorker(), await startMaintenanceWorker()];
  logger.info('workers started: discovery, export, maintenance');
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down workers');
    await Promise.allSettled(workers.map((w) => w.close()));
    await pool.end();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'worker failed to start');
  process.exit(1);
});
