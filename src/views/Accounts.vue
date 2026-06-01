<template>
  <n-flex vertical :size="20">
    <!-- Form thêm account mới (thu gọn mặc định) -->
    <n-card>
      <div class="head-toggle" @click="showForm = !showForm">
        <span class="card-title">Thêm tài khoản mới</span>
        <n-flex align="center" :size="4" class="muted">
          {{ showForm ? 'Thu gọn' : 'Thêm tài khoản' }}
          <span class="chevron" :class="{ open: showForm }">▾</span>
        </n-flex>
      </div>

      <n-collapse-transition :show="showForm">
        <div style="padding-top: 16px">
          <n-grid cols="2 m:3 l:7" responsive="screen" :x-gap="12" :y-gap="8">
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
              <n-form-item label="Màu" :show-feedback="false">
                <n-color-picker v-model:value="form.color" :show-alpha="false" :modes="['hex']" />
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
              <n-form-item label="Thứ tự" :show-feedback="false">
                <n-input-number v-model:value="form.sortOrder" placeholder="0" style="width: 100%" />
              </n-form-item>
            </n-gi>
          </n-grid>

          <n-checkbox v-model:checked="form.hideInPoints" style="margin-top: 8px">
            Ẩn ở tab Điểm Alpha
          </n-checkbox>

          <n-flex justify="end" :size="8" style="margin-top: 16px">
            <n-button @click="resetForm">Reset</n-button>
            <n-button type="primary" :loading="saving" :disabled="!form.name.trim()" @click="submit">
              {{ saving ? 'Đang lưu...' : 'Tạo tài khoản' }}
            </n-button>
          </n-flex>
          <n-text depth="3" style="font-size: 12px; display: block; margin-top: 8px">
            Vol mỗi lệnh, Vol hiện tại, Trước, Sau — chỉnh trực tiếp trong modal 🧮 (góc dưới phải).
          </n-text>
        </div>
      </n-collapse-transition>
    </n-card>

    <!-- Danh sách + edit inline -->
    <n-card>
      <n-flex justify="space-between" align="center" :wrap="true" style="margin-bottom: 12px">
        <span class="card-title">
          Danh sách tài khoản
          <span class="muted" style="font-weight: 400">
            ({{ visibleAccounts.length }}{{ inactiveCount ? '/' + store.accounts.length : '' }})
          </span>
        </span>
        <n-checkbox v-if="inactiveCount" v-model:checked="showInactive">
          Hiện {{ inactiveCount }} tài khoản không active
        </n-checkbox>
      </n-flex>

      <n-table :bordered="false" :single-line="false" size="small">
        <thead>
          <tr>
            <th class="ta-c" style="width: 80px">Thứ tự</th>
            <th>Tên / Display</th>
            <th style="width: 110px">Màu</th>
            <th class="ta-c" style="width: 70px">Active</th>
            <th class="ta-c" style="width: 80px">Ẩn điểm</th>
            <th class="ta-r" style="width: 80px">Đ.Trade</th>
            <th class="ta-r" style="width: 80px">Đ.Hold</th>
            <th class="ta-r" style="width: 70px">Đ.Tổng</th>
            <th style="width: 110px"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="a in visibleAccounts" :key="a.id">
            <!-- Display row -->
            <tr v-if="editingId !== a.id">
              <td class="ta-c muted">{{ a.sortOrder ?? 0 }}</td>
              <td>
                <n-flex align="center" :size="8" :wrap="false">
                  <span class="dot" :style="{ background: a.color }"></span>
                  <div>
                    <div class="strong">{{ a.displayName }}</div>
                    <div class="muted" style="font-size: 12px">{{ a.id }}</div>
                  </div>
                </n-flex>
              </td>
              <td class="muted mono">{{ a.color }}</td>
              <td class="ta-c">
                <n-tag size="small" :type="a.active ? 'success' : 'default'" :bordered="false">
                  {{ a.active ? '✓' : '✕' }}
                </n-tag>
              </td>
              <td class="ta-c">
                <n-tag size="small" :type="a.hideInPoints ? 'warning' : 'default'" :bordered="false">
                  {{ a.hideInPoints ? '✓' : '—' }}
                </n-tag>
              </td>
              <td class="ta-r">{{ a.pointTrade }}</td>
              <td class="ta-r">{{ a.pointHold }}</td>
              <td class="ta-r strong" style="color: #2563eb">{{ (a.pointTrade || 0) + (a.pointHold || 0) }}</td>
              <td class="actions-cell">
                <n-flex justify="center" align="center" :size="12" :wrap="false">
                  <n-button size="tiny" text type="primary" @click="startEdit(a)">Sửa</n-button>
                  <n-button size="tiny" text type="error" @click="del(a)">Xóa</n-button>
                </n-flex>
              </td>
            </tr>

            <!-- Edit row -->
            <tr v-else>
              <td class="ta-c"><n-input-number v-model:value="editForm.sortOrder" size="small" style="width: 70px" /></td>
              <td>
                <n-flex align="center" :size="8" :wrap="false">
                  <n-color-picker v-model:value="editForm.color" :show-alpha="false" :modes="['hex']" style="width: 40px" />
                  <n-input v-model:value="editForm.displayName" size="small" placeholder="Display name" />
                </n-flex>
                <div class="muted" style="font-size: 12px; margin-top: 4px">{{ a.id }} (cố định)</div>
              </td>
              <td class="muted mono">{{ editForm.color }}</td>
              <td class="ta-c"><n-switch v-model:value="editForm.active" size="small" /></td>
              <td class="ta-c"><n-checkbox v-model:checked="editForm.hideInPoints" /></td>
              <td><n-input-number v-model:value="editForm.pointTrade" :min="1" :max="20" size="small" style="width: 70px" /></td>
              <td><n-input-number v-model:value="editForm.pointHold" :min="0" size="small" style="width: 70px" /></td>
              <td class="ta-r strong" style="color: #2563eb">
                {{ (Number(editForm.pointTrade) || 0) + (Number(editForm.pointHold) || 0) }}
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
            <td colspan="9" class="empty">
              {{ store.accounts.length === 0 ? 'Chưa có tài khoản nào' : 'Tất cả tài khoản đang bị ẩn (không active)' }}
            </td>
          </tr>
        </tbody>
      </n-table>
    </n-card>
  </n-flex>
