<template>
  <n-flex vertical :size="20">
    <!-- Header config -->
    <n-card>
      <n-flex justify="space-between" align="center" :wrap="true" :size="12">
        <div style="max-width: 720px">
          <div class="card-title">Theo dõi điểm Alpha</div>
          <n-text depth="3" style="font-size: 12px; display: block; margin-top: 4px">
            Tổng = sum điểm phí trong 15 ngày gần nhất (không tính hôm nay).
            Trừ <b>claimPoints</b> mỗi kèo alpha đã nhận trong cùng cửa sổ.
            Khi kèo hết hạn → điểm hồi lại.
          </n-text>
        </div>
        <n-flex align="center" :size="16" :wrap="true">
          <n-flex align="center" :size="6">
            <n-switch v-model:value="highlightMode" size="small" />
            <span>Highlight</span>
          </n-flex>
          <n-flex align="center" :size="6">
            <span class="muted">Điểm yêu cầu để nhận:</span>
            <n-input-number v-model:value="required" :min="1" :show-button="false" style="width: 96px" />
          </n-flex>
        </n-flex>
      </n-flex>
    </n-card>

    <!-- Cards điểm từng account -->
    <n-grid cols="1 m:2 l:3" responsive="screen" :x-gap="16" :y-gap="16">
      <n-gi v-for="acc in pointsAccounts" :key="acc.id">
        <n-card
          class="acc-card"
          :class="{ dimmed: dimmed(acc.id), glow: glow(acc.id) }"
        >
          <!-- Header: name + tag -->
          <n-flex justify="space-between" align="center" style="margin-bottom: 12px">
            <n-flex align="center" :size="8">
              <span class="dot" :style="{ background: acc.color }"></span>
              <span class="card-title">{{ acc.displayName }}</span>
            </n-flex>
            <n-tag v-if="data(acc.id).airdrop.eligible" type="success" size="small" :bordered="false">
              ✓ Đủ điểm nhận
            </n-tag>
            <n-tag v-else type="default" size="small" :bordered="false">
              Thiếu {{ pt(data(acc.id).airdrop.deficit) }}
            </n-tag>
          </n-flex>

          <!-- Metrics 4 ô -->
          <n-grid :cols="4" :x-gap="8" style="margin-bottom: 12px">
            <n-gi>
              <div class="metric">
                <div class="metric-label">Tổng điểm</div>
                <div class="metric-val">{{ pt(data(acc.id).totalPoints) }}</div>
              </div>
            </n-gi>
            <n-gi>
              <div class="metric">
                <div class="metric-label">Đã trừ</div>
                <div class="metric-val" style="color: #e11d48">−{{ pt(data(acc.id).deducted) }}</div>
              </div>
            </n-gi>
            <n-gi>
              <div class="metric metric--accent">
                <div class="metric-label">Còn lại</div>
                <div class="metric-val" :style="{ color: data(acc.id).airdrop.eligible ? '#16a34a' : '#2563eb' }">
                  {{ pt(data(acc.id).currentPoints) }}
                </div>
              </div>
            </n-gi>
            <n-gi>
              <div class="metric">
                <div class="metric-label">Số kèo</div>
                <div class="metric-val" style="color: #475569">{{ pt(data(acc.id).claimsCount) }}</div>
              </div>
            </n-gi>
          </n-grid>

          <!-- Ngày reset -->
          <n-divider style="margin: 8px 0" />
          <div class="muted" style="font-size: 12px; margin-bottom: 8px">
            Ngày reset (kèo hết hạn, điểm hồi lại)
          </div>
          <div v-if="!data(acc.id).schedule.length" class="muted" style="font-size: 12px">
            Chưa có kèo nào đã nhận trong 14 ngày qua
          </div>
          <div v-else class="schedule">
            <div v-for="(s, i) in data(acc.id).schedule" :key="i" class="schedule-row">
              <div style="flex: 1; min-width: 0">
                <div style="color: #2563eb; font-weight: 600">
                  {{ s.resetDate }}
                  <span class="muted" style="font-weight: 400">· còn {{ s.daysLeft }}d</span>
                </div>
                <div class="muted ellipsis">{{ s.projectName }}</div>
              </div>
              <span style="color: #16a34a; font-weight: 600; white-space: nowrap">
                +{{ pt(s.claimPoints) }}đ
              </span>
            </div>
          </div>
        </n-card>
      </n-gi>
    </n-grid>
  </n-flex>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useStorage } from '@vueuse/core';
import { NFlex, NCard, NGrid, NGi, NTag, NSwitch, NInputNumber, NText, NDivider } from 'naive-ui';
import { useTrackingStore } from '../stores/trackingStore';
import { computeAlphaPoints } from '../utils/points';
import { hideMoney, MASK } from '../utils/privacy';

const store = useTrackingStore();

// "Điểm yêu cầu" + "Highlight" tự đồng bộ localStorage qua useStorage.
const required = useStorage('alpha:pointsRequired', 15);
const highlightMode = useStorage('alpha:pointsHighlight', false);

// allFees không nằm trong bootstrap → load riêng khi mở tab Điểm.
onMounted(() => {
  if (store.allFees.length === 0) store.loadAllFees();
});

// Khi bật chế độ ẩn, che luôn số điểm (giữ ngày & tên dự án vì không nhạy cảm).
function pt(n) {
  return hideMoney.value ? MASK : n;
}

const pointsAccounts = computed(() =>
  store.activeAccounts.filter((a) => !a.hideInPoints)
);

// Dùng allFees (toàn bộ daily) chứ không phải store.fees (chỉ tháng hiện tại):
// cửa sổ 15 ngày có thể trải sang tháng trước, đặc biệt đầu tháng mới.
const pointsData = computed(() =>
  computeAlphaPoints(store.allFees || [], store.projects || [], required.value)
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

function glow(id) {
  return highlightMode.value && data(id).airdrop.eligible;
}
function dimmed(id) {
  return highlightMode.value && !data(id).airdrop.eligible;
}
</script>

<style scoped>
.card-title { font-weight: 600; }
.muted { color: #94a3b8; }
.dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.acc-card { transition: all 0.25s; }
.acc-card.dimmed { opacity: 0.3; filter: grayscale(1); }
.acc-card.glow { box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.6), 0 8px 24px -8px rgba(34, 197, 94, 0.35); }
.metric {
  border: 1px solid #dbe2ec;
  border-radius: 8px;
  padding: 8px 4px;
  text-align: center;
}
.metric--accent { background: rgba(219, 226, 236, 0.4); }
.metric-label { font-size: 11px; color: #94a3b8; }
.metric-val { font-size: 20px; font-weight: 700; }
.schedule { display: flex; flex-direction: column; gap: 6px; font-size: 12px; max-height: 192px; overflow-y: auto; }
.schedule-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
