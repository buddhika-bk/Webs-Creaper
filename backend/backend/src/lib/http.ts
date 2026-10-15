import { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const pageParams = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const idParam = z.object({ id: z.string().uuid() });

export function paged<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export const boolish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

export const idempotencyKey = (req: Request): string | null => {
  const raw = req.header('Idempotency-Key');
  if (!raw) return null;
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(raw)) return null;
  return raw;
};
