<template>
  <div class="min-h-screen flex flex-col">
    <template v-if="!isLoginRoute">
      <!-- Top Nav -->
      <header class="border-b border-binance-light bg-binance-gray/60 backdrop-blur sticky top-0 z-10">
        <div class="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
          <router-link to="/" class="flex items-center gap-2">
            <span class="text-binance-yellow text-2xl font-bold">α</span>
            <span class="font-semibold">Binance Alpha Tracking</span>
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
          <div class="ml-auto flex items-center gap-3 text-sm">
            <div class="flex items-center gap-2 text-gray-400">
              <span>Tỉ giá:</span>
              <input
                v-model.number="store.vndRate"
                type="number"
                class="input w-24 py-1"
                @change="store.loadSummary()"
              />
              <span>VND/USD</span>
            </div>
            <button class="btn-secondary" @click="store.loadAll()" :disabled="store.loading">
              <span v-if="store.loading">Đang tải...</span>
              <span v-else>↻ Refresh</span>
            </button>
            <button class="btn-secondary" @click="logout" title="Đăng xuất">⎋</button>
          </div>
        </div>
      </header>

      <!-- Error banner -->
      <div
        v-if="store.error"
        class="bg-red-900/40 border-b border-red-700 text-red-200 px-4 py-2 text-sm"
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

    <CalculatorFab v-if="!isLoginRoute" />
    <Toaster />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTrackingStore } from './stores/trackingStore';
import { clearStoredKey, hasStoredKey } from './services/api';
import CalculatorFab from './components/CalculatorFab.vue';
import Toaster from './components/Toaster.vue';

const store = useTrackingStore();
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
