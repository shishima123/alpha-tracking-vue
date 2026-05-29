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

      <!-- Safe-to-clear indicator -->
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
            ({{ filteredFees.length }} bản ghi · {{ groupedByDate.length }} ngày)
          </span>
        </h3>
        <div class="flex items-center gap-2">
          <select v-model="filter.accountId" class="input w-40">
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

      <div v-else class="space-y-3">
        <div
          v-for="group in groupedByDate"
          :key="group.date"
          class="border border-binance-light rounded-xl overflow-hidden"
        >
          <!-- Date header -->
          <div class="flex items-center justify-between px-4 py-2 bg-binance-light/40">
            <div class="flex items-center gap-3">
              <span class="text-binance-yellow font-semibold">{{ group.date }}</span>
              <span class="text-xs text-gray-400">{{ group.count }} tài khoản</span>
            </div>
            <div class="flex items-center gap-4 text-xs">
              <span class="text-gray-400">
                Tổng phí:
                <span class="text-red-400 font-semibold">{{ fmtUSD(group.totalFee) }}</span>
              </span>
              <span class="text-gray-400">
                Tổng điểm:
                <span class="text-binance-yellow font-semibold">{{ group.totalPoints }}</span>
              </span>
            </div>
          </div>

          <!-- Per-account rows -->
          <table class="w-full text-sm">
            <tbody>
              <template v-for="f in group.entries" :key="f.id">
                <tr v-if="editingId !== f.id" class="hover:bg-binance-light/30 border-t border-binance-light/40">
                  <td class="px-4 py-2 w-1/3">
                    <span
                      class="inline-block w-2 h-2 rounded-full mr-2"
                      :style="{ background: accountColor(f.accountId) }"
                    ></span>
                    {{ accountName(f.accountId) }}
                  </td>
                  <td class="px-4 py-2 text-right text-red-400 w-24">{{ fmtUSD(f.fee) }}</td>
                  <td class="px-4 py-2 text-right w-16">{{ f.points }}đ</td>
                  <td class="px-4 py-2 text-gray-500 text-xs">{{ f.note }}</td>
                  <td class="px-4 py-2 text-right space-x-2 w-32">
                    <button
                      class="text-binance-yellow hover:text-yellow-300 text-xs"
                      @click="startEdit(f)"
                    >
                      Sửa
                    </button>
                    <button
                      class="text-red-400 hover:text-red-300 text-xs"
                      @click="del(f)"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
                <tr v-else class="bg-binance-light/30 border-t border-binance-light/40">
                  <td class="px-4 py-2">
                    <span
                      class="inline-block w-2 h-2 rounded-full mr-2"
                      :style="{ background: accountColor(f.accountId) }"
                    ></span>
                    {{ accountName(f.accountId) }}
                    <input
                      v-model="editDateIso"
                      type="date"
                      class="input py-1 mt-1 text-xs"
                    />
                  </td>
                  <td class="px-4 py-2 text-right">
                    <input
                      v-model.number="editForm.fee"
                      type="number"
                      step="0.01"
                      class="input text-right py-1"
                    />
                  </td>
                  <td class="px-4 py-2 text-right">
                    <input
                      v-model.number="editForm.points"
                      type="number"
                      class="input text-right py-1"
                    />
                  </td>
                  <td class="px-4 py-2">
                    <input
                      v-model="editForm.note"
                      type="text"
                      class="input py-1"
                      placeholder="Ghi chú"
                    />
                  </td>
                  <td class="px-4 py-2 text-right space-x-2">
                    <button
                      class="text-green-400 hover:text-green-300 text-xs"
                      :disabled="savingEdit"
                      @click="saveEdit"
                    >
                      {{ savingEdit ? '...' : 'Lưu' }}
                    </button>
                    <button
                      class="text-gray-400 hover:text-gray-300 text-xs"
                      :disabled="savingEdit"
                      @click="cancelEdit"
                    >
                      Hủy
                    </button>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <p class="text-xs text-gray-500 mt-3">
        Chỉ hiển thị daily của tháng hiện tại. Phí các tháng cũ — bấm
        <b class="text-gray-300">Tổng hợp tháng cũ</b> để gộp vào sheet
        <code class="text-gray-400">FeesMonthly</code>; Dashboard sẽ đọc aggregate này.
      </p>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, ref } from 'vue';
import { useTrackingStore } from '../stores/trackingStore';
import { useToastStore } from '../stores/toastStore';
import { fmtUSD, isoToDmy, dmyToIso, parseDate } from '../utils/format';

const store = useTrackingStore();
const toast = useToastStore();

const filter = reactive({ accountId: '' });

const editingId = ref(null);
const editForm = reactive({ date: '', fee: 0, points: 0, note: '' });
const savingEdit = ref(false);
const archiving = ref(false);
const clearing = ref(false);

const editDateIso = computed({
  get: () => dmyToIso(editForm.date),
  set: (v) => { editForm.date = isoToDmy(v) || editForm.date; },
});

const filteredFees = computed(() => {
  let list = [...store.fees];
  if (filter.accountId)
    list = list.filter((f) => f.accountId === filter.accountId);
  return list;
});

const groupedByDate = computed(() => {
  const groups = {};
  filteredFees.value.forEach((f) => {
    if (!groups[f.date]) groups[f.date] = [];
    groups[f.date].push(f);
  });
  return Object.keys(groups)
    .sort((a, b) => {
      const da = parseDate(a)?.getTime() || 0;
      const db = parseDate(b)?.getTime() || 0;
      return db - da;
    })
    .map((date) => {
      const entries = groups[date].slice().sort((a, b) =>
        accountName(a.accountId).localeCompare(accountName(b.accountId))
      );
      return {
        date,
        entries,
        count: entries.length,
        totalFee: entries.reduce((s, f) => s + (Number(f.fee) || 0), 0),
        totalPoints: entries.reduce((s, f) => s + (Number(f.points) || 0), 0),
      };
    });
});

// ===== Past-daily status / management =====
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

function accountName(id) {
  return store.accountById(id)?.displayName || id;
}
function accountColor(id) {
  return store.accountById(id)?.color || '#3b82f6';
}

function startEdit(f) {
  editingId.value = f.id;
  editForm.date = f.date;
  editForm.fee = f.fee;
  editForm.points = f.points;
  editForm.note = f.note || '';
}

function cancelEdit() {
  editingId.value = null;
}

async function saveEdit() {
  savingEdit.value = true;
  try {
    await store.updateFee(editingId.value, {
      date: editForm.date,
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
