import { UnrecoverableError } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { one, parseJson, rows, run } from '../db/pool';
import { effectiveSource } from '../sources/registry';
import { enrichBusiness, loadForEnrichment } from './enrich';
import { JobFilters, matchesJobFilters } from './jobFilters';
import { ensureCountry, normalizeRaw } from './normalize';
import { persistBusiness, recomputeBusiness } from './persist';

export interface JobMetrics {
  sourceRequests: number;
  rawResults: number;
  acceptedRecords: number;
  newRecords: number;
  duplicates: number;
  invalidRecords: number;
  enrichmentAttempts: number;
  enrichmentSucceeded: number;
  completedRecords: number;
  matchedRecords: number;
  estimatedCostUsd: number;
  elapsedMs: number;
}

export const emptyMetrics = (): JobMetrics => ({
  sourceRequests: 0, rawResults: 0, acceptedRecords: 0, newRecords: 0, duplicates: 0, invalidRecords: 0,
  enrichmentAttempts: 0, enrichmentSucceeded: 0, completedRecords: 0, matchedRecords: 0, estimatedCostUsd: 0, elapsedMs: 0,
});

const TERMINAL = ['COMPLETED', 'CANCELLED', 'FAILED'];

async function setStatus(jobId: string, status: string, m?: JobMetrics) {
  // A cancel request is never overwritten by progress updates.
  await run(
    `UPDATE search_jobs SET status = ?, metrics = COALESCE(?, metrics) WHERE id = ? AND cancel_requested = 0 AND status NOT IN ('COMPLETED','CANCELLED','FAILED')`,
    [status, m ? JSON.stringify(m) : null, jobId],
  );
}
const saveMetrics = (jobId: string, m: JobMetrics) => run('UPDATE search_jobs SET metrics = ? WHERE id = ?', [JSON.stringify(m), jobId]);
const cancelRequested = async (jobId: string) =>
  !!(await one<{ c: number }>('SELECT cancel_requested AS c FROM search_jobs WHERE id = ?', [jobId]))?.c;

export async function recordUsage(workspaceId: string, jobId: string | null, source: string, endpoint: string, requests: number, cost: number) {
  await run('INSERT INTO api_usage (workspace_id, job_id, source, endpoint, requests, estimated_cost_usd) VALUES (?,?,?,?,?,?)', [
    workspaceId, jobId, source, endpoint, requests, cost,
  ]);
}

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await fn(item);
      }
    }),
  );
}

async function applyFilters(jobId: string, filters: JobFilters, m: JobMetrics) {
  await run('UPDATE job_businesses SET matches_filters = 1 WHERE job_id = ?', [jobId]);
  const list = await rows<any>(
    `SELECT b.id, b.phone, b.website, b.facebook_url, b.instagram_url, b.other_socials, b.rating, b.review_count, b.open_status
     FROM job_businesses jb JOIN businesses b ON b.id = jb.business_id WHERE jb.job_id = ?`,
    [jobId],
  );
  const failing = list.filter((b) => !matchesJobFilters({ ...b, other_socials: parseJson<unknown[]>(b.other_socials, []) }, filters)).map((b) => b.id as string);
  for (let i = 0; i < failing.length; i += 500) {
    await run('UPDATE job_businesses SET matches_filters = 0 WHERE job_id = ? AND business_id IN (?)', [jobId, failing.slice(i, i + 500)]);
  }
  m.matchedRecords = list.length - failing.length;
}

