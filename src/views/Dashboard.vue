<template>
  <n-flex vertical :size="20">
    <!-- Tỉ giá + toggle tổng quan (cùng 1 hàng) -->
    <n-flex justify="end" align="center" :size="12" :wrap="true">
      <n-flex align="center" :size="8">
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
      <button class="overview-toggle" @click="showOverview = !showOverview">
        {{ showOverview ? 'Ẩn tổng quan' : 'Hiện tổng quan' }}
        <span class="chevron" :class="{ open: showOverview }">▾</span>
      </button>
    </n-flex>

    <n-collapse-transition :show="showOverview">
      <n-flex vertical :size="20">
        <!-- Stat overview -->
        <n-grid cols="2 m:4" responsive="screen" :x-gap="12" :y-gap="12">
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
              :sub="fmtVND(total.profit * store.vndRate)" color="#16a34a" />
          </n-gi>
          <n-gi>
            <StatCard label="Dự án đã claim" :value="total.projects" :sub="store.projects.length + ' tổng'" />
          </n-gi>
        </n-grid>

        <ProfitChart :monthly="monthly" />
      </n-flex>
    </n-collapse-transition>

    <!-- Tabbed summary -->
    <n-card class="summary-card">
      <n-tabs v-model:value="activeTab" type="line" animated>
                <!-- Monthly table -->
        <n-tab-pane name="month" tab="Chi tiết theo tháng">
          <n-text depth="3" style="font-size: 12px; display: block; text-align: right; margin-bottom: 8px">
            Bấm vào tháng để xem chi tiết từng tài khoản
          </n-text>
          <div class="table-scroll">
          <n-table :bordered="false" :single-line="false" size="small">
            <thead>
              <tr>
                <th></th>
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
                  <td class="ta-r muted">{{ fmtVND(m.profit * store.vndRate) }}</td>
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
                    <n-table v-else class="hov-table" :bordered="false" :single-line="false" size="small" style="margin-top: 8px">
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
          </div>

          <n-flex v-if="monthlyDesc.length > DEFAULT_MONTHS" justify="center" style="margin-top: 12px">
            <n-button size="small" tertiary @click="showAllMonths = !showAllMonths">
              {{ showAllMonths
                ? `Thu gọn (chỉ ${DEFAULT_MONTHS} tháng gần nhất)`
                : `Xem tất cả ${monthlyDesc.length} tháng` }}
            </n-button>
          </n-flex>
        </n-tab-pane>

        <!-- Per-account summary -->
        <n-tab-pane name="account" tab="Tổng kết theo tài khoản">
          <div class="table-scroll freeze-first">
          <n-table class="hov-table" :bordered="false" :single-line="false" size="small">
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
          </div>
        </n-tab-pane>
      </n-tabs>
    </n-card>
  </n-flex>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import { NFlex, NGrid, NGi, NCard, NTabs, NTabPane, NTable, NButton, NInputNumber, NText, NCollapseTransition } from 'naive-ui';
import { useTrackingStore } from '../stores/trackingStore';
import StatCard from '../components/StatCard.vue';
import ProfitChart from '../components/ProfitChart.vue';
import { fmtUSD, fmtVND, todayStr } from '../utils/format';

const DEFAULT_MONTHS = 3;

const store = useTrackingStore();

const activeTab = useStorage('alpha:dashboardTab', 'account');
// Trạng thái thu gọn phần tổng quan (lưu localStorage).
const showOverview = useStorage('alpha:dashboardOverview', true);

// Tỉ giá chỉ là phép nhân hiển thị — đổi rate không cần gọi server,
// mọi số VND trên trang đều là computed từ profit USD × store.vndRate.
// setVndRate persist localStorage để lần mở app sau giữ nguyên tỉ giá.
function onVndRate(v) {
  store.setVndRate(v);
}

const monthly = computed(() => store.summary?.monthly || []);
const total = computed(() => store.summary?.total || { revenue: 0, fee: 0, profit: 0, projects: 0 });

const monthlyDesc = computed(() => [...monthly.value].reverse());
const showAllMonths = ref(false);
const visibleMonths = computed(() =>
  showAllMonths.value ? monthlyDesc.value : monthlyDesc.value.slice(0, DEFAULT_MONTHS)
);

const expanded = reactive({});
function toggleMonth(key) {
  expanded[key] = !expanded[key];
}

// Tháng hiện tại ("MM/YYYY") → mặc định luôn mở khi dữ liệu vừa nạp.
const currentMonthKey = todayStr().slice(3); // "DD/MM/YYYY" → "MM/YYYY"
let didDefaultExpand = false;
watch(
  monthly,
  (list) => {
    if (didDefaultExpand || !list.length) return;
    if (list.some((m) => m.month === currentMonthKey)) {
      expanded[currentMonthKey] = true;
      didDefaultExpand = true;
    }
  },
  { immediate: true }
);

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
.card-title { font-weight: 600; }

/* Nút nhỏ thu gọn phần tổng quan, nằm góc phải. */
.overview-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  background: #fff;
  border: 1px solid #efeff5;
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  transition: border-color 0.15s, color 0.15s;
}
.overview-toggle:hover { border-color: #2563eb; color: #2563eb; }
.chevron { transition: transform 0.2s; display: inline-block; }
.chevron.open { transform: rotate(180deg); }
.ta-r { text-align: right; }
.ta-c { text-align: center; }
.rev { color: #2563eb; }
.fee { color: #e11d48; }
.pos { color: #16a34a; }
.neg { color: #dc2626; }
.empty { text-align: center; padding: 24px; color: #94a3b8; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.clickable { cursor: pointer; }

/* Hover row — đồng bộ với các bảng khác (#f3f4f5 = overlay xám trên nền trắng). */
.hov-table tbody td,
tr.clickable > td {
  transition: background-color 0.15s;
}
.hov-table tbody tr:hover > td,
tr.clickable:hover > td {
  background-color: #f3f4f5;
}
.table-scroll {
  overflow-x: auto;
  background: #fff;
  border: 1px solid #efeff5;
  border-radius: 8px;
}
.table-scroll :deep(th),
.table-scroll :deep(td) { white-space: nowrap; }

/* Card tổng kết: nền xám + padding 16px (đồng bộ với các tab khác). */
.summary-card { background: #eef1f6; }
.summary-card :deep(.n-card-content) { padding: 16px !important; }

/* Freeze cột đầu (sticky khi cuộn ngang) — cho cả PC lẫn mobile.
   naive .n-table có overflow:hidden làm hỏng sticky → override visible. */
.table-scroll :deep(table) { overflow: visible; }

/* "Tổng kết theo tài khoản": freeze cột Tài khoản. */
.freeze-first :deep(> table > tbody > tr > td:first-child) {
  position: sticky;
  left: 0;
  z-index: 1;
  background: #fff;
  border-right: 1px solid #efeff5;
}
.freeze-first :deep(> table > thead > tr > th:first-child) {
  position: sticky;
  left: 0;
  z-index: 2;
  background: #fafafc;
  border-right: 1px solid #efeff5;
}
.freeze-first :deep(> table > tbody > tr:hover > td:first-child) {
  background: #f3f4f5;
}
</style>
