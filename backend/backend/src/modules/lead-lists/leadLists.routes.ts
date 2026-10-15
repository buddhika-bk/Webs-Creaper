import { Router } from 'express';
import { z } from 'zod';
import { isDuplicateKey, one, rows, run } from '../../db/pool';
import { asyncHandler, idParam } from '../../lib/http';
import { uuid } from '../../lib/crypto';
import { conflict, notFound } from '../../lib/errors';
import { authenticate, requirePerm } from '../../middleware/auth';
import { audit, ctxFrom } from '../audit/audit.service';

export const leadListsRouter = Router();
leadListsRouter.use(authenticate);

const dto = (l: any) => ({ id: l.id, name: l.name, description: l.description, count: Number(l.item_count ?? 0), createdAt: l.created_at, updatedAt: l.updated_at });
const body = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).nullish() });

leadListsRouter.get('/', requirePerm('lists:read'), asyncHandler(async (req, res) => {
  const list = await rows(
    `SELECT l.*, (SELECT COUNT(*) FROM lead_list_items i WHERE i.lead_list_id = l.id) AS item_count
     FROM lead_lists l WHERE l.workspace_id = ? ORDER BY l.updated_at DESC`,
    [req.auth!.workspaceId],
  );
  res.json({ items: list.map(dto) });
}));

leadListsRouter.post('/', requirePerm('lists:write'), asyncHandler(async (req, res) => {
  const b = body.parse(req.body);
  const id = uuid();
  try {
    await run('INSERT INTO lead_lists (id, workspace_id, name, description, created_by) VALUES (?,?,?,?,?)', [id, req.auth!.workspaceId, b.name, b.description ?? null, req.auth!.userId]);
  } catch (err) {
    if (isDuplicateKey(err)) throw conflict('You already have a list with this name');
    throw err;
  }
  await audit(ctxFrom(req), 'lead_list.create', 'lead_list', id, { name: b.name });
  res.status(201).json(dto(await one('SELECT *, 0 AS item_count FROM lead_lists WHERE id = ?', [id])));
}));

leadListsRouter.get('/:id', requirePerm('lists:read'), asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const l = await one('SELECT l.*, (SELECT COUNT(*) FROM lead_list_items i WHERE i.lead_list_id = l.id) AS item_count FROM lead_lists l WHERE l.id = ? AND l.workspace_id = ?', [id, req.auth!.workspaceId]);
  if (!l) throw notFound('List not found');
  res.json(dto(l));
}));

leadListsRouter.patch('/:id', requirePerm('lists:write'), asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const b = body.partial().parse(req.body);
  try {
    const r = await run('UPDATE lead_lists SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ? AND workspace_id = ?', [b.name ?? null, b.description ?? null, id, req.auth!.workspaceId]);
    if (!r.affectedRows) throw notFound('List not found');
  } catch (err) {
    if (isDuplicateKey(err)) throw conflict('You already have a list with this name');
    throw err;
  }
  await audit(ctxFrom(req), 'lead_list.update', 'lead_list', id);
  res.json(dto(await one('SELECT l.*, (SELECT COUNT(*) FROM lead_list_items i WHERE i.lead_list_id = l.id) AS item_count FROM lead_lists l WHERE l.id = ?', [id])));
}));

leadListsRouter.delete('/:id', requirePerm('lists:write'), asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const r = await run('DELETE FROM lead_lists WHERE id = ? AND workspace_id = ?', [id, req.auth!.workspaceId]);
  if (!r.affectedRows) throw notFound('List not found');
  await audit(ctxFrom(req), 'lead_list.delete', 'lead_list', id);
  res.status(204).end();
}));
