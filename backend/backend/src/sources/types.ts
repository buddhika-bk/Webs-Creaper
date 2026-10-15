export type SourceId = 'google_places' | 'osm' | 'demo';
export type ClearableField = 'address' | 'phone' | 'website' | 'rating' | 'review_count';

/** Every source integration declares its own compliance, retention and attribution rules. */
export interface SourceCompliance {
  /** null = no source-imposed retention limit. 0 = keep identifiers only. */
  retentionDays: number | null;
  /** Business fields that are cleared from the canonical record when source content expires. */
  clearFieldsOnExpiry: ClearableField[];
  attribution: string;
  mapAttributionRequired: boolean;
  termsUrl: string;
  storeRawPayload: boolean;
  exportSourceRecordId: boolean;
  paid: boolean;
  notes: string;
}

export interface SourceQuery {
  category: string;
  /** Always includes the country, e.g. "Malabe, Sri Lanka". */
  location: string;
  limit: number;
}

export interface RawBusiness {
  sourceRecordId: string;
  name: string;
  category?: string | null;
  address?: string | null;
  cityArea?: string | null;
  phone?: string | null;
  website?: string | null;
  socials?: { platform?: string; url: string }[];
  rating?: number | null;
  reviewCount?: number | null;
  openStatus?: 'open' | 'temporarily_closed' | 'closed' | null;
  sourceUrl?: string | null;
  raw?: unknown;
}

export interface SourcePage {
  items: RawBusiness[];
  requests: number;
  estimatedCostUsd: number;
  endpoint: string;
}

export interface SourceAdapter {
  id: SourceId;
  label: string;
  description: string;
  compliance: SourceCompliance;
  isConfigured(): boolean;
  /** Yields pages so the pipeline can normalise and de-duplicate incrementally. */
  search(q: SourceQuery, signal?: AbortSignal): AsyncGenerator<SourcePage>;
  /** Optional: re-fetch a single record by its source id (used by "Re-check"). */
  refresh?(sourceRecordId: string, signal?: AbortSignal): Promise<{ item: RawBusiness | null; requests: number; estimatedCostUsd: number; endpoint: string }>;
}
