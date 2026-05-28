/**
 * IMPORT DỮ LIỆU CŨ
 * =================
 * Chạy 1 lần để nạp data từ 2 sheet legacy vào Fees + AlphaProjects.
 * Tự động tạo các account còn thiếu (theo ACCOUNT_DEFS dưới đây).
 *
 * CÁCH DÙNG:
 *   1. Mở Apps Script editor → thêm file mới (➕) tên "Import" → paste file này
 *   2. Tạo 2 sheet phụ trong cùng Google Sheet:
 *        a. "ImportFees"     — paste data fees cũ (2 hàng header + data)
 *        b. "ImportProjects" — paste data alpha projects cũ (1 hàng header + data)
 *   3. Chỉnh ACCOUNT_DEFS bên dưới (tên header sheet cũ → account info) cho khớp
 *   4. Apps Script editor → dropdown chọn "importLegacy" → Run
 *   5. View → Logs để xem kết quả
 *
 * ⚠️ Chạy 2 lần sẽ DUPLICATE. Mọi row imported có note="imported" để dễ lọc/xóa.
 */

/**
 * Map header trong sheet cũ → định nghĩa account.
 * - Cùng 1 account có thể xuất hiện dưới nhiều header alias (ví dụ "Main" và "Main (Mi 17)").
 * - Nếu account chưa có trong sheet Accounts → tự tạo theo info dưới đây.
 * - Account đã tồn tại sẽ KHÔNG bị ghi đè (giữ nguyên cài đặt hiện tại).
 */
const ACCOUNT_DEFS = {
  'Main':           { id: 'main',  displayName: 'Main',        active: true,  color: '#ef4444' },
  'Em iu':          { id: 'emiu',  displayName: 'Em iu',       active: true,  color: '#ec4899' },
  'Huy':            { id: 'huy',   displayName: 'Huy',         active: true,  color: '#f59e0b' },
  'Old(Phu)':       { id: 'old',   displayName: 'Old(Phu)',         active: true,  color: '#10b981' },
  'New(Chanh)':     { id: 'new',   displayName: 'New(Chanh)',         active: true,  color: '#3b82f6' },
  'Bo':             { id: 'bo',    displayName: 'Bo',          active: true,  color: '#8b5cf6' },
  'Booster':        { id: 'booster', displayName: 'Booster', active: true, color: '#7c3aed' },
  // === Inactive (có data cũ nhưng không còn dùng — vẫn xuất hiện ở Dashboard) ===
  'Ba Huy':         { id: 'bahuy', displayName: 'Ba Huy',      active: false, color: '#6b7280' },
  'Tuyet':          { id: 'tuyet',   displayName: 'Tuyet', active: false, color: '#9ca3af' },
  'An':             { id: 'an',   displayName: 'An',    active: false, color: '#a3a3a3' },
};

function importLegacy() {
  Logger.log('=== Bắt đầu import ===');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('Spreadsheet: "' + ss.getName() + '"');
  const sheetNames = ss.getSheets().map(function (s) { return '"' + s.getName() + '"'; });
  Logger.log('Sheets có sẵn (' + sheetNames.length + '): ' + sheetNames.join(', '));

  const created = ensureAccountsFromDefs();
  Logger.log('Tạo mới ' + created + ' account(s)');
  const fees = importLegacyFees();
  const projects = importLegacyProjects();
  Logger.log('=== Hoàn tất: ' + fees + ' fees + ' + projects + ' projects ===');
}

// Tìm sheet theo tên — case-insensitive + trim, để không lệ thuộc khoảng trắng / hoa thường
function findSheet(ss, name) {
  const target = String(name).toLowerCase().trim();
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase().trim() === target) return sheets[i];
  }
  return null;
}

// --------------------------------------------------------------------------
/**
 * Đảm bảo các account trong ACCOUNT_DEFS đều tồn tại + đồng bộ displayName/color.
 * - Account chưa có → tạo mới (lấy đủ thông tin từ DEFS, kể cả active flag)
 * - Account đã có → CHỈ update displayName + color cho khớp DEFS
 *   (giữ nguyên active, pointTrade/Hold, vol, withdraw, lastAfter, createdAt)
 */
