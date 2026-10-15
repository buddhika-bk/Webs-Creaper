import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, EmptyState, Input, PageHeader, Pagination, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { AuditItem, Paged } from '../lib/types';
import { fullDate } from '../lib/utils';

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => { setDebounced(action.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [action]);
  const logs = useQuery({ queryKey: ['audit', page, debounced], queryFn: () => api<Paged<AuditItem>>('/audit-logs', { query: { page, pageSize: 30, action: debounced || undefined } }) });
  return (
    <div>
      <PageHeader title="Audit logs" description="Sign-ins, searches, exports, downloads and permission changes. Secrets are never recorded." />
      <Card>
        <div className="border-b border-line p-4"><Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Filter by action, e.g. export or auth" className="max-w-sm" aria-label="Filter by action" maxLength={80} /></div>
        {logs.isLoading && <div className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>}
        {logs.data?.items.length === 0 && <EmptyState icon={<ScrollText className="h-6 w-6" />} title="No matching events" />}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line bg-sunken/60 text-left text-xs text-muted"><tr><th className="px-4 py-3 font-semibold">When</th><th className="px-4 py-3 font-semibold">Who</th><th className="px-4 py-3 font-semibold">Action</th><th className="px-4 py-3 font-semibold">Details</th><th className="px-4 py-3 font-semibold">IP</th></tr></thead>
            <tbody className="divide-y divide-line">
              {logs.data?.items.map((a) => (
                <tr key={a.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{fullDate(a.createdAt)}</td>
                  <td className="px-4 py-3">{a.user ? <><p className="font-medium">{a.user.name}</p><p className="text-xs text-muted">{a.user.email}</p></> : <span className="text-muted">System or anonymous</span>}</td>
                  <td className="px-4 py-3"><code className="rounded bg-sunken px-1.5 py-0.5 text-xs font-semibold">{a.action}</code></td>
                  <td className="max-w-[320px] px-4 py-3 text-xs text-muted">{a.metadata ? <span className="break-words">{Object.entries(a.metadata).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')}</span> : ''}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{a.ip ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logs.data && logs.data.total > 0 && <Pagination page={logs.data.page} totalPages={logs.data.totalPages} total={logs.data.total} pageSize={logs.data.pageSize} onPage={setPage} />}
      </Card>
    </div>
  );
}
