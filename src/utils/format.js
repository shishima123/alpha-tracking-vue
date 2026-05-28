export function fmtUSD(n, digits = 2) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function fmtVND(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return new Intl.NumberFormat('vi-VN').format(n) + ' đ';
}

export function fmtNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
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
