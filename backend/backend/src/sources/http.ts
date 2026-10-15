export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SourceHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface Opts {
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

/** JSON fetch with timeout and exponential backoff (+jitter) on transient errors (429/5xx/network). */
export async function fetchJson<T>(url: string, init: RequestInit, opts: Opts = {}): Promise<{ data: T; status: number }> {
  const retries = opts.retries ?? 3;
  let attempt = 0;
  for (;;) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal, redirect: 'error' });
      if (res.ok) return { data: (await res.json()) as T, status: res.status };
      const transient = res.status === 429 || res.status >= 500;
      if (!transient || attempt >= retries) {
        throw new SourceHttpError(res.status, `Source responded with HTTP ${res.status}`);
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : backoff(attempt));
    } catch (err) {
      if (err instanceof SourceHttpError) throw err;
      if (opts.signal?.aborted) throw err;
      if (attempt >= retries) throw err;
      await sleep(backoff(attempt));
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
    attempt += 1;
  }
}

const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 400);
