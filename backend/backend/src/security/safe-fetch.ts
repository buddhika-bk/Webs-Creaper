import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

/**
 * SSRF-safe page fetching for the enrichment worker: http/https only, blocks private / loopback / link-local
 * addresses at connect time (defeats DNS rebinding), caps redirects, size and time, accepts HTML/text only.
 */
const blocked = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
].forEach(([a, p]) => blocked.addSubnet(a as string, p as number, 'ipv4'));
[['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]].forEach(([a, p]) => blocked.addSubnet(a as string, p as number, 'ipv6'));

export function isBlockedAddress(address: string): boolean {
  if (address.startsWith('::ffff:')) return isBlockedAddress(address.slice(7));
  const family = net.isIPv6(address) ? 'ipv6' : net.isIPv4(address) ? 'ipv4' : null;
  if (!family) return true;
  return blocked.check(address, family);
}

const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...(options as dns.LookupOptions), all: true }, (err, addresses) => {
    if (err) return (callback as any)(err);
    const list = addresses as dns.LookupAddress[];
    const ok = list.filter((a) => !isBlockedAddress(a.address));
    if (!ok.length) return (callback as any)(new Error('Blocked destination address'));
    if ((options as dns.LookupOptions).all) return (callback as any)(null, ok);
    (callback as any)(null, ok[0].address, ok[0].family);
  });
};

export interface SafeResponse {
  status: number;
  url: string;
  body: string;
  contentType: string;
}

interface Opts {
  userAgent: string;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  accept?: RegExp;
}

export function validatePublicUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Unsupported protocol');
  if (u.username || u.password) throw new Error('Credentials in URL are not allowed');
  if (net.isIP(u.hostname) && isBlockedAddress(u.hostname)) throw new Error('Blocked destination address');
  if (u.hostname === 'localhost' || u.hostname.endsWith('.local') || u.hostname.endsWith('.internal')) throw new Error('Blocked host');
  return u;
}

export async function safeFetch(rawUrl: string, opts: Opts, redirects = 0): Promise<SafeResponse> {
  const url = validatePublicUrl(rawUrl);
  const maxBytes = opts.maxBytes ?? 1_500_000;
  const lib = url.protocol === 'https:' ? https : http;

  const result = await new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: 'GET',
        lookup: safeLookup,
        timeout: opts.timeoutMs ?? 8000,
        headers: { 'User-Agent': opts.userAgent, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.1', 'Accept-Encoding': 'identity' },
      },
      (res) => {
        const type = String(res.headers['content-type'] ?? '');
        const status = res.statusCode ?? 0;
        const isRedirect = status >= 300 && status < 400 && res.headers.location;
        if (!isRedirect && opts.accept && !opts.accept.test(type) && status < 400) {
          res.destroy();
          return reject(new Error('Unsupported content type'));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            res.destroy();
            return reject(new Error('Response too large'));
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end();
  });

  if (result.status >= 300 && result.status < 400 && result.headers.location) {
    if (redirects >= (opts.maxRedirects ?? 3)) throw new Error('Too many redirects');
    const next = new URL(String(result.headers.location), url).toString();
    return safeFetch(next, opts, redirects + 1);
  }
  return { status: result.status, url: url.toString(), body: result.body.toString('utf8'), contentType: String(result.headers['content-type'] ?? '') };
}
