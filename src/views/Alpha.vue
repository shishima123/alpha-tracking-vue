<template>
  <div class="space-y-6">
    <!-- Form thêm dự án mới (thu gọn mặc định) -->
    <div class="card">
      <button
        class="w-full flex items-center justify-between text-left"
        @click="showForm = !showForm"
      >
        <h3 class="font-semibold">Thêm dự án Alpha</h3>
        <span class="flex items-center gap-1 text-sm text-gray-500">
          {{ showForm ? 'Thu gọn' : 'Thêm dự án' }}
          <span class="transition-transform" :class="showForm ? 'rotate-180' : ''">▾</span>
        </span>
      </button>

      <div
        class="grid transition-[grid-template-rows] duration-300 ease-in-out"
        :class="showForm ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
      >
      <div class="overflow-hidden">
      <div class="grid grid-cols-1 md:grid-cols-5 gap-3 pt-4">
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
        <div class="label">Số tiền nhận được ($) từ từng tài khoản
          <span class="font-normal normal-case text-gray-400">— tick "ước lượng" nếu chưa chính thức</span>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-2">
          <div v-for="acc in store.activeAccounts" :key="acc.id">
            <label class="text-xs flex items-center gap-1 text-gray-700 mb-0.5">
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
              :class="form.estimated[acc.id] ? 'border-amber-400 bg-amber-50' : ''"
              placeholder="0"
            />
            <label
              class="mt-1 flex items-center gap-1 text-[11px] cursor-pointer select-none"
              :class="form.estimated[acc.id] ? 'text-amber-600 font-medium' : 'text-gray-400'"
            >
              <input v-model="form.estimated[acc.id]" type="checkbox" class="accent-amber-500 w-3 h-3" />
              ước lượng
            </label>
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <button class="btn-secondary" @click="resetForm">Reset</button>
        <button class="btn-primary" @click="submit" :disabled="saving">
          <span v-if="saving" class="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          {{ saving ? 'Đang lưu...' : 'Lưu dự án' }}
        </button>
      </div>
      </div>
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
        <div class="flex items-center gap-2 flex-wrap">
          <div class="inline-flex rounded-lg border border-binance-light overflow-hidden">
            <button
              v-for="v in viewModes"
              :key="v.key"
              class="px-3 py-1.5 text-sm transition-colors"
              :class="viewMode === v.key
                ? 'bg-binance-yellow text-black font-medium'
                : 'bg-transparent text-gray-500 hover:text-gray-700'"
              @click="viewMode = v.key"
            >
              {{ v.label }}
            </button>
          </div>
          <label
            class="flex items-center gap-1.5 text-sm cursor-pointer select-none px-2.5 py-1.5 rounded-lg border transition-colors"
            :class="onlyEstimated ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-gray-500 hover:bg-slate-50'"
          >
            <input v-model="onlyEstimated" type="checkbox" class="accent-amber-500" />
            Chỉ coin có ước lượng
            <span v-if="estimatedCount" class="text-[11px] font-semibold">({{ estimatedCount }})</span>
          </label>
          <div class="relative group/search w-60">
            <input
              v-model="search"
              class="input w-full pr-8"
              placeholder="Tìm theo tên dự án..."
            />
            <button
              v-if="search"
              type="button"
              title="Xóa tìm kiếm"
              class="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-5 h-5 rounded-full text-gray-400 opacity-0 group-hover/search:opacity-100 group-focus-within/search:opacity-100 hover:bg-slate-200 hover:text-gray-700 transition"
              @click="search = ''"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div v-if="filteredProjects.length === 0" class="text-center py-8 text-gray-500">
        {{ onlyEstimated ? 'Không có dự án nào có giá trị ước lượng' : 'Chưa có dự án nào' }}
      </div>

      <!-- ===== View: Danh sách (card list) ===== -->
      <div v-else-if="viewMode === 'list'" class="overflow-x-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr class="table-thead">
              <th class="px-3 py-2">Dự án</th>
              <th class="px-3 py-2">Tài khoản nhận</th>
              <th class="px-3 py-2 text-right w-32">Tổng</th>
              <th class="px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="p in visibleProjects" :key="p.id">
              <!-- DISPLAY ROW -->
              <tr
                v-if="editingId !== p.id"
                class="group border-b border-slate-200 align-top hover:bg-blue-50/50 hover:shadow-[inset_3px_0_0_0_#2563eb] transition-all duration-150"
              >
                <!-- Dự án -->
                <td class="px-3 py-3">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-slate-800 text-base group-hover:text-blue-700 transition-colors">{{ p.name }}</span>
                    <span class="badge" :class="typeClass(p.type)">{{ p.type }}</span>
                  </div>
                  <div class="text-xs text-gray-500 mt-1">
                    {{ p.date }} · Yêu cầu <b class="text-gray-700">{{ p.claimPoints }}đ</b>
                    <span v-if="p.note" class="italic">· {{ p.note }}</span>
                  </div>
                  <div
                    v-if="projectHasEstimate(p)"
                    class="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"
                  >
                    ⚠ Có giá trị ước lượng
                  </div>
                </td>

                <!-- Table nhỏ: account nào được bao nhiêu -->
                <td class="px-3 py-3">
                  <table v-if="hasAnyReward(p)" class="w-full text-sm">
                    <tbody>
                      <tr
                        v-for="acc in accountsWithReward(p)"
                        :key="acc.id"
                        class="border-b border-slate-100 last:border-0 hover:bg-blue-100 rounded transition-colors"
                      >
                        <td class="py-1 pr-2 w-1">
                          <span class="inline-block w-2.5 h-2.5 rounded-full align-middle" :style="{ background: acc.color }"></span>
                        </td>
                        <td class="py-1 pr-4 text-slate-700 font-medium whitespace-nowrap">{{ acc.displayName }}</td>
                        <td class="py-1 text-right whitespace-nowrap">
                          <span
                            v-if="isEstimated(p, acc.id)"
                            class="inline-flex items-center gap-1 font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 tabular-nums"
                          >
                            ~{{ fmtUSD(p.rewards[acc.id]) }}
                            <span class="text-[10px] font-medium uppercase tracking-wide">ước lượng</span>
                          </span>
                          <span v-else class="font-semibold text-slate-700 tabular-nums">
                            {{ fmtUSD(p.rewards[acc.id]) }}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <span v-else class="text-xs text-gray-500 italic">Chưa ghi nhận reward</span>
                </td>

                <!-- Tổng -->
                <td class="px-3 py-3 text-right">
                  <div class="text-lg font-bold text-green-600 tabular-nums">{{ fmtUSD(projectTotal(p)) }}</div>
                  <div v-if="projectHasEstimate(p)" class="text-[10px] text-amber-600">gồm ước lượng</div>
                </td>

                <!-- Actions -->
                <td class="px-3 py-3 text-right whitespace-nowrap">
                  <button
                    class="text-binance-yellow hover:text-white hover:bg-blue-600 text-xs font-medium px-2 py-1 rounded-md transition-colors"
                    @click="startEdit(p)"
                  >Sửa</button>
                  <button
                    class="text-red-600 hover:text-white hover:bg-red-600 text-xs font-medium px-2 py-1 rounded-md transition-colors ml-1"
                    @click="del(p)"
                  >Xóa</button>
                </td>
              </tr>

              <!-- EDIT ROW -->
              <tr v-else class="border-b border-slate-200 bg-blue-50/40">
                <td colspan="4" class="px-3 py-3">
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
                    <div class="label">Số tiền nhận được ($)
                      <span class="font-normal normal-case text-gray-400">— tick "ước lượng" nếu chưa chính thức</span>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-1">
                      <div v-for="acc in store.activeAccounts" :key="acc.id">
                        <label class="text-xs flex items-center gap-1 text-gray-700 mb-0.5">
                          <span class="inline-block w-2 h-2 rounded-full" :style="{ background: acc.color }"></span>
                          {{ acc.displayName }}
                        </label>
                        <input
                          v-model.number="editForm.rewards[acc.id]"
                          type="number"
                          step="0.01"
                          class="input"
                          :class="editForm.estimated[acc.id] ? 'border-amber-400 bg-amber-50' : ''"
                          placeholder="0"
                        />
                        <label
                          class="mt-1 flex items-center gap-1 text-[11px] cursor-pointer select-none"
                          :class="editForm.estimated[acc.id] ? 'text-amber-600 font-medium' : 'text-gray-400'"
                        >
                          <input v-model="editForm.estimated[acc.id]" type="checkbox" class="accent-amber-500 w-3 h-3" />
                          ước lượng
                        </label>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center justify-between mt-3">
                    <div class="text-sm">
                      <span class="text-gray-500">Tổng: </span>
                      <span class="text-green-600 font-semibold">{{ fmtUSD(editTotal) }}</span>
                    </div>
                    <div class="flex gap-2">
                      <button class="btn-secondary" :disabled="savingEdit" @click="cancelEdit">Hủy</button>
                      <button class="btn-primary" :disabled="savingEdit" @click="saveEdit">
                        <span v-if="savingEdit" class="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        {{ savingEdit ? 'Đang lưu...' : 'Lưu' }}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- ===== View: Bảng (pivot) ===== -->
      <div v-else class="space-y-2">
        <div class="flex items-center gap-1.5 text-xs text-gray-500">
          <span class="inline-block w-3 h-3 rounded-sm bg-amber-100 border border-amber-300"></span>
          Giá trị ~ (nền vàng) = ước lượng · bấm tên dự án để sửa
        </div>
        <div class="overflow-auto max-h-[70vh] border border-slate-200 rounded-lg">
          <table class="min-w-full border-separate border-spacing-0 text-sm tabular-nums">
            <thead>
              <tr>
                <th class="sticky top-0 left-0 z-30 bg-slate-100 h-9 px-3 text-left font-semibold border-b border-r border-slate-300 min-w-[140px]">Dự án</th>
                <th class="sticky top-0 z-20 bg-slate-100 h-9 px-3 text-left font-semibold border-b border-slate-300 whitespace-nowrap">Ngày</th>
                <th class="sticky top-0 z-20 bg-slate-100 h-9 px-2 text-right font-semibold border-b border-slate-300 whitespace-nowrap">Claim</th>
                <th class="sticky top-0 z-20 bg-slate-100 h-9 px-3 text-left font-semibold border-b border-r border-slate-300 whitespace-nowrap">Loại</th>
                <th
                  v-for="a in projectMatrixAccounts"
                  :key="a.id"
                  class="sticky top-0 z-20 bg-slate-100 h-9 px-2 text-right font-semibold border-b border-slate-300 whitespace-nowrap"
                >
                  <span class="inline-block w-2 h-2 rounded-full mr-1" :style="{ background: a.color }"></span>
                  {{ a.displayName }}
                </th>
                <th class="sticky top-0 z-20 bg-slate-100 h-9 px-3 text-right font-semibold border-b border-l border-slate-300 whitespace-nowrap">Tổng</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in visibleProjects" :key="p.id" class="bg-white hover:bg-blue-50/60">
                <td
                  class="sticky left-0 z-10 bg-white px-3 py-1.5 font-semibold text-slate-800 border-b border-r border-slate-200 whitespace-nowrap cursor-pointer hover:text-blue-700"
                  @click="editFromTable(p)"
                >
                  {{ p.name }}
                </td>
                <td class="px-3 py-1.5 text-slate-600 border-b border-slate-200 whitespace-nowrap">{{ p.date }}</td>
                <td class="px-2 py-1.5 text-right text-slate-500 border-b border-slate-200">{{ p.claimPoints }}</td>
                <td class="px-3 py-1.5 border-b border-r border-slate-200">
                  <span class="badge text-[11px]" :class="typeClass(p.type)">{{ p.type }}</span>
                </td>
                <td
                  v-for="a in projectMatrixAccounts"
                  :key="p.id + '-' + a.id"
                  class="px-2 py-1.5 text-right border-b border-slate-200"
                >
                  <template v-if="hasReward(p, a.id)">
                    <span
                      v-if="isEstimated(p, a.id)"
                      class="font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 tabular-nums"
                    >~{{ fmtUSD(p.rewards[a.id]) }}</span>
                    <span v-else class="font-semibold text-slate-700">{{ fmtUSD(p.rewards[a.id]) }}</span>
                  </template>
                  <span v-else class="text-gray-300">–</span>
                </td>
                <td class="px-3 py-1.5 text-right font-bold text-green-600 border-b border-l border-slate-200 whitespace-nowrap">
                  {{ fmtUSD(projectTotal(p)) }}
                </td>
              </tr>
            </tbody>
          </table>
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
import { useStorage } from '@vueuse/core';
import { useTrackingStore } from '../stores/trackingStore';
import { useToastStore } from '../stores/toastStore';
import { fmtUSD, todayStr, isoToDmy, dmyToIso, parseDate } from '../utils/format';

