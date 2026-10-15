import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Badge, Card, PageHeader, Skeleton, Switch } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { SourceInfo } from '../lib/types';
import { errorMessage } from '../lib/utils';

export default function SourcesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const sources = useQuery({ queryKey: ['sources'], queryFn: () => api<{ items: SourceInfo[] }>('/sources') });
  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => api<{ items: SourceInfo[] }>(`/sources/${v.id}`, { method: 'PATCH', body: { enabled: v.enabled } }),
    onSuccess: (d) => { qc.setQueryData(['sources'], (old: { items: SourceInfo[]; categories?: string[] } | undefined) => ({ ...old, items: d.items })); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div>
      <PageHeader title="Sources" description="Where business details come from. Each source has its own rules for storage, attribution and cost." />
      <div className="grid gap-4 lg:grid-cols-2">
        {sources.isLoading && [0, 1].map((i) => <Skeleton key={i} className="h-64 w-full rounded-card" />)}
        {sources.data?.items.map((s) => (
          <Card key={s.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{s.label}</h2>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge tone={s.configured ? 'ok' : 'warn'}>{s.configured ? 'Connected' : 'Not configured'}</Badge>
                  {s.paid && <Badge tone="accent">Paid API</Badge>}
                  {s.id === 'demo' && <Badge>Development only</Badge>}
                </div>
              </div>
              <Switch label={`Use ${s.label}`} checked={s.enabled} disabled={!can('sources:manage') || toggle.isPending} onChange={(v) => toggle.mutate({ id: s.id, enabled: v })} />
            </div>
            <p className="mt-3 text-sm text-muted">{s.description}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-sunken px-3.5 py-3"><dt className="text-xs text-muted">Keep source details for</dt><dd className="font-semibold">{s.retentionDays === null ? 'No limit set' : s.retentionDays === 0 ? 'IDs only' : `${s.retentionDays} days`}</dd></div>
              <div className="rounded-xl bg-sunken px-3.5 py-3"><dt className="text-xs text-muted">Last 30 days</dt><dd className="font-semibold">{s.usage30d.requests} requests{s.paid ? ` · $${s.usage30d.estimatedCostUsd.toFixed(2)}` : ''}</dd></div>
            </dl>
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-line p-3.5 text-sm">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
              <div><p className="font-semibold">Attribution: {s.attribution}</p><p className="mt-0.5 text-xs text-muted">{s.notes}</p></div>
            </div>
            <a href={s.termsUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">Read the terms<ExternalLink className="h-3.5 w-3.5" /></a>
          </Card>
        ))}
      </div>
    </div>
  );
}
