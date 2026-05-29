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
            class="btn-secondary text-red-300 hover:text-red-200"
            :disabled="clearing || !hasPastDaily"
            @click="onClearOld"
          >
            <span v-if="clearing" class="inline-block w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin mr-1"></span>
            Xóa lịch sử cũ
            <span v-if="hasPastDaily" class="text-gray-400 ml-1">({{ pastDaily.total }})</span>
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
          <div class="text-xs text-gray-400 mt-0.5">{{ indicatorDetail }}</div>
        </div>
      </div>
    </div>

    <!-- Phí tháng hiện tại -->
    <div class="card">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 class="font-semibold">
          Phí tháng <span class="text-binance-yellow">{{ store.currentMonth || '—' }}</span>
          <span class="text-gray-500 font-normal">
            ({{ filteredFees.length }} bản ghi · {{ matrixDays.length }} ngày)
          </span>
        </h3>
        <div class="flex items-center gap-2 flex-wrap">
          <div class="flex border border-binance-light rounded-md text-xs overflow-hidden">
            <button
              class="px-3 py-1.5 transition"
              :class="viewMode === 'matrix' ? 'bg-binance-light text-binance-yellow' : 'text-gray-400 hover:text-gray-200'"
              @click="viewMode = 'matrix'"
            >
              Ma trận
            </button>
            <button
              class="px-3 py-1.5 transition"
              :class="viewMode === 'grouped' ? 'bg-binance-light text-binance-yellow' : 'text-gray-400 hover:text-gray-200'"
              @click="viewMode = 'grouped'"
            >
              Theo ngày
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

      <div v-if="matrixDays.length === 0" class="text-center py-8 text-gray-500">
        Chưa có bản ghi nào trong tháng này — dùng modal 🧮 (góc dưới phải) để nhập phí.
      </div>

      <!-- ===== Matrix view ===== -->
      <div v-else-if="viewMode === 'matrix'" class="overflow-x-auto -mx-4">
        <table class="text-xs border-collapse min-w-full">
          <thead>
            <tr class="bg-binance-light/40">
              <th class="sticky left-0 z-10 bg-binance-light/40 px-3 py-2 text-left font-medium min-w-[140px] border-b border-binance-light">
                Tài khoản
              </th>
              <th
                v-for="d in matrixDays"
                :key="d"
                class="px-2 py-2 text-right font-normal text-gray-300 border-b border-binance-light whitespace-nowrap min-w-[58px]"
              >
                {{ d.slice(0, 5) }}
              </th>
              <th class="sticky right-0 z-10 bg-binance-light/40 px-3 py-2 text-right font-semibold min-w-[80px] border-b border-binance-light text-binance-yellow">
                Tổng
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="acc in matrixAccounts"
              :key="acc.id"
              class="group hover:bg-binance-light/20"
            >
              <td class="sticky left-0 z-10 bg-binance-gray group-hover:bg-binance-light/40 px-3 py-1.5 border-b border-binance-light/30 whitespace-nowrap">
                <span class="inline-block w-2 h-2 rounded-full mr-2" :style="{ background: acc.color }"></span>
                {{ acc.displayName }}
              </td>
              <td
                v-for="d in matrixDays"
                :key="d"
                class="px-2 py-1.5 text-right border-b border-binance-light/30 cursor-pointer hover:bg-binance-yellow/10 transition-colors"
                @click="openEdit(d, acc.id)"
              >
                <span v-if="cellAt(d, acc.id)" class="text-red-400">
                  {{ fmtUSD(cellAt(d, acc.id).fee) }}
                </span>
                <span v-else class="text-gray-700">·</span>
              </td>
              <td class="sticky right-0 z-10 bg-binance-gray group-hover:bg-binance-light/40 px-3 py-1.5 text-right text-binance-yellow font-semibold border-b border-binance-light/30">
                {{ fmtUSD(accountTotals[acc.id] || 0) }}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="bg-binance-light/30">
              <td class="sticky left-0 z-10 bg-binance-light/30 px-3 py-2 font-semibold border-t-2 border-binance-light">
                Tổng / ngày
              </td>
              <td
                v-for="d in matrixDays"
                :key="d"
                class="px-2 py-2 text-right text-red-300 font-semibold whitespace-nowrap border-t-2 border-binance-light"
              >
                {{ fmtUSD(dayTotals[d] || 0) }}
              </td>
              <td class="sticky right-0 z-10 bg-binance-light/30 px-3 py-2 text-right text-binance-yellow font-bold border-t-2 border-binance-light">
                {{ fmtUSD(grandTotal) }}
              </td>
            </tr>
          </tfoot>
        </table>
        <p class="text-xs text-gray-500 mt-3 px-4">
          Click vào ô bất kỳ để sửa/xóa. Ô <code class="text-gray-400">·</code> = chưa có dữ liệu cho (ngày, tài khoản) đó.
        </p>
      </div>

      <!-- ===== Grouped view ===== -->
      <div v-else class="space-y-3">
        <div
          v-for="group in groupedByDate"
          :key="group.date"
          class="border border-binance-light rounded-xl overflow-hidden"
        >
          <div class="flex items-center justify-between px-4 py-2 bg-binance-light/40">
            <div class="flex items-center gap-3">
              <span class="text-binance-yellow font-semibold">{{ group.date }}</span>
              <span class="text-xs text-gray-400">{{ group.count }} tài khoản</span>
            </div>
            <div class="text-xs text-gray-400">
              Tổng phí:
              <span class="text-red-400 font-semibold">{{ fmtUSD(group.totalFee) }}</span>
            </div>
          </div>

          <table class="w-full text-sm">
            <colgroup>
              <col style="width: 32%" />
              <col style="width: 14%" />
              <col style="width: 10%" />
              <col />
              <col style="width: 130px" />
            </colgroup>
            <tbody>
              <template v-for="f in group.entries" :key="f.id">
                <tr v-if="editingId !== f.id" class="hover:bg-binance-light/30 border-t border-binance-light/40">
                  <td class="px-4 py-2">
                    <span class="inline-block w-2 h-2 rounded-full mr-2" :style="{ background: accountColor(f.accountId) }"></span>
                    {{ accountName(f.accountId) }}
                  </td>
                  <td class="px-4 py-2 text-right text-red-400">{{ fmtUSD(f.fee) }}</td>
                  <td class="px-4 py-2 text-right">{{ f.points }}đ</td>
                  <td class="px-4 py-2 text-gray-500 text-xs">{{ f.note }}</td>
                  <td class="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                    <button class="text-binance-yellow hover:text-yellow-300 text-xs" @click="startEdit(f)">Sửa</button>
                    <button class="text-red-400 hover:text-red-300 text-xs" @click="del(f)">Xóa</button>
                  </td>
                </tr>
                <tr v-else class="bg-binance-light/30 border-t border-binance-light/40">
                  <td class="px-4 py-2">
                    <span class="inline-block w-2 h-2 rounded-full mr-2" :style="{ background: accountColor(f.accountId) }"></span>
                    {{ accountName(f.accountId) }}
                  </td>
                  <td class="px-4 py-2 text-right">
                    <input v-model.number="editForm.fee" type="number" step="0.01" class="input py-1 px-2 text-right w-full" />
                  </td>
                  <td class="px-4 py-2 text-right">
                    <input v-model.number="editForm.points" type="number" class="input py-1 px-2 text-right w-full" />
                  </td>
                  <td class="px-4 py-2">
                    <input v-model="editForm.note" type="text" class="input py-1 px-2 w-full" placeholder="Ghi chú" />
                  </td>
                  <td class="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                    <button class="text-green-400 hover:text-green-300 text-xs" :disabled="savingEdit" @click="saveEdit">
                      {{ savingEdit ? '...' : 'Lưu' }}
                    </button>
                    <button class="text-gray-400 hover:text-gray-300 text-xs" :disabled="savingEdit" @click="cancelEdit">
                      Hủy
                    </button>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <p v-if="matrixDays.length > 0" class="text-xs text-gray-500 mt-3">
        Chỉ hiển thị daily của tháng hiện tại. Phí các tháng cũ — bấm
        <b class="text-gray-300">Tổng hợp tháng cũ</b> để gộp vào sheet
        <code class="text-gray-400">FeesMonthly</code>; Dashboard sẽ đọc aggregate này.
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
            <button class="text-gray-400 hover:text-gray-100 text-xl leading-none" @click="closeCellModal">✕</button>
          </div>
          <div class="p-5 space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">Ngày</label>
                <div class="input bg-binance-dark/60 text-gray-300">{{ cellModal.date }}</div>
              </div>
              <div>
                <label class="label">Tài khoản</label>
                <div class="input bg-binance-dark/60 text-gray-300 flex items-center gap-2">
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
              class="text-red-400 hover:text-red-300 text-sm"
              :disabled="cellModal.saving"
              @click="deleteCell"
            >
              Xóa bản ghi
            </button>
            <span v-else></span>
            <div class="flex gap-2">
              <button class="btn-secondary" :disabled="cellModal.saving" @click="closeCellModal">Hủy</button>
              <button class="btn-primary" :disabled="cellModal.saving" @click="saveCell">
                <span v-if="cellModal.saving" class="inline-block w-3 h-3 border-2 border-binance-dark border-t-transparent rounded-full animate-spin mr-1"></span>
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
import { fmtUSD, parseDate } from '../utils/format';

