<template>
  <n-flex vertical :size="20">
    <!-- Management panel: archive + clear old (thu gọn mặc định) -->
    <n-card>
      <div class="head-toggle" @click="showManage = !showManage">
        <span class="card-title">
          Quản lý lịch sử phí
          <span style="margin-left: 4px">{{ indicatorIcon }}</span>
        </span>
        <n-flex align="center" :size="4" class="muted">
          {{ showManage ? 'Thu gọn' : 'Mở' }}
          <span class="chevron" :class="{ open: showManage }">▾</span>
        </n-flex>
      </div>

      <n-collapse-transition :show="showManage">
        <div style="padding-top: 12px">
          <n-flex :size="8" :wrap="true" style="margin-bottom: 12px">
            <n-button :loading="archiving" :disabled="!canArchive" @click="onArchive">
              Tổng hợp tháng cũ
              <span v-if="pendingMonths.length" style="color: #2563eb; margin-left: 4px">({{ pendingMonths.length }})</span>
            </n-button>
            <n-button type="error" ghost :loading="clearing" :disabled="!canClear" @click="onClearOld">
              Xóa lịch sử cũ
              <span v-if="canClear" class="muted" style="margin-left: 4px">({{ pastDaily.deletable }})</span>
            </n-button>
          </n-flex>

          <n-alert :type="indicatorType" :title="indicatorTitle" :bordered="true">
            {{ indicatorDetail }}
          </n-alert>
        </div>
      </n-collapse-transition>
    </n-card>

    <!-- Tất cả phí trade -->
    <n-card>
      <n-flex justify="space-between" align="center" :wrap="true" :size="8" style="margin-bottom: 12px">
        <span class="card-title">
          Tất cả phí trade
          <span class="muted" style="font-weight: 400">
            ({{ filteredFees.length }} bản ghi · {{ groupedByDate.length }} ngày)
          </span>
        </span>
        <n-flex align="center" :size="8" :wrap="true">
          <n-radio-group v-model:value="viewMode" size="small">
            <n-radio-button v-for="v in viewModes" :key="v.key" :value="v.key">{{ v.label }}</n-radio-button>
          </n-radio-group>
          <n-select
            v-model:value="filter.accountId"
            :options="accountOptions"
            size="small"
            style="width: 180px"
          />
          <n-button size="small" quaternary circle @click="store.loadAllFees()">↻</n-button>
        </n-flex>
      </n-flex>

      <n-empty v-if="groupedByDate.length === 0" description="Chưa có bản ghi nào — dùng modal 🧮 (góc dưới phải) để nhập phí." style="padding: 32px 0" />

      <!-- ===== View: Theo ngày (grouped) ===== -->
      <n-table v-else-if="viewMode === 'grouped'" :bordered="false" :single-line="false" size="small">
        <thead>
          <tr>
            <th style="width: 180px">Ngày</th>
            <th>Chi tiết tài khoản</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="group in groupedByDate" :key="group.date">
            <td style="vertical-align: top">
              <n-flex align="center" :size="10" :wrap="false">
                <span class="day-badge">{{ group.date.slice(0, 2) }}</span>
                <div>
                  <div class="strong">{{ group.date }}</div>
                  <div class="muted" style="font-size: 11px">{{ group.count }} tài khoản</div>
                </div>
              </n-flex>
              <n-tag type="error" size="small" :bordered="false" style="margin-top: 8px">
                Tổng {{ fmtUSD(group.totalFee) }}
              </n-tag>
            </td>
            <td>
              <table class="inner-table">
                <tbody>
                  <tr
                    v-for="f in group.entries"
                    :key="f.id"
                    class="inner-row"
                    :title="f.note ? `${accountName(f.accountId)} · ${f.note}` : accountName(f.accountId)"
                    @click="openEdit(f.date, f.accountId)"
                  >
                    <td style="width: 1px"><span class="dot" :style="{ background: accountColor(f.accountId) }"></span></td>
                    <td class="strong" style="white-space: nowrap; padding-right: 12px">
                      {{ accountName(f.accountId) }}
                      <span v-if="f.note">📝</span>
                    </td>
                    <td class="fee" style="text-align: right; font-weight: 700; white-space: nowrap; padding-right: 16px">{{ fmtUSD(f.fee) }}</td>
                    <td style="text-align: right; white-space: nowrap">
                      <span class="pts-chip">{{ f.points }}đ</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </n-table>

      <!-- ===== View: Bảng lịch sử (pivot) ===== -->
      <div v-else>
        <n-flex :size="16" :wrap="true" class="muted" style="font-size: 12px; margin-bottom: 8px">
          <n-flex align="center" :size="6"><span class="legend legend--window"></span>15 ngày gần nhất (đang tính cho phần Điểm)</n-flex>
          <n-flex align="center" :size="6"><span class="legend legend--today"></span>Hôm nay</n-flex>
        </n-flex>
        <div class="matrix-wrap">
          <table class="matrix">
            <thead>
              <tr>
                <th rowspan="2" class="sticky-col sticky-top corner">Ngày</th>
                <th v-for="a in matrixAccounts" :key="a.id" colspan="2" class="sticky-top acc-head">
                  <span class="dot" :style="{ background: accountColor(a.id) }"></span>
                  {{ a.displayName }}
                </th>
                <th rowspan="2" class="sticky-top total-head">Tổng phí</th>
              </tr>
              <tr>
                <template v-for="a in matrixAccounts" :key="'sub-' + a.id">
                  <th class="sticky-top2 sub-head">Phí</th>
                  <th class="sticky-top2 sub-head sub-head--pts">Điểm</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in matrixRows" :key="row.date" :class="rowBg(row)">
                <td class="sticky-col date-cell" :class="dateBg(row)">{{ row.date }}</td>
                <template v-for="a in matrixAccounts" :key="row.date + '-' + a.id">
                  <td class="num-cell" @click="openEdit(row.date, a.id)">
                    <span v-if="row.cells[a.id]" class="fee" style="font-weight: 600">{{ fmtUSD(row.cells[a.id].fee) }}</span>
                    <span v-else class="dash">–</span>
                  </td>
                  <td class="num-cell pts-col" @click="openEdit(row.date, a.id)">
                    <span v-if="row.cells[a.id]" class="muted" style="font-weight: 500">{{ row.cells[a.id].points }}</span>
                    <span v-else class="dash">–</span>
                  </td>
                </template>
                <td class="fee total-cell">{{ fmtUSD(row.totalFee) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <n-text v-if="groupedByDate.length > 0" depth="3" style="font-size: 12px; display: block; margin-top: 12px">
        Hiển thị toàn bộ daily còn trong sheet Fees. Sau khi bấm
        <b>Xóa lịch sử cũ</b>, các tháng đã <b>Tổng hợp</b> vào
        <n-text code>FeesMonthly</n-text> sẽ không còn dòng chi tiết ở đây.
      </n-text>
    </n-card>

    <!-- ===== Edit modal (matrix cell) ===== -->
    <n-modal
      :show="!!cellModal"
      preset="card"
      :title="cellModal?.existing ? 'Sửa phí' : 'Thêm phí'"
      style="max-width: 460px"
      @update:show="(v) => { if (!v) closeCellModal(); }"
    >
      <template v-if="cellModal">
        <n-grid :cols="2" :x-gap="12" :y-gap="12">
          <n-gi>
            <n-form-item label="Ngày" :show-feedback="false">
              <n-input :value="cellModal.date" readonly />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="Tài khoản" :show-feedback="false">
              <n-flex align="center" :size="6" class="readonly-box">
                <span class="dot" :style="{ background: accountColor(cellModal.accountId) }"></span>
                {{ accountName(cellModal.accountId) }}
              </n-flex>
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="Phí ($)" :show-feedback="false">
              <n-input-number v-model:value="cellModal.fee" :step="0.01" style="width: 100%" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="Điểm" :show-feedback="false">
              <n-input-number v-model:value="cellModal.points" style="width: 100%" />
            </n-form-item>
          </n-gi>
        </n-grid>
        <n-form-item label="Ghi chú" :show-feedback="false" style="margin-top: 12px">
          <n-input v-model:value="cellModal.note" placeholder="Không bắt buộc" />
        </n-form-item>
      </template>
      <template #footer v-if="cellModal">
        <n-flex justify="space-between" align="center">
          <n-button v-if="cellModal.existing" text type="error" :disabled="cellModal.saving" @click="deleteCell">
            Xóa bản ghi
          </n-button>
          <span v-else></span>
          <n-flex :size="8">
            <n-button :disabled="cellModal.saving" @click="closeCellModal">Hủy</n-button>
            <n-button type="primary" :loading="cellModal.saving" @click="saveCell">Lưu</n-button>
          </n-flex>
        </n-flex>
      </template>
    </n-modal>
  </n-flex>
</template>

<script setup>
import { reactive, computed, ref, onMounted } from 'vue';
import { useStorage } from '@vueuse/core';
import {
  NFlex, NCard, NButton, NCollapseTransition, NAlert, NRadioGroup, NRadioButton,
  NSelect, NTable, NTag, NEmpty, NModal, NGrid, NGi, NFormItem, NInput, NInputNumber, NText,
} from 'naive-ui';
import { useTrackingStore } from '../stores/trackingStore';
import { useToastStore } from '../stores/toastStore';
import { dialog } from '../utils/naive';
import { fmtUSD, parseDate, todayStr } from '../utils/format';

const store = useTrackingStore();
const toast = useToastStore();

const filter = reactive({ accountId: '' });

const viewModes = [
  { key: 'table', label: 'Bảng lịch sử' },
  { key: 'grouped', label: 'Theo ngày' },
];
const viewMode = useStorage('alpha:feesViewMode', 'grouped');

const accountOptions = computed(() => [
  { label: 'Tất cả tài khoản', value: '' },
  ...store.accounts.map((a) => ({ label: a.displayName, value: a.id })),
]);

const archiving = ref(false);
const clearing = ref(false);
const showManage = ref(false); // panel quản lý lịch sử thu gọn mặc định

const filteredFees = computed(() => {
  let list = [...store.allFees];
  if (filter.accountId) list = list.filter((f) => f.accountId === filter.accountId);
  return list;
});

// Tab này hiển thị toàn bộ daily rows còn trong sheet Fees (mọi tháng),
// nên cần load riêng — bootstrap (store.fees) chỉ trả về tháng hiện tại.
onMounted(() => {
  if (store.allFees.length === 0) store.loadAllFees();
});

const cellMap = computed(() => {
  const m = {};
  filteredFees.value.forEach((f) => { m[f.date + '|' + f.accountId] = f; });
  return m;
});
function cellAt(date, accountId) {
  return cellMap.value[date + '|' + accountId] || null;
}

const groupedByDate = computed(() => {
  const groups = {};
  filteredFees.value.forEach((f) => {
    if (!groups[f.date]) groups[f.date] = [];
    groups[f.date].push(f);
  });
  return Object.keys(groups)
    .sort((a, b) => (parseDate(b)?.getTime() || 0) - (parseDate(a)?.getTime() || 0))
    .map((date) => {
      const entries = groups[date].slice().sort(
        (a, b) => store.accountOrderIndex(a.accountId) - store.accountOrderIndex(b.accountId)
      );
      return {
        date,
        entries,
        count: entries.length,
        totalFee: entries.reduce((s, f) => s + (Number(f.fee) || 0), 0),
      };
    });
});

// ===== Pivot table view =====
const matrixAccounts = computed(() => {
  const ids = new Set();
  filteredFees.value.forEach((f) => ids.add(f.accountId));
  return [...ids]
    .map((id) => store.accountById(id) || { id, displayName: id, color: '#3b82f6' })
    .sort((a, b) => store.accountOrderIndex(a.id) - store.accountOrderIndex(b.id));
});

// inWindow = tradeDate + 15 >= today, khớp logic computePoints ở Code.gs.
function inPointWindow(date) {
  const d = parseDate(date);
  if (!d) return false;
  const reset = new Date(d);
  reset.setDate(reset.getDate() + 15);
  reset.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return reset.getTime() >= today.getTime();
}

const matrixRows = computed(() => {
  const today = todayStr();
  return groupedByDate.value.map((g) => {
    const cells = {};
    g.entries.forEach((f) => { cells[f.accountId] = f; });
    return {
      date: g.date,
      cells,
      totalFee: g.totalFee,
      inWindow: inPointWindow(g.date),
      isToday: g.date === today,
    };
  });
});

function rowBg(row) {
  if (row.isToday) return 'row-today';
  if (row.inWindow) return 'row-window';
  return '';
}
function dateBg(row) {
  if (row.isToday) return 'date-today';
  if (row.inWindow) return 'date-window';
  return '';
}

// ===== Past-daily indicator =====
const pastDaily = computed(() => store.pastDaily || { total: 0, deletable: 0, active: 0, safeToDelete: false, pendingArchiveMonths: [] });
const canClear = computed(() => pastDaily.value.deletable > 0);
const pendingMonths = computed(() => pastDaily.value.pendingArchiveMonths || []);
const canArchive = computed(() => pendingMonths.value.length > 0);

const indicatorIcon = computed(() => (canClear.value ? '✓' : 'ℹ'));
const indicatorType = computed(() => {
  if (canClear.value) return 'success';
  if (pastDaily.value.active > 0) return 'warning';
  return 'info';
});
const indicatorTitle = computed(() => {
  if (canClear.value) return `Có thể xóa ${pastDaily.value.deletable} bản ghi đã hết 15 ngày`;
  if (pastDaily.value.active > 0) return `Còn ${pastDaily.value.active} bản ghi cũ đang trong cửa sổ 15 ngày`;
  return 'Không có dữ liệu cũ';
});
const indicatorDetail = computed(() => {
  if (canClear.value) {
    const arch = pendingMonths.value.length;
    if (arch > 0) return `Nên bấm "Tổng hợp tháng cũ" trước (còn ${arch} tháng chưa archive) — sau khi clear, Dashboard sẽ chỉ thấy aggregate.`;
    return 'Các row này không còn tính điểm (không còn màu xanh) — xóa không ảnh hưởng tab Điểm.';
  }
  if (pastDaily.value.active > 0) {
    const safe = pastDaily.value.earliestSafeDate;
    return safe
      ? `Chưa có gì để xóa — row cũ nhất sẽ rời cửa sổ 15 ngày vào ${safe}.`
      : 'Tất cả bản ghi cũ vẫn trong cửa sổ 15 ngày — chưa có gì để xóa.';
  }
  return 'Sheet Fees chỉ chứa tháng hiện tại.';
});

// ===== Helpers =====
function accountName(id) { return store.accountById(id)?.displayName || id; }
function accountColor(id) { return store.accountById(id)?.color || '#3b82f6'; }

// ===== Cell/chip edit (modal) =====
const cellModal = ref(null);

function openEdit(date, accountId) {
  const existing = cellAt(date, accountId);
  cellModal.value = {
    date,
    accountId,
    existing,
    fee: existing ? existing.fee : 0,
    points: existing ? existing.points : (store.accountById(accountId)?.pointTrade ?? 15) + (store.accountById(accountId)?.pointHold ?? 0),
    note: existing ? (existing.note || '') : '',
    saving: false,
  };
}
function closeCellModal() {
  if (cellModal.value?.saving) return;
  cellModal.value = null;
}

async function saveCell() {
  if (!cellModal.value) return;
  cellModal.value.saving = true;
  try {
    await store.addFees([{
      date: cellModal.value.date,
      accountId: cellModal.value.accountId,
      fee: Number(cellModal.value.fee) || 0,
      points: Number(cellModal.value.points) || 0,
      note: cellModal.value.note || '',
    }]);
    toast.success(`Đã lưu ${cellModal.value.date} · ${accountName(cellModal.value.accountId)}`);
    cellModal.value = null;
  } catch (e) {
    toast.error('Lỗi: ' + e.message);
    cellModal.value.saving = false;
  }
}

function deleteCell() {
  if (!cellModal.value?.existing) return;
  const m = cellModal.value;
  dialog.warning({
    title: 'Xóa bản ghi',
    content: `Xóa bản ghi ${m.date} - ${accountName(m.accountId)}?`,
    positiveText: 'Xóa',
    negativeText: 'Hủy',
    onPositiveClick: async () => {
      m.saving = true;
      try {
        await store.deleteFee(m.existing.id);
        toast.success('Đã xóa');
        cellModal.value = null;
      } catch (e) {
        toast.error('Lỗi: ' + e.message);
        m.saving = false;
      }
    },
  });
}

// ===== Management actions =====
async function onArchive() {
  archiving.value = true;
  try {
    const res = await store.archivePastMonths();
    toast.success(`Đã tổng hợp ${res?.archived ?? 0} dòng FeesMonthly`);
  } catch (e) {
    toast.error('Lỗi archive: ' + e.message);
  } finally {
    archiving.value = false;
  }
}

function onClearOld() {
  let content = `Xóa ${pastDaily.value.deletable} bản ghi đã hết cửa sổ 15 ngày (không còn tính điểm)? Các row còn trong cửa sổ và tháng hiện tại được giữ lại.`;
  if (pendingMonths.value.length > 0) {
    content += ` Lưu ý: còn ${pendingMonths.value.length} tháng chưa archive — sau khi clear sẽ mất khỏi Dashboard.`;
  }
  dialog.warning({
    title: 'Xóa lịch sử cũ',
    content,
    positiveText: 'Xóa',
    negativeText: 'Hủy',
    onPositiveClick: async () => {
      clearing.value = true;
      try {
        const res = await store.clearOldDaily();
        toast.success(`Đã xóa ${res?.removed ?? 0} bản ghi cũ`);
      } catch (e) {
        toast.error('Lỗi clear: ' + e.message);
      } finally {
        clearing.value = false;
      }
    },
  });
}
</script>

<style scoped>
.card-title { font-weight: 600; }
.muted { color: #94a3b8; }
.strong { font-weight: 600; }
.fee { color: #e11d48; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0; vertical-align: middle; }
.head-toggle { display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; }
.chevron { transition: transform 0.2s; display: inline-block; }
.chevron.open { transform: rotate(180deg); }

.day-badge {
  display: grid; place-items: center; width: 36px; height: 36px; border-radius: 8px;
  background: #eff6ff; color: #2563eb; font-weight: 700; font-size: 13px; flex-shrink: 0;
}
.inner-table { width: 100%; font-size: 13px; }
.inner-row { cursor: pointer; }
.inner-row:hover { background: #eff6ff; }
.inner-row td { padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
.pts-chip { font-size: 11px; font-weight: 600; color: #64748b; background: #f1f5f9; border-radius: 4px; padding: 2px 6px; }

/* Pivot matrix */
.legend { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.legend--window { background: #dbeafe; border: 1px solid #93c5fd; }
.legend--today { background: #dcfce7; border: 1px solid #86efac; }
.matrix-wrap { overflow: auto; max-height: 70vh; border: 1px solid #e2e8f0; border-radius: 8px; }
.matrix { border-collapse: separate; border-spacing: 0; font-size: 13px; font-variant-numeric: tabular-nums; min-width: 100%; }
.matrix th, .matrix td { border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; padding: 6px 10px; white-space: nowrap; }
.sticky-top { position: sticky; top: 0; z-index: 20; background: #f1f5f9; height: 36px; font-weight: 600; }
.sticky-top2 { position: sticky; top: 36px; z-index: 20; background: #f8fafc; font-weight: 500; }
.sticky-col { position: sticky; left: 0; z-index: 10; }
.corner { z-index: 30; text-align: left; }
.acc-head { text-align: center; }
.total-head { text-align: right; }
.sub-head { text-align: right; color: #64748b; }
.sub-head--pts { color: #f43f5e; }
.date-cell { font-weight: 600; color: #334155; }
.num-cell { text-align: right; cursor: pointer; }
.num-cell:hover { background: rgba(37, 99, 235, 0.12); }
.pts-col { color: #64748b; }
.dash { color: #cbd5e1; }
.total-cell { text-align: right; font-weight: 700; }
.row-today { background: #f0fdf4; }
.row-window { background: #eff6ff; }
.date-today { background: #dcfce7; }
.date-window { background: #dbeafe; }
.matrix tbody tr:not(.row-today):not(.row-window) .date-cell { background: #fff; }
.readonly-box { background: #f1f5f9; border-radius: 6px; padding: 6px 10px; min-height: 34px; }
</style>
