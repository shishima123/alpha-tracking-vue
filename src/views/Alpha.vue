<template>
  <div class="space-y-6">
    <!-- Form thêm dự án mới (thu gọn mặc định) -->
    <div>
      <div class="flex justify-end mb-2">
        <button
          class="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-white border border-[#efeff5] rounded-full px-3 py-1 hover:border-blue-600 hover:text-blue-600 transition-colors"
          @click="showForm = !showForm"
        >
          {{ showForm ? 'Thu gọn' : 'Thêm dự án' }}
          <span class="transition-transform inline-block" :class="showForm ? 'rotate-180' : ''">▾</span>
        </button>
      </div>

      <div
        class="grid transition-[grid-template-rows] duration-300 ease-in-out"
        :class="showForm ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
      >
      <div class="overflow-hidden">
      <div class="card">
      <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label class="label">Tên dự án</label>
          <n-input v-model:value="form.name" placeholder="VD: BILL" />
        </div>
        <div>
          <label class="label">Ngày</label>
          <n-date-picker
            v-model:formatted-value="form.date"
            value-format="dd/MM/yyyy"
            format="dd/MM/yyyy"
            type="date"
            :clearable="false"
            style="width: 100%"
          />
        </div>
        <div>
          <label class="label">Điểm yêu cầu</label>
          <n-input-number v-model:value="form.claimPoints" style="width: 100%" />
        </div>
        <div>
          <label class="label">Loại</label>
          <n-select v-model:value="form.type" :options="typeOptions" />
        </div>
        <div>
          <label class="label">Ghi chú</label>
          <n-input v-model:value="form.note" placeholder="Không bắt buộc" />
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
            <n-input-number
              v-model:value="form.rewards[acc.id]"
              :step="0.01"
              :show-button="false"
              :status="form.estimated[acc.id] ? 'warning' : undefined"
              placeholder="0"
              style="width: 100%"
            />
            <n-checkbox
              v-model:checked="form.estimated[acc.id]"
              size="small"
              style="margin-top: 4px; font-size: 11px"
            >
              ước lượng
            </n-checkbox>
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <n-button @click="resetForm">Reset</n-button>
        <n-button type="primary" :loading="saving" @click="submit">
          {{ saving ? 'Đang lưu...' : 'Lưu dự án' }}
        </n-button>
      </div>
      </div>
      </div>
      </div>
    </div>

    <!-- Danh sách dự án (card list) -->
    <div class="card gray-card">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 class="font-semibold">
          Danh sách dự án
          <span class="text-gray-500 font-normal">
            ({{ visibleProjects.length }}/{{ filteredProjects.length }})
          </span>
        </h3>
        <div class="flex items-center gap-2 flex-wrap">
          <n-radio-group v-model:value="viewMode" size="small">
            <n-radio-button v-for="v in viewModes" :key="v.key" :value="v.key">{{ v.label }}</n-radio-button>
          </n-radio-group>
          <n-checkbox v-model:checked="onlyEstimated">
            Chỉ coin có ước lượng
            <span v-if="estimatedCount" class="text-gray-400 text-[11px]">({{ estimatedCount }})</span>
          </n-checkbox>
          <n-input v-model:value="search" clearable placeholder="Tìm theo tên dự án..." size="small" style="width: 240px" />
        </div>
      </div>

      <n-empty
        v-if="filteredProjects.length === 0"
        :description="onlyEstimated ? 'Không có dự án nào có giá trị ước lượng' : 'Chưa có dự án nào'"
        style="padding: 32px 0"
      />

      <!-- ===== View: Danh sách (card list) ===== -->
      <div v-else-if="viewMode === 'list'" class="overflow-x-auto bg-white border border-[#efeff5] rounded-lg">
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
                class="group border-b border-[#efeff5] align-top hover:bg-[#f3f4f5] hover:shadow-[inset_3px_0_0_0_#2563eb] transition-all duration-150"
              >
                <!-- Dự án -->
                <td class="px-3 py-3">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-slate-800 text-base group-hover:text-blue-700 transition-colors">{{ p.name }}</span>
                    <n-tag size="small" :color="typeColor(p.type)" :bordered="false">{{ p.type }}</n-tag>
                  </div>
                  <div class="text-xs text-gray-500 mt-1">
                    {{ p.date }} · Yêu cầu <b class="text-gray-700">{{ p.claimPoints }}đ</b>
                    <span v-if="p.note" class="italic">· {{ p.note }}</span>
                  </div>
                  <n-tag
                    v-if="projectHasEstimate(p)"
                    type="warning"
                    size="small"
                    :bordered="false"
                    round
                    style="margin-top: 6px"
                  >
                    ⚠ Có giá trị ước lượng
                  </n-tag>
                </td>

                <!-- Table nhỏ: account nào được bao nhiêu -->
                <td class="px-3 py-3">
                  <table v-if="hasAnyReward(p)" class="w-full text-sm">
                    <tbody>
                      <tr
                        v-for="acc in accountsWithReward(p)"
                        :key="acc.id"
                        class="border-b border-[#f3f3f5] last:border-0 hover:bg-[#e2e3e5] rounded transition-colors"
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
                <td class="px-3 py-3">
                  <div class="row-actions">
                    <n-button size="tiny" text type="primary" @click="startEdit(p)">Sửa</n-button>
                    <n-button size="tiny" text type="error" @click="del(p)">Xóa</n-button>
                  </div>
                </td>
              </tr>

              <!-- EDIT ROW -->
              <tr v-else class="border-b border-[#efeff5] bg-[#f6f9ff]">
                <td colspan="4" class="px-3 py-3">
                  <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div>
                      <label class="label">Tên dự án</label>
                      <n-input v-model:value="editForm.name" />
                    </div>
                    <div>
                      <label class="label">Ngày</label>
                      <n-date-picker
                        v-model:formatted-value="editForm.date"
                        value-format="dd/MM/yyyy"
                        format="dd/MM/yyyy"
                        type="date"
                        :clearable="false"
                        style="width: 100%"
                      />
                    </div>
                    <div>
                      <label class="label">Điểm yêu cầu</label>
                      <n-input-number v-model:value="editForm.claimPoints" style="width: 100%" />
                    </div>
                    <div>
                      <label class="label">Loại</label>
                      <n-select v-model:value="editForm.type" :options="typeOptions" />
                    </div>
                    <div>
                      <label class="label">Ghi chú</label>
                      <n-input v-model:value="editForm.note" placeholder="Không bắt buộc" />
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
                        <n-input-number
                          v-model:value="editForm.rewards[acc.id]"
                          :step="0.01"
                          :show-button="false"
                          :status="editForm.estimated[acc.id] ? 'warning' : undefined"
                          placeholder="0"
                          style="width: 100%"
                        />
                        <n-checkbox
                          v-model:checked="editForm.estimated[acc.id]"
                          size="small"
                          style="margin-top: 4px; font-size: 11px"
                        >
                          ước lượng
                        </n-checkbox>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center justify-between mt-3">
                    <div class="text-sm">
                      <span class="text-gray-500">Tổng: </span>
                      <span class="text-green-600 font-semibold">{{ fmtUSD(editTotal) }}</span>
                    </div>
                    <div class="flex gap-2">
                      <n-button :disabled="savingEdit" @click="cancelEdit">Hủy</n-button>
                      <n-button type="primary" :loading="savingEdit" @click="saveEdit">
                        {{ savingEdit ? 'Đang lưu...' : 'Lưu' }}
                      </n-button>
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
        <div class="overflow-auto max-h-[70vh] border border-[#efeff5] rounded-lg bg-white">
          <table class="pivot min-w-full border-separate border-spacing-0 text-sm tabular-nums">
            <thead>
              <tr>
                <th class="sticky top-0 left-0 z-30 bg-[#fafafc] h-9 px-3 text-left font-semibold border-b border-r border-[#e6e6eb] min-w-[140px]">Dự án</th>
                <th class="sticky top-0 z-20 bg-[#fafafc] h-9 px-3 text-left font-semibold border-b border-[#e6e6eb] whitespace-nowrap">Ngày</th>
                <th class="sticky top-0 z-20 bg-[#fafafc] h-9 px-2 text-right font-semibold border-b border-[#e6e6eb] whitespace-nowrap">Claim</th>
                <th class="sticky top-0 z-20 bg-[#fafafc] h-9 px-3 text-left font-semibold border-b border-r border-[#e6e6eb] whitespace-nowrap">Loại</th>
                <th
                  v-for="a in projectMatrixAccounts"
                  :key="a.id"
                  class="sticky top-0 z-20 bg-[#fafafc] h-9 px-2 text-right font-semibold border-b border-[#e6e6eb] whitespace-nowrap"
                >
                  <span class="inline-block w-2 h-2 rounded-full mr-1" :style="{ background: a.color }"></span>
                  {{ a.displayName }}
                </th>
                <th class="sticky top-0 z-20 bg-[#fafafc] h-9 px-3 text-right font-semibold border-b border-l border-[#e6e6eb] whitespace-nowrap">Tổng</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in visibleProjects" :key="p.id" class="bg-white">
                <td
                  class="sticky left-0 z-10 bg-white px-3 py-1.5 font-semibold text-slate-800 border-b border-r border-[#efeff5] whitespace-nowrap cursor-pointer hover:text-blue-700"
                  @click="editFromTable(p)"
                >
                  {{ p.name }}
                </td>
                <td class="px-3 py-1.5 text-slate-600 border-b border-[#efeff5] whitespace-nowrap">{{ p.date }}</td>
                <td class="px-2 py-1.5 text-right text-slate-500 border-b border-[#efeff5]">{{ p.claimPoints }}</td>
                <td class="px-3 py-1.5 border-b border-r border-[#efeff5]">
                  <n-tag size="small" :color="typeColor(p.type)" :bordered="false">{{ p.type }}</n-tag>
                </td>
                <td
                  v-for="a in projectMatrixAccounts"
                  :key="p.id + '-' + a.id"
                  class="px-2 py-1.5 text-right border-b border-[#efeff5]"
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
                <td class="px-3 py-1.5 text-right font-bold text-green-600 border-b border-l border-[#efeff5] whitespace-nowrap">
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
        <n-button size="small" tertiary @click="showAll = !showAll">
          {{ showAll
            ? `Thu gọn (chỉ ${RECENT_DAYS} ngày gần nhất — ${recentProjects.length} dự án)`
            : `Xem tất cả ${filteredProjects.length} dự án` }}
        </n-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import {
  NInput, NInputNumber, NSelect, NDatePicker, NCheckbox,
  NRadioGroup, NRadioButton, NButton, NTag, NEmpty,
} from 'naive-ui';
import { useTrackingStore } from '../stores/trackingStore';
import { useToastStore } from '../stores/toastStore';
import { dialog, confirmAction } from '../utils/naive';
import { fmtUSD, todayStr, parseDate } from '../utils/format';

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
const typeOptions = projectTypes.map((t) => ({ label: t, value: t }));

