import { Router } from 'express';
import { z } from 'zod';
import { one, parseJson, rows } from '../../db/pool';
import { asyncHandler, pageParams, paged } from '../../lib/http';
import { authenticate, requirePerm } from '../../middleware/auth';

export const auditRouter = Router();
auditRouter.use(authenticate, requirePerm('audit:read'));

auditRouter.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize } = pageParams.parse(req.query);
  const f = z.object({ action: z.string().trim().max(80).optional(), userId: z.string().uuid().optional() }).parse(req.query);
  const where = ['a.workspace_id = ?'];
  const params: unknown[] = [req.auth!.workspaceId];
  if (f.action) { where.push('a.action LIKE ?'); params.push(`${f.action.replace(/[\\%_]/g, (m) => `\\${m}`)}%`); }
  if (f.userId) { where.push('a.user_id = ?'); params.push(f.userId); }
  const total = (await one<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_logs a WHERE ${where.join(' AND ')}`, params))?.n ?? 0;
  const list = await rows(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.ip, a.metadata, a.created_at, u.name AS user_name, u.email AS user_email
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  res.json(paged(list.map((a: any) => ({
    id: a.id, action: a.action, entityType: a.entity_type, entityId: a.entity_id, ip: a.ip,
    metadata: parseJson(a.metadata, null), createdAt: a.created_at, user: a.user_name ? { name: a.user_name, email: a.user_email } : null,
  })), total, page, pageSize));
}));
