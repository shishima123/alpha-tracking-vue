/**
 * Binance Alpha Tracking - Google Apps Script Web App
 *
 * Cách deploy:
 *  1. Mở Google Sheet → Extensions → Apps Script
 *  2. Xóa code mặc định, paste toàn bộ file này
 *  3. Lưu (Ctrl+S)
 *  4. Deploy → New deployment → Type: Web app
 *     - Description: Alpha Tracking API
 *     - Execute as: Me
 *     - Who has access: Anyone (URL public nhưng unguessable)
 *  5. Copy URL "Web app URL" → paste vào frontend/.env (VITE_APPS_SCRIPT_URL)
 */

// =========================================================================
// CONSTANTS
// =========================================================================
const SHEETS = {
  ACCOUNTS: 'Accounts',
  FEES: 'Fees',
  ALPHA: 'AlphaProjects',
  FEES_MONTHLY: 'FeesMonthly',
};

const HEADERS = {
  Accounts: [
    'id', 'name', 'displayName', 'color', 'active',
    'pointTrade', 'pointHold', 'currentVol', 'perOrder', 'withdraw', 'lastAfter',
    'createdAt', 'sortOrder', 'hideInPoints', 'hideInCalc', 'hideInAlpha',
  ],
  // 'highlight' luôn ở CUỐI: ensureHeaders chỉ append cột thiếu vào cuối, thêm vào
  // giữa sẽ lệch cột dữ liệu cũ.
  Fees: ['id', 'date', 'accountId', 'fee', 'points', 'note', 'createdAt', 'highlight'],
  AlphaProjects: ['id', 'name', 'date', 'claimPoints', 'type', 'rewards', 'note', 'createdAt', 'estimated'],
  FeesMonthly: ['id', 'month', 'accountId', 'totalFee', 'totalPoints', 'count', 'updatedAt'],
};

const ACCOUNT_CALC_DEFAULTS = {
  pointTrade: 15,
  pointHold: 2,
  currentVol: 0,
  perOrder: 1024,
  withdraw: 1050,
  lastAfter: null,
};

const DEFAULT_VND_RATE = 26500;

// Tên 2 sheet "người đọc" (layout giống ImportFees / ImportProjects). Mỗi lần
// thêm/sửa/xóa fee hoặc project, server mirror dữ liệu sang đây để khớp với
// bảng tay của user. Xem section "MIRROR TO HUMAN SHEETS" ở cuối file.
const HUMAN_SHEETS = { PHI: 'Phi', ALPHA: 'Alpha' };
const PHI_DATA_START = 3;   // row 1 = tên account (merge), row 2 = Phí/Điểm, data từ row 3
const ALPHA_DATA_START = 2; // row 1 = header, data từ row 2

// =========================================================================
// HTTP ENTRY POINTS
// =========================================================================
function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

const TIMESTAMP_TOLERANCE_MS = 60 * 1000; // 60s — chống replay

function handleRequest(e, method) {
  try {
    const params = (e && e.parameter) || {};
    let body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (_) {}
    }
    verifyAuth(body);

    // Sau khi xác thực: parse inner envelope (đã được sign cùng signature)
    let inner = {};
    try { inner = JSON.parse(body.data || '{}'); } catch (_) {}
    const action = inner.action || params.action || 'health';
    const resource = inner.resource || params.resource || '';
    const payload = inner.payload || {};

    // Mọi action ghi dữ liệu → bump dataVersion để vô hiệu cache bootstrap.
    // Bump cả khi dispatch THROW: mutation có thể đã ghi sheet rồi mới lỗi ở
    // bước sau (vd mirror sang Phi/Alpha) — không bump sẽ serve cache cũ.
    try {
      const result = dispatch(resource, action, payload, params);
      return jsonResponse({ ok: true, data: result });
    } finally {
      if (MUTATING_ACTIONS[action]) bumpDataVersion();
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || String(err) });
  }
}

/**
 * HMAC-SHA256 auth. Client gửi { data, timestamp, nonce, signature }, trong đó:
 *   signature = base64(HMAC-SHA256(APP_SECRET, data + '|' + timestamp + '|' + nonce))
 *   data      = JSON.stringify({ resource, action, payload })
 *
 * Server kiểm:
 *   1. timestamp lệch <= 60s (chống replay)
 *   2. signature khớp với HMAC tính lại từ APP_SECRET
 *
 * Set passphrase: Apps Script editor → Project Settings (bánh răng trái) →
 * Script Properties → Add property → key=APP_SECRET, value=<chuỗi ngẫu nhiên>.
 */
// APP_SECRET cache vào global: warm instance giữ lại giữa các request,
// đỡ 1 lượt PropertiesService (~10-50ms) mỗi request.
let _secretCache = null;

function verifyAuth(body) {
  const secret = _secretCache ||
    (_secretCache = PropertiesService.getScriptProperties().getProperty('APP_SECRET'));
  if (!secret) {
    throw new Error('Server chưa cấu hình APP_SECRET. Vào Apps Script → Project Settings → Script Properties → thêm APP_SECRET.');
  }
  if (
    !body ||
    typeof body.data !== 'string' ||
    typeof body.timestamp !== 'number' ||
    typeof body.nonce !== 'string' ||
    typeof body.signature !== 'string'
  ) {
    throw new Error('unauthorized');
  }
  const skew = Math.abs(Date.now() - body.timestamp);
  if (skew > TIMESTAMP_TOLERANCE_MS) throw new Error('unauthorized');

  const message = body.data + '|' + body.timestamp + '|' + body.nonce;
  const expected = hmacSha256Base64(secret, message);
  if (expected !== body.signature) throw new Error('unauthorized');
}