const form = reactive({
  name: '',
  date: todayStr(),
  claimPoints: 15,
  type: 'FCFS',
  note: '',
  rewards: {},
  estimated: {},
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

// Màu tag theo loại dự án (n-tag :color = { color, textColor }).
function typeColor(type) {
  const map = {
    TGE: { color: '#f3e8ff', textColor: '#7e22ce' },
    FCFS: { color: '#dbeafe', textColor: '#1d4ed8' },
    Phase: { color: '#dcfce7', textColor: '#15803d' },
    'Pre-Tge': { color: '#ffedd5', textColor: '#c2410c' },
    Booster: { color: '#fef3c7', textColor: '#b45309' },
  };
  return map[type] || { color: '#e5e7eb', textColor: '#374151' };
}

async function submit() {
  if (!form.name || !form.date) {
    toast.error('Cần nhập tên và ngày');
    return;
  }
  if (!(await confirmAction({
    title: 'Lưu dự án',
    content: `Lưu dự án "${form.name}"?`,
    positiveText: 'Lưu',
    type: 'info',
  }))) return;
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
  if (!(await confirmAction({
    title: 'Cập nhật dự án',
    content: `Lưu thay đổi cho "${editForm.name}"?`,
    positiveText: 'Lưu',
    type: 'info',
  }))) return;
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
    toast.success(`Đã cập nhật "${editForm.name}"`);
    editingId.value = null;
  } catch (e) {
    toast.error('Lỗi: ' + e.message);
  } finally {
    savingEdit.value = false;
  }
}

function del(p) {
  dialog.warning({
    title: 'Xóa dự án',
    content: `Xóa dự án "${p.name}"?`,
    positiveText: 'Xóa',
    negativeText: 'Hủy',
    onPositiveClick: async () => {
      try {
        await store.deleteProject(p.id);
        toast.success(`Đã xóa "${p.name}"`);
      } catch (e) {
        toast.error('Lỗi: ' + e.message);
      }
    },
  });
}
</script>

<style scoped>
.row-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.row-actions :deep(.n-button) {
  padding: 3px 10px;
  border-radius: 6px;
  transition: background-color 0.15s;
}
.row-actions :deep(.n-button:hover) {
  background-color: #f1f3f5;
}

/* Hover bảng pivot: overlay xám trung tính (đồng bộ với bảng Fees). */
.pivot tbody td {
  transition: box-shadow 0.15s;
}
.pivot tbody tr:hover td {
  box-shadow: inset 0 0 0 999px rgba(15, 23, 42, 0.05); /* hover cả row */
}
.pivot tbody tr:hover td:hover {
  box-shadow: inset 0 0 0 999px rgba(15, 23, 42, 0.12); /* hover cell */
}
</style>
