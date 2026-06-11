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

There is **no Node backend**. The "API" is a single [apps-script/Code.gs](apps-script/Code.gs) file deployed as a Google Apps Script Web App, which reads/writes a Google Sheet under the deployer's account. Sheets (`Accounts`, `Fees`, `AlphaProjects`, `FeesMonthly`) are auto-created on first **write** — read paths return empty for missing sheets (`getSheetForRead` vs `getSheet`).

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

A single Pinia store [src/stores/trackingStore.js](src/stores/trackingStore.js) owns all server state (`accounts`, `fees`, `allFees`, `projects`, `summary`). Views read from it and call its `loadX` / `createX` / `updateX` actions — they should not call `api.js` directly. **`bootstrap:get` is the only read endpoint** — it returns everything (including `allFees`, full daily rows) in one HTTP request. Important because Apps Script serializes concurrent requests to the same script, so parallel calls queue server-side; every mutation refreshes via a single `loadAll()`. Alpha points are computed **client-side only** (`computeAlphaPoints` in [src/utils/points.js](src/utils/points.js) — it deducts `claimPoints` of claimed projects, the server never computes points). The "Lưu phí" button in the calculator uses `fees:bulkWithConfig`, which upserts fee entries AND persists the account calc config (`currentVol`/`lastAfter`/…) in one request instead of two.

Account mutations are optimistic (no refetch) but must call `patchSnapshotAccounts()` so the localStorage bootstrap snapshot stays in sync. `vndRate` is a pure display multiplier persisted in localStorage (`alpha:vndRate`) — changing it triggers no request.

### Performance / response caching (two layers)

- **Server (CacheService):** `getBootstrap` caches its full JSON result in `ScriptCache` (TTL 6h) — a cache hit touches zero Sheets APIs. Invalidation is version-based: `handleRequest` bumps `dataVersion` (in a `finally`, since a mutation may have written the sheet before throwing in a later step, e.g. the Phi/Alpha mirror) after any mutating action — see `MUTATING_ACTIONS` in Code.gs (`create/update/delete/bulk/bulkWithConfig/archive/clearOld`); the version is part of the cache key, so stale entries are simply orphaned. The key is `bootstrap|<version>|<today>` — today's date because `pastDaily` depends on "today". `vndRate` is deliberately NOT in the key — the server returns USD figures only (`profitVND` in the response is at `DEFAULT_VND_RATE` and unused by the client). **When adding a new mutating action name, add it to `MUTATING_ACTIONS`.** Caveat: hand-editing the Sheet doesn't bump the version — the app's "Tải lại" button sends `nocache: true` to force a fresh read.
- **Client (stale-while-revalidate):** on the first `loadAll()` per session, the store hydrates instantly from the last bootstrap snapshot in `localStorage` (key `alpha:bootstrap`), then fetches fresh data in the background. Logout calls `clearLocalCache()` to remove the snapshot. Login navigates immediately and runs `loadAll()` in the background.
- **Keep read paths cheap:** `readRows` memoizes values per invocation (`_rowsCache` — every write path must call `invalidateRows`) and uses `getSheetForRead`, which skips `ensureHeaders` and the `FeesMonthly` `setNumberFormat` pin — those run only on the write path (`getSheet`). `APP_SECRET` is cached in a script global. Don't add `SpreadsheetApp` write calls to read endpoints; every write forces an expensive flush.
- **Keep writes targeted:** `Fees` mutations never rewrite the whole sheet — `bulkCreateFees` updates touched rows individually and appends new rows in one block (`readFeesWithRow` returns real 1-based row positions); `updateFee` writes one row; `deleteFee` uses `deleteRow`. Mirror writes to the human sheets batch contiguous columns via `setRowCells`. Small sheets (`Accounts`, `AlphaProjects`, `FeesMonthly`) still use `writeAll`.

### Sheets schema