function ensureAccountsFromDefs() {
  const existing = listAccounts();
  const existingMap = {};
  existing.forEach(function (a) { existingMap[a.id] = a; });

  const uniqueDefs = {};
  for (const k in ACCOUNT_DEFS) {
    const d = ACCOUNT_DEFS[k];
    if (!uniqueDefs[d.id]) uniqueDefs[d.id] = d;
  }

  const all = existing.slice();
  let created = 0;
  let updated = 0;

  for (const id in uniqueDefs) {
    const d = uniqueDefs[id];
    const cur = existingMap[id];
    if (cur) {
      if (cur.displayName !== d.displayName || cur.color !== d.color) {
        cur.displayName = d.displayName;
        cur.color = d.color;
        updated++;
        Logger.log('  ~ Synced "' + d.id + '" → displayName="' + d.displayName + '", color="' + d.color + '"');
      }
    } else {
      const item = normalizeAccount({
        id: d.id,
        name: d.displayName,
        displayName: d.displayName,
        color: d.color,
        active: d.active,
        createdAt: new Date().toISOString(),
      });
      all.push(item);
      created++;
      Logger.log('  + Created "' + d.id + '" (' + d.displayName + ', active=' + d.active + ')');
    }
  }

  if (created > 0 || updated > 0) {
    writeAll(SHEETS.ACCOUNTS, all);
  }
  Logger.log('Accounts: tạo mới ' + created + ', đồng bộ ' + updated);
  return created;
}

// --------------------------------------------------------------------------
function importLegacyFees() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = findSheet(ss, 'ImportFees');
  if (!sh) {
    Logger.log('❌ Bỏ qua fees: không thấy sheet tên "ImportFees" — tạo sheet mới + paste data fees cũ vào');
    return 0;
  }

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  Logger.log('ImportFees (sheet "' + sh.getName() + '"): lastRow=' + lastRow + ', lastCol=' + lastCol);
  if (lastRow < 3 || lastCol < 2) {
    Logger.log('❌ ImportFees rỗng — cần paste ≥ 2 hàng header + ≥ 1 hàng data vào sheet này');
    return 0;
  }

  // Row 1 = account names (merged spans), Row 2 = "Phí" / "Điểm" labels
  const headerAcc = sh.getRange(1, 2, 1, lastCol - 1).getValues()[0];
  const headerKind = sh.getRange(2, 2, 1, lastCol - 1).getValues()[0];

  const colMap = [];
  let currentAcc = null;
  for (let i = 0; i < headerAcc.length; i++) {
    const accName = String(headerAcc[i] || '').trim();
    if (accName) {
      const def = ACCOUNT_DEFS[accName];
      currentAcc = def ? def.id : null;
      if (!def) Logger.log('  ⚠ Cột "' + accName + '" không có trong ACCOUNT_DEFS — bỏ qua');
    }
    const kind = String(headerKind[i] || '').toLowerCase().trim();
    colMap.push({ accountId: currentAcc, kind });
  }

  const data = sh.getRange(3, 1, lastRow - 2, lastCol).getValues();
  const feesRows = [];
  const months = {};
  const baseId = Date.now();
  let idx = 0;

  data.forEach(function (row) {
    const dateStr = formatDateValue(row[0]);
    if (!dateStr) return;

    const perAcc = {};
    for (let i = 0; i < colMap.length; i++) {
      const m = colMap[i];
      if (!m.accountId) continue;
      const v = row[i + 1];
      if (v === '' || v === null || v === undefined) continue;
      if (!perAcc[m.accountId]) perAcc[m.accountId] = { fee: 0, points: 0 };
      const num = parseLocaleNumber(v);
      if (m.kind.indexOf('ph') === 0) perAcc[m.accountId].fee = num;
      else if (m.kind.indexOf('đ') === 0 || m.kind.indexOf('d') === 0) perAcc[m.accountId].points = num;
    }

    for (const accId in perAcc) {
      const e = perAcc[accId];
      if (!e.fee && !e.points) continue;
      feesRows.push({
        id: String(baseId + (idx++)),
        date: dateStr,
        accountId: accId,
        fee: round2(e.fee),
        points: e.points,
        note: 'imported',
        createdAt: new Date().toISOString(),
      });
      months[monthKey(dateStr)] = true;
    }
  });

  if (feesRows.length === 0) {
    Logger.log('Fees: không có row hợp lệ');
    return 0;
  }

  const feeSh = getSheet(SHEETS.FEES);
  const headers = HEADERS.Fees;
  const rows = feesRows.map(function (o) {
    return headers.map(function (h) {
      const v = o[h];
      return (v === null || v === undefined) ? '' : v;
    });
  });
  feeSh.getRange(feeSh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  invalidateFeesMonthly(Object.keys(months));
  Logger.log('Imported ' + rows.length + ' fee rows');
  return rows.length;
}

