import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { unauthorized } from '../../lib/errors';
import { hmac, randomToken, uuid } from '../../lib/crypto';
import { one, parseJson, rows, run, tx } from '../../db/pool';
import { Role } from '../../lib/permissions';

const ISSUER = 'webpoint-leads';
const AUDIENCE = 'webpoint-web';

export interface AccessClaims {
  sub: string;
  wid: string;
  role: Role;
}

export function signAccessToken(c: { userId: string; workspaceId: string; role: Role }): string {
  return jwt.sign({ wid: c.workspaceId, role: c.role }, env.JWT_ACCESS_SECRET, {
    subject: c.userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    }) as jwt.JwtPayload;
    return { sub: String(p.sub), wid: String(p.wid), role: p.role as Role };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw unauthorized('Access token expired', 'TOKEN_EXPIRED');
    throw unauthorized('Invalid access token', 'INVALID_TOKEN');
  }
}

const hashRefresh = (raw: string) => hmac(env.REFRESH_TOKEN_PEPPER, raw);

export interface RefreshMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** Creates a refresh token (opaque, stored only as an HMAC hash). */
export async function issueRefreshToken(userId: string, meta: RefreshMeta, familyId: string = uuid()) {
  const raw = randomToken(48);
  const id = uuid();
  await run(
    `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at, user_agent, ip)
     VALUES (?,?,?,?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? DAY), ?, ?)`,
    [id, userId, familyId, hashRefresh(raw), env.REFRESH_TOKEN_TTL_DAYS, meta.userAgent?.slice(0, 255) ?? null, meta.ip ?? null],
  );
  return { raw, id, familyId };
}

export type RotateResult =
  | { ok: true; userId: string; raw: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'reuse' | 'inactive'; userId?: string };

const REUSE_GRACE_MS = 10_000;

/** Rotating refresh tokens with reuse detection: a replayed (already rotated) token revokes the whole family. */
export async function rotateRefreshToken(raw: string, meta: RefreshMeta): Promise<RotateResult> {
  const hash = hashRefresh(raw);
  return tx(async (conn) => {
    const [found] = await conn.query('SELECT * FROM refresh_tokens WHERE token_hash = ? FOR UPDATE', [hash]);
    const row = (found as any[])[0];
    if (!row) return { ok: false, reason: 'invalid' } as RotateResult;

    if (row.revoked_at) {
      const age = Date.now() - new Date(row.revoked_at).getTime();
      if (age > REUSE_GRACE_MS) {
        await conn.query('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(3) WHERE family_id = ? AND revoked_at IS NULL', [row.family_id]);
        return { ok: false, reason: 'reuse', userId: row.user_id } as RotateResult;
      }
      return { ok: false, reason: 'invalid' } as RotateResult;
    }
    if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' } as RotateResult;

    const [u] = await conn.query('SELECT is_active FROM users WHERE id = ?', [row.user_id]);
    const user = (u as any[])[0];
    if (!user || !user.is_active) return { ok: false, reason: 'inactive', userId: row.user_id } as RotateResult;

    const next = randomToken(48);
    const nextId = uuid();
    await conn.query(
      `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at, user_agent, ip)
       VALUES (?,?,?,?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? DAY), ?, ?)`,
      [nextId, row.user_id, row.family_id, hashRefresh(next), env.REFRESH_TOKEN_TTL_DAYS, meta.userAgent?.slice(0, 255) ?? null, meta.ip ?? null],
    );
    await conn.query('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(3), replaced_by = ? WHERE id = ?', [nextId, row.id]);
    return { ok: true, userId: row.user_id as string, raw: next } as RotateResult;
  });
}

export async function revokeByRaw(raw: string) {
  const row = await one<{ family_id: string }>('SELECT family_id FROM refresh_tokens WHERE token_hash = ?', [hashRefresh(raw)]);
  if (row) await run('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(3) WHERE family_id = ? AND revoked_at IS NULL', [row.family_id]);
}

export async function revokeAllForUser(userId: string) {
  await run('UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL', [userId]);
}

