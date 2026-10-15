# WebPoint Lead Platform - Backend

Node.js + TypeScript + Express API, BullMQ workers (discovery, enrichment, export, maintenance), MySQL 8 and Redis.
Implements the *WebPoint Lead Generation & Business Intelligence Platform* specification.

## Quick start

```bash
cp .env.example .env          # then replace every secret (openssl rand -base64 48)
npm install
# start MySQL + Redis (or: docker compose up -d mysql redis; set REDIS_PASSWORD in .env for compose)
npm run migrate               # applies database/migrations/*.sql
npm run seed                  # creates the first workspace + owner from SEED_* variables
npm run dev                   # API on :4000
npm run dev:worker            # workers (separate terminal)
npm test
```

Sign in with the seeded owner, then **change the password immediately**.
Production: `npm run build`, then `npm run migrate:prod && npm run seed:prod`, `npm start` and `npm run start:worker`
(or `docker compose up -d --build`).

## Architecture (modular monolith + workers)

```
src/
  config/        env validation (zod), logger with secret redaction
  db/            mysql2 pool, migration runner, seed
  middleware/    auth (JWT + live DB check), RBAC, CSRF, rate limits (Redis), error handler
  modules/       auth, users, workspaces, search-jobs, businesses, lead-lists, tags,
                 exports, audit, sources, admin/dashboard, ai
  sources/       SourceAdapter interface + Google Places, OpenStreetMap, Demo adapters + compliance config
  pipeline/      normalize -> dedupe/persist -> enrich -> qualify (+ job orchestration and state machine)
  security/      SSRF-safe fetch, spreadsheet formula-injection guard
  workers/       discovery, export (ExcelJS streaming), maintenance (retention + cleanup)
```

Search job state machine: `QUEUED -> RUNNING -> COLLECTING -> NORMALIZING -> DEDUPLICATING -> ENRICHING (optional) -> COMPLETED`,
failure path `RETRYING -> FAILED`, cancellation `CANCEL_REQUESTED -> CANCELLED`. Metrics (source requests, raw results, accepted,
duplicates, invalid, enrichment attempts, completed, estimated cost, elapsed) are stored on the job and updated every page.

## API (`/api/v1`)

| Area | Endpoints |
|---|---|
| Auth | `GET /auth/csrf`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` |
| Searches | `POST /search-jobs` (Idempotency-Key), `GET /search-jobs`, `GET /search-jobs/:id`, `POST /search-jobs/:id/cancel` |
| Businesses | `GET /businesses?jobId=&category=&location=&hasWebsite=&hasPhone=&hasSocial=...`, `GET /businesses/:id`, `PATCH /businesses/:id`, `POST /businesses/bulk-action` |
| Exports | `POST /exports` (Idempotency-Key), `GET /exports`, `GET /exports/:id`, `POST /exports/:id/download-link`, `GET /exports/:id/download?token=` |
| Lists & tags | `GET/POST /lead-lists`, `GET/PATCH/DELETE /lead-lists/:id`, `GET/POST/DELETE /tags` |
| Admin | `GET /audit-logs`, `GET /sources`, `PATCH /sources/:source`, `GET /admin/overview`, `GET /dashboard`, `GET/PATCH /workspace`, `GET/POST/PATCH /users` |
| AI | `POST /ai/parse-query` (natural language -> structured filters; never creates facts) |
| Health | `GET /health`, `GET /ready` |

## Security checklist (spec section 10 and rule list)

| Requirement | Implementation |
|---|---|
| HTTPS, secure cookies | HSTS in production; refresh cookie `HttpOnly; Secure; SameSite=Strict`, scoped to `/api/v1/auth` |
| Short-lived access + rotating refresh | 15 min JWT (HS256, issuer/audience pinned) + opaque refresh token stored only as HMAC hash; rotation with reuse detection revokes the whole token family |
| Password hashing | Argon2id; policy of 12+ chars with mixed case and a number; account lockout after 5 failures; timing-equalised unknown-email path |
| RBAC | Owner / Admin / Analyst / Viewer permission matrix in `lib/permissions.ts`, re-checked against the DB on every request |
| Tenant isolation | Every query is scoped by `workspace_id`; bulk actions and exports only touch ids owned by the caller's workspace |
| Request validation | Zod on all bodies, queries and params |
| SQL injection | Only bound parameters; dynamic column lists come from constants, never from input |
| Rate limiting | Redis-backed limiters for API, login, refresh, search creation, export creation, downloads, AI and public endpoints |
| API keys | Google key read only on the server; never sent to the browser. Restrict it to the Places API and server IP in Google Cloud |
| CSRF, CORS | Double-submit token + Origin check on cookie endpoints; CORS allow-list of exact origins |
| Spreadsheet injection | `security/spreadsheet.ts` applied to every exported string cell |
| Export lifetime and downloads | Files expire (`EXPORT_TTL_HOURS`), are deleted by the maintenance worker, and download only through HMAC-signed, 5-minute, one-time links |
| Safe logging | pino redaction of tokens/cookies/passwords; audit metadata auto-redacts sensitive keys |
| SSRF | Enrichment fetches resolve DNS at connect time, block private/loopback/link-local ranges, cap redirects, size and time, honour robots.txt |
| Supply chain | `npm run audit`; add SAST, secret and image scanning in CI (see docs/security.md) |
| Backups | See docs/security.md |

## Source rules

* Google data comes only from the official Places API (New) with a minimal field mask; there is no HTML scraping anywhere.
* Each adapter declares its own retention, attribution, terms URL and export permissions (`SourceCompliance`).
  The maintenance worker enforces retention: expired content is cleared and the record is flagged "needs refresh"
  (Place IDs are kept). **Engineers must review the current Google Maps Platform terms before production** and adjust
  `GOOGLE_RETENTION_DAYS` and `clearFieldsOnExpiry` accordingly. See `docs/source-policies`.
* Enrichment only reads a business's own website, respects robots.txt, never bypasses CAPTCHAs/logins, and records
  the evidence URL and confidence for every link found.
* Missing phone / website / social values stay `NULL`. Nothing is guessed or generated; AI output is always labelled
  `ai_generated` and never overwrites source data.
