<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-50 space-y-2 max-w-sm pointer-events-none">
      <transition-group name="toast" tag="div" class="space-y-2">
        <div
          v-for="t in toast.items"
          :key="t.id"
          class="pointer-events-auto px-4 py-3 rounded-lg shadow-lg border text-sm
                 flex items-start gap-2 backdrop-blur"
          :class="classFor(t.type)"
          @click="toast.dismiss(t.id)"
        >
          <span class="text-base leading-none">{{ iconFor(t.type) }}</span>
          <span class="flex-1">{{ t.message }}</span>
        </div>
      </transition-group>
    </div>
  </Teleport>
</template>

<script setup>
import { useToastStore } from '../stores/toastStore';

const toast = useToastStore();

function classFor(type) {
  if (type === 'success') return 'bg-green-600 border-green-500 text-white';
  if (type === 'error') return 'bg-red-600 border-red-500 text-white';
  return 'bg-white/95 border-binance-light text-gray-700';
}

function iconFor(type) {
  if (type === 'success') return '✓';
  if (type === 'error') return '✕';
  return 'ℹ';
}
</script>

<style scoped>
.toast-enter-from { opacity: 0; transform: translateX(20px); }
.toast-leave-to   { opacity: 0; transform: translateX(20px); }
.toast-enter-active,
.toast-leave-active { transition: all 0.2s ease; }
</style>
