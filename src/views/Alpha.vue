<template>
  <n-flex vertical :size="20">
    <!-- Form thêm dự án mới (thu gọn mặc định) -->
    <n-card>
      <div class="head-toggle" @click="showForm = !showForm">
        <span class="card-title">Thêm dự án Alpha</span>
        <n-flex align="center" :size="4" class="muted">
          {{ showForm ? 'Thu gọn' : 'Thêm dự án' }}
          <span class="chevron" :class="{ open: showForm }">▾</span>
        </n-flex>
      </div>

      <n-collapse-transition :show="showForm">
        <div style="padding-top: 16px">
          <n-grid cols="1 m:5" responsive="screen" :x-gap="12" :y-gap="8">
            <n-gi>
              <n-form-item label="Tên dự án" :show-feedback="false">
                <n-input v-model:value="form.name" placeholder="VD: BILL" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="Ngày" :show-feedback="false">
                <n-date-picker v-model:formatted-value="form.date" value-format="dd/MM/yyyy" format="dd/MM/yyyy" type="date" :clearable="false" style="width: 100%" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="Điểm yêu cầu" :show-feedback="false">
                <n-input-number v-model:value="form.claimPoints" style="width: 100%" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="Loại" :show-feedback="false">
                <n-select v-model:value="form.type" :options="typeOptions" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="Ghi chú" :show-feedback="false">
                <n-input v-model:value="form.note" placeholder="Không bắt buộc" />
              </n-form-item>
            </n-gi>
          </n-grid>

          <div class="label" style="margin-top: 16px">
            Số tiền nhận được ($) từ từng tài khoản
            <span class="muted" style="font-weight: 400; text-transform: none">— tick "ước lượng" nếu chưa chính thức</span>
          </div>
          <n-grid cols="2 m:4 l:6" responsive="screen" :x-gap="8" :y-gap="8" style="margin-top: 8px">
            <n-gi v-for="acc in store.activeAccounts" :key="acc.id">
              <div class="reward-label">
                <span class="dot" :style="{ background: acc.color }"></span>{{ acc.displayName }}
              </div>
              <n-input-number
                v-model:value="form.rewards[acc.id]"
                :step="0.01"
                :show-button="false"
                :status="form.estimated[acc.id] ? 'warning' : undefined"
                placeholder="0"
                style="width: 100%"
              />
              <n-checkbox v-model:checked="form.estimated[acc.id]" size="small" style="margin-top: 4px; font-size: 11px">
                ước lượng
              </n-checkbox>
            </n-gi>
          </n-grid>

          <n-flex justify="end" :size="8" style="margin-top: 16px">
            <n-button @click="resetForm">Reset</n-button>
            <n-button type="primary" :loading="saving" @click="submit">
              {{ saving ? 'Đang lưu...' : 'Lưu dự án' }}
            </n-button>
          </n-flex>
        </div>
      </n-collapse-transition>
    </n-card>

    <!-- Danh sách dự án -->
    <n-card>
      <n-flex justify="space-between" align="center" :wrap="true" :size="8" style="margin-bottom: 12px">
        <span class="card-title">
          Danh sách dự án
          <span class="muted" style="font-weight: 400">({{ visibleProjects.length }}/{{ filteredProjects.length }})</span>
        </span>
        <n-flex align="center" :size="8" :wrap="true">
          <n-radio-group v-model:value="viewMode" size="small">
            <n-radio-button v-for="v in viewModes" :key="v.key" :value="v.key">{{ v.label }}</n-radio-button>
          </n-radio-group>
          <n-checkbox v-model:checked="onlyEstimated">
            Chỉ coin có ước lượng
            <span v-if="estimatedCount" class="muted" style="font-size: 11px">({{ estimatedCount }})</span>
          </n-checkbox>
          <n-input v-model:value="search" clearable placeholder="Tìm theo tên dự án..." size="small" style="width: 220px" />
        </n-flex>
      </n-flex>

      <n-empty
        v-if="filteredProjects.length === 0"
        :description="onlyEstimated ? 'Không có dự án nào có giá trị ước lượng' : 'Chưa có dự án nào'"
        style="padding: 32px 0"
      />

      <!-- ===== View: Danh sách ===== -->
      <n-table v-else-if="viewMode === 'list'" :bordered="false" :single-line="false" size="small">
        <thead>
          <tr>
            <th>Dự án</th>
            <th>Tài khoản nhận</th>
            <th class="ta-r" style="width: 128px">Tổng</th>
            <th style="width: 96px"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="p in visibleProjects" :key="p.id">
            <!-- DISPLAY ROW -->
            <tr v-if="editingId !== p.id" style="vertical-align: top">
              <td>
                <n-flex align="center" :size="8" :wrap="true">
                  <span class="proj-name">{{ p.name }}</span>
                  <n-tag size="small" :color="typeColor(p.type)" :bordered="false">{{ p.type }}</n-tag>
                </n-flex>
                <div class="muted" style="font-size: 12px; margin-top: 4px">
                  {{ p.date }} · Yêu cầu <b style="color: #475569">{{ p.claimPoints }}đ</b>
                  <span v-if="p.note" style="font-style: italic">· {{ p.note }}</span>
                </div>
                <n-tag v-if="projectHasEstimate(p)" type="warning" size="small" :bordered="false" round style="margin-top: 6px">
                  ⚠ Có giá trị ước lượng
                </n-tag>
              </td>
              <td>
                <table v-if="hasAnyReward(p)" class="inner-table">
                  <tbody>
                    <tr v-for="acc in accountsWithReward(p)" :key="acc.id" class="inner-row">
                      <td style="width: 1px"><span class="dot" :style="{ background: acc.color }"></span></td>
                      <td class="strong" style="white-space: nowrap; padding-right: 16px">{{ acc.displayName }}</td>
                      <td class="ta-r" style="white-space: nowrap">
                        <span v-if="isEstimated(p, acc.id)" class="est-chip">
                          ~{{ fmtUSD(p.rewards[acc.id]) }}<span style="font-size: 10px; text-transform: uppercase">ước lượng</span>
                        </span>
                        <span v-else class="strong" style="color: #334155">{{ fmtUSD(p.rewards[acc.id]) }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <span v-else class="muted" style="font-style: italic; font-size: 12px">Chưa ghi nhận reward</span>
              </td>
              <td class="ta-r">
                <div style="font-size: 18px; font-weight: 700; color: #16a34a">{{ fmtUSD(projectTotal(p)) }}</div>
                <div v-if="projectHasEstimate(p)" style="font-size: 10px; color: #d97706">gồm ước lượng</div>
              </td>
              <td class="ta-r">
                <n-flex justify="end" :size="4" :wrap="false">
                  <n-button size="tiny" text type="primary" @click="startEdit(p)">Sửa</n-button>
                  <n-button size="tiny" text type="error" @click="del(p)">Xóa</n-button>
                </n-flex>
              </td>
            </tr>

            <!-- EDIT ROW -->
            <tr v-else>
              <td colspan="4">
                <n-grid cols="1 m:5" responsive="screen" :x-gap="12" :y-gap="8">
                  <n-gi>
                    <n-form-item label="Tên dự án" :show-feedback="false"><n-input v-model:value="editForm.name" /></n-form-item>
                  </n-gi>
                  <n-gi>
                    <n-form-item label="Ngày" :show-feedback="false">
                      <n-date-picker v-model:formatted-value="editForm.date" value-format="dd/MM/yyyy" format="dd/MM/yyyy" type="date" :clearable="false" style="width: 100%" />
                    </n-form-item>
                  </n-gi>
                  <n-gi>
                    <n-form-item label="Điểm yêu cầu" :show-feedback="false"><n-input-number v-model:value="editForm.claimPoints" style="width: 100%" /></n-form-item>
                  </n-gi>
                  <n-gi>
                    <n-form-item label="Loại" :show-feedback="false"><n-select v-model:value="editForm.type" :options="typeOptions" /></n-form-item>
                  </n-gi>
                  <n-gi>
                    <n-form-item label="Ghi chú" :show-feedback="false"><n-input v-model:value="editForm.note" placeholder="Không bắt buộc" /></n-form-item>
                  </n-gi>
                </n-grid>

                <div class="label" style="margin-top: 12px">Số tiền nhận được ($)
                  <span class="muted" style="font-weight: 400; text-transform: none">— tick "ước lượng" nếu chưa chính thức</span>
                </div>
                <n-grid cols="2 m:4 l:6" responsive="screen" :x-gap="8" :y-gap="8" style="margin-top: 4px">
                  <n-gi v-for="acc in store.activeAccounts" :key="acc.id">
                    <div class="reward-label"><span class="dot" :style="{ background: acc.color }"></span>{{ acc.displayName }}</div>
                    <n-input-number
                      v-model:value="editForm.rewards[acc.id]"
                      :step="0.01"
                      :show-button="false"
                      :status="editForm.estimated[acc.id] ? 'warning' : undefined"
                      placeholder="0"
                      style="width: 100%"
                    />
                    <n-checkbox v-model:checked="editForm.estimated[acc.id]" size="small" style="margin-top: 4px; font-size: 11px">ước lượng</n-checkbox>
                  </n-gi>
                </n-grid>

                <n-flex justify="space-between" align="center" style="margin-top: 12px">
                  <div>
                    <span class="muted">Tổng: </span>
                    <span style="color: #16a34a; font-weight: 600">{{ fmtUSD(editTotal) }}</span>
                  </div>
                  <n-flex :size="8">
                    <n-button :disabled="savingEdit" @click="cancelEdit">Hủy</n-button>
                    <n-button type="primary" :loading="savingEdit" @click="saveEdit">
                      {{ savingEdit ? 'Đang lưu...' : 'Lưu' }}
                    </n-button>
                  </n-flex>
                </n-flex>
              </td>
            </tr>
          </template>
        </tbody>
      </n-table>

      <!-- ===== View: Bảng (pivot) ===== -->
      <div v-else>
        <n-flex align="center" :size="6" class="muted" style="font-size: 12px; margin-bottom: 8px">
          <span class="legend legend--est"></span>Giá trị ~ (nền vàng) = ước lượng · bấm tên dự án để sửa
        </n-flex>
        <div class="matrix-wrap">
          <table class="matrix">
            <thead>
              <tr>
                <th class="sticky-col sticky-top corner" style="min-width: 140px">Dự án</th>
                <th class="sticky-top">Ngày</th>
                <th class="sticky-top ta-r">Claim</th>
                <th class="sticky-top">Loại</th>
                <th v-for="a in projectMatrixAccounts" :key="a.id" class="sticky-top ta-r">
                  <span class="dot" :style="{ background: a.color }"></span>{{ a.displayName }}
                </th>
                <th class="sticky-top ta-r">Tổng</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in visibleProjects" :key="p.id" class="matrix-row">
                <td class="sticky-col name-cell" @click="editFromTable(p)">{{ p.name }}</td>
                <td>{{ p.date }}</td>
                <td class="ta-r muted">{{ p.claimPoints }}</td>
                <td><n-tag size="small" :color="typeColor(p.type)" :bordered="false">{{ p.type }}</n-tag></td>
                <td v-for="a in projectMatrixAccounts" :key="p.id + '-' + a.id" class="ta-r">
                  <template v-if="hasReward(p, a.id)">
                    <span v-if="isEstimated(p, a.id)" class="est-cell">~{{ fmtUSD(p.rewards[a.id]) }}</span>
                    <span v-else class="strong" style="color: #334155">{{ fmtUSD(p.rewards[a.id]) }}</span>
                  </template>
                  <span v-else class="dash">–</span>
                </td>
                <td class="ta-r" style="font-weight: 700; color: #16a34a">{{ fmtUSD(projectTotal(p)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <n-flex
        v-if="filteredProjects.length > visibleProjects.length || (showAll && filteredProjects.length > recentProjects.length)"
        justify="center"
        style="margin-top: 16px"
      >
        <n-button size="small" tertiary @click="showAll = !showAll">
          {{ showAll
            ? `Thu gọn (chỉ ${RECENT_DAYS} ngày gần nhất — ${recentProjects.length} dự án)`
            : `Xem tất cả ${filteredProjects.length} dự án` }}
        </n-button>
      </n-flex>
    </n-card>
  </n-flex>
</template>

<script setup>
import { reactive, ref, computed, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import {
  NFlex, NCard, NButton, NCollapseTransition, NGrid, NGi, NFormItem,
  NInput, NInputNumber, NSelect, NDatePicker, NCheckbox, NRadioGroup, NRadioButton,
  NTable, NTag, NEmpty,
} from 'naive-ui';
import { useTrackingStore } from '../stores/trackingStore';
import { useToastStore } from '../stores/toastStore';
import { dialog } from '../utils/naive';
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

// Khi search: bỏ giới hạn 15 ngày để tìm được dự án cũ.
const visibleProjects = computed(() => {
  if (showAll.value || search.value || onlyEstimated.value) return filteredProjects.value;
  return recentProjects.value;
});

function projectTotal(p) {
  return Object.values(p.rewards || {}).reduce((s, v) => s + (Number(v) || 0), 0);
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

function editFromTable(p) {
  viewMode.value = 'list';
  showAll.value = true;
  startEdit(p);
}

function accountsWithReward(p) {
  return store.accounts.filter((a) => {
    const n = Number(p.rewards?.[a.id]);
    return Number.isFinite(n) && n !== 0;
  });
}

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

function del(p) {
  dialog.warning({
    title: 'Xóa dự án',
    content: `Xóa dự án "${p.name}"?`,
    positiveText: 'Xóa',
    negativeText: 'Hủy',
    onPositiveClick: async () => {
      try {
        await store.deleteProject(p.id);
        await store.loadSummary();
        toast.success(`Đã xóa "${p.name}"`);
      } catch (e) {
        toast.error('Lỗi: ' + e.message);
      }
    },
  });
}
</script>

<style scoped>
.card-title { font-weight: 600; }
.muted { color: #94a3b8; }
.strong { font-weight: 600; }
.ta-r { text-align: right; }
.label { font-size: 12px; font-weight: 500; color: #64748b; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; margin-right: 4px; vertical-align: middle; }
.head-toggle { display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; }
.chevron { transition: transform 0.2s; display: inline-block; }
.chevron.open { transform: rotate(180deg); }
.reward-label { font-size: 12px; color: #475569; margin-bottom: 2px; display: flex; align-items: center; }
.proj-name { font-weight: 700; font-size: 15px; color: #1e293b; }

.inner-table { width: 100%; font-size: 13px; }
.inner-row td { padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
.inner-row:last-child td { border-bottom: 0; }
.est-chip, .est-cell {
  font-weight: 700; color: #d97706; background: #fffbeb;
  border: 1px solid #fde68a; border-radius: 4px; padding: 1px 6px;
  display: inline-flex; align-items: center; gap: 4px;
}

/* Pivot matrix */
.legend { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.legend--est { background: #fef3c7; border: 1px solid #fcd34d; }
.matrix-wrap { overflow: auto; max-height: 70vh; border: 1px solid #e2e8f0; border-radius: 8px; }
.matrix { border-collapse: separate; border-spacing: 0; font-size: 13px; font-variant-numeric: tabular-nums; min-width: 100%; }
.matrix th, .matrix td { border-bottom: 1px solid #e2e8f0; padding: 6px 10px; white-space: nowrap; }
.sticky-top { position: sticky; top: 0; z-index: 20; background: #f1f5f9; height: 36px; font-weight: 600; text-align: left; }
.sticky-col { position: sticky; left: 0; z-index: 10; background: #fff; }
.corner { z-index: 30; }
.matrix-row:hover td { background: #eff6ff; }
.matrix-row:hover .sticky-col { background: #eff6ff; }
.name-cell { font-weight: 600; color: #1e293b; cursor: pointer; border-right: 1px solid #e2e8f0; }
.name-cell:hover { color: #2563eb; }
.dash { color: #cbd5e1; }
</style>
