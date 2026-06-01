<template>
  <div class="space-y-6">
    <!-- Form thêm account mới (thu gọn mặc định) -->
    <div class="card">
      <button
        class="w-full flex items-center justify-between text-left"
        @click="showForm = !showForm"
      >
        <h3 class="font-semibold">Thêm tài khoản mới</h3>
        <span class="flex items-center gap-1 text-sm text-gray-500">
          {{ showForm ? 'Thu gọn' : 'Thêm tài khoản' }}
          <span class="transition-transform" :class="showForm ? 'rotate-180' : ''">▾</span>
        </span>
      </button>

      <div
        class="grid transition-[grid-template-rows] duration-300 ease-in-out"
        :class="showForm ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
      >
      <div class="overflow-hidden">
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 pt-4">
        <div>
          <label class="label">Tên (name)</label>
          <input v-model="form.name" class="input" placeholder="vd: bo" />
        </div>
        <div>
          <label class="label">Display name</label>
          <input v-model="form.displayName" class="input" placeholder="vd: Bo" />
        </div>
        <div>
          <label class="label">Màu</label>
          <input v-model="form.color" type="color" class="input h-10 p-1" />
        </div>
        <div>
          <label class="label">Active</label>
          <label class="input flex items-center gap-2 cursor-pointer">
            <input v-model="form.active" type="checkbox" />
            <span class="text-sm">{{ form.active ? 'Có' : 'Không' }}</span>
          </label>
        </div>
        <div>
          <label class="label">Điểm Trade</label>
          <input v-model.number="form.pointTrade" type="number" min="1" max="20" class="input" />
        </div>
        <div>
          <label class="label">Điểm Hold</label>
          <input v-model.number="form.pointHold" type="number" min="0" class="input" />
        </div>
        <div>
          <label class="label">Thứ tự</label>
          <input
            v-model.number="form.sortOrder"
            type="number"
            class="input"
            placeholder="0"
          />
        </div>
      </div>
      <div class="mt-3">
        <label class="flex items-center gap-2 cursor-pointer text-sm text-gray-700 w-fit">
          <input v-model="form.hideInPoints" type="checkbox" class="accent-binance-yellow" />
          Ẩn ở tab Điểm Alpha
        </label>
      </div>
      <div class="flex items-center justify-end gap-2 mt-4">
        <button class="btn-secondary" @click="resetForm">Reset</button>
        <button class="btn-primary" :disabled="saving || !form.name.trim()" @click="submit">
          <span v-if="saving" class="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          {{ saving ? 'Đang lưu...' : 'Tạo tài khoản' }}
        </button>
      </div>
      <p class="text-xs text-gray-500 mt-2">
        Vol mỗi lệnh, Vol hiện tại, Trước, Sau — chỉnh trực tiếp trong modal 🧮 (góc dưới phải).
      </p>
      </div>
      </div>
    </div>

    <!-- Danh sách + edit inline -->
    <div class="card overflow-x-auto">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 class="font-semibold">
          Danh sách tài khoản
          <span class="text-gray-500 font-normal">
            ({{ visibleAccounts.length }}{{ inactiveCount ? '/' + store.accounts.length : '' }})
          </span>
        </h3>
        <label
          v-if="inactiveCount"
          class="flex items-center gap-2 cursor-pointer text-sm text-gray-600 select-none"
        >
          <input v-model="showInactive" type="checkbox" class="accent-binance-yellow" />
          Hiện {{ inactiveCount }} tài khoản không active
        </label>
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="table-thead">
            <th class="px-2 py-2 text-right w-20">Thứ tự</th>
            <th class="px-3 py-2">Tên / Display</th>
            <th class="px-2 py-2 w-24">Màu</th>
            <th class="px-2 py-2 text-center w-16">Active</th>
            <th class="px-2 py-2 text-center w-20" title="Ẩn ở tab Điểm Alpha">Ẩn điểm</th>
            <th class="px-2 py-2 text-right w-20">Đ.Trade</th>
            <th class="px-2 py-2 text-right w-20">Đ.Hold</th>
            <th class="px-2 py-2 text-right w-16">Đ.Tổng</th>
            <th class="px-3 py-2 w-24 text-right"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="a in visibleAccounts" :key="a.id">
            <!-- Display row -->
            <tr v-if="editingId !== a.id" class="hover:bg-binance-light/30">
              <td class="table-td text-right text-gray-700">{{ a.sortOrder ?? 0 }}</td>
              <td class="table-td">
                <div class="flex items-center gap-2">
                  <span class="inline-block w-3 h-3 rounded-full" :style="{ background: a.color }"></span>
                  <div>
                    <div class="font-medium">{{ a.displayName }}</div>
                    <div class="text-xs text-gray-500">{{ a.id }}</div>
                  </div>
                </div>
              </td>
              <td class="table-td text-xs text-gray-500 font-mono">{{ a.color }}</td>
              <td class="table-td text-center">
                <span class="badge" :class="a.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'">
                  {{ a.active ? '✓' : '✕' }}
                </span>
              </td>
              <td class="table-td text-center">
                <span class="badge" :class="a.hideInPoints ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-500'">
                  {{ a.hideInPoints ? '✓' : '—' }}
                </span>
              </td>
              <td class="table-td text-right">{{ a.pointTrade }}</td>
              <td class="table-td text-right">{{ a.pointHold }}</td>
              <td class="table-td text-right text-binance-yellow font-semibold">
                {{ (a.pointTrade || 0) + (a.pointHold || 0) }}
              </td>
              <td class="table-td text-right space-x-2 whitespace-nowrap">
                <button class="text-binance-yellow hover:text-blue-700 text-xs" @click="startEdit(a)">Sửa</button>
                <button class="text-red-600 hover:text-red-700 text-xs" @click="del(a)">Xóa</button>
              </td>
            </tr>

            <!-- Edit row -->
            <tr v-else class="bg-binance-light/30">
              <td class="table-td">
                <input v-model.number="editForm.sortOrder" type="number" class="input py-1 px-2 text-right w-16" />
              </td>
              <td class="table-td">
                <div class="flex items-center gap-2">
                  <input v-model="editForm.color" type="color" class="w-8 h-8 rounded border border-binance-light p-0 cursor-pointer shrink-0" />
                  <input v-model="editForm.displayName" class="input py-1 min-w-0 flex-1" placeholder="Display name" />
                </div>
                <div class="text-xs text-gray-500 mt-1">{{ a.id }} (cố định)</div>
              </td>
              <td class="table-td text-xs text-gray-500 font-mono">{{ editForm.color }}</td>
              <td class="table-td text-center">
                <input v-model="editForm.active" type="checkbox" />
              </td>
              <td class="table-td text-center">
                <input v-model="editForm.hideInPoints" type="checkbox" class="accent-binance-yellow" />
              </td>
              <td class="table-td">
                <input v-model.number="editForm.pointTrade" type="number" min="1" max="20" class="input py-1 px-2 text-right w-16" />
              </td>
              <td class="table-td">
                <input v-model.number="editForm.pointHold" type="number" min="0" class="input py-1 px-2 text-right w-16" />
              </td>
              <td class="table-td text-right text-binance-yellow font-semibold">
                {{ (Number(editForm.pointTrade) || 0) + (Number(editForm.pointHold) || 0) }}
              </td>
              <td class="table-td text-right space-x-2 whitespace-nowrap">
                <button class="text-green-600 hover:text-green-700 text-xs" :disabled="savingEdit" @click="saveEdit">
                  {{ savingEdit ? '...' : 'Lưu' }}
                </button>
                <button class="text-gray-500 hover:text-gray-700 text-xs" :disabled="savingEdit" @click="cancelEdit">
                  Hủy
                </button>
              </td>
            </tr>
          </template>
          <tr v-if="visibleAccounts.length === 0">
            <td colspan="9" class="text-center py-6 text-gray-500">
              {{ store.accounts.length === 0 ? 'Chưa có tài khoản nào' : 'Tất cả tài khoản đang bị ẩn (không active)' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed } from 'vue';
import { useStorage } from '@vueuse/core';
import { useTrackingStore } from '../stores/trackingStore';
import { useToastStore } from '../stores/toastStore';

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

async function del(a) {
  if (!confirm(`Xóa tài khoản "${a.displayName}" (id: ${a.id})? Phí + reward đã ghi sẽ KHÔNG bị xóa nhưng sẽ trỏ về account đã mất.`)) return;
  try {
    await store.removeAccount(a.id);
    toast.success(`Đã xóa "${a.displayName}"`);
  } catch (e) {
    toast.error('Lỗi xóa: ' + e.message);
  }
}
</script>
