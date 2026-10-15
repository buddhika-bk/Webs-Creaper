import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PageHeader, Pagination, ProgressBar, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';
import { ExportItem, Paged } from '../lib/types';
import { errorMessage, formatBytes, fullDate, timeAgo } from '../lib/utils';
import { useState } from 'react';

const TONE = { QUEUED: 'neutral', RUNNING: 'brand', COMPLETED: 'ok', FAILED: 'danger', EXPIRED: 'neutral' } as const;

export default function ExportsPage() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['exports', page],
    queryFn: () => api<Paged<ExportItem>>('/exports', { query: { page, pageSize: 15 } }),
    refetchInterval: (q) => (q.state.data?.items.some((e) => e.status === 'QUEUED' || e.status === 'RUNNING') ? 1500 : false),
  });
  const download = useMutation({
    mutationFn: (id: string) => api<{ url: string }>(`/exports/${id}/download-link`, { method: 'POST' }),
    onSuccess: (r) => { window.location.assign(r.url); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div>
      <PageHeader title="Exports" description="Excel files are prepared in the background. Each download link works once and expires after 5 minutes. Files are deleted after 24 hours." />
      <Card>
        {list.isLoading && <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}
        {list.data?.items.length === 0 && <EmptyState icon={<FileSpreadsheet className="h-6 w-6" />} title="No exports yet" hint="Select leads in your results and choose Export Excel." />}
        <ul className="divide-y divide-line">
          {list.data?.items.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-ok/12 text-ok"><FileSpreadsheet className="h-5 w-5" /></div>
              <div className="min-w-[180px] flex-1">
                <p className="font-semibold">{e.fileName ?? 'Excel export'}</p>
                <p className="text-xs text-muted">{e.rowCount.toLocaleString()} rows · {fullDate(e.createdAt)}{e.createdBy ? ` · ${e.createdBy}` : ''}{e.fileSize ? ` · ${formatBytes(e.fileSize)}` : ''}</p>
                {(e.status === 'RUNNING' || e.status === 'QUEUED') && <div className="mt-2 max-w-xs"><ProgressBar value={e.progress} tone="accent" /></div>}
                {e.error && <p className="mt-1 text-xs text-danger">{e.error}</p>}
              </div>
              <Badge tone={TONE[e.status]}>{e.status === 'COMPLETED' ? 'Ready' : e.status === 'EXPIRED' ? 'Expired' : e.status.toLowerCase()}</Badge>
              {e.status === 'COMPLETED' && <><span className="text-xs text-muted">Expires {timeAgo(e.expiresAt).includes('ago') ? 'soon' : fullDate(e.expiresAt)}</span><Button variant="primary" size="sm" icon={<Download className="h-4 w-4" />} loading={download.isPending && download.variables === e.id} onClick={() => download.mutate(e.id)}>Download</Button></>}
            </li>
          ))}
        </ul>
        {list.data && list.data.total > 0 && <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />}
      </Card>
    </div>
  );
}
