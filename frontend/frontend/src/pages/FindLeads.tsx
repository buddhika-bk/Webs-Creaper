import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, SearchX } from 'lucide-react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { JobStatus } from '../components/leads/JobStatus';
import { LeadsExplorer } from '../components/leads/LeadsExplorer';
import { SearchPanel } from '../components/leads/SearchPanel';
import { Card, EmptyState, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { Paged, SearchJob } from '../lib/types';
import { TERMINAL, timeAgo } from '../lib/utils';

export default function FindLeads() {
  const [params, setParams] = useSearchParams();
  const jobId = params.get('job');
  const qc = useQueryClient();

  const job = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api<SearchJob>(`/search-jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data && TERMINAL.includes(q.state.data.status) ? false : 1500),
  });
  const running = !!job.data && !TERMINAL.includes(job.data.status);
  const status = job.data?.status;
  useEffect(() => { if (status && TERMINAL.includes(status)) { void qc.invalidateQueries({ queryKey: ['businesses'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] }); void qc.invalidateQueries({ queryKey: ['notifications'] }); } }, [status, qc]);

  const recent = useQuery({ queryKey: ['recent-searches'], queryFn: () => api<Paged<SearchJob>>('/search-jobs', { query: { pageSize: 8 } }), enabled: !jobId });

  return (
    <div className="space-y-6">
      <SearchPanel busy={running} onStarted={(j) => { void qc.invalidateQueries({ queryKey: ['notifications'] }); setParams({ job: j.id }); }} />

      {jobId ? (
        <>
          <JobStatus job={job.data} loading={job.isLoading} />
          {job.isError ? (
            <Card><EmptyState icon={<SearchX className="h-6 w-6" />} title="We could not open that search" hint="It may belong to another workspace or no longer exist." /></Card>
          ) : (
            <LeadsExplorer base={{ jobId }} live={running} title="Search results"
              empty={running
                ? <EmptyState icon={<History className="h-6 w-6" />} title="Collecting businesses..." hint="Results appear here as soon as they are found." />
                : <EmptyState icon={<SearchX className="h-6 w-6" />} title="No businesses matched" hint="Try a nearby area, a different business type, or fewer filters." />} />
          )}
        </>
      ) : (
        <Card>
          <div className="border-b border-line px-5 py-4"><h2 className="text-lg font-semibold">Recent searches</h2></div>
          {recent.isLoading && <div className="space-y-3 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>}
          {recent.data?.items.length === 0 && <EmptyState icon={<History className="h-6 w-6" />} title="Your searches will show up here" hint="Start with a business type and a location above." />}
          <ul className="divide-y divide-line">
            {recent.data?.items.map((j) => (
              <li key={j.id}>
                <button onClick={() => setParams({ job: j.id })} className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left hover:bg-sunken/60">
                  <div className="min-w-0"><p className="truncate font-semibold">{j.category} in {j.location}</p><p className="text-xs text-muted">{timeAgo(j.createdAt)}{j.createdBy ? ` · ${j.createdBy}` : ''}</p></div>
                  <div className="shrink-0 text-right text-sm"><p className="font-semibold">{j.metrics.matchedRecords || j.metrics.acceptedRecords} leads</p><p className="text-xs capitalize text-muted">{j.status.toLowerCase().replace('_', ' ')}</p></div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
