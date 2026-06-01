import { useStorage } from '@vueuse/core';

// Cờ "ẩn tiền" toàn cục — khi bật, fmtUSD/fmtVND/fmtNumber trả về MASK thay vì số.
// useStorage = module-level ref tự đồng bộ localStorage (key 'alpha:hideMoney'),
// nên mọi template/computed đọc qua fmt* sẽ tự re-render khi toggle.
export const MASK = '***';

export const hideMoney = useStorage('alpha:hideMoney', false);

export function toggleHideMoney() {
  hideMoney.value = !hideMoney.value;
}
