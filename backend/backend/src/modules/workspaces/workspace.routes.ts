import { Router } from 'express';
import { z } from 'zod';
import { run } from '../../db/pool';
import { asyncHandler } from '../../lib/http';
import { authenticate, requirePerm } from '../../middleware/auth';
import { audit, ctxFrom } from '../audit/audit.service';
import { getWorkspace, usageSnapshot } from './workspace.service';

export const workspaceRouter = Router();
workspaceRouter.use(authenticate);

const dto = (w: any, usage: any) => ({
  id: w.id,
  name: w.name,
  quotas: {
    maxResultsPerSearch: w.max_results_per_search,
    dailySearches: w.daily_search_quota,
    dailyExports: w.daily_export_quota,
    monthlyApiBudgetUsd: Number(w.monthly_api_budget_usd),
  },
  usage,
});

workspaceRouter.get('/', asyncHandler(async (req, res) => {
  const ws = await getWorkspace(req.auth!.workspaceId);
  res.json(dto(ws, await usageSnapshot(ws.id)));
}));

workspaceRouter.patch('/', requirePerm('workspace:manage'), asyncHandler(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(2).max(160).optional(),
    maxResultsPerSearch: z.number().int().min(10).max(500).optional(),
    dailySearches: z.number().int().min(1).max(1000).optional(),
    dailyExports: z.number().int().min(1).max(500).optional(),
    monthlyApiBudgetUsd: z.number().min(0).max(100000).optional(),
  }).parse(req.body);
  const map: Record<string, [string, unknown | undefined]> = {
    name: ['name', body.name],
    max: ['max_results_per_search', body.maxResultsPerSearch],
    ds: ['daily_search_quota', body.dailySearches],
    de: ['daily_export_quota', body.dailyExports],
    bud: ['monthly_api_budget_usd', body.monthlyApiBudgetUsd],
  };
  const entries = Object.values(map).filter(([, v]) => v !== undefined);
  if (entries.length) {
    await run(`UPDATE workspaces SET ${entries.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`, [...entries.map(([, v]) => v), req.auth!.workspaceId]);
    await audit(ctxFrom(req), 'workspace.update', 'workspace', req.auth!.workspaceId, body as Record<string, unknown>);
  }
  const ws = await getWorkspace(req.auth!.workspaceId);
  res.json(dto(ws, await usageSnapshot(ws.id)));
}));
