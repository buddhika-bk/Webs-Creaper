import { ReactNode, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, ClipboardList, Download, Eye, Facebook, Globe, Instagram, RefreshCw, Search, Star, Tag as TagIcon, Trash2, X } from 'lucide-react';
import { api, newKey } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { SOURCE_LABELS } from '../../lib/constants';
import { useToast } from '../../lib/toast';
import { Business, BusinessQuery, Paged } from '../../lib/types';
import { cn, hostOf, safeHref, timeAgo } from '../../lib/utils';
import { Badge, Button, Checkbox, EmptyState, ErrorState, Pagination, Skeleton } from '../ui';
import { BusinessDrawer } from './BusinessDrawer';
import { ListPickerModal, TagModal } from './Pickers';

type Tri = '' | 'yes' | 'no';
const triVal = (v: Tri): boolean | undefined => (v === '' ? undefined : v === 'yes');

interface Props {
  base: { jobId?: string; listId?: string };
  live?: boolean;
  defaultSort?: string;
  empty?: ReactNode;
}

const SORT_OPTIONS = [
  { v: 'score:desc', l: 'Best leads first' }, { v: 'name:asc', l: 'Name A to Z' }, { v: 'rating:desc', l: 'Highest rated' },
  { v: 'reviews:desc', l: 'Most reviews' }, { v: 'checked:desc', l: 'Recently checked' }, { v: 'created:desc', l: 'Newest' },
];

