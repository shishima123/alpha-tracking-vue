<template>
  <Teleport to="body">
    <div
      v-if="calc.open"
      class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-start md:items-center justify-center p-3 md:p-6 overflow-y-auto"
    >
      <div class="bg-binance-gray border border-binance-light rounded-2xl shadow-xl w-full max-w-3xl my-auto">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-binance-light">
          <h2 class="font-semibold text-lg flex items-center gap-2">
            <svg class="w-5 h-5 text-binance-yellow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="16" height="20" x="4" y="2" rx="2" />
              <line x1="8" x2="16" y1="6" y2="6" />
              <line x1="16" x2="16" y1="14" y2="18" />
              <path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M8 18h.01M12 18h.01" />
            </svg>
            Máy tính Volume → Phí Alpha
          </h2>
          <button
            class="text-gray-500 hover:text-gray-800 text-xl leading-none"
            @click="calc.hide()"
          >
            ✕
          </button>
        </div>

        <div v-if="!store.activeAccounts.length" class="p-6 text-center text-gray-500">
          Chưa có tài khoản nào. Tạo tài khoản ở tab Dashboard trước.
        </div>

        <div v-else class="p-5 space-y-4">
          <!-- Account selector -->
          <div class="flex items-center gap-3">
            <label class="label !mb-0">Tài khoản:</label>
            <select v-model="selectedId" class="input flex-1 max-w-xs">
              <option
                v-for="a in store.activeAccounts"
                :key="a.id"
                :value="a.id"
              >
                {{ a.displayName }}
              </option>
            </select>
            <span
              v-if="selectedAccount"
              class="inline-block w-3 h-3 rounded-full"
              :style="{ background: selectedAccount.color }"
            ></span>
          </div>

          <!-- Config section -->
          <div class="border border-binance-light rounded-xl p-3">
            <div class="text-xs text-gray-500 mb-2 uppercase tracking-wider">
              Cấu hình điểm
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="label">Điểm Trade</label>
                <input
                  v-model.number="cfg.pointTrade"
                  type="number"
                  min="1"
                  max="20"
                  class="input"
                  @change="persistCfg"
                />
              </div>
              <div>
                <label class="label">Điểm Hold</label>
                <input
                  v-model.number="cfg.pointHold"
                  type="number"
                  min="0"
                  class="input"
                  @change="persistCfg"
                />
              </div>
              <div>
                <label class="label">Điểm Tổng</label>
                <div class="input bg-binance-light/30 text-binance-yellow font-semibold">
                  {{ totalPoint }}
                </div>
              </div>
            </div>
          </div>

          <!-- Volume calculator -->
          <div class="border border-binance-light rounded-xl p-3">
            <div class="text-xs text-gray-500 mb-2 uppercase tracking-wider">
              Volume calculator
            </div>

            <!-- Status banner -->
            <div
              class="mb-3 px-3 py-2 rounded-lg border text-sm font-medium flex items-center gap-2"
              :class="reached
                ? 'bg-green-50 border-green-300 text-green-700'
                : 'bg-red-50 border-red-300 text-red-700'"
            >
              <template v-if="reached">
                <span class="text-lg">✓</span>
                Đã đạt mốc {{ cfg.pointTrade }} điểm
              </template>
              <template v-else>
                <span class="text-lg">⚠</span>
                Chưa đạt mốc {{ cfg.pointTrade }} điểm — còn thiếu
                <b>{{ fmtNumber(res.rawNeeded) }}</b> vol raw
              </template>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label class="label">Tổng vol hiện tại (x{{ MULT }})</label>
                <input
                  v-model.number="cfg.currentVol"
                  type="number"
                  class="input"
                  :class="reached ? 'border-green-600' : ''"
                  @change="persistCfg"
                />
              </div>
              <div>
                <label class="label">Volume mỗi lệnh (raw)</label>
                <select
                  v-model.number="cfg.perOrder"
                  class="input"
                  @change="persistCfg"
                >
                  <option v-for="v in perOrderOptions" :key="v" :value="v">
                    {{ fmtNumber(v) }}
                  </option>
                </select>
              </div>
              <div class="bg-binance-light/30 rounded-lg px-3 py-2">
                <div class="text-xs text-gray-500">Điểm hiện tại</div>
                <div
                  class="text-xl font-bold"
                  :class="reached ? 'text-green-600' : 'text-binance-yellow'"
                >
                  {{ res.currentPoint }}
                </div>
              </div>
              <div class="bg-binance-light/30 rounded-lg px-3 py-2">
                <div class="text-xs text-gray-500">Mốc cần đạt (= 2^{{ cfg.pointTrade }})</div>
                <div class="text-xl font-bold">
                  {{ fmtNumber(res.targetVol) }}
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div class="border rounded-lg px-3 py-2"
                   :class="reached ? 'border-green-300 bg-green-50' : 'border-binance-light'">
                <div class="text-xs text-gray-500">Vol raw cần trade</div>
                <div class="text-lg font-semibold"
                     :class="reached ? 'text-green-600' : 'text-gray-800'">
                  {{ fmtNumber(res.rawNeeded) }}
                </div>
              </div>
              <div class="border rounded-lg px-3 py-2"
                   :class="reached ? 'border-green-300 bg-green-50' : 'border-binance-light'">
                <div class="text-xs text-gray-500">Vol x{{ MULT }} còn thiếu</div>
                <div
                  class="text-lg font-semibold"
                  :class="reached ? 'text-green-600' : 'text-red-600'"
                >
                  {{ fmtNumber(res.deltaX4) }}
                </div>
              </div>
              <div class="border rounded-lg px-3 py-2"
                   :class="reached ? 'border-green-300 bg-green-50' : 'border-binance-light'">
                <div class="text-xs text-gray-500">Số lệnh còn lại</div>
                <div
                  class="text-lg font-semibold"
                  :class="reached ? 'text-green-600' : 'text-binance-yellow'"
                >
                  {{ res.ordersNeeded }}
                </div>
              </div>
              <div class="border rounded-lg px-3 py-2"
                   :class="reached ? 'border-green-300 bg-green-50' : 'border-binance-light'">
                <div class="text-xs text-gray-500">
                  {{ reached ? 'Đã đạt' : `Sau khi trade ${res.ordersNeeded} lệnh` }}
                </div>
                <div class="text-lg font-semibold text-green-600">
                  {{ reached ? '✓' : `+${res.pointsGain} điểm` }}
                </div>
              </div>
            </div>

            <details class="mt-2">
              <summary class="cursor-pointer text-xs text-gray-500 hover:text-gray-800">
                Bảng quy đổi Volume → Điểm
              </summary>
              <div class="grid grid-cols-3 md:grid-cols-5 gap-2 mt-2 text-xs">
                <div
                  v-for="t in thresholds"
                  :key="t.point"
                  class="border border-binance-light rounded px-2 py-1"
                  :class="t.point === res.currentPoint ? 'bg-binance-yellow/20 border-binance-yellow' : ''"
                >
                  <span class="text-binance-yellow">{{ t.point }}đ</span>
                  =
                  <span class="text-gray-700">{{ fmtNumber(t.volume) }}</span>
                </div>
              </div>
            </details>
          </div>

          <!-- Fill phí -->
          <div class="border border-binance-light rounded-xl p-3">
            <div class="text-xs text-gray-500 mb-2 uppercase tracking-wider">
              Fill phí vào hệ thống
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label class="label">Ngày</label>
                <input
                  v-model="fillDateIso"
                  type="date"
                  class="input"
                />
              </div>
              <div>
                <label class="label">Trước ($)</label>
                <input
                  v-model.number="cfg.withdraw"
                  type="number"
                  step="0.01"
                  class="input"
                  @change="persistCfg"
                />
              </div>
              <div>
                <label class="label">Sau ($)</label>
                <input
                  v-model.number="cfg.lastAfter"
                  type="number"
                  step="0.01"
                  class="input"
                  placeholder="số dư còn"
                  @change="persistCfg"
                />
              </div>
              <div>
                <label class="label">Phí ($)</label>
                <div class="input bg-binance-light/30 text-rose-600 text-right">
                  {{ fmtUSD(fee) }}
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between mt-3">
              <div class="text-xs text-gray-500">
                Phí = Trước − Sau. Điểm khi lưu = Điểm Tổng (<b class="text-binance-yellow">{{ totalPoint }}</b>).
              </div>
              <div class="flex gap-2">
                <button class="btn-secondary" :disabled="saving" @click="calc.hide()">
                  Đóng
                </button>
                <button
                  class="btn-primary"
                  :disabled="saving || !canSave"
                  @click="saveFee"
                >
                  <span v-if="saving" class="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  {{ saving ? 'Đang lưu...' : 'Lưu phí' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { useTrackingStore } from '../stores/trackingStore';
