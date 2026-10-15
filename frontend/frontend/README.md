# WebPoint Lead Platform - Frontend

React 18 + TypeScript + Vite + Tailwind CSS. Talks to the backend in `backend.zip` through `/api/v1`.

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173  (proxies /api to http://localhost:4000)
npm run build        # type-check + production build in dist/
```

Start the backend first (see its README), then sign in with the seeded owner account.

## Design

* Blue, white and orange, a calm light/dark theme and one bold moment: the search panel on **Find leads**.
* Type: Bricolage Grotesque (headings) and Instrument Sans (interface), both self-hosted via Fontsource (no third-party font requests).
* Desktop-first for research and export work, tablet friendly, mobile ready for searching and monitoring. The results table scrolls sideways on small screens.
* Keyboard focus is always visible, controls have text alternatives, and reduced-motion preferences are respected.

## Screens

Dashboard (with an admin health panel), Find leads (search, progress, results, detail drawer, bulk actions), Lead lists,
Exports, Sources, Settings (password, limits, team) and Audit logs.

## Security notes

* The access token and CSRF token live **in memory only**. The refresh token is an HttpOnly cookie the page cannot read.
* No API keys exist in the frontend. Google and AI keys stay on the server.
* External links open with `rel="noopener noreferrer nofollow"` and only `http(s)` URLs are ever rendered as links.
* The production `nginx.conf` sets a strict Content-Security-Policy (no inline scripts), proxies `/api` to the backend on the same origin,
  and blocks framing. Terminate TLS and add HSTS at your load balancer or CDN.
* Excel downloads use one-time signed links created by the backend, never public file URLs.

## Deploy

```bash
docker build -t webpoint-leads-web .
docker run -p 8080:80 webpoint-leads-web      # edit nginx.conf: proxy_pass to your API service
```
