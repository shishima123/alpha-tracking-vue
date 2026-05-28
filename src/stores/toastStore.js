import { defineStore } from 'pinia';

let _id = 0;

export const useToastStore = defineStore('toast', {
  state: () => ({ items: [] }),
  actions: {
    push(message, type = 'info', duration = 3000) {
      const id = ++_id;
      this.items.push({ id, message, type });
      setTimeout(() => {
        this.items = this.items.filter((t) => t.id !== id);
      }, duration);
    },
    success(msg) { this.push(msg, 'success', 3000); },
    error(msg) { this.push(msg, 'error', 5000); },
    info(msg) { this.push(msg, 'info', 3000); },
    dismiss(id) {
      this.items = this.items.filter((t) => t.id !== id);
    },
  },
});
