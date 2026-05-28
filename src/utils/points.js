import { parseDate } from './format';

export const ALPHA_VOLUME_MULTIPLIER = 4;
export const MAX_POINT = 20;

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

export function computePointsFromFees(fees, requiredPoints = 15) {
  const required = Number(requiredPoints) || 15;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const grouped = {};
  for (const f of fees) {
    if (!grouped[f.accountId]) grouped[f.accountId] = [];
    grouped[f.accountId].push(f);
  }

  const accounts = Object.keys(grouped).map((id) => {
    const entries = grouped[id];
    let current = 0;
    const schedule = [];
    for (const e of entries) {
      const d = parseDate(e.date);
      if (!d) continue;
      const reset = new Date(d);
      reset.setDate(reset.getDate() + 15);
      if (reset.getTime() < today.getTime()) continue;
      const pts = Number(e.points) || 0;
      current += pts;
      schedule.push({
        tradeDate: e.date,
        resetDate: formatDmy(reset),
        daysLeft: Math.ceil((reset.getTime() - today.getTime()) / 86400000),
        points: pts,
      });
    }
    schedule.sort((a, b) => (a.resetDate < b.resetDate ? -1 : 1));
    return {
      accountId: id,
      currentPoints: current,
      airdrop: {
        eligible: current >= required,
        current,
        required,
        deficit: Math.max(0, required - current),
      },
      schedule: schedule.slice(0, 10),
    };
  });

  return { requiredPoints: required, accounts };
}

function formatDmy(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
