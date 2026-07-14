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

    <n-empty v-if="!selectableAccounts.length" description="Chưa có tài khoản khả dụng. Tạo tài khoản (active, không ẩn điểm) ở tab Tài khoản trước." style="padding: 24px 0" />

    <n-flex v-else vertical :size="16">
      <!-- Account selector -->
      <n-flex align="center" :size="12">
        <span class="muted">Tài khoản:</span>
        <n-select v-model:value="selectedId" :options="accountOptions" :render-label="renderAccountLabel" style="max-width: 280px" />
        <span v-if="selectedAccount" class="dot-lg" :style="{ background: selectedAccount.color }"></span>
      </n-flex>

      <!-- Config section -->
      <div class="section">
        <div class="section-title">Cấu hình điểm</div>
        <n-grid :cols="3" :x-gap="12">
          <n-gi>
            <n-form-item label="Điểm Trade" :show-feedback="false">
              <n-select v-model:value="cfg.pointTrade" :options="pointTradeOptions" style="width: 100%" @update:value="persistCfg" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item label="Điểm Hold" :show-feedback="false">
              <n-select v-model:value="cfg.pointHold" :options="pointHoldOptions" style="width: 100%" @update:value="persistCfg" />
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

        <div class="vol-inputs">
          <n-form-item :label="`Tổng vol hiện tại (x${MULT})`" :show-feedback="false">
            <n-input-number v-model:value="cfg.currentVol" class="fill-input" :status="reached ? 'success' : undefined" :show-button="false" style="width: 100%" @update:value="persistCfg" />
          </n-form-item>
          <n-form-item label="Volume mỗi lệnh (raw)" :show-feedback="false">
            <n-select v-model:value="cfg.perOrder" :options="perOrderOptions" @update:value="persistCfg" />
          </n-form-item>
        </div>

        <div class="stats-grid">
          <div class="stat">
            <div class="stat-label">Điểm hiện tại</div>
            <div class="stat-val" :style="{ color: reached ? '#16a34a' : '#2563eb' }">{{ res.currentPoint }}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Mốc cần đạt (2^{{ cfg.pointTrade }})</div>
            <div class="stat-val">{{ fmtNumber(res.targetVol) }}</div>
          </div>
          <div class="stat" :class="{ ok: reached }">
            <div class="stat-label">Vol raw cần trade</div>
            <div class="stat-val" :style="{ color: reached ? '#16a34a' : '#334155' }">{{ fmtNumber(res.rawNeeded) }}</div>
          </div>
          <div class="stat" :class="{ ok: reached }">
            <div class="stat-label">Vol x{{ MULT }} còn thiếu</div>
            <div class="stat-val" :style="{ color: reached ? '#16a34a' : '#dc2626' }">{{ fmtNumber(res.deltaX4) }}</div>
          </div>
          <div class="stat" :class="{ ok: reached }">
            <div class="stat-label">Số lệnh còn lại</div>
            <div class="stat-val" :style="{ color: reached ? '#16a34a' : '#2563eb' }">{{ res.ordersNeeded }}</div>
          </div>
          <div class="stat" :class="{ ok: reached }">
            <div class="stat-label">{{ reached ? 'Đã đạt' : `Sau ${res.ordersNeeded} lệnh` }}</div>
            <div class="stat-val" style="color: #16a34a">{{ reached ? '✓' : `+${res.pointsGain}đ` }}</div>
          </div>
        </div>
      </div>

      <!-- Fill phí -->
      <div class="section">
        <div class="section-title">Fill phí vào hệ thống</div>
        <div class="fill-grid">
          <n-form-item label="Ngày" :show-feedback="false">
            <n-date-picker v-model:formatted-value="fill.date" value-format="dd/MM/yyyy" format="dd/MM/yyyy" type="date" :clearable="false" style="width: 100%" />
          </n-form-item>
          <n-form-item label="Trước ($)" :show-feedback="false">
            <n-input-number v-model:value="cfg.withdraw" :step="0.01" :show-button="false" style="width: 100%" @update:value="persistCfg" />
          </n-form-item>
          <n-form-item label="Sau ($)" :show-feedback="false">
            <n-flex :size="4" align="center" :wrap="true" style="width: 100%">
              <n-select
                :value="afterIntSelect"
                :options="afterIntOptions"
                class="fill-input"
                placeholder="Phần nguyên"
                style="flex: 1 1 88px; min-width: 0"
                @update:value="onIntSelect"
              />
              <n-input-number
                v-if="afterIntSelect === 'other'"
                :value="afterIntCustom"
                :show-button="false"
                class="fill-input"
                placeholder="Số"
                style="width: 84px"
                @update:value="onIntCustom"
              />
              <span class="dec-dot">.</span>
              <n-input
                :value="afterDec"
                class="fill-input"
                placeholder="00"
                style="width: 60px"
                @update:value="onDecInput"
              />
            </n-flex>
          </n-form-item>
          <n-form-item label="Phí ($)" :show-feedback="false">
            <div class="readonly fee">{{ fmtUSD(fee) }}</div>
          </n-form-item>
        </div>
        <label class="mark-row">
          <n-switch v-model:value="fill.highlight" size="small" />
          <span>★ Đánh dấu ngày này (ngày đi đủ điều kiện nhận kèo)</span>
        </label>
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
import { ref, reactive, computed, watch, h } from 'vue';
import {
  NModal, NSelect, NInput, NInputNumber, NAlert, NButton, NFlex, NGrid, NGi,
  NFormItem, NDatePicker, NEmpty, NText, NSwitch,
} from 'naive-ui';
import { useTrackingStore } from '../stores/trackingStore';
import { useCalculatorStore, CALC_DEFAULTS, CALC_FIELDS } from '../stores/calculatorStore';
import { useToastStore } from '../stores/toastStore';
import { confirmAction } from '../utils/naive';
import { fmtNumber, fmtUSD, todayStr, round2 } from '../utils/format';
import {
  ALPHA_VOLUME_MULTIPLIER,
  pointsFromVolume,
} from '../utils/points';

