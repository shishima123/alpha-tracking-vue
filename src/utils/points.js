import { parseDate } from './format';

export const ALPHA_VOLUME_MULTIPLIER = 4;
export const MAX_POINT = 20;
export const POINT_WINDOW_DAYS = 15;

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
 * Điểm Alpha của 1 account:
 *  - Tổng điểm = sum(fees.points) trong cửa sổ 15 ngày KHÔNG tính hôm nay.
 *    Tức entry.date phải > today-15 AND entry.date < today
 *    (= 14 ngày: từ today-14 đến today-1).
 *  - Điểm trừ = sum(project.claimPoints) cho mỗi alpha project trong window
 *    mà account này có reward > 0 (= đã húp được kèo này).
 *  - Điểm còn lại = Tổng − Điểm trừ.
 *  - Schedule "ngày reset" = với mỗi claim trong window:
 *      resetDate = claim.date + 15
 *      daysLeft  = resetDate − today (1..14)
 *    Sắp xếp ascending theo daysLeft.
 */
export function computeAlphaPoints(fees, projects, requiredPoints = 15) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const required = Number(requiredPoints) || 15;
  const DAY = 86400000;

  // entry hợp lệ khi 1 <= daysAgo <= 14 (today exclusive, 14 ngày trước inclusive)
  function dateInWindow(dateStr) {
    const d = parseDate(dateStr);
    if (!d) return null;
    d.setHours(0, 0, 0, 0);
    const daysAgo = Math.round((today.getTime() - d.getTime()) / DAY);
    return daysAgo >= 1 && daysAgo <= 14 ? d : null;
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
    const d = dateInWindow(p.date);
    if (!d) continue;
    const rewards = p.rewards || {};
    const reset = new Date(d);
    reset.setDate(reset.getDate() + POINT_WINDOW_DAYS);
    const daysLeft = Math.round((reset.getTime() - today.getTime()) / DAY);
    for (const accId in rewards) {
      if (!(Number(rewards[accId]) > 0)) continue;
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
