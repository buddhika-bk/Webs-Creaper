import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { one, run } from '../../db/pool';
import { asyncHandler } from '../../lib/http';
import { forbidden, unauthorized } from '../../lib/errors';
import { can, PERMISSIONS, Permission } from '../../lib/permissions';
import { authenticate } from '../../middleware/auth';
import { CSRF_COOKIE, REFRESH_COOKIE, clearAuthCookies, issueCsrf, requireCsrf, setRefreshCookie } from '../../middleware/csrf';
import { limiters } from '../../middleware/rateLimit';
import { audit, ctxFrom } from '../audit/audit.service';
import { burnVerify, hashPassword, passwordSchema, verifyPassword } from './password';
import { issueRefreshToken, revokeAllForUser, revokeByRaw, rotateRefreshToken, signAccessToken } from './tokens';

export const authRouter = Router();

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

interface UserRow {
  id: string;
  workspace_id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'analyst' | 'viewer';
  password_hash: string;
  is_active: number;
  failed_login_attempts: number;
  locked_until: Date | null;
}

const permissionsFor = (role: UserRow['role']) =>
  (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));

function session(res: Response, user: Pick<UserRow, 'id' | 'workspace_id' | 'email' | 'name' | 'role'>, csrf: string) {
  return res.json({
    accessToken: signAccessToken({ userId: user.id, workspaceId: user.workspace_id, role: user.role }),
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    csrfToken: csrf,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, workspaceId: user.workspace_id, permissions: permissionsFor(user.role) },
  });
}

/** Returns the CSRF token for the cookie-authenticated endpoints. An attacker site cannot read this response (CORS). */
authRouter.get('/csrf', limiters.public, (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ csrfToken: issueCsrf(req, res) });
});

authRouter.post(
  '/login',
  limiters.login,
  asyncHandler(async (req, res) => {
    const body = z.object({ email: z.string().trim().toLowerCase().email().max(255), password: z.string().min(1).max(128) }).parse(req.body);
    const user = await one<UserRow>('SELECT * FROM users WHERE email = ?', [body.email]);
    const base = ctxFrom(req);

    if (!user) {
      await burnVerify(body.password);
      await audit(base, 'auth.login_failed', 'user', null, { reason: 'unknown_email' });
      throw unauthorized('Email or password is incorrect', 'INVALID_CREDENTIALS');
    }
    const ctx = { ...base, workspaceId: user.workspace_id, userId: user.id };

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      await audit(ctx, 'auth.login_blocked', 'user', user.id, { reason: 'locked' });
      throw unauthorized(`This account is temporarily locked. Try again in ${LOCK_MINUTES} minutes.`, 'ACCOUNT_LOCKED');
    }
    const valid = await verifyPassword(user.password_hash, body.password);
    if (!valid || !user.is_active) {
      const attempts = user.failed_login_attempts + 1;
      const lock = attempts >= MAX_FAILED;
      await run(
        'UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?',
        [lock ? 0 : attempts, lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null, user.id],
      );
      await audit(ctx, 'auth.login_failed', 'user', user.id, { reason: valid ? 'inactive' : 'bad_password', locked: lock });
      throw unauthorized('Email or password is incorrect', 'INVALID_CREDENTIALS');
    }

    await run('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP(3) WHERE id = ?', [user.id]);
    const refresh = await issueRefreshToken(user.id, { ip: req.ip, userAgent: req.get('user-agent') });
    setRefreshCookie(res, refresh.raw);
    const csrf = issueCsrf(req, res);
    await audit(ctx, 'auth.login', 'user', user.id);
    res.setHeader('Cache-Control', 'no-store');
    session(res, user, csrf);
  }),
);

authRouter.post(
  '/refresh',
  limiters.refresh,
  requireCsrf,
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (typeof raw !== 'string' || raw.length < 20) throw unauthorized('No session', 'NO_SESSION');
    const result = await rotateRefreshToken(raw, { ip: req.ip, userAgent: req.get('user-agent') });
    if (!result.ok) {
      clearAuthCookies(res);
      if (result.reason === 'reuse' && result.userId) {
        const u = await one<{ workspace_id: string }>('SELECT workspace_id FROM users WHERE id = ?', [result.userId]);
        await audit({ ...ctxFrom(req), workspaceId: u?.workspace_id ?? null, userId: result.userId }, 'auth.refresh_reuse_detected', 'user', result.userId);
      }
      throw unauthorized('Your session has ended. Please sign in again.', 'SESSION_ENDED');
    }
    const user = await one<UserRow>('SELECT * FROM users WHERE id = ?', [result.userId]);
    if (!user) throw unauthorized('Your session has ended. Please sign in again.', 'SESSION_ENDED');
    setRefreshCookie(res, result.raw);
    const csrf = issueCsrf(req, res);
    res.setHeader('Cache-Control', 'no-store');
    session(res, user, csrf);
  }),
);

authRouter.post(
  '/logout',
  requireCsrf,
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (typeof raw === 'string' && raw) await revokeByRaw(raw);
    clearAuthCookies(res);
    await audit(ctxFrom(req), 'auth.logout');
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    res.json({ id: a.userId, email: a.email, name: a.name, role: a.role, workspaceId: a.workspaceId, permissions: permissionsFor(a.role) });
  }),
);

authRouter.post(
  '/change-password',
  authenticate,
  limiters.login,
  asyncHandler(async (req, res) => {
    const body = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }).parse(req.body);
    const user = await one<UserRow>('SELECT * FROM users WHERE id = ?', [req.auth!.userId]);
    if (!user || !(await verifyPassword(user.password_hash, body.currentPassword))) {
      throw forbidden('Your current password is incorrect');
    }
    if (body.newPassword.toLowerCase().includes(user.email.split('@')[0].toLowerCase())) {
      throw forbidden('Your new password must not contain your email name');
    }
    await run('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(body.newPassword), user.id]);
    await revokeAllForUser(user.id);
    clearAuthCookies(res);
    await audit(ctxFrom(req), 'auth.password_changed', 'user', user.id);
    res.status(204).end();
  }),
);

export { CSRF_COOKIE };
