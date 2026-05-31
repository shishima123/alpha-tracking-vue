import { ref } from 'vue';

// Cờ "ẩn tiền" toàn cục — khi bật, fmtUSD/fmtVND/fmtNumber trả về MASK thay vì số.
// Là module-level ref nên mọi template/computed đọc qua fmt* sẽ tự re-render khi toggle.
const KEY = 'alpha:hideMoney';
export const MASK = '***';

export const hideMoney = ref(localStorage.getItem(KEY) === '1');

export function toggleHideMoney() {
  hideMoney.value = !hideMoney.value;
  localStorage.setItem(KEY, hideMoney.value ? '1' : '0');
}
