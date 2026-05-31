/**
 * One-off import: seed sheet `FeesMonthly` từ dữ liệu tổng hợp phí theo tháng
 * (ảnh user gửi). Dùng cho data lịch sử trước khi app tự ghi nhận daily.
 *
 * Cách dùng:
 *  1. Mở Apps Script editor → tạo file mới hoặc dán đoạn này vào file riêng.
 *  2. Run → chọn function `importFeesMonthlyFromSnapshot` → Authorize nếu cần.
 *  3. View → Logs để xem kết quả.
 *
 * Phụ thuộc: dùng chung helpers từ Code.gs (`getSheet`, `writeAll`, `listAccounts`,
 * `listFeesMonthly`, `feesMonthlyId`, `round2`, `SHEETS`, `HEADERS`).
 * → Phải paste file này vào CÙNG Apps Script project với Code.gs.
 *
 * Lưu ý:
 *  - Tháng hiện tại (05/2026 trong ảnh) KHÔNG import: system đang giữ daily rows
 *    trong sheet `Fees`, summary sẽ tự tính từ đó. Import sẽ làm double count.
 *  - Tháng 06/2026 toàn 0 → skip.
 *  - `totalPoints` và `count` set = 0 vì ảnh không có dữ liệu này. Field không
 *    được dùng để tính summary nên không ảnh hưởng Dashboard.
 *  - Idempotent: chạy nhiều lần OK — chỉ thêm row CÒN THIẾU, row đã có giữ nguyên
 *    (KHÔNG ghi đè). Muốn ghi đè giá trị cũ → clearFeesMonthlySheet() rồi import lại.
 *  - Sau import, nếu mutate fee trong tháng đã import, aggregate bị drop (qua
 *    `invalidateFeesMonthly`). Tháng đó sẽ mất khỏi Dashboard cho đến khi
 *    re-import hoặc có daily rows + bấm "Tổng hợp tháng cũ".
 */

// Mỗi row: tên hiển thị account → tổng phí ($) trong tháng đó.
// Tên match với `name` HOẶC `displayName` của account (case-insensitive).
const FEES_MONTHLY_SNAPSHOT = [
  { month: '04/2025', amounts: { Main: 191.00 } },
  { month: '05/2025', amounts: { Main: 125.00, 'Em iu': 125.00, 'Old(Phu)': 125.00, 'New(Chanh)': 125.00 } },
  { month: '06/2025', amounts: { Main: 150.00, 'Em iu': 150.00, Huy: 150.00, 'Old(Phu)': 150.00, 'New(Chanh)': 150.00 } },
  { month: '07/2025', amounts: { Main: 99.03,  'Em iu': 98.33,  Huy: 84.36,  'Old(Phu)': 102.29, 'New(Chanh)': 102.10, An: 59.90,  Tuyet: 9.50  } },
  { month: '08/2025', amounts: { Main: 104.90, 'Em iu': 98.78,  Huy: 103.68, 'Old(Phu)': 78.81,  'New(Chanh)': 75.35,  An: 105.58, Tuyet: 55.88 } },
  { month: '09/2025', amounts: { Main: 93.49,  'Em iu': 101.23, Huy: 299.98, 'Old(Phu)': 9.95,   'New(Chanh)': 10.04,  An: 0.00,   Tuyet: 3.98  } },
  { month: '10/2025', amounts: { Main: 179.44, 'Em iu': 173.74, Huy: 141.40, 'Old(Phu)': 37.35,  'New(Chanh)': 36.61 } },
  { month: '11/2025', amounts: { Main: 98.89,  'Em iu': 99.98,  Huy: 85.90,  'Old(Phu)': 48.35,  'New(Chanh)': 52.62 } },
  { month: '12/2025', amounts: { Main: 103.67, 'Em iu': 106.41, Huy: 54.17,  'Old(Phu)': 50.84,  'New(Chanh)': 51.54 } },
  { month: '01/2026', amounts: { Main: 107.34, 'Em iu': 103.56, Huy: 49.02,  'Old(Phu)': 50.88,  'New(Chanh)': 51.03 } },
  { month: '02/2026', amounts: { Main: 99.17,  'Em iu': 89.63,  Huy: 53.49,  'Old(Phu)': 60.81,  'New(Chanh)': 58.13, 'Ba Huy': 45.00 } },
  { month: '03/2026', amounts: { Main: 76.26,  'Em iu': 53.72,  Huy: 60.05,  'Old(Phu)': 59.57,  'New(Chanh)': 59.15, 'Ba Huy': 56.61 } },
  { month: '04/2026', amounts: { Main: 58.55,  'Em iu': 62.15,  Huy: 62.02,  'Old(Phu)': 51.02,  'New(Chanh)': 57.84 } },
  // 05/2026 — tháng hiện tại, BỎ QUA (daily rows đang trong sheet Fees)
  // 06/2026 — toàn 0, bỏ qua
];