export async function runDiscovery(jobId: string, attemptsMade: number, maxAttempts: number) {
  const job = await one<any>('SELECT * FROM search_jobs WHERE id = ?', [jobId]);
  if (!job || TERMINAL.includes(job.status)) return;
  if (job.cancel_requested) {
    await run("UPDATE search_jobs SET status = 'CANCELLED', completed_at = UTC_TIMESTAMP(3) WHERE id = ?", [jobId]);
    return;
  }
  const eff = await effectiveSource(job.workspace_id, job.source);
  if (!eff || !eff.enabled || !eff.configured) throw new UnrecoverableError('This source is not available for the workspace');

  const m = emptyMetrics();
  const started = Date.now();
  const filters = parseJson<JobFilters>(job.filters, {});
  await run("UPDATE search_jobs SET status = 'RUNNING', attempts = ?, started_at = COALESCE(started_at, UTC_TIMESTAMP(3)), error_message = NULL WHERE id = ?", [attemptsMade + 1, jobId]);

  const ac = new AbortController();
  try {
    const q = { category: job.category as string, location: ensureCountry(job.location), limit: job.result_limit as number };
    const policy = { retentionDays: eff.retentionDays, storeRaw: eff.adapter.compliance.storeRawPayload, attribution: eff.adapter.compliance.attribution };
    const seen = new Set<string>();
    let accepted = 0;

    await setStatus(jobId, 'COLLECTING', m);
    for await (const page of eff.adapter.search(q, ac.signal)) {
      m.sourceRequests += page.requests;
      m.estimatedCostUsd += page.estimatedCostUsd;
      m.rawResults += page.items.length;
      if (page.requests) await recordUsage(job.workspace_id, jobId, eff.adapter.id, page.endpoint, page.requests, page.estimatedCostUsd);

      if (await cancelRequested(jobId)) {
        ac.abort();
        m.elapsedMs = Date.now() - started;
        await run("UPDATE search_jobs SET status = 'CANCELLED', metrics = ?, completed_at = UTC_TIMESTAMP(3) WHERE id = ?", [JSON.stringify(m), jobId]);
        return;
      }

      await setStatus(jobId, 'NORMALIZING', m);
      const normalized = [];
      for (const raw of page.items) {
        const n = normalizeRaw(raw, { category: q.category, location: q.location }, eff.adapter.id);
        if (!n) { m.invalidRecords += 1; continue; }
        if (seen.has(n.source.recordId)) { m.duplicates += 1; continue; }
        seen.add(n.source.recordId);
        normalized.push(n);
      }

      await setStatus(jobId, 'DEDUPLICATING', m);
      for (const n of normalized) {
        if (accepted >= q.limit) break;
        const r = await persistBusiness(job.workspace_id, jobId, n, policy);
        accepted += 1;
        if (r.outcome === 'new') m.newRecords += 1;
        else m.duplicates += 1;
      }
      m.acceptedRecords = accepted;
      m.elapsedMs = Date.now() - started;
      await saveMetrics(jobId, m);
      if (accepted >= q.limit) break;
      await setStatus(jobId, 'COLLECTING', m);
    }

    if (job.enrich && env.enrichmentEnabled) {
      await setStatus(jobId, 'ENRICHING', m);
      const todo = await rows<{ id: string; workspace_id: string; website: string }>(
        `SELECT b.id, b.workspace_id, b.website FROM job_businesses jb JOIN businesses b ON b.id = jb.business_id
         WHERE jb.job_id = ? AND b.website IS NOT NULL AND (b.enriched_at IS NULL OR b.enriched_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 7 DAY))`,
        [jobId],
      );
      await mapPool(todo, 3, async (b) => {
        if (await cancelRequested(jobId)) return;
        m.enrichmentAttempts += 1;
        if ((await enrichBusiness(b)) === 'enriched') m.enrichmentSucceeded += 1;
      });
      await saveMetrics(jobId, m);
    }

    if (await cancelRequested(jobId)) {
      await run("UPDATE search_jobs SET status = 'CANCELLED', metrics = ?, completed_at = UTC_TIMESTAMP(3) WHERE id = ?", [JSON.stringify(m), jobId]);
      return;
    }

    await applyFilters(jobId, filters, m);
    m.completedRecords = accepted;
    m.elapsedMs = Date.now() - started;
    await run("UPDATE search_jobs SET status = 'COMPLETED', metrics = ?, completed_at = UTC_TIMESTAMP(3) WHERE id = ?", [JSON.stringify(m), jobId]);
  } catch (err) {
    ac.abort();
    m.elapsedMs = Date.now() - started;
    const message = (err as Error).message?.slice(0, 300) ?? 'Search failed';
    logger.warn({ jobId, err: message, attempt: attemptsMade + 1 }, 'discovery attempt failed');
    const final = err instanceof UnrecoverableError || attemptsMade + 1 >= maxAttempts;
    await run('UPDATE search_jobs SET status = ?, error_message = ?, metrics = ?, completed_at = ? WHERE id = ? AND cancel_requested = 0', [
      final ? 'FAILED' : 'RETRYING', message, JSON.stringify(m), final ? new Date() : null, jobId,
    ]);
    throw err;
  }
}

/** Re-check: refreshes records from their source (when the adapter supports it) and re-runs enrichment + qualification. */
export async function recheckBusinesses(workspaceId: string, ids: string[]) {
  for (const id of ids) {
    const b = await one<{ category: string; city_area: string | null }>('SELECT category, city_area FROM businesses WHERE id = ? AND workspace_id = ?', [id, workspaceId]);
    if (!b) continue;
    const sources = await rows<{ source: string; source_record_id: string }>('SELECT source, source_record_id FROM business_sources WHERE business_id = ? AND workspace_id = ?', [id, workspaceId]);
    for (const s of sources) {
      const eff = await effectiveSource(workspaceId, s.source);
      if (!eff || !eff.enabled || !eff.configured || !eff.adapter.refresh) continue;
      const r = await eff.adapter.refresh(s.source_record_id);
      if (r.requests) await recordUsage(workspaceId, null, eff.adapter.id, r.endpoint, r.requests, r.estimatedCostUsd);
      if (!r.item) continue;
      const n = normalizeRaw(r.item, { category: b.category, location: ensureCountry(b.city_area ?? '') }, eff.adapter.id);
      if (n) await persistBusiness(workspaceId, null, n, { retentionDays: eff.retentionDays, storeRaw: eff.adapter.compliance.storeRawPayload, attribution: eff.adapter.compliance.attribution });
    }
    if (env.enrichmentEnabled) {
      const withSite = await loadForEnrichment(id, workspaceId);
      if (withSite) await enrichBusiness(withSite);
    }
    await run('UPDATE businesses SET last_checked_at = UTC_TIMESTAMP(3) WHERE id = ?', [id]);
    await recomputeBusiness(id);
  }
}
