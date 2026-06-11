import { defineStore } from 'pinia';
import { accountsApi, feesApi, alphaApi, bootstrapApi } from '../services/api';
import { useCalculatorStore } from './calculatorStore';

// Bản bootstrap cuối được cache vào localStorage → lần mở app sau hydrate UI
// ngay (<100ms) rồi mới refresh nền từ server (stale-while-revalidate).
const BOOTSTRAP_CACHE_KEY = 'alpha:bootstrap';
const VND_RATE_KEY = 'alpha:vndRate';

function loadVndRate() {
  const n = Number(localStorage.getItem(VND_RATE_KEY));
  return Number.isFinite(n) && n > 0 ? n : 26500;
}

export const useTrackingStore = defineStore('tracking', {
  state: () => ({
    accounts: [],
    fees: [],              // chỉ chứa daily rows của tháng hiện tại (dùng cho Dashboard/Points)
    allFees: [],           // toàn bộ daily rows còn trong sheet Fees (dùng cho tab Phí Trade)
    feesMonthly: [],       // aggregate cho các tháng cũ
    currentMonth: '',      // 'MM/YYYY' do server xác định
    pastDaily: null,       // { total, active, safeToDelete, earliestSafeDate, pendingArchiveMonths }
    projects: [],
    summary: null,
    loading: false,
    error: null,
    vndRate: loadVndRate(), // persist localStorage — chỉ là hệ số hiển thị VND
    hydrated: false,       // đã hydrate từ localStorage cache trong session này chưa
  }),
  getters: {
    activeAccounts: (s) => s.accounts.filter((a) => a.active),
    accountById: (s) => (id) => s.accounts.find((a) => a.id === id),
    // id → vị trí trong s.accounts (đã sort theo sortOrder ở server).
    // Account lạ (id không có trong danh sách) trả về Infinity → đẩy xuống cuối.
    accountOrderIndex: (s) => {
      const map = {};
      s.accounts.forEach((a, i) => { map[a.id] = i; });
      return (id) => (id in map ? map[id] : Infinity);
    },
  },
  actions: {
    setVndRate(v) {
      this.vndRate = Number(v) || 0;
      try { localStorage.setItem(VND_RATE_KEY, String(this.vndRate)); } catch (_) { /* ignore */ }
    },

    // Account mutations update store local (optimistic, không refetch) — nhưng
    // phải vá luôn snapshot localStorage, không thì lần mở app sau hydrate ra
    // config account cũ trong ~1s đầu.
    patchSnapshotAccounts() {
      try {
        const raw = localStorage.getItem(BOOTSTRAP_CACHE_KEY);
        if (!raw) return;
        const snap = JSON.parse(raw);
        snap.accounts = this.accounts;
        localStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(snap));
      } catch (_) { /* ignore */ }
    },
    async createAccount(data) {
      const acc = await accountsApi.create(data);
      this.accounts.push(acc);
      this.patchSnapshotAccounts();
      return acc;
    },
    async updateAccount(id, data) {
      await accountsApi.update(id, data);
      const idx = this.accounts.findIndex((a) => a.id === id);
      if (idx > -1) this.accounts[idx] = { ...this.accounts[idx], ...data };
      this.patchSnapshotAccounts();
    },
    async removeAccount(id) {
      await accountsApi.remove(id);
      this.accounts = this.accounts.filter((a) => a.id !== id);
      this.patchSnapshotAccounts();
    },

    // fees + allFees đều đến từ bootstrap (loadAll) — không có loader riêng.
    // Bootstrap đã trả về allFees → sau mutation chỉ cần 1 call loadAll()
    // (Apps Script serialize request, gọi thêm fees:list là xếp hàng chờ đôi).
    async addFees(entries) {
      await feesApi.bulk(entries);
      await this.loadAll();
    },
    // Lưu phí + config máy tính của account trong 1 request (nút "Lưu phí"
    // ở Máy tính) — trước đây là 2 request serialize.
    async addFeesWithConfig(entries, accountConfig) {
      await feesApi.bulkWithConfig(entries, accountConfig);
      await this.loadAll();
    },
    async updateFee(id, data) {
      await feesApi.update(id, data);
      await this.loadAll();
    },
    async deleteFee(id) {
      await feesApi.remove(id);
      await this.loadAll();
    },
    async archivePastMonths() {
      const res = await feesApi.archive();
      await this.loadAll();
      return res;
    },
    async clearOldDaily() {
      const res = await feesApi.clearOld();
      await this.loadAll();
      return res;
    },

    // Project mutations ảnh hưởng cả summary → refresh bằng 1 call loadAll()
    // (giống fee mutations), thay vì loadProjects + loadSummary nối tiếp.
    async createProject(data) {
      const p = await alphaApi.create(data);
      await this.loadAll();
      return p;
    },
    async updateProject(id, data) {
      await alphaApi.update(id, data);
      await this.loadAll();
    },
    async deleteProject(id) {
      await alphaApi.remove(id);
      await this.loadAll();
    },

    applyBootstrap(data) {
      this.accounts = data.accounts;
      this.fees = data.fees;
      this.allFees = data.allFees || [];
      this.feesMonthly = data.feesMonthly || [];
      this.currentMonth = data.currentMonth || '';
      this.pastDaily = data.pastDaily || null;
      this.projects = data.projects;
      this.summary = data.summary;
      // Mirror calc fields on each account → localStorage cache
      useCalculatorStore().syncFromAccounts(this.accounts);
    },

    // Xóa bản cache local (gọi khi logout — dữ liệu tài chính không nên nằm
    // lại localStorage sau khi đăng xuất).
    clearLocalCache() {
      try { localStorage.removeItem(BOOTSTRAP_CACHE_KEY); } catch (_) { /* ignore */ }
    },

    /**
     * Stale-while-revalidate: lần gọi đầu trong session hydrate ngay từ bản
     * localStorage (UI hiện tức thì) rồi vẫn fetch server để cập nhật.
     * @param {{force?: boolean}} opts force=true → server bỏ qua CacheService,
     *   đọc lại Sheets (dùng cho nút "Tải lại" khi user sửa Sheet bằng tay).
     */
    async loadAll(opts = {}) {
      if (!this.hydrated) {
        this.hydrated = true;
        try {
          const cached = JSON.parse(localStorage.getItem(BOOTSTRAP_CACHE_KEY) || 'null');
          if (cached) this.applyBootstrap(cached);
        } catch (_) { /* cache hỏng → bỏ qua */ }
      }
      this.loading = true;
      this.error = null;
      try {
        // Không gửi vndRate: server chỉ trả số USD, quy đổi VND là việc của
        // client (computed × store.vndRate) → cache server dùng chung 1 key.
        const data = await bootstrapApi.get(opts.force ? { nocache: true } : {});
        this.applyBootstrap(data);
        try { localStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(data)); } catch (_) { /* quota → bỏ qua */ }
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },
  },
});
