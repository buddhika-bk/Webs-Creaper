import { Router } from 'express';
import { one, parseJson, rows } from '../../db/pool';
import { asyncHandler } from '../../lib/http';
import { can } from '../../lib/permissions';
import { authenticate } from '../../middleware/auth';
import { emptyMetrics } from '../../pipeline/pipeline';
import { getWorkspace, usageSnapshot } from '../workspaces/workspace.service';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get('/', asyncHandler(async (req, res) => {
  const ws = req.auth!.workspaceId;
  const totals = await one<any>(
    `SELECT COUNT(*) AS businesses,
       SUM(website IS NULL) AS no_website,
       SUM(facebook_url IS NULL AND instagram_url IS NULL AND other_socials IS NULL) AS no_social,
       SUM(phone IS NOT NULL) AS with_phone
     FROM businesses WHERE workspace_id = ? AND archived_at IS NULL`,
    [ws],
  );
  const recent = await rows<any>('SELECT id, category, location, source, status, metrics, created_at FROM search_jobs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 6', [ws]);
  const lists = (await one<{ n: number }>('SELECT COUNT(*) AS n FROM lead_lists WHERE workspace_id = ?', [ws]))?.n ?? 0;
  const workspace = await getWorkspace(ws);
  const usage = await usageSnapshot(ws);
  const base: any = {
    totals: {
      businesses: Number(totals?.businesses ?? 0), withoutWebsite: Number(totals?.no_website ?? 0),
      withoutSocial: Number(totals?.no_social ?? 0), withPhone: Number(totals?.with_phone ?? 0), lists,
    },
    quotas: { dailySearches: workspace.daily_search_quota, dailyExports: workspace.daily_export_quota, monthlyApiBudgetUsd: Number(workspace.monthly_api_budget_usd), ...usage },
    recentSearches: recent.map((j) => ({ id: j.id, category: j.category, location: j.location, source: j.source, status: j.status, createdAt: j.created_at, metrics: { ...emptyMetrics(), ...parseJson(j.metrics, {}) } })),
  };
  if (can(req.auth!.role, 'admin:overview')) base.admin = await adminOverview(ws);
  res.setHeader('Cache-Control', 'no-store');
  res.json(base);
}));

async function adminOverview(ws: string) {
  const [vol, dur, jobs, usage, exp, dup] = await Promise.all([
    rows<any>(`SELECT DATE(created_at) AS day, COUNT(*) AS n FROM search_jobs WHERE workspace_id = ? AND created_at >= DATE_SUB(UTC_DATE(), INTERVAL 13 DAY) GROUP BY DATE(created_at) ORDER BY day`, [ws]),
    one<any>(`SELECT AVG(TIMESTAMPDIFF(SECOND, started_at, completed_at)) AS avg_s FROM search_jobs WHERE workspace_id = ? AND status = 'COMPLETED' AND started_at IS NOT NULL AND created_at >= DATE_SUB(UTC_DATE(), INTERVAL 30 DAY)`, [ws]),
    rows<any>(`SELECT status, COUNT(*) AS n FROM search_jobs WHERE workspace_id = ? AND created_at >= DATE_SUB(UTC_DATE(), INTERVAL 30 DAY) GROUP BY status`, [ws]),
    rows<any>(`SELECT source, SUM(requests) AS requests, SUM(estimated_cost_usd) AS cost FROM api_usage WHERE workspace_id = ? AND created_at >= DATE_SUB(UTC_DATE(), INTERVAL 30 DAY) GROUP BY source`, [ws]),
    one<any>(`SELECT COUNT(*) AS n FROM exports WHERE workspace_id = ? AND created_at >= DATE_SUB(UTC_DATE(), INTERVAL 30 DAY)`, [ws]),
    one<any>(`SELECT SUM(JSON_EXTRACT(metrics, '$.duplicates')) AS dups, SUM(JSON_EXTRACT(metrics, '$.acceptedRecords')) AS acc FROM search_jobs WHERE workspace_id = ? AND status = 'COMPLETED' AND created_at >= DATE_SUB(UTC_DATE(), INTERVAL 30 DAY)`, [ws]),
  ]);
  const failed = jobs.filter((j) => j.status === 'FAILED').reduce((s, j) => s + Number(j.n), 0);
  const total = jobs.reduce((s, j) => s + Number(j.n), 0);
  const accepted = Number(dup?.acc ?? 0);
  return {
    searchVolume: vol.map((v) => ({ day: v.day, count: Number(v.n) })),
    avgJobSeconds: dur?.avg_s === null || dur?.avg_s === undefined ? null : Math.round(Number(dur.avg_s)),
    jobFailures30d: failed,
    jobs30d: total,
    duplicateRate: accepted ? Math.round((Number(dup?.dups ?? 0) / accepted) * 1000) / 10 : 0,
    exports30d: Number(exp?.n ?? 0),
    sourceUsage: usage.map((u) => ({ source: u.source, requests: Number(u.requests), estimatedCostUsd: Number(u.cost) })),
  };
}