function hmacSha256Base64(secret, message) {
  const sig = Utilities.computeHmacSha256Signature(message, secret);
  return Utilities.base64Encode(sig);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =========================================================================
// RESPONSE CACHE (CacheService)
// =========================================================================
// Bootstrap được cache nguyên JSON trong ScriptCache → request lặp lại không
// đụng Sheets (0 round-trip, chỉ còn verify HMAC + trả JSON).
//
// Vô hiệu hóa qua dataVersion: mọi mutation bump version → key cache cũ thành
// mồ côi, tự hết hạn theo TTL. Key còn gồm ngày hôm nay vì points/pastDaily
// phụ thuộc "today" — qua nửa đêm cache tự miss.
//
// Lưu ý: sửa Sheet bằng TAY (không qua app) sẽ không bump version → cache cũ
// tối đa 6h. Nút "Tải lại" trên app gửi nocache=true để ép đọc lại Sheets.
const CACHE_TTL_SEC = 21600; // 6h — max của CacheService
const DATA_VERSION_KEY = 'dataVersion';
const MUTATING_ACTIONS = {
  create: true, update: true, delete: true, bulk: true, bulkWithConfig: true,
  archive: true, clearOld: true,
};

function getDataVersion() {
  const cache = CacheService.getScriptCache();
  let v = cache.get(DATA_VERSION_KEY);
  if (!v) {
    v = String(Date.now());
    cache.put(DATA_VERSION_KEY, v, CACHE_TTL_SEC);
  }
  return v;
}

function bumpDataVersion() {
  CacheService.getScriptCache().put(DATA_VERSION_KEY, String(Date.now()), CACHE_TTL_SEC);
}

// =========================================================================
// DISPATCH
// =========================================================================
// Đọc duy nhất qua bootstrap:get; summary/points/list đều tính từ đó
// (client tự tính điểm trong utils/points.js).
function dispatch(resource, action, payload, params) {
  switch (resource) {
    case 'accounts':
      if (action === 'create') return createAccount(payload);
      if (action === 'update') return updateAccount(payload);
      if (action === 'delete') return deleteAccount(payload);
      break;

    case 'fees':
      if (action === 'bulk') return bulkCreateFees(payload);
      if (action === 'bulkWithConfig') return bulkCreateFeesWithConfig(payload);
      if (action === 'update') return updateFee(payload);
      if (action === 'delete') return deleteFee(payload);
      if (action === 'archive') return archivePastMonths();
      if (action === 'clearOld') return clearOldDaily();
      break;

    case 'alpha':
      if (action === 'create') return createProject(payload);
      if (action === 'update') return updateProject(payload);
      if (action === 'delete') return deleteProject(payload);
      break;

    case 'bootstrap':
      if (action === 'get') return getBootstrap(payload);
      break;

    case '':
    case 'health':
      return { status: 'ok', time: new Date().toISOString() };
  }
  throw new Error('Unknown resource/action: ' + resource + '/' + action);
}

// =========================================================================
// SHEET HELPERS
// =========================================================================
// Cache per-invocation: SpreadsheetApp/getSheetByName/ensureHeaders đều tốn round-trip
// ~50-200ms mỗi call. Trong 1 lần handleRequest, sheet refs không đổi → memoize.
let _ssCache = null;
const _sheetCache = {};
const _sheetEnsured = {};

function activeSpreadsheet() {
  if (!_ssCache) _ssCache = SpreadsheetApp.getActiveSpreadsheet();
  return _ssCache;
}

/**
 * Đường ĐỌC: chỉ getSheetByName, không tạo sheet, không ensureHeaders, không
 * setNumberFormat — mỗi thứ đó là 1 round-trip (riêng setNumberFormat là lệnh
 * GHI, rất đắt). Sheet chưa tồn tại → null, readRows trả []; sheet sẽ được
 * tạo ở lần ghi đầu tiên qua getSheet().
 */
function getSheetForRead(name) {
  if (_sheetCache[name]) return _sheetCache[name];
  const sh = activeSpreadsheet().getSheetByName(name);
  if (sh) _sheetCache[name] = sh;
  return sh;
}

/** Đường GHI: tạo sheet nếu thiếu + migrate header + pin format (1 lần/invocation). */
function getSheet(name) {
  let sh = getSheetForRead(name);
  if (!sh) {
    sh = activeSpreadsheet().insertSheet(name);
    const headers = HEADERS[name];
    if (headers) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
    _sheetCache[name] = sh;
  } else if (!_sheetEnsured[name]) {
    ensureHeaders(sh, name);
  }
  if (!_sheetEnsured[name]) {
    // FeesMonthly.month dạng "MM/YYYY" — Sheets sẽ auto-coerce thành Date object
    // (April 1, 2026) khi setValues vào ô format mặc định. Pin column B = plain text
    // để các write sau giữ nguyên string.
    if (name === SHEETS.FEES_MONTHLY) {
      sh.getRange('B:B').setNumberFormat('@');
    }
    _sheetEnsured[name] = true;
  }
  return sh;
}

/**
 * Migration: sheet đã tồn tại nhưng có thể thiếu header cột mới (khi schema mở rộng).
 * Append các tên cột còn thiếu vào cuối row 1; data cũ giữ nguyên (cell mới = rỗng,
 * normalizeXxx sẽ đổ default khi đọc).
 */
function ensureHeaders(sh, name) {
  const headers = HEADERS[name];
  if (!headers || headers.length === 0) return;
  const lastCol = sh.getLastColumn();
  if (lastCol >= headers.length) return;
  const missing = headers.slice(lastCol);
  sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
}

// Memoize values per-invocation: 1 mutation có thể đọc cùng sheet nhiều lần
// (vd mirror Phi đọc Accounts sau khi fee flow đã đọc) — mỗi lần đọc lại là
// 1 round-trip. Mọi đường GHI phải gọi invalidateRows(name).
const _rowsCache = {};

function invalidateRows(name) {
  delete _rowsCache[name];
}

function readRows(name) {
  if (_rowsCache[name]) return _rowsCache[name];
  const sh = getSheetForRead(name);
  if (!sh) return []; // sheet chưa tồn tại — sẽ được tạo ở lần ghi đầu
  // getDataRange = 1 round-trip lấy cả values + dims; tốt hơn getLastRow+getLastCol+getRange
  const values = sh.getDataRange().getValues();
  const headers = HEADERS[name];
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r[0] === '' || r[0] === null) continue;
    const o = {};
    for (let j = 0; j < headers.length; j++) o[headers[j]] = r[j];
    out.push(o);
  }
  _rowsCache[name] = out;
  return out;
}

