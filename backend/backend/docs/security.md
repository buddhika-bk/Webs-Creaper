# Security operations notes

## CI/CD gates (implement in your pipeline)
1. `npm ci && npm run typecheck && npm test`
2. Dependency scan: `npm audit --omit=dev` (or Dependabot/Renovate)
3. SAST (e.g. CodeQL or Semgrep) and secret scanning (e.g. gitleaks) on every pull request
4. Container image scan (e.g. Trivy) on the built image
5. Run `npm run migrate:prod` as a deployment step, behind an approval gate for production

## Secrets
* Never commit `.env`. Production secrets come from a secret manager and are injected as environment variables.
* Rotate `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER`, `DOWNLOAD_SIGNING_SECRET`, `PHONE_HASH_SECRET` and the Google key on a schedule.
  Rotating `REFRESH_TOKEN_PEPPER` signs everyone out. Rotating `PHONE_HASH_SECRET` requires re-hashing `businesses.phone_hash`.
* Restrict the Google key to the Places API (New) and to your server IPs. Set quotas and a budget alert in Google Cloud.

## Backups
* Back up MySQL at least daily with binary logs for point-in-time recovery; encrypt backups at rest and in transit.
* Define retention (for example 30 days), store off-host, and run a restore test every quarter.
* Export files are disposable (they expire) and are not part of the backup scope.

## Network
* Put the API behind a CDN/WAF and load balancer, set `TRUST_PROXY` to the number of proxy hops, keep MySQL and Redis on a private network.
* Serve the web app and API on the same site, or list the exact web origin in `APP_ORIGINS`.

## Data retention and privacy
* Source-specific retention is enforced by the maintenance worker (`src/workers/maintenance.worker.ts`).
* Phone numbers are matched through an HMAC (`phone_hash`) so the raw value is not used as an index.
* Audit logs record who did what (login, searches, exports, downloads, role changes) without secrets.
