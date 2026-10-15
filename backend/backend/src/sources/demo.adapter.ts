import { sleep } from './http';
import { resolveCategory } from './categories';
import { RawBusiness, SourceAdapter } from './types';

/**
 * Development-only sample data so the UI can be explored without API keys.
 * Records are obviously synthetic: .example domains, +94 77 000 xxxx numbers and a "Demo" source badge.
 * Disabled automatically when NODE_ENV=production.
 */
const PREFIX = ['Green', 'Royal', 'City', 'Lanka', 'Pearl', 'Sunrise', 'Lotus', 'Ceylon', 'Blue', 'Golden', 'Harbour', 'Hill'];
const SUFFIX: Record<string, string[]> = {
  bookshop: ['Book Corner', 'Books & More', 'Bookshop', 'Reading Room', 'Paper & Ink'],
  salon: ['Hair Studio', 'Beauty Salon', 'Cuts', 'Style Lounge'],
  restaurant: ['Kitchen', 'Grill', 'Eatery', 'Spice House'],
  default: ['Traders', 'Centre', 'Stores', 'Enterprises'],
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const hash = (s: string) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const demoAdapter: SourceAdapter = {
  id: 'demo',
  label: 'Demo data',
  description: 'Synthetic sample records for local development only. Never used in production.',
  compliance: {
    retentionDays: null,
    clearFieldsOnExpiry: [],
    attribution: 'Synthetic demo data',
    mapAttributionRequired: false,
    termsUrl: 'https://example.com',
    storeRawPayload: false,
    exportSourceRecordId: false,
    paid: false,
    notes: 'Generated locally. Not real businesses.',
  },
  isConfigured: () => true,

  async *search(q) {
    const area = q.location.split(',')[0].trim();
    const key = resolveCategory(q.category)?.key ?? 'default';
    const names = SUFFIX[key] ?? SUFFIX.default;
    const rand = rng(hash(`${q.category}|${q.location}`));
    const total = Math.min(q.limit, 60);
    for (let start = 0; start < total; start += 10) {
      await sleep(250);
      const items: RawBusiness[] = [];
      for (let i = start; i < Math.min(start + 10, total); i += 1) {
        const name = `${i % 3 === 0 ? area : PREFIX[Math.floor(rand() * PREFIX.length)]} ${names[Math.floor(rand() * names.length)]}`;
        const hasPhone = rand() > 0.2;
        const hasSite = rand() > 0.55;
        items.push({
          sourceRecordId: `demo-${slug(q.category)}-${slug(area)}-${i}`,
          name,
          category: resolveCategory(q.category)?.label ?? q.category,
          address: `${Math.floor(rand() * 180) + 1}, Main Street, ${area}`,
          phone: hasPhone ? `+94 77 000 ${String(1000 + Math.floor(rand() * 8999))}` : null,
          website: hasSite ? `https://www.${slug(name)}.example` : null,
          rating: rand() > 0.3 ? Math.round((3 + rand() * 2) * 10) / 10 : null,
          reviewCount: rand() > 0.3 ? Math.floor(rand() * 150) : null,
          openStatus: rand() > 0.9 ? 'temporarily_closed' : 'open',
        });
      }
      yield { items, requests: 1, estimatedCostUsd: 0, endpoint: 'demo.search' };
    }
  },
};
