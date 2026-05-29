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
  Fees: ['id', 'date', 'accountId', 'fee', 'points', 'note', 'createdAt'],
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

function activeSpreadsheet() {
  if (!_ssCache) _ssCache = SpreadsheetApp.getActiveSpreadsheet();
  return _ssCache;
}

function getSheet(name) {
  if (_sheetCache[name]) return _sheetCache[name];
  const ss = activeSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const headers = HEADERS[name];
    if (headers) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
  } else {
    ensureHeaders(sh, name);
  }
  // FeesMonthly.month dạng "MM/YYYY" — Sheets sẽ auto-coerce thành Date object
  // (April 1, 2026) khi setValues vào ô format mặc định. Pin column B = plain text
  // để các write sau giữ nguyên string.
  if (name === SHEETS.FEES_MONTHLY) {
    sh.getRange('B:B').setNumberFormat('@');
  }
  _sheetCache[name] = sh;
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
  const sh = getSheet(name);
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
    });
    writeAll(SHEETS.FEES, list);
    invalidateFeesMonthly([monthKey(payload.date)]);
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
  };
  appendItem(SHEETS.FEES, item);
  invalidateFeesMonthly([monthKey(item.date)]);
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
      };
      indexByKey[key] = list.length;
      list.push(item);
      inserted++;
    }
  });

  if (inserted + updated > 0) writeAll(SHEETS.FEES, list);
  invalidateFeesMonthly(Object.keys(months));
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
function clearOldDaily() {
  const currentKey = currentMonthKey();
  const all = listFees({});
  const kept = all.filter(function (f) { return monthKey(f.date) === currentKey; });
  const removed = all.length - kept.length;
  if (removed > 0) writeAll(SHEETS.FEES, kept);
  return { removed: removed, kept: kept.length };
}

function updateFee(payload) {
  const list = listFees({});
  const idx = list.findIndex(function (f) { return f.id === payload.id; });
  if (idx === -1) throw new Error('Không tìm thấy');
  const oldMonth = monthKey(list[idx].date);
  list[idx] = Object.assign({}, list[idx], payload);
  const newMonth = monthKey(list[idx].date);
  writeAll(SHEETS.FEES, list);
  invalidateFeesMonthly([oldMonth, newMonth]);
  return list[idx];
}

function deleteFee(payload) {
  const all = listFees({});
  const target = all.find(function (f) { return f.id === payload.id; });
  const list = all.filter(function (f) { return f.id !== payload.id; });
  writeAll(SHEETS.FEES, list);
  if (target) invalidateFeesMonthly([monthKey(target.date)]);
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
  return item;
}

function updateProject(payload) {
  const list = listProjects();
  const idx = list.findIndex(function (p) { return p.id === payload.id; });
  if (idx === -1) throw new Error('Không tìm thấy');
  list[idx] = Object.assign({}, list[idx], payload);
  writeAll(SHEETS.ALPHA, list);
  return list[idx];
}

function deleteProject(payload) {
  const list = listProjects().filter(function (p) { return p.id !== payload.id; });
  writeAll(SHEETS.ALPHA, list);
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

  return {
    accounts: accounts,
    fees: currentFees,
    feesMonthly: feesMonthly,
    projects: projects,
    summary: summary,
    points: computePoints(allFees, payload.requiredPoints),
    currentMonth: currentKey,
    pastDaily: computePastDailyStatus(pastFees, archivedMonths),
  };
}

/**
 * Tổng hợp tình trạng daily rows tháng cũ:
 *  - total: số rows past-month trong sheet Fees
 *  - active: số rows có tradeDate + 15 >= today (vẫn tính điểm Alpha)
 *  - safeToDelete: true khi mọi row đã hết hiệu lực điểm
 *  - earliestSafeDate: nếu chưa safe → DMY của ngày sẽ safeToDelete sau khi tới
 *  - pendingArchiveMonths: tháng past có raw nhưng chưa có aggregate
 */
function computePastDailyStatus(pastFees, archivedMonths) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let active = 0;
  let latestResetTs = 0;
  const monthsWithRaw = {};

  pastFees.forEach(function (f) {
    const d = parseDmy(f.date);
    if (!d) return;
    monthsWithRaw[monthKey(f.date)] = true;
    const reset = new Date(d);
    reset.setDate(reset.getDate() + 15);
    if (reset.getTime() >= today.getTime()) {
      active++;
      if (reset.getTime() > latestResetTs) latestResetTs = reset.getTime();
    }
  });

  const pendingArchiveMonths = Object.keys(monthsWithRaw)
    .filter(function (m) { return !archivedMonths[m]; })
    .sort(sortMonth);

  return {
    total: pastFees.length,
    active: active,
    safeToDelete: pastFees.length > 0 && active === 0,
    earliestSafeDate: latestResetTs > 0 ? formatDmy(new Date(latestResetTs + 86400000)) : null,
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
