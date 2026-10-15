import { FormEvent, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button, Field, Input } from '../components/ui';
import { LogoMark } from '../components/layout/Logo';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/utils';

export default function Login() {
  const { user, signIn, loading } = useAuth();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user && !loading) return <Navigate to={(loc.state as { from?: string } | null)?.from ?? '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await signIn(email.trim(), password); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-deep p-12 text-white lg:flex">
        <div className="flex items-center gap-3"><LogoMark size={36} /><span className="font-display text-xl font-bold">WebPoint Leads</span></div>
        <div className="max-w-lg">
          <p className="font-display text-5xl font-semibold leading-[1.05]">Know who to call before you pick up the phone.</p>
          <p className="mt-5 text-base text-white/70">Search a business type and a town. Review phone, website and social presence in one table, then export the leads worth contacting.</p>
        </div>
        <ul className="grid max-w-lg grid-cols-3 gap-4 text-sm">
          {[['Bookshops in Malabe', '41 found'], ['Salons in Kandy', '67 found'], ['Hotels in Galle', '52 found']].map(([a, b]) => (
            <li key={a} className="rounded-2xl border border-white/15 bg-white/5 p-4"><p className="text-white/70">{a}</p><p className="mt-1 font-display text-lg font-semibold text-accent">{b}</p></li>
          ))}
        </ul>
      </div>

      <div className="grid place-items-center px-5 py-12">
        <form onSubmit={submit} className="w-full max-w-sm" noValidate>
          <div className="mb-8 flex items-center gap-3 lg:hidden"><LogoMark size={36} /><span className="font-display text-xl font-bold">WebPoint Leads</span></div>
          <h1 className="text-3xl font-semibold">Sign in</h1>
          <p className="mb-8 mt-1.5 text-sm text-muted">Use the account your workspace owner created for you.</p>
          <div className="space-y-4">
            <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.lk" />}</Field>
            <Field label="Password">{(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm font-medium text-danger">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" loading={busy || loading} disabled={!email || !password}>Sign in</Button>
        </form>
      </div>
    </div>
  );
}
