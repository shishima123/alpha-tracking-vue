<template>
  <div class="space-y-3 md:space-y-6">
    <!-- Management panel: archive + clear old (thu gọn mặc định) -->
    <div>
      <div class="flex justify-end mb-2">
        <button
          class="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-white border border-[#efeff5] rounded-full px-3 py-1 hover:border-blue-600 hover:text-blue-600 transition-colors"
          @click="showManage = !showManage"
        >
          Quản lý lịch sử {{ indicatorIcon }}
          <span class="transition-transform inline-block" :class="showManage ? 'rotate-180' : ''">▾</span>
        </button>
      </div>

      <div
        class="grid transition-[grid-template-rows] duration-300 ease-in-out"
        :class="showManage ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
      >
      <div class="overflow-hidden">
        <div class="card">
        <div class="flex items-center gap-2 flex-wrap mb-3">
          <n-button :loading="archiving" :disabled="!canArchive" @click="onArchive">
            Tổng hợp tháng cũ
            <span v-if="pendingMonths.length" style="color: #2563eb; margin-left: 4px">({{ pendingMonths.length }})</span>
          </n-button>
          <n-button type="error" ghost :loading="clearing" :disabled="!canClear" @click="onClearOld">
            Xóa lịch sử cũ
            <span v-if="canClear" class="text-gray-500" style="margin-left: 4px">({{ pastDaily.deletable }})</span>
          </n-button>
        </div>

        <n-alert :type="indicatorType" :title="indicatorTitle" :bordered="true">
          {{ indicatorDetail }}
        </n-alert>
        </div>
      </div>
      </div>
    </div>

    <!-- Tất cả phí trade -->
    <div class="card gray-card">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 class="font-semibold">
          Tất cả phí trade
          <span class="text-gray-500 font-normal">
            ({{ filteredFees.length }} bản ghi · {{ groupedByDate.length }} ngày)
          </span>
        </h3>
        <div class="flex items-center gap-2 flex-wrap">
          <n-radio-group v-model:value="viewMode" size="small">
            <n-radio-button v-for="v in viewModes" :key="v.key" :value="v.key">{{ v.label }}</n-radio-button>
          </n-radio-group>
          <n-select
            v-model:value="filter.accountId"
            :options="accountOptions"
            size="small"
            style="width: 180px"
          />
          <n-button size="small" quaternary circle @click="store.loadAll({ force: true })">↻</n-button>
        </div>
      </div>

      <!-- Highlight: bật/tắt + ngưỡng, và cảnh báo account sắp hết ngày đủ điều kiện -->
      <div class="mb-3 space-y-2">
        <div class="flex items-center gap-x-4 gap-y-1.5 flex-wrap text-sm">
          <label class="flex items-center gap-2 cursor-pointer">
            <n-switch v-model:value="showHighlight" size="small" />
            <span>Highlight ngày đã đánh dấu</span>
          </label>
          <template v-if="showHighlight">
            <div class="flex items-center gap-1.5 text-gray-500">
              <span>Cần</span>
              <n-input-number v-model:value="requiredDaysModel" :min="1" :show-button="false" size="small" style="width: 56px" />
              <span>ngày / 15 ngày</span>
            </div>
            <div class="flex items-center gap-1.5 text-gray-500">
              <span>Báo trước</span>
              <n-input-number v-model:value="warnDaysModel" :min="0" :show-button="false" size="small" style="width: 56px" />
              <span>ngày (màu ô)</span>
            </div>
            <div class="flex items-center gap-1.5 text-gray-500">
              <span>Theo dõi</span>
              <n-select
                v-model:value="trackedIds"
                :options="trackedOptions"
                multiple
                size="small"
                placeholder="Tất cả tài khoản"
                max-tag-count="responsive"
                clearable
                style="min-width: 180px; max-width: 320px"
              />
            </div>
          </template>
        </div>
        <n-alert
          v-if="showHighlight && (highlightWarnings.length || expiryWarnings.length)"
          type="warning"
          :bordered="true"
          title="Cần đi đánh dấu ngày"
        >
          <ul class="list-disc pl-4 space-y-0.5">
            <li v-for="w in highlightWarnings" :key="w.id">{{ w.text }}</li>
            <li v-for="w in expiryWarnings" :key="`exp-${w.id}`">{{ w.text }}</li>
          </ul>
        </n-alert>
        <n-alert
          v-else-if="showHighlight && trackedAccounts.length"
          type="success"
          :bordered="true"
        >
          ✓ Không tài khoản nào cần cảnh báo ({{ trackedIds.length ? `${trackedAccounts.length} tài khoản đang theo dõi` : 'mọi tài khoản' }} đã đủ {{ requiredDays }} ngày đánh dấu và chưa có ngày đánh dấu nào sắp hết hạn).
        </n-alert>
      </div>

      <n-empty v-if="groupedByDate.length === 0" description="Chưa có bản ghi nào — bấm nút Máy tính (góc trên phải) để nhập phí." style="padding: 32px 0" />

      <!-- Giới hạn số ngày hiển thị: mặc định 15 ngày gần nhất, bật để xem tất cả -->
      <div v-if="groupedByDate.length > 0" class="mb-2 flex items-center gap-2 text-sm">
        <label class="flex items-center gap-2 cursor-pointer">
          <n-switch v-model:value="showAllDays" size="small" />
          <span>Hiện tất cả ngày</span>
        </label>
        <span v-if="!showAll && groupedByDate.length > visibleLimit" class="text-gray-400 text-xs">
          (đang hiện {{ visibleLimit }}/{{ groupedByDate.length }} ngày gần nhất)
        </span>
      </div>

      <!-- ===== View: Theo ngày (grouped) ===== -->
      <div v-if="groupedByDate.length > 0 && viewMode === 'grouped'" class="overflow-x-auto bg-white border border-[#efeff5] rounded-lg">
        <table class="w-full border-collapse">
          <thead>
            <tr class="table-thead">
              <th class="px-3 py-2 w-44">Ngày</th>
              <th class="px-3 py-2">Chi tiết tài khoản</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="group in visibleGroups"
              :key="group.date"
              class="group border-b border-[#efeff5] align-top hover:bg-[#f3f4f5] hover:shadow-[inset_3px_0_0_0_#2563eb] transition-all duration-150"
            >
              <!-- TD ngày -->
              <td class="px-3 py-3">
                <div class="flex items-center gap-2.5">
                  <span class="grid place-items-center w-9 h-9 rounded-lg bg-blue-50 text-blue-600 text-sm font-bold shrink-0">
                    {{ group.date.slice(0, 2) }}
                  </span>
                  <div class="leading-tight">
                    <div class="font-bold text-slate-800 text-sm">{{ group.date }}</div>
                    <div class="text-[11px] text-gray-500">{{ group.count }} tài khoản</div>
                  </div>
                </div>
                <div class="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-100">
                  <span class="text-[11px] text-rose-400 font-medium">Tổng</span>
                  <span class="text-sm font-bold text-rose-600 tabular-nums">{{ fmtUSD(group.totalFee) }}</span>
                </div>
              </td>

              <!-- TD chứa table nhỏ liệt kê từng account -->
              <td class="px-3 py-3">
                <table class="w-full text-sm">
                  <tbody>
                    <tr
                      v-for="f in group.entries"
                      :key="f.id"
                      class="cursor-pointer hover:bg-[#e2e3e5] rounded transition-colors border-b border-[#f3f3f5] last:border-0"
                      :title="f.note ? `${accountName(f.accountId)} · ${f.note}` : accountName(f.accountId)"
                      @click="openEdit(f.date, f.accountId)"
                    >
                      <td class="py-1.5 pr-2 w-1">
                        <span class="inline-block w-2.5 h-2.5 rounded-full align-middle" :style="{ background: accountColor(f.accountId) }"></span>
                      </td>
                      <td class="py-1.5 pr-3 font-semibold text-slate-700 whitespace-nowrap">
                        {{ accountName(f.accountId) }}
                        <span v-if="f.note" class="text-[11px]">📝</span>
                      </td>
                      <td class="py-1.5 pr-4 text-right font-bold text-rose-600 tabular-nums whitespace-nowrap">
                        {{ fmtUSD(f.fee) }}
                      </td>
                      <td class="py-1.5 text-right tabular-nums whitespace-nowrap">
                        <span v-if="claimNames(f.date, f.accountId)" class="text-emerald-500 mr-1 align-middle" :title="claimTitle(f.date, f.accountId)">◆</span><span
                          class="text-[11px] rounded px-1.5 py-0.5"
                          :class="[pointTextClass(f), showHighlight && f.highlight ? 'bg-amber-50' : 'bg-[#f1f1f3]']"
                        ><span v-if="showHighlight && f.highlight" class="text-amber-500 mr-1">★</span>{{ f.points }}đ</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ===== View: Bảng lịch sử (pivot) ===== -->
      <div v-else-if="groupedByDate.length > 0" class="space-y-2">
        <div class="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
          <span class="flex items-center gap-1.5">
            <span class="inline-block w-3 h-3 rounded-sm bg-blue-100 border border-blue-300"></span>
            15 ngày gần nhất (đang tính cho phần Điểm)
          </span>
          <span class="flex items-center gap-1.5">
            <span class="inline-block w-3 h-3 rounded-sm bg-green-100 border border-green-300"></span>
            Hôm nay
          </span>
          <span class="flex items-center gap-1.5"><span class="text-emerald-500">◆</span> Ngày húp kèo</span>
          <span class="flex items-center gap-1.5"><span class="text-amber-500">★</span> Ngày đã đánh dấu (đi đủ)</span>
        </div>
        <div class="overflow-auto max-h-[70vh] border border-[#efeff5] rounded-lg bg-white">
          <table class="pivot min-w-full border-separate border-spacing-0 text-sm tabular-nums">
            <thead>
              <tr>
                <th
                  rowspan="2"
                  class="sticky top-0 left-0 z-30 bg-[#fafafc] h-9 px-3 text-left font-semibold border-b border-r border-[#e6e6eb] w-28"
                >
                  Ngày
                </th>
                <th
                  v-for="a in matrixAccounts"
                  :key="a.id"
                  colspan="2"
                  class="sticky top-0 z-20 bg-[#fafafc] h-9 px-3 text-center font-semibold border-b border-r border-[#e6e6eb] whitespace-nowrap"
                >
                  <span class="inline-block w-2 h-2 rounded-full mr-1.5" :style="{ background: accountColor(a.id) }"></span>
                  {{ a.displayName }}
                  <span class="ml-1 text-rose-500 font-bold">({{ currentPointsById[a.id] ?? 0 }})</span>
                </th>
                <th
                  rowspan="2"
                  class="sticky top-0 z-20 bg-[#fafafc] h-9 px-3 text-right font-semibold border-b border-[#e6e6eb] whitespace-nowrap"
                >
                  Tổng phí
                </th>
              </tr>
              <tr>
                <template v-for="a in matrixAccounts" :key="'sub-' + a.id">
                  <th class="sticky top-9 z-20 bg-[#fafafc] px-2 py-1 text-right font-medium text-gray-500 border-b border-[#e6e6eb]">Phí</th>
                  <th class="sticky top-9 z-20 bg-[#fafafc] px-2 py-1 text-right font-medium text-rose-500 border-b border-r border-[#e6e6eb]">Điểm</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in visibleMatrixRows"
                :key="row.date"
                :class="rowBg(row)"
              >
                <td
                  class="sticky left-0 z-10 px-3 py-1.5 font-semibold text-slate-700 border-b border-r border-[#efeff5] whitespace-nowrap"
                  :class="dateBg(row)"
                >
                  {{ row.date }}
                </td>
                <template v-for="a in matrixAccounts" :key="row.date + '-' + a.id">
                  <td
                    class="px-2 py-1.5 text-right border-b border-[#efeff5] cursor-pointer"
                    @click="openEdit(row.date, a.id)"
                  >
                    <span v-if="row.cells[a.id]" class="font-semibold text-rose-600">{{ fmtUSD(row.cells[a.id].fee) }}</span>
                    <span v-else class="text-gray-300">–</span>
                  </td>
                  <td
                    class="px-2 py-1.5 text-right border-b border-r border-[#efeff5] cursor-pointer"
                    @click="openEdit(row.date, a.id)"
                  >
                    <span v-if="claimNames(row.date, a.id)" class="text-emerald-500 mr-0.5" :title="claimTitle(row.date, a.id)">◆</span><span
                      v-if="row.cells[a.id]"
                      :class="pointTextClass(row.cells[a.id])"
                    ><span v-if="showHighlight && row.cells[a.id].highlight" class="text-amber-500 mr-1">★</span>{{ row.cells[a.id].points }}</span>
                    <span v-else-if="!claimNames(row.date, a.id)" class="text-gray-300">–</span>
                  </td>
                </template>
                <td class="px-3 py-1.5 text-right font-bold text-rose-600 border-b border-[#efeff5] whitespace-nowrap">
                  {{ fmtUSD(row.totalFee) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Toggle xem thêm/thu gọn: mở rộng tạm (không lưu); ẩn khi đã bật switch -->
      <div v-if="!showAllDays && groupedByDate.length > visibleLimit" class="mt-3 text-center">
        <button
          class="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
          @click="expanded = !expanded"
        >
          <template v-if="expanded">Thu gọn ▴</template>
          <template v-else>Xem thêm {{ groupedByDate.length - visibleLimit }} ngày ▾</template>
        </button>
      </div>

      <p v-if="groupedByDate.length > 0" class="text-xs text-gray-500 mt-3">
        Hiển thị toàn bộ daily còn trong sheet Fees. Sau khi bấm
        <b class="text-gray-700">Xóa lịch sử cũ</b>, các tháng đã
        <b class="text-gray-700">Tổng hợp</b> vào
        <code class="text-gray-500">FeesMonthly</code> sẽ không còn dòng chi tiết ở đây.
      </p>
    </div>

    <!-- ===== Edit modal (matrix cell) ===== -->
    <n-modal
      :show="!!cellModal"
      preset="card"
      :title="cellModal?.existing ? 'Sửa phí' : 'Thêm phí'"
      style="max-width: 460px"
      @update:show="(v) => { if (!v) closeCellModal(); }"
    >
      <template v-if="cellModal">
        <n-grid :cols="2" :x-gap="12" :y-gap="12">
          <n-gi>
            <n-form-item label="Ngày" :show-feedback="false">
              <n-input :value="cellModal.date" readonly />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="Tài khoản" :show-feedback="false">
              <div class="input flex items-center gap-2" style="background: #fafafc">
                <span class="inline-block w-2.5 h-2.5 rounded-full" :style="{ background: accountColor(cellModal.accountId) }"></span>
                {{ accountName(cellModal.accountId) }}
              </div>
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="Trước ($)" :show-feedback="false">
              <n-input-number v-model:value="cellModal.before" :step="0.01" :show-button="false" style="width: 100%" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="Sau ($)" :show-feedback="false">
              <n-flex :size="4" align="center" :wrap="true" style="width: 100%">
                <n-select
                  :value="afterIntSelect"
                  :options="afterIntOptions"
                  class="fill-input"
                  placeholder="Phần nguyên"
                  style="flex: 1 1 80px; min-width: 0"
                  @update:value="onIntSelect"
                />
                <n-input-number
                  v-if="afterIntSelect === 'other'"
                  :value="afterIntCustom"
                  :show-button="false"
                  class="fill-input"
                  placeholder="Số"
                  style="width: 80px"
                  @update:value="onIntCustom"
                />
                <span class="dec-dot">.</span>
                <n-input
                  :value="afterDec"
                  class="fill-input"
                  placeholder="00"
                  style="width: 56px"
                  @update:value="onDecInput"
                />
              </n-flex>
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="Phí ($)" :show-feedback="false">
              <div class="w-full min-h-[34px] flex items-center justify-end px-3 rounded-md bg-[rgba(219,226,236,0.4)] text-rose-600 font-semibold tabular-nums">
                {{ fmtUSD(cellFee) }}
              </div>
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="Điểm" :show-feedback="false">
              <n-input-number v-model:value="cellModal.points" style="width: 100%" />
            </n-form-item>
          </n-gi>
          <n-gi :span="2">
            <n-form-item label="Đánh dấu ngày này (ngày đi đủ điều kiện nhận kèo)" :show-feedback="false">
              <n-switch v-model:value="cellModal.highlight">
                <template #checked>★ Đã đánh dấu</template>
                <template #unchecked>Không đánh dấu</template>
              </n-switch>
            </n-form-item>
          </n-gi>
        </n-grid>
        <n-form-item label="Ghi chú" :show-feedback="false" style="margin-top: 12px">
          <n-input v-model:value="cellModal.note" placeholder="Không bắt buộc" />
        </n-form-item>
      </template>
      <template #footer v-if="cellModal">
        <div class="flex items-center justify-between">
          <n-button v-if="cellModal.existing" text type="error" :disabled="cellModal.saving" @click="deleteCell">
            Xóa bản ghi
          </n-button>
          <span v-else></span>
          <div class="flex gap-2">
            <n-button :disabled="cellModal.saving" @click="closeCellModal">Hủy</n-button>
            <n-button type="primary" :loading="cellModal.saving" @click="saveCell">Lưu</n-button>
          </div>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { reactive, computed, ref, h } from 'vue';
import { useStorage } from '@vueuse/core';
import {
  NButton, NSelect, NRadioGroup, NRadioButton, NAlert, NEmpty, NFlex,
  NModal, NGrid, NGi, NFormItem, NInput, NInputNumber, NSwitch,
} from 'naive-ui';
import { useTrackingStore } from '../stores/trackingStore';
import { useToastStore } from '../stores/toastStore';
import { dialog, confirmAction } from '../utils/naive';
import { usePersistedNumber } from '../utils/persistedNumber';
import { computeAlphaPoints } from '../utils/points';
import { fmtUSD, parseDate, todayStr, round2 } from '../utils/format';

const store = useTrackingStore();
const toast = useToastStore();

const filter = reactive({ accountId: '' });

const viewModes = [
  { key: 'table', label: 'Bảng lịch sử' },
  { key: 'grouped', label: 'Theo ngày' },
];
const viewMode = useStorage('alpha:feesViewMode', 'grouped');

const accountOptions = computed(() => [
  { label: 'Tất cả tài khoản', value: '' },
  ...store.accounts.map((a) => ({ label: a.displayName, value: a.id })),
]);

const archiving = ref(false);
const clearing = ref(false);
const showManage = ref(false); // panel quản lý lịch sử thu gọn mặc định

const filteredFees = computed(() => {
  let list = [...store.allFees];
  if (filter.accountId) list = list.filter((f) => f.accountId === filter.accountId);
  return list;
});

const cellMap = computed(() => {
  const m = {};
  filteredFees.value.forEach((f) => { m[f.date + '|' + f.accountId] = f; });
  return m;
});
function cellAt(date, accountId) {
  return cellMap.value[date + '|' + accountId] || null;
}

const groupedByDate = computed(() => {
  const groups = {};
  filteredFees.value.forEach((f) => {
    if (!groups[f.date]) groups[f.date] = [];
    groups[f.date].push(f);
  });
  return Object.keys(groups)
    .sort((a, b) => (parseDate(b)?.getTime() || 0) - (parseDate(a)?.getTime() || 0))
    .map((date) => {
      const entries = groups[date].slice().sort(
        (a, b) => store.accountOrderIndex(a.accountId) - store.accountOrderIndex(b.accountId)
      );
      return {
        date,
        entries,
        count: entries.length,
        totalFee: entries.reduce((s, f) => s + (Number(f.fee) || 0), 0),
      };
    });
});

// ===== Pivot table view =====
// Tài khoản hiển thị làm cột (chỉ những account có dữ liệu), theo thứ tự sortOrder.
const matrixAccounts = computed(() => {
  const ids = new Set();
  filteredFees.value.forEach((f) => ids.add(f.accountId));
  return [...ids]
    .map((id) => store.accountById(id) || { id, displayName: id, color: '#3b82f6' })
    .sort((a, b) => store.accountOrderIndex(a.id) - store.accountOrderIndex(b.id));
});

// Một dòng = một ngày (mới nhất trên cùng). inWindow = tradeDate + 15 >= today,
// khớp logic computePoints ở Code.gs (cửa sổ 15 ngày dùng tính điểm).
function inPointWindow(date) {
  const d = parseDate(date);
  if (!d) return false;
  const reset = new Date(d);
  reset.setDate(reset.getDate() + 15);
  reset.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return reset.getTime() >= today.getTime();
}

const matrixRows = computed(() => {
  const today = todayStr();
  return groupedByDate.value.map((g) => {
    const cells = {};
    g.entries.forEach((f) => { cells[f.accountId] = f; });
    return {
      date: g.date,
      cells,
      totalFee: g.totalFee,
      inWindow: inPointWindow(g.date),
      isToday: g.date === today,
    };
  });
});

// Giới hạn hiển thị: mặc định đúng những ngày được tô màu (đang còn liên quan).
// KHÔNG cố định 15+1 — vì nếu có ngày trống (không trade) thì số dòng không khớp
// cửa sổ ngày theo lịch. Thay vào đó đếm số dòng còn được tô màu:
//   - xanh dương nhẹ = inPointWindow (tradeDate + 15 >= today)
//   - xanh lá = hôm nay (cũng thoả inPointWindow nên đã nằm trong số đếm)
// groupedByDate đã sort mới→cũ nên các dòng tô màu luôn liền nhau ở đầu.
// - showAllDays: switch lưu localStorage (luôn xem toàn bộ).
// - expanded: bấm "Xem thêm" — chỉ mở rộng tạm thời cho phiên này, KHÔNG lưu.
const showAllDays = useStorage('alpha:feesShowAllDays', false);
const expanded = ref(false);
const showAll = computed(() => showAllDays.value || expanded.value);
// Số dòng hiển thị mặc định = số ngày đang được tô màu (>=1 để không rỗng).
const visibleLimit = computed(() =>
  Math.max(1, groupedByDate.value.filter((g) => inPointWindow(g.date)).length)
);
const visibleGroups = computed(() =>
  showAll.value ? groupedByDate.value : groupedByDate.value.slice(0, visibleLimit.value)
);
const visibleMatrixRows = computed(() =>
  showAll.value ? matrixRows.value : matrixRows.value.slice(0, visibleLimit.value)
);

// Màu nền: hôm nay (xanh lá) ưu tiên hơn cửa sổ 15 ngày (xanh dương).
// Cột ngày freeze cần nền đặc (không trong suốt) để che nội dung cuộn bên dưới.
function rowBg(row) {
  if (row.isToday) return 'bg-green-50';
  if (row.inWindow) return 'bg-blue-50';
  return 'bg-white';
}
function dateBg(row) {
  if (row.isToday) return 'bg-green-100';
  if (row.inWindow) return 'bg-blue-100';
  return 'bg-white';
}

// ===== Past-daily indicator =====
const pastDaily = computed(() => store.pastDaily || { total: 0, deletable: 0, active: 0, safeToDelete: false, pendingArchiveMonths: [] });
const canClear = computed(() => pastDaily.value.deletable > 0);
const pendingMonths = computed(() => pastDaily.value.pendingArchiveMonths || []);
const canArchive = computed(() => pendingMonths.value.length > 0);

const indicatorIcon = computed(() => (canClear.value ? '✓' : 'ℹ'));
const indicatorType = computed(() => {
  if (canClear.value) return 'success';
  if (pastDaily.value.active > 0) return 'warning';
  return 'info';
});
const indicatorTitle = computed(() => {
  if (canClear.value) return `Có thể xóa ${pastDaily.value.deletable} bản ghi đã hết 15 ngày`;
  if (pastDaily.value.active > 0) return `Còn ${pastDaily.value.active} bản ghi cũ đang trong cửa sổ 15 ngày`;
  return 'Không có dữ liệu cũ';
});
const indicatorDetail = computed(() => {
  if (canClear.value) {
    const arch = pendingMonths.value.length;
    if (arch > 0) return `Nên bấm "Tổng hợp tháng cũ" trước (còn ${arch} tháng chưa archive) — sau khi clear, Dashboard sẽ chỉ thấy aggregate.`;
    return 'Các row này không còn tính điểm (không còn màu xanh) — xóa không ảnh hưởng tab Điểm.';
  }
  if (pastDaily.value.active > 0) {
    const safe = pastDaily.value.earliestSafeDate;
    return safe
      ? `Chưa có gì để xóa — row cũ nhất sẽ rời cửa sổ 15 ngày vào ${safe}.`
      : 'Tất cả bản ghi cũ vẫn trong cửa sổ 15 ngày — chưa có gì để xóa.';
  }
  return 'Sheet Fees chỉ chứa tháng hiện tại.';
});

// ===== Helpers =====
function accountName(id) { return store.accountById(id)?.displayName || id; }
function accountColor(id) { return store.accountById(id)?.color || '#3b82f6'; }

// ===== Húp kèo: ngày account đã nhận thưởng 1 alpha project (rewards[accId] != 0) =====
// Map "date|accountId" -> [tên kèo...] để gắn icon 🎁 vào ô phí tương ứng.
const claimMap = computed(() => {
  const m = {};
  for (const p of store.projects || []) {
    const rewards = p.rewards || {};
    for (const accId in rewards) {
      const amt = Number(rewards[accId]);
      if (!Number.isFinite(amt) || amt === 0) continue;
      (m[p.date + '|' + accId] ||= []).push(p.name || 'kèo');
    }
  }
  return m;
});
function claimNames(date, accountId) {
  return claimMap.value[date + '|' + accountId] || null;
}
function claimTitle(date, accountId) {
  const names = claimNames(date, accountId);
  return names ? `Húp kèo: ${names.join(', ')}` : '';
}

// ===== Highlight: đánh dấu tay ngày "đi đủ" + cảnh báo số ngày đánh dấu =====
// Cảnh báo bật khi số ngày đánh dấu ★ trong cửa sổ 15 ngày < requiredDays
// (chưa đi/đánh dấu đủ số ngày cần thiết trong 15 ngày gần nhất).
// warnDays chỉ còn dùng cho màu chữ ô điểm (ngày đánh dấu sắp rời cửa sổ → đỏ).
const showHighlight = useStorage('alpha:feesHighlight', true);
// *Model = ô nhập (xoá rỗng được khi sửa); stored = giá trị đã lưu dùng để tính.
const { stored: requiredDays, model: requiredDaysModel } = usePersistedNumber('alpha:feesRequiredDays', 1, { min: 1 });
const { stored: warnDays, model: warnDaysModel } = usePersistedNumber('alpha:feesWarnDays', 3, { min: 0 });

// Số ngày còn lại trong cửa sổ 15 ngày của 1 ngày trade (>=0 = còn hiệu lực;
// 0 = hôm nay là ngày cuối; <0 = đã rời cửa sổ). Khớp logic inPointWindow.
function pointDaysLeft(date) {
  const d = parseDate(date);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  const reset = new Date(d);
  reset.setDate(reset.getDate() + 15);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((reset.getTime() - today.getTime()) / 86400000);
}

// Account nào cần để ý cho cảnh báo. Mặc định tất cả account đang active (không ẩn ở
// tab Điểm); người dùng có thể chọn riêng vài account để chỉ cảnh báo cho chúng.
// trackedIds rỗng = theo dõi tất cả (hành vi cũ). Lưu lựa chọn vào localStorage.
const candidateAccounts = computed(() => store.activeAccounts.filter((a) => !a.hideInPoints));
const trackedOptions = computed(() =>
  candidateAccounts.value.map((a) => ({ label: a.displayName, value: a.id }))
);
const trackedIds = useStorage('alpha:feesTrackedAccounts', []);
const trackedAccounts = computed(() => {
  const candidates = candidateAccounts.value;
  if (!trackedIds.value.length) return candidates;
  const set = new Set(trackedIds.value);
  return candidates.filter((a) => set.has(a.id));
});

// Điểm Alpha hiện tại theo account (giống tab Điểm): currentPoints = điểm còn lại
// sau khi trừ kèo đã húp. Hiển thị sau tên account ở header bảng phí.
const pointsRequired = useStorage('alpha:pointsRequired', 15);
const currentPointsById = computed(() => {
  const data = computeAlphaPoints(store.allFees || [], store.projects || [], pointsRequired.value);
  const m = {};
  for (const a of data.accounts) m[a.accountId] = a.currentPoints;
  return m;
});

// Số ngày đánh dấu ★ còn trong cửa sổ 15 ngày, theo account.
const markedCount = computed(() => {
  const m = {};
  for (const f of store.allFees || []) {
    if (!f.highlight) continue;
    const left = pointDaysLeft(f.date);
    if (left == null || left < 0) continue; // đã rời cửa sổ → không tính
    m[f.accountId] = (m[f.accountId] || 0) + 1;
  }
  return m;
});

// Cảnh báo: số ngày đánh dấu ★ trong cửa sổ 15 ngày < requiredDays.
const highlightWarnings = computed(() => {
  const req = Math.max(1, Number(requiredDays.value) || 1);
  const out = [];
  for (const a of trackedAccounts.value) {
    const marked = markedCount.value[a.id] || 0;
    if (marked < req) {
      out.push({
        id: a.id,
        text: `${a.displayName}: mới ${marked}/${req} ngày đánh dấu trong 15 ngày gần nhất → cần đi đánh dấu ngày`,
      });
    }
  }
  return out;
});

// Ngày đánh dấu ★ gần hết hạn nhất (daysLeft nhỏ nhất còn trong cửa sổ) theo account.
const soonestExpiry = computed(() => {
  const m = {};
  for (const f of store.allFees || []) {
    if (!f.highlight) continue;
    const left = pointDaysLeft(f.date);
    if (left == null || left < 0) continue; // đã rời cửa sổ
    if (m[f.accountId] == null || left < m[f.accountId].left) {
      m[f.accountId] = { left, date: f.date };
    }
  }
  return m;
});

// Cảnh báo "Báo trước": account có ngày đánh dấu sắp rời cửa sổ 15 ngày (còn ≤ warnDays).
const expiryWarnings = computed(() => {
  const warn = Math.max(0, Number(warnDays.value) || 0);
  const out = [];
  for (const a of trackedAccounts.value) {
    const e = soonestExpiry.value[a.id];
    if (!e || e.left > warn) continue;
    const txt = e.left <= 0
      ? `${a.displayName}: hôm nay là ngày cuối của ngày đánh dấu ★ ${e.date} (mai sẽ tụt điểm)`
      : `${a.displayName}: còn ${e.left} ngày nữa là hết ngày đánh dấu ★ ${e.date}`;
    out.push({ id: a.id, text: txt });
  }
  return out;
});

// Class màu chữ cho ô điểm: ngày đã đánh dấu → cam (đậm), sắp hết hạn → đỏ; còn lại xám.
function pointTextClass(cell) {
  if (!showHighlight.value || !cell.highlight) return 'text-slate-500';
  const left = pointDaysLeft(cell.date);
  if (left != null && left <= (Number(warnDays.value) || 0)) return 'text-rose-600 font-extrabold';
  return 'text-violet-600 font-extrabold';
}

// ===== Cell/chip edit (modal) — dùng chung cho cả matrix và grouped view =====
const cellModal = ref(null);

// Phí = Trước − Sau (giống máy tính). Trước mặc định luôn 1050; Sau bỏ trống → phí 0.
const DEFAULT_BEFORE = 1050;
const cellFee = computed(() => {
  const m = cellModal.value;
  if (!m) return 0;
  const before = Number(m.before) || 0;
  const after = Number(m.after);
  if (!Number.isFinite(after)) return 0;
  return round2(Math.max(0, before - after));
});

// ===== "Sau ($)" tách 2 phần: dropdown phần nguyên + input phần thập phân =====
// cellModal.after vẫn là source of truth (số gộp) — fee = Trước − Sau không đổi.
const AFTER_INT_OPTIONS = [];
for (let i = 1040; i <= 1050; i++) AFTER_INT_OPTIONS.push(i);
const afterIntOptions = [
  ...AFTER_INT_OPTIONS.map((v) => ({ label: String(v), value: v })),
  { label: 'Khác', value: 'other' },
];
const afterIntSelect = ref(null); // số nguyên đã chọn, hoặc 'other'
const afterIntCustom = ref(null); // số nguyên tự nhập khi chọn 'other'
const afterDec = ref('');         // chuỗi chữ số phần thập phân ("5" → .5)

// cellModal.after (số gộp) → 3 phần UI. Gọi khi mở modal edit.
function syncAfterParts() {
  const v = cellModal.value?.after;
  if (v === null || v === undefined || v === '') {
    afterIntSelect.value = null;
    afterIntCustom.value = null;
    afterDec.value = '';
    return;
  }
  const [intStr, decStr = ''] = String(v).split('.');
  const intPart = Number(intStr);
  if (AFTER_INT_OPTIONS.includes(intPart)) {
    afterIntSelect.value = intPart;
    afterIntCustom.value = null;
  } else {
    afterIntSelect.value = 'other';
    afterIntCustom.value = intPart;
  }
  afterDec.value = decStr;
}

// 3 phần UI → cellModal.after (số gộp).
function composeAfter() {
  if (!cellModal.value) return;
  const intVal = afterIntSelect.value === 'other' ? afterIntCustom.value : afterIntSelect.value;
  if (intVal === null || intVal === undefined || intVal === '') {
    cellModal.value.after = null;
  } else {
    const dec = String(afterDec.value ?? '').replace(/\D/g, '');
    cellModal.value.after = dec ? Number(`${intVal}.${dec}`) : Number(intVal);
  }
}

function onIntSelect(val) {
  afterIntSelect.value = val;
  if (val !== 'other') afterIntCustom.value = null;
  composeAfter();
}
function onIntCustom(val) {
  afterIntCustom.value = val;
  composeAfter();
}
function onDecInput(val) {
  afterDec.value = String(val ?? '').replace(/\D/g, '').slice(0, 4);
  composeAfter();
}

function openEdit(date, accountId) {
  const existing = cellAt(date, accountId);
  cellModal.value = {
    date,
    accountId,
    existing,
    before: DEFAULT_BEFORE,
    // Sửa: từ phí cũ suy ra Sau = Trước − phí. Thêm mới: bỏ trống.
    after: existing ? round2(DEFAULT_BEFORE - existing.fee) : null,
    points: existing ? existing.points : (store.accountById(accountId)?.pointTrade ?? 15) + (store.accountById(accountId)?.pointHold ?? 0),
    note: existing ? (existing.note || '') : '',
    highlight: existing ? !!existing.highlight : false,
    saving: false,
  };
  syncAfterParts();
}
function closeCellModal() {
  if (cellModal.value?.saving) return;
  cellModal.value = null;
}

async function saveCell() {
  if (!cellModal.value) return;
  if (!(await confirmAction({
    title: cellModal.value.existing ? 'Cập nhật phí' : 'Thêm phí',
    content: () => h('div', { style: 'line-height:1.8' }, [
      'Lưu phí ',
      h('b', { style: 'color:#e11d48' }, fmtUSD(cellFee.value)),
      ' (',
      h('b', { style: 'color:#2563eb' }, `+${Number(cellModal.value.points) || 0}đ`),
      ') cho ',
      h('b', { style: 'color:#0f172a' }, accountName(cellModal.value.accountId)),
      ' ngày ',
      h('b', { style: 'color:#0f172a' }, cellModal.value.date),
      '?',
    ]),
    positiveText: 'Lưu',
    type: 'info',
  }))) return;
  if (!cellModal.value) return;
  cellModal.value.saving = true;
  try {
    // store.addFees → server bulkCreateFees → upsert theo (date, accountId)
    await store.addFees([{
      date: cellModal.value.date,
      accountId: cellModal.value.accountId,
      fee: cellFee.value,
      points: Number(cellModal.value.points) || 0,
      note: cellModal.value.note || '',
      highlight: !!cellModal.value.highlight,
    }]);
    toast.success(`Đã lưu ${cellModal.value.date} · ${accountName(cellModal.value.accountId)}`);
    cellModal.value = null;
  } catch (e) {
    toast.error('Lỗi: ' + e.message);
    cellModal.value.saving = false;
  }
}

function deleteCell() {
  if (!cellModal.value?.existing) return;
  const m = cellModal.value;
  dialog.warning({
    title: 'Xóa bản ghi',
    content: `Xóa bản ghi ${m.date} - ${accountName(m.accountId)}?`,
    positiveText: 'Xóa',
    negativeText: 'Hủy',
    onPositiveClick: async () => {
      m.saving = true;
      try {
        await store.deleteFee(m.existing.id);
        toast.success('Đã xóa');
        cellModal.value = null;
      } catch (e) {
        toast.error('Lỗi: ' + e.message);
        m.saving = false;
      }
    },
  });
}

// ===== Management actions =====
async function onArchive() {
  if (!(await confirmAction({
    title: 'Tổng hợp tháng cũ',
    content: `Tổng hợp ${pendingMonths.value.length} tháng cũ vào FeesMonthly? Dòng chi tiết vẫn được giữ.`,
    positiveText: 'Tổng hợp',
    type: 'info',
  }))) return;
  archiving.value = true;
  try {
    const res = await store.archivePastMonths();
    toast.success(`Đã tổng hợp ${res?.archived ?? 0} dòng FeesMonthly`);
  } catch (e) {
    toast.error('Lỗi archive: ' + e.message);
  } finally {
    archiving.value = false;
  }
}

function onClearOld() {
  let content = `Xóa ${pastDaily.value.deletable} bản ghi đã hết cửa sổ 15 ngày (không còn tính điểm)? Các row còn trong cửa sổ và tháng hiện tại được giữ lại.`;
  if (pendingMonths.value.length > 0) {
    content += ` Lưu ý: còn ${pendingMonths.value.length} tháng chưa archive — sau khi clear sẽ mất khỏi Dashboard.`;
  }
  dialog.warning({
    title: 'Xóa lịch sử cũ',
    content,
    positiveText: 'Xóa',
    negativeText: 'Hủy',
    onPositiveClick: async () => {
      clearing.value = true;
      try {
        const res = await store.clearOldDaily();
        toast.success(`Đã xóa ${res?.removed ?? 0} bản ghi cũ`);
      } catch (e) {
        toast.error('Lỗi clear: ' + e.message);
      } finally {
        clearing.value = false;
      }
    },
  });
}
</script>

<style scoped>
/* Hover bảng pivot: overlay xám trung tính (box-shadow inset) — luôn tối hơn
   nền gốc nên không trùng màu với các dòng nền xanh/xanh lá. */
.pivot tbody td {
  transition: box-shadow 0.15s;
}
.pivot tbody tr:hover td {
  box-shadow: inset 0 0 0 999px rgba(15, 23, 42, 0.05); /* hover cả row (nhạt) */
}
.pivot tbody tr:hover td:hover {
  box-shadow: inset 0 0 0 999px rgba(15, 23, 42, 0.12); /* hover cell (đậm hơn) */
}
/* Ô cần người dùng nhập (Sau $) → tô nền vàng nhạt cho dễ nhận biết. */
.fill-input :deep(.n-input) { background-color: #fefce8; }
.fill-input :deep(.n-input.n-input--focus) { background-color: #fffef7; }
/* Phần thập phân là <n-input> trực tiếp → root chính là .n-input (không phải con). */
.fill-input.n-input { background-color: #fefce8; }
.fill-input.n-input.n-input--focus { background-color: #fffef7; }
.fill-input :deep(.n-base-selection .n-base-selection-label) { background-color: #fefce8; }
.dec-dot { font-weight: 700; color: #475569; flex: 0 0 auto; }
</style>
