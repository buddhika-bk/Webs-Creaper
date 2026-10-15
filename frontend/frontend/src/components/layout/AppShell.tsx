import { useQuery } from '@tanstack/react-query';
import { Bell, ClipboardList, Download, Globe2, LayoutDashboard, LogOut, Menu, Monitor, Moon, ScrollText, Search, Settings, Sun, X } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ThemeMode, useTheme } from '../../lib/theme';
import { cn, timeAgo } from '../../lib/utils';
import { SearchJob } from '../../lib/types';
import { Logo } from './Logo';

interface NavItem { to: string; label: string; icon: ReactNode; perm?: string }
const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
  { to: '/find', label: 'Find leads', icon: <Search className="h-[18px] w-[18px]" /> },
  { to: '/lists', label: 'Lead lists', icon: <ClipboardList className="h-[18px] w-[18px]" /> },
  { to: '/exports', label: 'Exports', icon: <Download className="h-[18px] w-[18px]" /> },
  { to: '/sources', label: 'Sources', icon: <Globe2 className="h-[18px] w-[18px]" /> },
  { to: '/audit', label: 'Audit logs', icon: <ScrollText className="h-[18px] w-[18px]" />, perm: 'audit:read' },
  { to: '/settings', label: 'Settings', icon: <Settings className="h-[18px] w-[18px]" /> },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={onNavigate}
          className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
            isActive ? 'bg-brand text-white' : 'text-muted hover:bg-sunken hover:text-ink')}>
          {n.icon}{n.label}
        </NavLink>
      ))}
    </nav>
  );
}

function ThemeControl() {
  const { mode, setMode } = useTheme();
  const opts: [ThemeMode, ReactNode, string][] = [['light', <Sun key="l" className="h-4 w-4" />, 'Light'], ['system', <Monitor key="s" className="h-4 w-4" />, 'System'], ['dark', <Moon key="d" className="h-4 w-4" />, 'Dark']];
  return (
    <div className="inline-flex rounded-xl bg-sunken p-0.5" role="radiogroup" aria-label="Theme">
      {opts.map(([m, icon, label]) => (
        <button key={m} role="radio" aria-checked={mode === m} aria-label={label} title={label} onClick={() => setMode(m)}
          className={cn('rounded-[10px] p-2 transition-colors', mode === m ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>{icon}</button>
      ))}
    </div>
  );
}

/** Notifications = the workspace's latest search activity. */
function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ items: SearchJob[] }>('/search-jobs', { query: { pageSize: 6 } }), refetchInterval: 20_000 });
  useEffect(() => {
    const fn = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);
  const active = data?.items.filter((j) => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(j.status)).length ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button aria-label="Notifications" aria-expanded={open} onClick={() => setOpen(!open)} className="relative rounded-xl p-2.5 text-muted hover:bg-sunken hover:text-ink">
        <Bell className="h-5 w-5" />
        {active > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-surface" />}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 animate-riseIn rounded-2xl border border-line bg-surface p-2 shadow-pop">
          <p className="px-3 py-2 text-sm font-semibold">Recent searches</p>
          {data?.items.length ? data.items.map((j) => (
            <NavLink key={j.id} to={`/find?job=${j.id}`} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 hover:bg-sunken">
              <p className="truncate text-sm font-semibold">{j.category} in {j.location}</p>
              <p className="text-xs text-muted">{j.status === 'COMPLETED' ? `${j.metrics.matchedRecords} leads found` : j.status.toLowerCase().replace('_', ' ')} · {timeAgo(j.createdAt)}</p>
            </NavLink>
          )) : <p className="px-3 py-6 text-center text-sm text-muted">No searches yet.</p>}
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  useEffect(() => setDrawer(false), [loc.pathname]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
        <div className="px-2 pb-6"><Logo /></div>
        <SidebarNav />
        <div className="mt-auto rounded-2xl bg-sunken p-3.5">
          <p className="truncate text-sm font-semibold">{user?.name}</p>
          <p className="truncate text-xs capitalize text-muted">{user?.role} · {user?.email}</p>
          <button onClick={() => void signOut()} className="mt-3 flex w-full items-center gap-2 rounded-lg text-[13px] font-semibold text-muted hover:text-danger"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-slideIn flex-col bg-surface px-4 py-5">
            <div className="flex items-center justify-between px-2 pb-6"><Logo /><button aria-label="Close menu" onClick={() => setDrawer(false)}><X className="h-5 w-5" /></button></div>
            <SidebarNav onNavigate={() => setDrawer(false)} />
            <button onClick={() => void signOut()} className="mt-auto flex items-center gap-2 px-3 py-2 text-sm font-semibold text-muted"><LogOut className="h-4 w-4" />Sign out</button>
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-xl p-2 text-muted hover:bg-sunken lg:hidden" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu className="h-5 w-5" /></button>
            <div className="lg:hidden"><Logo /></div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeControl />
            <Notifications />
            <div className="ml-1 grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-bold text-white" title={user?.name}>{user?.name.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8"><Outlet /></main>
      </div>
    </div>
  );
}
