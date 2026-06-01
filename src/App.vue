<template>
  <div class="min-h-screen flex flex-col">
    <template v-if="!isLoginRoute">
      <!-- Top Nav -->
      <header class="border-b border-binance-light bg-binance-gray/60 backdrop-blur sticky top-0 z-10">
        <div class="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 flex-nowrap">
          <router-link to="/" class="flex items-center shrink-0">
            <span class="text-binance-yellow text-2xl font-bold">α</span>
          </router-link>
          <nav class="flex items-center gap-1 text-sm">
            <router-link
              v-for="r in routes"
              :key="r.name"
              :to="r.path"
              class="px-3 py-1.5 rounded-lg hover:bg-binance-light transition"
              active-class="bg-binance-light text-binance-yellow"
            >
              {{ r.label }}
            </router-link>
          </nav>
          <div class="ml-auto flex items-center gap-2 text-sm shrink-0">
            <button
              class="btn-secondary"
              @click="toggleHideMoney"
              :title="hideMoney ? 'Hiện số tiền' : 'Ẩn số tiền'"
            >
              <svg v-if="!hideMoney" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" x2="22" y1="2" y2="22" />
              </svg>
            </button>
            <button class="btn-primary" @click="calc.show()" title="Máy tính Volume → Phí Alpha">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="16" height="20" x="4" y="2" rx="2" />
                <line x1="8" x2="16" y1="6" y2="6" />
                <line x1="16" x2="16" y1="14" y2="18" />
                <path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M8 18h.01M12 18h.01" />
              </svg>
              <span class="hidden sm:inline">Máy tính</span>
            </button>
            <button class="btn-secondary" @click="store.loadAll()" :disabled="store.loading" :title="store.loading ? 'Đang tải...' : 'Refresh'">
              <svg class="w-4 h-4" :class="store.loading ? 'animate-spin' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
            </button>
            <button class="btn-secondary" @click="logout" title="Đăng xuất">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <!-- Error banner -->
      <div
        v-if="store.error"
        class="bg-red-50 border-b border-red-300 text-red-700 px-4 py-2 text-sm"
      >
        {{ store.error }}
        <button class="ml-2 underline" @click="store.error = null">đóng</button>
      </div>
    </template>

    <!-- Main content -->
    <main :class="isLoginRoute ? 'flex-1 flex' : 'flex-1 max-w-7xl w-full mx-auto px-4 py-6'">
      <router-view />
    </main>

    <footer v-if="!isLoginRoute" class="border-t border-binance-light py-3 text-center text-xs text-gray-500">
      Binance Alpha Tracking · Lưu trữ trên Google Sheets · {{ new Date().getFullYear() }}
    </footer>

    <CalculatorModal v-if="!isLoginRoute" />
    <Toaster />
    <LoadingIndicator />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTrackingStore } from './stores/trackingStore';
import { useCalculatorStore } from './stores/calculatorStore';
import { clearStoredKey, hasStoredKey } from './services/api';
import CalculatorModal from './components/CalculatorModal.vue';
import Toaster from './components/Toaster.vue';
import LoadingIndicator from './components/LoadingIndicator.vue';
import { hideMoney, toggleHideMoney } from './utils/privacy';

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
