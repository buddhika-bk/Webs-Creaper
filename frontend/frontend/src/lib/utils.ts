import clsx, { ClassValue } from 'clsx';
import { ApiError } from './api';

export const cn = (...v: ClassValue[]) => clsx(v);

export const errorMessage = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong');

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'Not available';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const fullDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not available';

export const formatBytes = (n: number | null) => (n === null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export const formatNumber = (n: number) => new Intl.NumberFormat().format(n);

export const hostOf = (url: string) => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; } };

/** Only http(s) links are ever rendered as clickable. */
export const safeHref = (url: string | null | undefined) => (url && /^https?:\/\//i.test(url) ? url : undefined);

export const SOURCE_LABELS: Record<string, string> = { google_places: 'Google', osm: 'OpenStreetMap', demo: 'Demo', website: 'Website' };
export const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;

export const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED'];

export const CATEGORY_SUGGESTIONS = ['Bookshop', 'Salon', 'Restaurant', 'Cafe', 'Hotel', 'School', 'Pharmacy', 'Garage', 'Supermarket', 'Clothing store', 'Electronics store', 'Gym', 'Clinic', 'Bakery'];
export const LOCATION_SUGGESTIONS = ['Malabe', 'Colombo 03', 'Colombo 07', 'Nugegoda', 'Dehiwala', 'Kandy', 'Galle', 'Negombo', 'Jaffna', 'Kurunegala', 'Battaramulla', 'Maharagama'];
