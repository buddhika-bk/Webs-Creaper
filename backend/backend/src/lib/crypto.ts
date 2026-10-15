import crypto from 'node:crypto';

export const uuid = () => crypto.randomUUID();
export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
export const hmac = (secret: string, v: string) => crypto.createHmac('sha256', secret).update(v).digest('hex');
export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
