<template>
  <n-flex vertical :size="20">
    <!-- Exchange rate -->
    <n-flex justify="end" align="center" :size="8">
      <span class="muted">Tỉ giá:</span>
      <n-input-number
        :value="store.vndRate"
        :show-button="false"
        style="width: 140px"
        @update:value="onVndRate"
      >
        <template #suffix>VND/USD</template>
      </n-input-number>
    </n-flex>

    <!-- Stat overview -->
    <n-grid cols="1 s:2 m:4" responsive="screen" :x-gap="16" :y-gap="16">
      <n-gi>
        <StatCard label="Tổng thu nhập" :value="'$' + fmtUSD(total.revenue)"
          :sub="fmtVND(total.revenue * store.vndRate)" color="#2563eb" />
      </n-gi>
      <n-gi>
        <StatCard label="Tổng phí" :value="'$' + fmtUSD(total.fee)"
          :sub="fmtVND(total.fee * store.vndRate)" color="#dc2626" />
      </n-gi>
      <n-gi>
        <StatCard label="Lợi nhuận" :value="'$' + fmtUSD(total.profit)"
          :sub="fmtVND(total.profitVND)" color="#16a34a" />
      </n-gi>
      <n-gi>
        <StatCard label="Dự án đã claim" :value="total.projects" :sub="store.projects.length + ' tổng'" />
      </n-gi>
    </n-grid>

    <ProfitChart :monthly="monthly" />

    <!-- Tabbed summary -->
    <n-card>
      <n-tabs v-model:value="activeTab" type="line" animated>
        <!-- Per-account summary -->
        <n-tab-pane name="account" tab="Tổng kết theo tài khoản">
          <n-table :bordered="false" :single-line="false" size="small">
            <thead>
              <tr>
                <th>Tài khoản</th>
                <th class="ta-r">Thu nhập ($)</th>
                <th class="ta-r">Phí ($)</th>
                <th class="ta-r">Lợi nhuận ($)</th>
                <th class="ta-r">Lợi nhuận (VND)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in accountTotals" :key="row.id">
                <td>
                  <n-flex align="center" :size="8" :wrap="false">
                    <span class="dot" :style="{ background: accountColor(row.id) }"></span>
                    <span class="strong">{{ accountName(row.id) }}</span>
                  </n-flex>
                </td>
                <td class="ta-r rev">{{ fmtUSD(row.revenue) }}</td>
                <td class="ta-r fee">-{{ fmtUSD(row.fee) }}</td>
                <td class="ta-r strong" :class="row.profit >= 0 ? 'pos' : 'neg'">{{ fmtUSD(row.profit) }}</td>
                <td class="ta-r muted">{{ fmtVND(row.profit * store.vndRate) }}</td>
              </tr>
              <tr v-if="accountTotals.length === 0">
                <td colspan="5" class="empty">Chưa có dữ liệu</td>
              </tr>
            </tbody>
          </n-table>
        </n-tab-pane>

        <!-- Monthly table -->
        <n-tab-pane name="month" tab="Chi tiết theo tháng">
          <n-text depth="3" style="font-size: 12px; display: block; text-align: right; margin-bottom: 8px">
            Bấm vào tháng để xem chi tiết từng tài khoản
          </n-text>
          <n-table :bordered="false" :single-line="false" size="small">
            <thead>
              <tr>
                <th style="width: 24px"></th>
                <th>Tháng</th>
                <th class="ta-r">Thu nhập ($)</th>
                <th class="ta-r">Phí ($)</th>
                <th class="ta-r">Lợi nhuận ($)</th>
                <th class="ta-r">Lợi nhuận (VND)</th>
                <th class="ta-r">Số dự án</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="m in visibleMonths" :key="m.month">
                <tr class="clickable" @click="toggleMonth(m.month)">
                  <td class="ta-c muted">{{ expanded[m.month] ? '▾' : '▸' }}</td>
                  <td class="strong">{{ m.month }}</td>
                  <td class="ta-r rev">{{ fmtUSD(m.totalRevenue) }}</td>
                  <td class="ta-r fee">-{{ fmtUSD(m.totalFee) }}</td>
                  <td class="ta-r strong" :class="m.profit >= 0 ? 'pos' : 'neg'">{{ fmtUSD(m.profit) }}</td>
                  <td class="ta-r muted">{{ fmtVND(m.profitVND) }}</td>
                  <td class="ta-r">{{ m.projects }}</td>
                </tr>
                <tr v-if="expanded[m.month]">
                  <td></td>
                  <td colspan="6" style="padding: 12px">
                    <n-text depth="3" style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em">
                      Theo tài khoản — Tháng {{ m.month }}
                    </n-text>
                    <div v-if="!hasAccountBreakdown(m)" class="muted" style="font-style: italic; font-size: 12px; margin-top: 8px">
                      Không có dữ liệu chi tiết
                    </div>
                    <n-table v-else :bordered="false" :single-line="false" size="small" style="margin-top: 8px">
                      <thead>
                        <tr>
                          <th>Tài khoản</th>
                          <th class="ta-r">Thu nhập</th>
                          <th class="ta-r">Phí</th>
                          <th class="ta-r">Lợi nhuận</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in sortedAccountRows(m)" :key="row.id">
                          <td>
                            <n-flex align="center" :size="8" :wrap="false">
                              <span class="dot" :style="{ background: accountColor(row.id) }"></span>
                              {{ accountName(row.id) }}
                            </n-flex>
                          </td>
                          <td class="ta-r rev">{{ fmtUSD(row.revenue) }}</td>
                          <td class="ta-r fee">-{{ fmtUSD(row.fee) }}</td>
                          <td class="ta-r strong" :class="row.profit >= 0 ? 'pos' : 'neg'">{{ fmtUSD(row.profit) }}</td>
                        </tr>
                      </tbody>
                    </n-table>
                  </td>
                </tr>
              </template>
              <tr v-if="monthly.length === 0">
                <td colspan="7" class="empty">Chưa có dữ liệu - thêm phí và dự án Alpha để xem báo cáo</td>
              </tr>
            </tbody>
          </n-table>

          <n-flex v-if="monthlyDesc.length > DEFAULT_MONTHS" justify="center" style="margin-top: 12px">
            <n-button size="small" tertiary @click="showAllMonths = !showAllMonths">
              {{ showAllMonths
                ? `Thu gọn (chỉ ${DEFAULT_MONTHS} tháng gần nhất)`
                : `Xem tất cả ${monthlyDesc.length} tháng` }}
            </n-button>
          </n-flex>
        </n-tab-pane>
      </n-tabs>
    </n-card>
  </n-flex>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { useStorage } from '@vueuse/core';
import { NFlex, NGrid, NGi, NCard, NTabs, NTabPane, NTable, NButton, NInputNumber, NText } from 'naive-ui';
import { useTrackingStore } from '../stores/trackingStore';
import StatCard from '../components/StatCard.vue';
import ProfitChart from '../components/ProfitChart.vue';
import { fmtUSD, fmtVND } from '../utils/format';

const DEFAULT_MONTHS = 3;

const store = useTrackingStore();

const activeTab = useStorage('alpha:dashboardTab', 'account');

function onVndRate(v) {
  store.vndRate = Number(v) || 0;
  store.loadSummary();
}

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

<style scoped>
.muted { color: #94a3b8; }
.strong { font-weight: 600; }
.ta-r { text-align: right; }
.ta-c { text-align: center; }
.rev { color: #2563eb; }
.fee { color: #e11d48; }
.pos { color: #16a34a; }
.neg { color: #dc2626; }
.empty { text-align: center; padding: 24px; color: #94a3b8; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.clickable { cursor: pointer; }
</style>