const store = useTrackingStore();
const toast = useToastStore();

const VIEW_MODE_KEY = 'fees:viewMode';
const savedMode = (() => {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    return v === 'grouped' || v === 'matrix' ? v : 'matrix';
  } catch (_) { return 'matrix'; }
})();
const viewMode = ref(savedMode);
watch(viewMode, (v) => {
  try { localStorage.setItem(VIEW_MODE_KEY, v); } catch (_) {}
});
const filter = reactive({ accountId: '' });

const editingId = ref(null);
const editForm = reactive({ fee: 0, points: 0, note: '' });
const savingEdit = ref(false);
const archiving = ref(false);
const clearing = ref(false);

const filteredFees = computed(() => {
  let list = [...store.fees];
  if (filter.accountId) list = list.filter((f) => f.accountId === filter.accountId);
  return list;
});

// ===== Matrix data =====
const matrixDays = computed(() => {
  const set = new Set(filteredFees.value.map((f) => f.date));
  return [...set].sort((a, b) => (parseDate(b)?.getTime() || 0) - (parseDate(a)?.getTime() || 0));
});

const matrixAccounts = computed(() => {
  if (filter.accountId) {
    const a = store.accountById(filter.accountId);
    return a ? [a] : [];
  }
  const idsWithFees = new Set(filteredFees.value.map((f) => f.accountId));
  return store.accounts.filter((a) => a.active || idsWithFees.has(a.id));
});

