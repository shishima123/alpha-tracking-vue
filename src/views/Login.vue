<template>
  <div class="min-h-[80vh] flex items-center justify-center px-4 w-full">
    <div class="card max-w-sm w-full">
      <h1 class="text-xl font-semibold mb-1 flex items-center gap-2">
        <span class="text-binance-yellow text-2xl">α</span>
        Binance Alpha Tracking
      </h1>
      <p class="text-sm text-gray-400 mb-5">Nhập passphrase để truy cập dữ liệu.</p>
      <form @submit.prevent="login">
        <label class="label" for="pw">Passphrase</label>
        <input
          id="pw"
          v-model="passphrase"
          type="password"
          class="input"
          autocomplete="current-password"
          :disabled="loading"
          autofocus
        />
        <p v-if="error" class="text-sm text-red-400 mt-2">{{ error }}</p>
        <button
          type="submit"
          class="btn-primary w-full justify-center mt-4"
          :disabled="loading || !passphrase"
        >
          <span v-if="loading">Đang kiểm tra...</span>
          <span v-else>Đăng nhập</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { authApi, setStoredSecret } from '../services/api';
import { useTrackingStore } from '../stores/trackingStore';

const passphrase = ref('');
const error = ref('');
const loading = ref(false);
const router = useRouter();
const store = useTrackingStore();

async function login() {
  loading.value = true;
  error.value = '';
  try {
    const ok = await authApi.verify(passphrase.value);
    if (!ok) {
      error.value = 'Passphrase không đúng';
      return;
    }
    setStoredSecret(passphrase.value);
    await store.loadAll();
    router.push('/');
  } catch (e) {
    error.value = e.message || 'Lỗi không xác định';
  } finally {
    loading.value = false;
  }
}
</script>
