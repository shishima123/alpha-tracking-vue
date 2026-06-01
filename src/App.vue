<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <div class="app-shell">
      <header v-if="!isLoginRoute" class="app-header">
        <div class="app-header__inner">
          <router-link to="/" class="app-logo">α</router-link>

          <n-menu
            mode="horizontal"
            :value="activeKey"
            :options="menuOptions"
            responsive
            @update:value="onNav"
          />

          <n-flex class="app-header__actions" :size="8" align="center" :wrap="false">
            <n-tooltip>
              <template #trigger>
                <n-button quaternary circle @click="toggleHideMoney">
                  <template #icon>
                    <svg v-if="!hideMoney" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
                    </svg>
                    <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" />
                    </svg>
                  </template>
                </n-button>
              </template>
              {{ hideMoney ? 'Hiện số tiền' : 'Ẩn số tiền' }}
            </n-tooltip>

            <n-button type="primary" @click="calc.show()">
              <template #icon>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M8 18h.01M12 18h.01" />
                </svg>
              </template>
              Máy tính
            </n-button>

            <n-tooltip>
              <template #trigger>
                <n-button quaternary circle :loading="store.loading" @click="store.loadAll()">
                  <template #icon>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" />
                    </svg>
                  </template>
                </n-button>
              </template>
              Tải lại
            </n-tooltip>

            <n-tooltip>
              <template #trigger>
                <n-button quaternary circle @click="logout">
                  <template #icon>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />
                    </svg>
                  </template>
                </n-button>
              </template>
              Đăng xuất
            </n-tooltip>
          </n-flex>
        </div>
      </header>

      <main :class="isLoginRoute ? 'app-main app-main--login' : 'app-main'">
        <router-view />
      </main>

      <footer v-if="!isLoginRoute" class="app-footer">
        Binance Alpha Tracking · Lưu trữ trên Google Sheets · {{ new Date().getFullYear() }}
      </footer>

      <CalculatorModal v-if="!isLoginRoute" />
    </div>
  </n-config-provider>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NConfigProvider, NMenu, NButton, NFlex, NTooltip } from 'naive-ui';
import { useTrackingStore } from './stores/trackingStore';
import { useCalculatorStore } from './stores/calculatorStore';
import { clearStoredKey, hasStoredKey, inflightCount } from './services/api';
import CalculatorModal from './components/CalculatorModal.vue';
import { hideMoney, toggleHideMoney } from './utils/privacy';
import { themeOverrides, loadingBar } from './utils/naive';

const store = useTrackingStore();
const calc = useCalculatorStore();
const route = useRoute();
const router = useRouter();

const isLoginRoute = computed(() => route.name === 'login');

const routes = [
  { name: 'dashboard', path: '/', label: 'Dashboard' },
  { name: 'fees', path: '/fees', label: 'Phí Trade' },
  { name: 'alpha', path: '/alpha', label: 'Dự án Alpha' },
  { name: 'points', path: '/points', label: 'Điểm Alpha' },
  { name: 'accounts', path: '/accounts', label: 'Tài khoản' },
];

const menuOptions = routes.map((r) => ({ label: r.label, key: r.name }));
const activeKey = computed(() => route.name);
function onNav(name) {
  const r = routes.find((x) => x.name === name);
  if (r) router.push(r.path);
}

// inflightCount → thanh loading bar trên cùng (thay LoadingIndicator cũ).
watch(inflightCount, (n, old) => {
  if (n > 0 && (old || 0) === 0) loadingBar.start();
  else if (n === 0) loadingBar.finish();
});

async function logout() {
  await clearStoredKey();
  store.$reset();
  router.push({ name: 'login' });
}

function onAuthRequired() {
  if (route.name !== 'login') router.push({ name: 'login' });
}

onMounted(async () => {
  window.addEventListener('alpha:auth-required', onAuthRequired);
  if (await hasStoredKey()) store.loadAll();
});

onBeforeUnmount(() => {
  window.removeEventListener('alpha:auth-required', onAuthRequired);
});
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(247, 249, 252, 0.85);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--n-border-color, #dbe2ec);
}
.app-header__inner {
  max-width: 80rem;
  margin: 0 auto;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.app-logo {
  font-size: 24px;
  font-weight: 700;
  color: #2563eb;
  text-decoration: none;
  flex-shrink: 0;
}
.app-header :deep(.n-menu) {
  flex: 1;
  min-width: 0;
}
.app-header__actions {
  flex-shrink: 0;
}
.app-main {
  flex: 1;
  width: 100%;
  max-width: 80rem;
  margin: 0 auto;
  padding: 24px 16px;
}
.app-main--login {
  display: flex;
  max-width: none;
}
.app-footer {
  border-top: 1px solid #dbe2ec;
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
}
</style>
