import { hideMoney, MASK } from './privacy';

export function fmtUSD(n, digits = 2) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  if (hideMoney.value) return MASK;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function fmtVND(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  if (hideMoney.value) return MASK;
  return new Intl.NumberFormat('vi-VN').format(n) + ' đ';
}

// Làm tròn 2 chữ số thập phân, khử lỗi dấu phẩy động của JS
// (vd 1050 - 1048.18 = 1.8199999999999363 → 1.82).
export function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export function fmtNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  if (hideMoney.value) return MASK;
  return new Intl.NumberFormat('vi-VN').format(n);
}

export function todayStr() {
  const d = new Date();
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function parseDate(s) {
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

export function isoToDmy(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function dmyToIso(dmy) {
  const d = parseDate(dmy);
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
