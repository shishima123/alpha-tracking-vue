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
          <input v-model="formDateIso" type="date" class="input" />
        </div>
        <div>
          <label class="label">Điểm yêu cầu</label>
          <input v-model.number="form.claimPoints" type="number" class="input" />
        </div>
        <div>
          <label class="label">Loại</label>
          <select v-model="form.type" class="input">
            <option v-for="t in projectTypes" :key="t" :value="t">{{ t }}</option>
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
          <span v-if="saving" class="inline-block w-3 h-3 border-2 border-binance-dark border-t-transparent rounded-full animate-spin"></span>
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
            <th class="px-3 py-2 w-32 text-right"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="p in filteredProjects" :key="p.id">
            <!-- Display row -->
            <tr v-if="editingId !== p.id" class="hover:bg-binance-light/30">
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
              <td class="table-td text-right space-x-2 whitespace-nowrap">
                <button
                  class="text-binance-yellow hover:text-yellow-300 text-xs"
                  @click="startEdit(p)"
                >
                  Sửa
                </button>
                <button
                  class="text-red-400 text-xs hover:text-red-300"
                  @click="del(p)"
                >
                  Xóa
                </button>
              </td>
            </tr>

            <!-- Edit row -->
            <tr v-else class="bg-binance-light/30">
              <td class="table-td">
                <input v-model="editDateIso" type="date" class="input py-1" />
              </td>
              <td class="table-td">
                <input v-model="editForm.name" class="input py-1" placeholder="Tên" />
              </td>
              <td class="table-td">
                <select v-model="editForm.type" class="input py-1">
                  <option v-for="t in projectTypes" :key="t" :value="t">{{ t }}</option>
                </select>
              </td>
              <td class="table-td">
                <input v-model.number="editForm.claimPoints" type="number" class="input py-1 text-right" />
              </td>
              <td
                v-for="acc in store.activeAccounts"
                :key="acc.id"
                class="table-td"
              >
                <input
                  v-model.number="editForm.rewards[acc.id]"
                  type="number"
                  step="0.01"
                  class="input py-1 text-right"
                  placeholder="0"
                />
              </td>
              <td class="table-td text-right font-semibold text-green-400">
                {{ fmtUSD(editTotal) }}
              </td>
              <td class="table-td text-right space-x-2 whitespace-nowrap">
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
import { useToastStore } from '../stores/toastStore';
import { fmtUSD, todayStr, isoToDmy, dmyToIso } from '../utils/format';

const store = useTrackingStore();
const toast = useToastStore();
const saving = ref(false);
const search = ref('');

const projectTypes = ['FCFS', 'TGE', 'Phase', 'Pre-Tge', 'Booster'];

const form = reactive({
  name: '',
  date: todayStr(),
  claimPoints: 15,
  type: 'FCFS',
  note: '',
  rewards: {},
});

const formDateIso = computed({
  get: () => dmyToIso(form.date),
  set: (v) => { form.date = isoToDmy(v) || form.date; },
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
    toast.error('Cần nhập tên và ngày');
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
    toast.success(`Đã lưu dự án "${form.name}"`);
    resetForm();
  } catch (e) {
    toast.error('Lỗi: ' + e.message);
  } finally {
    saving.value = false;
  }
}

function resetForm() {
  form.name = '';
  form.note = '';
  for (const k of Object.keys(form.rewards)) form.rewards[k] = null;
}

// ===== Inline edit =====
const editingId = ref(null);
const editForm = reactive({
  name: '',
  date: '',
  claimPoints: 15,
  type: 'FCFS',
  note: '',
  rewards: {},
});
const savingEdit = ref(false);

const editDateIso = computed({
  get: () => dmyToIso(editForm.date),
  set: (v) => { editForm.date = isoToDmy(v) || editForm.date; },
});

const editTotal = computed(() =>
  Object.values(editForm.rewards).reduce((s, v) => s + (Number(v) || 0), 0)
);

function startEdit(p) {
  editingId.value = p.id;
  editForm.name = p.name;
  editForm.date = p.date;
  editForm.claimPoints = p.claimPoints;
  editForm.type = p.type;
  editForm.note = p.note || '';
  editForm.rewards = {};
  for (const a of store.activeAccounts) {
    editForm.rewards[a.id] = p.rewards?.[a.id] ?? null;
  }
}

function cancelEdit() {
  editingId.value = null;
}

async function saveEdit() {
  if (!editingId.value) return;
  const rewards = {};
  for (const [k, v] of Object.entries(editForm.rewards)) {
    if (v && Number(v) > 0) rewards[k] = Number(v);
  }
  savingEdit.value = true;
  try {
    await store.updateProject(editingId.value, {
      name: editForm.name,
      date: editForm.date,
      claimPoints: editForm.claimPoints,
      type: editForm.type,
      note: editForm.note,
      rewards,
    });
    await store.loadSummary();
    toast.success(`Đã cập nhật "${editForm.name}"`);
    editingId.value = null;
  } catch (e) {
    toast.error('Lỗi: ' + e.message);
  } finally {
    savingEdit.value = false;
  }
}

async function del(p) {
  if (!confirm(`Xóa dự án "${p.name}"?`)) return;
  try {
    await store.deleteProject(p.id);
    await store.loadSummary();
    toast.success(`Đã xóa "${p.name}"`);
  } catch (e) {
    toast.error('Lỗi: ' + e.message);
  }
}
</script>
