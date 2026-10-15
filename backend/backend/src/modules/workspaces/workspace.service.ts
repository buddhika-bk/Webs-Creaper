import { one } from '../../db/pool';
import { notFound, tooMany } from '../../lib/errors';

export interface WorkspaceRow {
  id: string;
  name: string;
  max_results_per_search: number;
  daily_search_quota: number;
  daily_export_quota: number;
  monthly_api_budget_usd: number;
}

export async function getWorkspace(id: string): Promise<WorkspaceRow> {
  const ws = await one<WorkspaceRow>('SELECT * FROM workspaces WHERE id = ?', [id]);
  if (!ws) throw notFound('Workspace not found');
  return ws;
}

export async function usageSnapshot(workspaceId: string) {
  const s = await one<{ n: number }>('SELECT COUNT(*) AS n FROM search_jobs WHERE workspace_id = ? AND created_at >= UTC_DATE()', [workspaceId]);
  const e = await one<{ n: number }>('SELECT COUNT(*) AS n FROM exports WHERE workspace_id = ? AND created_at >= UTC_DATE()', [workspaceId]);
  const c = await one<{ cost: number | null; reqs: number | null }>(
    `SELECT COALESCE(SUM(estimated_cost_usd),0) AS cost, COALESCE(SUM(requests),0) AS reqs FROM api_usage
     WHERE workspace_id = ? AND created_at >= DATE_FORMAT(UTC_DATE(), '%Y-%m-01')`,
    [workspaceId],
  );
  return { searchesToday: s?.n ?? 0, exportsToday: e?.n ?? 0, monthCostUsd: Number(c?.cost ?? 0), monthRequests: Number(c?.reqs ?? 0) };
}

export async function assertSearchQuota(ws: WorkspaceRow, paidSource: boolean) {
  const u = await usageSnapshot(ws.id);
  if (u.searchesToday >= ws.daily_search_quota) throw tooMany('Your workspace has reached its daily search quota.', 'QUOTA_EXCEEDED');
  if (paidSource && u.monthCostUsd >= Number(ws.monthly_api_budget_usd)) {
    throw tooMany('The monthly API budget for this workspace has been reached.', 'BUDGET_EXCEEDED');
  }
}

export async function assertExportQuota(ws: WorkspaceRow) {
  const u = await usageSnapshot(ws.id);
  if (u.exportsToday >= ws.daily_export_quota) throw tooMany('Your workspace has reached its daily export quota.', 'QUOTA_EXCEEDED');
}
