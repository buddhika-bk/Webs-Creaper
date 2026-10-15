import { Db, isDuplicateKey, one, parseJson, rows, run } from '../db/pool';
import { sha256, uuid } from '../lib/crypto';
import { NormalizedBusiness, similarity } from './normalize';
import { qualify, verificationStatus } from './qualify';

export type Outcome = 'new' | 'updated' | 'merged';

export interface PersistPolicy {
  retentionDays: number | null;
  storeRaw: boolean;
  attribution: string;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

async function updateFields(id: string, n: NormalizedBusiness, overwrite: boolean) {
  const fields: [string, unknown][] = [
    ['address', n.address], ['normalized_address', n.normalizedAddress], ['city_area', n.cityArea], ['normalized_city', n.normalizedCity],
    ['phone', n.phone], ['phone_normalized', n.phoneE164], ['phone_hash', n.phoneHash],
    ['website', n.website], ['website_domain', n.websiteDomain],
    ['rating', n.rating], ['review_count', n.reviewCount], ['rating_source', n.rating !== null ? n.source.id : null], ['open_status', n.openStatus],
  ];
  // Column names come from the constant list above, never from user input.
  const set = fields.map(([c]) => (overwrite ? `${c} = COALESCE(?, ${c})` : `${c} = COALESCE(${c}, ?)`)).join(', ');
  await run(`UPDATE businesses SET ${set}, last_checked_at = UTC_TIMESTAMP(3) WHERE id = ?`, [...fields.map((f) => f[1]), id]);
}

async function insertBusiness(id: string, workspaceId: string, n: NormalizedBusiness) {
  await run(
    `INSERT INTO businesses (id, workspace_id, name, normalized_name, category, normalized_category, address, normalized_address,
       city_area, normalized_city, phone, phone_normalized, phone_hash, website, website_domain, rating, review_count, rating_source,
       open_status, fingerprint)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, workspaceId, n.name, n.normalizedName, n.category, n.normalizedCategory, n.address, n.normalizedAddress,
      n.cityArea, n.normalizedCity, n.phone, n.phoneE164, n.phoneHash, n.website, n.websiteDomain, n.rating, n.reviewCount,
      n.rating !== null ? n.source.id : null, n.openStatus, n.fingerprint,
    ],
  );
}

export async function addSocial(
  workspaceId: string,
  businessId: string,
  s: { platform: string; url: string; source: string; evidenceUrl?: string | null; confidence: number; aiGenerated?: boolean },
) {
  await run(
    `INSERT INTO business_socials (id, business_id, workspace_id, platform, url, url_hash, source, evidence_url, confidence, ai_generated)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE confidence = GREATEST(confidence, VALUES(confidence))`,
    [uuid(), businessId, workspaceId, s.platform, s.url, sha256(s.url), s.source, s.evidenceUrl ?? null, s.confidence, s.aiGenerated ? 1 : 0],
  );
}

/** Denormalised columns (used by the results table) are always derived from business_socials, the provenance table. */
export async function refreshSocialColumns(businessId: string) {
  const list = await rows<{ platform: string; url: string }>(
    'SELECT platform, url FROM business_socials WHERE business_id = ? ORDER BY confidence DESC, created_at ASC',
    [businessId],
  );
  const fb = list.find((s) => s.platform === 'facebook')?.url ?? null;
  const ig = list.find((s) => s.platform === 'instagram')?.url ?? null;
  const others = list.filter((s) => s.platform !== 'facebook' && s.platform !== 'instagram').map((s) => ({ platform: s.platform, url: s.url }));
  await run('UPDATE businesses SET facebook_url = ?, instagram_url = ?, other_socials = ? WHERE id = ?', [fb, ig, others.length ? JSON.stringify(others) : null, businessId]);
}

export async function mergeFlags(id: string, flags: { type: string; detail?: string; businessIds?: string[] }[]) {
  if (!flags.length) return;
  const row = await one<{ review_flags: unknown }>('SELECT review_flags FROM businesses WHERE id = ?', [id]);
  const current = parseJson<any[]>(row?.review_flags, []);
  const types = new Set(flags.map((f) => f.type));
  const next = [...current.filter((f) => !types.has(f.type)), ...flags];
  await run('UPDATE businesses SET review_flags = ? WHERE id = ?', [JSON.stringify(next), id]);
}

/** Fuzzy matching is ONLY a secondary step that raises a review flag. Records are never merged on similar names. */
async function flagPossibleDuplicates(id: string, workspaceId: string, n: NormalizedBusiness) {
  const first = n.normalizedName.split(' ')[0];
  if (!first || first.length < 3) return;
  const cands = await rows<{ id: string; normalized_name: string }>(
    `SELECT id, normalized_name FROM businesses
     WHERE workspace_id = ? AND normalized_city <=> ? AND normalized_category = ? AND id <> ? AND normalized_name LIKE ? LIMIT 25`,
    [workspaceId, n.normalizedCity, n.normalizedCategory, id, `${escapeLike(first)}%`],
  );
  const hits = cands.filter((c) => similarity(c.normalized_name, n.normalizedName) >= 0.7).map((c) => c.id);
  if (hits.length) await mergeFlags(id, [{ type: 'possible_duplicate', detail: 'Similar name in the same area. Review before treating as separate.', businessIds: hits.slice(0, 5) }]);
}

export async function recomputeBusiness(id: string) {
  const b = await one<any>('SELECT * FROM businesses WHERE id = ?', [id]);
  if (!b) return;
  const c = await one<{ n: number }>("SELECT COUNT(*) AS n FROM business_sources WHERE business_id = ? AND source <> 'demo' AND refresh_state <> 'purged'", [id]);
  const q = qualify({ ...b, other_socials: parseJson<unknown[]>(b.other_socials, []) });
  await run('UPDATE businesses SET verification_status = ?, lead_score = ?, qualification = ? WHERE id = ?', [
    verificationStatus(b, c?.n ?? 0), q.score, JSON.stringify(q.reasons), id,
  ]);
}

export async function persistBusiness(
  workspaceId: string,
  jobId: string | null,
  n: NormalizedBusiness,
  policy: PersistPolicy,
): Promise<{ id: string; outcome: Outcome }> {
  const expiresAt = policy.retentionDays === null ? null : new Date(Date.now() + policy.retentionDays * 86_400_000);
  const raw = policy.storeRaw && n.source.raw ? JSON.stringify(n.source.raw) : null;
  let id: string;
  let outcome: Outcome;

  const bySource = await one<{ business_id: string }>(
    'SELECT business_id FROM business_sources WHERE workspace_id = ? AND source = ? AND source_record_id = ?',
    [workspaceId, n.source.id, n.source.recordId],
  );

  if (bySource) {
    id = bySource.business_id;
    outcome = 'updated';
    await updateFields(id, n, true);
  } else {
    const existing = await one<{ id: string }>('SELECT id FROM businesses WHERE workspace_id = ? AND fingerprint = ?', [workspaceId, n.fingerprint]);
    if (existing) {
      id = existing.id;
      outcome = 'merged';
      await updateFields(id, n, false);
    } else {
      id = uuid();
      try {
        await insertBusiness(id, workspaceId, n);
        outcome = 'new';
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
        const ex = await one<{ id: string }>('SELECT id FROM businesses WHERE workspace_id = ? AND fingerprint = ?', [workspaceId, n.fingerprint]);
        if (!ex) throw err;
        id = ex.id;
        outcome = 'merged';
        await updateFields(id, n, false);
      }
    }
  }

  await run(
    `INSERT INTO business_sources (id, business_id, workspace_id, source, source_record_id, source_url, attribution, rating, review_count, raw_payload, retrieved_at, expires_at, refresh_state)
     VALUES (?,?,?,?,?,?,?,?,?,?, UTC_TIMESTAMP(3), ?, 'fresh')
     ON DUPLICATE KEY UPDATE source_url = VALUES(source_url), rating = VALUES(rating), review_count = VALUES(review_count),
       raw_payload = VALUES(raw_payload), retrieved_at = VALUES(retrieved_at), expires_at = VALUES(expires_at), refresh_state = 'fresh'`,
    [uuid(), id, workspaceId, n.source.id, n.source.recordId, n.source.url, policy.attribution.slice(0, 500), n.rating, n.reviewCount, raw, expiresAt],
  );

  if (n.phoneE164 && n.phone) {
    await run(
      `INSERT INTO business_contacts (id, business_id, workspace_id, kind, value, normalized_value, is_primary, source)
       VALUES (?,?,?,'phone',?,?,1,?) ON DUPLICATE KEY UPDATE retrieved_at = UTC_TIMESTAMP(3)`,
      [uuid(), id, workspaceId, n.phone, n.phoneE164, n.source.id],
    );
  }
  for (const s of n.socials) {
    await addSocial(workspaceId, id, { platform: s.platform, url: s.url, source: n.source.id, evidenceUrl: n.source.url, confidence: s.confidence });
  }
  if (n.socials.length) await refreshSocialColumns(id);

  if (jobId) {
    await run('INSERT IGNORE INTO job_businesses (job_id, business_id, workspace_id, is_new) VALUES (?,?,?,?)', [jobId, id, workspaceId, outcome === 'new' ? 1 : 0]);
  }
  if (n.qualityFlags.length) await mergeFlags(id, n.qualityFlags);
  if (outcome === 'new') await flagPossibleDuplicates(id, workspaceId, n);
  await recomputeBusiness(id);
  return { id, outcome };
}

export type { Db };
