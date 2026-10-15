import { Queue } from 'bullmq';
import { redisOptions } from './connection';

export const DISCOVERY_QUEUE = 'discovery';
export const EXPORT_QUEUE = 'export';
export const MAINTENANCE_QUEUE = 'maintenance';

export interface DiscoveryJobData {
  kind: 'discover' | 'recheck';
  jobId?: string;
  workspaceId: string;
  businessIds?: string[];
  userId?: string;
}
export interface ExportJobData {
  exportId: string;
}

const connection = redisOptions();

export const discoveryQueue = new Queue<DiscoveryJobData>(DISCOVERY_QUEUE, { connection });
export const exportQueue = new Queue<ExportJobData>(EXPORT_QUEUE, { connection });
export const maintenanceQueue = new Queue(MAINTENANCE_QUEUE, { connection });

export const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};
