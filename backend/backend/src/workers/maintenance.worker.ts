import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { rows, run } from '../db/pool';
import { mergeFlags, recomputeBusiness, refreshSocialColumns } from '../pipeline/persist';
import { redisOptions } from '../queue/connection';
import { MAINTENANCE_QUEUE, maintenanceQueue } from '../queue/queues';
import { getAdapter } from '../sources/registry';
import { ClearableField } from '../sources/types';

const COLUMNS: Record<ClearableField, string[]> = {
  address: ['address', 'normalized_address'],
  phone: ['phone', 'phone_normalized', 'phone_hash'],
  website: ['website', 'website_domain'],
  rating: ['rating', 'rating_source'],
  review_count: ['review_count'],
};

/**
 * Enforces source retention. When a source's content passes its retention window the cached payload, rating and
 * contacts from that source are purged; the source record id (e.g. Google Place ID) is kept so the record can be
 * refreshed with "Re-check". Limitation: provenance is tracked per source, not per field, so a record that is ALSO
 * backed by another still-fresh source keeps its merged fields. See docs/source-policies.
 */
export async function expireSourceContent() {
  const due = await rows<{ id: string; business_id: string; source: string }>(
    "SELECT id, business_id, source FROM business_sources WHERE expires_at IS NOT NULL AND expires_at < UTC_TIMESTAMP(3) AND refresh_state <> 'purged' LIMIT 500",
  );
  const byBusiness = new Map<string, Set<string>>();
  for (const d of due) {
    await run("UPDATE business_sources SET refresh_state = 'purged', raw_payload = NULL, rating = NULL, review_count = NULL WHERE id = ?", [d.id]);
    if (!byBusiness.has(d.business_id)) byBusiness.set(d.business_id, new Set());
    byBusiness.get(d.business_id)!.add(d.source);
  }
  for (const [businessId, purged] of byBusiness) {
    const [left] = await rows<{ n: number }>("SELECT COUNT(*) AS n FROM business_sources WHERE business_id = ? AND refresh_state <> 'purged'", [businessId]);
    const sources = [...purged];
    await run('DELETE FROM business_contacts WHERE business_id = ? AND source IN (?)', [businessId, sources]);
    await run('DELETE FROM business_socials WHERE business_id = ? AND source IN (?)', [businessId, sources]);
    if ((left?.n ?? 0) === 0) {
      const fields = new Set<ClearableField>();
      sources.forEach((s) => getAdapter(s)?.compliance.clearFieldsOnExpiry.forEach((f) => fields.add(f)));
      const cols = [...fields].flatMap((f) => COLUMNS[f]);
      if (cols.length) await run(`UPDATE businesses SET ${cols.map((c) => `${c} = NULL`).join(', ')} WHERE id = ?`, [businessId]);
      await mergeFlags(businessId, [{ type: 'needs_refresh', detail: 'Source data expired under its retention policy. Re-check to refresh it.' }]);
    }
    await refreshSocialColumns(businessId);
    await recomputeBusiness(businessId);
  }
  return due.length;
}

async function cleanupExports() {
  const expired = await rows<{ id: string; file_path: string | null }>("SELECT id, file_path FROM exports WHERE status = 'COMPLETED' AND expires_at IS NOT NULL AND expires_at < UTC_TIMESTAMP(3) LIMIT 200");
  const root = path.resolve(env.EXPORT_DIR);
  for (const e of expired) {
    if (e.file_path) {
      const full = path.resolve(root, e.file_path);
      if (full.startsWith(root + path.sep)) fs.rmSync(full, { force: true });
    }
    await run("UPDATE exports SET status = 'EXPIRED', file_path = NULL, download_token_hash = NULL WHERE id = ?", [e.id]);
  }
  return expired.length;
}

export async function runMaintenance() {
  const purged = await expireSourceContent();
  const exports = await cleanupExports();
  await run('DELETE FROM refresh_tokens WHERE expires_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 DAY)');
  await run("UPDATE search_jobs SET status = 'FAILED', error_message = 'Timed out', completed_at = UTC_TIMESTAMP(3) WHERE status IN ('RUNNING','COLLECTING','NORMALIZING','DEDUPLICATING','ENRICHING','RETRYING','QUEUED') AND updated_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 3 HOUR)");
  logger.info({ purgedSources: purged, expiredExports: exports }, 'maintenance complete');
}

export async function startMaintenanceWorker() {
  await maintenanceQueue.upsertJobScheduler('maintenance-scheduler', { every: 15 * 60_000 }, { name: 'tick' });
  return new Worker(MAINTENANCE_QUEUE, () => runMaintenance(), { connection: redisOptions(), concurrency: 1 });
}