const RECENT_DAYS = 15;

const store = useTrackingStore();
const toast = useToastStore();
const saving = ref(false);
const search = ref('');
const showAll = ref(false);
const onlyEstimated = ref(false);
const showForm = ref(false); // form thêm dự án thu gọn mặc định để tiết kiệm diện tích

const viewModes = [
  { key: 'list', label: 'Danh sách' },
  { key: 'table', label: 'Bảng' },
];
const viewMode = useStorage('alpha:projectsViewMode', 'list');

const projectTypes = ['FCFS', 'TGE', 'Phase', 'Pre-Tge', 'Booster'];

const form = reactive({
  name: '',
  date: todayStr(),
  claimPoints: 15,
  type: 'FCFS',
  note: '',
  rewards: {},
  estimated: {},
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
      if (!(a.id in form.estimated)) form.estimated[a.id] = false;
    }
  },
  { immediate: true, deep: true }
);

function isEstimated(p, accId) {
  const n = Number(p.rewards?.[accId]);
  return !!(p.estimated && p.estimated[accId]) && Number.isFinite(n) && n !== 0;
}

function projectHasEstimate(p) {
  return store.accounts.some((a) => isEstimated(p, a.id));
}

const estimatedCount = computed(
  () => store.projects.filter((p) => projectHasEstimate(p)).length
);

