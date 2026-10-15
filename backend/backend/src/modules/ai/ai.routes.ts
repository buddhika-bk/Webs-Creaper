import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/http';
import { authenticate, requirePerm } from '../../middleware/auth';
import { limiters } from '../../middleware/rateLimit';
import { audit, ctxFrom } from '../audit/audit.service';
import { parseSearchText } from './provider';

export const aiRouter = Router();
aiRouter.use(authenticate, requirePerm('search:create'));

/** Natural-language search → structured filters. Nothing runs until the user reviews and submits the structured search. */
aiRouter.post('/parse-query', limiters.ai, asyncHandler(async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(3).max(300) }).parse(req.body);
  const result = await parseSearchText(text);
  await audit(ctxFrom(req), 'ai.parse_query', null, null, { provider: result.provider, model: result.model, promptVersion: result.promptVersion, confidence: result.confidence });
  res.json(result);
}));