Column order is declared in `HEADERS` at the top of `Code.gs`. `itemToRow()` serializes an item in `HEADERS` order (used by `writeAll`, `appendItem` and the targeted Fees writes). Small sheets use `writeAll()` (rewrite the data range) for updates/deletes; the `Fees` sheet uses targeted row writes (see Performance section). When adding a new field, update `HEADERS`, the `normalize*` mappers, and the create/update payloads together.

Two helpers handle JSON inside cells: `rewards` on alpha projects is stored as a JSON string (`{accountId: usdAmount}`) and parsed via `safeJson()`.

### Fees archival (FeesMonthly cache) — manual

The `Fees` sheet keeps every daily row (needed for the 15-day points-reset window which can span months). `FeesMonthly` is an aggregate cache: one row per `(month, accountId)` with `totalFee` / `totalPoints` / `count`. Current month is never cached (still being mutated).

**Two user-triggered actions** on the Fees tab (no auto-sync any more):
- `fees:archive` → runs `syncFeesMonthly()` over past months not yet in the cache. Idempotent. Daily rows stay.
- `fees:clearOld` → deletes daily rows whose month ≠ current month from the `Fees` sheet. `FeesMonthly` is untouched, so the Dashboard still has past-month aggregates if archive ran first.

Any fee mutation (`createFee` / `bulkCreateFees` / `updateFee` / `deleteFee`) calls `invalidateFeesMonthly([affected months])` to drop stale aggregate rows — next archive rebuilds them.

`createFee` and `bulkCreateFees` **upsert** by `(date, accountId)`: same-day same-account = overwrite, not duplicate. Within a single `bulkCreateFees` batch, later entries overwrite earlier ones with the same key.

`getBootstrap` returns `fees` filtered to **current month only**, the full `feesMonthly` aggregate, and `pastDaily = { total, active, safeToDelete, earliestSafeDate, pendingArchiveMonths }`. `active` counts past-month daily rows whose `tradeDate + 15 >= today` — when zero, the Fees tab shows a green "safe to clear" indicator. Summary uses aggregate for archived months and raw rows for past months that aren't archived yet (no double count).

All fee mutations in the store call `loadAll()` to keep `store.fees` correctly scoped to current month.

### Date handling

Dates are stored and exchanged as `DD/MM/YYYY` strings throughout. Conversion helpers:
- Apps Script: `parseDmy` / `formatDmy` / `cmpDmy` / `monthKey` in [Code.gs](apps-script/Code.gs#L553)
- Frontend: `parseDate`, `isoToDmy`, `dmyToIso`, `todayStr` in [src/utils/format.js](src/utils/format.js)

When a Sheet cell comes back as a `Date` object (Sheets auto-coerces date-shaped strings), `formatDateValue()` re-stringifies it. Don't bypass these helpers — mixing ISO and DMY strings will break `monthKey()` grouping in `getSummary`.

### Domain rules baked into the code

- **15-day point reset.** Every fee row carries `points`; an account's "current points" sums entries in the window `[today-15, today)` and deducts `claimPoints` of alpha projects claimed in the same window (`computeAlphaPoints` in [src/utils/points.js](src/utils/points.js) — client-side only, the server has no points logic). Server-side, the same `tradeDate + 15` window drives `clearOldDaily` / `pastDaily` in Code.gs.
- **Volume → points.** `points = floor(log2(volume))` capped at 20 (`pointsFromVolume` in [src/utils/points.js](src/utils/points.js)).
- **Monthly profit.** `getSummary` buckets by `MM/YYYY`, sums fees and per-account rewards, then `profit = revenue - fee` (USD). VND display is computed client-side as `profit * store.vndRate` (default 26500); the `profitVND` field the server still returns uses `DEFAULT_VND_RATE` and is ignored by the frontend.

## Deploying changes to the Apps Script

After editing `Code.gs`: open the Apps Script editor → paste → **Deploy → Manage deployments → ✏️ → New version → Deploy**. Use *New version* (not *New deployment*) so the Web App URL stays the same and the frontend keeps working.
