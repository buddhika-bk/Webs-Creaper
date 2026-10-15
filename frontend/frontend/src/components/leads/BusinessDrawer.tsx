import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Facebook, Globe, Instagram, Link2, Linkedin, Phone, Sparkles, Star, X, Youtube } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { BusinessDetail } from '../../lib/types';
import { errorMessage, fullDate, hostOf, safeHref, sourceLabel, timeAgo } from '../../lib/utils';
import { Badge, Button, Drawer, Skeleton } from '../ui';
import { VerificationBadge } from './parts';

const PLATFORM_ICON: Record<string, ReactNode> = {
  facebook: <Facebook className="h-4 w-4" />, instagram: <Instagram className="h-4 w-4" />, linkedin: <Linkedin className="h-4 w-4" />, youtube: <Youtube className="h-4 w-4" />,
};

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <div className="mt-0.5 text-muted">{icon}</div>
      <div className="min-w-0 flex-1"><p className="text-xs text-muted">{label}</p><div className="text-sm">{children}</div></div>
    </div>
  );
}
const NA = () => <span className="text-muted">Not available</span>;

function Link({ href }: { href: string }) {
  const safe = safeHref(href);
  return safe ? <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 break-all font-medium text-brand hover:underline">{hostOf(href)}{new URL(href).pathname.length > 1 ? new URL(href).pathname : ''}<ExternalLink className="h-3 w-3 shrink-0" /></a> : <span>{href}</span>;
}