import { useCalculatorStore, CALC_DEFAULTS, CALC_FIELDS } from '../stores/calculatorStore';
import { useToastStore } from '../stores/toastStore';
import { fmtNumber, fmtUSD, todayStr, isoToDmy, dmyToIso } from '../utils/format';
import {
  ALPHA_VOLUME_MULTIPLIER,
  pointsFromVolume,
} from '../utils/points';

const store = useTrackingStore();
const calc = useCalculatorStore();
const toast = useToastStore();
const MULT = ALPHA_VOLUME_MULTIPLIER;
const perOrderOptions = [128, 256, 512, 1024, 2048];

const thresholds = Array.from({ length: 16 }, (_, i) => ({
  point: i + 5,
  volume: Math.pow(2, i + 5),
}));

const selectedId = computed({
  get: () => calc.selectedAccountId || store.activeAccounts[0]?.id || null,
  set: (v) => calc.selectAccount(v),
});

const selectedAccount = computed(() =>
  store.activeAccounts.find((a) => a.id === selectedId.value)
);

const cfg = reactive({ ...CALC_DEFAULTS });

// Re-sync cfg khi đổi account HOẶC khi server account ref thay đổi (sau loadAll).
const sourceAccount = computed(() =>
  selectedId.value ? store.accountById(selectedId.value) : null
);

