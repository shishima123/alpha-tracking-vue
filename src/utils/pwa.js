// Đăng ký Service Worker. registerType ở vite.config.js là 'autoUpdate' → khi có bản
// build mới, SW tự chiếm quyền (skipWaiting + clientsClaim) và workbox-window tự
// window.location.reload() sang bản mới — không hỏi user.
import { registerSW } from 'virtual:pwa-register';

export function setupPwaUpdate() {
  if (!('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    onNeedRefresh() { },
    onOfflineReady() { },
  })
}
