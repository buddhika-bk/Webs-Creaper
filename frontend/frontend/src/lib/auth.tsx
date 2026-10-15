import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as client from './api';
import { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (permission: string) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    client.setSessionEndedHandler(() => { setUser(null); qc.clear(); });
    client.refreshSession().then((s) => { setUser(s?.user ?? null); setLoading(false); });
  }, [qc]);

  const signIn = useCallback(async (email: string, password: string) => {
    const s = await client.login(email, password);
    setUser(s.user);
  }, []);

  const signOut = useCallback(async () => {
    await client.logout().catch(() => undefined);
    setUser(null);
    qc.clear();
  }, [qc]);

  const value = useMemo<AuthState>(() => ({
    user, loading, signIn, signOut,
    can: (p: string) => !!user?.permissions.includes(p),
  }), [user, loading, signIn, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
