import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { one, run } from '../db/pool';
import { safeFetch } from '../security/safe-fetch';
import { normalizeSocial } from './normalize';
import { addSocial, recomputeBusiness, refreshSocialColumns } from './persist';

/**
 * Permitted website enrichment: reads the business's OWN public website for links to its official social profiles.
 * Respects robots.txt (conservative on errors), uses an identifying User-Agent, never bypasses access controls,
 * and stores every found link with provenance (evidence URL + confidence). Nothing is guessed or generated.
 */
const UA = env.ENRICHMENT_USER_AGENT;
const UA_TOKEN = UA.split(/[\s/]/)[0];
const robotsCache = new Map<string, ReturnType<typeof robotsParser> | 'deny'>();
const PLATFORMS = new Set(['facebook', 'instagram', 'linkedin', 'tiktok', 'x', 'youtube']);

async function allowedByRobots(url: URL): Promise<boolean> {
  const robotsUrl = `${url.origin}/robots.txt`;
  let entry = robotsCache.get(url.origin);
  if (!entry) {
    try {
      const res = await safeFetch(robotsUrl, { userAgent: UA, maxBytes: 200_000, timeoutMs: 5000 });
      if (res.status >= 500) entry = 'deny';
      else if (res.status >= 400) entry = robotsParser(robotsUrl, '');
      else entry = robotsParser(robotsUrl, res.body);
    } catch {
      entry = 'deny';
    }
    robotsCache.set(url.origin, entry);
    if (robotsCache.size > 500) robotsCache.clear();
  }
  if (entry === 'deny') return false;
  return entry.isAllowed(url.toString(), UA_TOKEN) !== false;
}

export type EnrichResult = 'enriched' | 'blocked' | 'failed';

export async function enrichBusiness(business: { id: string; workspace_id: string; website: string }): Promise<EnrichResult> {
  try {
    const url = new URL(business.website);
    if (!(await allowedByRobots(url))) {
      await run('UPDATE businesses SET enriched_at = UTC_TIMESTAMP(3) WHERE id = ?', [business.id]);
      return 'blocked';
    }
    const res = await safeFetch(url.toString(), { userAgent: UA, accept: /text\/html|application\/xhtml/i });
    if (res.status >= 400) return 'failed';
    const $ = cheerio.load(res.body);
    const found = new Map<string, string>();
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      let abs: string;
      try {
        abs = new URL(href, res.url).toString();
      } catch {
        return;
      }
      const s = normalizeSocial(abs);
      if (s && PLATFORMS.has(s.platform) && !found.has(s.platform)) found.set(s.platform, s.url);
    });
    for (const [platform, link] of found) {
      await addSocial(business.workspace_id, business.id, { platform, url: link, source: 'website', evidenceUrl: res.url, confidence: 0.85 });
    }
    await refreshSocialColumns(business.id);
    await run('UPDATE businesses SET enriched_at = UTC_TIMESTAMP(3) WHERE id = ?', [business.id]);
    await recomputeBusiness(business.id);
    return 'enriched';
  } catch (err) {
    logger.debug({ err: (err as Error).message, businessId: business.id }, 'enrichment failed');
    return 'failed';
  }
}

export async function loadForEnrichment(id: string, workspaceId: string) {
  return one<{ id: string; workspace_id: string; website: string }>(
    'SELECT id, workspace_id, website FROM businesses WHERE id = ? AND workspace_id = ? AND website IS NOT NULL',
    [id, workspaceId],
  );
}
