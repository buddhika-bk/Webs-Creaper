import { Router } from 'express';
import { z } from 'zod';
import { one, parseJson, rows, run } from '../../db/pool';
import { uuid } from '../../lib/crypto';
import { asyncHandler, idParam, pageParams, paged } from '../../lib/http';
import { badRequest, notFound } from '../../lib/errors';
import { authenticate, requirePerm } from '../../middleware/auth';
import { defaultJobOptions, discoveryQueue } from '../../queue/queues';
import { getAdapter } from '../../sources/registry';
import { audit, ctxFrom } from '../audit/audit.service';
import { buildBusinessQuery, businessFilterSchema, SORTS } from './filters';

export const businessesRouter = Router();
businessesRouter.use(authenticate);

const TAGS_SQL = `(SELECT JSON_ARRAYAGG(JSON_OBJECT('id', t.id, 'name', t.name, 'color', t.color)) FROM business_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.business_id = b.id)`;
const SOURCES_SQL = `(SELECT GROUP_CONCAT(DISTINCT s.source ORDER BY s.source SEPARATOR ',') FROM business_sources s WHERE s.business_id = b.id)`;

export const businessDto = (b: any) => ({
  id: b.id,
  name: b.name,
  category: b.category,
  address: b.address,
  cityArea: b.city_area,
  phone: b.phone,
  website: b.website,
  facebookUrl: b.facebook_url,
  instagramUrl: b.instagram_url,
  otherSocials: parseJson<{ platform: string; url: string }[]>(b.other_socials, []),
  rating: b.rating,
  reviewCount: b.review_count,
  openStatus: b.open_status,
  verificationStatus: b.verification_status,
  leadScore: b.lead_score,
  qualification: parseJson(b.qualification, []),
  reviewFlags: parseJson(b.review_flags, []),
  notes: b.notes,
  archived: !!b.archived_at,
  sources: b.sources ? String(b.sources).split(',') : [],
  tags: parseJson<any[]>(b.tags, []),
  lastCheckedAt: b.last_checked_at,
  createdAt: b.created_at,
});

