# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
npm install         # install deps
npm run dev         # vite dev server at http://127.0.0.1:5300
npm run build       # static build to dist/
npm run preview     # preview built bundle
```

No tests, no linter — this is a small personal project. Before `npm run dev` works, `.env` must exist with `VITE_APPS_SCRIPT_URL=...` (see [.env.example](.env.example)). The Apps Script side also needs a Script Property `APP_SECRET` (any random string) — see the Auth section below.

The README references a `frontend/` subfolder; that layout is stale — the Vue app lives at the repo root (`src/`, `package.json`, `vite.config.js`). The old `backend/` Node server has been removed.

## Architecture

```
Vue 3 SPA (static)  ──fetch POST──>  Google Apps Script Web App  ──>  Google Sheet
```

There is **no Node backend**. The "API" is a single [apps-script/Code.gs](apps-script/Code.gs) file deployed as a Google Apps Script Web App, which reads/writes a Google Sheet under the deployer's account. Three sheets are auto-created on first call: `Accounts`, `Fees`, `AlphaProjects`.

### Frontend → Apps Script protocol

All requests go through one POST endpoint with the same envelope (see [src/services/api.js](src/services/api.js)):

```js
fetch(APPS_SCRIPT_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },  // not application/json!
  body: JSON.stringify({ resource, action, payload }),
});
// → { ok: true, data: ... }  or  { ok: false, error: '...' }
```

**Critical:** `Content-Type` must be `text/plain` so the request stays a CORS "simple request" — Apps Script does not respond to `OPTIONS` preflight, so anything else (`application/json`, custom headers) breaks in the browser.

The Apps Script side dispatches on `(resource, action)` in [apps-script/Code.gs](apps-script/Code.gs#L79). When adding a new endpoint, add a `case` in `dispatch()` and a matching function in the API client.

### Auth (shared secret)

Every request must include `secret` in the body. `verifyAuth()` in `Code.gs` compares it against the `APP_SECRET` Script Property (set via Apps Script editor → Project Settings → Script Properties). If missing or wrong, the server returns `{ ok: false, error: 'unauthorized' }`.

Frontend stores the passphrase in `localStorage['alphaTracking.secret']` after the user enters it on [src/views/Login.vue](src/views/Login.vue). The API client ([src/services/api.js](src/services/api.js)) attaches it to every call; on `unauthorized`, it clears storage and fires `window.dispatchEvent(new Event('alpha:auth-required'))`, which [src/App.vue](src/App.vue) listens for to redirect to `/login`. A router guard in [src/router/index.js](src/router/index.js) blocks all non-`public` routes when no secret is present.

This is client-side trust only — anyone with the passphrase can write. Rotate by changing the Script Property + redeploying *New version*.

### State layer

A single Pinia store [src/stores/trackingStore.js](src/stores/trackingStore.js) owns all server state (`accounts`, `fees`, `projects`, `summary`, `points`). Views read from it and call its `loadX` / `createX` / `updateX` actions — they should not call `api.js` directly. `loadAll()` runs the five loaders in parallel and is the typical top-of-app entry point.

### Sheets schema

Column order is declared in `HEADERS` at the top of `Code.gs`. `writeAll()` rewrites the entire data range each time; `appendItem()` appends one row. Rewriting is used for updates/deletes because Apps Script has no per-row ID lookup — when adding a new field, update `HEADERS`, the `normalize*` / row mappers, and the create/update payloads together.

Two helpers handle JSON inside cells: `rewards` on alpha projects is stored as a JSON string (`{accountId: usdAmount}`) and parsed via `safeJson()`.

### Date handling

Dates are stored and exchanged as `DD/MM/YYYY` strings throughout. Conversion helpers:
- Apps Script: `parseDmy` / `formatDmy` / `cmpDmy` / `monthKey` in [Code.gs](apps-script/Code.gs#L553)
- Frontend: `parseDate`, `isoToDmy`, `dmyToIso`, `todayStr` in [src/utils/format.js](src/utils/format.js)

When a Sheet cell comes back as a `Date` object (Sheets auto-coerces date-shaped strings), `formatDateValue()` re-stringifies it. Don't bypass these helpers — mixing ISO and DMY strings will break `monthKey()` grouping in `getSummary`.

### Domain rules baked into the code

- **15-day point reset.** Every fee row carries `points`; an account's "current points" sums only entries whose `tradeDate + 15 days >= today` ([Code.gs `getPoints`](apps-script/Code.gs#L460)).
- **Volume → points.** `points = floor(log2(volume))` capped at 20 (`pointsFromVolume` in Code.gs).
- **Monthly profit.** `getSummary` buckets by `MM/YYYY`, sums fees and per-account rewards, then `profit = revenue - fee` (USD) and `profitVND = profit * vndRate`. Default VND rate is 26500.

## Deploying changes to the Apps Script

After editing `Code.gs`: open the Apps Script editor → paste → **Deploy → Manage deployments → ✏️ → New version → Deploy**. Use *New version* (not *New deployment*) so the Web App URL stays the same and the frontend keeps working.
