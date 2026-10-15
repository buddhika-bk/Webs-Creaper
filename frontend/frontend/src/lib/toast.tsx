import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

type Kind = 'success' | 'error';
interface ToastItem { id: number; kind: Kind; message: string }
const Ctx = createContext<(kind: Kind, message: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: Kind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((i) => [...i.slice(-3), { id, kind, message }]);
    setTimeout(() => setItems((i) => i.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex animate-riseIn items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-pop">
            {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" /> : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />}
            <p className="flex-1 text-sm">{t.message}</p>
            <button aria-label="Dismiss" className="text-muted hover:text-ink" onClick={() => setItems((i) => i.filter((x) => x.id !== t.id))}><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => {
  const push = useContext(Ctx);
  return { success: (m: string) => push('success', m), error: (m: string) => push('error', m) };
};
