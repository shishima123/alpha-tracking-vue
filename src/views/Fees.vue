<template>
  <div class="space-y-6">
    <!-- Phí tháng hiện tại -->
    <div class="card overflow-x-auto">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 class="font-semibold">
          Phí tháng <span class="text-binance-yellow">{{ store.currentMonth || '—' }}</span>
          <span class="text-gray-500 font-normal">({{ filteredFees.length }} bản ghi)</span>
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

      <table class="w-full text-sm">
        <thead>
          <tr class="table-thead">
            <th class="px-3 py-2">Ngày</th>
            <th class="px-3 py-2">Tài khoản</th>
            <th class="px-3 py-2 text-right">Phí ($)</th>
            <th class="px-3 py-2 text-right">Điểm</th>
            <th class="px-3 py-2">Ghi chú</th>
            <th class="px-3 py-2 w-32 text-right"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="f in filteredFees" :key="f.id">
            <tr v-if="editingId !== f.id" class="hover:bg-binance-light/30">
              <td class="table-td">{{ f.date }}</td>
              <td class="table-td">
                <span
                  class="inline-block w-2 h-2 rounded-full mr-2"
                  :style="{ background: accountColor(f.accountId) }"
                ></span>
                {{ accountName(f.accountId) }}
              </td>
              <td class="table-td text-right text-red-400">{{ fmtUSD(f.fee) }}</td>
              <td class="table-td text-right">{{ f.points }}</td>
              <td class="table-td text-gray-500">{{ f.note }}</td>
              <td class="table-td text-right space-x-2">
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
            <tr v-else class="bg-binance-light/30">
              <td class="table-td">
                <input
                  v-model="editDateIso"
                  type="date"
                  class="input py-1"
                />
              </td>
              <td class="table-td">
                <span
                  class="inline-block w-2 h-2 rounded-full mr-2"
                  :style="{ background: accountColor(f.accountId) }"
                ></span>
                {{ accountName(f.accountId) }}
              </td>
              <td class="table-td text-right">
                <input
                  v-model.number="editForm.fee"
                  type="number"
                  step="0.01"
                  class="input text-right py-1"
                />
              </td>
              <td class="table-td text-right">
                <input
                  v-model.number="editForm.points"
                  type="number"
                  class="input text-right py-1"
                />
              </td>
              <td class="table-td">
                <input
                  v-model="editForm.note"
                  type="text"
                  class="input py-1"
                  placeholder="Ghi chú"
                />
              </td>
              <td class="table-td text-right space-x-2">
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
          <tr v-if="filteredFees.length === 0">
            <td colspan="6" class="text-center py-6 text-gray-500">
              Chưa có bản ghi nào trong tháng này — dùng modal 🧮 (góc dưới phải) để nhập phí.
            </td>
          </tr>
        </tbody>
      </table>

      <p class="text-xs text-gray-500 mt-3">
        Chỉ hiển thị daily của tháng hiện tại. Phí các tháng cũ đã được tổng hợp,
        xem ở tab Dashboard.
      </p>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, ref } from 'vue';
import { useTrackingStore } from '../stores/trackingStore';
import { useToastStore } from '../stores/toastStore';
import { fmtUSD, isoToDmy, dmyToIso } from '../utils/format';

const store = useTrackingStore();
const toast = useToastStore();

const filter = reactive({ accountId: '' });

const editingId = ref(null);
const editForm = reactive({ date: '', fee: 0, points: 0, note: '' });
const savingEdit = ref(false);

const editDateIso = computed({
  get: () => dmyToIso(editForm.date),
  set: (v) => { editForm.date = isoToDmy(v) || editForm.date; },
});

const filteredFees = computed(() => {
  let list = [...store.fees];
  if (filter.accountId)
    list = list.filter((f) => f.accountId === filter.accountId);
  return list.sort((a, b) => (a.date < b.date ? 1 : -1));
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
</script>
