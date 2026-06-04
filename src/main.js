import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { setupPwaUpdate } from './utils/pwa';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

// Đăng ký SW + thông báo khi có phiên bản mới (nút Tải lại).
setupPwaUpdate();
