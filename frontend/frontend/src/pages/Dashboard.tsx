import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Download, Globe, Phone, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { AdminOverview, Dashboard as Dash } from '../lib/types';
import { formatNumber, sourceLabel, timeAgo } from '../lib/utils';

function Stat({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between text-muted"><p className="text-sm">{label}</p>{icon}</div>
      <p className="mt-2 font-display text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </Card>
  );
}

function Quota({ label, used, max, money }: { label: string; used: number; max: number; money?: boolean }) {
  const pct = max ? (used / max) * 100 : 0;
  const fmt = (n: number) => (money ? `$${n.toFixed(2)}` : formatNumber(n));
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm"><span>{label}</span><span className="text-muted">{fmt(used)} of {fmt(max)}</span></div>
      <ProgressBar value={pct} tone={pct > 85 ? 'accent' : 'brand'} />
    </div>
  );
}

function AdminPanel() {
  const { data } = useQuery({ queryKey: ['admin-overview'], queryFn: () => api<AdminOverview>('/admin/overview') });
  if (!data) return <Skeleton className="h-64 w-full" />;
  const max = Math.max(1, ...data.searchVolume.map((v) => v.searches));
  return (
    <section aria-labelledby="admin-h" className="space-y-4">
      <h2 id="admin-h" className="text-xl font-semibold">Workspace health, last 30 days</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <p className="text-sm font-semibold">Searches per day</p>
          <div className="mt-4 flex h-36 items-end gap-1.5" role="img" aria-label="Searches per day for the last two weeks">
            {data.searchVolume.length === 0 && <p className="m-auto text-sm text-muted">No searches in the last two weeks.</p>}
            {data.searchVolume.map((v) => (
              <div key={v.day} className="group flex flex-1 flex-col items-center justify-end gap-1" title={`${new Date(v.day).toLocaleDateString()}: ${v.searches}`}>
                <span className="text-[11px] text-muted">{v.searches}</span>
                <div className="w-full rounded-t-md bg-brand" style={{ height: `${Math.max(6, (v.searches / max) * 100)}%` }} />
              </div>
            ))}
          </div>
        </Card>
        <Card className="space-y-3 p-5 text-sm">
          <p className="font-semibold">Search jobs</p>
          {[['Completed', data.jobs.completed], ['Failed', data.jobs.failed]].map(([k, v]) => <div key={k as string} className="flex justify-between"><span className="text-muted">{k}</span><span className="font-semibold">{v}</span></div>)}
          <div className="flex justify-between"><span className="text-muted">Average duration</span><span className="font-semibold">{data.jobs.avgDurationSeconds === null ? 'Not available' : `${data.jobs.avgDurationSeconds}s`}</span></div>
          <div className="flex justify-between"><span className="text-muted">Duplicate rate</span><span className="font-semibold">{Math.round(data.jobs.duplicateRate * 100)}%</span></div>
          <div className="flex justify-between"><span className="text-muted">Exports</span><span className="font-semibold">{data.exports.count} ({formatNumber(data.exports.rows)} rows)</span></div>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold">Source usage</p>
          {data.sources.length === 0 ? <p className="text-sm text-muted">No source requests yet.</p> : (
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th className="pb-2 font-semibold">Source</th><th className="pb-2 font-semibold">Requests</th><th className="pb-2 font-semibold">Est. cost</th><th className="pb-2 font-semibold">Errors</th></tr></thead>
              <tbody className="divide-y divide-line">{data.sources.map((s) => <tr key={s.source}><td className="py-2 font-medium">{sourceLabel(s.source)}</td><td>{formatNumber(s.requests)}</td><td>${s.estimatedCostUsd.toFixed(2)}</td><td>{s.errors}</td></tr>)}</tbody></table>
          )}
        </Card>
        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold">Recent failures</p>
          {data.recentFailures.length === 0 ? <p className="text-sm text-muted">Nothing has failed recently.</p> : (
            <ul className="space-y-2.5 text-sm">{data.recentFailures.map((f) => <li key={f.id}><p className="font-medium">{f.category} in {f.location} <span className="font-normal text-muted">· {timeAgo(f.created_at)}</span></p><p className="text-xs text-danger">{f.error_message ?? 'Unknown error'}</p></li>)}</ul>
          )}
        </Card>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dash>('/dashboard') });

  return (
    <div className="space-y-8">
      <PageHeader title={`Welcome back, ${user?.name.split(' ')[0]}`} description="Your lead pipeline at a glance."
        actions={can('search:create') ? <Link to="/find"><Button variant="accent" icon={<ArrowRight className="h-4 w-4" />}>Find leads</Button></Link> : undefined} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading || !data ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-card" />) : (
          <>
            <Stat label="Leads collected" value={formatNumber(data.totals.businesses)} hint={`${formatNumber(data.totals.verified)} verified`} icon={<ShieldCheck className="h-5 w-5" />} />
            <Stat label="Without a website" value={formatNumber(data.totals.withoutWebsite)} hint="Good prospects for web projects" icon={<Globe className="h-5 w-5" />} />
            <Stat label="Without social pages" value={formatNumber(data.totals.withoutSocial)} hint="Nothing found on Facebook or Instagram" icon={<Globe className="h-5 w-5" />} />
            <Stat label="With a phone number" value={formatNumber(data.totals.withPhone)} hint="Ready for outreach" icon={<Phone className="h-5 w-5" />} />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="text-lg font-semibold">Recent searches</h2><Link className="text-sm font-semibold text-brand hover:underline" to="/find">New search</Link></div>
          {isLoading && <div className="space-y-3 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>}
          {data && data.recentSearches.length === 0 && <EmptyState title="No searches yet" hint="Try Bookshop in Malabe to see how it works." action={can('search:create') ? <Link to="/find"><Button variant="primary">Start a search</Button></Link> : undefined} />}
          <ul className="divide-y divide-line">
            {data?.recentSearches.map((j) => (
              <li key={j.id}>
                <Link to={`/find?job=${j.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-sunken/60">
                  <div className="min-w-0"><p className="truncate font-semibold">{j.category} in {j.location}</p><p className="text-xs text-muted">{sourceLabel(j.source)} · {timeAgo(j.createdAt)}</p></div>
                  <Badge tone={j.status === 'COMPLETED' ? 'ok' : j.status === 'FAILED' ? 'danger' : j.status === 'CANCELLED' ? 'neutral' : 'brand'}>{j.status === 'COMPLETED' ? `${j.metrics.matchedRecords} leads` : j.status.toLowerCase().replace('_', ' ')}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-5 p-5">
          <h2 className="text-lg font-semibold">Today&apos;s usage</h2>
          {data ? (
            <>
              <Quota label="Searches" used={data.usage.searchesToday} max={data.quotas.dailySearches} />
              <Quota label="Exports" used={data.usage.exportsToday} max={data.quotas.dailyExports} />
              <Quota label="API budget this month" used={data.usage.monthCostUsd} max={data.quotas.monthlyApiBudgetUsd} money />
              <div className="flex items-center gap-3 rounded-xl bg-sunken p-3.5 text-sm"><Download className="h-5 w-5 text-muted" /><span>{data.totals.exports} exports, {data.totals.lists} lead lists</span></div>
            </>
          ) : <Skeleton className="h-40 w-full" />}
        </Card>
      </div>

      {can('admin:overview') && <AdminPanel />}
    </div>
  );
}
