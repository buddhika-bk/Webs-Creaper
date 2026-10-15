import argon2 from 'argon2';
import { z } from 'zod';

const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string) => argon2.hash(plain, OPTIONS);

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummy: string | null = null;
/** Verifies against a dummy hash so unknown emails take as long as wrong passwords (no user enumeration by timing). */
export async function burnVerify(plain: string) {
  dummy ??= await hashPassword('dummy-password-for-timing-equalisation');
  await verifyPassword(dummy, plain);
}

export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(128, 'Use at most 128 characters')
  .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p), 'Include upper case, lower case and a number');