watch(
  [selectedId, sourceAccount],
  () => {
    if (!selectedId.value) return;
    Object.assign(cfg, calc.configFor(selectedId.value));
  },
  { immediate: true }
);

function persistCfg() {
  if (!selectedId.value) return;
  const partial = {};
  for (const f of CALC_FIELDS) partial[f] = cfg[f];
  calc.stageConfig(selectedId.value, partial);
}

const totalPoint = computed(
  () => (Number(cfg.pointTrade) || 0) + (Number(cfg.pointHold) || 0)
);

const res = computed(() => {
  const v = Number(cfg.currentVol) || 0;
  const target = Math.pow(2, Number(cfg.pointTrade) || 0);
  const currentPoint = pointsFromVolume(v);
  const deltaX4 = Math.max(0, target - v);
  // +3 vol raw để bù trừ sai số khi trade thực tế (slippage/làm tròn).
  const rawNeeded = deltaX4 > 0 ? Math.ceil(deltaX4 / MULT) + 3 : 0;
  const per = Number(cfg.perOrder) || 1;
  const ordersNeeded = deltaX4 > 0 ? Math.ceil(rawNeeded / per) : 0;
  const afterVol = v + ordersNeeded * per * MULT;
  const pointsGain = pointsFromVolume(afterVol) - currentPoint;
  return {
    targetVol: target,
    currentPoint,
    deltaX4,
    rawNeeded,
    ordersNeeded,
    pointsGain: Math.max(0, pointsGain),
  };
});

const reached = computed(() => res.value.deltaX4 === 0);

// ===== Fill phí =====
// Ngày là session-only (mỗi ngày thay đổi); before/after persist trong cfg.
const fill = reactive({
  date: todayStr(),
});
const saving = ref(false);

const fillDateIso = computed({
  get: () => dmyToIso(fill.date),
  set: (v) => { fill.date = isoToDmy(v) || fill.date; },
});

const fee = computed(() => {
  const before = Number(cfg.withdraw) || 0;
  const after = Number(cfg.lastAfter);
  if (!Number.isFinite(after)) return 0;
  return Math.max(0, before - after);
});

const canSave = computed(
  () => selectedId.value && (fee.value > 0 || totalPoint.value > 0)
);

async function saveFee() {
  if (!canSave.value) return;
  const acc = selectedAccount.value;
  saving.value = true;
  try {
    // 1. Push calc config (staged trong cache) lên sheet Accounts
    persistCfg();
    await calc.pushConfig(selectedId.value);
    // 2. Thêm fee → tự gọi loadAll, refresh accounts (server values mới nhất)
    await store.addFees([
      {
        date: fill.date,
        accountId: selectedId.value,
        fee: fee.value,
        points: totalPoint.value,
      },
    ]);
    toast.success(
      `Đã lưu phí ${fmtUSD(fee.value)} (+${totalPoint.value}đ) cho ${acc?.displayName}`
    );
  } catch (e) {
    toast.error('Lỗi lưu phí: ' + e.message);
  } finally {
    saving.value = false;
  }
}
</script>