/** Serialize 1 item → 1 row theo đúng thứ tự HEADERS (object → JSON string). */
function itemToRow(name, item) {
  return HEADERS[name].map(function (h) {
    const v = item[h];
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}

function writeAll(name, items) {
  const sh = getSheet(name);
  const headers = HEADERS[name];
  const lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  invalidateRows(name);
  if (items.length === 0) return;
  const rows = items.map(function (o) { return itemToRow(name, o); });
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function appendItem(name, item) {
  const sh = getSheet(name);
  invalidateRows(name);
  sh.appendRow(itemToRow(name, item));
}

// =========================================================================
// ACCOUNTS
// =========================================================================
function listAccounts() {
  const list = readRows(SHEETS.ACCOUNTS).map(normalizeAccount);
  // sortOrder asc; tie-break theo createdAt asc để giữ order ổn định khi unset.
  list.sort(function (a, b) {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });
  return list;
}

function normalizeAccount(r) {
  function numOr(v, d) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }
  function valOr(v, d) {
    return (v === '' || v === null || v === undefined) ? d : v;
  }
  return {
    id: String(r.id),
    name: r.name,
    displayName: r.displayName || r.name,
    color: r.color || '#3b82f6',
    active: r.active !== false && r.active !== 'FALSE' && r.active !== '',
    pointTrade: numOr(r.pointTrade, ACCOUNT_CALC_DEFAULTS.pointTrade),
    pointHold: numOr(r.pointHold, ACCOUNT_CALC_DEFAULTS.pointHold),
    currentVol: numOr(r.currentVol, ACCOUNT_CALC_DEFAULTS.currentVol),
    perOrder: numOr(r.perOrder, ACCOUNT_CALC_DEFAULTS.perOrder),
    withdraw: numOr(r.withdraw, ACCOUNT_CALC_DEFAULTS.withdraw),
    lastAfter: (r.lastAfter === '' || r.lastAfter === null || r.lastAfter === undefined)
      ? null : Number(r.lastAfter),
    createdAt: r.createdAt || '',
    sortOrder: numOr(r.sortOrder, 0),
    hideInPoints: r.hideInPoints === true || r.hideInPoints === 'TRUE',
    hideInCalc: r.hideInCalc === true || r.hideInCalc === 'TRUE',
    hideInAlpha: r.hideInAlpha === true || r.hideInAlpha === 'TRUE',
  };
}

function createAccount(payload) {
  const name = (payload.name || '').trim();
  if (!name) throw new Error('name là bắt buộc');
  const id = (payload.id || name).toLowerCase().replace(/\s+/g, '_');
  const list = listAccounts();
  if (list.some(function (a) { return a.id === id; }))
    throw new Error('Account đã tồn tại');
  const item = normalizeAccount({
    id: id,
    name: name,
    displayName: payload.displayName || name,
    color: payload.color || '#3b82f6',
    active: payload.active !== false,
    pointTrade: payload.pointTrade,
    pointHold: payload.pointHold,
    currentVol: payload.currentVol,
    perOrder: payload.perOrder,
    withdraw: payload.withdraw,
    lastAfter: payload.lastAfter,
    createdAt: new Date().toISOString(),
    sortOrder: payload.sortOrder,
    hideInPoints: payload.hideInPoints === true,
    hideInCalc: payload.hideInCalc === true,
    hideInAlpha: payload.hideInAlpha === true,
  });
  appendItem(SHEETS.ACCOUNTS, item);
  return item;
}

function updateAccount(payload) {
  const list = listAccounts();
  const idx = list.findIndex(function (a) { return a.id === payload.id; });
  if (idx === -1) throw new Error('Không tìm thấy');
  list[idx] = normalizeAccount(Object.assign({}, list[idx], payload));
  writeAll(SHEETS.ACCOUNTS, list);
  return list[idx];
}

function deleteAccount(payload) {
  const list = listAccounts().filter(function (a) { return a.id !== payload.id; });
  writeAll(SHEETS.ACCOUNTS, list);
  return { ok: true };
}

// =========================================================================
// FEES
// =========================================================================
function normalizeFee(r) {
  return {
    id: String(r.id),
    date: formatDateValue(r.date),
    accountId: r.accountId,
    fee: Number(r.fee) || 0,
    points: Number(r.points) || 0,
    note: r.note || '',
    createdAt: r.createdAt || '',
    highlight: r.highlight === true || r.highlight === 'TRUE' || r.highlight === 'true',
  };
}

function listFees() {
  return readRows(SHEETS.FEES).map(normalizeFee);
}

/**
 * Đọc sheet Fees kèm vị trí hàng thật (1-based) cho targeted write.
 * Trả về [{ row, fee }] — row chính xác kể cả khi có hàng trống xen giữa
 * (readRows bỏ hàng trống nên index của nó không dùng làm vị trí được).
 */
function readFeesWithRow() {
  const sh = getSheetForRead(SHEETS.FEES);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  const headers = HEADERS.Fees;
  const out = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === '' || values[i][0] === null) continue;
    const o = {};
    for (let j = 0; j < headers.length; j++) o[headers[j]] = values[i][j];
    out.push({ row: i + 1, fee: normalizeFee(o) });
  }
  return out;
}

/**
 * Upsert nhiều entries cùng lúc (trùng key trong batch → entry sau ghi đè).
 * Ghi TARGETED thay vì rewrite cả sheet: row bị sửa → setValues đúng row đó
 * (thường 0-1 row); row mới → append 1 block. Nhập phí ngày mới (pure insert,
 * case phổ biến nhất) = đúng 1 lệnh ghi bất kể sheet to cỡ nào.
 */
function bulkCreateFees(payload) {
  const entries = payload.entries || [];
  if (!Array.isArray(entries) || entries.length === 0)
    throw new Error('entries phải là mảng');

  // key (date|accountId) → { row: hàng 1-based (null = item mới chờ append), fee }
  const byKey = {};
  readFeesWithRow().forEach(function (e) {
    byKey[e.fee.date + '|' + e.fee.accountId] = e;
  });

  const months = {};
  const now = Date.now();
  const touchedRows = []; // các entry có row thật bị sửa
  const newItems = [];
  let inserted = 0;
  let updated = 0;

  entries.forEach(function (e, i) {
    if (!e.date || !e.accountId) return;
    months[monthKey(e.date)] = true;
    const hit = byKey[e.date + '|' + e.accountId];
    if (hit) {
      Object.assign(hit.fee, {
        fee: Number(e.fee) || 0,
        points: Number(e.points) || 0,
        note: e.note != null ? e.note : (hit.fee.note || ''),
        highlight: e.highlight != null ? !!e.highlight : !!hit.fee.highlight,
      });
      // hit.row = null nghĩa là item mới trong cùng batch → đã nằm trong
      // newItems, chỉ cần sửa object là đủ.
      if (hit.row && touchedRows.indexOf(hit) === -1) touchedRows.push(hit);
      updated++;
    } else {
      const item = {
        id: String(now + i),
        date: e.date,
        accountId: e.accountId,
        fee: Number(e.fee) || 0,
        points: Number(e.points) || 0,
        note: e.note || '',
        createdAt: new Date().toISOString(),
        highlight: !!e.highlight,
      };
      byKey[e.date + '|' + e.accountId] = { row: null, fee: item };
      newItems.push(item);
      inserted++;
    }
  });

  if (inserted + updated > 0) {
    const sh = getSheet(SHEETS.FEES);
    const width = HEADERS.Fees.length;
    touchedRows.forEach(function (t) {
      sh.getRange(t.row, 1, 1, width).setValues([itemToRow(SHEETS.FEES, t.fee)]);
    });
    if (newItems.length) {
      const rows = newItems.map(function (it) { return itemToRow(SHEETS.FEES, it); });
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, width).setValues(rows);
    }
    invalidateRows(SHEETS.FEES);
  }
  invalidateFeesMonthly(Object.keys(months));

  // Mirror sang Phi: lấy giá trị cuối cùng (đã upsert) cho từng (date, account).
  const mirror = [];
  entries.forEach(function (e) {
    if (!e.date || !e.accountId) return;
    const hit = byKey[e.date + '|' + e.accountId];
    if (hit) mirror.push({ date: hit.fee.date, accountId: hit.fee.accountId, fee: hit.fee.fee, points: hit.fee.points });
  });
  mirrorFeesToPhi(mirror);
  return { inserted: inserted, updated: updated };
}

