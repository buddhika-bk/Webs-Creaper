import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowDown, ArrowUp, ClipboardPlus, Download, Eye, Facebook, Globe, Instagram, Link2, Linkedin, RefreshCw, Search, Star, Tag, Youtube, X } from 'lucide-react';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, newIdempotencyKey } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { Business, BusinessQuery, LeadList, Paged, SourceInfo, Tag as TagT } from '../../lib/types';
import { cn, errorMessage, safeHref, sourceLabel, timeAgo, hostOf } from '../../lib/utils';
import { Badge, Button, Checkbox, EmptyState, Input, Modal, Pagination, Select, Skeleton } from '../ui';
import { BusinessDrawer } from './BusinessDrawer';
import { ScorePill, VerificationBadge } from './parts';

const SOCIAL_ICON: Record<string, ReactNode> = {
  facebook: <Facebook className="h-4 w-4" />, instagram: <Instagram className="h-4 w-4" />, linkedin: <Linkedin className="h-4 w-4" />, youtube: <Youtube className="h-4 w-4" />,
};

const NA = <span className="text-muted/70">Not available</span>;

function SocialCell({ b }: { b: Business }) {
  const links = [
    ...(b.facebookUrl ? [{ platform: 'facebook', url: b.facebookUrl }] : []),
    ...(b.instagramUrl ? [{ platform: 'instagram', url: b.instagramUrl }] : []),
    ...b.otherSocials,
  ];
  if (!links.length) return NA;
  return (
    <div className="flex items-center gap-1.5">
      {links.map((l) => (
        <a key={l.url} href={safeHref(l.url)} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()} aria-label={`${l.platform} profile`} title={hostOf(l.url)}
          className="grid h-7 w-7 place-items-center rounded-lg bg-sunken text-muted hover:bg-brand-soft hover:text-brand">{SOCIAL_ICON[l.platform] ?? <Link2 className="h-4 w-4" />}</a>
      ))}
    </div>
  );
}

interface Props {
  base: BusinessQuery;
  /** Poll for new rows while a search is still running. */
  live?: boolean;
  empty: ReactNode;
  title?: string;
  listId?: string;
}

type Tri = 'any' | 'yes' | 'no';
const tri = (v: Tri) => (v === 'any' ? undefined : v === 'yes');

