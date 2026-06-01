<template>
  <div class="space-y-6">
    <!-- Exchange rate -->
    <div class="flex items-center justify-end gap-2 text-sm text-gray-500">
      <span>Tỉ giá:</span>
      <input
        v-model.number="store.vndRate"
        type="number"
        class="input w-28 py-1"
        @change="store.loadSummary()"
      />
      <span>VND/USD</span>
    </div>

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
        color-class="text-rose-600"
      />
      <StatCard
        label="Lợi nhuận"
        :value="'$' + fmtUSD(total.profit)"
        :sub="fmtVND(total.profitVND)"
        color-class="text-green-600"
      />
      <StatCard
        label="Dự án đã claim"
        :value="total.projects"
        :sub="store.projects.length + ' tổng'"
      />
    </div>

    <ProfitChart :monthly="monthly" />

    <!-- Tabbed summary -->
    <div class="card overflow-x-auto">
      <div class="flex items-center gap-1 border-b border-binance-light/40 mb-4">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
          :class="activeTab === t.key
            ? 'border-binance-yellow text-binance-yellow'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          @click="activeTab = t.key"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- Per-account summary -->
      <table v-show="activeTab === 'account'" class="w-full text-sm">
        <thead>
          <tr class="table-thead">
            <th class="px-3 py-2">Tài khoản</th>
            <th class="px-3 py-2 text-right">Thu nhập ($)</th>
            <th class="px-3 py-2 text-right">Phí ($)</th>
            <th class="px-3 py-2 text-right">Lợi nhuận ($)</th>
            <th class="px-3 py-2 text-right">Lợi nhuận (VND)</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in accountTotals"
            :key="row.id"
            class="hover:bg-binance-light/30"
          >
            <td class="table-td font-medium">
              <span
                class="inline-block w-2 h-2 rounded-full mr-2"
                :style="{ background: accountColor(row.id) }"
              ></span>
              {{ accountName(row.id) }}
            </td>
            <td class="table-td text-right text-binance-yellow">{{ fmtUSD(row.revenue) }}</td>
            <td class="table-td text-right text-rose-600">-{{ fmtUSD(row.fee) }}</td>
            <td
              class="table-td text-right font-semibold"
              :class="row.profit >= 0 ? 'text-green-600' : 'text-red-600'"
            >
              {{ fmtUSD(row.profit) }}
            </td>
            <td class="table-td text-right text-gray-700">
              {{ fmtVND(row.profit * store.vndRate) }}
            </td>
          </tr>
          <tr v-if="accountTotals.length === 0">
            <td colspan="5" class="text-center py-6 text-gray-500">
              Chưa có dữ liệu
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Monthly table -->
      <div v-show="activeTab === 'month'">
      <div class="flex items-center justify-end mb-3 flex-wrap gap-2">
        <span class="text-xs text-gray-500">
          Bấm vào tháng để xem chi tiết từng tài khoản
        </span>
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="table-thead">
            <th class="px-3 py-2 w-6"></th>
            <th class="px-3 py-2">Tháng</th>
            <th class="px-3 py-2 text-right">Thu nhập ($)</th>
            <th class="px-3 py-2 text-right">Phí ($)</th>
            <th class="px-3 py-2 text-right">Lợi nhuận ($)</th>
            <th class="px-3 py-2 text-right">Lợi nhuận (VND)</th>
            <th class="px-3 py-2 text-right">Số dự án</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="m in visibleMonths" :key="m.month">
            <tr
              class="hover:bg-binance-light/30 cursor-pointer"
              :class="expanded[m.month] ? 'bg-binance-light/20' : ''"
              @click="toggleMonth(m.month)"
            >
              <td class="table-td text-center text-gray-500 select-none">
                {{ expanded[m.month] ? '▾' : '▸' }}
              </td>
              <td class="table-td font-medium">{{ m.month }}</td>
              <td class="table-td text-right text-binance-yellow">{{ fmtUSD(m.totalRevenue) }}</td>
              <td class="table-td text-right text-rose-600">-{{ fmtUSD(m.totalFee) }}</td>
              <td
                class="table-td text-right font-semibold"
                :class="m.profit >= 0 ? 'text-green-600' : 'text-red-600'"
              >
                {{ fmtUSD(m.profit) }}
              </td>
              <td class="table-td text-right text-gray-700">{{ fmtVND(m.profitVND) }}</td>
              <td class="table-td text-right">{{ m.projects }}</td>
            </tr>
            <tr v-if="expanded[m.month]" class="bg-binance-dark/50">
              <td></td>
              <td colspan="6" class="px-3 py-3">
                <div class="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                  Theo tài khoản — Tháng {{ m.month }}
                </div>
                <div v-if="!hasAccountBreakdown(m)" class="text-xs text-gray-500 italic">
                  Không có dữ liệu chi tiết
                </div>
                <table v-else class="w-full text-sm">
                  <thead>
                    <tr class="text-xs text-gray-500">
                      <th class="px-2 py-1 text-left font-normal">Tài khoản</th>
                      <th class="px-2 py-1 text-right font-normal">Thu nhập</th>
                      <th class="px-2 py-1 text-right font-normal">Phí</th>
                      <th class="px-2 py-1 text-right font-normal">Lợi nhuận</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in sortedAccountRows(m)"
                      :key="row.id"
                      class="border-t border-binance-light/30 hover:bg-binance-light/40 transition-colors"
                    >
                      <td class="px-2 py-1.5">
                        <span
                          class="inline-block w-2 h-2 rounded-full mr-2"
                          :style="{ background: accountColor(row.id) }"
                        ></span>
                        {{ accountName(row.id) }}
                      </td>
                      <td class="px-2 py-1.5 text-right text-binance-yellow">
                        {{ fmtUSD(row.revenue) }}
                      </td>
                      <td class="px-2 py-1.5 text-right text-rose-600">
                        -{{ fmtUSD(row.fee) }}
                      </td>
                      <td
                        class="px-2 py-1.5 text-right font-semibold"
                        :class="row.profit >= 0 ? 'text-green-600' : 'text-red-600'"
                      >
                        {{ fmtUSD(row.profit) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </template>
          <tr v-if="monthly.length === 0">
            <td colspan="7" class="text-center py-6 text-gray-500">
              Chưa có dữ liệu - thêm phí và dự án Alpha để xem báo cáo
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="monthlyDesc.length > DEFAULT_MONTHS" class="flex justify-center mt-3">
        <button
          class="btn-secondary text-xs"
          @click="showAllMonths = !showAllMonths"
        >
          {{ showAllMonths
            ? `Thu gọn (chỉ ${DEFAULT_MONTHS} tháng gần nhất)`
            : `Xem tất cả ${monthlyDesc.length} tháng` }}
        </button>
      </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { useStorage } from '@vueuse/core';
import { useTrackingStore } from '../stores/trackingStore';
import StatCard from '../components/StatCard.vue';
import ProfitChart from '../components/ProfitChart.vue';
import { fmtUSD, fmtVND } from '../utils/format';

const DEFAULT_MONTHS = 3;

const store = useTrackingStore();

const tabs = [
  { key: 'month', label: 'Chi tiết theo tháng' },
  { key: 'account', label: 'Tổng kết theo tài khoản' },
];
const activeTab = useStorage('alpha:dashboardTab', 'account');

const monthly = computed(() => store.summary?.monthly || []);
const total = computed(() => store.summary?.total || { revenue: 0, fee: 0, profit: 0, profitVND: 0, projects: 0 });

const monthlyDesc = computed(() => [...monthly.value].reverse());
const showAllMonths = ref(false);
const visibleMonths = computed(() =>
  showAllMonths.value ? monthlyDesc.value : monthlyDesc.value.slice(0, DEFAULT_MONTHS)
);

const expanded = reactive({});
function toggleMonth(key) {
  expanded[key] = !expanded[key];
}

// Tổng hợp toàn bộ tháng → một dòng / tài khoản
const accountTotals = computed(() => {
  const agg = {};
  monthly.value.forEach((m) => {
    const ba = m.byAccount || {};
    Object.keys(ba).forEach((id) => {
      if (!agg[id]) agg[id] = { id, revenue: 0, fee: 0, profit: 0 };
      agg[id].revenue += ba[id].revenue || 0;
      agg[id].fee += ba[id].fee || 0;
      agg[id].profit += ba[id].profit || 0;
    });
  });
  return Object.values(agg).sort(
    (a, b) => store.accountOrderIndex(a.id) - store.accountOrderIndex(b.id)
  );
});

function hasAccountBreakdown(m) {
  return m && m.byAccount && Object.keys(m.byAccount).length > 0;
}

function sortedAccountRows(m) {
  if (!m || !m.byAccount) return [];
  return Object.keys(m.byAccount)
    .map((id) => ({ id, ...m.byAccount[id] }))
    .sort((a, b) => store.accountOrderIndex(a.id) - store.accountOrderIndex(b.id));
}

function accountName(id) {
  return store.accountById(id)?.displayName || id;
}
function accountColor(id) {
  return store.accountById(id)?.color || '#3b82f6';
}
</script>
