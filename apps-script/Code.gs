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
    'createdAt', 'sortOrder', 'hideInPoints',
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

    const result = dispatch(resource, action, payload, params);
    // Mọi action ghi dữ liệu → bump dataVersion để vô hiệu cache bootstrap.
    if (MUTATING_ACTIONS[action]) bumpDataVersion();
    return jsonResponse({ ok: true, data: result });
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
function verifyAuth(body) {
  const secret = PropertiesService.getScriptProperties().getProperty('APP_SECRET');
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
  create: true, update: true, delete: true, bulk: true,
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
function dispatch(resource, action, payload, params) {
  switch (resource) {
    case 'accounts':
      if (action === 'list') return listAccounts();
      if (action === 'create') return createAccount(payload);
      if (action === 'update') return updateAccount(payload);
      if (action === 'delete') return deleteAccount(payload);
      break;

    case 'fees':
      if (action === 'list') return listFees(payload);
      if (action === 'create') return createFee(payload);
      if (action === 'bulk') return bulkCreateFees(payload);
      if (action === 'update') return updateFee(payload);
      if (action === 'delete') return deleteFee(payload);
      if (action === 'archive') return archivePastMonths();
      if (action === 'clearOld') return clearOldDaily();
      break;

    case 'alpha':
      if (action === 'list') return listProjects();
      if (action === 'create') return createProject(payload);
      if (action === 'update') return updateProject(payload);
      if (action === 'delete') return deleteProject(payload);
      break;

    case 'summary':
      if (action === 'get') return getSummary(payload);
      break;

    case 'points':
      if (action === 'get') return getPoints(payload);
      if (action === 'fromVolume') return pointsFromVolumeApi(payload);
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

function readRows(name) {
  const sh = getSheetForRead(name);
  if (!sh) return []; // sheet chưa tồn tại — sẽ được tạo ở lần ghi đầu
  // getDataRange = 1 round-trip lấy cả values + dims; tốt hơn getLastRow+getLastCol+getRange
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = HEADERS[name];
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r[0] === '' || r[0] === null) continue;
    const o = {};
    for (let j = 0; j < headers.length; j++) o[headers[j]] = r[j];
    out.push(o);
  }
  return out;
}

function writeAll(name, items) {
  const sh = getSheet(name);
  const headers = HEADERS[name];
  const lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  if (items.length === 0) return;
  const rows = items.map(function (o) {
    return headers.map(function (h) {
      const v = o[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
  });
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function appendItem(name, item) {
  const sh = getSheet(name);
  const headers = HEADERS[name];
  const row = headers.map(function (h) {
    const v = item[h];
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  sh.appendRow(row);
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
function listFees(payload) {
  payload = payload || {};
  let fees = readRows(SHEETS.FEES).map(function (r) {
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
  });
  if (payload.accountId) fees = fees.filter(function (f) { return f.accountId === payload.accountId; });
  if (payload.from) fees = fees.filter(function (f) { return cmpDmy(f.date, payload.from) >= 0; });
  if (payload.to) fees = fees.filter(function (f) { return cmpDmy(f.date, payload.to) <= 0; });
  return fees;
}

/**
 * Upsert một fee theo khóa (date, accountId). Nếu đã tồn tại → ghi đè fee/points/note,
 * giữ nguyên id + createdAt. Nếu chưa → append.
 */
function createFee(payload) {
  if (!payload.date || !payload.accountId)
    throw new Error('date và accountId là bắt buộc');
  const list = listFees({});
  const idx = list.findIndex(function (f) {
    return f.date === payload.date && f.accountId === payload.accountId;
  });
  if (idx > -1) {
    list[idx] = Object.assign({}, list[idx], {
      fee: Number(payload.fee) || 0,
      points: Number(payload.points) || 0,
      note: payload.note != null ? payload.note : (list[idx].note || ''),
      highlight: payload.highlight != null ? !!payload.highlight : !!list[idx].highlight,
    });
    writeAll(SHEETS.FEES, list);
    invalidateFeesMonthly([monthKey(payload.date)]);
    mirrorFeesToPhi([{ date: list[idx].date, accountId: list[idx].accountId, fee: list[idx].fee, points: list[idx].points }]);
    return list[idx];
  }
  const item = {
    id: String(Date.now()),
    date: payload.date,
    accountId: payload.accountId,
    fee: Number(payload.fee) || 0,
    points: Number(payload.points) || 0,
    note: payload.note || '',
    createdAt: new Date().toISOString(),
    highlight: !!payload.highlight,
  };
  appendItem(SHEETS.FEES, item);
  invalidateFeesMonthly([monthKey(item.date)]);
  mirrorFeesToPhi([{ date: item.date, accountId: item.accountId, fee: item.fee, points: item.points }]);
  return item;
}

/**
 * Upsert nhiều entries cùng lúc. Trong cùng batch nếu có 2 entry trùng key,
 * entry sau ghi đè entry trước.
 */
function bulkCreateFees(payload) {
  const entries = payload.entries || [];
  if (!Array.isArray(entries) || entries.length === 0)
    throw new Error('entries phải là mảng');
  const list = listFees({});
  const indexByKey = {};
  list.forEach(function (f, i) { indexByKey[f.date + '|' + f.accountId] = i; });

  const months = {};
  const now = Date.now();
  let inserted = 0;
  let updated = 0;

  entries.forEach(function (e, i) {
    if (!e.date || !e.accountId) return;
    months[monthKey(e.date)] = true;
    const key = e.date + '|' + e.accountId;
    const idx = indexByKey[key];
    if (idx !== undefined) {
      const cur = list[idx];
      list[idx] = Object.assign({}, cur, {
        fee: Number(e.fee) || 0,
        points: Number(e.points) || 0,
        note: e.note != null ? e.note : (cur.note || ''),
        highlight: e.highlight != null ? !!e.highlight : !!cur.highlight,
      });
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
      indexByKey[key] = list.length;
      list.push(item);
      inserted++;
    }
  });

  if (inserted + updated > 0) writeAll(SHEETS.FEES, list);
  invalidateFeesMonthly(Object.keys(months));
  // Mirror sang Phi: lấy giá trị cuối cùng từ list (đã upsert) cho từng (date, account).
  const mirror = [];
  entries.forEach(function (e) {
    if (!e.date || !e.accountId) return;
    const f = list[indexByKey[e.date + '|' + e.accountId]];
    if (f) mirror.push({ date: f.date, accountId: f.accountId, fee: f.fee, points: f.points });
  });
  mirrorFeesToPhi(mirror);
  return { inserted: inserted, updated: updated };
}

/**
 * Tổng hợp các tháng cũ vào FeesMonthly. Idempotent — gọi nhiều lần OK.
 * Không xóa daily rows (vẫn cần cho tính điểm).
 */
function archivePastMonths() {
  const allFees = listFees({});
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
  const all = listFees({});
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
  const list = listFees({});
  const idx = list.findIndex(function (f) { return f.id === payload.id; });
  if (idx === -1) throw new Error('Không tìm thấy');
  const oldMonth = monthKey(list[idx].date);
  const oldKey = { date: list[idx].date, accountId: list[idx].accountId };
  list[idx] = Object.assign({}, list[idx], payload);
  const newMonth = monthKey(list[idx].date);
  writeAll(SHEETS.FEES, list);
  invalidateFeesMonthly([oldMonth, newMonth]);
  // Nếu đổi ngày/account → xóa ô cũ trước, rồi ghi ô mới.
  const nu = list[idx];
  if (oldKey.date !== nu.date || oldKey.accountId !== nu.accountId) {
    clearPhiCells(oldKey.date, oldKey.accountId);
  }
  mirrorFeesToPhi([{ date: nu.date, accountId: nu.accountId, fee: nu.fee, points: nu.points }]);
  return list[idx];
}

function deleteFee(payload) {
  const all = listFees({});
  const target = all.find(function (f) { return f.id === payload.id; });
  const list = all.filter(function (f) { return f.id !== payload.id; });
  writeAll(SHEETS.FEES, list);
  if (target) {
    invalidateFeesMonthly([monthKey(target.date)]);
    clearPhiCells(target.date, target.accountId);
  }
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
// SUMMARY (lợi nhuận theo tháng)
// =========================================================================
function getSummary(payload) {
  payload = payload || {};
  return computeSummary(listFees({}), listProjects(), payload.vndRate);
}

function computeSummary(fees, projects, vndRateInput) {
  const vndRate = Number(vndRateInput || DEFAULT_VND_RATE);

  const byMonth = {};
  function bucket(key) {
    if (!byMonth[key]) byMonth[key] = { rewards: {}, fees: {}, projects: 0 };
    return byMonth[key];
  }

  fees.forEach(function (f) {
    const key = monthKey(f.date);
    if (!key) return;
    const b = bucket(key);
    b.fees[f.accountId] = (b.fees[f.accountId] || 0) + f.fee;
  });

  projects.forEach(function (p) {
    const key = monthKey(p.date);
    if (!key) return;
    const b = bucket(key);
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
// POINTS
// =========================================================================
function getPoints(payload) {
  payload = payload || {};
  return computePoints(listFees({}), payload.requiredPoints);
}

function computePoints(fees, requiredPointsInput) {
  const requiredPoints = Number(requiredPointsInput || 15);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const grouped = {};
  fees.forEach(function (f) {
    if (!grouped[f.accountId]) grouped[f.accountId] = [];
    grouped[f.accountId].push(f);
  });

  const accounts = Object.keys(grouped).map(function (id) {
    const entries = grouped[id];
    let current = 0;
    const schedule = [];
    entries.forEach(function (e) {
      const d = parseDmy(e.date);
      if (!d) return;
      const reset = new Date(d);
      reset.setDate(reset.getDate() + 15);
      if (reset.getTime() >= today.getTime()) {
        current += e.points || 0;
        schedule.push({
          tradeDate: formatDmy(d),
          resetDate: formatDmy(reset),
          daysLeft: Math.ceil((reset.getTime() - today.getTime()) / 86400000),
          points: e.points || 0,
        });
      }
    });
    schedule.sort(function (a, b) { return a.resetDate < b.resetDate ? -1 : 1; });
    return {
      accountId: id,
      currentPoints: current,
      airdrop: {
        eligible: current >= requiredPoints,
        current: current,
        required: requiredPoints,
        deficit: Math.max(0, requiredPoints - current),
      },
      schedule: schedule.slice(0, 10),
    };
  });

  return { requiredPoints: requiredPoints, accounts: accounts };
}

function pointsFromVolumeApi(payload) {
  const volume = Number(payload.volume) || 0;
  return {
    volume: volume,
    currentPoint: pointsFromVolume(volume),
    next: nextThreshold(volume),
  };
}

function pointsFromVolume(volume) {
  if (!volume || volume < 2) return 0;
  let p = 0;
  for (let i = 1; i <= 20; i++) {
    if (volume >= Math.pow(2, i)) p = i; else break;
  }
  return p;
}

function nextThreshold(volume) {
  const p = pointsFromVolume(volume);
  if (p >= 20) return null;
  const nextVol = Math.pow(2, p + 1);
  return {
    nextPoint: p + 1,
    nextVolume: nextVol,
    volumeNeeded: nextVol - volume,
  };
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
  const cacheKey = [
    'bootstrap', getDataVersion(), formatDmy(new Date()),
    payload.vndRate || '', payload.requiredPoints || '',
  ].join('|');
  if (!payload.nocache) {
    const hit = cache.get(cacheKey);
    if (hit) {
      try { return JSON.parse(hit); } catch (_) { /* cache hỏng → tính lại */ }
    }
  }

  const accounts = listAccounts();
  const allFees = listFees({});
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
  const summary = computeSummaryFast(
    currentFees.concat(summaryPastFees),
    feesMonthly,
    projects,
    payload.vndRate
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
    points: computePoints(allFees, payload.requiredPoints),
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
      const r = dateRow[date];
      items.forEach(function (e) {
        const c = cols[e.accountId];
        if (c.feeCol) sh.getRange(r, c.feeCol).setValue(round2(Number(e.fee) || 0));
        if (c.pointsCol) sh.getRange(r, c.pointsCol).setValue(Number(e.points) || 0);
      });
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
      const r = startRow + i;
      if (c.feeCol) sh.getRange(r, c.feeCol).clearContent();
      if (c.pointsCol) sh.getRange(r, c.pointsCol).clearContent();
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
  sh.getRange(row, L.colName + 1).setValue(project.name);
  sh.getRange(row, L.colDate + 1).setValue(parseDmy(project.date) || project.date);
  if (L.colClaim >= 0) sh.getRange(row, L.colClaim + 1).setValue(Number(project.claimPoints) || 15);
  if (L.colType >= 0) sh.getRange(row, L.colType + 1).setValue(project.type || 'FCFS');
  const rewards = project.rewards || {};
  for (const accId in L.accountCols) {
    const ci = L.accountCols[accId];
    const v = Number(rewards[accId]);
    if (Number.isFinite(v) && v !== 0) sh.getRange(row, ci + 1).setValue(round2(v));
    else sh.getRange(row, ci + 1).clearContent();
  }
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
  const sh = L.sheet;
  sh.getRange(row, L.colName + 1).clearContent();
  if (L.colClaim >= 0) sh.getRange(row, L.colClaim + 1).clearContent();
  if (L.colType >= 0) sh.getRange(row, L.colType + 1).clearContent();
  for (const accId in L.accountCols) sh.getRange(row, L.accountCols[accId] + 1).clearContent();
}
