import { parseDate } from './format';

export const ALPHA_VOLUME_MULTIPLIER = 4;
export const MAX_POINT = 20;
// Số ngày fee/claim được tính: window [today-15, today) — bao gồm today-15, loại today.
// Tương đương daysAgo ∈ [1, 15].
export const POINT_WINDOW_DAYS = 15;
// Reset xảy ra 1 ngày sau khi hết window: claim D active D+1..D+15, reset = D+16.
// daysLeft = 16 - daysAgo, range [1, 15].
export const POINT_RESET_OFFSET = POINT_WINDOW_DAYS + 1;

export function pointsFromVolume(volume) {
  const v = Number(volume) || 0;
  if (v < 2) return 0;
  const p = Math.floor(Math.log2(v));
  return Math.min(p, MAX_POINT);
}

export function nextThreshold(volume) {
  const p = pointsFromVolume(volume);
  if (p >= MAX_POINT) return null;
  const nextVolume = Math.pow(2, p + 1);
  return {
    nextPoint: p + 1,
    nextVolume,
    volumeNeeded: Math.max(0, nextVolume - (Number(volume) || 0)),
  };
}

/**
 * Điểm Alpha của 1 account — match công thức Excel:
 *   total = SUMIFS(fee.points; date >= TODAY-15; date < TODAY)
 *   deducted = SUMIFS(claimPoints; date >= TODAY-15; date < TODAY; reward<>"")
 *   current = total − deducted
 *
 *  - Window: claim/fee date phải `>= today-15 AND < today` → daysAgo ∈ [1, 15] (15 ngày).
 *  - Điểm trừ: mỗi alpha project trong window mà account có reward > 0 = nhận được kèo.
 *  - Schedule "ngày reset" = với mỗi claim trong window:
 *      resetDate = claim.date + 16  (= claim active D+1..D+15 → reset day D+16)
 *      daysLeft  = 16 − daysAgo, range [1, 15]
 *    Sắp xếp ascending theo daysLeft.
 *
 *  `future = true` → xem trước điểm của NGÀY MAI: dời mốc "hôm nay" lên +1 ngày. Cửa sổ
 *  trượt theo nên tự gồm hôm nay (daysAgo 1) và bỏ ngày today-15 (daysAgo 16); daysLeft
 *  và ngày reset cũng tính theo góc nhìn ngày mai. Tiện để xem trước thay vì đợi tới mai.
 */
export function computeAlphaPoints(fees, projects, requiredPoints = 15, future = false) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (future) today.setDate(today.getDate() + 1);
  const required = Number(requiredPoints) || 15;
  const DAY = 86400000;

  // Trả về { date, daysAgo } nếu trong window [today-15, today), else null.
  function dateInWindow(dateStr) {
    const d = parseDate(dateStr);
    if (!d) return null;
    d.setHours(0, 0, 0, 0);
    const daysAgo = Math.round((today.getTime() - d.getTime()) / DAY);
    if (daysAgo < 1 || daysAgo > POINT_WINDOW_DAYS) return null;
    return { date: d, daysAgo };
  }

  const map = {};
  function bucket(id) {
    if (!map[id]) map[id] = { totalPoints: 0, claims: [] };
    return map[id];
  }

  for (const f of fees || []) {
    if (!dateInWindow(f.date)) continue;
    bucket(f.accountId).totalPoints += Number(f.points) || 0;
  }

  for (const p of projects || []) {
    const info = dateInWindow(p.date);
    if (!info) continue;
    const rewards = p.rewards || {};
    const reset = new Date(info.date);
    reset.setDate(reset.getDate() + POINT_RESET_OFFSET);
    const daysLeft = POINT_RESET_OFFSET - info.daysAgo;
    for (const accId in rewards) {
      const amt = Number(rewards[accId]);
      if (!Number.isFinite(amt) || amt === 0) continue;
      bucket(accId).claims.push({
        projectId: p.id,
        projectName: p.name,
        claimDate: p.date,
        claimPoints: Number(p.claimPoints) || 0,
        rewardAmount: Number(rewards[accId]) || 0,
        resetDate: formatDmy(reset),
        daysLeft,
      });
    }
  }

  const accounts = Object.keys(map).map((id) => {
    const m = map[id];
    const deducted = m.claims.reduce((s, c) => s + c.claimPoints, 0);
    const currentPoints = m.totalPoints - deducted;
    const schedule = m.claims.slice().sort((a, b) => a.daysLeft - b.daysLeft);
    return {
      accountId: id,
      totalPoints: m.totalPoints,
      claimsCount: m.claims.length,
      deducted,
      currentPoints,
      schedule,
      airdrop: {
        eligible: currentPoints >= required,
        current: currentPoints,
        required,
        deficit: Math.max(0, required - currentPoints),
      },
    };
  });

  return { requiredPoints: required, accounts };
}

function formatDmy(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
