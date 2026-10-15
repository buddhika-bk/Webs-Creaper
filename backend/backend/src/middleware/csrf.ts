import { RequestHandler, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError, forbidden } from '../lib/errors';
import { randomToken, safeEqual } from '../lib/crypto';

export const CSRF_COOKIE = 'wp_csrf';
export const REFRESH_COOKIE = 'wp_rt';
export const AUTH_COOKIE_PATH = '/api/v1/auth';

const cookieBase = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: 'strict' as const,
  path: AUTH_COOKIE_PATH,
};

/** Double-submit CSRF token. Only used for the cookie-authenticated endpoints (refresh/logout). */
export function issueCsrf(req: Request, res: Response): string {
  const existing = req.cookies?.[CSRF_COOKIE];
  const token = typeof existing === 'string' && /^[A-Za-z0-9_-]{32,}$/.test(existing) ? existing : randomToken(32);
  res.cookie(CSRF_COOKIE, token, { ...cookieBase, maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000 });
  return token;
}

export function setRefreshCookie(res: Response, raw: string) {
  res.cookie(REFRESH_COOKIE, raw, { ...cookieBase, maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000 });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(REFRESH_COOKIE, cookieBase);
  res.clearCookie(CSRF_COOKIE, cookieBase);
}

export const requireCsrf: RequestHandler = (req, _res, next) => {
  const origin = req.get('origin');
  if (origin && !env.origins.includes(origin)) return next(forbidden('Origin not allowed'));
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (typeof cookie !== 'string' || !header || !safeEqual(cookie, header)) {
    return next(new AppError(403, 'CSRF', 'Invalid or missing CSRF token'));
  }
  next();
};
