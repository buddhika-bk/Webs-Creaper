import { env } from '../config/env';
import { hmac, sha256 } from '../lib/crypto';
import { normalizeCategory } from '../sources/categories';
import { RawBusiness, SourceId } from '../sources/types';

const LEGAL_SUFFIX = new Set(['pvt', 'ltd', 'limited', 'private', 'plc', 'co', 'inc', 'llc']);

export function normalizeName(raw: string): { name: string; normalized: string } {
  const name = raw.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 255);
  let tokens = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIX.has(tokens[tokens.length - 1])) tokens = tokens.slice(0, -1);
  return { name, normalized: tokens.join(' ').slice(0, 255) };
}

export interface Phone {
  e164: string;
  display: string;
}

/** Normalises Sri Lankan numbers to E.164 (+94...) and a national display format. Foreign numbers are kept in E.164. */
export function normalizePhone(raw: string | null | undefined): Phone | null {
  if (!raw) return null;
  const first = raw.split(/[\/,;]|\s+or\s+/i)[0] ?? '';
  const hadPlus = first.trim().startsWith('+');
  let d = first.replace(/\D/g, '');
  if (!d) return null;
  const international = hadPlus || d.startsWith('00');
  if (d.startsWith('00')) d = d.slice(2);

  let national: string | null = null;
  if (d.startsWith('94') && d.length === 11) national = d.slice(2);
  else if (!international && d.startsWith('0') && d.length === 10) national = d.slice(1);
  else if (!international && d.length === 9) national = d;

  if (national) {
    if (!/^[1-9]\d{8}$/.test(national)) return null;
    return { e164: `+94${national}`, display: `0${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}` };
  }
  if (international && d.length >= 8 && d.length <= 15 && !d.startsWith('0')) return { e164: `+${d}`, display: `+${d}` };
  return null;
}

export const phoneHash = (e164: string) => hmac(env.PHONE_HASH_SECRET, e164);

const TRACKING = /^(utm_|fbclid|gclid|igshid|mc_|ref$|ref_)/i;

export interface NormUrl {
  url: string;
  host: string;
  domain: string;
}

export function normalizeUrl(raw: string | null | undefined): NormUrl | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s || s.length > 500) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.username = '';
  u.password = '';
  u.hash = '';
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host.length > 253) return null;
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  let out = u.toString();
  if (u.pathname === '/' && !u.search) out = `${u.protocol}//${u.host}`;
  else if (u.pathname.endsWith('/') && !u.search) out = out.replace(/\/$/, '');
  if (out.length > 500) return null;
  return { url: out, host, domain: host.replace(/^www\./, '') };
}

const SOCIAL_DOMAINS: [RegExp, string][] = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/, 'facebook'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(x|twitter)\.com$/, 'x'],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'youtube'],
];

export const classifySocial = (host: string): string | null => SOCIAL_DOMAINS.find(([re]) => re.test(host))?.[1] ?? null;

const FB_NON_PROFILE = new Set(['sharer', 'sharer.php', 'share', 'dialog', 'plugins', 'tr', 'login', 'policies', 'help', 'groups', 'events', 'watch', 'hashtag', 'photo', 'photo.php', 'permalink.php', 'story.php']);
const IG_NON_PROFILE = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'direct', 'about']);

/** Returns a canonical profile URL for a social platform, or null when the link is not a profile (share links, posts...). */
export function normalizeSocial(raw: string, platformHint?: string): { platform: string; url: string } | null {
  const n = normalizeUrl(raw);
  if (!n) return null;
  const platform = classifySocial(n.host) ?? null;
  if (!platform || (platformHint && platformHint !== platform)) return null;
  const u = new URL(n.url);
  const segs = u.pathname.split('/').filter(Boolean);
  if (!segs.length) return null;
  if (platform === 'facebook') {
    if (FB_NON_PROFILE.has(segs[0].toLowerCase())) return null;
    if (segs[0] === 'profile.php') {
      const id = u.searchParams.get('id');
      return id && /^\d+$/.test(id) ? { platform, url: `https://www.facebook.com/profile.php?id=${id}` } : null;
    }
    return { platform, url: `https://www.facebook.com/${segs[0]}` };
  }
  if (platform === 'instagram') {
    if (IG_NON_PROFILE.has(segs[0].toLowerCase())) return null;
    return { platform, url: `https://www.instagram.com/${segs[0]}` };
  }
  return { platform, url: `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, '')}` };
}

export function ensureCountry(location: string): string {
  const t = location.trim().replace(/\s+/g, ' ');
  return /sri\s*lanka/i.test(t) ? t : `${t}, Sri Lanka`;
}

