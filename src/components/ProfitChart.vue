<template>
  <div class="card">
    <div class="flex items-center justify-between mb-3">
      <div>
        <h3 class="font-semibold">Lợi nhuận theo tháng</h3>
        <p class="text-xs text-gray-500">USD · sau khi trừ phí</p>
      </div>
    </div>
    <div class="h-72 relative">
      <Bar
        :data="chartData"
        :options="options"
        :class="hideMoney ? 'blur-md select-none pointer-events-none' : ''"
      />
      <div
        v-if="hideMoney"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400"
      >
        <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" x2="22" y1="2" y2="22" />
        </svg>
        <span class="text-sm font-medium">Đã ẩn</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
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
