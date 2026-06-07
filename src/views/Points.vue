<template>
  <n-flex vertical :size="20">
    <!-- Header config -->
    <n-card>
      <n-flex justify="space-between" align="center" :wrap="true" :size="12">
        <div style="max-width: 720px">
          <div class="card-title">Theo dõi điểm Alpha</div>
          <n-text depth="3" style="font-size: 12px; display: block; margin-top: 4px">
            Tổng = sum điểm phí trong 15 ngày gần nhất
            ({{ futureMode ? 'tính cả hôm nay — xem trước ngày mai' : 'không tính hôm nay' }}).
            Trừ <b>claimPoints</b> mỗi kèo alpha đã nhận trong cùng cửa sổ.
            Khi kèo hết hạn → điểm hồi lại.
          </n-text>
        </div>
        <n-flex align="center" :size="16" :wrap="true" style="flex: 1 1 auto">
          <n-flex align="center" :size="6">
            <n-switch v-model:value="highlightMode" size="small" />
            <span>Highlight</span>
          </n-flex>
          <n-flex align="center" :size="6">
            <span class="muted">Điểm yêu cầu để nhận:</span>
            <n-input-number v-model:value="requiredModel" :min="1" :show-button="false" style="width: 96px" />
          </n-flex>
          <n-tooltip>
            <template #trigger>
              <n-flex align="center" :size="6" style="margin-left: auto">
                <n-switch v-model:value="futureMode" size="small" />
                <span>Tương lai</span>
              </n-flex>
            </template>
            Xem trước điểm của ngày mai (cộng phí hôm nay, bỏ ngày cũ nhất hết hạn).
          </n-tooltip>
        </n-flex>
      </n-flex>
    </n-card>

    <!-- Card chứa toggle + nội dung (đồng bộ với tab Dự án) -->
    <n-card class="points-panel">
      <n-flex justify="space-between" align="center" :wrap="true" :size="8" style="margin-bottom: 12px">
        <span class="card-title">Điểm theo tài khoản</span>
        <n-radio-group v-model:value="viewMode" size="small">
          <n-radio-button value="full">Đầy đủ</n-radio-button>
          <n-radio-button value="mini">Tối giản</n-radio-button>
        </n-radio-group>
      </n-flex>

      <!-- ===== View: Tối giản (bảng pivot) ===== -->
      <div v-if="viewMode === 'mini'" class="mini-wrap">
      <table class="mini-table">
        <thead>
          <tr>
            <th class="mini-corner">Alpha Points</th>
            <th v-for="acc in pointsAccounts" :key="acc.id" colspan="2" class="mini-acc">
              <span class="dot dot-sm" :style="{ background: acc.color }"></span>{{ acc.displayName }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="mini-label">Điểm còn lại</td>
            <td
              v-for="acc in pointsAccounts"
              :key="acc.id"
              colspan="2"
              class="mini-num"
              :class="accHl(acc.id)"
              :style="{ color: data(acc.id).airdrop.eligible ? '#16a34a' : '#2563eb' }"
            >
              {{ pt(data(acc.id).currentPoints) }}
            </td>
          </tr>
          <tr>
            <td class="mini-label">Số lần húp</td>
            <td v-for="acc in pointsAccounts" :key="acc.id" colspan="2" class="mini-num muted">
              {{ pt(data(acc.id).claimsCount) }}
            </td>
          </tr>
          <tr>
            <td class="mini-label">Tổng điểm</td>
            <td v-for="acc in pointsAccounts" :key="acc.id" colspan="2" class="mini-num muted">
              {{ pt(data(acc.id).totalPoints) }}
            </td>
          </tr>
          <tr v-for="i in miniMaxSchedule" :key="'reset-' + i">
            <td class="mini-label">{{ i === 1 ? 'Ngày reset' : '' }}</td>
            <template v-for="acc in pointsAccounts" :key="acc.id">
              <td class="mini-days">{{ data(acc.id).schedule[i - 1]?.daysLeft }}</td>
              <td class="mini-date">{{ data(acc.id).schedule[i - 1]?.resetDate }}</td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ===== View: Đầy đủ ===== -->
    <div v-else class="acc-grid">
        <n-card
          v-for="acc in pointsAccounts"
          :key="acc.id"
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
    </div>
    </n-card>
  </n-flex>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useStorage } from '@vueuse/core';
import { NFlex, NCard, NGrid, NGi, NTag, NSwitch, NInputNumber, NText, NDivider, NRadioGroup, NRadioButton, NTooltip } from 'naive-ui';
import { useTrackingStore } from '../stores/trackingStore';
import { computeAlphaPoints } from '../utils/points';
import { usePersistedNumber } from '../utils/persistedNumber';
import { hideMoney, MASK } from '../utils/privacy';