const filteredProjects = computed(() => {
  let list = [...store.projects];
  if (search.value)
    list = list.filter((p) =>
      p.name.toLowerCase().includes(search.value.toLowerCase())
    );
  if (onlyEstimated.value) list = list.filter((p) => projectHasEstimate(p));
  // Sort theo ngày thực (mới nhất trước). Không so sánh chuỗi DMY trực tiếp vì
  // "31/05/2025" > "30/12/2025" theo lexicographic (ưu tiên ngày).
  return list.sort((a, b) => (parseDate(b.date)?.getTime() || 0) - (parseDate(a.date)?.getTime() || 0));
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
  if (showAll.value || search.value || onlyEstimated.value) return filteredProjects.value;
  return recentProjects.value;
});

function projectTotal(p) {
  return Object.values(p.rewards || {}).reduce(
    (s, v) => s + (Number(v) || 0),
    0
  );
}

function hasAnyReward(p) {
  return Object.values(p.rewards || {}).some((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n !== 0;
  });
}

function hasReward(p, accId) {
  const n = Number(p.rewards?.[accId]);
  return Number.isFinite(n) && n !== 0;
}

// Cột tài khoản cho view bảng: account có reward ở bất kỳ dự án nào (đã lọc), theo sortOrder.
const projectMatrixAccounts = computed(() => {
  const ids = new Set();
  filteredProjects.value.forEach((p) => {
    for (const id of Object.keys(p.rewards || {})) {
      if (hasReward(p, id)) ids.add(id);
    }
  });
  return [...ids]
    .map((id) => store.accountById(id) || { id, displayName: id, color: '#3b82f6' })
    .sort((a, b) => store.accountOrderIndex(a.id) - store.accountOrderIndex(b.id));
});