export function LeadsExplorer({ base, live, empty, title = 'Results', listId }: Props) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [web, setWeb] = useState<Tri>('any');
  const [phone, setPhone] = useState<Tri>('any');
  const [social, setSocial] = useState<Tri>('any');
  const [source, setSource] = useState('');
  const [verification, setVerification] = useState('');
  const [archived, setArchived] = useState<'exclude' | 'only'>('exclude');
  const [sort, setSort] = useState('score');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [modal, setModal] = useState<'list' | 'tag' | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const baseKey = JSON.stringify(base);
  useEffect(() => { setPage(1); setSelected(new Set()); setAllMatching(false); }, [debounced, web, phone, social, source, verification, archived, sort, dir, baseKey]);

  const query: BusinessQuery = useMemo(() => ({
    ...base, q: debounced || undefined, hasWebsite: tri(web), hasPhone: tri(phone), hasSocial: tri(social),
    source: source || undefined, verification: (verification || undefined) as BusinessQuery['verification'], archived, sort, dir, page, pageSize: 25,
  }), [base, debounced, web, phone, social, source, verification, archived, sort, dir, page]);

  const sources = useQuery({ queryKey: ['sources'], queryFn: () => api<{ items: SourceInfo[] }>('/sources') });
  const results = useQuery({
    queryKey: ['businesses', query],
    queryFn: () => api<Paged<Business>>('/businesses', { query: query as Record<string, unknown> }),
    placeholderData: keepPreviousData,
    refetchInterval: live ? 2500 : false,
  });

  const rows = results.data?.items ?? [];
  const total = results.data?.total ?? 0;
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selCount = allMatching ? total : selected.size;
  const filtered = !!(debounced || web !== 'any' || phone !== 'any' || social !== 'any' || source || verification || archived === 'only');
  const google = rows.some((r) => r.sources.includes('google_places'));

  const toggleAll = (v: boolean) => {
    const next = new Set(selected);
    rows.forEach((r) => (v ? next.add(r.id) : next.delete(r.id)));
    setSelected(next);
    if (!v) setAllMatching(false);
  };
  const toggle = (id: string, v: boolean) => { const n = new Set(selected); if (v) n.add(id); else n.delete(id); setSelected(n); setAllMatching(false); };
  const clear = () => { setSelected(new Set()); setAllMatching(false); };
  const sortBy = (key: string) => { if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(key); setDir(key === 'name' || key === 'area' ? 'asc' : 'desc'); } };

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['businesses'] }); void qc.invalidateQueries({ queryKey: ['lists'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] }); };

  const exportMut = useMutation({
    mutationFn: () => {
      const { page: _p, pageSize: _s, sort: _o, dir: _d, ...filter } = query;
      const selection = allMatching ? { mode: 'filter', filter } : { mode: 'ids', ids: [...selected] };
      return api('/exports', { method: 'POST', idempotencyKey: newIdempotencyKey(), body: { selection } });
    },
    onSuccess: () => { toast.success('Export started. It will be ready on the Exports page.'); clear(); nav('/exports'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const bulk = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ affected: number }>('/businesses/bulk-action', { method: 'POST', body: { ...body, ids: [...selected] } }),
    onSuccess: (r, v) => {
      const a = v.action as string;
      toast.success(a === 'recheck' ? 'Re-check queued. Fresh details will appear shortly.' : a === 'archive' ? 'Archived' : a === 'unarchive' ? 'Restored' : `Updated ${r.affected} lead${r.affected === 1 ? '' : 's'}`);
      setModal(null); clear(); invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const Th = ({ k, children, className }: { k?: string; children: ReactNode; className?: string }) => (
    <th scope="col" className={cn('whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-muted', className)} aria-sort={k && sort === k ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {k ? (
        <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => sortBy(k)}>{children}{sort === k && (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</button>
      ) : children}
    </th>
  );

  return (
    <section aria-label={title} className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 sm:p-4">
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, address, website or phone" className="pl-9" aria-label="Search results" maxLength={120} />
        </div>
        <Select aria-label="Website" value={web} onChange={(e) => setWeb(e.target.value as Tri)} className="w-auto"><option value="any">Website: any</option><option value="yes">Has website</option><option value="no">No website</option></Select>
        <Select aria-label="Phone" value={phone} onChange={(e) => setPhone(e.target.value as Tri)} className="w-auto"><option value="any">Phone: any</option><option value="yes">Has phone</option><option value="no">No phone</option></Select>
        <Select aria-label="Social" value={social} onChange={(e) => setSocial(e.target.value as Tri)} className="w-auto"><option value="any">Social: any</option><option value="yes">Has social</option><option value="no">No social</option></Select>
        <Select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)} className="w-auto"><option value="">All sources</option>{sources.data?.items.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
        <Select aria-label="Verification" value={verification} onChange={(e) => setVerification(e.target.value)} className="w-auto"><option value="">Any status</option><option value="verified">Verified</option><option value="likely">Likely</option><option value="unresolved">Unresolved</option></Select>
        <Select aria-label="Archive" value={archived} onChange={(e) => setArchived(e.target.value as 'exclude' | 'only')} className="w-auto"><option value="exclude">Active</option><option value="only">Archived</option></Select>
        {filtered && <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => { setQ(''); setWeb('any'); setPhone('any'); setSocial('any'); setSource(''); setVerification(''); setArchived('exclude'); }}>Reset</Button>}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-soft px-4 py-2.5" role="region" aria-label="Bulk actions">
          <span className="mr-1 text-sm font-semibold text-brand">{selCount.toLocaleString()} selected</span>
          {!allMatching && allOnPage && total > rows.length && (
            <button className="text-[13px] font-semibold text-brand underline" onClick={() => setAllMatching(true)}>Select all {total.toLocaleString()} matching</button>
          )}
          {can('export:create') && <Button size="sm" variant="accent" icon={<Download className="h-4 w-4" />} loading={exportMut.isPending} onClick={() => exportMut.mutate()}>Export Excel</Button>}
          {can('business:write') && !allMatching && (
            <>
              <Button size="sm" icon={<ClipboardPlus className="h-4 w-4" />} onClick={() => setModal('list')}>Add to list</Button>
              <Button size="sm" icon={<Tag className="h-4 w-4" />} onClick={() => setModal('tag')}>Tag</Button>
              {archived === 'exclude'
                ? <Button size="sm" icon={<Archive className="h-4 w-4" />} loading={bulk.isPending} onClick={() => bulk.mutate({ action: 'archive' })}>Archive</Button>
                : <Button size="sm" loading={bulk.isPending} onClick={() => bulk.mutate({ action: 'unarchive' })}>Restore</Button>}
              {selected.size <= 100 && <Button size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={() => bulk.mutate({ action: 'recheck' })}>Re-check</Button>}
              {listId && <Button size="sm" variant="ghost" onClick={() => bulk.mutate({ action: 'remove_from_list', listId })}>Remove from list</Button>}
            </>
          )}
          <button className="ml-auto text-[13px] font-semibold text-muted hover:text-ink" onClick={clear}>Clear</button>
        </div>
      )}

      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="border-b border-line bg-sunken/60">
            <tr>
              <th className="w-10 px-3 py-3"><Checkbox label="Select all on this page" checked={allOnPage} indeterminate={!allOnPage && rows.some((r) => selected.has(r.id))} onChange={toggleAll} /></th>
              <Th k="name">Business</Th><Th k="area">Location</Th><Th>Phone</Th><Th>Website</Th><Th>Social</Th>
              <Th k="rating">Rating</Th><Th k="score">Lead score</Th><Th>Source</Th><Th k="checked">Last checked</Th><Th className="text-right">Details</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {results.isLoading && Array.from({ length: 7 }).map((_, i) => (
              <tr key={i}><td className="px-3 py-4" colSpan={11}><Skeleton className="h-5 w-full" /></td></tr>
            ))}
            {rows.map((b) => (
              <tr key={b.id} onClick={() => setOpen(b.id)} className={cn('cursor-pointer transition-colors hover:bg-sunken/60', selected.has(b.id) && 'bg-brand-soft/50')}>
                <td className="px-3 py-3"><Checkbox label={`Select ${b.name}`} checked={selected.has(b.id)} onChange={(v) => toggle(b.id, v)} /></td>
                <td className="max-w-[260px] px-3 py-3">
                  <p className="truncate font-semibold">{b.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5"><span className="text-xs text-muted">{b.category}</span><VerificationBadge status={b.verificationStatus} />{b.reviewFlags.length > 0 && <Badge tone="warn">Check</Badge>}</div>
                </td>
                <td className="max-w-[220px] px-3 py-3"><p className="truncate">{b.cityArea ?? NA}</p><p className="truncate text-xs text-muted">{b.address ?? ''}</p></td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums">{b.phone ?? NA}</td>
                <td className="max-w-[180px] px-3 py-3">{b.website && safeHref(b.website) ? <a href={safeHref(b.website)} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()} className="inline-flex max-w-full items-center gap-1.5 font-medium text-brand hover:underline"><Globe className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{hostOf(b.website)}</span></a> : NA}</td>
                <td className="px-3 py-3"><SocialCell b={b} /></td>
                <td className="whitespace-nowrap px-3 py-3">{b.rating !== null ? <span className="inline-flex items-center gap-1 font-medium"><Star className="h-3.5 w-3.5 fill-accent text-accent" />{b.rating.toFixed(1)}<span className="text-xs font-normal text-muted">({b.reviewCount ?? 0})</span></span> : NA}</td>
                <td className="px-3 py-3"><ScorePill score={b.leadScore} /></td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{b.sources.map((s) => <Badge key={s}>{sourceLabel(s)}</Badge>)}</div></td>
                <td className="whitespace-nowrap px-3 py-3 text-muted">{timeAgo(b.lastCheckedAt)}</td>
                <td className="px-3 py-3 text-right"><Button size="sm" variant="ghost" aria-label={`Open ${b.name}`} onClick={(e) => { e.stopPropagation(); setOpen(b.id); }}><Eye className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!results.isLoading && rows.length === 0 && (filtered ? <EmptyState title="No leads match these filters" hint="Try removing a filter or widening the search." /> : empty)}
      </div>

      {results.data && total > 0 && <Pagination page={results.data.page} totalPages={results.data.totalPages} total={total} pageSize={results.data.pageSize} onPage={setPage} />}
      {google && <p className="border-t border-line px-4 py-2 text-xs font-semibold text-muted">Powered by Google</p>}

      <BusinessDrawer id={open} onClose={() => setOpen(null)} />
      <ListModal open={modal === 'list'} onClose={() => setModal(null)} busy={bulk.isPending} onPick={(id) => bulk.mutate({ action: 'add_to_list', listId: id })} />
      <TagModal open={modal === 'tag'} onClose={() => setModal(null)} busy={bulk.isPending} onPick={(p) => bulk.mutate({ action: 'tag', ...p })} />
    </section>
  );
}

function ListModal({ open, onClose, onPick, busy }: { open: boolean; onClose: () => void; onPick: (id: string) => void; busy: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const lists = useQuery({ queryKey: ['lists'], queryFn: () => api<{ items: LeadList[] }>('/lead-lists'), enabled: open });
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => api<LeadList>('/lead-lists', { method: 'POST', body: { name } }),
    onSuccess: (l) => { setName(''); void qc.invalidateQueries({ queryKey: ['lists'] }); onPick(l.id); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open={open} onClose={onClose} title="Add to a lead list">
      <div className="space-y-2">
        {lists.data?.items.map((l) => (
          <button key={l.id} disabled={busy} onClick={() => onPick(l.id)} className="flex w-full items-center justify-between rounded-xl border border-line px-4 py-3 text-left hover:border-brand hover:bg-brand-soft">
            <span className="font-semibold">{l.name}</span><span className="text-xs text-muted">{l.count} leads</span>
          </button>
        ))}
        {lists.data?.items.length === 0 && <p className="text-sm text-muted">You have no lists yet. Create your first one below.</p>}
      </div>
      <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New list name" maxLength={120} aria-label="New list name" />
        <Button type="submit" variant="primary" loading={create.isPending} disabled={!name.trim()}>Create and add</Button>
      </form>
    </Modal>
  );
}

function TagModal({ open, onClose, onPick, busy }: { open: boolean; onClose: () => void; onPick: (p: { tagId?: string; tagName?: string }) => void; busy: boolean }) {
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api<{ items: TagT[] }>('/tags'), enabled: open });
  const [name, setName] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Tag selected leads">
      <div className="flex flex-wrap gap-2">
        {tags.data?.items.map((t) => <button key={t.id} disabled={busy} onClick={() => onPick({ tagId: t.id })} className="rounded-full bg-brand-soft px-3.5 py-1.5 text-sm font-semibold text-brand hover:bg-brand hover:text-white">{t.name}</button>)}
        {tags.data?.items.length === 0 && <p className="text-sm text-muted">No tags yet. Name one below.</p>}
      </div>
      <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onPick({ tagName: name.trim() }); }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag, e.g. Call first" maxLength={60} aria-label="New tag name" />
        <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>Add tag</Button>
      </form>
    </Modal>
  );
}