businessesRouter.get(
  '/',
  requirePerm('business:read'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pageParams.parse(req.query);
    const q = z.object({ sort: z.enum(['name', 'rating', 'reviews', 'score', 'checked', 'created', 'area']).default('score'), dir: z.enum(['asc', 'desc']).default('desc') }).parse(req.query);
    const f = businessFilterSchema.parse(req.query);
    const base = buildBusinessQuery(req.auth!.workspaceId, f);
    const order = `${SORTS[q.sort]} ${q.dir === 'asc' ? 'ASC' : 'DESC'}, b.id ASC`;
    const total = (await one<{ n: number }>(`SELECT COUNT(*) AS n FROM businesses b ${base.joins} WHERE ${base.where}`, [...base.joinParams, ...base.whereParams]))?.n ?? 0;
    const list = await rows(
      `SELECT b.*, ${SOURCES_SQL} AS sources, ${TAGS_SQL} AS tags FROM businesses b ${base.joins}
       WHERE ${base.where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...base.joinParams, ...base.whereParams, pageSize, (page - 1) * pageSize],
    );
    res.json(paged(list.map(businessDto), total, page, pageSize));
  }),
);

businessesRouter.get(
  '/:id',
  requirePerm('business:read'),
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const ws = req.auth!.workspaceId;
    const b = await one<any>(`SELECT b.*, ${SOURCES_SQL} AS sources, ${TAGS_SQL} AS tags FROM businesses b WHERE b.id = ? AND b.workspace_id = ?`, [id, ws]);
    if (!b) throw notFound('Business not found');
    const [sources, socials, contacts, lists, annotations] = await Promise.all([
      rows('SELECT source, source_record_id, source_url, attribution, rating, review_count, retrieved_at, expires_at, refresh_state FROM business_sources WHERE business_id = ? AND workspace_id = ? ORDER BY retrieved_at DESC', [id, ws]),
      rows('SELECT platform, url, source, evidence_url, confidence, ai_generated FROM business_socials WHERE business_id = ? AND workspace_id = ? ORDER BY confidence DESC', [id, ws]),
      rows('SELECT kind, value, is_primary, source, retrieved_at FROM business_contacts WHERE business_id = ? AND workspace_id = ?', [id, ws]),
      rows('SELECT l.id, l.name FROM lead_list_items li JOIN lead_lists l ON l.id = li.lead_list_id WHERE li.business_id = ? AND l.workspace_id = ?', [id, ws]),
      rows('SELECT field_name, value, model, prompt_version, confidence, source_evidence, created_at FROM ai_annotations WHERE business_id = ? AND workspace_id = ? ORDER BY created_at DESC LIMIT 20', [id, ws]),
    ]);
    res.json({
      ...businessDto(b),
      sourceRecords: sources.map((s: any) => {
        const a = getAdapter(s.source);
        return {
          source: s.source, label: a?.label ?? s.source, recordId: a?.compliance.exportSourceRecordId === false ? null : s.source_record_id, url: s.source_url,
          attribution: s.attribution, rating: s.rating, reviewCount: s.review_count, retrievedAt: s.retrieved_at, expiresAt: s.expires_at, state: s.refresh_state,
        };
      }),
      socialLinks: socials.map((s: any) => ({ platform: s.platform, url: s.url, source: s.source, evidenceUrl: s.evidence_url, confidence: Number(s.confidence), aiGenerated: !!s.ai_generated })),
      contacts: contacts.map((c: any) => ({ kind: c.kind, value: c.value, primary: !!c.is_primary, source: c.source, retrievedAt: c.retrieved_at })),
      lists,
      aiAnnotations: annotations.map((a: any) => ({ field: a.field_name, value: a.value, model: a.model, promptVersion: a.prompt_version, confidence: a.confidence === null ? null : Number(a.confidence), evidence: parseJson(a.source_evidence, null), createdAt: a.created_at, aiGenerated: true })),
    });
  }),
);

businessesRouter.patch(
  '/:id',
  requirePerm('business:write'),
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ notes: z.string().max(5000).nullable() }).parse(req.body);
    const r = await run('UPDATE businesses SET notes = ? WHERE id = ? AND workspace_id = ?', [body.notes?.trim() || null, id, req.auth!.workspaceId]);
    if (!r.affectedRows) throw notFound('Business not found');
    await audit(ctxFrom(req), 'business.update', 'business', id, { field: 'notes' });
    res.json({ ok: true });
  }),
);

const bulkSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add_to_list'), ids: z.array(z.string().uuid()).min(1).max(500), listId: z.string().uuid() }),
  z.object({ action: z.literal('remove_from_list'), ids: z.array(z.string().uuid()).min(1).max(500), listId: z.string().uuid() }),
  z.object({ action: z.literal('tag'), ids: z.array(z.string().uuid()).min(1).max(500), tagId: z.string().uuid().optional(), tagName: z.string().trim().min(1).max(60).optional() }),
  z.object({ action: z.literal('untag'), ids: z.array(z.string().uuid()).min(1).max(500), tagId: z.string().uuid() }),
  z.object({ action: z.literal('archive'), ids: z.array(z.string().uuid()).min(1).max(500) }),
  z.object({ action: z.literal('unarchive'), ids: z.array(z.string().uuid()).min(1).max(500) }),
  z.object({ action: z.literal('recheck'), ids: z.array(z.string().uuid()).min(1).max(100) }),
]);

businessesRouter.post(
  '/bulk-action',
  requirePerm('business:write'),
  asyncHandler(async (req, res) => {
    const body = bulkSchema.parse(req.body);
    const auth = req.auth!;
    // Only ids that belong to the caller's workspace are ever touched.
    const owned = (await rows<{ id: string }>('SELECT id FROM businesses WHERE workspace_id = ? AND id IN (?)', [auth.workspaceId, body.ids])).map((r) => r.id);
    if (!owned.length) throw notFound('No matching businesses');
    let affected = owned.length;

    switch (body.action) {
      case 'add_to_list': {
        const list = await one('SELECT id FROM lead_lists WHERE id = ? AND workspace_id = ?', [body.listId, auth.workspaceId]);
        if (!list) throw notFound('List not found');
        const r = await run('INSERT IGNORE INTO lead_list_items (lead_list_id, business_id, added_by) VALUES ?', [owned.map((id) => [body.listId, id, auth.userId])]);
        affected = r.affectedRows;
        break;
      }
      case 'remove_from_list': {
        const list = await one('SELECT id FROM lead_lists WHERE id = ? AND workspace_id = ?', [body.listId, auth.workspaceId]);
        if (!list) throw notFound('List not found');
        affected = (await run('DELETE FROM lead_list_items WHERE lead_list_id = ? AND business_id IN (?)', [body.listId, owned])).affectedRows;
        break;
      }
      case 'tag': {
        let tagId = body.tagId;
        if (!tagId && body.tagName) {
          const existing = await one<{ id: string }>('SELECT id FROM tags WHERE workspace_id = ? AND name = ?', [auth.workspaceId, body.tagName]);
          tagId = existing?.id ?? uuid();
          if (!existing) await run('INSERT INTO tags (id, workspace_id, name) VALUES (?,?,?)', [tagId, auth.workspaceId, body.tagName]);
        }
        if (!tagId) throw badRequest('Choose or name a tag');
        const tag = await one('SELECT id FROM tags WHERE id = ? AND workspace_id = ?', [tagId, auth.workspaceId]);
        if (!tag) throw notFound('Tag not found');
        affected = (await run('INSERT IGNORE INTO business_tags (business_id, tag_id) VALUES ?', [owned.map((id) => [id, tagId])])).affectedRows;
        break;
      }
      case 'untag': {
        const tag = await one('SELECT id FROM tags WHERE id = ? AND workspace_id = ?', [body.tagId, auth.workspaceId]);
        if (!tag) throw notFound('Tag not found');
        affected = (await run('DELETE FROM business_tags WHERE tag_id = ? AND business_id IN (?)', [body.tagId, owned])).affectedRows;
        break;
      }
      case 'archive':
        affected = (await run('UPDATE businesses SET archived_at = UTC_TIMESTAMP(3) WHERE id IN (?) AND workspace_id = ?', [owned, auth.workspaceId])).affectedRows;
        break;
      case 'unarchive':
        affected = (await run('UPDATE businesses SET archived_at = NULL WHERE id IN (?) AND workspace_id = ?', [owned, auth.workspaceId])).affectedRows;
        break;
      case 'recheck':
        await discoveryQueue.add('recheck', { kind: 'recheck', workspaceId: auth.workspaceId, businessIds: owned, userId: auth.userId }, { ...defaultJobOptions, attempts: 2 });
        break;
    }
    await audit(ctxFrom(req), `business.${body.action}`, 'business', null, { count: owned.length, affected });
    res.json({ action: body.action, requested: body.ids.length, matched: owned.length, affected });
  }),
);
