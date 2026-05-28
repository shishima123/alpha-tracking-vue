<template>
  <div class="space-y-6">
    <!-- Cấu hình điểm yêu cầu -->
    <div class="card">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 class="font-semibold">Theo dõi điểm Alpha</h3>
          <p class="text-xs text-gray-500 mt-1">
            Tính từ dữ liệu lịch sử phí (không gọi server). Dùng nút 🧮 góc dưới
            phải để tính volume → phí và fill nhanh cho 1 tài khoản.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <label class="label !mb-0">Điểm yêu cầu để húp:</label>
          <input
            v-model.number="required"
            type="number"
            min="1"
            class="input w-24 py-1"
          />
        </div>
      </div>
    </div>

    <!-- Điểm còn lại từng account -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="acc in store.activeAccounts"
        :key="acc.id"
        class="card"
      >
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span
              class="inline-block w-3 h-3 rounded-full"
              :style="{ background: acc.color }"
            ></span>
            <h3 class="font-semibold">{{ acc.displayName }}</h3>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="text-xs text-binance-yellow hover:underline"
              title="Mở máy tính cho tài khoản này"
              @click="openCalc(acc.id)"
            >
              🧮 Tính
            </button>
            <span
              v-if="getAccountData(acc.id)?.airdrop.eligible"
              class="badge bg-green-900 text-green-200"
            >
              ✓ Đủ điểm húp
            </span>
            <span v-else class="badge bg-gray-700 text-gray-400">
              Thiếu {{ getAccountData(acc.id)?.airdrop.deficit ?? required }}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div class="text-xs text-gray-400">Điểm còn lại</div>
            <div class="text-3xl font-bold text-binance-yellow">
              {{ getAccountData(acc.id)?.currentPoints || 0 }}
            </div>
          </div>
          <div>
            <div class="text-xs text-gray-400">Cần để húp</div>
            <div class="text-3xl font-bold text-gray-500">{{ required }}</div>
          </div>
        </div>

        <div class="border-t border-binance-light pt-2">
          <div class="text-xs text-gray-400 mb-2">Lịch hồi điểm (15 ngày)</div>
          <div v-if="!getAccountData(acc.id)?.schedule?.length" class="text-xs text-gray-500">
            Chưa có dữ liệu
          </div>
          <ul class="space-y-1 text-xs max-h-40 overflow-y-auto">
            <li
              v-for="(s, i) in getAccountData(acc.id)?.schedule || []"
              :key="i"
              class="flex justify-between items-center"
            >
              <span class="text-gray-300">
                {{ s.resetDate }}
                <span class="text-gray-500">(còn {{ s.daysLeft }}d)</span>
              </span>
              <span class="text-binance-yellow">+{{ s.points }} đ</span>
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
import { useCalculatorStore } from '../stores/calculatorStore';
import { computePointsFromFees } from '../utils/points';

const store = useTrackingStore();
const calc = useCalculatorStore();
const required = ref(15);

const pointsData = computed(() =>
  computePointsFromFees(store.fees || [], required.value)
);
function getAccountData(id) {
  return pointsData.value.accounts.find((a) => a.accountId === id);
}

function openCalc(accountId) {
  calc.show(accountId);
}
</script>