/**
 * Lưu phí + config máy tính của account trong CÙNG 1 request — nút "Lưu phí"
 * trong Máy tính trước đây tốn 2 request serialize (accounts:update + fees:bulk).
 */
function bulkCreateFeesWithConfig(payload) {
  const result = bulkCreateFees(payload);
  if (payload.accountConfig && payload.accountConfig.id) {
    updateAccount(payload.accountConfig);
  }
  return result;
}

/**
 * Tổng hợp các tháng cũ vào FeesMonthly. Idempotent — gọi nhiều lần OK.
 * Không xóa daily rows (vẫn cần cho tính điểm).
 */
function archivePastMonths() {
  const allFees = listFees();
  const feesMonthly = syncFeesMonthly(allFees);
  return { feesMonthly: feesMonthly, archived: feesMonthly.length };
}

/**
 * Xóa toàn bộ daily rows thuộc tháng cũ (không phải currentMonth) khỏi sheet Fees.
 * KHÔNG đụng FeesMonthly — aggregate đã archive vẫn còn.
 */
// Chỉ xóa daily rows đã ra khỏi cửa sổ 15 ngày (không còn tính điểm — "không còn
// màu xanh" ở UI). Luôn giữ row tháng hiện tại: tháng hiện tại không được archive
// nên xóa sẽ làm sai tổng tháng trên Dashboard, không khôi phục được.
function clearOldDaily() {
  const currentKey = currentMonthKey();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const all = listFees();
  const kept = all.filter(function (f) {
    if (monthKey(f.date) === currentKey) return true;
    const d = parseDmy(f.date);
    if (!d) return true;
    const reset = new Date(d);
    reset.setDate(reset.getDate() + 15);
    return reset.getTime() >= today.getTime(); // vẫn trong cửa sổ → giữ
  });
  const removed = all.length - kept.length;
  if (removed > 0) writeAll(SHEETS.FEES, kept);
  return { removed: removed, kept: kept.length };
}

function updateFee(payload) {
  const hit = readFeesWithRow().find(function (e) { return e.fee.id === String(payload.id); });
  if (!hit) throw new Error('Không tìm thấy');
  const oldKey = { date: hit.fee.date, accountId: hit.fee.accountId };
  const nu = Object.assign({}, hit.fee, payload);
  // Ghi đúng 1 row thay vì rewrite cả sheet.
  getSheet(SHEETS.FEES)
    .getRange(hit.row, 1, 1, HEADERS.Fees.length)
    .setValues([itemToRow(SHEETS.FEES, nu)]);
  invalidateRows(SHEETS.FEES);
  invalidateFeesMonthly([monthKey(oldKey.date), monthKey(nu.date)]);
  // Nếu đổi ngày/account → xóa ô cũ trước, rồi ghi ô mới.
  if (oldKey.date !== nu.date || oldKey.accountId !== nu.accountId) {
    clearPhiCells(oldKey.date, oldKey.accountId);
  }
  mirrorFeesToPhi([{ date: nu.date, accountId: nu.accountId, fee: nu.fee, points: nu.points }]);
  return nu;
}

function deleteFee(payload) {
  const hit = readFeesWithRow().find(function (e) { return e.fee.id === String(payload.id); });
  if (!hit) return { ok: true };
  // deleteRow 1 hàng thay vì rewrite cả sheet.
  getSheet(SHEETS.FEES).deleteRow(hit.row);
  invalidateRows(SHEETS.FEES);
  invalidateFeesMonthly([monthKey(hit.fee.date)]);
  clearPhiCells(hit.fee.date, hit.fee.accountId);
  return { ok: true };
}

// =========================================================================
// ALPHA PROJECTS
// =========================================================================
function listProjects() {
  return readRows(SHEETS.ALPHA).map(function (r) {
    return {
      id: String(r.id),
      name: r.name,
      date: formatDateValue(r.date),
      claimPoints: Number(r.claimPoints) || 15,
      type: r.type || 'FCFS',
      rewards: safeJson(r.rewards) || {},
      note: r.note || '',
      createdAt: r.createdAt || '',
      // {accountId: true} — đánh dấu reward chỉ là ước lượng, chưa chính thức.
      estimated: safeJson(r.estimated) || {},
    };
  });
}

function createProject(payload) {
  if (!payload.name || !payload.date)
    throw new Error('name và date là bắt buộc');
  const item = {
    id: String(Date.now()),
    name: payload.name,
    date: payload.date,
    claimPoints: Number(payload.claimPoints) || 15,
    type: payload.type || 'FCFS',
    rewards: payload.rewards || {},
    note: payload.note || '',
    createdAt: new Date().toISOString(),
    estimated: payload.estimated || {},
  };
  appendItem(SHEETS.ALPHA, item);
  mirrorProjectToAlpha(item);
  return item;
}

function updateProject(payload) {
  const list = listProjects();
  const idx = list.findIndex(function (p) { return p.id === payload.id; });
  if (idx === -1) throw new Error('Không tìm thấy');
  const old = list[idx];
  list[idx] = Object.assign({}, list[idx], payload);
  writeAll(SHEETS.ALPHA, list);
  mirrorProjectUpdateInAlpha(old, list[idx]);
  return list[idx];
}

function deleteProject(payload) {
  const all = listProjects();
  const target = all.find(function (p) { return p.id === payload.id; });
  const list = all.filter(function (p) { return p.id !== payload.id; });
  writeAll(SHEETS.ALPHA, list);
  if (target) mirrorProjectDeleteFromAlpha(target.name, target.date);
  return { ok: true };
}

// =========================================================================
// FEES MONTHLY (aggregate cache cho các tháng cũ)
// =========================================================================
function currentMonthKey() {
  const d = new Date();
  return pad(d.getMonth() + 1) + '/' + d.getFullYear();
}

function feesMonthlyId(month, accountId) {
  return month.replace('/', '_') + '__' + accountId;
}

