<template>
  <div class="space-y-6">
    <!-- Volume calculator -->
    <div class="card">
      <h3 class="font-semibold mb-3">Máy tính điểm Alpha từ Volume</h3>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="label">Volume hiện tại (USD)</label>
          <input
            v-model.number="volumeInput"
            type="number"
            class="input"
            @input="calcVolume"
          />
        </div>
        <div>
          <label class="label">Điểm hiện tại</label>
          <div class="text-3xl font-bold text-binance-yellow">
            {{ volumeResult.currentPoint || 0 }}
          </div>
        </div>
        <div v-if="volumeResult.next">
          <label class="label">Mốc tiếp theo</label>
          <div class="text-xl text-green-400">
            +{{ fmtNumber(volumeResult.next.volumeNeeded) }} USD
          </div>
          <div class="text-xs text-gray-500">
            → đạt {{ volumeResult.next.nextPoint }} điểm
          </div>
        </div>
        <div>
          <label class="label">Yêu cầu để húp airdrop</label>
          <input
            v-model.number="required"
            type="number"
            class="input"
            @change="store.loadPoints(required)"
          />
        </div>
      </div>

      <!-- Bảng quy đổi -->
      <details class="mt-3">
        <summary class="cursor-pointer text-xs text-gray-400 hover:text-gray-200">
          Xem bảng quy đổi Volume → Điểm (15 mốc đầu)
        </summary>
        <div class="grid grid-cols-3 md:grid-cols-5 gap-2 mt-2 text-xs">
          <div
            v-for="t in thresholds"
            :key="t.point"
            class="border border-binance-light rounded px-2 py-1"
          >
            <span class="text-binance-yellow">{{ t.point }} điểm</span>
            =
            <span class="text-gray-300">{{ fmtNumber(t.volume) }} USD</span>
          </div>
        </div>
      </details>
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
          <span
            v-if="getAccountData(acc.id)?.airdrop.eligible"
            class="badge bg-green-900 text-green-200"
          >
            ✓ Đủ điểm húp
          </span>
          <span v-else class="badge bg-gray-700 text-gray-400">
            Thiếu {{ getAccountData(acc.id)?.airdrop.deficit || required }}
          </span>
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
import { ref, reactive, computed, onMounted } from 'vue';
import { useTrackingStore } from '../stores/trackingStore';
import { pointsApi } from '../services/api';
import { fmtNumber } from '../utils/format';

const store = useTrackingStore();
const volumeInput = ref(32684);
const volumeResult = reactive({ currentPoint: 0, next: null });
const required = ref(15);

const thresholds = Array.from({ length: 15 }, (_, i) => ({
  point: i + 1,
  volume: Math.pow(2, i + 1),
}));

const accountsData = computed(() => store.points?.accounts || []);
function getAccountData(id) {
  return accountsData.value.find((a) => a.accountId === id);
}

async function calcVolume() {
  try {
    const r = await pointsApi.fromVolume(volumeInput.value);
    volumeResult.currentPoint = r.currentPoint;
    volumeResult.next = r.next;
  } catch (e) {
    console.error(e);
  }
}

onMounted(() => {
  calcVolume();
});
</script>
