import { Router } from 'express';
import { z } from 'zod';
import { isDuplicateKey, rows, run } from '../../db/pool';
import { uuid } from '../../lib/crypto';
import { asyncHandler, idParam } from '../../lib/http';
import { conflict, notFound } from '../../lib/errors';
import { authenticate, requirePerm } from '../../middleware/auth';
import { audit, ctxFrom } from '../audit/audit.service';

export const tagsRouter = Router();
tagsRouter.use(authenticate);

tagsRouter.get('/', requirePerm('lists:read'), asyncHandler(async (req, res) => {
  const items = await rows('SELECT t.id, t.name, t.color, (SELECT COUNT(*) FROM business_tags bt WHERE bt.tag_id = t.id) AS count FROM tags t WHERE t.workspace_id = ? ORDER BY t.name', [req.auth!.workspaceId]);
  res.json({ items });
}));

tagsRouter.post('/', requirePerm('lists:write'), asyncHandler(async (req, res) => {
  const body = z.object({ name: z.string().trim().min(1).max(60), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1F4FD8') }).parse(req.body);
  const id = uuid();
  try {
    await run('INSERT INTO tags (id, workspace_id, name, color) VALUES (?,?,?,?)', [id, req.auth!.workspaceId, body.name, body.color]);
  } catch (err) {
    if (isDuplicateKey(err)) throw conflict('A tag with this name already exists');
    throw err;
  }
  await audit(ctxFrom(req), 'tag.create', 'tag', id, { name: body.name });
  res.status(201).json({ id, name: body.name, color: body.color, count: 0 });
}));

tagsRouter.delete('/:id', requirePerm('lists:write'), asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const r = await run('DELETE FROM tags WHERE id = ? AND workspace_id = ?', [id, req.auth!.workspaceId]);
  if (!r.affectedRows) throw notFound('Tag not found');
  await audit(ctxFrom(req), 'tag.delete', 'tag', id);
  res.status(204).end();
}));
