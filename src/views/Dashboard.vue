<template>
  <div class="space-y-6">
    <!-- Stat overview -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatCard
        label="Tổng thu nhập"
        :value="'$' + fmtUSD(total.revenue)"
        :sub="fmtVND(total.revenue * store.vndRate)"
        color-class="text-binance-yellow"
      />
      <StatCard
        label="Tổng phí"
        :value="'$' + fmtUSD(total.fee)"
        :sub="fmtVND(total.fee * store.vndRate)"
        color-class="text-red-400"
      />
      <StatCard
        label="Lợi nhuận"
        :value="'$' + fmtUSD(total.profit)"
        :sub="fmtVND(total.profitVND)"
        color-class="text-green-400"
      />
      <StatCard
        label="Dự án đã claim"
        :value="total.projects"
        :sub="store.projects.length + ' tổng'"
      />
    </div>

    <ProfitChart :monthly="monthly" />

    <!-- Monthly table -->
    <div class="card overflow-x-auto">
      <h3 class="font-semibold mb-3">Chi tiết theo tháng</h3>
      <table class="w-full text-sm">
        <thead>
          <tr class="table-thead">
            <th class="px-3 py-2">Tháng</th>
            <th class="px-3 py-2 text-right">Thu nhập ($)</th>
            <th class="px-3 py-2 text-right">Phí ($)</th>
            <th class="px-3 py-2 text-right">Lợi nhuận ($)</th>
            <th class="px-3 py-2 text-right">Lợi nhuận (VND)</th>
            <th class="px-3 py-2 text-right">Số dự án</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in [...monthly].reverse()" :key="m.month" class="hover:bg-binance-light/30">
            <td class="table-td font-medium">{{ m.month }}</td>
            <td class="table-td text-right text-binance-yellow">{{ fmtUSD(m.totalRevenue) }}</td>
            <td class="table-td text-right text-red-400">-{{ fmtUSD(m.totalFee) }}</td>
            <td class="table-td text-right text-green-400 font-semibold">{{ fmtUSD(m.profit) }}</td>
            <td class="table-td text-right text-gray-300">{{ fmtVND(m.profitVND) }}</td>
            <td class="table-td text-right">{{ m.projects }}</td>
          </tr>
          <tr v-if="monthly.length === 0">
            <td colspan="6" class="text-center py-6 text-gray-500">
              Chưa có dữ liệu - thêm phí và dự án Alpha để xem báo cáo
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Per-account breakdown for current month -->
    <div v-if="latestMonth" class="card overflow-x-auto">
      <h3 class="font-semibold mb-3">
        Theo tài khoản — Tháng {{ latestMonth.month }}
      </h3>
      <table class="w-full text-sm">
        <thead>
          <tr class="table-thead">
            <th class="px-3 py-2">Tài khoản</th>
            <th class="px-3 py-2 text-right">Thu nhập</th>
            <th class="px-3 py-2 text-right">Phí</th>
            <th class="px-3 py-2 text-right">Lợi nhuận</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(d, id) in latestMonth.byAccount" :key="id" class="hover:bg-binance-light/30">
            <td class="table-td">
              <span
                class="inline-block w-2 h-2 rounded-full mr-2"
                :style="{ background: accountColor(id) }"
              ></span>
              {{ accountName(id) }}
            </td>
            <td class="table-td text-right text-binance-yellow">{{ fmtUSD(d.revenue) }}</td>
            <td class="table-td text-right text-red-400">-{{ fmtUSD(d.fee) }}</td>
            <td
              class="table-td text-right font-semibold"
              :class="d.profit >= 0 ? 'text-green-400' : 'text-red-400'"
            >
              {{ fmtUSD(d.profit) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useTrackingStore } from '../stores/trackingStore';
import StatCard from '../components/StatCard.vue';
import ProfitChart from '../components/ProfitChart.vue';
import { fmtUSD, fmtVND } from '../utils/format';

const store = useTrackingStore();

const monthly = computed(() => store.summary?.monthly || []);
const total = computed(() => store.summary?.total || { revenue: 0, fee: 0, profit: 0, profitVND: 0, projects: 0 });
const latestMonth = computed(() => (monthly.value.length ? monthly.value[monthly.value.length - 1] : null));

function accountName(id) {
  return store.accountById(id)?.displayName || id;
}
function accountColor(id) {
  return store.accountById(id)?.color || '#3b82f6';
}
</script>