export function BusinessDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['business', id], queryFn: () => api<BusinessDetail>(`/businesses/${id}`), enabled: !!id });
  const [notes, setNotes] = useState('');
  useEffect(() => setNotes(data?.notes ?? ''), [data?.id, data?.notes]);

  const save = useMutation({
    mutationFn: () => api(`/businesses/${id}`, { method: 'PATCH', body: { notes: notes.trim() || null } }),
    onSuccess: () => { toast.success('Notes saved'); void qc.invalidateQueries({ queryKey: ['business', id] }); void qc.invalidateQueries({ queryKey: ['businesses'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const google = data?.sourceRecords.some((s) => s.source === 'google_places');

  return (
    <Drawer open={!!id} onClose={onClose} title="Business details">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          {isLoading || !data ? <Skeleton className="h-6 w-56" /> : <h2 className="truncate text-xl font-semibold">{data.name}</h2>}
          {data && <p className="mt-0.5 text-sm text-muted">{data.category}{data.cityArea ? ` · ${data.cityArea}` : ''}</p>}
        </div>
        <button aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-ink"><X className="h-5 w-5" /></button>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
        {isLoading || !data ? (
          <div className="space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <VerificationBadge status={data.verificationStatus} />
              {data.rating !== null && <Badge tone="neutral"><Star className="h-3 w-3 fill-accent text-accent" />{data.rating.toFixed(1)}{data.reviewCount !== null && ` (${data.reviewCount})`}</Badge>}
              {data.openStatus && data.openStatus !== 'open' && <Badge tone="warn">{data.openStatus.replace('_', ' ')}</Badge>}
              {data.archived && <Badge>Archived</Badge>}
              {data.tags.map((t) => <Badge key={t.id} tone="brand">{t.name}</Badge>)}
            </div>

            <div className="mt-4 divide-y divide-line">
              <Row icon={<Phone className="h-4 w-4" />} label="Phone">{data.phone ? <a className="font-medium text-brand hover:underline" href={`tel:${data.phone.replace(/\s/g, '')}`}>{data.phone}</a> : <NA />}</Row>
              <Row icon={<Globe className="h-4 w-4" />} label="Website">{data.website ? <Link href={data.website} /> : <NA />}</Row>
              <Row icon={<Link2 className="h-4 w-4" />} label="Address">{data.address ?? <NA />}</Row>
            </div>

            <h3 className="mb-1 mt-6 text-sm font-semibold">Social profiles</h3>
            {data.socialLinks.length === 0 ? <p className="text-sm text-muted">None found. We never guess a profile.</p> : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {data.socialLinks.map((s) => (
                  <li key={s.url} className="flex items-start gap-3 px-3.5 py-3">
                    <span className="mt-0.5 text-muted">{PLATFORM_ICON[s.platform] ?? <Link2 className="h-4 w-4" />}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={s.url} />
                      <p className="mt-1 text-xs text-muted">
                        Found via {sourceLabel(s.source)} · {Math.round(s.confidence * 100)}% confident
                        {s.evidenceUrl && safeHref(s.evidenceUrl) && <> · <a className="underline" href={safeHref(s.evidenceUrl)} target="_blank" rel="noopener noreferrer nofollow">evidence</a></>}
                        {s.aiGenerated && <> · <Sparkles className="inline h-3 w-3" /> AI-assisted</>}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="mb-1 mt-6 text-sm font-semibold">Lead score: {data.leadScore}/100</h3>
            <p className="mb-2 text-xs text-muted">Every point comes from a visible rule.</p>
            <ul className="space-y-1.5">
              {data.qualification.length === 0 && <li className="text-sm text-muted">No rules matched.</li>}
              {data.qualification.map((q) => (
                <li key={q.id} className="flex items-center justify-between rounded-lg bg-sunken px-3 py-2 text-sm"><span>{q.label}</span><span className="font-semibold text-ok">+{q.points}</span></li>
              ))}
            </ul>

            {data.reviewFlags.length > 0 && (
              <div className="mt-6 rounded-xl border border-warn/40 bg-warn/10 p-3.5">
                <p className="text-sm font-semibold text-warn">Needs a look</p>
                <ul className="mt-1.5 space-y-1 text-sm">{data.reviewFlags.map((f, i) => <li key={i}>{f.detail ?? f.type}</li>)}</ul>
              </div>
            )}

            <h3 className="mb-2 mt-6 text-sm font-semibold">Where this came from</h3>
            <ul className="space-y-2">
              {data.sourceRecords.map((s) => (
                <li key={s.source + (s.recordId ?? '')} className="rounded-xl border border-line px-3.5 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{s.label}</span>
                    <Badge tone={s.state === 'fresh' ? 'ok' : s.state === 'stale' ? 'warn' : 'neutral'}>{s.state === 'purged' ? 'Needs refresh' : s.state}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">Retrieved {fullDate(s.retrievedAt)}{s.expiresAt && ` · keep until ${fullDate(s.expiresAt)}`}</p>
                  {s.attribution && <p className="mt-0.5 text-xs text-muted">{s.attribution}</p>}
                  {s.url && safeHref(s.url) && <a className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline" href={safeHref(s.url)} target="_blank" rel="noopener noreferrer">Open at source<ExternalLink className="h-3 w-3" /></a>}
                </li>
              ))}
            </ul>
            {google && <p className="mt-2 text-xs font-semibold text-muted">Powered by Google</p>}

            {data.lists.length > 0 && (<><h3 className="mb-2 mt-6 text-sm font-semibold">In lists</h3><div className="flex flex-wrap gap-2">{data.lists.map((l) => <Badge key={l.id} tone="brand">{l.name}</Badge>)}</div></>)}

            <h3 className="mb-2 mt-6 text-sm font-semibold">Notes</h3>
            <textarea className="field min-h-24" maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!can('business:write')} placeholder="Add context for your team" aria-label="Notes" />
            {can('business:write') && <div className="mt-2 flex justify-end"><Button size="sm" variant="primary" loading={save.isPending} disabled={notes === (data.notes ?? '')} onClick={() => save.mutate()}>Save notes</Button></div>}
            <p className="mt-6 text-xs text-muted">Last checked {timeAgo(data.lastCheckedAt)} · Added {timeAgo(data.createdAt)}</p>
          </>
        )}
      </div>
    </Drawer>
  );
}
