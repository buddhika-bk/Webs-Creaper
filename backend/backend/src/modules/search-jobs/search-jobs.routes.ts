import { Router } from 'express';
import { z } from 'zod';
import { isDuplicateKey, one, parseJson, rows, run } from '../../db/pool';
import { uuid } from '../../lib/crypto';
import { asyncHandler, idempotencyKey, idParam, pageParams, paged } from '../../lib/http';
import { badRequest, notFound } from '../../lib/errors';
import { authenticate, requirePerm } from '../../middleware/auth';
import { limiters } from '../../middleware/rateLimit';
import { jobFiltersSchema } from '../../pipeline/jobFilters';
import { emptyMetrics } from '../../pipeline/pipeline';
import { normalizeCategory } from '../../sources/categories';
import { effectiveSource } from '../../sources/registry';
import { defaultJobOptions, discoveryQueue } from '../../queue/queues';
import { audit, ctxFrom } from '../audit/audit.service';
import { assertSearchQuota, getWorkspace } from '../workspaces/workspace.service';

export const searchJobsRouter = Router();
searchJobsRouter.use(authenticate);

const createSchema = z.object({
  category: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(160),
  source: z.string().trim().min(2).max(40),
  limit: z.coerce.number().int().min(1).max(500).default(60),
  enrich: z.boolean().default(false),
  filters: jobFiltersSchema.default({}),
});

export const jobDto = (j: any) => ({
  id: j.id,
  category: j.category,
  location: j.location,
  source: j.source,
  limit: j.result_limit,
  enrich: !!j.enrich,
  filters: parseJson(j.filters, {}),
  status: j.status,
  metrics: parseJson(j.metrics, emptyMetrics()),
  error: j.error_message,
  startedAt: j.started_at,
  completedAt: j.completed_at,
  createdAt: j.created_at,
  createdBy: j.user_name ?? undefined,
});

searchJobsRouter.post(
  '/',
  requirePerm('search:create'),
  limiters.searchCreate,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const auth = req.auth!;
    const key = idempotencyKey(req);
    if (req.header('Idempotency-Key') && !key) throw badRequest('Idempotency-Key must be 8-100 characters (letters, numbers, - and _)');

    if (key) {
      const prior = await one<any>('SELECT * FROM search_jobs WHERE workspace_id = ? AND idempotency_key = ?', [auth.workspaceId, key]);
      if (prior) {
        res.setHeader('Idempotent-Replay', 'true');
        return res.status(200).json(jobDto(prior));
      }
    }

    const src = await effectiveSource(auth.workspaceId, body.source);
    if (!src) throw badRequest('Unknown source');
    if (!src.enabled) throw badRequest(`${src.adapter.label} is disabled for this workspace`);
    if (!src.configured) throw badRequest(`${src.adapter.label} is not configured on the server`);

    const ws = await getWorkspace(auth.workspaceId);
    await assertSearchQuota(ws, src.adapter.compliance.paid);
    const limit = Math.min(body.limit, ws.max_results_per_search);
    const category = normalizeCategory(body.category).label;

    const id = uuid();
    try {
      await run(
        `INSERT INTO search_jobs (id, workspace_id, user_id, idempotency_key, category, location, source, filters, result_limit, enrich, metrics)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [id, auth.workspaceId, auth.userId, key, category, body.location, body.source, JSON.stringify(body.filters), limit, body.enrich ? 1 : 0, JSON.stringify(emptyMetrics())],
      );
    } catch (err) {
      if (isDuplicateKey(err) && key) {
        const prior = await one<any>('SELECT * FROM search_jobs WHERE workspace_id = ? AND idempotency_key = ?', [auth.workspaceId, key]);
        if (prior) { res.setHeader('Idempotent-Replay', 'true'); return res.status(200).json(jobDto(prior)); }
      }
      throw err;
    }
    await discoveryQueue.add('discover', { kind: 'discover', jobId: id, workspaceId: auth.workspaceId, userId: auth.userId }, { ...defaultJobOptions, jobId: id });
    await audit(ctxFrom(req), 'search.create', 'search_job', id, { category, location: body.location, source: body.source, limit, enrich: body.enrich });
    const created = await one<any>('SELECT * FROM search_jobs WHERE id = ?', [id]);
    res.status(201).json(jobDto(created));
  }),
);

searchJobsRouter.get(
  '/',
  requirePerm('search:read'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pageParams.parse(req.query);
    const ws = req.auth!.workspaceId;
    const total = (await one<{ n: number }>('SELECT COUNT(*) AS n FROM search_jobs WHERE workspace_id = ?', [ws]))?.n ?? 0;
    const list = await rows(
      `SELECT j.*, u.name AS user_name FROM search_jobs j JOIN users u ON u.id = j.user_id
       WHERE j.workspace_id = ? ORDER BY j.created_at DESC LIMIT ? OFFSET ?`,
      [ws, pageSize, (page - 1) * pageSize],
    );
    res.json(paged(list.map(jobDto), total, page, pageSize));
  }),
);

searchJobsRouter.get(
  '/:id',
  requirePerm('search:read'),
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const j = await one<any>('SELECT j.*, u.name AS user_name FROM search_jobs j JOIN users u ON u.id = j.user_id WHERE j.id = ? AND j.workspace_id = ?', [id, req.auth!.workspaceId]);
    if (!j) throw notFound('Search not found');
    res.json(jobDto(j));
  }),
);

searchJobsRouter.post(
  '/:id/cancel',
  requirePerm('search:create'),
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const j = await one<any>('SELECT * FROM search_jobs WHERE id = ? AND workspace_id = ?', [id, req.auth!.workspaceId]);
    if (!j) throw notFound('Search not found');
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(j.status)) return res.json(jobDto(j));
    if (j.status === 'QUEUED') {
      await discoveryQueue.remove(id).catch(() => undefined);
      await run("UPDATE search_jobs SET status = 'CANCELLED', cancel_requested = 1, completed_at = UTC_TIMESTAMP(3) WHERE id = ?", [id]);
    } else {
      await run("UPDATE search_jobs SET status = 'CANCEL_REQUESTED', cancel_requested = 1 WHERE id = ?", [id]);
    }
    await audit(ctxFrom(req), 'search.cancel', 'search_job', id);
    res.json(jobDto(await one<any>('SELECT * FROM search_jobs WHERE id = ?', [id])));
  }),
);
