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

### Auth (HMAC-signed requests)

The passphrase is **never sent in the request body**. Instead, every request is signed with HMAC-SHA256 using the passphrase as the key. Wire format:

```js
{
  data: JSON.stringify({ resource, action, payload }),  // inner envelope
  timestamp: Date.now(),
  nonce: <random hex>,
  signature: base64(HMAC-SHA256(passphrase, data + '|' + timestamp + '|' + nonce)),
}
```

Server (`verifyAuth` in [Code.gs](apps-script/Code.gs)) loads the passphrase from Script Property `APP_SECRET`, recomputes the HMAC, and also rejects requests whose `timestamp` is more than 60s off — that's the replay-prevention window. Set the property via: Apps Script editor → Project Settings → Script Properties → key `APP_SECRET`.

Frontend (`buildSignedBody` in [src/services/api.js](src/services/api.js)) uses the Web Crypto API (`crypto.subtle`). After login the passphrase is `importKey`'d as a **non-extractable** `HMAC` `CryptoKey` and stored in IndexedDB (`alphaTracking` DB, `auth` store, key `hmacKey`). The raw passphrase is never persisted anywhere — `subtle.exportKey()` on the stored key throws. On `unauthorized`, the client deletes the key and fires `window.dispatchEvent(new Event('alpha:auth-required'))`, which [src/App.vue](src/App.vue) listens for to redirect to `/login`. The router guard in [src/router/index.js](src/router/index.js) is async because `hasStoredKey()` reads IndexedDB.

**Threat model:** Protects against URL leakage, captured-request replay, and passphrase exfiltration via DevTools (attacker can read IndexedDB but only sees an opaque `CryptoKey` object — they can't extract the original passphrase to reuse elsewhere). Does NOT protect against persistent malicious JS on the page (XSS, malicious extension), which can still call `subtle.sign()` with the stored key within its session. Rotate by changing `APP_SECRET` + redeploying *New version*.

**Both sides must serialize identically.** The signature covers the `data` string verbatim; server uses `body.data` as-received, not a re-serialization of parsed fields. If you change envelope shape, change client + server together.

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
