// Naive UI: theme + global discrete APIs (message / dialog / loadingBar).
// Discrete API hoạt động ngoài setup() nên dùng được trong Pinia store và api.js.
// configProviderProps đảm bảo các overlay này dùng chung themeOverrides với app.
import { createDiscreteApi } from 'naive-ui';

// Primary của app là xanh dương #2563eb (tên "binance-yellow" cũ thực ra là blue).
export const themeOverrides = {
  common: {
    primaryColor: '#2563eb',
    primaryColorHover: '#1d4ed8',
    primaryColorPressed: '#1e40af',
    primaryColorSuppl: '#1d4ed8',
    infoColor: '#2563eb',
    borderRadius: '8px',
    fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
  },
};

const { message, dialog, loadingBar } = createDiscreteApi(
  ['message', 'dialog', 'loadingBar'],
  { configProviderProps: { themeOverrides } }
);

export { message, dialog, loadingBar };

// Confirm dùng chung cho mọi hành động ghi DB (lưu / cập nhật / xóa / tổng hợp).
// Trả về Promise<boolean> để gọi gọn: `if (!(await confirmAction({...}))) return;`
// type: 'warning' (mặc định, cho xóa) | 'info' (lưu/cập nhật) | 'error'.
export function confirmAction({ title, content, positiveText = 'Xác nhận', type = 'warning' }) {
  return new Promise((resolve) => {
    let done = false;
    const settle = (v) => { if (!done) { done = true; resolve(v); } };
    dialog[type]({
      title,
      content,
      positiveText,
      negativeText: 'Hủy',
      onPositiveClick: () => settle(true),
      onNegativeClick: () => settle(false),
      onClose: () => settle(false),
      onMaskClick: () => settle(false),
      onEsc: () => settle(false),
    });
  });
}