function listFeesMonthly() {
  return readRows(SHEETS.FEES_MONTHLY).map(function (r) {
    return {
      id: String(r.id),
      month: formatMonthValue(r.month),
      accountId: String(r.accountId),
      totalFee: Number(r.totalFee) || 0,
      totalPoints: Number(r.totalPoints) || 0,
      count: Number(r.count) || 0,
      updatedAt: r.updatedAt || '',
    };
  });
}

/**
 * Nếu cell month bị Sheets coerce thành Date → format lại "MM/YYYY".
 * Nếu vẫn là string → trả lại nguyên.
 */
function formatMonthValue(v) {
  if (v instanceof Date) return pad(v.getMonth() + 1) + '/' + v.getFullYear();
  return String(v);
}

/**
 * Bảo đảm aggregate cho mọi tháng past (≠ tháng hiện tại) đều có trong
 * FeesMonthly. Nếu thiếu, compute từ allFees rồi append.
 * Trả về list đầy đủ (existing + newly added) để caller không phải đọc lại sheet.
 */
function syncFeesMonthly(allFees) {
  const currentKey = currentMonthKey();
  const existing = listFeesMonthly();
  const existingMonths = {};
  existing.forEach(function (r) { existingMonths[r.month] = true; });

  const grouped = {};
  allFees.forEach(function (f) {
    const m = monthKey(f.date);
    if (!m || m === currentKey) return;
    if (existingMonths[m]) return; // đã có aggregate cho tháng này
    const id = feesMonthlyId(m, f.accountId);
    if (!grouped[id]) {
      grouped[id] = {
        id: id,
        month: m,
        accountId: f.accountId,
        totalFee: 0,
        totalPoints: 0,
        count: 0,
      };
    }
    grouped[id].totalFee += Number(f.fee) || 0;
    grouped[id].totalPoints += Number(f.points) || 0;
    grouped[id].count += 1;
  });

  const ids = Object.keys(grouped);
  if (ids.length === 0) return existing;

  const sh = getSheet(SHEETS.FEES_MONTHLY);
  const headers = HEADERS.FeesMonthly;
  const now = new Date().toISOString();
  const newItems = ids.map(function (id) {
    const o = grouped[id];
    o.totalFee = round2(o.totalFee);
    o.updatedAt = now;
    return o;
  });
  const rows = newItems.map(function (o) {
    return headers.map(function (h) {
      const v = o[h];
      return (v === null || v === undefined) ? '' : v;
    });
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  invalidateRows(SHEETS.FEES_MONTHLY);
  return existing.concat(newItems);
}

/**
 * Xóa aggregate của các tháng bị ảnh hưởng (sau create/update/delete fee).
 * Tháng hiện tại không cache nên bỏ qua.
 */
function invalidateFeesMonthly(monthStrs) {
  if (!monthStrs || monthStrs.length === 0) return;
  const currentKey = currentMonthKey();
  const affected = {};
  monthStrs.forEach(function (m) { if (m && m !== currentKey) affected[m] = true; });
  if (Object.keys(affected).length === 0) return;
  const list = listFeesMonthly().filter(function (r) { return !affected[r.month]; });
  writeAll(SHEETS.FEES_MONTHLY, list);
}

/**
 * Summary version dùng aggregate cache: past months đọc từ FeesMonthly,
 * tháng hiện tại tính từ currentFees.
 */
function computeSummaryFast(currentFees, feesMonthly, projects, vndRateInput) {
  const vndRate = Number(vndRateInput || DEFAULT_VND_RATE);
  const byMonth = {};
  function bucket(key) {
    if (!byMonth[key]) byMonth[key] = { rewards: {}, fees: {}, projects: 0 };
    return byMonth[key];
  }

  feesMonthly.forEach(function (r) {
    const b = bucket(r.month);
    b.fees[r.accountId] = (b.fees[r.accountId] || 0) + r.totalFee;
  });

  currentFees.forEach(function (f) {
    const m = monthKey(f.date);
    if (!m) return;
    const b = bucket(m);
    b.fees[f.accountId] = (b.fees[f.accountId] || 0) + (Number(f.fee) || 0);
  });

  projects.forEach(function (p) {
    const m = monthKey(p.date);
    if (!m) return;
    const b = bucket(m);
    b.projects += 1;
    const rewards = p.rewards || {};
    for (const acc in rewards) {
      const v = Number(rewards[acc]) || 0;
      if (!v) continue;
      b.rewards[acc] = (b.rewards[acc] || 0) + v;
    }
  });

  const monthly = Object.keys(byMonth).sort(sortMonth).map(function (key) {
    const b = byMonth[key];
    const accs = {};
    Object.keys(b.rewards).forEach(function (a) { accs[a] = true; });
    Object.keys(b.fees).forEach(function (a) { accs[a] = true; });
    const byAccount = {};
    let revenue = 0, fee = 0;
    Object.keys(accs).forEach(function (a) {
      const r = b.rewards[a] || 0;
      const f = b.fees[a] || 0;
      byAccount[a] = { revenue: r, fee: f, profit: r - f };
      revenue += r;
      fee += f;
    });
    const profit = revenue - fee;
    return {
      month: key,
      totalRevenue: round2(revenue),
      totalFee: round2(fee),
      profit: round2(profit),
      profitVND: Math.round(profit * vndRate),
      projects: b.projects,
      byAccount: byAccount,
    };
  });

  const total = monthly.reduce(function (acc, m) {
    acc.revenue += m.totalRevenue;
    acc.fee += m.totalFee;
    acc.profit += m.profit;
    acc.profitVND += m.profitVND;
    acc.projects += m.projects;
    return acc;
  }, { revenue: 0, fee: 0, profit: 0, profitVND: 0, projects: 0 });

  return {
    vndRate: vndRate,
    monthly: monthly,
    total: {
      revenue: round2(total.revenue),
      fee: round2(total.fee),
      profit: round2(total.profit),
      profitVND: total.profitVND,
      projects: total.projects,
    },
  };
}

// =========================================================================
// BOOTSTRAP — gom mọi data cần thiết vào 1 request.
// Tháng hiện tại trả raw daily rows; tháng cũ trả aggregate đã archive (nếu có).
// KHÔNG auto-sync FeesMonthly — user phải bấm nút "Archive" để tổng hợp.
// =========================================================================
function getBootstrap(payload) {
  payload = payload || {};
  const cache = CacheService.getScriptCache();
  // Key KHÔNG chứa vndRate: server chỉ trả số USD, quy đổi VND là việc của
  // client → mọi tỉ giá dùng chung 1 cache entry. Ngày hôm nay nằm trong key
  // vì pastDaily phụ thuộc "today".
  const cacheKey = ['bootstrap', getDataVersion(), formatDmy(new Date())].join('|');
  if (!payload.nocache) {
    const hit = cache.get(cacheKey);
    if (hit) {
      try { return JSON.parse(hit); } catch (_) { /* cache hỏng → tính lại */ }
    }
  }

  const accounts = listAccounts();
  const allFees = listFees();
  const projects = listProjects();
  const currentKey = currentMonthKey();

  const currentFees = [];
  const pastFees = [];
  allFees.forEach(function (f) {
    if (monthKey(f.date) === currentKey) currentFees.push(f);
    else pastFees.push(f);
  });

  const feesMonthly = listFeesMonthly();
  const archivedMonths = {};
  feesMonthly.forEach(function (r) { archivedMonths[r.month] = true; });

  // Tháng past chưa archive → vẫn cần raw rows để Dashboard tính summary đúng.
  // Tháng past đã archive → dùng aggregate, bỏ raw rows để tránh double count.
  const summaryPastFees = pastFees.filter(function (f) {
    return !archivedMonths[monthKey(f.date)];
  });
  // vndRate cố ý KHÔNG lấy từ payload (cache key không chứa nó): profitVND
  // trong response tính theo DEFAULT_VND_RATE, client tự nhân profit × tỉ giá
  // riêng khi hiển thị.
  const summary = computeSummaryFast(
    currentFees.concat(summaryPastFees),
    feesMonthly,
    projects,
    null
  );

  const result = {
    accounts: accounts,
    fees: currentFees,
    // allFees: toàn bộ daily rows (mọi tháng còn trong sheet) — đã đọc sẵn ở
    // trên, trả luôn để frontend khỏi gọi fees:list riêng (Apps Script
    // serialize request nên call thứ 2 phải xếp hàng chờ).
    allFees: allFees,
    feesMonthly: feesMonthly,
    projects: projects,
    summary: summary,
    // KHÔNG trả "points": tab Điểm tự tính ở client (utils/points.js) — công
    // thức client trừ cả claimPoints của kèo đã nhận, là nguồn duy nhất đúng.
    currentMonth: currentKey,
    pastDaily: computePastDailyStatus(pastFees, archivedMonths),
  };
  try { cache.put(cacheKey, JSON.stringify(result), CACHE_TTL_SEC); } catch (_) { /* >100KB → bỏ cache */ }
  return result;
}

/**
 * Tổng hợp tình trạng daily rows tháng cũ (clearOld chỉ xóa row đã ra khỏi cửa sổ
 * 15 ngày — "không còn màu xanh"):
 *  - total: số rows past-month trong sheet Fees
 *  - deletable: số rows past-month đã hết 15 ngày → clearOld sẽ xóa
 *  - active: số rows past-month vẫn trong cửa sổ 15 ngày → giữ lại (vẫn tính điểm)
 *  - safeToDelete: true khi có ít nhất 1 row deletable
 *  - earliestSafeDate: ngày sớm nhất mà 1 row active sẽ rời cửa sổ (thành deletable)
 *  - pendingArchiveMonths: tháng past có raw nhưng chưa có aggregate
 */
function computePastDailyStatus(pastFees, archivedMonths) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let deletable = 0;
  let earliestActiveResetTs = Infinity;
  const monthsWithRaw = {};

  pastFees.forEach(function (f) {
    const d = parseDmy(f.date);
    if (!d) return;
    monthsWithRaw[monthKey(f.date)] = true;
    const reset = new Date(d);
    reset.setDate(reset.getDate() + 15);
    if (reset.getTime() < today.getTime()) {
      deletable++;
    } else if (reset.getTime() < earliestActiveResetTs) {
      earliestActiveResetTs = reset.getTime();
    }
  });

  const pendingArchiveMonths = Object.keys(monthsWithRaw)
    .filter(function (m) { return !archivedMonths[m]; })
    .sort(sortMonth);

  return {
    total: pastFees.length,
    deletable: deletable,
    active: pastFees.length - deletable,
    safeToDelete: deletable > 0,
    earliestSafeDate: earliestActiveResetTs < Infinity ? formatDmy(new Date(earliestActiveResetTs)) : null,
    pendingArchiveMonths: pendingArchiveMonths,
  };
}

// =========================================================================
// UTILS
// =========================================================================
function safeJson(s) {
  if (s === null || s === undefined || s === '') return null;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch (e) { return null; }
}

function formatDateValue(v) {
  if (!v) return '';
  if (v instanceof Date) return formatDmy(v);
  return String(v);
}

function formatDmy(d) {
  if (!(d instanceof Date)) return '';
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
}

function parseDmy(s) {
  if (s instanceof Date) return s;
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s));
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function cmpDmy(a, b) {
  const pa = parseDmy(a);
  const pb = parseDmy(b);
  if (!pa || !pb) return 0;
  return pa.getTime() - pb.getTime();
}