export function LeadsTable({ base, live, defaultSort = 'score:desc', empty }: Props) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(defaultSort);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [phone, setPhone] = useState<Tri>('');
  const [website, setWebsite] = useState<Tri>('');
  const [social, setSocial] = useState<Tri>('');
  const [source, setSource] = useState('');
  const [verification, setVerification] = useState('');
  const [archived, setArchived] = useState<'exclude' | 'only'>('exclude');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [listModal, setListModal] = useState(false);
  const [tagModal, setTagModal] = useState(false);

  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [base.jobId, base.listId, phone, website, social, source, verification, archived, sort]);

  const [sortKey, dir] = sort.split(':') as [string, 'asc' | 'desc'];
  const filter = useMemo(() => ({
    ...base, q: q || undefined, hasPhone: triVal(phone), hasWebsite: triVal(website), hasSocial: triVal(social),
    source: source || undefined, verification: verification || undefined, archived, matchedOnly: base.jobId ? true : undefined,
  }), [base, q, phone, website, social, source, verification, archived]);
  const query: BusinessQuery = { ...filter, page, pageSize: 25, sort: sortKey, dir };

  const list = useQuery({
    queryKey: ['businesses', query],
    queryFn: () => api<Paged<Business>>('/businesses', { query: query as unknown as Record<string, unknown> }),
    placeholderData: keepPreviousData,
    refetchInterval: live ? 3000 : false,
  });
  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const writable = can('business:write');
  const filtersActive = !!(q || phone || website || social || source || verification || archived !== 'exclude');

  const toggleAll = (v: boolean) => setSelected((s) => { const n = new Set(s); rows.forEach((r) => (v ? n.add(r.id) : n.delete(r.id))); return n; });
  const toggle = (id: string, v: boolean) => setSelected((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['businesses'] }); void qc.invalidateQueries({ queryKey: ['lists'] }); };
  const bulk = useMutation({
    mutationFn: (b: { action: string; listId?: string; tagId?: string; tagName?: string }) => api<{ affected: number }>('/businesses/bulk-action', { method: 'POST', body: { ...b, ids: [...selected] } }),
    onSuccess: (r, v) => {
      const msg: Record<string, string> = { add_to_list: 'Added to list', remove_from_list: 'Removed from list', tag: 'Tag applied', untag: 'Tag removed', archive: 'Archived', unarchive: 'Restored', recheck: 'Re-check started. Results update shortly.' };
      toast.push('success', `${msg[v.action]} (${r.affected})`);
      setSelected(new Set()); setListModal(false); setTagModal(false); refresh();
    },
    onError: (e: Error) => toast.push('error', e.message),
  });
  const exporter = useMutation({
    mutationFn: (selection: unknown) => api('/exports', { method: 'POST', body: { selection }, idempotencyKey: newKey() }),
    onSuccess: () => { toast.push('success', 'Export started. It will appear on the Exports page when ready.'); nav('/exports'); },
    onError: (e: Error) => toast.push('error', e.message),
  });
  const exportSelected = () => exporter.mutate({ mode: 'ids', ids: [...selected] });
  const exportAll = () => exporter.mutate({ mode: 'filter', filter });

  const sel = selected.size;
  const chips: [string, Tri, (v: Tri) => void, string, string][] = [['Phone', phone, setPhone, 'Has phone', 'No phone'], ['Website', website, setWebsite, 'Has website', 'No website'], ['Social', social, setSocial, 'Has social', 'No social']];

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 md:p-4">
        <div className="relative min-w-[200px] flex-1 md:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input aria-label="Search results" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, address or phone" className="field h-10 pl-9" />
        </div>
        {chips.map(([label, val, set, yes, no]) => (
          <select key={label} aria-label={label} value={val} onChange={(e) => set(e.target.value as Tri)} className={cn('field h-10 w-auto pr-8', val && 'border-brand bg-brand-soft font-medium text-brand')}>
            <option value="">{label}: any</option><option value="yes">{yes}</option><option value="no">{no}</option>
          </select>
        ))}
        <select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)} className="field h-10 w-auto pr-8">
          <option value="">Source: all</option>{Object.entries(SOURCE_LABELS).filter(([k]) => k !== 'website').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select aria-label="Verification" value={verification} onChange={(e) => setVerification(e.target.value)} className="field h-10 w-auto pr-8">
          <option value="">Status: all</option><option value="verified">Verified</option><option value="likely">Likely</option><option value="unresolved">Unresolved</option>
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className="field h-10 w-auto pr-8">{SORT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
        <button onClick={() => setArchived(archived === 'only' ? 'exclude' : 'only')} aria-pressed={archived === 'only'} className={cn('h-10 rounded-xl border px-3 text-sm font-medium', archived === 'only' ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:bg-sunken')}>Archived</button>
        {filtersActive && <button onClick={() => { setSearch(''); setPhone(''); setWebsite(''); setSocial(''); setSource(''); setVerification(''); setArchived('exclude'); }} className="inline-flex h-10 items-center gap-1 px-2 text-sm text-muted hover:text-ink"><X className="h-4 w-4" />Clear</button>}
        <div className="ml-auto">
          {can('export:create') && <Button variant="outline" size="sm" disabled={total === 0} loading={exporter.isPending} onClick={exportAll}><Download className="h-4 w-4" aria-hidden />Export all {total.toLocaleString('en-US')} to Excel</Button>}
        </div>
      </div>

      {sel > 0 && (
        <div role="toolbar" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-soft px-4 py-2.5">
          <span className="mr-2 text-sm font-semibold text-brand">{sel} selected</span>
          {can('export:create') && <Button size="sm" variant="accent" onClick={exportSelected} loading={exporter.isPending}><Download className="h-4 w-4" aria-hidden />Export Excel</Button>}
          {writable && <>
            <Button size="sm" variant="outline" onClick={() => setListModal(true)}><ClipboardList className="h-4 w-4" aria-hidden />Add to list</Button>
            <Button size="sm" variant="outline" onClick={() => setTagModal(true)}><TagIcon className="h-4 w-4" aria-hidden />Tag</Button>
            {archived === 'only' ? <Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: 'unarchive' })}><ArchiveRestore className="h-4 w-4" aria-hidden />Restore</Button> : <Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: 'archive' })}><Archive className="h-4 w-4" aria-hidden />Archive</Button>}
            <Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: 'recheck' })}><RefreshCw className="h-4 w-4" aria-hidden />Re-check</Button>
            {base.listId && <Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: 'remove_from_list', listId: base.listId })}><Trash2 className="h-4 w-4" aria-hidden />Remove from list</Button>}
          </>}
          <button className="ml-auto text-sm text-brand underline-offset-4 hover:underline" onClick={() => setSelected(new Set())}>Clear selection</button>
        </div>
      )}

      {list.isError ? <ErrorState message={(list.error as Error).message} onRetry={() => void list.refetch()} /> : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-[14px]">
            <thead className="sticky top-0 bg-sunken/70 text-xs font-semibold text-muted">
              <tr>
                <th className="w-10 px-4 py-3"><Checkbox label="Select all on this page" checked={allOnPage} indeterminate={sel > 0} onChange={toggleAll} /></th>
                <th className="px-3 py-3">Business</th><th className="px-3 py-3">Location</th><th className="px-3 py-3">Phone</th><th className="px-3 py-3">Website</th>
                <th className="px-3 py-3">Social</th><th className="px-3 py-3">Rating</th><th className="px-3 py-3">Source</th><th className="px-3 py-3">Last checked</th><th className="w-12 px-3 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.isLoading && Array.from({ length: 8 }).map((_, i) => <tr key={i}><td colSpan={10} className="px-4 py-3"><Skeleton className="h-9" /></td></tr>)}
              {rows.map((b) => (
                <tr key={b.id} className={cn('group hover:bg-sunken/60', selected.has(b.id) && 'bg-brand-soft/60')}>
                  <td className="px-4 py-3"><Checkbox label={`Select ${b.name}`} checked={selected.has(b.id)} onChange={(v) => toggle(b.id, v)} /></td>
                  <td className="max-w-[280px] px-3 py-3">
                    <button onClick={() => setOpenId(b.id)} className="block max-w-full truncate text-left font-semibold hover:text-brand hover:underline">{b.name}</button>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <span>{b.category}</span>
                      {b.leadScore >= 70 && <Badge tone="accent">Strong lead</Badge>}
                      {b.reviewFlags.some((f) => f.type === 'possible_duplicate') && <Badge tone="warn">Possible duplicate</Badge>}
                      {b.tags.slice(0, 2).map((t) => <Badge key={t.id}>{t.name}</Badge>)}
                    </div>
                  </td>
                  <td className="max-w-[220px] px-3 py-3 text-muted"><span className="line-clamp-2">{b.address ?? b.cityArea ?? <NA />}</span></td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums">{b.phone ?? <NA />}</td>
                  <td className="max-w-[180px] px-3 py-3">{b.website && safeHref(b.website) ? <a href={safeHref(b.website)} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1.5 text-brand hover:underline"><Globe className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{hostOf(b.website)}</span></a> : <NA />}</td>
                  <td className="px-3 py-3"><Socials b={b} /></td>
                  <td className="whitespace-nowrap px-3 py-3">{b.rating !== null ? <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-accent text-accent" aria-hidden /><span className="font-medium tabular-nums">{b.rating.toFixed(1)}</span><span className="text-muted">({b.reviewCount ?? 0})</span></span> : <NA />}</td>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{b.sources.map((s) => <Badge key={s} tone={s === 'demo' ? 'warn' : 'neutral'}>{SOURCE_LABELS[s] ?? s}</Badge>)}</div></td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">{timeAgo(b.lastCheckedAt)}</td>
                  <td className="px-3 py-3"><button aria-label={`View details for ${b.name}`} onClick={() => setOpenId(b.id)} className="rounded-lg p-1.5 text-muted hover:bg-line hover:text-ink"><Eye className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.isLoading && rows.length === 0 && (empty && !filtersActive ? empty : <EmptyState icon={<Search className="h-6 w-6" />} title={filtersActive ? 'No businesses match these filters' : 'No businesses yet'} body={filtersActive ? 'Try removing a filter or searching for something else.' : 'Run a search to see businesses here.'} />)}
        </div>
      )}

      {total > 0 && <Pagination page={page} totalPages={list.data?.totalPages ?? 1} total={total} pageSize={25} onPage={setPage} />}

      <BusinessDrawer id={openId} onClose={() => setOpenId(null)} />
      <ListPickerModal open={listModal} onClose={() => setListModal(false)} count={sel} onPick={(listId) => bulk.mutate({ action: 'add_to_list', listId })} />
      <TagModal open={tagModal} onClose={() => setTagModal(false)} count={sel} onPick={(t) => bulk.mutate({ action: 'tag', ...t })} />
    </div>
  );
}

const NA = () => <span className="text-muted/80">Not available</span>;

function Socials({ b }: { b: Business }) {
  const items = [
    b.facebookUrl && { url: b.facebookUrl, label: 'Facebook', Icon: Facebook },
    b.instagramUrl && { url: b.instagramUrl, label: 'Instagram', Icon: Instagram },
  ].filter(Boolean) as { url: string; label: string; Icon: typeof Facebook }[];
  if (!items.length && !b.otherSocials.length) return <NA />;
  return (
    <div className="flex items-center gap-1.5">
      {items.map(({ url, label, Icon }) => safeHref(url) && <a key={label} href={safeHref(url)} target="_blank" rel="noopener noreferrer nofollow" aria-label={label} className="grid h-7 w-7 place-items-center rounded-lg bg-sunken text-muted hover:bg-brand-soft hover:text-brand"><Icon className="h-3.5 w-3.5" /></a>)}
      {b.otherSocials.length > 0 && <span className="text-xs text-muted">+{b.otherSocials.length}</span>}
    </div>
  );
}
