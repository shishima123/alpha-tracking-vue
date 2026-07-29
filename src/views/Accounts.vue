<template>
  <n-flex vertical :size="20">
    <!-- Form thêm account mới (thu gọn mặc định) -->
    <n-flex justify="end">
      <button class="head-toggle" @click="showForm = !showForm">
        {{ showForm ? 'Thu gọn' : 'Thêm tài khoản' }}
        <span class="chevron" :class="{ open: showForm }">▾</span>
      </button>
    </n-flex>
    <n-collapse-transition :show="showForm">
      <n-card>
        <div>
          <n-grid cols="2 m:3 l:6" responsive="screen" :x-gap="12" :y-gap="8">
            <n-gi>
              <n-form-item label="Tên (name)" :show-feedback="false">
                <n-input v-model:value="form.name" placeholder="vd: bo" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="Display name" :show-feedback="false">
                <n-input v-model:value="form.displayName" placeholder="vd: Bo" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="Thứ tự" :show-feedback="false">
                <n-input-number v-model:value="form.sortOrder" placeholder="0" style="width: 100%" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="Điểm Trade" :show-feedback="false">
                <n-input-number v-model:value="form.pointTrade" :min="1" :max="20" style="width: 100%" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="Điểm Hold" :show-feedback="false">
                <n-input-number v-model:value="form.pointHold" :min="0" style="width: 100%" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="Active" :show-feedback="false">
                <n-switch v-model:value="form.active">
                  <template #checked>Có</template>
                  <template #unchecked>Không</template>
                </n-switch>
              </n-form-item>
            </n-gi>

            <n-gi span="2">
              <n-form-item label="Email" :show-feedback="false">
                <n-input v-model:value="form.email" placeholder="vd: abc@gmail.com" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="X (Twitter)" :show-feedback="false">
                <n-input v-model:value="form.x" placeholder="vd: binance" />
              </n-form-item>
            </n-gi>
            <n-gi span="3">
              <n-form-item label="Địa chỉ BSC" :show-feedback="false">
                <n-input v-model:value="form.bscAddress" placeholder="0x..." />
              </n-form-item>
            </n-gi>
          </n-grid>

          <n-flex :size="24" :wrap="true" style="margin-top: 12px">
            <span class="switch-label" style="font-weight: 600">Ẩn ở tab:</span>
            <n-flex align="center" :size="8" :wrap="false">
              <n-switch v-model:value="form.hideInPoints" size="small" />
              <span class="switch-label">Điểm Alpha</span>
            </n-flex>
            <n-flex align="center" :size="8" :wrap="false">
              <n-switch v-model:value="form.hideInCalc" size="small" />
              <span class="switch-label">Máy tính</span>
            </n-flex>
            <n-flex align="center" :size="8" :wrap="false">
              <n-switch v-model:value="form.hideInAlpha" size="small" />
              <span class="switch-label">Dự án Alpha</span>
            </n-flex>
          </n-flex>

          <n-flex justify="end" :size="8" style="margin-top: 16px">
            <n-button @click="resetForm">Reset</n-button>
            <n-button type="primary" :loading="saving" :disabled="!form.name.trim()" @click="submit">
              {{ saving ? 'Đang lưu...' : 'Tạo tài khoản' }}
            </n-button>
          </n-flex>
          <n-text depth="3" style="font-size: 12px; display: block; margin-top: 8px">
            Vol mỗi lệnh, Vol hiện tại, Trước, Sau — chỉnh trực tiếp trong Máy tính (nút góc trên phải).
          </n-text>
        </div>
      </n-card>
    </n-collapse-transition>

    <!-- Danh sách + edit inline -->
    <n-card class="accounts-panel">
      <n-flex justify="space-between" align="center" :wrap="true" style="margin-bottom: 12px">
        <span class="card-title">
          Danh sách tài khoản
          <span class="muted" style="font-weight: 400">
            ({{ visibleAccounts.length }}{{ inactiveCount ? '/' + store.accounts.length : '' }})
          </span>
        </span>
        <n-flex v-if="inactiveCount" align="center" :size="8" :wrap="false">
          <n-switch v-model:value="showInactive" size="small" />
          <span class="switch-label">Hiện {{ inactiveCount }} tài khoản không active</span>
        </n-flex>
      </n-flex>

      <div class="table-scroll">
      <n-table :bordered="false" :single-line="false" size="small">
        <thead>
          <tr>
            <th class="ta-c" style="width: 56px">#</th>
            <th style="min-width: 170px">Tài khoản</th>
            <th style="width: 230px">Liên hệ</th>
            <th class="ta-c" style="width: 70px">Active</th>
            <th class="ta-c" style="width: 150px">Ẩn ở tab</th>
            <th class="ta-c" style="width: 150px">Điểm (Trade + Hold)</th>
            <th style="width: 110px"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="a in visibleAccounts" :key="a.id">
            <!-- Display row -->
            <tr v-if="editingId !== a.id" :class="{ 'row-inactive': !a.active }">
              <td class="ta-c muted">{{ a.sortOrder ?? 0 }}</td>
              <td>
                <div class="strong">{{ a.displayName }}</div>
                <div class="muted" style="font-size: 12px">{{ a.id }}</div>
              </td>
              <td class="contact-cell">
                <div v-if="a.email" class="contact-line" :title="a.email">✉ {{ a.email }}</div>
                <div v-if="a.x" class="contact-line">
                  <a class="contact-link" :href="`https://x.com/${a.x}`" target="_blank" rel="noopener">
                    𝕏 @{{ a.x }}
                  </a>
                </div>
                <div v-if="a.bscAddress" class="contact-line">
                  <button class="addr" :title="`${a.bscAddress} — bấm để copy`" @click="copyText(a.bscAddress)">
                    ◆ {{ shortAddr(a.bscAddress) }}
                  </button>
                </div>
                <span v-if="!a.email && !a.x && !a.bscAddress" class="muted">—</span>
              </td>
              <!-- Switch chỉ để xem — muốn đổi phải bấm Sửa. -->
              <td class="ta-c"><n-switch size="small" :value="!!a.active" disabled class="view-switch" /></td>
              <td class="ta-c">
                <!-- Chỉ hiện tab nào ĐANG bị ẩn → đa số dòng chỉ là dấu '—', dễ quét mắt. -->
                <n-flex justify="center" :size="4" :wrap="true">
                  <span v-if="a.hideInPoints" class="tag">Điểm</span>
                  <span v-if="a.hideInCalc" class="tag">Máy tính</span>
                  <span v-if="a.hideInAlpha" class="tag">Dự án</span>
                  <span v-if="!a.hideInPoints && !a.hideInCalc && !a.hideInAlpha" class="muted">—</span>
                </n-flex>
              </td>
              <td class="ta-c">
                <span class="muted">{{ a.pointTrade }} + {{ a.pointHold }} = </span>
                <span class="pts-total">{{ (a.pointTrade || 0) + (a.pointHold || 0) }}</span>
              </td>
              <td class="actions-cell">
                <n-flex justify="center" align="center" :size="12" :wrap="false">
                  <n-button size="tiny" text type="primary" @click="startEdit(a)">Sửa</n-button>
                  <n-button size="tiny" text type="error" @click="del(a)">Xóa</n-button>
                </n-flex>
              </td>
            </tr>

            <!-- Edit row -->
            <tr v-else class="row-edit">
              <td class="ta-c">
                <n-input-number v-model:value="editForm.sortOrder" size="small" :show-button="false" style="width: 48px" />
              </td>
              <td>
                <n-input v-model:value="editForm.displayName" size="small" placeholder="Display name" />
                <div class="muted" style="font-size: 12px; margin-top: 4px">{{ a.id }} (cố định)</div>
              </td>
              <td>
                <n-flex vertical :size="4">
                  <n-input v-model:value="editForm.email" size="tiny" placeholder="Email" />
                  <n-input v-model:value="editForm.x" size="tiny" placeholder="X (không cần @)" />
                  <n-input v-model:value="editForm.bscAddress" size="tiny" placeholder="Địa chỉ BSC (0x...)" />
                </n-flex>
              </td>
              <td class="ta-c"><n-switch v-model:value="editForm.active" size="small" /></td>
              <td>
                <n-flex vertical :size="4">
                  <n-flex align="center" :size="6" :wrap="false">
                    <n-switch v-model:value="editForm.hideInPoints" size="small" />
                    <span class="switch-label">Điểm</span>
                  </n-flex>
                  <n-flex align="center" :size="6" :wrap="false">
                    <n-switch v-model:value="editForm.hideInCalc" size="small" />
                    <span class="switch-label">Máy tính</span>
                  </n-flex>
                  <n-flex align="center" :size="6" :wrap="false">
                    <n-switch v-model:value="editForm.hideInAlpha" size="small" />
                    <span class="switch-label">Dự án</span>
                  </n-flex>
                </n-flex>
              </td>
              <td>
                <n-flex align="center" justify="center" :size="6" :wrap="false">
                  <n-input-number
                    v-model:value="editForm.pointTrade" :min="1" :max="20"
                    size="tiny" :show-button="false" style="width: 46px"
                  />
                  <span class="muted">+</span>
                  <n-input-number
                    v-model:value="editForm.pointHold" :min="0"
                    size="tiny" :show-button="false" style="width: 46px"
                  />
                  <span class="muted">=</span>
                  <span class="pts-total">
                    {{ (Number(editForm.pointTrade) || 0) + (Number(editForm.pointHold) || 0) }}
                  </span>
                </n-flex>
              </td>
              <td class="actions-cell">
                <n-flex justify="center" align="center" :size="12" :wrap="false">
                  <n-button size="tiny" text type="success" :disabled="savingEdit" @click="saveEdit">
                    {{ savingEdit ? '...' : 'Lưu' }}
                  </n-button>
                  <n-button size="tiny" text :disabled="savingEdit" @click="cancelEdit">Hủy</n-button>
                </n-flex>
              </td>
            </tr>
          </template>
          <tr v-if="visibleAccounts.length === 0">
            <td colspan="7" class="empty">
              {{ store.accounts.length === 0 ? 'Chưa có tài khoản nào' : 'Tất cả tài khoản đang bị ẩn (không active)' }}
            </td>
          </tr>
        </tbody>
      </n-table>
      </div>
    </n-card>
  </n-flex>
