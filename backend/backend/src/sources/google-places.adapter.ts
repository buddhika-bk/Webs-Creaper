import { env } from '../config/env';
import { fetchJson } from './http';
import { RawBusiness, SourceAdapter, SourcePage } from './types';

/**
 * Official Google Maps Platform - Places API (New). No HTML/browser scraping.
 * Content is subject to Google's CURRENT terms (attribution, caching/storage). Review them before production.
 * Place IDs may be stored; other content is cleared when the retention window below expires.
 */
const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const SEARCH_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber',
  'places.internationalPhoneNumber', 'places.websiteUri', 'places.rating', 'places.userRatingCount',
  'places.businessStatus', 'places.googleMapsUri', 'places.primaryTypeDisplayName', 'nextPageToken',
].join(',');
const DETAILS_MASK = [
  'id', 'displayName', 'formattedAddress', 'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri',
  'rating', 'userRatingCount', 'businessStatus', 'googleMapsUri', 'primaryTypeDisplayName',
].join(',');

interface GPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text?: string };
}

const status = (s?: string): RawBusiness['openStatus'] =>
  s === 'OPERATIONAL' ? 'open' : s === 'CLOSED_TEMPORARILY' ? 'temporarily_closed' : s === 'CLOSED_PERMANENTLY' ? 'closed' : null;

const map = (p: GPlace): RawBusiness => ({
  sourceRecordId: p.id,
  name: p.displayName?.text ?? '',
  category: p.primaryTypeDisplayName?.text ?? null,
  address: p.formattedAddress ?? null,
  phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
  website: p.websiteUri ?? null,
  rating: p.rating ?? null,
  reviewCount: p.userRatingCount ?? null,
  openStatus: status(p.businessStatus),
  sourceUrl: p.googleMapsUri ?? null,
});

export const googlePlacesAdapter: SourceAdapter = {
  id: 'google_places',
  label: 'Google Places',
  description: 'Official Google Maps Platform Places API (New). Requires a server-side API key.',
  compliance: {
    retentionDays: env.GOOGLE_RETENTION_DAYS,
    clearFieldsOnExpiry: ['address', 'phone', 'website', 'rating', 'review_count'],
    attribution: 'Powered by Google',
    mapAttributionRequired: true,
    termsUrl: 'https://cloud.google.com/maps-platform/terms',
    storeRawPayload: false,
    exportSourceRecordId: true,
    paid: true,
    notes: 'Place IDs may be stored. Other Places content is refreshed or cleared after the retention window. Verify against current Google terms.',
  },
  isConfigured: () => Boolean(env.GOOGLE_MAPS_API_KEY),

  async *search(q, signal) {
    let token: string | undefined;
    let fetched = 0;
    do {
      const pageSize = Math.min(20, q.limit - fetched);
      const { data } = await fetchJson<{ places?: GPlace[]; nextPageToken?: string }>(
        ENDPOINT,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY, // server-side only
            'X-Goog-FieldMask': SEARCH_MASK, // request only the fields we use (field-level billing)
          },
          body: JSON.stringify({ textQuery: `${q.category} in ${q.location}`, regionCode: 'LK', languageCode: 'en', pageSize, ...(token ? { pageToken: token } : {}) }),
        },
        { signal },
      );
      const items = (data.places ?? []).map(map).filter((b) => b.sourceRecordId && b.name);
      fetched += items.length;
      token = data.nextPageToken;
      const page: SourcePage = { items, requests: 1, estimatedCostUsd: env.GOOGLE_SEARCH_COST_USD, endpoint: 'places.searchText' };
      yield page;
    } while (token && fetched < q.limit);
  },

  async refresh(id, signal) {
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) return { item: null, requests: 0, estimatedCostUsd: 0, endpoint: 'places.get' };
    try {
      const { data } = await fetchJson<GPlace>(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,
        { headers: { 'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': DETAILS_MASK } },
        { signal },
      );
      return { item: map(data), requests: 1, estimatedCostUsd: env.GOOGLE_SEARCH_COST_USD, endpoint: 'places.get' };
    } catch {
      return { item: null, requests: 1, estimatedCostUsd: 0, endpoint: 'places.get' };
    }
  },
};
