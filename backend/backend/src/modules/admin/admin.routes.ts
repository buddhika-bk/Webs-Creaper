import { Router } from 'express';
import { one, rows } from '../../db/pool';
import { asyncHandler } from '../../lib/http';
import { authenticate, requirePerm } from '../../middleware/auth';
import { getWorkspace, usageSnapshot } from '../workspaces/workspace.service';
import { jobDto } from '../search-jobs/search-jobs.routes';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

/** Workspace summary for every role: counts, quota usage and recent searches. */
dashboardRouter.get('/', asyncHandler(async (req, res) => {
  const ws = req.auth!.workspaceId;
  const c = await one<any>(
    `SELECT COUNT(*) AS total,
       SUM(website IS NULL) AS no_website,
       SUM(facebook_url IS NULL AND instagram_url IS NULL AND other_socials IS NULL) AS no_social,
       SUM(phone IS NOT NULL) AS with_phone,
       SUM(verification_status = 'verified') AS verified
     FROM businesses WHERE workspace_id = ? AND archived_at IS NULL`,
    [ws],
  );
  const lists = (await one<{ n: number }>('SELECT COUNT(*) AS n FROM lead_lists WHERE workspace_id = ?', [ws]))?.n ?? 0;
  const exportsCount = (await one<{ n: number }>("SELECT COUNT(*) AS n FROM exports WHERE workspace_id = ? AND status = 'COMPLETED'", [ws]))?.n ?? 0;
  const recent = await rows('SELECT j.*, u.name AS user_name FROM search_jobs j JOIN users u ON u.id = j.user_id WHERE j.workspace_id = ? ORDER BY j.created_at DESC LIMIT 6', [ws]);
  const workspace = await getWorkspace(ws);
  res.json({
    totals: {
      businesses: Number(c?.total ?? 0), withoutWebsite: Number(c?.no_website ?? 0), withoutSocial: Number(c?.no_social ?? 0),
      withPhone: Number(c?.with_phone ?? 0), verified: Number(c?.verified ?? 0), lists, exports: exportsCount,
    },
    quotas: {
      dailySearches: workspace.daily_search_quota, dailyExports: workspace.daily_export_quota,
      monthlyApiBudgetUsd: Number(workspace.monthly_api_budget_usd), maxResultsPerSearch: workspace.max_results_per_search,
    },
    usage: await usageSnapshot(ws),
    recentSearches: recent.map(jobDto),
  });
}));

export const adminRouter = Router();
adminRouter.use(authenticate, requirePerm('admin:overview'));

/** Admin dashboard: search volume, source usage, API errors, job failures, durations, duplicate rate, export volume, quotas. */
adminRouter.get('/overview', asyncHandler(async (req, res) => {
  const ws = req.auth!.workspaceId;
  const volume = await rows<{ day: string; searches: number }>(
    `SELECT DATE(created_at) AS day, COUNT(*) AS searches FROM search_jobs WHERE workspace_id = ? AND created_at >= DATE_SUB(UTC_DATE(), INTERVAL 13 DAY) GROUP BY DATE(created_at) ORDER BY day`, [ws]);
  const jobs = await one<any>(
    `SELECT COUNT(*) AS total, SUM(status = 'FAILED') AS failed, SUM(status = 'COMPLETED') AS completed,
       AVG(CASE WHEN status = 'COMPLETED' THEN TIMESTAMPDIFF(SECOND, started_at, completed_at) END) AS avg_seconds,
       SUM(CAST(JSON_EXTRACT(metrics, '$.duplicates') AS UNSIGNED)) AS duplicates,
       SUM(CAST(JSON_EXTRACT(metrics, '$.acceptedRecords') AS UNSIGNED)) AS accepted
     FROM search_jobs WHERE workspace_id = ? AND created_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 DAY)`, [ws]);
  const sources = await rows(
    `SELECT source, SUM(requests) AS requests, SUM(estimated_cost_usd) AS cost, SUM(status_code >= 400) AS errors
     FROM api_usage WHERE workspace_id = ? AND created_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 DAY) GROUP BY source`, [ws]);
  const failures = await rows(
    `SELECT id, category, location, source, error_message, created_at FROM search_jobs WHERE workspace_id = ? AND status = 'FAILED' ORDER BY created_at DESC LIMIT 8`, [ws]);
  const ex = await one<any>("SELECT COUNT(*) AS n, COALESCE(SUM(row_count),0) AS rows_total FROM exports WHERE workspace_id = ? AND created_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 DAY)", [ws]);
  const workspace = await getWorkspace(ws);
  const accepted = Number(jobs?.accepted ?? 0);
  res.json({
    searchVolume: volume.map((v) => ({ day: v.day, searches: Number(v.searches) })),
    jobs: {
      total: Number(jobs?.total ?? 0), failed: Number(jobs?.failed ?? 0), completed: Number(jobs?.completed ?? 0),
      avgDurationSeconds: jobs?.avg_seconds === null ? null : Math.round(Number(jobs?.avg_seconds ?? 0)),
      duplicateRate: accepted ? Number(jobs?.duplicates ?? 0) / accepted : 0,
    },
    sources: sources.map((s: any) => ({ source: s.source, requests: Number(s.requests), estimatedCostUsd: Number(s.cost), errors: Number(s.errors ?? 0) })),
    recentFailures: failures,
    exports: { count: Number(ex?.n ?? 0), rows: Number(ex?.rows_total ?? 0) },
    quotas: { dailySearches: workspace.daily_search_quota, dailyExports: workspace.daily_export_quota, monthlyApiBudgetUsd: Number(workspace.monthly_api_budget_usd) },
    usage: await usageSnapshot(ws),
  });
}));