</template>

<script setup>
import { reactive, ref, computed } from 'vue';
import { useStorage } from '@vueuse/core';
import {
  NFlex, NCard, NButton, NCollapseTransition, NGrid, NGi, NFormItem,
  NInput, NInputNumber, NSwitch, NTable, NText,
} from 'naive-ui';
import { useTrackingStore } from '../stores/trackingStore';
import { useToastStore } from '../stores/toastStore';
import { dialog, confirmAction } from '../utils/naive';

const store = useTrackingStore();
const toast = useToastStore();

const showForm = ref(false); // form thêm tài khoản thu gọn mặc định

// Mặc định ẩn tài khoản không active; checkbox để hiện (lưu localStorage).
const showInactive = useStorage('alpha:accountsShowInactive', false);
const inactiveCount = computed(() => store.accounts.filter((a) => !a.active).length);
const visibleAccounts = computed(() =>
  showInactive.value ? store.accounts : store.accounts.filter((a) => a.active)
);

const DEFAULT_FORM = {
  name: '',
  displayName: '',
  active: true,
  pointTrade: 15,
  pointHold: 2,
  sortOrder: 0,
  hideInPoints: false,
  hideInCalc: false,
  hideInAlpha: false,
  email: '',
  x: '',
  bscAddress: '',
};

