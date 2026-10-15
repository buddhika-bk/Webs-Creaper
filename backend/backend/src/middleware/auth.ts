import { RequestHandler } from 'express';
import { one } from '../db/pool';
import { forbidden, unauthorized } from '../lib/errors';
import { asyncHandler } from '../lib/http';
import { Permission, can } from '../lib/permissions';
import { verifyAccessToken } from '../modules/auth/tokens';

/** Verifies the bearer token, then re-checks the user in the DB so deactivation/role changes apply immediately. */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) throw unauthorized();
  const claims = verifyAccessToken(header.slice(7));
  const user = await one<{ id: string; workspace_id: string; email: string; name: string; role: any; is_active: number }>(
    'SELECT id, workspace_id, email, name, role, is_active FROM users WHERE id = ?',
    [claims.sub],
  );
  if (!user || !user.is_active || user.workspace_id !== claims.wid) {
    throw unauthorized('Session is no longer valid', 'INVALID_TOKEN');
  }
  req.auth = { userId: user.id, workspaceId: user.workspace_id, role: user.role, email: user.email, name: user.name };
  next();
});

export const requirePerm =
  (perm: Permission): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!can(req.auth.role, perm)) return next(forbidden());
    next();
  };
