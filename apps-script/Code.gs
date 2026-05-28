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
};

const HEADERS = {
  Accounts: ['id', 'name', 'displayName', 'color', 'active', 'createdAt'],
  Fees: ['id', 'date', 'accountId', 'fee', 'points', 'note', 'createdAt'],
  AlphaProjects: ['id', 'name', 'date', 'claimPoints', 'type', 'rewards', 'note', 'createdAt'],
};

const DEFAULT_ACCOUNTS = [
  { id: 'main', name: 'Main', color: '#ef4444' },
  { id: 'emiu', name: 'Em iu', color: '#ec4899' },
  { id: 'huy', name: 'Huy', color: '#f59e0b' },
  { id: 'old', name: 'Old', color: '#10b981' },
  { id: 'new', name: 'New', color: '#3b82f6' },
  { id: 'bo', name: 'Bo', color: '#8b5cf6' },
];

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

    case '':
    case 'health':
      return { status: 'ok', time: new Date().toISOString() };
  }
  throw new Error('Unknown resource/action: ' + resource + '/' + action);
}

// =========================================================================
// SHEET HELPERS
// =========================================================================
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const headers = HEADERS[name];
    if (headers) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function readRows(name) {
  const sh = getSheet(name);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return [];
  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const headers = HEADERS[name];
  return values
    .filter(function (r) { return r[0] !== '' && r[0] !== null; })
    .map(function (r) {
      const o = {};
      for (let i = 0; i < headers.length; i++) o[headers[i]] = r[i];
      return o;
    });
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
  let accounts = readRows(SHEETS.ACCOUNTS).map(normalizeAccount);
  if (accounts.length === 0) {
    accounts = DEFAULT_ACCOUNTS.map(function (a) {
      return {
        id: a.id,
        name: a.name,
        displayName: a.name,
        color: a.color,
        active: true,
        createdAt: new Date().toISOString(),
      };
    });
    writeAll(SHEETS.ACCOUNTS, accounts);
  }
  return accounts;
}

function normalizeAccount(r) {
  return {
    id: String(r.id),
    name: r.name,
    displayName: r.displayName || r.name,
    color: r.color || '#3b82f6',
    active: r.active !== false && r.active !== 'FALSE' && r.active !== '',
    createdAt: r.createdAt || '',
  };
}

function createAccount(payload) {
  const name = (payload.name || '').trim();
  if (!name) throw new Error('name là bắt buộc');
  const id = name.toLowerCase().replace(/\s+/g, '_');
  const list = listAccounts();
  if (list.some(function (a) { return a.id === id; }))
    throw new Error('Account đã tồn tại');
  const item = {
    id: id,
    name: name,
    displayName: name,
    color: payload.color || '#3b82f6',
    active: true,
    createdAt: new Date().toISOString(),
  };
  appendItem(SHEETS.ACCOUNTS, item);
  return item;
}

function updateAccount(payload) {
  const list = listAccounts();
  const idx = list.findIndex(function (a) { return a.id === payload.id; });
  if (idx === -1) throw new Error('Không tìm thấy');
  list[idx] = Object.assign({}, list[idx], payload);
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

function createFee(payload) {
  if (!payload.date || !payload.accountId)
    throw new Error('date và accountId là bắt buộc');
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
  return item;
}

function bulkCreateFees(payload) {
  const entries = payload.entries || [];
  if (!Array.isArray(entries) || entries.length === 0)
    throw new Error('entries phải là mảng');
  const sh = getSheet(SHEETS.FEES);
  const headers = HEADERS.Fees;
  const now = Date.now();
  const rows = entries.map(function (e, i) {
    const item = {
      id: String(now + i),
      date: e.date,
      accountId: e.accountId,
      fee: Number(e.fee) || 0,
      points: Number(e.points) || 0,
      note: e.note || '',
      createdAt: new Date().toISOString(),
    };
    return headers.map(function (h) { return item[h]; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  return { inserted: rows.length };
}

function updateFee(payload) {
  const list = listFees({});
  const idx = list.findIndex(function (f) { return f.id === payload.id; });
  if (idx === -1) throw new Error('Không tìm thấy');
  list[idx] = Object.assign({}, list[idx], payload);
  writeAll(SHEETS.FEES, list);
  return list[idx];
}

function deleteFee(payload) {
  const list = listFees({}).filter(function (f) { return f.id !== payload.id; });
  writeAll(SHEETS.FEES, list);
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
  const vndRate = Number(payload.vndRate || DEFAULT_VND_RATE);

  const fees = listFees({});
  const projects = listProjects();

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
  const requiredPoints = Number(payload.requiredPoints || 15);
  const fees = listFees({});
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
