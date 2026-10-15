import { env } from '../config/env';
import { one } from '../db/pool';
import { demoAdapter } from './demo.adapter';
import { googlePlacesAdapter } from './google-places.adapter';
import { osmAdapter } from './osm.adapter';
import { SourceAdapter, SourceId } from './types';

export const adapters: SourceAdapter[] = [googlePlacesAdapter, osmAdapter, ...(env.demoSourceEnabled ? [demoAdapter] : [])];

export const getAdapter = (id: string): SourceAdapter | undefined => adapters.find((a) => a.id === id);

export interface EffectiveSource {
  adapter: SourceAdapter;
  enabled: boolean;
  configured: boolean;
  retentionDays: number | null;
}

/** Merges adapter defaults with the workspace override. A workspace can only SHORTEN a source-imposed retention. */
export async function effectiveSource(workspaceId: string, id: SourceId | string): Promise<EffectiveSource | null> {
  const adapter = getAdapter(id);
  if (!adapter) return null;
  const row = await one<{ enabled: number; retention_days: number | null }>(
    'SELECT enabled, retention_days FROM source_configs WHERE workspace_id = ? AND source = ?',
    [workspaceId, id],
  );
  const base = adapter.compliance.retentionDays;
  const override = row?.retention_days ?? null;
  const retentionDays = base === null ? override : override === null ? base : Math.min(base, override);
  return { adapter, enabled: row ? !!row.enabled : true, configured: adapter.isConfigured(), retentionDays };
}