const cellMap = computed(() => {
  const m = {};
  filteredFees.value.forEach((f) => { m[f.date + '|' + f.accountId] = f; });
  return m;
});
function cellAt(date, accountId) {
  return cellMap.value[date + '|' + accountId] || null;
}

const dayTotals = computed(() => {
  const m = {};
  filteredFees.value.forEach((f) => { m[f.date] = (m[f.date] || 0) + (Number(f.fee) || 0); });
  return m;
});

const accountTotals = computed(() => {
  const m = {};
  filteredFees.value.forEach((f) => { m[f.accountId] = (m[f.accountId] || 0) + (Number(f.fee) || 0); });
  return m;
});

const grandTotal = computed(() =>
  filteredFees.value.reduce((s, f) => s + (Number(f.fee) || 0), 0)
);

// ===== Grouped data =====
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
  if (!hasPastDaily.value) return 'bg-binance-light/20 border-binance-light text-gray-300';
  if (pastDaily.value.safeToDelete) return 'bg-green-900/30 border-green-700 text-green-200';
  return 'bg-yellow-900/20 border-yellow-700 text-yellow-200';
});

// ===== Helpers =====
function accountName(id) { return store.accountById(id)?.displayName || id; }
function accountColor(id) { return store.accountById(id)?.color || '#3b82f6'; }

// ===== Inline edit (grouped view) — chỉ sửa fee/points/note, KHÔNG đổi date =====
function startEdit(f) {
  editingId.value = f.id;
  editForm.fee = f.fee;
  editForm.points = f.points;
  editForm.note = f.note || '';
}
function cancelEdit() { editingId.value = null; }

async function saveEdit() {
  savingEdit.value = true;
  try {
    await store.updateFee(editingId.value, {
      fee: Number(editForm.fee) || 0,
      points: Number(editForm.points) || 0,
      note: editForm.note || '',
    });
    toast.success('Đã cập nhật phí');
    editingId.value = null;
  } catch (e) {
    toast.error('Lỗi: ' + e.message);
  } finally {
    savingEdit.value = false;
  }
}

async function del(f) {
  if (!confirm(`Xóa bản ghi ${f.date} - ${accountName(f.accountId)}?`)) return;
  try {
    await store.deleteFee(f.id);
    toast.success('Đã xóa bản ghi phí');
  } catch (e) {
    toast.error('Lỗi: ' + e.message);
  }
}

// ===== Matrix cell edit (modal) =====
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