const store = useTrackingStore();
const calc = useCalculatorStore();
const toast = useToastStore();
const MULT = ALPHA_VOLUME_MULTIPLIER;
const perOrderOptions = [128, 256, 512, 1024, 2048].map((v) => ({ label: fmtNumber(v), value: v }));
const pointTradeOptions = [14, 15, 16, 17, 18].map((v) => ({ label: String(v), value: v }));
const pointHoldOptions = [1, 2, 3].map((v) => ({ label: String(v), value: v }));

// Chỉ tài khoản active VÀ không bật "ẩn máy tính" mới hiện ở máy tính.
const selectableAccounts = computed(() =>
  store.activeAccounts.filter((a) => !a.hideInCalc)
);

// Account đã có phí nhập cho HÔM NAY → đánh dấu tích trong dropdown.
const feeTodayAccountIds = computed(() => {
  const today = todayStr();
  const set = new Set();
  for (const f of store.fees || []) {
    if (f.date === today) set.add(f.accountId);
  }
  return set;
});

const accountOptions = computed(() =>
  selectableAccounts.value.map((a) => ({
    label: a.displayName,
    value: a.id,
    hasFeeToday: feeTodayAccountIds.value.has(a.id),
  }))
);

// Render label cho n-select: tên bên trái, dấu tích "đã nhập hôm nay" bên phải.
function renderAccountLabel(option) {
  return h(
    'div',
    { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%' },
    [
      h('span', option.label),
      option.hasFeeToday
        ? h('span', { style: 'color:#16a34a;font-size:12px;white-space:nowrap' }, '✓ đã trade')
        : null,
    ]
  );
}

const selectedId = computed({
  get: () => {
    const list = selectableAccounts.value;
    if (calc.selectedAccountId && list.some((a) => a.id === calc.selectedAccountId)) {
      return calc.selectedAccountId;
    }
    return list[0]?.id || null;
  },
  set: (v) => calc.selectAccount(v),
});

const selectedAccount = computed(() => store.accountById(selectedId.value));

const cfg = reactive({ ...CALC_DEFAULTS });

// ===== "Sau ($)" tách 2 phần: dropdown phần nguyên + input phần thập phân =====
// cfg.lastAfter vẫn là source of truth (số gộp) — fee = Trước − Sau không đổi.
const AFTER_INT_OPTIONS = [];
for (let i = 1040; i <= 1050; i++) AFTER_INT_OPTIONS.push(i);
const afterIntOptions = [
  ...AFTER_INT_OPTIONS.map((v) => ({ label: String(v), value: v })),
  { label: 'Khác', value: 'other' },
];
const afterIntSelect = ref(null); // số nguyên đã chọn, hoặc 'other'
const afterIntCustom = ref(null); // số nguyên tự nhập khi chọn 'other'
const afterDec = ref('');         // chuỗi chữ số phần thập phân ("5" → .5)

// cfg.lastAfter (số gộp) → 3 phần UI. Gọi khi đổi account / sau loadAll.
function syncAfterParts() {
  const v = cfg.lastAfter;
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

// 3 phần UI → cfg.lastAfter (số gộp) rồi persist.
function composeAfter() {
  const intVal = afterIntSelect.value === 'other' ? afterIntCustom.value : afterIntSelect.value;
  if (intVal === null || intVal === undefined || intVal === '') {
    cfg.lastAfter = null;
  } else {
    const dec = String(afterDec.value ?? '').replace(/\D/g, '');
    cfg.lastAfter = dec ? Number(`${intVal}.${dec}`) : Number(intVal);
  }
  persistCfg();
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

// Re-sync cfg khi đổi account HOẶC khi server account ref thay đổi (sau loadAll).
const sourceAccount = computed(() =>
  selectedId.value ? store.accountById(selectedId.value) : null
);

watch(
  [selectedId, sourceAccount],
  () => {
    if (!selectedId.value) return;
    Object.assign(cfg, calc.configFor(selectedId.value));
    syncAfterParts();
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
  highlight: false,
});
const saving = ref(false);

const fee = computed(() => {
  const before = Number(cfg.withdraw) || 0;
  const after = Number(cfg.lastAfter);
  if (!Number.isFinite(after)) return 0;
  return round2(Math.max(0, before - after));
});

const canSave = computed(
  () => selectedId.value && (fee.value > 0 || totalPoint.value > 0)
);

async function saveFee() {
  if (!canSave.value) return;
  const acc = selectedAccount.value;
  if (!(await confirmAction({
    title: 'Lưu phí',
    content: () => h('div', { style: 'line-height:1.8' }, [
      'Lưu phí ',
      h('b', { style: 'color:#e11d48' }, fmtUSD(fee.value)),
      ' (',
      h('b', { style: 'color:#2563eb' }, `+${totalPoint.value}đ`),
      ') cho ',
      h('b', { style: 'color:#0f172a' }, acc?.displayName),
      ' ngày ',
      h('b', { style: 'color:#0f172a' }, fill.date),
      '?',
    ]),
    positiveText: 'Lưu',
    type: 'info',
  }))) return;
  saving.value = true;
  try {
    persistCfg();
    // Config account (currentVol/lastAfter/...) đi kèm luôn trong request lưu
    // phí — 1 request thay vì 2 (Apps Script serialize, 2 request là chờ đôi).
    const accountConfig = { id: selectedId.value };
    for (const f of CALC_FIELDS) {
      const v = cfg[f];
      if (v !== undefined && v !== null && v !== '') accountConfig[f] = v;
    }
    await store.addFeesWithConfig([
      {
        date: fill.date,
        accountId: selectedId.value,
        fee: fee.value,
        points: totalPoint.value,
        highlight: fill.highlight,
      },
    ], accountConfig);
    toast.success(
      `Đã lưu phí ${fmtUSD(fee.value)} (+${totalPoint.value}đ) cho ${acc?.displayName}`
    );
    fill.highlight = false; // reset để không vô tình đánh dấu lệnh kế tiếp
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
.mark-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 13px; color: #475569; cursor: pointer; }
/* Ô cần người dùng nhập → tô nền vàng nhạt cho dễ nhận biết. */
.fill-input :deep(.n-input) { background-color: #fefce8; }
.fill-input :deep(.n-input.n-input--focus) { background-color: #fffef7; }
/* Phần thập phân là <n-input> trực tiếp → root chính là .n-input (không phải con). */
.fill-input.n-input { background-color: #fefce8; }
.fill-input.n-input.n-input--focus { background-color: #fffef7; }
.fill-input :deep(.n-base-selection .n-base-selection-label) { background-color: #fefce8; }
.dec-dot { font-weight: 700; color: #475569; flex: 0 0 auto; }
.stat {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 5px 10px;
  background: rgba(219, 226, 236, 0.25);
}
.stat.ok { border-color: #86efac; background: #f0fdf4; }
.stat-label { font-size: 11px; color: #94a3b8; line-height: 1.3; }
.stat-val { font-size: 17px; font-weight: 700; line-height: 1.35; white-space: nowrap; }

/* 2 input vol luôn nằm cùng 1 hàng. */
.vol-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
/* 6 card chỉ số: 3 cột/hàng, xuống 2 cột khi < 480px. */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}
/* Fill phí: 4 input trên 1 hàng, chia 2-2 khi < 480px. */
.fill-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
@media (max-width: 480px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .fill-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
