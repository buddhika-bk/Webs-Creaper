import { Db, pool, rows } from '../../db/pool';
import { buildBusinessQuery, BusinessFilter } from '../businesses/filters';

export interface ExportRow {
  id: string; name: string; category: string; address: string | null; city_area: string | null; phone: string | null;
  website: string | null; facebook_url: string | null; instagram_url: string | null; other_socials: unknown;
  rating: number | null; review_count: number | null; verification_status: string; notes: string | null; last_checked_at: Date;
  sources: string | null; source_ids: string | null;
}

export type Selection = { mode: 'ids'; ids: string[] } | { mode: 'filter'; filter: BusinessFilter };

/** Keyset-paginated reads (id > cursor) so large exports never load everything into memory. */
export async function fetchExportBatch(workspaceId: string, selection: Selection, afterId: string, size: number, db: Db = pool): Promise<ExportRow[]> {
  const base =
    selection.mode === 'filter'
      ? buildBusinessQuery(workspaceId, selection.filter)
      : { joins: '', joinParams: [] as unknown[], where: 'b.workspace_id = ? AND b.id IN (?)', whereParams: [workspaceId, selection.ids.length ? selection.ids : ['00000000-0000-0000-0000-000000000000']] };
  const sql = `
    SELECT b.id, b.name, b.category, b.address, b.city_area, b.phone, b.website, b.facebook_url, b.instagram_url, b.other_socials,
           b.rating, b.review_count, b.verification_status, b.notes, b.last_checked_at,
           (SELECT GROUP_CONCAT(DISTINCT s.source ORDER BY s.source SEPARATOR ', ') FROM business_sources s WHERE s.business_id = b.id) AS sources,
           (SELECT GROUP_CONCAT(CONCAT(s.source, ':', s.source_record_id) ORDER BY s.source SEPARATOR ', ') FROM business_sources s WHERE s.business_id = b.id) AS source_ids
    FROM businesses b ${base.joins}
    WHERE ${base.where} AND b.id > ?
    ORDER BY b.id ASC LIMIT ${Math.max(1, Math.min(2000, Math.floor(size)))}`;
  return rows<ExportRow>(sql, [...base.joinParams, ...base.whereParams, afterId], db);
}

export async function countSelection(workspaceId: string, selection: Selection): Promise<number> {
  if (selection.mode === 'ids') {
    const r = await rows<{ n: number }>('SELECT COUNT(*) AS n FROM businesses WHERE workspace_id = ? AND id IN (?)', [workspaceId, selection.ids.length ? selection.ids : ['00000000-0000-0000-0000-000000000000']]);
    return r[0]?.n ?? 0;
  }
  const q = buildBusinessQuery(workspaceId, selection.filter);
  const r = await rows<{ n: number }>(`SELECT COUNT(*) AS n FROM businesses b ${q.joins} WHERE ${q.where}`, [...q.joinParams, ...q.whereParams]);
  return r[0]?.n ?? 0;
}
