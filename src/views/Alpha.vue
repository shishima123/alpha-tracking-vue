<template>
  <div class="space-y-6">
    <!-- Form thêm dự án mới -->
    <div class="card">
      <h3 class="font-semibold mb-4">Thêm dự án Alpha</h3>
      <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label class="label">Tên dự án</label>
          <input v-model="form.name" class="input" placeholder="VD: BILL" />
        </div>
        <div>
          <label class="label">Ngày</label>
          <input v-model="form.date" class="input" placeholder="dd/MM/yyyy" />
        </div>
        <div>
          <label class="label">Điểm yêu cầu</label>
          <input v-model.number="form.claimPoints" type="number" class="input" />
        </div>
        <div>
          <label class="label">Loại</label>
          <select v-model="form.type" class="input">
            <option value="FCFS">FCFS</option>
            <option value="TGE">TGE</option>
            <option value="Phase">Phase</option>
            <option value="Pre-Tge">Pre-TGE</option>
            <option value="Booster">Booster</option>
          </select>
        </div>
        <div>
          <label class="label">Ghi chú</label>
          <input v-model="form.note" class="input" placeholder="Không bắt buộc" />
        </div>
      </div>

      <div class="mt-4">
        <div class="label">Số tiền nhận được ($) từ từng tài khoản</div>
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-2">
          <div v-for="acc in store.activeAccounts" :key="acc.id">
            <label class="text-xs flex items-center gap-1 text-gray-300 mb-0.5">
              <span
                class="inline-block w-2 h-2 rounded-full"
                :style="{ background: acc.color }"
              ></span>
              {{ acc.displayName }}
            </label>
            <input
              v-model.number="form.rewards[acc.id]"
              type="number"
              step="0.01"
              class="input"
              placeholder="0"
            />
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <button class="btn-secondary" @click="resetForm">Reset</button>
        <button class="btn-primary" @click="submit" :disabled="saving">
          {{ saving ? 'Đang lưu...' : 'Lưu dự án' }}
        </button>
      </div>
    </div>

    <!-- Danh sách dự án -->
    <div class="card overflow-x-auto">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold">
          Danh sách dự án ({{ store.projects.length }})
        </h3>
        <input
          v-model="search"
          class="input w-60"
          placeholder="Tìm theo tên dự án..."
        />
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="table-thead">
            <th class="px-3 py-2">Ngày</th>
            <th class="px-3 py-2">Dự án</th>
            <th class="px-3 py-2">Loại</th>
            <th class="px-3 py-2 text-right">Điểm</th>
            <th
              v-for="acc in store.activeAccounts"
              :key="acc.id"
              class="px-2 py-2 text-right"
            >
              <span
                class="inline-block w-2 h-2 rounded-full mr-1"
                :style="{ background: acc.color }"
              ></span>
              {{ acc.displayName }}
            </th>
            <th class="px-3 py-2 text-right">Tổng</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in filteredProjects"
            :key="p.id"
            class="hover:bg-binance-light/30"
          >
            <td class="table-td whitespace-nowrap">{{ p.date }}</td>
            <td class="table-td font-medium">{{ p.name }}</td>
            <td class="table-td">
              <span class="badge" :class="typeClass(p.type)">{{ p.type }}</span>
            </td>
            <td class="table-td text-right">{{ p.claimPoints }}</td>
            <td
              v-for="acc in store.activeAccounts"
              :key="acc.id"
              class="table-td text-right text-binance-yellow"
            >
              {{ p.rewards[acc.id] ? fmtUSD(p.rewards[acc.id]) : '-' }}
            </td>
            <td class="table-td text-right font-semibold text-green-400">
              {{ fmtUSD(projectTotal(p)) }}
            </td>
            <td class="table-td text-right">
              <button
                class="text-red-400 text-xs hover:text-red-300"
                @click="del(p)"
              >
                Xóa
              </button>
            </td>
          </tr>
          <tr v-if="filteredProjects.length === 0">
            <td :colspan="6 + store.activeAccounts.length" class="text-center py-6 text-gray-500">
              Chưa có dự án nào
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, watch } from 'vue';
import { useTrackingStore } from '../stores/trackingStore';
import { fmtUSD, todayStr } from '../utils/format';

const store = useTrackingStore();
const saving = ref(false);
const search = ref('');

const form = reactive({
  name: '',
  date: todayStr(),
  claimPoints: 15,
  type: 'FCFS',
  note: '',
  rewards: {},
});

watch(
  () => store.activeAccounts,
  (accs) => {
    for (const a of accs) {
      if (!(a.id in form.rewards)) form.rewards[a.id] = null;
    }
  },
  { immediate: true, deep: true }
);

const filteredProjects = computed(() => {
  let list = [...store.projects];
  if (search.value)
    list = list.filter((p) =>
      p.name.toLowerCase().includes(search.value.toLowerCase())
    );
  return list.sort((a, b) => (a.date < b.date ? 1 : -1));
});

function projectTotal(p) {
  return Object.values(p.rewards || {}).reduce(
    (s, v) => s + (Number(v) || 0),
    0
  );
}

function typeClass(type) {
  return {
    TGE: 'bg-purple-900 text-purple-200',
    FCFS: 'bg-blue-900 text-blue-200',
    Phase: 'bg-green-900 text-green-200',
    'Pre-Tge': 'bg-orange-900 text-orange-200',
    Booster: 'bg-yellow-900 text-yellow-200',
  }[type] || 'bg-gray-700 text-gray-200';
}

async function submit() {
  if (!form.name || !form.date) {
    alert('Vui lòng nhập tên và ngày');
    return;
  }
  const rewards = {};
  for (const [k, v] of Object.entries(form.rewards)) {
    if (v && Number(v) > 0) rewards[k] = Number(v);
  }
  saving.value = true;
  try {
    await store.createProject({
      name: form.name,
      date: form.date,
      claimPoints: form.claimPoints,
      type: form.type,
      note: form.note,
      rewards,
    });
    await store.loadSummary();
    resetForm();
  } catch (e) {
    alert('Lỗi: ' + e.message);
  } finally {
    saving.value = false;
  }
}

function resetForm() {
  form.name = '';
  form.note = '';
  for (const k of Object.keys(form.rewards)) form.rewards[k] = null;
}

async function del(p) {
  if (!confirm(`Xóa dự án "${p.name}"?`)) return;
  await store.deleteProject(p.id);
  await store.loadSummary();
}
</script>
