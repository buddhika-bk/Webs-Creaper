import { Router } from 'express';
import { z } from 'zod';
import { rows, run } from '../../db/pool';
import { asyncHandler, boolish } from '../../lib/http';
import { badRequest } from '../../lib/errors';
import { authenticate, requirePerm } from '../../middleware/auth';
import { categorySuggestions } from '../../sources/categories';
import { adapters, effectiveSource, getAdapter } from '../../sources/registry';
import { audit, ctxFrom } from '../audit/audit.service';

export const sourcesRouter = Router();
sourcesRouter.use(authenticate);

async function describe(workspaceId: string) {
  const usage = await rows<{ source: string; requests: number; cost: number }>(
    `SELECT source, SUM(requests) AS requests, SUM(estimated_cost_usd) AS cost FROM api_usage
     WHERE workspace_id = ? AND created_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 DAY) GROUP BY source`,
    [workspaceId],
  );
  return Promise.all(
    adapters.map(async (a) => {
      const eff = (await effectiveSource(workspaceId, a.id))!;
      const u = usage.find((x) => x.source === a.id);
      return {
        id: a.id, label: a.label, description: a.description, configured: eff.configured, enabled: eff.enabled,
        paid: a.compliance.paid, retentionDays: eff.retentionDays, attribution: a.compliance.attribution,
        mapAttributionRequired: a.compliance.mapAttributionRequired, termsUrl: a.compliance.termsUrl, notes: a.compliance.notes,
        usage30d: { requests: Number(u?.requests ?? 0), estimatedCostUsd: Number(u?.cost ?? 0) },
      };
    }),
  );
}

sourcesRouter.get('/', asyncHandler(async (req, res) => {
  res.json({ items: await describe(req.auth!.workspaceId), categories: categorySuggestions() });
}));

sourcesRouter.patch('/:source', requirePerm('sources:manage'), asyncHandler(async (req, res) => {
  const source = z.string().max(40).parse(req.params.source);
  const adapter = getAdapter(source);
  if (!adapter) throw badRequest('Unknown source');
  const body = z.object({ enabled: boolish.optional(), retentionDays: z.number().int().min(0).max(3650).nullable().optional() }).parse(req.body);
  await run(
    `INSERT INTO source_configs (workspace_id, source, enabled, retention_days) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE enabled = COALESCE(?, enabled), retention_days = IF(?, ?, retention_days)`,
    [req.auth!.workspaceId, source, body.enabled === undefined ? 1 : body.enabled ? 1 : 0, body.retentionDays ?? null,
     body.enabled === undefined ? null : body.enabled ? 1 : 0, body.retentionDays !== undefined ? 1 : 0, body.retentionDays ?? null],
  );
  await audit(ctxFrom(req), 'source.update', 'source', source, body as Record<string, unknown>);
  res.json({ items: await describe(req.auth!.workspaceId) });
}));
