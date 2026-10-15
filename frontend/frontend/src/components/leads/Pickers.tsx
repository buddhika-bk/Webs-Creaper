import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { LeadList, Tag } from '../../lib/types';
import { Button, Label, Modal } from '../ui';

export function ListPickerModal({ open, onClose, count, onPick }: { open: boolean; onClose: () => void; count: number; onPick: (listId: string) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const lists = useQuery({ queryKey: ['lists'], enabled: open, queryFn: () => api<{ items: LeadList[] }>('/lead-lists') });
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const create = useMutation({
    mutationFn: () => api<LeadList>('/lead-lists', { method: 'POST', body: { name } }),
    onSuccess: (l) => { void qc.invalidateQueries({ queryKey: ['lists'] }); setName(''); onPick(l.id); },
    onError: (e: Error) => toast.push('error', e.message),
  });
  return (
    <Modal open={open} onClose={onClose} title={`Add ${count} to a list`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!selected && name.trim().length < 2} loading={create.isPending} onClick={() => (name.trim().length >= 2 ? create.mutate() : onPick(selected))}>Add to list</Button></>}>
      {(lists.data?.items.length ?? 0) > 0 && (
        <fieldset className="mb-4"><legend className="mb-1.5 text-sm font-medium">Choose a list</legend>
          <div className="max-h-48 space-y-1 overflow-y-auto">{lists.data!.items.map((l) => (
            <label key={l.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-sunken">
              <input type="radio" name="list" checked={selected === l.id} onChange={() => { setSelected(l.id); setName(''); }} className="accent-[rgb(var(--brand))]" />
              <span className="flex-1 text-[15px]">{l.name}</span><span className="text-sm text-muted">{l.count}</span>
            </label>))}</div>
        </fieldset>
      )}
      <Label htmlFor="newlist">Or create a new list</Label>
      <input id="newlist" className="field" maxLength={120} value={name} onChange={(e) => { setName(e.target.value); if (e.target.value) setSelected(''); }} placeholder="Bookshops in Malabe" />
    </Modal>
  );
}

export function TagModal({ open, onClose, count, onPick }: { open: boolean; onClose: () => void; count: number; onPick: (t: { tagId?: string; tagName?: string }) => void }) {
  const tags = useQuery({ queryKey: ['tags'], enabled: open, queryFn: () => api<{ items: Tag[] }>('/tags') });
  const [name, setName] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={`Tag ${count} business${count === 1 ? '' : 'es'}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={name.trim().length < 1} onClick={() => { const ex = tags.data?.items.find((t) => t.name.toLowerCase() === name.trim().toLowerCase()); onPick(ex ? { tagId: ex.id } : { tagName: name.trim() }); setName(''); }}>Apply tag</Button></>}>
      <Label htmlFor="tagname">Tag name</Label>
      <input id="tagname" list="taglist" className="field" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Call first" />
      <datalist id="taglist">{tags.data?.items.map((t) => <option key={t.id} value={t.name} />)}</datalist>
      <p className="mt-2 text-sm text-muted">Pick an existing tag or type a new one.</p>
    </Modal>
  );
}
