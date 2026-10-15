import { z } from 'zod';
import { boolish } from '../../lib/http';
import { normalizePhone, phoneHash } from '../../pipeline/normalize';
import { normalizeCategory } from '../../sources/categories';

const tri = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === true || v === 'true'));

export const businessFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  jobId: z.string().uuid().optional(),
  listId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  category: z.string().trim().max(120).optional(),
  location: z.string().trim().max(160).optional(),
  hasWebsite: tri,
  hasPhone: tri,
  hasSocial: tri,
  minRating: z.coerce.number().min(0).max(5).optional(),
  minReviews: z.coerce.number().int().min(0).optional(),
  openOnly: boolish.optional(),
  source: z.string().trim().max(40).optional(),
  verification: z.enum(['verified', 'likely', 'unresolved']).optional(),
  archived: z.enum(['exclude', 'only', 'include']).default('exclude'),
  matchedOnly: boolish.default(true),
});
export type BusinessFilter = z.infer<typeof businessFilterSchema>;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export const SORTS: Record<string, string> = {
  name: 'b.normalized_name',
  rating: 'b.rating',
  reviews: 'b.review_count',
  score: 'b.lead_score',
  checked: 'b.last_checked_at',
  created: 'b.created_at',
  area: 'b.normalized_city',
};

/** Builds a parameterised WHERE clause. Every query is scoped by workspace_id (tenant isolation). */
export function buildBusinessQuery(workspaceId: string, f: BusinessFilter) {
  const joins: string[] = [];
  const joinParams: unknown[] = [];
  const where: string[] = ['b.workspace_id = ?'];
  const params: unknown[] = [workspaceId];

  if (f.jobId) {
    joins.push('JOIN job_businesses jb ON jb.business_id = b.id AND jb.job_id = ? AND jb.workspace_id = b.workspace_id');
    joinParams.push(f.jobId);
    if (f.matchedOnly) where.push('jb.matches_filters = 1');
  }
  if (f.listId) {
    joins.push('JOIN lead_list_items li ON li.business_id = b.id AND li.lead_list_id = ? JOIN lead_lists ll ON ll.id = li.lead_list_id AND ll.workspace_id = b.workspace_id');
    joinParams.push(f.listId);
  }
  if (f.tagId) {
    where.push('EXISTS (SELECT 1 FROM business_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.business_id = b.id AND bt.tag_id = ? AND t.workspace_id = b.workspace_id)');
    params.push(f.tagId);
  }
  if (f.q) {
    const phone = /^[+\d][\d\s()+-]{6,}$/.test(f.q) ? normalizePhone(f.q) : null;
    if (phone) {
      where.push('b.phone_hash = ?');
      params.push(phoneHash(phone.e164));
    } else {
      const like = `%${escapeLike(f.q.toLowerCase())}%`;
      where.push('(b.normalized_name LIKE ? OR LOWER(b.address) LIKE ? OR b.website_domain LIKE ?)');
      params.push(like, like, like);
    }
  }
  if (f.category) {
    where.push('(b.normalized_category = ? OR b.category LIKE ?)');
    params.push(normalizeCategory(f.category).key, `%${escapeLike(f.category)}%`);
  }
  if (f.location) {
    where.push('b.normalized_city LIKE ?');
    params.push(`${escapeLike(f.location.split(',')[0].trim().toLowerCase())}%`);
  }
  if (f.hasWebsite !== undefined) where.push(f.hasWebsite ? 'b.website IS NOT NULL' : 'b.website IS NULL');
  if (f.hasPhone !== undefined) where.push(f.hasPhone ? 'b.phone IS NOT NULL' : 'b.phone IS NULL');
  if (f.hasSocial !== undefined) {
    const has = '(b.facebook_url IS NOT NULL OR b.instagram_url IS NOT NULL OR b.other_socials IS NOT NULL)';
    where.push(f.hasSocial ? has : `NOT ${has}`);
  }
  if (f.minRating !== undefined) { where.push('b.rating >= ?'); params.push(f.minRating); }
  if (f.minReviews !== undefined) { where.push('b.review_count >= ?'); params.push(f.minReviews); }
  if (f.openOnly) where.push("(b.open_status IS NULL OR b.open_status = 'open')");
  if (f.source) {
    where.push('EXISTS (SELECT 1 FROM business_sources s WHERE s.business_id = b.id AND s.source = ?)');
    params.push(f.source);
  }
  if (f.verification) { where.push('b.verification_status = ?'); params.push(f.verification); }
  if (f.archived === 'exclude') where.push('b.archived_at IS NULL');
  if (f.archived === 'only') where.push('b.archived_at IS NOT NULL');

  return { joins: joins.join(' '), joinParams, where: where.join(' AND '), whereParams: params };
}
