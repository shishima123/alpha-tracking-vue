import { defineStore } from 'pinia';
import { message } from '../utils/naive';

// Giữ nguyên API cũ (success/error/info) nhưng forward sang Naive n-message,
// nên không phải sửa chỗ gọi trong các view.
export const useToastStore = defineStore('toast', {
  actions: {
    push(msg, type = 'info') {
      (message[type] || message.info)(msg);
    },
    success(msg) { message.success(msg); },
    error(msg) { message.error(msg, { duration: 5000 }); },
    info(msg) { message.info(msg); },
    dismiss() { /* Naive tự quản lý vòng đời message */ },
  },
});