const store = useTrackingStore();

// "Điểm yêu cầu" + "Highlight" tự đồng bộ localStorage qua useStorage.
// requiredModel = ô nhập (xoá rỗng được khi sửa); required = giá trị đã lưu.
const { stored: required, model: requiredModel } = usePersistedNumber('alpha:pointsRequired', 15, { min: 1 });
const highlightMode = useStorage('alpha:pointsHighlight', false);
const viewMode = useStorage('alpha:pointsViewMode', 'full');
// "Tương lai" là chế độ xem trước nhất thời → ref thường (không lưu), reset OFF mỗi lần mở.
const futureMode = ref(false);

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
  computeAlphaPoints(store.allFees || [], store.projects || [], required.value, futureMode.value)
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

// Số dòng "Ngày reset" tối đa (account có nhiều kèo nhất) — cho view tối giản dạng bảng.
const miniMaxSchedule = computed(() =>
  Math.max(0, ...pointsAccounts.value.map((a) => data(a.id).schedule.length))
);

function glow(id) {
  return highlightMode.value && data(id).airdrop.eligible;
}
function dimmed(id) {
  return highlightMode.value && !data(id).airdrop.eligible;
}
// Class nền cho từng cột tài khoản ở view tối giản khi bật Highlight.
function accHl(id) {
  if (!highlightMode.value) return null;
  return data(id).airdrop.eligible ? 'hl-ok' : 'hl-dim';
}
</script>

<style scoped>
/* Đồng bộ padding card với tab khác (.card Tailwind = 16px). */
:deep(.n-card-content) { padding: 16px !important; }
.card-title { font-weight: 600; }
.muted { color: #94a3b8; }
.dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
/* Card lớn nền xám nhạt để card tài khoản (trắng) nổi rõ. */
.points-panel { background: #eef1f6; }
/* Card tài khoản tự sắp xếp theo bề rộng: 2-3+ card/hàng tùy màn, full-width < 480px. */
.acc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
@media (max-width: 480px) {
  .acc-grid { grid-template-columns: 1fr; }
}
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

/* ===== View tối giản (bảng pivot) ===== */
.mini-wrap {
  overflow-x: auto;
  border: 1px solid #efeff5;
  border-radius: 8px;
  background: #fff;
}
.mini-table {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  font-size: 13px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.mini-table th,
.mini-table td {
  border-bottom: 1px solid #efeff5;
  border-right: 1px solid #efeff5;
  padding: 7px 10px;
}
/* Không kẻ giữa ô "số ngày" và "ngày" của cùng 1 tài khoản; bỏ border cột cuối. */
.mini-table td.mini-days { border-right: 0; }
.mini-table tr > :last-child { border-right: 0; }
.mini-table tbody tr:last-child th,
.mini-table tbody tr:last-child td { border-bottom: 0; }
.mini-table thead th {
  background: #fafafc;
  font-weight: 700;
  text-align: center;
  color: #1f2225;
}
.dot-sm { width: 8px; height: 8px; margin-right: 6px; vertical-align: middle; }
.mini-corner { text-align: left; }
.mini-label { font-weight: 600; color: #334155; text-align: left; }
.mini-num { text-align: center; font-weight: 700; }
.mini-num.muted { color: #94a3b8; font-weight: 600; }
.mini-days { text-align: right; color: #94a3b8; padding-right: 2px; }
.mini-date { color: #2563eb; font-weight: 600; padding-left: 4px; }
/* Highlight ô "Điểm còn lại" theo trạng thái đủ/thiếu điểm. */
.mini-table td.hl-ok { background-color: rgba(34, 197, 94, 0.14); }
.mini-table td.hl-dim { background-color: rgba(148, 163, 184, 0.1); opacity: 0.5; }
/* Freeze cột nhãn khi cuộn ngang */
.mini-table th:first-child,
.mini-table td:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  background: #fff;
  border-right: 1px solid #efeff5;
}
.mini-table thead th:first-child {
  z-index: 2;
  background: #fafafc;
}
/* Hover row — đồng bộ với bảng pivot bên Dự án. */
.mini-table tbody td,
.mini-table tbody th { transition: box-shadow 0.15s; }
.mini-table tbody tr:hover td,
.mini-table tbody tr:hover th {
  box-shadow: inset 0 0 0 999px rgba(15, 23, 42, 0.04);
}
.schedule { display: flex; flex-direction: column; gap: 6px; font-size: 12px; max-height: 192px; overflow-y: auto; }
.schedule-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
