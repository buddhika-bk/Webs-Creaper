import { UnrecoverableError, Worker } from 'bullmq';
import { logger } from '../config/logger';
import { run } from '../db/pool';
import { recheckBusinesses, runDiscovery } from '../pipeline/pipeline';
import { redisOptions } from '../queue/connection';
import { DISCOVERY_QUEUE, DiscoveryJobData } from '../queue/queues';

export function startDiscoveryWorker() {
  const worker = new Worker<DiscoveryJobData>(
    DISCOVERY_QUEUE,
    async (job) => {
      if (job.data.kind === 'recheck') {
        await recheckBusinesses(job.data.workspaceId, job.data.businessIds ?? []);
        return;
      }
      if (!job.data.jobId) throw new UnrecoverableError('Missing job id');
      await runDiscovery(job.data.jobId, job.attemptsMade, job.opts.attempts ?? 1);
    },
    { connection: redisOptions(), concurrency: 2 },
  );
  worker.on('failed', async (job, err) => {
    logger.warn({ id: job?.id, err: err.message }, 'discovery job failed');
    // Safety net: a job that died outside runDiscovery's own handler must not stay "RUNNING" forever.
    if (job?.data.jobId && (err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1))) {
      await run("UPDATE search_jobs SET status = 'FAILED', error_message = COALESCE(error_message, ?), completed_at = COALESCE(completed_at, UTC_TIMESTAMP(3)) WHERE id = ? AND status NOT IN ('COMPLETED','CANCELLED')", [
        err.message.slice(0, 300), job.data.jobId,
      ]);
    }
  });
  return worker;
}
