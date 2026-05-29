<template>
  <div class="space-y-6">
    <!-- Header config -->
    <div class="card">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 class="font-semibold">Theo dõi điểm Alpha</h3>
          <p class="text-xs text-gray-500 mt-1">
            Tổng = sum điểm phí trong 15 ngày gần nhất (không tính hôm nay).
            Trừ <b class="text-gray-700">claimPoints</b> mỗi kèo alpha đã nhận trong cùng cửa sổ.
            Khi kèo hết hạn → điểm hồi lại.
          </p>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
          <label class="flex items-center gap-2 cursor-pointer text-sm">
            <input v-model="highlightMode" type="checkbox" class="accent-binance-yellow" />
            <span class="text-gray-700">Highlight</span>
          </label>
          <div class="flex items-center gap-2">
            <label class="label !mb-0">Điểm yêu cầu để nhận:</label>
            <input
              v-model.number="required"
              type="number"
              min="1"
              class="input w-24 py-1"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Cards điểm từng account -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="acc in pointsAccounts"
        :key="acc.id"
        class="card transition-all"
        :class="cardClass(acc.id)"
      >
        <!-- Header: name + badge -->
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span
              class="inline-block w-3 h-3 rounded-full"
              :style="{ background: acc.color }"
            ></span>
            <h3 class="font-semibold">{{ acc.displayName }}</h3>
          </div>
          <span
            v-if="data(acc.id).airdrop.eligible"
            class="badge bg-green-100 text-green-700"
          >
            ✓ Đủ điểm nhận
          </span>
          <span v-else class="badge bg-gray-200 text-gray-500">
            Thiếu {{ data(acc.id).airdrop.deficit }}
          </span>
        </div>

        <!-- Metrics 4 ô -->
        <div class="grid grid-cols-4 gap-2 mb-3 text-center">
          <div class="border border-binance-light rounded-lg px-1 py-2">
            <div class="text-[11px] text-gray-500">Tổng điểm</div>
            <div class="text-xl font-bold">{{ data(acc.id).totalPoints }}</div>
          </div>
          <div class="border border-binance-light rounded-lg px-1 py-2">
            <div class="text-[11px] text-gray-500">Đã trừ</div>
            <div class="text-xl font-bold text-rose-600">
              −{{ data(acc.id).deducted }}
            </div>
          </div>
          <div class="border border-binance-light bg-binance-light/30 rounded-lg px-1 py-2">
            <div class="text-[11px] text-gray-500">Còn lại</div>
            <div
              class="text-xl font-bold"
              :class="data(acc.id).airdrop.eligible ? 'text-green-600' : 'text-binance-yellow'"
            >
              {{ data(acc.id).currentPoints }}
            </div>
          </div>
          <div class="border border-binance-light rounded-lg px-1 py-2">
            <div class="text-[11px] text-gray-500">Số kèo</div>
            <div class="text-xl font-bold text-gray-700">
              {{ data(acc.id).claimsCount }}
            </div>
          </div>
        </div>

        <!-- Ngày reset (lịch hồi điểm khi kèo hết hạn) -->
        <div class="border-t border-binance-light pt-2">
          <div class="text-xs text-gray-500 mb-2">
            Ngày reset (kèo hết hạn, điểm hồi lại)
          </div>
          <div v-if="!data(acc.id).schedule.length" class="text-xs text-gray-500">
            Chưa có kèo nào đã nhận trong 14 ngày qua
          </div>
          <ul v-else class="space-y-1.5 text-xs max-h-48 overflow-y-auto">
            <li
              v-for="(s, i) in data(acc.id).schedule"
              :key="i"
              class="flex items-center justify-between gap-2"
            >
              <div class="flex-1 min-w-0">
                <div class="text-binance-yellow font-semibold">
                  {{ s.resetDate }}
                  <span class="text-gray-500 font-normal">· còn {{ s.daysLeft }}d</span>
                </div>
                <div class="truncate text-gray-500">{{ s.projectName }}</div>
              </div>
              <span class="text-green-600 font-semibold whitespace-nowrap">
                +{{ s.claimPoints }}đ
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useTrackingStore } from '../stores/trackingStore';
import { computeAlphaPoints } from '../utils/points';

const store = useTrackingStore();
const required = ref(15);
const highlightMode = ref(false);

const pointsAccounts = computed(() =>
  store.activeAccounts.filter((a) => !a.hideInPoints)
);

const pointsData = computed(() =>
  computeAlphaPoints(store.fees || [], store.projects || [], required.value)
);

const emptyAccount = computed(() => ({
  totalPoints: 0,
  deducted: 0,
  currentPoints: 0,
  claimsCount: 0,
  schedule: [],
  airdrop: {
    eligible: false,
    current: 0,
    required: required.value,
    deficit: required.value,
  },
}));

function data(id) {
  return pointsData.value.accounts.find((a) => a.accountId === id) || emptyAccount.value;
}

function cardClass(id) {
  if (!highlightMode.value) return '';
  return data(id).airdrop.eligible
    ? 'ring-2 ring-green-500/60 shadow-lg shadow-green-500/20'
    : 'opacity-30 grayscale';
}
</script>
