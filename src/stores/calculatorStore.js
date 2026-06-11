/**
 * Calc config sống TRÊN account row (sheet Accounts) — đó là source of truth.
 * localStorage chỉ là cache để render nhanh + giữ draft chưa submit.
 *
 * Flow:
 *  - Bootstrap → trackingStore.loadAll() → calculatorStore.syncFromAccounts(accounts)
 *    đổ values từ server vào cache để mirror.
 *  - User gõ trong modal → stageConfig() update cache local (chưa lên server).
 *  - User bấm "Lưu phí" → CalculatorModal gửi config kèm trong request lưu phí
 *    (fees:bulkWithConfig) — server persist vào sheet Accounts cùng lượt.
 *  - configFor(id) merge thứ tự: server (tracking store) > cache > DEFAULTS.
 */

import { defineStore } from 'pinia';
import { useTrackingStore } from './trackingStore';

const LS_KEY = 'alphaCalculator.v1';

export const CALC_DEFAULTS = {
  pointTrade: 15,
  pointHold: 2,
  currentVol: 0,
  perOrder: 1024,
  withdraw: 1050,
  lastAfter: null,
};

export const CALC_FIELDS = Object.keys(CALC_DEFAULTS);

function loadCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function saveCache(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (_) { /* quota / private mode → ignore */ }
}

function pickCalcFields(obj) {
  const out = {};
  for (const f of CALC_FIELDS) {
    const v = obj?.[f];
    if (v !== undefined && v !== '' && v !== null) out[f] = v;
  }
  return out;
}

export const useCalculatorStore = defineStore('calculator', {
  state: () => ({
    open: false,
    selectedAccountId: null,
    cache: loadCache(),
  }),
  getters: {
    configFor: (s) => (accountId) => {
      const tracking = useTrackingStore();
      const acc = tracking.accountById(accountId) || {};
      return {
        ...CALC_DEFAULTS,
        ...(s.cache[accountId] || {}),
        ...pickCalcFields(acc),
      };
    },
  },
  actions: {
    show(accountId = null) {
      if (accountId) this.selectedAccountId = accountId;
      this.open = true;
    },
    hide() {
      this.open = false;
    },
    selectAccount(accountId) {
      this.selectedAccountId = accountId;
    },
    /** Update local cache only — chưa push lên server. */
    stageConfig(accountId, partial) {
      if (!accountId) return;
      this.cache = {
        ...this.cache,
        [accountId]: { ...(this.cache[accountId] || {}), ...partial },
      };
      saveCache(this.cache);
    },
    /** Server values → cache. Gọi sau mỗi lần bootstrap để mirror multi-device. */
    syncFromAccounts(accounts) {
      const next = { ...this.cache };
      for (const a of accounts || []) {
        const fromAcc = pickCalcFields(a);
        if (Object.keys(fromAcc).length === 0) continue;
        next[a.id] = { ...(next[a.id] || {}), ...fromAcc };
      }
      this.cache = next;
      saveCache(this.cache);
    },
  },
});