// 0x1234...abcd — bản đầy đủ nằm ở title, bấm để copy.
function shortAddr(addr) {
  const s = String(addr || '');
  return s.length > 14 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Đã copy: ' + text);
  } catch (_) {
    toast.error('Trình duyệt không cho copy');
  }
}

const form = reactive({ ...DEFAULT_FORM });
const saving = ref(false);

function resetForm() {
  Object.assign(form, DEFAULT_FORM);
}

async function submit() {
  const name = form.name.trim();
  if (!name) {
    toast.error('Tên là bắt buộc');
    return;
  }
  if (!(await confirmAction({
    title: 'Tạo tài khoản',
    content: `Tạo tài khoản "${form.displayName.trim() || name}"?`,
    positiveText: 'Tạo',
    type: 'info',
  }))) return;
  saving.value = true;
  try {
    await store.createAccount({
      name,
      displayName: form.displayName.trim() || name,
      active: form.active,
      pointTrade: form.pointTrade,
      pointHold: form.pointHold,
      sortOrder: Number(form.sortOrder) || 0,
      hideInPoints: !!form.hideInPoints,
      hideInCalc: !!form.hideInCalc,
      hideInAlpha: !!form.hideInAlpha,
      email: form.email.trim(),
      x: form.x.trim().replace(/^@/, ''),
      bscAddress: form.bscAddress.trim(),
    });
    toast.success(`Đã tạo tài khoản "${name}"`);
    resetForm();
  } catch (e) {
    toast.error('Lỗi tạo: ' + e.message);
  } finally {
    saving.value = false;
  }
}

// ===== Inline edit =====
const editingId = ref(null);
const editForm = reactive({
  displayName: '',
  active: true,
  pointTrade: 15,
  pointHold: 2,
  sortOrder: 0,
  hideInPoints: false,
  hideInCalc: false,
  hideInAlpha: false,
  email: '',
  x: '',
  bscAddress: '',
});
const savingEdit = ref(false);

function startEdit(a) {
  editingId.value = a.id;
  editForm.displayName = a.displayName || '';
  editForm.active = !!a.active;
  editForm.pointTrade = a.pointTrade ?? 15;
  editForm.pointHold = a.pointHold ?? 2;
  editForm.sortOrder = a.sortOrder ?? 0;
  editForm.hideInPoints = !!a.hideInPoints;
  editForm.hideInCalc = !!a.hideInCalc;
  editForm.hideInAlpha = !!a.hideInAlpha;
  editForm.email = a.email || '';
  editForm.x = a.x || '';
  editForm.bscAddress = a.bscAddress || '';
}

function cancelEdit() {
  editingId.value = null;
}

