import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { ButtonHTMLAttributes, forwardRef, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, useEffect, useId, useRef } from 'react';
import { cn } from '../../lib/utils';

/* ---------- Button ---------- */
type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand/90',
  accent: 'bg-accent text-white hover:bg-accent/90',
  secondary: 'border border-line bg-surface text-ink hover:bg-sunken',
  ghost: 'text-muted hover:bg-sunken hover:text-ink',
  danger: 'bg-danger text-white hover:bg-danger/90',
};
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode;
}
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, children, className, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        size === 'sm' && 'px-3 py-1.5 text-[13px]', size === 'md' && 'px-4 py-2.5 text-sm', size === 'lg' && 'px-6 py-3.5 text-[15px]',
        VARIANTS[variant], className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

/* ---------- Badge ---------- */
type Tone = 'neutral' | 'brand' | 'accent' | 'ok' | 'warn' | 'danger';
const TONES: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted',
  brand: 'bg-brand-soft text-brand',
  accent: 'bg-accent-soft text-accent',
  ok: 'bg-ok/12 text-ok',
  warn: 'bg-warn/14 text-warn',
  danger: 'bg-danger/12 text-danger',
};
export const Badge = ({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) => (
  <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', TONES[tone], className)}>{children}</span>
);

/* ---------- Layout bits ---------- */
export const Card = ({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) => <div className={cn('card', className)} {...rest}>{children}</div>;

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('skeleton h-4', className)} aria-hidden />;

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">{icon}</div>}
      <p className="font-display text-lg font-semibold">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export const ProgressBar = ({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'accent' | 'ok' }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
    <div className={cn('h-full rounded-full transition-all duration-500', tone === 'brand' && 'bg-brand', tone === 'accent' && 'bg-accent', tone === 'ok' && 'bg-ok')} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
  </div>
);

/* ---------- Form controls ---------- */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn('field', className)} {...p} />;
});

export const Select = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cn('field appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', className)}
    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238090b0' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...p}>
    {children}
  </select>
);

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold">{label}</label>
      {children(id)}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export const Checkbox = ({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; label: string }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()} className="h-4 w-4 cursor-pointer rounded border-line accent-[rgb(var(--brand))]" />
  );
};

export const Switch = ({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
    className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-brand' : 'bg-line')}>
    <span className={cn('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
  </button>
);

/** Three-way chooser used for "any / has / has not" filters. */
export function TriState({ value, onChange, labels = ['Any', 'Has', 'Missing'] }: { value: boolean | undefined; onChange: (v: boolean | undefined) => void; labels?: [string, string, string] }) {
  const opts: [boolean | undefined, string][] = [[undefined, labels[0]], [true, labels[1]], [false, labels[2]]];
  return (
    <div className="inline-flex rounded-xl bg-sunken p-0.5" role="radiogroup">
      {opts.map(([v, l]) => (
        <button key={l} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn('rounded-[10px] px-3 py-1.5 text-[13px] font-semibold transition-colors', value === v ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>{l}</button>
      ))}
    </div>
  );
}

/* ---------- Overlays ---------- */
function useEscape(onClose: () => void, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', fn);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', fn); document.body.style.overflow = prev; };
  }, [open, onClose]);
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  useEscape(onClose, open);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={cn('relative max-h-[90vh] w-full animate-riseIn overflow-y-auto rounded-2xl border border-line bg-surface shadow-pop outline-none', size === 'sm' && 'max-w-sm', size === 'md' && 'max-w-lg', size === 'lg' && 'max-w-2xl')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEscape(onClose, open);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-ink/35" onClick={onClose} aria-hidden />
      <aside ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className="absolute inset-y-0 right-0 flex w-full max-w-[520px] animate-slideIn flex-col border-l border-line bg-surface shadow-pop outline-none">
        {children}
      </aside>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onClose, loading, danger }: {
  open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; loading?: boolean; danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <p className="text-sm text-muted">{message}</p>
    </Modal>
  );
}

/* ---------- Pagination ---------- */
export function Pagination({ page, totalPages, total, pageSize, onPage }: { page: number; totalPages: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
      <span className="text-muted">{from}-{to} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="px-2 text-muted">Page {page} of {totalPages}</span>
        <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cn('h-5 w-5 animate-spin text-muted', className)} aria-label="Loading" />;
