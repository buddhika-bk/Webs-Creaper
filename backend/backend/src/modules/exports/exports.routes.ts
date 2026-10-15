import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { isDuplicateKey, one, parseJson, rows, run } from '../../db/pool';
import { hmac, randomToken, safeEqual, sha256, uuid } from '../../lib/crypto';
import { asyncHandler, idempotencyKey, idParam, pageParams, paged } from '../../lib/http';
import { badRequest, forbidden, notFound, unauthorized } from '../../lib/errors';
import { authenticate, requirePerm } from '../../middleware/auth';
import { limiters } from '../../middleware/rateLimit';
import { defaultJobOptions, exportQueue } from '../../queue/queues';
import { audit } from '../audit/audit.service';
import { ctxFrom } from '../audit/audit.service';
import { businessFilterSchema } from '../businesses/filters';
import { assertExportQuota, getWorkspace } from '../workspaces/workspace.service';
import { countSelection, Selection } from './export.query';

const DOWNLOAD_TTL_MS = 5 * 60_000;

const dto = (e: any) => ({
  id: e.id,
  status: e.status,
  progress: e.progress,
  rowCount: e.row_count,
  fileName: e.file_name,
  fileSize: e.file_size === null ? null : Number(e.file_size),
  error: e.error_message,
  expiresAt: e.expires_at,
  completedAt: e.completed_at,
  createdAt: e.created_at,
  createdBy: e.user_name ?? undefined,
});

const selectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('ids'), ids: z.array(z.string().uuid()).min(1).max(5000) }),
  z.object({ mode: z.literal('filter'), filter: businessFilterSchema }),
]);

export const exportsRouter = Router();

/** Signed, short-lived, ONE-TIME download links. The route authorises with the signed token (browser navigation can't send bearer headers). */
exportsRouter.get(
  '/:id/download',
  limiters.download,
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const token = z.string().min(20).max(300).parse(req.query.token);
    const [expStr, nonce, sig] = token.split('.');
    const exp = Number(expStr);
    if (!exp || !nonce || !sig || exp < Date.now()) throw unauthorized('This download link has expired', 'LINK_EXPIRED');
    if (!safeEqual(sig, hmac(env.DOWNLOAD_SIGNING_SECRET, `${id}.${exp}.${nonce}`))) throw unauthorized('Invalid download link', 'LINK_INVALID');

    // Atomically consume the link: only one request can win.
    const claim = await run(
      `UPDATE exports SET download_used_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND status = 'COMPLETED' AND download_token_hash = ? AND download_used_at IS NULL AND download_expires_at > UTC_TIMESTAMP(3)`,
      [id, sha256(token)],
    );
    if (!claim.affectedRows) throw unauthorized('This download link was already used or has expired', 'LINK_USED');

    const ex = await one<any>('SELECT * FROM exports WHERE id = ?', [id]);
    if (!ex?.file_path) throw notFound('Export file is no longer available');
    const root = path.resolve(env.EXPORT_DIR);
    const full = path.resolve(root, ex.file_path);
    if (!full.startsWith(root + path.sep) || !fs.existsSync(full)) throw notFound('Export file is no longer available');

    await audit({ workspaceId: ex.workspace_id, userId: ex.user_id, ip: req.ip, userAgent: req.get('user-agent') }, 'export.download', 'export', id, { rows: ex.row_count });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.download(full, ex.file_name ?? 'leads.xlsx');
  }),
);

exportsRouter.use(authenticate);

