<template>
  <div class="space-y-6">
    <!-- Management panel: archive + clear old -->
    <div class="card">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 class="font-semibold">Quản lý lịch sử phí</h3>
        <div class="flex items-center gap-2">
          <button
            class="btn-secondary"
            :disabled="archiving || !canArchive"
            @click="onArchive"
            :title="canArchive ? '' : 'Không có tháng cũ chưa tổng hợp'"
          >
            <span v-if="archiving" class="inline-block w-3 h-3 border-2 border-binance-yellow border-t-transparent rounded-full animate-spin mr-1"></span>
            Tổng hợp tháng cũ
            <span v-if="pendingMonths.length" class="text-binance-yellow ml-1">({{ pendingMonths.length }})</span>
          </button>
          <button
            class="btn-secondary text-red-600 hover:text-red-700"
            :disabled="clearing || !hasPastDaily"
            @click="onClearOld"
          >
            <span v-if="clearing" class="inline-block w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin mr-1"></span>
            Xóa lịch sử cũ
            <span v-if="hasPastDaily" class="text-gray-500 ml-1">({{ pastDaily.total }})</span>
          </button>
        </div>
      </div>

      <div
        class="px-3 py-2 rounded-lg border text-sm flex items-start gap-2"
        :class="indicatorClass"
      >
        <span class="text-lg leading-none">{{ indicatorIcon }}</span>
        <div class="flex-1">
          <div class="font-medium">{{ indicatorTitle }}</div>
          <div class="text-xs text-gray-500 mt-0.5">{{ indicatorDetail }}</div>
        </div>
      </div>
    </div>

    <!-- Phí tháng hiện tại -->
    <div class="card">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 class="font-semibold">
          Phí tháng <span class="text-amber-600">{{ store.currentMonth || '—' }}</span>
          <span class="text-gray-500 font-normal">
            ({{ filteredFees.length }} bản ghi · {{ groupedByDate.length }} ngày)
          </span>
        </h3>
        <div class="flex items-center gap-2 flex-wrap">
          <div class="inline-flex rounded-lg border border-binance-light overflow-hidden">
            <button
              v-for="v in viewModes"
              :key="v.key"
              class="px-3 py-1 text-sm transition-colors"
              :class="viewMode === v.key
                ? 'bg-binance-yellow text-black font-medium'
                : 'bg-transparent text-gray-500 hover:text-gray-700'"
              @click="viewMode = v.key"
            >
              {{ v.label }}
            </button>
          </div>
          <select v-model="filter.accountId" class="input w-40 py-1">
            <option value="">Tất cả tài khoản</option>
            <option v-for="a in store.accounts" :key="a.id" :value="a.id">
              {{ a.displayName }}
            </option>
          </select>
          <button class="btn-secondary" @click="store.loadAll()">↻</button>
        </div>
      </div>

      <div v-if="groupedByDate.length === 0" class="text-center py-8 text-gray-500">
        Chưa có bản ghi nào trong tháng này — dùng modal 🧮 (góc dưới phải) để nhập phí.
      </div>

      <!-- ===== View: Theo ngày (grouped) ===== -->
      <div v-else-if="viewMode === 'grouped'" class="overflow-x-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr class="table-thead">
              <th class="px-3 py-2 w-44">Ngày</th>
              <th class="px-3 py-2">Chi tiết tài khoản</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="group in groupedByDate"
              :key="group.date"
              class="group border-b border-slate-200 align-top hover:bg-blue-50/50 hover:shadow-[inset_3px_0_0_0_#2563eb] transition-all duration-150"
            >
              <!-- TD ngày -->
              <td class="px-3 py-3">
                <div class="flex items-center gap-2.5">
                  <span class="grid place-items-center w-9 h-9 rounded-lg bg-blue-50 text-blue-600 text-sm font-bold shrink-0">
                    {{ group.date.slice(0, 2) }}
                  </span>
                  <div class="leading-tight">
                    <div class="font-bold text-slate-800 text-sm">{{ group.date }}</div>
                    <div class="text-[11px] text-gray-500">{{ group.count }} tài khoản</div>
                  </div>
                </div>
                <div class="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-100">
                  <span class="text-[11px] text-rose-400 font-medium">Tổng</span>
                  <span class="text-sm font-bold text-rose-600 tabular-nums">{{ fmtUSD(group.totalFee) }}</span>
                </div>
              </td>

              <!-- TD chứa table nhỏ liệt kê từng account -->
              <td class="px-3 py-3">
                <table class="w-full text-sm">
                  <tbody>
                    <tr
                      v-for="f in group.entries"
                      :key="f.id"
                      class="cursor-pointer hover:bg-blue-100 rounded transition-colors border-b border-slate-100 last:border-0"
                      :title="f.note ? `${accountName(f.accountId)} · ${f.note}` : accountName(f.accountId)"
                      @click="openEdit(f.date, f.accountId)"
                    >
                      <td class="py-1.5 pr-2 w-1">
                        <span class="inline-block w-2.5 h-2.5 rounded-full align-middle" :style="{ background: accountColor(f.accountId) }"></span>
                      </td>
                      <td class="py-1.5 pr-3 font-semibold text-slate-700 whitespace-nowrap">
                        {{ accountName(f.accountId) }}
                        <span v-if="f.note" class="text-[11px]">📝</span>
                      </td>
                      <td class="py-1.5 pr-4 text-right font-bold text-rose-600 tabular-nums whitespace-nowrap">
                        {{ fmtUSD(f.fee) }}
                      </td>
                      <td class="py-1.5 text-right tabular-nums whitespace-nowrap">
                        <span class="text-[11px] font-semibold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{{ f.points }}đ</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ===== View: Bảng lịch sử (pivot) ===== -->
      <div v-else class="space-y-2">
        <div class="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
          <span class="flex items-center gap-1.5">
            <span class="inline-block w-3 h-3 rounded-sm bg-blue-100 border border-blue-300"></span>
            15 ngày gần nhất (đang tính cho phần Điểm)
          </span>
          <span class="flex items-center gap-1.5">
            <span class="inline-block w-3 h-3 rounded-sm bg-green-100 border border-green-300"></span>
            Hôm nay
          </span>
        </div>
        <div class="overflow-auto max-h-[70vh] border border-slate-200 rounded-lg">
          <table class="min-w-full border-separate border-spacing-0 text-sm tabular-nums">
            <thead>
              <tr>
                <th
                  rowspan="2"
                  class="sticky top-0 left-0 z-30 bg-slate-100 h-9 px-3 text-left font-semibold border-b border-r border-slate-300 w-28"
                >
                  Ngày
                </th>
                <th
                  v-for="a in matrixAccounts"
                  :key="a.id"
                  colspan="2"
                  class="sticky top-0 z-20 bg-slate-100 h-9 px-3 text-center font-semibold border-b border-r border-slate-300 whitespace-nowrap"
                >
                  <span class="inline-block w-2 h-2 rounded-full mr-1.5" :style="{ background: accountColor(a.id) }"></span>
                  {{ a.displayName }}
                </th>
                <th
                  rowspan="2"
                  class="sticky top-0 z-20 bg-slate-100 h-9 px-3 text-right font-semibold border-b border-slate-300 whitespace-nowrap"
                >
                  Tổng phí
                </th>
              </tr>
              <tr>
                <template v-for="a in matrixAccounts" :key="'sub-' + a.id">
                  <th class="sticky top-9 z-20 bg-slate-50 px-2 py-1 text-right font-medium text-gray-500 border-b border-slate-300">Phí</th>
                  <th class="sticky top-9 z-20 bg-slate-50 px-2 py-1 text-right font-medium text-rose-500 border-b border-r border-slate-300">Điểm</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in matrixRows"
                :key="row.date"
                :class="rowBg(row)"
              >
                <td
                  class="sticky left-0 z-10 px-3 py-1.5 font-semibold text-slate-700 border-b border-r border-slate-200 whitespace-nowrap"
                  :class="dateBg(row)"
                >
                  {{ row.date }}
                </td>
                <template v-for="a in matrixAccounts" :key="row.date + '-' + a.id">
                  <td
                    class="px-2 py-1.5 text-right border-b border-slate-200 cursor-pointer hover:bg-blue-200/60 transition-colors"
                    @click="openEdit(row.date, a.id)"
                  >
                    <span v-if="row.cells[a.id]" class="font-semibold text-rose-600">{{ fmtUSD(row.cells[a.id].fee) }}</span>
                    <span v-else class="text-gray-300">–</span>
                  </td>
                  <td
                    class="px-2 py-1.5 text-right border-b border-r border-slate-200 cursor-pointer hover:bg-blue-200/60 transition-colors"
                    @click="openEdit(row.date, a.id)"
                  >
                    <span v-if="row.cells[a.id]" class="font-medium text-slate-500">{{ row.cells[a.id].points }}</span>
                    <span v-else class="text-gray-300">–</span>
                  </td>
                </template>
                <td class="px-3 py-1.5 text-right font-bold text-rose-600 border-b border-slate-200 whitespace-nowrap">
                  {{ fmtUSD(row.totalFee) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p v-if="groupedByDate.length > 0" class="text-xs text-gray-500 mt-3">
        Chỉ hiển thị daily của tháng hiện tại. Phí các tháng cũ — bấm
        <b class="text-gray-700">Tổng hợp tháng cũ</b> để gộp vào sheet
        <code class="text-gray-500">FeesMonthly</code>; Dashboard sẽ đọc aggregate này.
      </p>
    </div>

    <!-- ===== Edit modal (matrix cell) ===== -->
    <Teleport to="body">
      <div
        v-if="cellModal"
        class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        @click.self="closeCellModal"
      >
        <div class="bg-binance-gray border border-binance-light rounded-2xl shadow-xl w-full max-w-md">
          <div class="px-5 py-3 border-b border-binance-light flex items-center justify-between">
            <h3 class="font-semibold">
              {{ cellModal.existing ? 'Sửa phí' : 'Thêm phí' }}
            </h3>
            <button class="text-gray-500 hover:text-gray-800 text-xl leading-none" @click="closeCellModal">✕</button>
          </div>
          <div class="p-5 space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">Ngày</label>
                <div class="input bg-binance-dark/60 text-gray-700">{{ cellModal.date }}</div>
              </div>
              <div>
                <label class="label">Tài khoản</label>
                <div class="input bg-binance-dark/60 text-gray-700 flex items-center gap-2">
                  <span class="inline-block w-2 h-2 rounded-full" :style="{ background: accountColor(cellModal.accountId) }"></span>
                  {{ accountName(cellModal.accountId) }}
                </div>
              </div>
              <div>
                <label class="label">Phí ($)</label>
                <input v-model.number="cellModal.fee" type="number" step="0.01" class="input text-right" autofocus />
              </div>
              <div>
                <label class="label">Điểm</label>
                <input v-model.number="cellModal.points" type="number" class="input text-right" />
              </div>
            </div>
            <div>
              <label class="label">Ghi chú</label>
              <input v-model="cellModal.note" type="text" class="input" placeholder="Không bắt buộc" />
            </div>
          </div>
          <div class="px-5 py-3 border-t border-binance-light flex items-center justify-between">
            <button
              v-if="cellModal.existing"
              class="text-red-600 hover:text-red-700 text-sm"
              :disabled="cellModal.saving"
              @click="deleteCell"
            >
              Xóa bản ghi
            </button>
            <span v-else></span>
            <div class="flex gap-2">
              <button class="btn-secondary" :disabled="cellModal.saving" @click="closeCellModal">Hủy</button>
              <button class="btn-primary" :disabled="cellModal.saving" @click="saveCell">
                <span v-if="cellModal.saving" class="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1"></span>
                Lưu
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { reactive, computed, ref, watch } from 'vue';
import { useTrackingStore } from '../stores/trackingStore';
import { useToastStore } from '../stores/toastStore';
import { fmtUSD, parseDate, todayStr } from '../utils/format';

const store = useTrackingStore();
const toast = useToastStore();

const filter = reactive({ accountId: '' });

const viewModes = [
  { key: 'table', label: 'Bảng lịch sử' },
  { key: 'grouped', label: 'Theo ngày' },
];
const VIEW_KEY = 'alpha:feesViewMode';
const viewMode = ref(
  viewModes.some((v) => v.key === localStorage.getItem(VIEW_KEY))
    ? localStorage.getItem(VIEW_KEY)
    : 'grouped'
);
watch(viewMode, (v) => localStorage.setItem(VIEW_KEY, v));

const archiving = ref(false);
const clearing = ref(false);

const filteredFees = computed(() => {
  let list = [...store.fees];
  if (filter.accountId) list = list.filter((f) => f.accountId === filter.accountId);
  return list;
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
// Tài khoản hiển thị làm cột (chỉ những account có dữ liệu), theo thứ tự sortOrder.
const matrixAccounts = computed(() => {
  const ids = new Set();
  filteredFees.value.forEach((f) => ids.add(f.accountId));
  return [...ids]
    .map((id) => store.accountById(id) || { id, displayName: id, color: '#3b82f6' })
    .sort((a, b) => store.accountOrderIndex(a.id) - store.accountOrderIndex(b.id));
});

// Một dòng = một ngày (mới nhất trên cùng). inWindow = tradeDate + 15 >= today,
// khớp logic computePoints ở Code.gs (cửa sổ 15 ngày dùng tính điểm).
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

// Màu nền: hôm nay (xanh lá) ưu tiên hơn cửa sổ 15 ngày (xanh dương).
// Cột ngày freeze cần nền đặc (không trong suốt) để che nội dung cuộn bên dưới.
function rowBg(row) {
  if (row.isToday) return 'bg-green-50';
  if (row.inWindow) return 'bg-blue-50';
  return 'bg-white';
}
function dateBg(row) {
  if (row.isToday) return 'bg-green-100';
  if (row.inWindow) return 'bg-blue-100';
  return 'bg-white';
}

// ===== Past-daily indicator =====
const pastDaily = computed(() => store.pastDaily || { total: 0, active: 0, safeToDelete: false, pendingArchiveMonths: [] });
const hasPastDaily = computed(() => pastDaily.value.total > 0);
const pendingMonths = computed(() => pastDaily.value.pendingArchiveMonths || []);
const canArchive = computed(() => pendingMonths.value.length > 0);

const indicatorIcon = computed(() => {
  if (!hasPastDaily.value) return 'ℹ';
  if (pastDaily.value.safeToDelete) return '✓';
  return '⚠';
});
const indicatorTitle = computed(() => {
  if (!hasPastDaily.value) return 'Không có dữ liệu cũ';
  if (pastDaily.value.safeToDelete) return `Có thể xóa ${pastDaily.value.total} bản ghi cũ`;
  return `Còn ${pastDaily.value.active}/${pastDaily.value.total} bản ghi tháng cũ đang tính điểm Alpha`;
});
const indicatorDetail = computed(() => {
  if (!hasPastDaily.value) return 'Sheet Fees chỉ chứa tháng hiện tại.';
  if (pastDaily.value.safeToDelete) {
    const arch = pendingMonths.value.length;
    if (arch > 0) return `Nên bấm "Tổng hợp tháng cũ" trước (còn ${arch} tháng chưa archive) — sau khi clear, Dashboard sẽ chỉ thấy aggregate.`;
    return 'Đã hết hạn 15 ngày — xóa sẽ không ảnh hưởng tab Điểm.';
  }
  const safe = pastDaily.value.earliestSafeDate;
  return safe
    ? `Tất cả sẽ hết hiệu lực vào ${safe}. Xóa sớm hơn sẽ làm sai số điểm hiện tại.`
    : 'Vẫn còn bản ghi trong cửa sổ 15 ngày — chưa nên xóa.';
});
const indicatorClass = computed(() => {
  if (!hasPastDaily.value) return 'bg-slate-100 border-binance-light text-gray-600';
  if (pastDaily.value.safeToDelete) return 'bg-green-50 border-green-300 text-green-700';
  return 'bg-amber-50 border-amber-300 text-amber-700';
});

// ===== Helpers =====
function accountName(id) { return store.accountById(id)?.displayName || id; }
function accountColor(id) { return store.accountById(id)?.color || '#3b82f6'; }

// ===== Cell/chip edit (modal) — dùng chung cho cả matrix và grouped view =====
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
    // store.addFees → server bulkCreateFees → upsert theo (date, accountId)
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

async function deleteCell() {
  if (!cellModal.value?.existing) return;
  if (!confirm(`Xóa bản ghi ${cellModal.value.date} - ${accountName(cellModal.value.accountId)}?`)) return;
  cellModal.value.saving = true;
  try {
    await store.deleteFee(cellModal.value.existing.id);
    toast.success('Đã xóa');
    cellModal.value = null;
  } catch (e) {
    toast.error('Lỗi: ' + e.message);
    cellModal.value.saving = false;
  }
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

async function onClearOld() {
  const warn = pastDaily.value.safeToDelete
    ? `Xóa ${pastDaily.value.total} bản ghi tháng cũ khỏi sheet Fees?`
    : `CẢNH BÁO: còn ${pastDaily.value.active} bản ghi đang tính điểm Alpha — xóa bây giờ sẽ làm sai tab Điểm. Vẫn xóa?`;
  if (!confirm(warn)) return;
  if (pendingMonths.value.length > 0) {
    if (!confirm(`Còn ${pendingMonths.value.length} tháng chưa archive — sau khi clear sẽ mất khỏi Dashboard. Tiếp tục?`)) return;
  }
  clearing.value = true;
  try {
    const res = await store.clearOldDaily();
    toast.success(`Đã xóa ${res?.removed ?? 0} bản ghi cũ`);
  } catch (e) {
    toast.error('Lỗi clear: ' + e.message);
  } finally {
    clearing.value = false;
  }
}
</script>
