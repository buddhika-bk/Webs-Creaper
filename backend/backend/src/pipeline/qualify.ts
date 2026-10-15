/**
 * Transparent, rule-based lead qualification. Every point of the score is explained by a named rule,
 * so users can always see WHY a lead scored the way it did. Not a hidden judgement.
 */
export interface QualifiableBusiness {
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  other_socials?: unknown;
  rating: number | null;
  review_count: number | null;
}

export interface QualificationRule {
  id: string;
  label: string;
  points: number;
  test: (b: QualifiableBusiness) => boolean;
}

const hasOtherSocial = (b: QualifiableBusiness) => Array.isArray(b.other_socials) && b.other_socials.length > 0;

export const RULES: QualificationRule[] = [
  { id: 'no_website', label: 'No website found', points: 40, test: (b) => !b.website },
  { id: 'no_social', label: 'No social media presence found', points: 20, test: (b) => !b.facebook_url && !b.instagram_url && !hasOtherSocial(b) },
  { id: 'has_phone', label: 'Phone number available for outreach', points: 20, test: (b) => !!b.phone },
  { id: 'established', label: 'Established (rating 4.0+ with 10+ reviews)', points: 10, test: (b) => (b.rating ?? 0) >= 4 && (b.review_count ?? 0) >= 10 },
  { id: 'has_address', label: 'Physical address known', points: 10, test: (b) => !!b.address },
];

export function qualify(b: QualifiableBusiness) {
  const matched = RULES.filter((r) => r.test(b));
  const score = Math.min(100, matched.reduce((s, r) => s + r.points, 0));
  return { score, reasons: matched.map((r) => ({ id: r.id, label: r.label, points: r.points })) };
}

export type Verification = 'verified' | 'likely' | 'unresolved';

/** verified = backed by an official source with contact + address, or by two independent sources. */
export function verificationStatus(b: Pick<QualifiableBusiness, 'name' | 'address' | 'phone'>, officialSources: number): Verification {
  if (officialSources >= 2 && b.phone) return 'verified';
  if (officialSources >= 1 && b.phone && b.address) return 'verified';
  if (b.name && (b.address || b.phone)) return 'likely';
  return 'unresolved';
}
