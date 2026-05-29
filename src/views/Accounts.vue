<template>
  <div class="space-y-6">
    <!-- Form thêm account mới -->
    <div class="card">
      <h3 class="font-semibold mb-4">Thêm tài khoản mới</h3>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
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
      <div class="flex items-center justify-end gap-2 mt-4">
        <button class="btn-secondary" @click="resetForm">Reset</button>
        <button class="btn-primary" :disabled="saving || !form.name.trim()" @click="submit">
          <span v-if="saving" class="inline-block w-3 h-3 border-2 border-binance-dark border-t-transparent rounded-full animate-spin"></span>
          {{ saving ? 'Đang lưu...' : 'Tạo tài khoản' }}
        </button>
      </div>
      <p class="text-xs text-gray-500 mt-2">
        Vol mỗi lệnh, Vol hiện tại, Trước, Sau — chỉnh trực tiếp trong modal 🧮 (góc dưới phải).
      </p>
    </div>

    <!-- Danh sách + edit inline -->
    <div class="card overflow-x-auto">
      <h3 class="font-semibold mb-3">
        Danh sách tài khoản ({{ store.accounts.length }})
      </h3>
      <table class="w-full text-sm">
        <thead>
          <tr class="table-thead">
            <th class="px-2 py-2 text-right w-20">Thứ tự</th>
            <th class="px-3 py-2">Tên / Display</th>
            <th class="px-2 py-2 w-24">Màu</th>
            <th class="px-2 py-2 text-center w-16">Active</th>
            <th class="px-2 py-2 text-right w-20">Đ.Trade</th>
            <th class="px-2 py-2 text-right w-20">Đ.Hold</th>
            <th class="px-2 py-2 text-right w-16">Đ.Tổng</th>
            <th class="px-3 py-2 w-24 text-right"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="a in store.accounts" :key="a.id">
            <!-- Display row -->
            <tr v-if="editingId !== a.id" class="hover:bg-binance-light/30">
              <td class="table-td text-right text-gray-300">{{ a.sortOrder ?? 0 }}</td>
              <td class="table-td">
                <div class="flex items-center gap-2">
                  <span class="inline-block w-3 h-3 rounded-full" :style="{ background: a.color }"></span>
                  <div>
                    <div class="font-medium">{{ a.displayName }}</div>
                    <div class="text-xs text-gray-500">{{ a.id }}</div>
                  </div>
                </div>
              </td>
              <td class="table-td text-xs text-gray-400 font-mono">{{ a.color }}</td>
              <td class="table-td text-center">
                <span class="badge" :class="a.active ? 'bg-green-900 text-green-200' : 'bg-gray-700 text-gray-400'">
                  {{ a.active ? '✓' : '✕' }}
                </span>
              </td>
              <td class="table-td text-right">{{ a.pointTrade }}</td>
              <td class="table-td text-right">{{ a.pointHold }}</td>
              <td class="table-td text-right text-binance-yellow font-semibold">
                {{ (a.pointTrade || 0) + (a.pointHold || 0) }}
              </td>
              <td class="table-td text-right space-x-2 whitespace-nowrap">
                <button class="text-binance-yellow hover:text-yellow-300 text-xs" @click="startEdit(a)">Sửa</button>
                <button class="text-red-400 hover:text-red-300 text-xs" @click="del(a)">Xóa</button>
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
              <td class="table-td text-xs text-gray-400 font-mono">{{ editForm.color }}</td>
              <td class="table-td text-center">
                <input v-model="editForm.active" type="checkbox" />
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
                <button class="text-green-400 hover:text-green-300 text-xs" :disabled="savingEdit" @click="saveEdit">
                  {{ savingEdit ? '...' : 'Lưu' }}
                </button>
                <button class="text-gray-400 hover:text-gray-300 text-xs" :disabled="savingEdit" @click="cancelEdit">
                  Hủy
                </button>
              </td>
            </tr>
          </template>
          <tr v-if="store.accounts.length === 0">
            <td colspan="8" class="text-center py-6 text-gray-500">
              Chưa có tài khoản nào
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useTrackingStore } from '../stores/trackingStore';
import { useToastStore } from '../stores/toastStore';

const store = useTrackingStore();
const toast = useToastStore();

const DEFAULT_FORM = {
  name: '',
  displayName: '',
  color: '#3b82f6',
  active: true,
  pointTrade: 15,
  pointHold: 2,
  sortOrder: 0,
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
