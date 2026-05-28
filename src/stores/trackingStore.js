import { defineStore } from 'pinia';
import { accountsApi, feesApi, alphaApi, summaryApi, pointsApi } from '../services/api';

export const useTrackingStore = defineStore('tracking', {
  state: () => ({
    accounts: [],
    fees: [],
    projects: [],
    summary: null,
    points: null,
    loading: false,
    error: null,
    vndRate: 26500,
  }),
  getters: {
    activeAccounts: (s) => s.accounts.filter((a) => a.active),
    accountById: (s) => (id) => s.accounts.find((a) => a.id === id),
  },
  actions: {
    async loadAccounts() {
      this.accounts = await accountsApi.list();
    },
    async createAccount(data) {
      const acc = await accountsApi.create(data);
      this.accounts.push(acc);
      return acc;
    },
    async updateAccount(id, data) {
      await accountsApi.update(id, data);
      const idx = this.accounts.findIndex((a) => a.id === id);
      if (idx > -1) this.accounts[idx] = { ...this.accounts[idx], ...data };
    },
    async removeAccount(id) {
      await accountsApi.remove(id);
      this.accounts = this.accounts.filter((a) => a.id !== id);
    },

    async loadFees(params) {
      this.fees = await feesApi.list(params);
    },
    async addFees(entries) {
      await feesApi.bulk(entries);
      await this.loadFees();
    },
    async updateFee(id, data) {
      await feesApi.update(id, data);
      await this.loadFees();
    },
    async deleteFee(id) {
      await feesApi.remove(id);
      this.fees = this.fees.filter((f) => f.id !== id);
    },

    async loadProjects() {
      this.projects = await alphaApi.list();
    },
    async createProject(data) {
      const p = await alphaApi.create(data);
      this.projects.unshift(p);
      return p;
    },
    async updateProject(id, data) {
      await alphaApi.update(id, data);
      await this.loadProjects();
    },
    async deleteProject(id) {
      await alphaApi.remove(id);
      this.projects = this.projects.filter((p) => p.id !== id);
    },

    async loadSummary(params) {
      this.summary = await summaryApi.get({ ...params, vndRate: this.vndRate });
    },
    async loadPoints(req = 15) {
      this.points = await pointsApi.get(req);
    },

    async loadAll() {
      this.loading = true;
      this.error = null;
      try {
        await Promise.all([
          this.loadAccounts(),
          this.loadFees(),
          this.loadProjects(),
          this.loadSummary(),
          this.loadPoints(),
        ]);
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },
  },
});
