import { Router } from 'express';
import { z } from 'zod';
import { isDuplicateKey, one, rows, run } from '../../db/pool';
import { asyncHandler, boolish, idParam } from '../../lib/http';
import { uuid } from '../../lib/crypto';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { authenticate, requirePerm } from '../../middleware/auth';
import { audit, ctxFrom } from '../audit/audit.service';
import { hashPassword, passwordSchema } from '../auth/password';
import { revokeAllForUser } from '../auth/tokens';

export const usersRouter = Router();
usersRouter.use(authenticate, requirePerm('users:manage'));

const dto = (u: any) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, isActive: !!u.is_active,
  lastLoginAt: u.last_login_at, createdAt: u.created_at,
});

usersRouter.get('/', asyncHandler(async (req, res) => {
  const list = await rows('SELECT id, email, name, role, is_active, last_login_at, created_at FROM users WHERE workspace_id = ? ORDER BY created_at', [req.auth!.workspaceId]);
  res.json({ items: list.map(dto) });
}));

usersRouter.post('/', asyncHandler(async (req, res) => {
  const body = z.object({
    email: z.string().trim().toLowerCase().email().max(255),
    name: z.string().trim().min(2).max(160),
    role: z.enum(['admin', 'analyst', 'viewer']),
    password: passwordSchema,
  }).parse(req.body);
  if (body.role === 'admin' && req.auth!.role !== 'owner') throw forbidden('Only the owner can create admins');
  const id = uuid();
  try {
    await run('INSERT INTO users (id, workspace_id, email, name, password_hash, role) VALUES (?,?,?,?,?,?)', [
      id, req.auth!.workspaceId, body.email, body.name, await hashPassword(body.password), body.role,
    ]);
  } catch (err) {
    if (isDuplicateKey(err)) throw conflict('A user with this email already exists');
    throw err;
  }
  await audit(ctxFrom(req), 'user.create', 'user', id, { email: body.email, role: body.role });
  const created = await one('SELECT id, email, name, role, is_active, last_login_at, created_at FROM users WHERE id = ?', [id]);
  res.status(201).json(dto(created));
}));

usersRouter.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const body = z.object({
    name: z.string().trim().min(2).max(160).optional(),
    role: z.enum(['admin', 'analyst', 'viewer']).optional(),
    isActive: boolish.optional(),
    newPassword: passwordSchema.optional(),
  }).parse(req.body);

  const target = await one<any>('SELECT * FROM users WHERE id = ? AND workspace_id = ?', [id, req.auth!.workspaceId]);
  if (!target) throw notFound('User not found');
  const actor = req.auth!;
  if (target.role === 'owner') throw forbidden('The owner account cannot be changed here');
  if (target.id === actor.userId && (body.role !== undefined || body.isActive === false)) throw forbidden('You cannot change your own role or deactivate yourself');
  if (actor.role !== 'owner' && (target.role === 'admin' || body.role === 'admin')) throw forbidden('Only the owner can manage admins');

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.name !== undefined) { sets.push('name = ?'); vals.push(body.name); }
  if (body.role !== undefined) { sets.push('role = ?'); vals.push(body.role); }
  if (body.isActive !== undefined) { sets.push('is_active = ?'); vals.push(body.isActive ? 1 : 0); }
  if (body.newPassword !== undefined) { sets.push('password_hash = ?', 'failed_login_attempts = 0', 'locked_until = NULL'); vals.push(await hashPassword(body.newPassword)); }
  if (!sets.length) return res.json(dto(target));
  await run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
  if (body.isActive === false || body.role !== undefined || body.newPassword !== undefined) await revokeAllForUser(id);
  await audit(ctxFrom(req), 'user.update', 'user', id, { name: body.name, role: body.role, isActive: body.isActive, passwordReset: !!body.newPassword });
  const updated = await one('SELECT id, email, name, role, is_active, last_login_at, created_at FROM users WHERE id = ?', [id]);
  res.json(dto(updated));
}));
