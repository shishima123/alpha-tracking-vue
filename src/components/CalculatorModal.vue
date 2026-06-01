<template>
  <n-modal
    :show="calc.open"
    preset="card"
    style="max-width: 760px"
    :bordered="false"
    @update:show="(v) => { if (!v) calc.hide(); }"
  >
    <template #header>
      <n-flex align="center" :size="8">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M8 18h.01M12 18h.01" />
        </svg>
        <span style="font-weight: 600; font-size: 17px">Máy tính Volume → Phí Alpha</span>
      </n-flex>
    </template>

    <n-empty v-if="!store.activeAccounts.length" description="Chưa có tài khoản nào. Tạo tài khoản ở tab Tài khoản trước." style="padding: 24px 0" />

    <n-flex v-else vertical :size="16">
      <!-- Account selector -->
      <n-flex align="center" :size="12">
        <span class="muted">Tài khoản:</span>
        <n-select v-model:value="selectedId" :options="accountOptions" style="max-width: 280px" />
        <span v-if="selectedAccount" class="dot-lg" :style="{ background: selectedAccount.color }"></span>
      </n-flex>

      <!-- Config section -->
      <div class="section">
        <div class="section-title">Cấu hình điểm</div>
        <n-grid :cols="3" :x-gap="12">
          <n-gi>
            <n-form-item label="Điểm Trade" :show-feedback="false">
              <n-input-number v-model:value="cfg.pointTrade" :min="1" :max="20" style="width: 100%" @update:value="persistCfg" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="Điểm Hold" :show-feedback="false">
              <n-input-number v-model:value="cfg.pointHold" :min="0" style="width: 100%" @update:value="persistCfg" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="Điểm Tổng" :show-feedback="false">
              <div class="readonly accent">{{ totalPoint }}</div>
            </n-form-item>
          </n-gi>
        </n-grid>
      </div>

      <!-- Volume calculator -->
      <div class="section">
        <div class="section-title">Volume calculator</div>

        <n-alert :type="reached ? 'success' : 'error'" :bordered="true" style="margin-bottom: 12px">
          <template v-if="reached">Đã đạt mốc {{ cfg.pointTrade }} điểm</template>
          <template v-else>
            Chưa đạt mốc {{ cfg.pointTrade }} điểm — còn thiếu <b>{{ fmtNumber(res.rawNeeded) }}</b> vol raw
          </template>
        </n-alert>

        <n-grid cols="2 m:4" responsive="screen" :x-gap="12" :y-gap="12">
          <n-gi>
            <n-form-item :label="`Tổng vol hiện tại (x${MULT})`" :show-feedback="false">
              <n-input-number v-model:value="cfg.currentVol" :status="reached ? 'success' : undefined" style="width: 100%" @update:value="persistCfg" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="Volume mỗi lệnh (raw)" :show-feedback="false">
              <n-select v-model:value="cfg.perOrder" :options="perOrderOptions" @update:value="persistCfg" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <div class="metric">
              <div class="metric-label">Điểm hiện tại</div>
              <div class="metric-val" :style="{ color: reached ? '#16a34a' : '#2563eb' }">{{ res.currentPoint }}</div>
            </div>
          </n-gi>
          <n-gi>
            <div class="metric">
              <div class="metric-label">Mốc cần đạt (= 2^{{ cfg.pointTrade }})</div>
              <div class="metric-val">{{ fmtNumber(res.targetVol) }}</div>
            </div>
          </n-gi>
        </n-grid>

        <n-grid cols="2 m:4" responsive="screen" :x-gap="12" :y-gap="12" style="margin-top: 12px">
          <n-gi>
            <div class="box" :class="{ ok: reached }">
              <div class="metric-label">Vol raw cần trade</div>
              <div class="box-val" :style="{ color: reached ? '#16a34a' : '#334155' }">{{ fmtNumber(res.rawNeeded) }}</div>
            </div>
          </n-gi>
          <n-gi>
            <div class="box" :class="{ ok: reached }">
              <div class="metric-label">Vol x{{ MULT }} còn thiếu</div>
              <div class="box-val" :style="{ color: reached ? '#16a34a' : '#dc2626' }">{{ fmtNumber(res.deltaX4) }}</div>
            </div>
          </n-gi>
          <n-gi>
            <div class="box" :class="{ ok: reached }">
              <div class="metric-label">Số lệnh còn lại</div>
              <div class="box-val" :style="{ color: reached ? '#16a34a' : '#2563eb' }">{{ res.ordersNeeded }}</div>
            </div>
          </n-gi>
          <n-gi>
            <div class="box" :class="{ ok: reached }">
              <div class="metric-label">{{ reached ? 'Đã đạt' : `Sau khi trade ${res.ordersNeeded} lệnh` }}</div>
              <div class="box-val" style="color: #16a34a">{{ reached ? '✓' : `+${res.pointsGain} điểm` }}</div>
            </div>
          </n-gi>
        </n-grid>

        <n-collapse style="margin-top: 12px">
          <n-collapse-item title="Bảng quy đổi Volume → Điểm" name="conv">
            <n-grid cols="3 m:5" responsive="screen" :x-gap="8" :y-gap="8">
              <n-gi v-for="t in thresholds" :key="t.point">
                <div class="conv-chip" :class="{ active: t.point === res.currentPoint }">
                  <span style="color: #2563eb">{{ t.point }}đ</span> = <span class="muted">{{ fmtNumber(t.volume) }}</span>
                </div>
              </n-gi>
            </n-grid>
          </n-collapse-item>
        </n-collapse>
      </div>

      <!-- Fill phí -->
      <div class="section">
        <div class="section-title">Fill phí vào hệ thống</div>
        <n-grid cols="2 m:4" responsive="screen" :x-gap="12" :y-gap="12">
          <n-gi>
            <n-form-item label="Ngày" :show-feedback="false">
              <n-date-picker v-model:formatted-value="fill.date" value-format="dd/MM/yyyy" format="dd/MM/yyyy" type="date" :clearable="false" style="width: 100%" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="Trước ($)" :show-feedback="false">
              <n-input-number v-model:value="cfg.withdraw" :step="0.01" style="width: 100%" @update:value="persistCfg" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="Sau ($)" :show-feedback="false">
              <n-input-number v-model:value="cfg.lastAfter" :step="0.01" placeholder="số dư còn" style="width: 100%" @update:value="persistCfg" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="Phí ($)" :show-feedback="false">
              <div class="readonly fee">{{ fmtUSD(fee) }}</div>
            </n-form-item>
          </n-gi>
        </n-grid>
      </div>
    </n-flex>

    <template #footer>
      <n-flex justify="space-between" align="center" :wrap="true" :size="8">
        <n-text depth="3" style="font-size: 12px">
          Phí = Trước − Sau. Điểm khi lưu = Điểm Tổng (<b style="color: #2563eb">{{ totalPoint }}</b>).
        </n-text>
        <n-flex :size="8">
          <n-button :disabled="saving" @click="calc.hide()">Đóng</n-button>
          <n-button type="primary" :loading="saving" :disabled="!canSave" @click="saveFee">
            {{ saving ? 'Đang lưu...' : 'Lưu phí' }}
          </n-button>
        </n-flex>
      </n-flex>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import {
  NModal, NSelect, NInputNumber, NAlert, NButton, NFlex, NGrid, NGi,
  NFormItem, NDatePicker, NCollapse, NCollapseItem, NEmpty, NText,
} from 'naive-ui';
import { useTrackingStore } from '../stores/trackingStore';
import { useCalculatorStore, CALC_DEFAULTS, CALC_FIELDS } from '../stores/calculatorStore';
import { useToastStore } from '../stores/toastStore';
import { fmtNumber, fmtUSD, todayStr } from '../utils/format';
import {
  ALPHA_VOLUME_MULTIPLIER,
  pointsFromVolume,
} from '../utils/points';

