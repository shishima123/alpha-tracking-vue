<template>
  <div class="login-wrap">
    <n-card class="login-card" :bordered="true">
      <h1 class="login-title">
        <span class="login-alpha">α</span>
        Binance Alpha Tracking
      </h1>
      <p class="login-sub">Nhập passphrase để truy cập dữ liệu.</p>

      <n-form @submit.prevent="login">
        <n-form-item label="Passphrase" :show-feedback="false">
          <n-input
            v-model:value="passphrase"
            type="password"
            show-password-on="click"
            placeholder="••••••••"
            :disabled="loading"
            autofocus
            @keyup.enter="login"
          />
        </n-form-item>
        <n-text v-if="error" type="error" depth="1" style="font-size: 13px">{{ error }}</n-text>
        <n-button
          type="primary"
          block
          attr-type="submit"
          :loading="loading"
          :disabled="!passphrase"
          style="margin-top: 16px"
          @click="login"
        >
          {{ loading ? 'Đang kiểm tra...' : 'Đăng nhập' }}
        </n-button>
      </n-form>
    </n-card>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { NCard, NForm, NFormItem, NInput, NButton, NText } from 'naive-ui';
import { authApi, persistPassphrase } from '../services/api';
import { useTrackingStore } from '../stores/trackingStore';

const passphrase = ref('');
const error = ref('');
const loading = ref(false);
const router = useRouter();
const store = useTrackingStore();

async function login() {
  if (loading.value || !passphrase.value) return;
  loading.value = true;
  error.value = '';
  try {
    const ok = await authApi.verify(passphrase.value);
    if (!ok) {
      error.value = 'Passphrase không đúng';
      return;
    }
    await persistPassphrase(passphrase.value);
    passphrase.value = '';
    await store.loadAll();
    router.push('/');
  } catch (e) {
    error.value = e.message || 'Lỗi không xác định';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  min-height: 80vh;
}
.login-card {
  max-width: 380px;
  width: 100%;
}
.login-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 4px;
}
.login-alpha {
  color: #2563eb;
  font-size: 24px;
}
.login-sub {
  font-size: 13px;
  color: #94a3b8;
  margin: 0 0 20px;
}
</style>
