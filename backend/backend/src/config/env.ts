import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v === 'true' || v === '1'));

const secret = z.string().min(32, 'must be at least 32 characters');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  APP_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  COOKIE_SECURE: bool,

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: secret,
  REFRESH_TOKEN_PEPPER: secret,
  DOWNLOAD_SIGNING_SECRET: secret,
  PHONE_HASH_SECRET: secret,
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),

  SEED_WORKSPACE_NAME: z.string().default('WebPoint'),
  SEED_OWNER_EMAIL: z.string().email().default('owner@webpoint.local'),
  SEED_OWNER_NAME: z.string().default('WebPoint Owner'),
  SEED_OWNER_PASSWORD: z.string().min(12).default('ChangeThisPassword!2026'),

  GOOGLE_MAPS_API_KEY: z.string().optional().default(''),
  GOOGLE_RETENTION_DAYS: z.coerce.number().int().min(0).max(3650).default(30),
  GOOGLE_SEARCH_COST_USD: z.coerce.number().min(0).default(0.035),
  OSM_CONTACT: z.string().default('ops@example.com'),
  ENABLE_DEMO_SOURCE: bool,

  ENRICHMENT_ENABLED: bool,
  ENRICHMENT_USER_AGENT: z.string().default('WebPointLeadBot/1.0'),

  EXPORT_DIR: z.string().default('./storage/exports'),
  EXPORT_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  EXPORT_MAX_ROWS: z.coerce.number().int().min(1).default(50000),

  AI_PROVIDER: z.enum(['rules', 'anthropic']).default('rules'),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;
const isProd = raw.NODE_ENV === 'production';

if (isProd) {
  const placeholders = [raw.JWT_ACCESS_SECRET, raw.REFRESH_TOKEN_PEPPER, raw.DOWNLOAD_SIGNING_SECRET, raw.PHONE_HASH_SECRET];
  if (placeholders.some((s) => s.startsWith('replace-with'))) {
    // eslint-disable-next-line no-console
    console.error('Refusing to start in production with placeholder secrets.');
    process.exit(1);
  }
  if (new Set(placeholders).size !== placeholders.length) {
    // eslint-disable-next-line no-console
    console.error('Refusing to start in production: secrets must be unique.');
    process.exit(1);
  }
}

export const env = {
  ...raw,
  isProd,
  origins: raw.APP_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  cookieSecure: raw.COOKIE_SECURE ?? isProd,
  demoSourceEnabled: isProd ? false : raw.ENABLE_DEMO_SOURCE ?? true,
  enrichmentEnabled: raw.ENRICHMENT_ENABLED ?? true,
};

export type Env = typeof env;