exportsRouter.post(
  '/',
  requirePerm('export:create'),
  limiters.exportCreate,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = z.object({ selection: selectionSchema, format: z.literal('xlsx').default('xlsx') }).parse(req.body);
    const key = idempotencyKey(req);
    if (req.header('Idempotency-Key') && !key) throw badRequest('Idempotency-Key must be 8-100 characters (letters, numbers, - and _)');
    if (key) {
      const prior = await one<any>('SELECT * FROM exports WHERE workspace_id = ? AND idempotency_key = ?', [auth.workspaceId, key]);
      if (prior) { res.setHeader('Idempotent-Replay', 'true'); return res.json(dto(prior)); }
    }
    const ws = await getWorkspace(auth.workspaceId);
    await assertExportQuota(ws);

    const selection: Selection = body.selection;
    const count = await countSelection(auth.workspaceId, selection);
    if (count === 0) throw badRequest('There are no records to export');
    if (count > env.EXPORT_MAX_ROWS) throw badRequest(`Exports are limited to ${env.EXPORT_MAX_ROWS} rows. Narrow your filters.`);

    const id = uuid();
    try {
      await run('INSERT INTO exports (id, workspace_id, user_id, idempotency_key, selection, row_count) VALUES (?,?,?,?,?,?)', [id, auth.workspaceId, auth.userId, key, JSON.stringify(selection), count]);
    } catch (err) {
      if (isDuplicateKey(err) && key) {
        const prior = await one<any>('SELECT * FROM exports WHERE workspace_id = ? AND idempotency_key = ?', [auth.workspaceId, key]);
        if (prior) { res.setHeader('Idempotent-Replay', 'true'); return res.json(dto(prior)); }
      }
      throw err;
    }
    await exportQueue.add('export', { exportId: id }, { ...defaultJobOptions, jobId: id });
    await audit(ctxFrom(req), 'export.create', 'export', id, { rows: count, mode: selection.mode });
    res.status(202).json(dto(await one('SELECT * FROM exports WHERE id = ?', [id])));
  }),
);

exportsRouter.get(
  '/',
  requirePerm('export:read'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pageParams.parse(req.query);
    const ws = req.auth!.workspaceId;
    const total = (await one<{ n: number }>('SELECT COUNT(*) AS n FROM exports WHERE workspace_id = ?', [ws]))?.n ?? 0;
    const list = await rows(
      'SELECT e.*, u.name AS user_name FROM exports e JOIN users u ON u.id = e.user_id WHERE e.workspace_id = ? ORDER BY e.created_at DESC LIMIT ? OFFSET ?',
      [ws, pageSize, (page - 1) * pageSize],
    );
    res.json(paged(list.map(dto), total, page, pageSize));
  }),
);

exportsRouter.get(
  '/:id',
  requirePerm('export:read'),
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const e = await one<any>('SELECT e.*, u.name AS user_name FROM exports e JOIN users u ON u.id = e.user_id WHERE e.id = ? AND e.workspace_id = ?', [id, req.auth!.workspaceId]);
    if (!e) throw notFound('Export not found');
    res.json(dto(e));
  }),
);

exportsRouter.post(
  '/:id/download-link',
  requirePerm('export:read'),
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const e = await one<any>('SELECT * FROM exports WHERE id = ? AND workspace_id = ?', [id, req.auth!.workspaceId]);
    if (!e) throw notFound('Export not found');
    if (e.status !== 'COMPLETED') throw badRequest('This export is not ready yet');
    // Analysts can only download their own exports; admins can download any export in the workspace.
    if (e.user_id !== req.auth!.userId && !['owner', 'admin'].includes(req.auth!.role)) throw forbidden('You can only download exports you created');

    const exp = Date.now() + DOWNLOAD_TTL_MS;
    const nonce = randomToken(12);
    const token = `${exp}.${nonce}.${hmac(env.DOWNLOAD_SIGNING_SECRET, `${id}.${exp}.${nonce}`)}`;
    await run('UPDATE exports SET download_token_hash = ?, download_expires_at = ?, download_used_at = NULL WHERE id = ?', [sha256(token), new Date(exp), id]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ url: `/api/v1/exports/${id}/download?token=${encodeURIComponent(token)}`, expiresInSeconds: DOWNLOAD_TTL_MS / 1000 });
  }),
);

export { parseJson };