export function parseArea(location: string): { display: string; normalized: string } {
  const first = location.split(',')[0]?.trim() ?? location.trim();
  const display = first.replace(/\s+/g, ' ').slice(0, 160);
  return { display, normalized: display.normalize('NFKC').toLowerCase() };
}

export function normalizeAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = raw.normalize('NFKC').toLowerCase().replace(/sri\s*lanka/g, ' ').replace(/\b\d{5}\b/g, ' ').replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return n ? n.slice(0, 255) : null;
}

/** Deterministic composite fingerprint. Without a phone number the address is included, so branches are never merged on name alone. */
export function makeFingerprint(p: { normName: string; phoneE164: string | null; normCity: string | null; normAddress: string | null }): string {
  return sha256([p.normName, p.phoneE164 ?? '', p.normCity ?? '', p.phoneE164 ? '' : p.normAddress ?? ''].join('|'));
}

/** Token similarity used ONLY to flag possible duplicates for human review. Never used to merge automatically. */
export function similarity(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach((t) => tb.has(t) && (inter += 1));
  return inter / (ta.size + tb.size - inter);
}

export interface NormalizedBusiness {
  name: string;
  normalizedName: string;
  category: string;
  normalizedCategory: string;
  address: string | null;
  normalizedAddress: string | null;
  cityArea: string | null;
  normalizedCity: string | null;
  phone: string | null;
  phoneE164: string | null;
  phoneHash: string | null;
  website: string | null;
  websiteDomain: string | null;
  socials: { platform: string; url: string; confidence: number }[];
  rating: number | null;
  reviewCount: number | null;
  openStatus: string | null;
  fingerprint: string;
  qualityFlags: { type: string; detail: string }[];
  source: { id: SourceId; recordId: string; url: string | null; raw: unknown };
}

export function normalizeRaw(raw: RawBusiness, ctx: { category: string; location: string }, sourceId: SourceId): NormalizedBusiness | null {
  if (!raw.name?.trim() || !raw.sourceRecordId) return null;
  const { name, normalized } = normalizeName(raw.name);
  if (!normalized) return null;

  const cat = normalizeCategory(ctx.category);
  const area = parseArea(raw.cityArea ?? ctx.location);
  const phone = normalizePhone(raw.phone);

  const socials: NormalizedBusiness['socials'] = [];
  let website: NormUrl | null = normalizeUrl(raw.website);
  if (website) {
    const asSocial = classifySocial(website.host);
    if (asSocial) {
      const s = normalizeSocial(website.url);
      if (s) socials.push({ ...s, confidence: 0.7 });
      website = null; // a social page is not the business's own website
    }
  }
  for (const s of raw.socials ?? []) {
    const n = normalizeSocial(s.url, s.platform);
    if (n && !socials.some((x) => x.url === n.url)) socials.push({ ...n, confidence: 0.7 });
  }

  const rating = typeof raw.rating === 'number' && raw.rating >= 0 && raw.rating <= 5 ? Math.round(raw.rating * 10) / 10 : null;
  const reviewCount = typeof raw.reviewCount === 'number' && raw.reviewCount >= 0 ? Math.floor(raw.reviewCount) : null;
  const address = raw.address?.replace(/\s+/g, ' ').trim().slice(0, 500) || null;
  const normAddress = normalizeAddress(address);

  const qualityFlags: NormalizedBusiness['qualityFlags'] = [];
  if (raw.phone && !phone) qualityFlags.push({ type: 'phone_format', detail: 'Phone number could not be normalised' });
  if (raw.website && !website && !socials.length) qualityFlags.push({ type: 'url_format', detail: 'Website address looks invalid' });

  return {
    name,
    normalizedName: normalized,
    category: cat.label,
    normalizedCategory: cat.key,
    address,
    normalizedAddress: normAddress,
    cityArea: area.display || null,
    normalizedCity: area.normalized || null,
    phone: phone?.display ?? null,
    phoneE164: phone?.e164 ?? null,
    phoneHash: phone ? phoneHash(phone.e164) : null,
    website: website?.url ?? null,
    websiteDomain: website?.domain ?? null,
    socials,
    rating,
    reviewCount,
    openStatus: raw.openStatus ?? null,
    qualityFlags,
    fingerprint: makeFingerprint({ normName: normalized, phoneE164: phone?.e164 ?? null, normCity: area.normalized || null, normAddress }),
    source: { id: sourceId, recordId: raw.sourceRecordId.slice(0, 255), url: raw.sourceUrl?.slice(0, 1000) ?? null, raw: raw.raw },
  };
}
