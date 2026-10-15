import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Skeleton, Switch } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Role, TeamUser, WorkspaceInfo } from '../lib/types';
import { errorMessage, timeAgo } from '../lib/utils';

function Password() {
  const { signOut } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const m = useMutation({
    mutationFn: () => api('/auth/change-password', { method: 'POST', body: { currentPassword: cur, newPassword: next } }),
    onSuccess: async () => { toast.success('Password changed. Please sign in again.'); await signOut(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Password</h2>
      <p className="mt-1 text-sm text-muted">Use at least 12 characters with upper case, lower case and a number. You will be signed out on every device.</p>
      <form onSubmit={submit} className="mt-4 grid max-w-xl gap-4 sm:grid-cols-2">
        <Field label="Current password">{(id) => <Input id={id} type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />}</Field>
        <Field label="New password">{(id) => <Input id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}</Field>
        <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={m.isPending} disabled={!cur || next.length < 12}>Change password</Button></div>
      </form>
    </Card>
  );
}

function Workspace() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const ws = useQuery({ queryKey: ['workspace'], queryFn: () => api<WorkspaceInfo>('/workspace') });
  const [draft, setDraft] = useState<WorkspaceInfo['quotas'] | null>(null);
  const q = draft ?? ws.data?.quotas;
  const save = useMutation({
    mutationFn: () => api<WorkspaceInfo>('/workspace', { method: 'PATCH', body: draft }),
    onSuccess: (d) => { qc.setQueryData(['workspace'], d); setDraft(null); toast.success('Limits saved'); void qc.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const owner = can('workspace:manage');
  const num = (k: keyof WorkspaceInfo['quotas'], label: string, step = 1) => (
    <Field label={label}>{(id) => <Input id={id} type="number" min={0} step={step} disabled={!owner} value={q?.[k] ?? ''} onChange={(e) => q && setDraft({ ...q, [k]: Number(e.target.value) })} />}</Field>
  );
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Workspace limits</h2>
      <p className="mt-1 text-sm text-muted">Quotas keep usage and API costs predictable.{!owner && ' Only the owner can change them.'}</p>
      {ws.isLoading || !q ? <Skeleton className="mt-4 h-24 w-full" /> : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {num('maxResultsPerSearch', 'Max results per search')}{num('dailySearches', 'Searches per day')}{num('dailyExports', 'Exports per day')}{num('monthlyApiBudgetUsd', 'Monthly API budget (USD)', 5)}
        </div>
      )}
      {owner && draft && <div className="mt-4 flex gap-2"><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save limits</Button><Button variant="ghost" onClick={() => setDraft(null)}>Discard</Button></div>}
    </Card>
  );
}

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: 'admin', label: 'Admin', hint: 'Manage team, sources and audit logs' },
  { value: 'analyst', label: 'Analyst', hint: 'Search, organise and export leads' },
  { value: 'viewer', label: 'Viewer', hint: 'View leads only' },
];

function AddUser({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', role: 'analyst' as Role, password: '' });
  const m = useMutation({
    mutationFn: () => api('/users', { method: 'POST', body: f }),
    onSuccess: () => { toast.success('Team member added'); void qc.invalidateQueries({ queryKey: ['team'] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title="Add a team member" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} disabled={!f.name || !f.email || f.password.length < 12} onClick={() => m.mutate()}>Add member</Button></>}>
      <div className="space-y-4">
        <Field label="Full name">{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={160} />}</Field>
        <Field label="Email">{(id) => <Input id={id} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
        <Field label="Role" hint={ROLES.find((r) => r.value === f.role)?.hint}>{(id) => (
          <Select id={id} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{ROLES.filter((r) => r.value !== 'admin' || user?.role === 'owner').map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select>)}
        </Field>
        <Field label="Temporary password" hint="At least 12 characters. Share it securely and ask them to change it.">{(id) => <Input id={id} type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}</Field>
      </div>
    </Modal>
  );
}

function Team() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const team = useQuery({ queryKey: ['team'], queryFn: () => api<{ items: TeamUser[] }>('/users') });
  const patch = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) => api(`/users/${v.id}`, { method: 'PATCH', body: v.body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['team'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div><h2 className="text-lg font-semibold">Team</h2><p className="text-sm text-muted">People who can use this workspace.</p></div>
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add member</Button>
      </div>
      {team.isLoading && <div className="p-5"><Skeleton className="h-16 w-full" /></div>}
      <ul className="divide-y divide-line">
        {team.data?.items.map((u) => {
          const locked = u.role === 'owner' || u.id === user?.id || (u.role === 'admin' && user?.role !== 'owner');
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <div className="min-w-[200px] flex-1"><p className="font-semibold">{u.name}{u.id === user?.id && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}</p><p className="text-xs text-muted">{u.email} · {u.lastLoginAt ? `signed in ${timeAgo(u.lastLoginAt)}` : 'never signed in'}</p></div>
              {u.role === 'owner' ? <Badge tone="accent">Owner</Badge> : (
                <Select aria-label={`Role for ${u.name}`} className="w-auto" disabled={locked} value={u.role} onChange={(e) => patch.mutate({ id: u.id, body: { role: e.target.value } })}>
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </Select>
              )}
              <div className="flex items-center gap-2 text-sm"><Switch label={`${u.name} active`} checked={u.isActive} disabled={locked} onChange={(v) => patch.mutate({ id: u.id, body: { isActive: v } })} /><span className="w-14 text-muted">{u.isActive ? 'Active' : 'Disabled'}</span></div>
            </li>
          );
        })}
      </ul>
      {adding && <AddUser onClose={() => setAdding(false)} />}
    </Card>
  );
}

export default function SettingsPage() {
  const { user, can } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description={`Signed in as ${user?.email} (${user?.role}).`} />
      <Password />
      <Workspace />
      {can('users:manage') && <Team />}
    </div>
  );
}
