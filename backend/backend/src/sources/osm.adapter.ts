import { env } from '../config/env';
import { fetchJson, sleep } from './http';
import { CATEGORIES, resolveCategory } from './categories';
import { RawBusiness, SourceAdapter } from './types';

/**
 * OpenStreetMap via Nominatim (geocoding) + Overpass (features). Open data under the ODbL licence:
 * attribution "© OpenStreetMap contributors" is required. Public instances are shared infrastructure:
 * we send an identifying User-Agent, make few requests and wait between calls.
 */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const headers = () => ({ 'User-Agent': `WebPointLeadPlatform/1.0 (${env.OSM_CONTACT})`, Accept: 'application/json' });

interface NominatimHit { boundingbox: [string, string, string, string]; display_name: string }
interface OverpassEl { type: 'node' | 'way' | 'relation'; id: number; tags?: Record<string, string> }

const esc = (s: string) => s.replace(/[\\"]/g, '').slice(0, 60);

function selectors(category: string): string[] {
  const def = resolveCategory(category);
  if (def) return def.osm.map((t) => {
    const [k, v] = t.split('=');
    return `["${k}"="${v}"]`;
  });
  return [`["name"~"${esc(category)}",i]`];
}

function address(t: Record<string, string>): string | null {
  const parts = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'] ?? t['addr:neighbourhood'], t['addr:city'], t['addr:postcode']].filter(Boolean);
  return parts.length ? parts.join(', ') : t['addr:full'] ?? null;
}

function toRaw(el: OverpassEl, categoryLabel: string): RawBusiness | null {
  const t = el.tags ?? {};
  if (!t.name) return null;
  const socials = [
    t['contact:facebook'] ?? t.facebook,
    t['contact:instagram'] ?? t.instagram,
  ].filter(Boolean).map((url) => ({ url: String(url) }));
  return {
    sourceRecordId: `${el.type}/${el.id}`,
    name: t.name,
    category: categoryLabel,
    address: address(t),
    phone: t.phone ?? t['contact:phone'] ?? t['contact:mobile'] ?? null,
    website: t.website ?? t['contact:website'] ?? null,
    socials,
    openStatus: null,
    sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
  };
}

export const osmAdapter: SourceAdapter = {
  id: 'osm',
  label: 'OpenStreetMap',
  description: 'Open map data (ODbL). Free, community maintained; coverage and contact details vary by area.',
  compliance: {
    retentionDays: null,
    clearFieldsOnExpiry: [],
    attribution: '© OpenStreetMap contributors (ODbL)',
    mapAttributionRequired: false,
    termsUrl: 'https://www.openstreetmap.org/copyright',
    storeRawPayload: false,
    exportSourceRecordId: true,
    paid: false,
    notes: 'Share-alike licence applies to derived databases. Keep the attribution with exports. Do not hammer the public Overpass/Nominatim servers.',
  },
  isConfigured: () => true,

  async *search(q, signal) {
    const geo = await fetchJson<NominatimHit[]>(`${NOMINATIM}?format=jsonv2&limit=1&countrycodes=lk&q=${encodeURIComponent(q.location)}`, { headers: headers() }, { signal });
    yield { items: [], requests: 1, estimatedCostUsd: 0, endpoint: 'nominatim.search' };
    const hit = geo.data[0];
    if (!hit) return;
    const [south, north, west, east] = hit.boundingbox.map(Number);
    if ([south, north, west, east].some((n) => Number.isNaN(n))) return;
    await sleep(1100); // Nominatim usage policy: max 1 request per second

    const bbox = `${south},${west},${north},${east}`;
    const sel = selectors(q.category);
    const body = `[out:json][timeout:25];(${sel.map((s) => `nwr${s}(${bbox});`).join('')});out tags ${Math.min(q.limit * 2, 1000)};`;
    const { data } = await fetchJson<{ elements: OverpassEl[] }>(
      OVERPASS,
      { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(body)}` },
      { signal, timeoutMs: 40_000 },
    );
    const label = resolveCategory(q.category)?.label ?? q.category;
    const items = data.elements.map((e) => toRaw(e, label)).filter((b): b is RawBusiness => b !== null).slice(0, q.limit);
    for (let i = 0; i < items.length; i += 25) {
      yield { items: items.slice(i, i + 25), requests: i === 0 ? 1 : 0, estimatedCostUsd: 0, endpoint: 'overpass.interpreter' };
    }
  },
};

export const knownOsmCategories = CATEGORIES.map((c) => c.label);
