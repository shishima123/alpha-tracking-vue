<template>
  <n-card size="small" :bordered="true">
    <div class="stat-label">{{ label }}</div>
    <div class="stat-value" :style="color ? { color } : null">{{ value }}</div>
    <div v-if="sub" class="stat-sub">{{ sub }}</div>
  </n-card>
</template>

<script setup>
import { NCard } from 'naive-ui';

defineProps({
  label: String,
  value: [String, Number],
  sub: String,
  color: { type: String, default: '' },
});
</script>

<style scoped>
.stat-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
}
.stat-value {
  font-size: 24px;
  font-weight: 700;
  margin-top: 4px;
}
.stat-sub {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}
</style>
