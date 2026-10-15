import { parseJson } from '../../db/pool';
import { safeCell } from '../../security/spreadsheet';
import { getAdapter } from '../../sources/registry';
import type { ExportRow } from './export.query';

export const EXPORT_COLUMNS = [
  { header: 'Business Name', width: 34 }, { header: 'Category', width: 18 }, { header: 'Address', width: 44 },
  { header: 'City/Area', width: 18 }, { header: 'Phone', width: 17 }, { header: 'Website', width: 34 },
  { header: 'Facebook', width: 34 }, { header: 'Instagram', width: 34 }, { header: 'Other Social', width: 34 },
  { header: 'Rating', width: 9 }, { header: 'Review Count', width: 14 }, { header: 'Source', width: 16 },
  { header: 'Source Record ID (if permitted)', width: 32 }, { header: 'Last Checked', width: 20 },
  { header: 'Verification Status', width: 20 }, { header: 'Notes', width: 40 },
];

const SOURCE_LABEL = (id: string) => getAdapter(id)?.label ?? id;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Only source ids the source's own terms allow us to hand out are exported. */
function permittedIds(row: ExportRow): string | null {
  if (!row.source_ids) return null;
  const out = row.source_ids.split(', ').filter((entry) => {
    const source = entry.split(':')[0];
    return getAdapter(source)?.compliance.exportSourceRecordId === true;
  });
  return out.length ? out.join(', ') : null;
}

/** Missing values stay blank (NULL semantics). Every string cell passes through formula-injection protection. */
export function toExportValues(r: ExportRow): unknown[] {
  const others = parseJson<{ platform: string; url: string }[]>(r.other_socials, []);
  return [
    safeCell(r.name), safeCell(r.category), safeCell(r.address), safeCell(r.city_area), safeCell(r.phone), safeCell(r.website),
    safeCell(r.facebook_url), safeCell(r.instagram_url), others.length ? safeCell(others.map((o) => `${o.platform}: ${o.url}`).join('; ')) : null,
    r.rating, r.review_count, safeCell(r.sources ? r.sources.split(', ').map(SOURCE_LABEL).join(', ') : null),
    safeCell(permittedIds(r)), r.last_checked_at, cap(r.verification_status), safeCell(r.notes),
  ].map((v) => (v === undefined || v === '' ? null : v));
}

