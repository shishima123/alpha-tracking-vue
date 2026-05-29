<template>
  <div class="card">
    <div class="flex items-center justify-between mb-3">
      <div>
        <h3 class="font-semibold">Lợi nhuận theo tháng</h3>
        <p class="text-xs text-gray-500">USD · sau khi trừ phí</p>
      </div>
    </div>
    <div class="h-72">
      <Bar :data="chartData" :options="options" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
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

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#334155' } },
  },
  scales: {
    x: { ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' } },
    y: { ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' } },
  },
};
</script>
