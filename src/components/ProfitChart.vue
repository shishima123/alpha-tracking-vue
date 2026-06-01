<template>
  <n-card>
    <template #header>
      <div>
        <div style="font-weight: 600">Lợi nhuận theo tháng</div>
        <div style="font-size: 12px; color: #94a3b8; font-weight: 400">USD · sau khi trừ phí</div>
      </div>
    </template>
    <div class="chart-box">
      <Bar
        :data="chartData"
        :options="options"
        :style="hideMoney ? 'filter: blur(12px); user-select: none; pointer-events: none' : ''"
      />
      <div v-if="hideMoney" class="chart-mask">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" x2="22" y1="2" y2="22" />
        </svg>
        <span style="font-size: 13px; font-weight: 500">Đã ẩn</span>
      </div>
    </div>
  </n-card>
</template>

<script setup>
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import { NCard } from 'naive-ui';
import { hideMoney } from '../utils/privacy';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const props = defineProps({
  monthly: { type: Array, default: () => [] },
});

const chartData = computed(() => ({
  labels: props.monthly.map((m) => m.month),
  datasets: [
    {
      label: 'Lợi nhuận (USD)',
      data: props.monthly.map((m) => m.profit),
      backgroundColor: '#2563eb',
      borderRadius: 6,
    },
    {
      label: 'Phí (USD)',
      data: props.monthly.map((m) => m.totalFee),
      backgroundColor: '#ef4444',
      borderRadius: 6,
    },
  ],
}));

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#334155' } },
    // Ẩn số trong tooltip khi bật chế độ ẩn (blur + overlay vẫn che, đây là lớp an toàn).
    tooltip: hideMoney.value
      ? { callbacks: { label: (ctx) => `${ctx.dataset.label}: ***` } }
      : {},
  },
  scales: {
    x: { ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' } },
    y: {
      ticks: {
        color: '#64748b',
        callback: (v) => (hideMoney.value ? '' : v),
      },
      grid: { color: '#e2e8f0' },
    },
  },
}));
</script>

<style scoped>
.chart-box {
  height: 288px;
  position: relative;
}
.chart-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #9ca3af;
}
</style>