const store = useTrackingStore();
const calc = useCalculatorStore();
const toast = useToastStore();
const MULT = ALPHA_VOLUME_MULTIPLIER;
const perOrderOptions = [128, 256, 512, 1024, 2048].map((v) => ({ label: fmtNumber(v), value: v }));

const accountOptions = computed(() =>
  store.activeAccounts.map((a) => ({ label: a.displayName, value: a.id }))
);

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
    persistCfg();
    await calc.pushConfig(selectedId.value);
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

<style scoped>
.muted { color: #94a3b8; }
.dot-lg { width: 12px; height: 12px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.section { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
.section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 8px; }
.readonly {
  width: 100%; min-height: 34px; display: flex; align-items: center;
  padding: 0 12px; border-radius: 6px; background: rgba(219, 226, 236, 0.4);
}
.readonly.accent { color: #2563eb; font-weight: 600; }
.readonly.fee { color: #e11d48; justify-content: flex-end; }
.metric { background: rgba(219, 226, 236, 0.4); border-radius: 8px; padding: 6px 12px; }
.metric-label { font-size: 12px; color: #94a3b8; }
.metric-val { font-size: 20px; font-weight: 700; }
.box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 12px; }
.box.ok { border-color: #86efac; background: #f0fdf4; }
.box-val { font-size: 18px; font-weight: 600; }
.conv-chip { border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 8px; font-size: 12px; }
.conv-chip.active { background: rgba(37, 99, 235, 0.12); border-color: #2563eb; }
</style>
