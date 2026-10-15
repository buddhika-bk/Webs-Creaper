import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
const Ctx = createContext<{ mode: ThemeMode; setMode: (m: ThemeMode) => void }>({ mode: 'system', setMode: () => undefined });

function apply(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => (localStorage.getItem('wp-theme') as ThemeMode) || 'system');
  useEffect(() => {
    apply(mode);
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => apply('system');
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [mode]);
  const setMode = (m: ThemeMode) => { localStorage.setItem('wp-theme', m); setModeState(m); };
  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