async function saveEdit() {
  if (!editingId.value) return;
  if (!(await confirmAction({
    title: 'Cập nhật tài khoản',
    content: `Lưu thay đổi cho "${editForm.displayName}"?`,
    positiveText: 'Lưu',
    type: 'info',
  }))) return;
  savingEdit.value = true;
  try {
    await store.updateAccount(editingId.value, {
      displayName: editForm.displayName,
      active: editForm.active,
      pointTrade: editForm.pointTrade,
      pointHold: editForm.pointHold,
      sortOrder: Number(editForm.sortOrder) || 0,
      hideInPoints: !!editForm.hideInPoints,
      hideInCalc: !!editForm.hideInCalc,
      hideInAlpha: !!editForm.hideInAlpha,
      email: editForm.email.trim(),
      x: editForm.x.trim().replace(/^@/, ''),
      bscAddress: editForm.bscAddress.trim(),
    });
    toast.success(`Đã cập nhật "${editForm.displayName}"`);
    editingId.value = null;
  } catch (e) {
    toast.error('Lỗi cập nhật: ' + e.message);
  } finally {
    savingEdit.value = false;
  }
}

function del(a) {
  dialog.warning({
    title: 'Xóa tài khoản',
    content: `Xóa "${a.displayName}" (id: ${a.id})? Phí + reward đã ghi sẽ KHÔNG bị xóa nhưng sẽ trỏ về account đã mất.`,
    positiveText: 'Xóa',
    negativeText: 'Hủy',
    onPositiveClick: async () => {
      try {
        await store.removeAccount(a.id);
        toast.success(`Đã xóa "${a.displayName}"`);
      } catch (e) {
        toast.error('Lỗi xóa: ' + e.message);
      }
    },
  });
}
</script>

<style scoped>
/* Card lớn nền xám nhạt (đồng bộ tab Điểm / Phí / Alpha) — bảng trắng nổi lên trên. */
.accounts-panel { background: #eef1f6; }
.accounts-panel :deep(.n-card-content) { padding: 16px !important; }
@media (max-width: 768px) {
  .accounts-panel :deep(.n-card-content) { padding: 10px !important; }
}
.card-title { font-weight: 600; }
.switch-label { font-size: 13px; color: #475569; user-select: none; }
/* Switch ở dòng xem (disabled): giữ màu bình thường cho dễ nhìn, chỉ khóa tương tác. */
.view-switch { opacity: 1 !important; }
.view-switch :deep(.n-switch__rail) { cursor: default !important; }
.muted { color: #94a3b8; }
.strong { font-weight: 600; }
.ta-r { text-align: right; }
.ta-c { text-align: center; }
.actions-cell { vertical-align: middle; }
/* Tài khoản không active: làm mờ nhẹ để phân biệt khi bật "Hiện ... không active". */
.row-inactive > td { opacity: 0.55; }
.row-edit > td { background-color: #f8fafc; }
/* Hover row — đồng bộ với các bảng khác. */
tbody td { transition: background-color 0.15s; }
tbody tr:hover > td { background-color: #f3f4f5; }
.table-scroll {
  overflow-x: auto;
  background: #fff;
  border: 1px solid #efeff5;
  border-radius: 8px;
}
.table-scroll :deep(th),
.table-scroll :deep(td) { white-space: nowrap; }
.actions-cell :deep(.n-button) {
  padding: 3px 10px;
  border-radius: 6px;
  transition: background-color 0.15s;
}
.actions-cell :deep(.n-button:hover) {
  background-color: #f1f3f5;
}
.empty { text-align: center; padding: 24px; color: #94a3b8; }

/* Cột Liên hệ — 3 dòng nhỏ, địa chỉ rút gọn bấm để copy. */
.contact-cell { max-width: 230px; }
.contact-line {
  font-size: 12px;
  color: #64748b;
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
}
.contact-link { color: #2563eb; text-decoration: none; }
.contact-link:hover { text-decoration: underline; }
.addr {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: #64748b;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.addr:hover { color: #2563eb; }

/* Tag "đang bị ẩn ở tab X" — chỉ hiện khi bật, nên bảng sạch ở trạng thái mặc định. */
.tag {
  display: inline-block;
  font-size: 11px;
  line-height: 1.6;
  padding: 0 8px;
  border-radius: 999px;
  background: #fff1f2;
  color: #e11d48;
  border: 1px solid #fecdd3;
}
.pts-total { font-weight: 600; color: #2563eb; }

.head-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  background: #fff;
  border: 1px solid #efeff5;
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  transition: border-color 0.15s, color 0.15s;
}
.head-toggle:hover { border-color: #2563eb; color: #2563eb; }
.chevron { transition: transform 0.2s; display: inline-block; }
.chevron.open { transform: rotate(180deg); }
</style>
