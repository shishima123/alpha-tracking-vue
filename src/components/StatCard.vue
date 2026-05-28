<template>
  <div class="card">
    <div class="text-xs text-gray-400 uppercase">{{ label }}</div>
    <div class="text-2xl font-bold mt-1" :class="colorClass">{{ value }}</div>
    <div v-if="sub" class="text-xs text-gray-500 mt-1">{{ sub }}</div>
  </div>
</template>

<script setup>
defineProps({
  label: String,
  value: [String, Number],
  sub: String,
  colorClass: { type: String, default: 'text-white' },
});
</script>
