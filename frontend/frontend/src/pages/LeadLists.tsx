import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LeadsExplorer } from '../components/leads/LeadsExplorer';
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { LeadList } from '../lib/types';
import { errorMessage, timeAgo } from '../lib/utils';

function ListForm({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: LeadList }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const save = useMutation({
    mutationFn: () => api<LeadList>(initial ? `/lead-lists/${initial.id}` : '/lead-lists', { method: initial ? 'PATCH' : 'POST', body: { name: name.trim(), description: description.trim() || null } }),
    onSuccess: () => { toast.success(initial ? 'List updated' : 'List created'); void qc.invalidateQueries({ queryKey: ['lists'] }); void qc.invalidateQueries({ queryKey: ['list'] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (name.trim()) save.mutate(); };
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit list' : 'New lead list'} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>{initial ? 'Save changes' : 'Create list'}</Button></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">{(id) => <Input id={id} autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Malabe bookshops, no website" />}</Field>
        <Field label="Description (optional)">{(id) => <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />}</Field>
      </form>
    </Modal>
  );
}

export function LeadListsPage() {
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const lists = useQuery({ queryKey: ['lists'], queryFn: () => api<{ items: LeadList[] }>('/lead-lists') });
  return (
    <div>
      <PageHeader title="Lead lists" description="Group leads by campaign, area or follow-up stage."
        actions={can('lists:write') ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>New list</Button> : undefined} />
      {lists.isLoading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-card" />)}</div>}
      {lists.data?.items.length === 0 && <Card><EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No lists yet" hint="Select leads in your search results and add them to a list." /></Card>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {lists.data?.items.map((l) => (
          <Link key={l.id} to={`/lists/${l.id}`} className="card block p-5 transition-colors hover:border-brand">
            <p className="truncate font-display text-lg font-semibold">{l.name}</p>
            <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-muted">{l.description ?? 'No description'}</p>
            <div className="mt-3 flex justify-between text-sm"><span className="font-semibold">{l.count} leads</span><span className="text-muted">Updated {timeAgo(l.updatedAt)}</span></div>
          </Link>
        ))}
      </div>
      {creating && <ListForm open onClose={() => setCreating(false)} />}
    </div>
  );
}

export function ListDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const list = useQuery({ queryKey: ['list', id], queryFn: () => api<LeadList>(`/lead-lists/${id}`), enabled: !!id });
  const del = useMutation({
    mutationFn: () => api(`/lead-lists/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('List deleted. The leads themselves are kept.'); void qc.invalidateQueries({ queryKey: ['lists'] }); nav('/lists'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (list.isError) return <Card><EmptyState title="This list could not be found" action={<Link to="/lists"><Button variant="primary">Back to lists</Button></Link>} /></Card>;
  return (
    <div>
      <Link to="/lists" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />All lists</Link>
      <PageHeader title={list.data?.name ?? 'Loading...'} description={list.data?.description ?? undefined}
        actions={can('lists:write') && list.data ? <><Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Edit</Button><Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(true)}>Delete</Button></> : undefined} />
      {id && <LeadsExplorer base={{ listId: id }} listId={id} title="Leads in this list" empty={<EmptyState icon={<ClipboardList className="h-6 w-6" />} title="This list is empty" hint="Add leads from your search results." />} />}
      {editing && list.data && <ListForm open onClose={() => setEditing(false)} initial={list.data} />}
      <ConfirmDialog open={confirm} danger title="Delete this list?" message="The list is removed. The leads inside it stay in your workspace." confirmLabel="Delete list" loading={del.isPending} onConfirm={() => del.mutate()} onClose={() => setConfirm(false)} />
    </div>
  );
}
