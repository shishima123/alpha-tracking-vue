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
