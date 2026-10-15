export type Role = 'owner' | 'admin' | 'analyst' | 'viewer';
export type Verification = 'verified' | 'likely' | 'unresolved';
export type JobStatus =
  | 'QUEUED' | 'RUNNING' | 'COLLECTING' | 'NORMALIZING' | 'DEDUPLICATING' | 'ENRICHING'
  | 'COMPLETED' | 'RETRYING' | 'FAILED' | 'CANCEL_REQUESTED' | 'CANCELLED';

export interface User {
  id: string; email: string; name: string; role: Role; workspaceId: string; permissions: string[];
}

export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number; totalPages: number }

export interface Tag { id: string; name: string; color: string; count?: number }

export interface Business {
  id: string;
  name: string;
  category: string;
  address: string | null;
  cityArea: string | null;
  phone: string | null;
  website: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  otherSocials: { platform: string; url: string }[];
  rating: number | null;
  reviewCount: number | null;
  openStatus: string | null;
  verificationStatus: Verification;
  leadScore: number;
  qualification: { id: string; label: string; points: number }[];
  reviewFlags: { type: string; detail?: string; businessIds?: string[] }[];
  notes: string | null;
  archived: boolean;
  sources: string[];
  tags: Tag[];
  lastCheckedAt: string;
  createdAt: string;
}

export interface BusinessDetail extends Business {
  sourceRecords: { source: string; label: string; recordId: string | null; url: string | null; attribution: string | null; retrievedAt: string; expiresAt: string | null; state: string }[];
  socialLinks: { platform: string; url: string; source: string; evidenceUrl: string | null; confidence: number; aiGenerated: boolean }[];
  contacts: { kind: string; value: string; primary: boolean; source: string }[];
  lists: { id: string; name: string }[];
  aiAnnotations: { field: string; value: string; model: string; promptVersion: string; confidence: number | null; createdAt: string }[];
}

export interface JobFilters {
  hasPhone?: boolean; hasWebsite?: boolean; hasSocial?: boolean; minRating?: number; minReviews?: number; openOnly?: boolean;
}

export interface JobMetrics {
  sourceRequests: number; rawResults: number; acceptedRecords: number; newRecords: number; duplicates: number; invalidRecords: number;
  enrichmentAttempts: number; enrichmentSucceeded: number; completedRecords: number; matchedRecords: number; estimatedCostUsd: number; elapsedMs: number;
}

export interface SearchJob {
  id: string; category: string; location: string; source: string; limit: number; enrich: boolean;
  filters: JobFilters; status: JobStatus; metrics: JobMetrics; error: string | null;
  startedAt: string | null; completedAt: string | null; createdAt: string; createdBy?: string;
}

export interface SourceInfo {
  id: string; label: string; description: string; configured: boolean; enabled: boolean; paid: boolean;
  retentionDays: number | null; attribution: string; mapAttributionRequired: boolean; termsUrl: string; notes: string;
  usage30d: { requests: number; estimatedCostUsd: number };
}

export interface LeadList { id: string; name: string; description: string | null; count: number; createdAt: string; updatedAt: string }

export interface ExportItem {
  id: string; status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'EXPIRED'; progress: number; rowCount: number;
  fileName: string | null; fileSize: number | null; error: string | null; expiresAt: string | null; completedAt: string | null; createdAt: string; createdBy?: string;
}

export interface AuditItem {
  id: number; action: string; entityType: string | null; entityId: string | null; ip: string | null;
  metadata: Record<string, unknown> | null; createdAt: string; user: { name: string; email: string } | null;
}

export interface TeamUser { id: string; email: string; name: string; role: Role; isActive: boolean; lastLoginAt: string | null; createdAt: string }

export interface Dashboard {
  totals: { businesses: number; withoutWebsite: number; withoutSocial: number; withPhone: number; verified: number; lists: number; exports: number };
  quotas: { dailySearches: number; dailyExports: number; monthlyApiBudgetUsd: number; maxResultsPerSearch: number };
  usage: { searchesToday: number; exportsToday: number; monthCostUsd: number; monthRequests: number };
  recentSearches: SearchJob[];
}

export interface AdminOverview {
  searchVolume: { day: string; searches: number }[];
  jobs: { total: number; failed: number; completed: number; avgDurationSeconds: number | null; duplicateRate: number };
  sources: { source: string; requests: number; estimatedCostUsd: number; errors: number }[];
  recentFailures: { id: string; category: string; location: string; source: string; error_message: string | null; created_at: string }[];
  exports: { count: number; rows: number };
}

export interface WorkspaceInfo {
  id: string; name: string;
  quotas: { maxResultsPerSearch: number; dailySearches: number; dailyExports: number; monthlyApiBudgetUsd: number };
  usage: { searchesToday: number; exportsToday: number; monthCostUsd: number; monthRequests: number };
}

export interface ParsedSearch {
  aiGenerated: true; provider: string; model: string; promptVersion: string; confidence: number; evidence: string[];
  query: { category: string | null; location: string | null; filters: JobFilters };
}

export interface BusinessQuery {
  q?: string; jobId?: string; listId?: string; tagId?: string; category?: string; location?: string;
  hasWebsite?: boolean; hasPhone?: boolean; hasSocial?: boolean; minRating?: number; source?: string;
  verification?: Verification; archived?: 'exclude' | 'only' | 'include'; sort?: string; dir?: 'asc' | 'desc'; page?: number; pageSize?: number;
}
