import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const FindLeads = lazy(() => import('./pages/FindLeads'));
const LeadLists = lazy(() => import('./pages/LeadLists').then((m) => ({ default: m.LeadListsPage })));
const ListDetail = lazy(() => import('./pages/LeadLists').then((m) => ({ default: m.ListDetailPage })));
const Exports = lazy(() => import('./pages/Exports'));
const Sources = lazy(() => import('./pages/Sources'));
const Settings = lazy(() => import('./pages/Settings'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const NotFound = lazy(() => import('./pages/NotFound'));

const Loading = () => <div className="grid min-h-[40vh] place-items-center"><Spinner className="h-7 w-7" /></div>;

function Protected() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <Outlet />;
}

function RequirePerm({ perm }: { perm: string }) {
  const { can } = useAuth();
  return can(perm) ? <Outlet /> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Protected />}>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="find" element={<FindLeads />} />
            <Route path="lists" element={<LeadLists />} />
            <Route path="lists/:id" element={<ListDetail />} />
            <Route path="exports" element={<Exports />} />
            <Route path="sources" element={<Sources />} />
            <Route path="settings" element={<Settings />} />
            <Route element={<RequirePerm perm="audit:read" />}><Route path="audit" element={<AuditLogs />} /></Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
