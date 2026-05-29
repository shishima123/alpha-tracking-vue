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

    <!-- Danh sách dự án (card list) -->
    <div class="card">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 class="font-semibold">
          Danh sách dự án
          <span class="text-gray-500 font-normal">
            ({{ visibleProjects.length }}/{{ filteredProjects.length }})
          </span>
        </h3>
        <input
          v-model="search"
          class="input w-60"
          placeholder="Tìm theo tên dự án..."
        />
      </div>

      <div v-if="filteredProjects.length === 0" class="text-center py-8 text-gray-500">
        Chưa có dự án nào
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="p in visibleProjects"
          :key="p.id"
          class="border border-binance-light rounded-lg p-3 hover:bg-binance-light/20 transition"
        >
          <!-- DISPLAY MODE -->
          <div v-if="editingId !== p.id" class="flex items-start justify-between gap-4 flex-wrap">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-base">{{ p.name }}</span>
                <span class="badge" :class="typeClass(p.type)">{{ p.type }}</span>
                <span class="text-xs text-gray-500">{{ p.date }}</span>
                <span class="text-xs text-gray-500">·</span>
                <span class="text-xs text-gray-400">
                  Yêu cầu <b class="text-gray-200">{{ p.claimPoints }}đ</b>
                </span>
                <span v-if="p.note" class="text-xs text-gray-500 italic">· {{ p.note }}</span>
              </div>

              <div v-if="hasAnyReward(p)" class="mt-2 flex flex-wrap gap-1.5">
                <span
                  v-for="acc in accountsWithReward(p)"
                  :key="acc.id"
                  class="text-xs px-2 py-1 rounded-md bg-binance-dark border border-binance-light/60 flex items-center gap-1.5"
                >
                  <span
                    class="inline-block w-2 h-2 rounded-full"
                    :style="{ background: acc.color }"
                  ></span>
                  <span class="text-gray-300">{{ acc.displayName }}</span>
                  <span class="text-binance-yellow font-semibold">{{ fmtUSD(p.rewards[acc.id]) }}</span>
                </span>
              </div>
              <div v-else class="mt-2 text-xs text-gray-500 italic">
                Chưa ghi nhận reward cho account nào
              </div>
            </div>

            <div class="flex flex-col items-end shrink-0">
              <div class="text-xs text-gray-400">Tổng</div>
              <div class="text-xl font-bold text-green-400">{{ fmtUSD(projectTotal(p)) }}</div>
              <div class="mt-1 flex gap-3">
                <button
                  class="text-binance-yellow hover:text-yellow-300 text-xs"
                  @click="startEdit(p)"
                >
                  Sửa
                </button>
                <button
                  class="text-red-400 hover:text-red-300 text-xs"
                  @click="del(p)"
                >
                  Xóa
                </button>
              </div>
            </div>
          </div>

          <!-- EDIT MODE -->
          <div v-else>
            <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label class="label">Tên dự án</label>
                <input v-model="editForm.name" class="input" />
              </div>
              <div>
                <label class="label">Ngày</label>
                <input v-model="editDateIso" type="date" class="input" />
              </div>
              <div>
                <label class="label">Điểm yêu cầu</label>
                <input v-model.number="editForm.claimPoints" type="number" class="input" />
              </div>
              <div>
                <label class="label">Loại</label>
                <select v-model="editForm.type" class="input">
                  <option v-for="t in projectTypes" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div>
                <label class="label">Ghi chú</label>
                <input v-model="editForm.note" class="input" placeholder="Không bắt buộc" />
              </div>
            </div>

            <div class="mt-3">
              <div class="label">Số tiền nhận được ($)</div>
              <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-1">
                <div v-for="acc in store.activeAccounts" :key="acc.id">
                  <label class="text-xs flex items-center gap-1 text-gray-300 mb-0.5">
                    <span
                      class="inline-block w-2 h-2 rounded-full"
                      :style="{ background: acc.color }"
                    ></span>
                    {{ acc.displayName }}
                  </label>
                  <input
                    v-model.number="editForm.rewards[acc.id]"
                    type="number"
                    step="0.01"
                    class="input"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between mt-3">
              <div class="text-sm">
                <span class="text-gray-400">Tổng: </span>
                <span class="text-green-400 font-semibold">{{ fmtUSD(editTotal) }}</span>
              </div>
              <div class="flex gap-2">
                <button class="btn-secondary" :disabled="savingEdit" @click="cancelEdit">
                  Hủy
                </button>
                <button class="btn-primary" :disabled="savingEdit" @click="saveEdit">
                  <span v-if="savingEdit" class="inline-block w-3 h-3 border-2 border-binance-dark border-t-transparent rounded-full animate-spin"></span>
                  {{ savingEdit ? 'Đang lưu...' : 'Lưu' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="filteredProjects.length > visibleProjects.length || (showAll && filteredProjects.length > recentProjects.length)"
        class="flex justify-center mt-4"
      >
        <button class="btn-secondary text-xs" @click="showAll = !showAll">
          {{ showAll
            ? `Thu gọn (chỉ ${RECENT_DAYS} ngày gần nhất — ${recentProjects.length} dự án)`
            : `Xem tất cả ${filteredProjects.length} dự án` }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, watch } from 'vue';
import { useTrackingStore } from '../stores/trackingStore';
import { useToastStore } from '../stores/toastStore';
import { fmtUSD, todayStr, isoToDmy, dmyToIso, parseDate } from '../utils/format';

const RECENT_DAYS = 15;

const store = useTrackingStore();
const toast = useToastStore();
const saving = ref(false);
const search = ref('');
const showAll = ref(false);

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

const recentProjects = computed(() => {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - RECENT_DAYS);
  return filteredProjects.value.filter((p) => {
    const d = parseDate(p.date);
    return d && d.getTime() >= cutoff.getTime();
  });
});

// Khi search: bỏ giới hạn 15 ngày để tìm được dự án cũ. Inactive show-all toggle vẫn giữ.
const visibleProjects = computed(() => {
  if (showAll.value || search.value) return filteredProjects.value;
  return recentProjects.value;
});

function projectTotal(p) {
  return Object.values(p.rewards || {}).reduce(
    (s, v) => s + (Number(v) || 0),
    0
  );
}

function hasAnyReward(p) {
  return Object.values(p.rewards || {}).some((v) => Number(v) > 0);
}

function accountsWithReward(p) {
  // Bao gồm cả inactive accounts để không "ẩn" reward cũ
  return store.accounts.filter((a) => Number(p.rewards?.[a.id]) > 0);
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
  // Giữ NGUYÊN rewards gốc (kể cả của inactive accounts) để không bị drop khi save
  editForm.rewards = { ...(p.rewards || {}) };
  for (const a of store.activeAccounts) {
    if (!(a.id in editForm.rewards)) editForm.rewards[a.id] = null;
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
