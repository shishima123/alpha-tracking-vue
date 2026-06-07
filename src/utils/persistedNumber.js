import { ref, watch } from 'vue';
import { useStorage } from '@vueuse/core';

// useStorage đặt giá trị = null sẽ XÓA key khỏi localStorage → ref quay về default.
// Đó là lý do "xoá hết ô nhập là bị về mặc định". Helper này tách ô nhập (model —
// cho phép rỗng/null khi đang gõ dở) khỏi giá trị đã lưu (stored): chỉ ghi xuống
// storage khi gõ số hợp lệ (>= min). Dùng `stored.value` cho tính toán, v-model `model`.
export function usePersistedNumber(key, defaultValue, { min = -Infinity } = {}) {
  const stored = useStorage(key, defaultValue);
  const model = ref(stored.value);
  watch(model, (v) => {
    if (typeof v === 'number' && Number.isFinite(v) && v >= min) stored.value = v;
  });
  // Nếu stored đổi từ nơi khác (vd tab khác) → đồng bộ ngược lại ô nhập.
  watch(stored, (v) => {
    if (v !== model.value && typeof v === 'number') model.value = v;
  });
  return { stored, model };
}