function monthKey(dateStr) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(dateStr || ''));
  if (!m) return null;
  return pad(m[2]) + '/' + m[3];
}

function sortMonth(a, b) {
  const sa = a.split('/');
  const sb = b.split('/');
  return sa[1] === sb[1] ? Number(sa[0]) - Number(sb[0]) : Number(sa[1]) - Number(sb[1]);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// =========================================================================
// MIRROR TO HUMAN SHEETS (Phi / Alpha)
// =========================================================================
// Mỗi khi thêm/sửa/xóa fee hoặc project, mirror dữ liệu sang 2 sheet "người
// đọc" (Phi, Alpha) — cùng layout với ImportFees / ImportProjects.
//
// Mapping account: header trong Phi/Alpha là displayName của account. Build map
// displayName/name → id từ sheet Accounts (không phụ thuộc ACCOUNT_DEFS bên Import).
//
// Lỗi: nếu sheet thiếu hoặc cấu trúc sai → throw (user chọn "báo lỗi rõ ràng").
// Mirror chạy SAU khi đã ghi vào Fees/AlphaProjects, nên data gốc vẫn an toàn dù
// mirror lỗi — lần bootstrap kế tiếp app vẫn hiển thị đúng từ Fees/AlphaProjects.

/**
 * Ghi nhiều ô rời rạc trên CÙNG 1 hàng với ít round-trip nhất: gom các cột
 * liên tiếp thành 1 block setValues (layout Phi/Alpha thường có các cột cần
 * ghi nằm cạnh nhau → đa số trường hợp chỉ còn 1 lệnh ghi).
 * cellMap = { sốCột(1-based): giá trị } — giá trị '' sẽ xóa nội dung ô.
 * Chỉ đụng đúng các cột được liệt kê, không ảnh hưởng công thức cột khác.
 */
function setRowCells(sh, row, cellMap) {
  const cols = Object.keys(cellMap).map(Number).sort(function (a, b) { return a - b; });
  let i = 0;
  while (i < cols.length) {
    let j = i;
    while (j + 1 < cols.length && cols[j + 1] === cols[j] + 1) j++;
    const vals = [];
    for (let k = i; k <= j; k++) vals.push(cellMap[cols[k]]);
    sh.getRange(row, cols[i], 1, vals.length).setValues([vals]);
    i = j + 1;
  }
}

function findSheetByName(name) {
  const target = String(name).toLowerCase().trim();
  const sheets = activeSpreadsheet().getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase().trim() === target) return sheets[i];
  }
  return null;
}

