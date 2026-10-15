import { Request } from 'express';
import { run } from '../../db/pool';
import { logger } from '../../config/logger';

export interface AuditCtx {
  workspaceId: string | null;
  userId: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export const ctxFrom = (req: Request): AuditCtx => ({
  workspaceId: req.auth?.workspaceId ?? null,
  userId: req.auth?.userId ?? null,
  ip: req.ip ?? null,
  userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
});

const SENSITIVE = /pass|token|secret|authorization|cookie|api[_-]?key|hash|csrf/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 300) return value.slice(0, 300) + '…';
  return value;
}

/** Records a security/business event. Never put secrets in metadata - keys that look sensitive are redacted anyway. */
export async function audit(
  ctx: AuditCtx,
  action: string,
  entityType?: string | null,
  entityId?: string | null,
  metadata?: Record<string, unknown>,
) {
  try {
    await run(
      'INSERT INTO audit_logs (workspace_id, user_id, action, entity_type, entity_id, ip, user_agent, metadata) VALUES (?,?,?,?,?,?,?,?)',
      [
        ctx.workspaceId,
        ctx.userId,
        action,
        entityType ?? null,
        entityId ?? null,
        ctx.ip ?? null,
        ctx.userAgent ?? null,
        metadata ? JSON.stringify(redact(metadata)) : null,
      ],
    );
  } catch (err) {
    logger.error({ err, action }, 'failed to write audit log');
  }
}