function importFeesMonthlyFromSnapshot() {
  const accounts = listAccounts();
  if (accounts.length === 0) {
    throw new Error('Sheet Accounts trống — tạo account trước khi import.');
  }

  // Build lookup: lowercase(name|displayName) → accountId
  const lookup = {};
  accounts.forEach(function (a) {
    if (a.name) lookup[String(a.name).toLowerCase()] = a.id;
    if (a.displayName) lookup[String(a.displayName).toLowerCase()] = a.id;
  });

  const now = new Date().toISOString();
  const items = [];
  const unmatched = {};

  FEES_MONTHLY_SNAPSHOT.forEach(function (row) {
    Object.keys(row.amounts).forEach(function (displayName) {
      const totalFee = Number(row.amounts[displayName]) || 0;
      if (totalFee === 0) return;
      const accountId = lookup[displayName.toLowerCase()];
      if (!accountId) {
        unmatched[displayName] = true;
        return;
      }
      items.push({
        id: feesMonthlyId(row.month, accountId),
        month: row.month,
        accountId: accountId,
        totalFee: round2(totalFee),
        totalPoints: 0,
        count: 0,
        updatedAt: now,
      });
    });
  });

  const unmatchedNames = Object.keys(unmatched);
  if (unmatchedNames.length > 0) {
    const known = accounts.map(function (a) { return a.displayName + ' (' + a.name + ')'; }).join(', ');
    throw new Error(
      'Không tìm thấy account cho tên: ' + unmatchedNames.join(', ') +
      '. Account có sẵn: ' + known
    );
  }

  // Merge với existing: CHỈ thêm row còn thiếu, row đã có giữ nguyên (không ghi đè)
  const existing = listFeesMonthly();
  const merged = {};
  existing.forEach(function (r) { merged[r.id] = r; });
  let added = 0;
  let skipped = 0;
  items.forEach(function (it) {
    if (merged[it.id]) { skipped++; return; }
    merged[it.id] = it;
    added++;
  });
  if (skipped > 0) Logger.log('Bỏ qua %s row đã tồn tại (month+account)', skipped);

  const final = Object.keys(merged).map(function (k) { return merged[k]; });
  writeAll(SHEETS.FEES_MONTHLY, final);

  const result = {
    added: added,
    skipped: skipped,
    months: FEES_MONTHLY_SNAPSHOT.length,
    totalRowsInSheet: final.length,
  };
  Logger.log('Import xong: %s', JSON.stringify(result));
  return result;
}

/**
 * Tiện ích: xóa sạch sheet FeesMonthly (giữ header).
 * Chạy nếu muốn re-import từ đầu mà không lo conflict id cũ.
 */
function clearFeesMonthlySheet() {
  writeAll(SHEETS.FEES_MONTHLY, []);
  Logger.log('Đã clear FeesMonthly.');
}

/**
 * Migration một lần: fix các row đã lỡ lưu cột `month` dạng Date object thay vì
 * string "MM/YYYY". Nguyên nhân: Sheets auto-coerce string giống MM/YYYY thành
 * Date khi setValues vào ô format mặc định → Dashboard group sai bucket.
 *
 * Sau khi update Code.gs (pin column B = text + formatMonthValue khi read), chạy
 * function này 1 lần để rewrite cell value từ Date → string. Không thay đổi data.
 */
function migrateFeesMonthlyMonth() {
  const list = listFeesMonthly(); // formatMonthValue convert Date → "MM/YYYY"
  writeAll(SHEETS.FEES_MONTHLY, list); // column B giờ là text format → string stay string
  Logger.log('Đã migrate %s rows về dạng string.', list.length);
  return { rewritten: list.length };
}