// --------------------------------------------------------------------------
function importLegacyProjects() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = findSheet(ss, 'ImportProjects');
  if (!sh) {
    Logger.log('❌ Bỏ qua projects: không thấy sheet tên "ImportProjects" — tạo sheet mới + paste data alpha cũ vào');
    return 0;
  }

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  Logger.log('ImportProjects (sheet "' + sh.getName() + '"): lastRow=' + lastRow + ', lastCol=' + lastCol);
  if (lastRow < 2 || lastCol < 2) {
    Logger.log('❌ ImportProjects rỗng — cần paste 1 hàng header + ≥ 1 hàng data vào sheet này');
    return 0;
  }

  const headerRow = sh.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (s) { return String(s || '').trim(); });

  function findCol() {
    for (let i = 0; i < arguments.length; i++) {
      const idx = headerRow.indexOf(arguments[i]);
      if (idx >= 0) return idx;
    }
    return -1;
  }
  const colName = findCol('Dự Án', 'Dự án', 'Du An', 'Project', 'Tên');
  const colDate = findCol('Ngày', 'Date');
  const colClaim = findCol('Claim', 'ClaimPoints', 'Điểm');
  const colType = findCol('Loại', 'Type');
  if (colName < 0 || colDate < 0) {
    throw new Error('Cần có cột "Dự Án" và "Ngày" ở row 1 của ImportProjects');
  }

  const accountCols = [];
  for (let i = 0; i < headerRow.length; i++) {
    const def = ACCOUNT_DEFS[headerRow[i]];
    if (def) accountCols.push({ col: i, accountId: def.id });
  }

  const data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const projRows = [];
  const baseId = Date.now();
  let idx = 0;

  data.forEach(function (row) {
    const name = String(row[colName] || '').trim();
    if (!name) return;
    const date = formatDateValue(row[colDate]);
    if (!date) return;

    const rewards = {};
    accountCols.forEach(function (a) {
      const raw = row[a.col];
      if (raw === '' || raw === null || raw === undefined) return;
      const n = parseLocaleNumber(raw);
      if (Number.isFinite(n) && n !== 0) rewards[a.accountId] = round2(n);
    });

    const claim = colClaim >= 0 ? (Number(row[colClaim]) || 15) : 15;
    const type = colType >= 0 ? (String(row[colType] || 'FCFS').trim() || 'FCFS') : 'FCFS';

    projRows.push({
      id: String(baseId + (idx++)),
      name: name,
      date: date,
      claimPoints: claim,
      type: type,
      rewards: rewards,
      note: 'imported',
      createdAt: new Date().toISOString(),
    });
  });

  if (projRows.length === 0) {
    Logger.log('Projects: không có row hợp lệ');
    return 0;
  }

  const projSh = getSheet(SHEETS.ALPHA);
  const projHeaders = HEADERS.AlphaProjects;
  const rows = projRows.map(function (o) {
    return projHeaders.map(function (h) {
      const v = o[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
  });
  projSh.getRange(projSh.getLastRow() + 1, 1, rows.length, projHeaders.length).setValues(rows);
  Logger.log('Imported ' + rows.length + ' project rows');
  return rows.length;
}

// --------------------------------------------------------------------------
function parseLocaleNumber(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (!s) return 0;
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  // VN: bỏ "." thousand sep, đổi "," → "."
  s = s.replace(/\./g, '').replace(',', '.');
  const n2 = Number(s);
  return Number.isFinite(n2) ? n2 : 0;
}
