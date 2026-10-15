import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CircleSlash, Loader2, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { JobStatus as Status, SearchJob } from '../../lib/types';
import { cn, errorMessage, formatNumber, sourceLabel, TERMINAL } from '../../lib/utils';
import { Button, Card, ProgressBar, Skeleton } from '../ui';

const STAGES: { key: Status[]; label: string }[] = [
  { key: ['QUEUED', 'RUNNING', 'RETRYING'], label: 'Queued' },
  { key: ['COLLECTING'], label: 'Collecting' },
  { key: ['NORMALIZING'], label: 'Cleaning' },
  { key: ['DEDUPLICATING'], label: 'Removing duplicates' },
  { key: ['ENRICHING'], label: 'Enriching' },
  { key: ['COMPLETED'], label: 'Done' },
];

export function JobStatus({ job, loading }: { job: SearchJob | undefined; loading: boolean }) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => api<SearchJob>(`/search-jobs/${job!.id}/cancel`, { method: 'POST' }),
    onSuccess: (j) => { qc.setQueryData(['job', j.id], j); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (loading || !job) {
    return <Card className="p-5"><Skeleton className="h-5 w-56" /><Skeleton className="mt-4 h-2 w-full" /><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div></Card>;
  }
  const m = job.metrics;
  const done = TERMINAL.includes(job.status);
  const stages = STAGES.filter((s) => job.enrich || !s.key.includes('ENRICHING'));
  const current = Math.max(0, stages.findIndex((s) => s.key.includes(job.status === 'CANCEL_REQUESTED' ? 'COLLECTING' : job.status)));
  const pct = job.status === 'COMPLETED' ? 100 : Math.min(95, Math.max(8, job.limit ? (m.acceptedRecords / job.limit) * 80 + (current / stages.length) * 20 : (current / stages.length) * 100));

  const icon = job.status === 'COMPLETED' ? <CheckCircle2 className="h-5 w-5 text-ok" />
    : job.status === 'FAILED' ? <XCircle className="h-5 w-5 text-danger" />
    : job.status === 'CANCELLED' ? <CircleSlash className="h-5 w-5 text-muted" />
    : job.status === 'RETRYING' ? <AlertTriangle className="h-5 w-5 text-warn" />
    : <Loader2 className="h-5 w-5 animate-spin text-brand" />;

  const title = job.status === 'COMPLETED' ? 'Search complete'
    : job.status === 'FAILED' ? 'Search failed'
    : job.status === 'CANCELLED' ? 'Search cancelled'
    : job.status === 'CANCEL_REQUESTED' ? 'Stopping search...'
    : job.status === 'RETRYING' ? 'Hit a snag, trying again...'
    : 'Searching...';

  const stats: [string, string][] = [
    ['Records found', formatNumber(m.acceptedRecords)],
    ['Duplicates removed', formatNumber(m.duplicates)],
    [job.enrich ? 'Websites checked' : 'Matching your filters', job.enrich ? `${m.enrichmentSucceeded}/${m.enrichmentAttempts}` : done ? formatNumber(m.matchedRecords) : 'After search'],
    ['Time', `${Math.max(1, Math.round(m.elapsedMs / 1000))}s`],
  ];

  return (
    <Card className="p-5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className="font-display text-base font-semibold">{title}</p>
            <p className="text-[13px] text-muted">{job.category} in {job.location} · {sourceLabel(job.source)}</p>
          </div>
        </div>
        {!done && can('search:create') && job.status !== 'CANCEL_REQUESTED' && (
          <Button size="sm" variant="secondary" loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel search</Button>
        )}
      </div>

      {!done && (
        <>
          <div className="mt-4"><ProgressBar value={pct} tone="accent" /></div>
          <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {stages.map((s, i) => (
              <li key={s.label} className={cn('font-semibold', i < current ? 'text-ok' : i === current ? 'text-brand' : 'text-muted/70')}>{s.label}</li>
            ))}
          </ol>
        </>
      )}

      {job.error && job.status !== 'COMPLETED' && <p className="mt-4 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{job.error}</p>}

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-sunken px-4 py-3">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="mt-0.5 font-display text-xl font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {m.estimatedCostUsd > 0 && <p className="mt-3 text-xs text-muted">Estimated API cost for this search: ${m.estimatedCostUsd.toFixed(3)}</p>}
    </Card>
  );
}
