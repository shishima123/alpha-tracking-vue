<template>
  <div class="space-y-6">
    <!-- Form nhập phí cho nhiều account 1 ngày -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold">Nhập phí hàng ngày</h3>
        <input
          v-model="form.date"
          type="text"
          placeholder="dd/MM/yyyy"
          class="input w-40"
        />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="acc in store.activeAccounts"
          :key="acc.id"
          class="border border-binance-light rounded-lg p-3"
        >
          <div class="flex items-center gap-2 mb-2">
            <span
              class="inline-block w-3 h-3 rounded-full"
              :style="{ background: acc.color }"
            ></span>
            <span class="font-medium text-sm">{{ acc.displayName }}</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label">Phí ($)</label>
              <input
                v-model.number="form.entries[acc.id].fee"
                type="number"
                step="0.01"
                class="input"
                placeholder="0.00"
              />
            </div>
            <div>
              <label class="label">Điểm</label>
              <input
                v-model.number="form.entries[acc.id].points"
                type="number"
                class="input"
                placeholder="0"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 mt-4">
        <button class="btn-secondary" @click="resetForm">Reset</button>
        <button class="btn-primary" @click="submit" :disabled="saving">
          {{ saving ? 'Đang lưu...' : 'Lưu phí ngày ' + form.date }}
        </button>
      </div>
    </div>

    <!-- Lịch sử phí -->
    <div class="card overflow-x-auto">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold">Lịch sử phí ({{ store.fees.length }} bản ghi)</h3>
        <div class="flex items-center gap-2">
          <select v-model="filter.accountId" class="input w-40">
            <option value="">Tất cả tài khoản</option>
            <option v-for="a in store.accounts" :key="a.id" :value="a.id">
              {{ a.displayName }}
            </option>
          </select>
          <button class="btn-secondary" @click="store.loadFees()">↻</button>
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
            <th class="px-3 py-2 w-20"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="f in filteredFees"
            :key="f.id"
            class="hover:bg-binance-light/30"
          >
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
            <td class="table-td text-right">
              <button
                class="text-red-400 hover:text-red-300 text-xs"
                @click="del(f)"
              >
                Xóa
              </button>
            </td>
          </tr>
          <tr v-if="filteredFees.length === 0">
            <td colspan="6" class="text-center py-6 text-gray-500">
              Chưa có bản ghi nào
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, watch, ref } from 'vue';
import { useTrackingStore } from '../stores/trackingStore';
import { fmtUSD, todayStr } from '../utils/format';

const store = useTrackingStore();

const form = reactive({
  date: todayStr(),
  entries: {},
});
const filter = reactive({ accountId: '' });
const saving = ref(false);

// Khi accounts load xong, khởi tạo entries cho mỗi account
watch(
  () => store.activeAccounts,
  (accs) => {
    for (const a of accs) {
      if (!form.entries[a.id]) form.entries[a.id] = { fee: null, points: null };
    }
  },
  { immediate: true, deep: true }
);

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

async function submit() {
  const entries = Object.entries(form.entries)
    .filter(([, v]) => (v.fee && v.fee > 0) || (v.points && v.points > 0))
    .map(([accountId, v]) => ({
      date: form.date,
      accountId,
      fee: Number(v.fee) || 0,
      points: Number(v.points) || 0,
    }));

  if (entries.length === 0) {
    alert('Hãy nhập ít nhất 1 bản ghi (phí hoặc điểm > 0)');
    return;
  }
  saving.value = true;
  try {
    await store.addFees(entries);
    await store.loadSummary();
    await store.loadPoints();
    resetForm();
  } catch (e) {
    alert('Lỗi: ' + e.message);
  } finally {
    saving.value = false;
  }
}

function resetForm() {
  for (const id of Object.keys(form.entries)) {
    form.entries[id] = { fee: null, points: null };
  }
}

async function del(f) {
  if (!confirm(`Xóa bản ghi ${f.date} - ${accountName(f.accountId)}?`)) return;
  await store.deleteFee(f.id);
  await store.loadSummary();
  await store.loadPoints();
}
</script>
