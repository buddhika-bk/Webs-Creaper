import { useMutation, useQuery } from '@tanstack/react-query';
import { MapPin, Search, SlidersHorizontal, Sparkles, Store } from 'lucide-react';
import { FormEvent, useRef, useState } from 'react';
import { api, newIdempotencyKey } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { JobFilters, ParsedSearch, SearchJob, SourceInfo } from '../../lib/types';
import { CATEGORY_SUGGESTIONS, cn, errorMessage, LOCATION_SUGGESTIONS } from '../../lib/utils';
import { Button, Field, Input, Select, Switch, TriState } from '../ui';

const EXAMPLES: [string, string][] = [['Bookshop', 'Malabe'], ['Salon', 'Kandy'], ['Restaurant', 'Galle'], ['Pharmacy', 'Nugegoda']];

export function SearchPanel({ onStarted, busy }: { onStarted: (job: SearchJob) => void; busy: boolean }) {
  const toast = useToast();
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [source, setSource] = useState('');
  const [limit, setLimit] = useState(60);
  const [enrich, setEnrich] = useState(false);
  const [filters, setFilters] = useState<JobFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [nl, setNl] = useState(false);
  const [nlText, setNlText] = useState('');
  const [parsed, setParsed] = useState<ParsedSearch | null>(null);
  const key = useRef(newIdempotencyKey());

  const sources = useQuery({ queryKey: ['sources'], queryFn: () => api<{ items: SourceInfo[] }>('/sources') });
  const usable = (sources.data?.items ?? []).filter((s) => s.enabled && s.configured);
  const chosen = source || usable[0]?.id || '';

  const start = useMutation({
    mutationFn: () => api<SearchJob>('/search-jobs', { method: 'POST', idempotencyKey: key.current, body: { category: category.trim(), location: location.trim(), source: chosen, limit, enrich, filters } }),
    onSuccess: (job) => { key.current = newIdempotencyKey(); onStarted(job); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const parse = useMutation({
    mutationFn: () => api<ParsedSearch>('/ai/parse-query', { method: 'POST', body: { text: nlText } }),
    onSuccess: (r) => {
      setParsed(r);
      if (r.query.category) setCategory(r.query.category);
      if (r.query.location) setLocation(r.query.location);
      setFilters(r.query.filters);
      if (Object.keys(r.query.filters).length) setShowFilters(true);
      setNl(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); if (category.trim().length >= 2 && location.trim().length >= 2 && chosen) start.mutate(); };
  const activeFilters = Object.values(filters).filter((v) => v !== undefined).length;

  return (
    <section className="rounded-hero bg-brand-deep p-5 text-white sm:p-8" aria-labelledby="find-title">
      <h1 id="find-title" className="max-w-xl text-[26px] font-semibold leading-tight sm:text-4xl">Which businesses do you want to reach?</h1>
      <p className="mt-2 max-w-xl text-sm text-white/70">Pick a business type and a place in Sri Lanka. We collect the public details and show them in a table you can filter and export.</p>

      {nl ? (
        <form className="mt-6" onSubmit={(e) => { e.preventDefault(); if (nlText.trim().length >= 3) parse.mutate(); }}>
          <label htmlFor="nl" className="sr-only">Describe your search</label>
          <div className="flex flex-col gap-2 rounded-2xl bg-surface p-2 text-ink sm:flex-row">
            <Input id="nl" autoFocus value={nlText} onChange={(e) => setNlText(e.target.value)} maxLength={300} placeholder="Bookshops in Malabe without websites" className="border-transparent" />
            <Button type="submit" variant="accent" size="lg" loading={parse.isPending} icon={<Sparkles className="h-4 w-4" />}>Turn into filters</Button>
          </div>
          <p className="mt-2 text-xs text-white/60">You will review the filters before anything runs.</p>
        </form>
      ) : (
        <form className="mt-6" onSubmit={submit}>
          <div className="grid gap-2 rounded-2xl bg-surface p-2 text-ink md:grid-cols-[1fr_1fr_auto]">
            <label className="relative block">
              <span className="sr-only">Business type</span>
              <Store className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
              <Input list="category-list" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Business type, e.g. Bookshop" maxLength={120} required minLength={2} className="border-transparent pl-10" />
            </label>
            <label className="relative block">
              <span className="sr-only">Location in Sri Lanka</span>
              <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
              <Input list="location-list" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location, e.g. Malabe" maxLength={160} required minLength={2} className="border-transparent pl-10" />
            </label>
            <Button type="submit" variant="accent" size="lg" loading={start.isPending || busy} disabled={!chosen} icon={<Search className="h-[18px] w-[18px]" />}>Find businesses</Button>
          </div>
          <datalist id="category-list">{CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
          <datalist id="location-list">{LOCATION_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
            <button type="button" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}
              className={cn('inline-flex items-center gap-2 rounded-full border border-white/25 px-3.5 py-1.5 font-semibold transition-colors hover:bg-white/10', showFilters && 'bg-white/10')}>
              <SlidersHorizontal className="h-4 w-4" />Filters{activeFilters ? ` (${activeFilters})` : ''}
            </button>
            <button type="button" onClick={() => setNl(true)} className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3.5 py-1.5 font-semibold hover:bg-white/10">
              <Sparkles className="h-4 w-4" />Describe it instead
            </button>
            <span className="mx-1 hidden h-4 w-px bg-white/25 sm:block" />
            {EXAMPLES.map(([c, l]) => (
              <button key={c + l} type="button" onClick={() => { setCategory(c); setLocation(l); }} className="rounded-full px-3 py-1.5 text-white/75 hover:bg-white/10 hover:text-white">{c} in {l}</button>
            ))}
          </div>

          {parsed && (
            <p className="mt-3 rounded-xl bg-white/10 px-3.5 py-2.5 text-xs text-white/80">
              <Sparkles className="mr-1.5 inline h-3.5 w-3.5" />Filled in by AI ({parsed.model}, {Math.round(parsed.confidence * 100)}% confident). Check the fields above, then search. {parsed.evidence.join(' · ')}
            </p>
          )}

          {showFilters && (
            <div className="mt-4 grid gap-5 rounded-2xl bg-surface p-5 text-ink sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Phone number">{() => <TriState value={filters.hasPhone} onChange={(v) => setFilters({ ...filters, hasPhone: v })} />}</Field>
              <Field label="Website">{() => <TriState value={filters.hasWebsite} onChange={(v) => setFilters({ ...filters, hasWebsite: v })} />}</Field>
              <Field label="Social links">{() => <TriState value={filters.hasSocial} onChange={(v) => setFilters({ ...filters, hasSocial: v })} />}</Field>
              <Field label="Minimum rating">{(id) => (
                <Select id={id} value={filters.minRating ?? ''} onChange={(e) => setFilters({ ...filters, minRating: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">Any rating</option>{[3, 3.5, 4, 4.5].map((r) => <option key={r} value={r}>{r}+ stars</option>)}
                </Select>)}
              </Field>
              <Field label="Minimum reviews">{(id) => (
                <Select id={id} value={filters.minReviews ?? ''} onChange={(e) => setFilters({ ...filters, minReviews: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">Any</option>{[5, 10, 25, 50, 100].map((r) => <option key={r} value={r}>{r}+ reviews</option>)}
                </Select>)}
              </Field>
              <Field label="Open status">{() => (
                <div className="flex items-center gap-3 py-2"><Switch label="Hide closed businesses" checked={!!filters.openOnly} onChange={(v) => setFilters({ ...filters, openOnly: v || undefined })} /><span className="text-sm">Hide closed businesses</span></div>)}
              </Field>
              <Field label="Source" hint={usable.find((s) => s.id === chosen)?.paid ? 'Paid source: usage counts against your budget.' : undefined}>{(id) => (
                <Select id={id} value={chosen} onChange={(e) => setSource(e.target.value)}>
                  {usable.length === 0 && <option value="">No source available</option>}
                  {usable.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </Select>)}
              </Field>
              <Field label="Result limit">{(id) => (
                <Select id={id} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>{[20, 40, 60, 100, 200].map((n) => <option key={n} value={n}>Up to {n}</option>)}</Select>)}
              </Field>
              <Field label="Website enrichment" hint="Looks for social links on each business's own website.">{() => (
                <div className="flex items-center gap-3 py-2"><Switch label="Look for social links" checked={enrich} onChange={setEnrich} /><span className="text-sm">Look for social links</span></div>)}
              </Field>
              <div className="sm:col-span-2 lg:col-span-3"><button type="button" className="text-[13px] font-semibold text-brand hover:underline" onClick={() => setFilters({})}>Clear filters</button></div>
            </div>
          )}
          {!sources.isLoading && usable.length === 0 && (
            <p className="mt-4 rounded-xl bg-accent/20 px-4 py-3 text-sm">No data source is ready. Ask an admin to configure one under Sources.</p>
          )}
        </form>
      )}
    </section>
  );
}
