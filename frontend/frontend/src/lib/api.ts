/**
 * API client. The access token and CSRF token live in memory only (never localStorage), so a stolen page script
 * or XSS payload cannot persist them. The refresh token is an HttpOnly cookie the browser sends on its own.
 */
const BASE = '/api/v1';

let accessToken: string | null = null;
let csrfToken: string | null = null;
let onSessionEnded: (() => void) | null = null;

export const setSessionEndedHandler = (fn: () => void) => { onSessionEnded = fn; };
export const setAccessToken = (t: string | null) => { accessToken = t; };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

async function parse(res: Response) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch(`${BASE}/auth/csrf`, { credentials: 'include', cache: 'no-store' });
  const data = await parse(res);
  csrfToken = data?.csrfToken ?? null;
  if (!csrfToken) throw new ApiError(res.status, 'CSRF', 'Could not start a secure session');
  return csrfToken;
}

export interface SessionPayload { accessToken: string; csrfToken: string; expiresIn: number; user: import('./types').User }

let refreshing: Promise<SessionPayload | null> | null = null;

/** Single-flight refresh so parallel 401s do not rotate the cookie several times. */
export function refreshSession(): Promise<SessionPayload | null> {
  refreshing ??= (async () => {
    try {
      const token = await ensureCsrf();
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': token } });
      const data = await parse(res);
      if (!res.ok || !data?.accessToken) { accessToken = null; return null; }
      accessToken = data.accessToken;
      csrfToken = data.csrfToken ?? csrfToken;
      return data as SessionPayload;
    } catch {
      return null;
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

export async function login(email: string, password: string): Promise<SessionPayload> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const data = await parse(res);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'Sign in failed');
  accessToken = data.accessToken;
  csrfToken = data.csrfToken;
  return data;
}

export async function logout() {
  try {
    const token = await ensureCsrf();
    await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': token } });
  } finally {
    accessToken = null;
    csrfToken = null;
  }
}

interface ReqOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

function qs(query?: Record<string, unknown>) {
  if (!query) return '';
  const p = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function api<T = unknown>(path: string, opts: ReqOpts = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const res = await fetch(`${BASE}${path}${qs(opts.query)}`, {
    method: opts.method ?? 'GET', headers, credentials: 'include', signal: opts.signal,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && !retried) {
    const session = await refreshSession();
    if (session) return api<T>(path, opts, true);
    onSessionEnded?.();
  }
  const data = await parse(res);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'Something went wrong', data?.error?.details);
  return data as T;
}

export const newIdempotencyKey = () => (crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
