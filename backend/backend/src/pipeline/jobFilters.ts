import { z } from 'zod';

const tri = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === true || v === 'true'));

/** Tri-state: true = must have, false = must NOT have, undefined = don't care. */
export const jobFiltersSchema = z
  .object({
    hasPhone: tri,
    hasWebsite: tri,
    hasSocial: tri,
    minRating: z.coerce.number().min(0).max(5).optional(),
    minReviews: z.coerce.number().int().min(0).optional(),
    openOnly: z.boolean().optional(),
  })
  .strip();

export type JobFilters = z.infer<typeof jobFiltersSchema>;

interface FilterRow {
  phone: string | null;
  website: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  other_socials: unknown;
  rating: number | null;
  review_count: number | null;
  open_status: string | null;
}

export function matchesJobFilters(b: FilterRow, f: JobFilters): boolean {
  const hasSocial = !!b.facebook_url || !!b.instagram_url || (Array.isArray(b.other_socials) && b.other_socials.length > 0);
  if (f.hasPhone !== undefined && !!b.phone !== f.hasPhone) return false;
  if (f.hasWebsite !== undefined && !!b.website !== f.hasWebsite) return false;
  if (f.hasSocial !== undefined && hasSocial !== f.hasSocial) return false;
  if (f.minRating !== undefined && (b.rating ?? 0) < f.minRating) return false;
  if (f.minReviews !== undefined && (b.review_count ?? 0) < f.minReviews) return false;
  if (f.openOnly && b.open_status && b.open_status !== 'open') return false;
  return true;
}
