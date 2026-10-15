import { Router } from 'express';
import { z } from 'zod';
import { isDuplicateKey, one, parseJson, rows, run } from '../../db/pool';
import { asyncHandler, idParam, idempotencyKey, pageParams, paged } from '../../lib/http';
import { uuid } from '../../lib/crypto';
import { badRequest, notFound } from '../../lib/errors';
import { authenticate, requirePerm } from '../../middleware/auth';
import { limiters } from '../../middleware/rateLimit';
import { jobFiltersSchema } from '../../pipeline/jobFilters';
import { emptyMetrics } from '../../pipeline/pipeline';
import { defaultJobOptions, discoveryQueue } from '../../queue/queues';
import { effectiveSource } from '../../sources/registry';
import { audit, ctxFrom } from '../audit/audit.service';
import { assertSearchQuota, getWorkspace } from '../workspaces/workspace.service';

export const searchJobsRouter = Router();
searchJobsRouter.use(authenticate);

export const toJobDto = (j: any) => ({
  id: j.id,
  category: j.category,
  location: j.location,
  source: j.source,
  filters: parseJson(j.filters, {}),
  limit: j.result_limit,
  enrich: !!j.enrich,
  status: j.status,
  metrics: { ...emptyMetrics(), ...parseJson(j.metrics, {}) },
  errorMessage: j.error_message,
  attempts: j.attempts,
  createdAt: j.created_at,
  startedAt: j.started_at,
  completedAt: j.completed_at,
});

const createSchema = z.object({
  category: z.string().trim().min(2, 'Enter a business type').max(120),
  location: z.string().trim().min(2, 'Enter a location').max(160),
  source: z.string().trim().min(2).max(40),
  limit: z.coerce.number().int().min(1).max(500).default(60),
  enrich: z.boolean().default(false),
  filters: jobFiltersSchema.default({}),
});

searchJobsRouter.post('/', requirePerm('search:create'), limiters.searchCreate, asyncHandler(async (req, res) => {
  const ws = req.auth!.workspaceId;
  const key = idempotencyKey(req);
  if (key) {
    const existing = await one('SELECT * FROM search_jobs WHERE workspace_id = ? AND idempotency_key = ?', [ws, key]);
    if (existing) { res.setHeader('Idempotent-Replay', 'true'); return res.status(200).json(toJobDto(existing)); }
  }
  const body = createSchema.parse(req.body);
  const eff = await effectiveSource(ws, body.source);
  if (!eff) throw badRequest('Unknown source');
  if (!eff.enabled) throw badRequest('This source is turned off for your workspace');
  if (!eff.configured) throw badRequest(`${eff.adapter.label} is not configured on the server yet`);

  const workspace = await getWorkspace(ws);
  await assertSearchQuota(workspace, eff.adapter.compliance.paid);
  const limit = Math.min(body.limit, workspace.max_results_per_search);

  const id = uuid();
  try {
    await run(
      `INSERT INTO search_jobs (id, workspace_id, user_id, idempotency_key, category, location, source, filters, result_limit, enrich, metrics)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, ws, req.auth!.userId, key, body.category, body.location, body.source, JSON.stringify(body.filters), limit, body.enrich ? 1 : 0, JSON.stringify(emptyMetrics())],
    );
  } catch (err) {
    if (isDuplicateKey(err) && key) {
      const existing = await one('SELECT * FROM search_jobs WHERE workspace_id = ? AND idempotency_key = ?', [ws, key]);
      if (existing) { res.setHeader('Idempotent-Replay', 'true'); return res.status(200).json(toJobDto(existing)); }
    }
    throw err;
  }
  await discoveryQueue.add('discover', { kind: 'discover', jobId: id, workspaceId: ws, userId: req.auth!.userId }, { ...defaultJobOptions, jobId: id });
  await audit(ctxFrom(req), 'search.create', 'search_job', id, { category: body.category, location: body.location, source: body.source, limit });
  res.status(202).json(toJobDto(await one('SELECT * FROM search_jobs WHERE id = ?', [id])));
}));

searchJobsRouter.get('/', requirePerm('search:read'), asyncHandler(async (req, res) => {
  const { page, pageSize } = pageParams.parse(req.query);
  const ws = req.auth!.workspaceId;
  const total = (await one<{ n: number }>('SELECT COUNT(*) AS n FROM search_jobs WHERE workspace_id = ?', [ws]))?.n ?? 0;
  const list = await rows('SELECT * FROM search_jobs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [ws, pageSize, (page - 1) * pageSize]);
  res.json(paged(list.map(toJobDto), total, page, pageSize));
}));

searchJobsRouter.get('/:id', requirePerm('search:read'), asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const job = await one('SELECT * FROM search_jobs WHERE id = ? AND workspace_id = ?', [id, req.auth!.workspaceId]);
  if (!job) throw notFound('Search not found');
  res.json(toJobDto(job));
}));

searchJobsRouter.post('/:id/cancel', requirePerm('search:create'), asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const ws = req.auth!.workspaceId;
  const job = await one<any>('SELECT * FROM search_jobs WHERE id = ? AND workspace_id = ?', [id, ws]);
  if (!job) throw notFound('Search not found');
  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) return res.json(toJobDto(job));
  if (job.status === 'QUEUED') {
    const queued = await discoveryQueue.getJob(id);
    await queued?.remove().catch(() => undefined);
    await run("UPDATE search_jobs SET status = 'CANCELLED', cancel_requested = 1, completed_at = UTC_TIMESTAMP(3) WHERE id = ?", [id]);
  } else {
    await run("UPDATE search_jobs SET status = 'CANCEL_REQUESTED', cancel_requested = 1 WHERE id = ?", [id]);
  }
  await audit(ctxFrom(req), 'search.cancel', 'search_job', id);
  res.json(toJobDto(await one('SELECT * FROM search_jobs WHERE id = ?', [id])));
}));