// Từ view bảng → chuyển sang view danh sách + mở sửa (showAll để chắc chắn dự án hiển thị).
function editFromTable(p) {
  viewMode.value = 'list';
  showAll.value = true;
  startEdit(p);
}

function accountsWithReward(p) {
  // Bao gồm cả inactive accounts để không "ẩn" reward cũ. Cho phép cả giá trị âm.
  return store.accounts.filter((a) => {
    const n = Number(p.rewards?.[a.id]);
    return Number.isFinite(n) && n !== 0;
  });
}

function typeClass(type) {
  return {
    TGE: 'bg-purple-100 text-purple-700',
    FCFS: 'bg-blue-100 text-blue-700',
    Phase: 'bg-green-100 text-green-700',
    'Pre-Tge': 'bg-orange-100 text-orange-700',
    Booster: 'bg-amber-100 text-amber-700',
  }[type] || 'bg-gray-200 text-gray-700';
}

async function submit() {
  if (!form.name || !form.date) {
    toast.error('Cần nhập tên và ngày');
    return;
  }
  const rewards = {};
  const estimated = {};
  for (const [k, v] of Object.entries(form.rewards)) {
    const n = Number(v);
    if (Number.isFinite(n) && n !== 0) {
      rewards[k] = n;
      if (form.estimated[k]) estimated[k] = true;
    }
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
      estimated,
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
  for (const k of Object.keys(form.estimated)) form.estimated[k] = false;
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
  estimated: {},
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
  editForm.estimated = { ...(p.estimated || {}) };
  for (const a of store.activeAccounts) {
    if (!(a.id in editForm.rewards)) editForm.rewards[a.id] = null;
    if (!(a.id in editForm.estimated)) editForm.estimated[a.id] = false;
  }
}

function cancelEdit() {
  editingId.value = null;
}

async function saveEdit() {
  if (!editingId.value) return;
  const rewards = {};
  const estimated = {};
  for (const [k, v] of Object.entries(editForm.rewards)) {
    const n = Number(v);
    if (Number.isFinite(n) && n !== 0) {
      rewards[k] = n;
      if (editForm.estimated[k]) estimated[k] = true;
    }
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
      estimated,
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
