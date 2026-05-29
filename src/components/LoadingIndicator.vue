<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="visible"
        class="fixed top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
      >
        <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-binance-gray/95 border border-binance-light shadow-lg backdrop-blur text-xs">
          <span class="inline-block w-3 h-3 border-2 border-binance-yellow border-t-transparent rounded-full animate-spin"></span>
          <span class="text-gray-200">Đang tải...</span>
          <span v-if="inflightCount > 1" class="text-gray-500">({{ inflightCount }})</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue';
import { inflightCount } from '../services/api';

// Delay nhỏ trước khi show để tránh flicker với call dưới 150ms.
const DELAY_MS = 150;
const visible = ref(false);
let timer = null;

watch(inflightCount, (n) => {
  if (n > 0) {
    if (timer) return;
    timer = setTimeout(() => {
      visible.value = true;
      timer = null;
    }, DELAY_MS);
  } else {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    visible.value = false;
  }
}, { immediate: true });
</script>