function buildAccountNameToId() {
  const map = {};
  listAccounts().forEach(function (a) {
    if (a.displayName) map[String(a.displayName).toLowerCase().trim()] = a.id;
    if (a.name) map[String(a.name).toLowerCase().trim()] = a.id;
  });
  return map;
}

// --------------------------------------------------------------------------
// PHI (fees)
// --------------------------------------------------------------------------
/**
 * Đọc cấu trúc sheet Phi → { sheet, cols }.
 * cols = { accountId: { feeCol, pointsCol } } (số cột 1-based).
 * Row 1 = tên account (merge ngang 2 ô → chỉ ô đầu có value), Row 2 = Phí/Điểm.
 */
function readPhiLayout() {
  const sh = findSheetByName(HUMAN_SHEETS.PHI);
  if (!sh) throw new Error('Đồng bộ Phí thất bại: không tìm thấy sheet "' + HUMAN_SHEETS.PHI + '".');
  const lastCol = sh.getLastColumn();
  if (lastCol < 2) throw new Error('Sheet "' + HUMAN_SHEETS.PHI + '" chưa có cột dữ liệu (cần hàng tiêu đề Account + Phí/Điểm).');
  const headerAcc = sh.getRange(1, 2, 1, lastCol - 1).getValues()[0];
  const headerKind = sh.getRange(2, 2, 1, lastCol - 1).getValues()[0];
  const nameToId = buildAccountNameToId();
  const cols = {};
  let currentId = null;
  for (let i = 0; i < headerAcc.length; i++) {
    const accName = String(headerAcc[i] || '').trim();
    if (accName) currentId = nameToId[accName.toLowerCase()] || null;
    if (!currentId) continue;
    const kind = String(headerKind[i] || '').toLowerCase().trim();
    if (!cols[currentId]) cols[currentId] = { feeCol: 0, pointsCol: 0 };
    const colNum = i + 2; // range bắt đầu từ cột 2
    if (kind.indexOf('ph') === 0) cols[currentId].feeCol = colNum;
    else if (kind.indexOf('đ') === 0 || kind.indexOf('d') === 0) cols[currentId].pointsCol = colNum;
  }
  if (Object.keys(cols).length === 0) {
    throw new Error('Sheet "' + HUMAN_SHEETS.PHI + '" không có cột account nào khớp với danh sách Accounts.');
  }
  return { sheet: sh, cols: cols };
}

/**
 * Upsert fee/points vào Phi theo ngày. Tìm hàng có cột A = date → ghi vào ô
 * Phí/Điểm của account; nếu ngày chưa có → thêm hàng mới xuống cuối sheet.
 * Account không có cột trong Phi (vd booster) → bỏ qua, không báo lỗi.
 */
function mirrorFeesToPhi(entries) {
  if (!entries || !entries.length) return;
  const layout = readPhiLayout();
  const sh = layout.sheet, cols = layout.cols;
  const startRow = PHI_DATA_START;
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();

  const byDate = {};
  const dateOrder = [];
  entries.forEach(function (e) {
    if (!e.date || !e.accountId || !cols[e.accountId]) return;
    if (!byDate[e.date]) { byDate[e.date] = []; dateOrder.push(e.date); }
    byDate[e.date].push(e);
  });
  if (!dateOrder.length) return;

  const dateRow = {};
  if (lastRow >= startRow) {
    const dateVals = sh.getRange(startRow, 1, lastRow - startRow + 1, 1).getValues();
    for (let i = 0; i < dateVals.length; i++) {
      const dmy = formatDateValue(dateVals[i][0]);
      if (dmy && dateRow[dmy] === undefined) dateRow[dmy] = startRow + i;
    }
  }

  const newRows = [];
  dateOrder.forEach(function (date) {
    const items = byDate[date];
    if (dateRow[date] !== undefined) {
      // Hàng đã tồn tại → chỉ ghi đúng ô Phí/Điểm, KHÔNG đụng các cột khác
      // (tránh ghi đè công thức/định dạng có sẵn trong hàng).
      const cellMap = {};
      items.forEach(function (e) {
        const c = cols[e.accountId];
        if (c.feeCol) cellMap[c.feeCol] = round2(Number(e.fee) || 0);
        if (c.pointsCol) cellMap[c.pointsCol] = Number(e.points) || 0;
      });
      setRowCells(sh, dateRow[date], cellMap);
    } else {
      const rowVals = new Array(lastCol).fill('');
      rowVals[0] = parseDmy(date) || date;
      items.forEach(function (e) {
        const c = cols[e.accountId];
        if (c.feeCol) rowVals[c.feeCol - 1] = round2(Number(e.fee) || 0);
        if (c.pointsCol) rowVals[c.pointsCol - 1] = Number(e.points) || 0;
      });
      newRows.push(rowVals);
    }
  });

  if (newRows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, newRows.length, lastCol).setValues(newRows);
  }
}

/** Xóa ô Phí/Điểm của (date, accountId) trong Phi nếu hàng ngày đó tồn tại. */
function clearPhiCells(date, accountId) {
  const layout = readPhiLayout();
  const c = layout.cols[accountId];
  if (!c) return;
  const sh = layout.sheet, startRow = PHI_DATA_START, lastRow = sh.getLastRow();
  if (lastRow < startRow) return;
  const dateVals = sh.getRange(startRow, 1, lastRow - startRow + 1, 1).getValues();
  for (let i = 0; i < dateVals.length; i++) {
    if (formatDateValue(dateVals[i][0]) === date) {
      const cellMap = {};
      if (c.feeCol) cellMap[c.feeCol] = '';
      if (c.pointsCol) cellMap[c.pointsCol] = '';
      setRowCells(sh, startRow + i, cellMap);
      return;
    }
  }
}

// --------------------------------------------------------------------------
// ALPHA (projects)
// --------------------------------------------------------------------------
/**
 * Đọc cấu trúc sheet Alpha → vị trí (0-based) các cột chính + cột reward account.
 */