</template>

<script setup>
import { reactive, ref, computed } from 'vue';
import { useStorage } from '@vueuse/core';
import {
  NFlex, NCard, NButton, NCollapseTransition, NGrid, NGi, NFormItem,
  NInput, NInputNumber, NColorPicker, NSwitch, NCheckbox, NTable, NTag, NText,
} from 'naive-ui';
import { useTrackingStore } from '../stores/trackingStore';
import { useToastStore } from '../stores/toastStore';
import { dialog } from '../utils/naive';

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
  color: '#3b82f6',
  active: true,
  pointTrade: 15,
  pointHold: 2,
  sortOrder: 0,
  hideInPoints: false,
};

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
  saving.value = true;
  try {
    await store.createAccount({
      name,
      displayName: form.displayName.trim() || name,
      color: form.color,
      active: form.active,
      pointTrade: form.pointTrade,
      pointHold: form.pointHold,
      sortOrder: Number(form.sortOrder) || 0,
      hideInPoints: !!form.hideInPoints,
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
  color: '#3b82f6',
  active: true,
  pointTrade: 15,
  pointHold: 2,
  sortOrder: 0,
  hideInPoints: false,
});
const savingEdit = ref(false);

function startEdit(a) {
  editingId.value = a.id;
  editForm.displayName = a.displayName || '';
  editForm.color = a.color || '#3b82f6';
  editForm.active = !!a.active;
  editForm.pointTrade = a.pointTrade ?? 15;
  editForm.pointHold = a.pointHold ?? 2;
  editForm.sortOrder = a.sortOrder ?? 0;
  editForm.hideInPoints = !!a.hideInPoints;
}

function cancelEdit() {
  editingId.value = null;
}

async function saveEdit() {
  if (!editingId.value) return;
  savingEdit.value = true;
  try {
    await store.updateAccount(editingId.value, {
      displayName: editForm.displayName,
      color: editForm.color,
      active: editForm.active,
      pointTrade: editForm.pointTrade,
      pointHold: editForm.pointHold,
      sortOrder: Number(editForm.sortOrder) || 0,
      hideInPoints: !!editForm.hideInPoints,
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
.card-title { font-weight: 600; }
.muted { color: #94a3b8; }
.strong { font-weight: 600; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; }
.ta-r { text-align: right; }
.ta-c { text-align: center; }
.actions-cell { vertical-align: middle; }
.actions-cell :deep(.n-button) {
  padding: 3px 10px;
  border-radius: 6px;
  transition: background-color 0.15s;
}
.actions-cell :deep(.n-button:hover) {
  background-color: #f1f3f5;
}
.empty { text-align: center; padding: 24px; color: #94a3b8; }
.dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.head-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}
.chevron { transition: transform 0.2s; display: inline-block; }
.chevron.open { transform: rotate(180deg); }
</style>
