import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages project site is served from /<repo>/. The deploy workflow sets
  // VITE_BASE=/<repo>/ ; local dev / custom domain default to root.
  base: process.env.VITE_BASE || '/',
  plugins: [
    vue(),
    VitePWA({
      // 'autoUpdate': có bản build mới thì SW tự chiếm quyền + reload trang sang bản mới
      // (không nhắc user). Xem src/utils/pwa.js.
      registerType: 'autoUpdate',
      // null: app tự đăng ký SW qua virtual:pwa-register trong main.js. Cần dùng đường
      // này (thay vì 'auto' chèn script tối giản) để logic tự-reload của workbox-window
      // chạy đúng — đó là lý do bản cũ F5 vẫn ra bản cũ.
      injectRegister: null,
      includeAssets: ['icon.svg', 'icon-maskable.svg'],
      manifest: {
        name: 'Binance Alpha Tracking',
        short_name: 'Alpha',
        description: 'Theo dõi điểm Alpha, phí trade và lợi nhuận theo tài khoản.',
        lang: 'vi',
        display: 'standalone',
        orientation: 'portrait-primary',
        theme_color: '#2563eb',
        background_color: '#dfe4ec',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // SPA history mode → mọi route fallback về index.html (đã tính base).
        navigateFallback: 'index.html',
        // KHÔNG cache request tới Apps Script (luôn gọi mạng cho dữ liệu mới nhất).
        navigateFallbackDenylist: [/^https:\/\/script\.google(usercontent)?\.com/],
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Cho phép test PWA khi chạy `npm run dev`.
        enabled: false,
      },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: false,
  },
});