function readAlphaLayout() {
  const sh = findSheetByName(HUMAN_SHEETS.ALPHA);
  if (!sh) throw new Error('Đồng bộ dự án thất bại: không tìm thấy sheet "' + HUMAN_SHEETS.ALPHA + '".');
  const lastCol = sh.getLastColumn();
  if (lastCol < 2) throw new Error('Sheet "' + HUMAN_SHEETS.ALPHA + '" chưa có cột dữ liệu.');
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (s) { return String(s || '').trim(); });
  function findCol() {
    for (let i = 0; i < arguments.length; i++) {
      const idx = header.indexOf(arguments[i]);
      if (idx >= 0) return idx;
    }
    return -1;
  }
  const colStt = findCol('STT');
  const colName = findCol('Dự Án', 'Dự án', 'Du An', 'Project', 'Tên');
  const colDate = findCol('Ngày', 'Date');
  const colClaim = findCol('Claim', 'ClaimPoints');
  const colType = findCol('Loại', 'Type');
  if (colName < 0 || colDate < 0) {
    throw new Error('Sheet "' + HUMAN_SHEETS.ALPHA + '" cần có cột "Dự Án" và "Ngày" ở hàng 1.');
  }
  const nameToId = buildAccountNameToId();
  const accountCols = {};
  for (let i = 0; i < header.length; i++) {
    const id = header[i] ? nameToId[header[i].toLowerCase()] : null;
    if (id) accountCols[id] = i;
  }
  return {
    sheet: sh, lastCol: lastCol,
    colStt: colStt, colName: colName, colDate: colDate, colClaim: colClaim, colType: colType,
    accountCols: accountCols,
  };
}

/**
 * Thêm project vào Alpha. Ưu tiên điền vào hàng đã có sẵn ngày nhưng CHƯA có dự
 * án (Dự Án trống). Nếu ngày đó đã có dự án → chèn thêm 1 hàng cùng ngày (1 ngày
 * có thể 2 dự án). Nếu ngày chưa có → thêm xuống cuối.
 */
function mirrorProjectToAlpha(project) {
  const L = readAlphaLayout();
  const sh = L.sheet;
  const lastRow = sh.getLastRow();

  let emptyRow = -1;
  let lastSameDateRow = -1;
  if (lastRow >= ALPHA_DATA_START) {
    const block = sh.getRange(ALPHA_DATA_START, 1, lastRow - ALPHA_DATA_START + 1, L.lastCol).getValues();
    for (let i = 0; i < block.length; i++) {
      if (formatDateValue(block[i][L.colDate]) !== project.date) continue;
      lastSameDateRow = ALPHA_DATA_START + i;
      const nm = String(block[i][L.colName] || '').trim();
      if (emptyRow < 0 && !nm) emptyRow = ALPHA_DATA_START + i;
    }
  }

  let targetRow, setStt;
  if (emptyRow > 0) {
    targetRow = emptyRow;            // điền vào hàng ngày trống → giữ nguyên STT có sẵn
    setStt = false;
  } else if (lastSameDateRow > 0) {
    sh.insertRowsAfter(lastSameDateRow, 1); // ngày đã có dự án → thêm 1 hàng cùng ngày
    targetRow = lastSameDateRow + 1;
    setStt = true;
  } else {
    targetRow = sh.getLastRow() + 1; // ngày chưa có → cuối sheet
    setStt = true;
  }

  writeAlphaRow(sh, L, targetRow, project, setStt);
}

/**
 * Ghi project vào 1 hàng Alpha. Chỉ ghi đúng các ô quản lý (STT, tên, ngày,
 * claim, loại, reward account) — không đụng cột khác để tránh đè công thức.
 * setStt=false để giữ STT có sẵn (khi điền vào hàng ngày trống / khi update).
 * STT mới dùng công thức =ROW()-1 để tự đánh số theo vị trí hàng.
 */
function writeAlphaRow(sh, L, row, project, setStt) {
  if (setStt && L.colStt >= 0) sh.getRange(row, L.colStt + 1).setFormula('=ROW()-1');
  const cellMap = {};
  cellMap[L.colName + 1] = project.name;
  cellMap[L.colDate + 1] = parseDmy(project.date) || project.date;
  if (L.colClaim >= 0) cellMap[L.colClaim + 1] = Number(project.claimPoints) || 15;
  if (L.colType >= 0) cellMap[L.colType + 1] = project.type || 'FCFS';
  const rewards = project.rewards || {};
  for (const accId in L.accountCols) {
    const v = Number(rewards[accId]);
    cellMap[L.accountCols[accId] + 1] = (Number.isFinite(v) && v !== 0) ? round2(v) : '';
  }
  setRowCells(sh, row, cellMap);
}

function findAlphaRow(sh, L, name, date) {
  const lastRow = sh.getLastRow();
  if (lastRow < ALPHA_DATA_START) return -1;
  const block = sh.getRange(ALPHA_DATA_START, 1, lastRow - ALPHA_DATA_START + 1, L.lastCol).getValues();
  const targetName = String(name || '').toLowerCase().trim();
  for (let i = 0; i < block.length; i++) {
    const nm = String(block[i][L.colName] || '').toLowerCase().trim();
    if (nm === targetName && formatDateValue(block[i][L.colDate]) === date) {
      return ALPHA_DATA_START + i;
    }
  }
  return -1;
}

/** Cập nhật hàng Alpha khớp (oldName, oldDate). Không thấy → thêm mới. */
function mirrorProjectUpdateInAlpha(oldProj, newProj) {
  const L = readAlphaLayout();
  const row = findAlphaRow(L.sheet, L, oldProj.name, oldProj.date);
  if (row < 0) { mirrorProjectToAlpha(newProj); return; }
  writeAlphaRow(L.sheet, L, row, newProj, false);
}

/**
 * Xóa project khỏi Alpha: xóa nội dung dự án (tên, claim, loại, rewards) nhưng
 * GIỮ lại STT + ngày — biến hàng về dạng "ngày trống" để không phá scaffold ngày
 * mà user đã điền sẵn (và lần tạo dự án sau cùng ngày sẽ tái dùng hàng này).
 */
function mirrorProjectDeleteFromAlpha(name, date) {
  const L = readAlphaLayout();
  const row = findAlphaRow(L.sheet, L, name, date);
  if (row < 0) return;
  const cellMap = {};
  cellMap[L.colName + 1] = '';
  if (L.colClaim >= 0) cellMap[L.colClaim + 1] = '';
  if (L.colType >= 0) cellMap[L.colType + 1] = '';
  for (const accId in L.accountCols) cellMap[L.accountCols[accId] + 1] = '';
  setRowCells(L.sheet, row, cellMap);
}
