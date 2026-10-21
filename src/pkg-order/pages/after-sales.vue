<template>
  <view class="as-page">
    <!-- 状态筛选：全部 / 处理中 / 已退款 / 已结束 -->
    <view class="as-tabs">
      <view
        v-for="t in tabs" :key="t.key"
        class="as-tab" :class="{ on: tab === t.key }"
        @click="tab = t.key"
      >
        <text>{{ $t('afterSalesList.' + t.labelKey) }}</text>
        <text class="as-tab__n" v-if="counts[t.key] > 0">{{ counts[t.key] }}</text>
      </view>
    </view>

    <LoadingSkeleton v-if="loading" type="card" :count="2" />

    <view v-else-if="!filtered.length" class="as-empty">
      <text class="as-empty__ico">📄</text>
      <text class="as-empty__text">{{ $t(filteredEmptyKey) }}</text>
    </view>

    <view v-else class="as-list">
      <view class="as-card" v-for="r in filtered" :key="r.id" @click="open(r)">
        <view class="as-card__head">
          <text class="as-card__state" :class="'st-' + r.state">{{ stateLabel(r.state) }}</text>
          <text class="as-card__time">{{ fmtTime(r.createdAt) }}</text>
        </view>
        <view class="as-card__body">
          <view class="as-card__main">
            <view class="as-card__title-row">
              <text class="as-card__type">{{ typeLabel(r.type) }}</text>
              <text class="as-card__reason">{{ r.reason }}</text>
            </view>
            <text class="as-card__order" v-if="r.order?.code">{{ $t('afterSalesList.orderNo') }} {{ r.order.code }}</text>
            <text class="as-card__desc" v-if="descLine(r)">{{ descLine(r) }}</text>
          </view>
          <view class="as-card__right">
            <text class="as-card__amount">¥{{ fen(r.refundAmount) }}</text>
            <text class="as-card__msgs" v-if="r.messageCount">{{ $t('afterSalesList.msgs').replace('{n}', String(r.messageCount)) }}</text>
          </view>
        </view>
        <view class="as-card__imgs" v-if="r.evidenceImages?.length">
          <image
            v-for="(img, i) in r.evidenceImages.slice(0, 3)" :key="i"
            :src="img" mode="aspectFill" class="as-card__img"
          />
        </view>
        <view class="as-card__foot">
          <text class="as-card__done" v-if="r.state === 'Refunded'">
            {{ $t('afterSalesList.refundedAt').replace('{t}', fmtTime(r.refundedAt)) }}
          </text>
          <text class="as-card__link">{{ $t('afterSalesList.viewDetail') }} ›</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { fetchMyAfterSales } from '../../api/queries/afterSale';
import type { AfterSaleRequest } from '../../api/queries/afterSale';
import { useLocaleStore } from '../../stores/locale';
import { useAuthStore } from '../../stores/auth';
import { getSessionToken } from '../../api/client';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';

const locale = useLocaleStore();
const auth = useAuthStore();

const ACTIVE_STATES = ['Pending', 'Approved', 'Received', 'Appealed'];
const CLOSED_STATES = ['Rejected', 'Closed', 'RefundFailed'];
const STATE_LABEL_KEY: Record<string, string> = {
  Pending: 'stPending', Approved: 'stApproved', Received: 'stReceived', Refunded: 'stRefunded',
  RefundFailed: 'stRefundFailed', Rejected: 'stRejected', Appealed: 'stAppealed', Closed: 'stClosed',
};

const tabs = [
  { key: 'all', labelKey: 'tabAll' },
  { key: 'active', labelKey: 'tabActive' },
  { key: 'refunded', labelKey: 'tabRefunded' },
  { key: 'closed', labelKey: 'tabClosed' },
];

const list = ref<AfterSaleRequest[]>([]);
const loading = ref(true);
const tab = ref('all');

const counts = computed<Record<string, number>>(() => {
  const base: Record<string, number> = { all: list.value.length, active: 0, refunded: 0, closed: 0 };
  list.value.forEach(r => {
    if (ACTIVE_STATES.includes(r.state)) base.active += 1;
    else if (r.state === 'Refunded') base.refunded += 1;
    else if (CLOSED_STATES.includes(r.state)) base.closed += 1;
  });
  return base;
});

const filtered = computed(() => {
  if (tab.value === 'active') return list.value.filter(r => ACTIVE_STATES.includes(r.state));
  if (tab.value === 'refunded') return list.value.filter(r => r.state === 'Refunded');
  if (tab.value === 'closed') return list.value.filter(r => CLOSED_STATES.includes(r.state));
  return list.value;
});

const filteredEmptyKey = computed(() =>
  tab.value === 'all' ? 'afterSalesList.empty' : 'afterSalesList.emptyFiltered');

onShow(() => { void load(); });

async function load() {
  if (!auth.isLoggedIn && !getSessionToken()) { list.value = []; loading.value = false; return; }
  loading.value = true;
  try {
    // 后端按 createdAt 倒序返回；列表取最近 20 条（与 fetchMyAfterSales take 一致）
    const rows = await fetchMyAfterSales();
    list.value = rows;
  } catch {
    list.value = [];
  } finally {
    loading.value = false;
  }
}

function stateLabel(state: string): string {
  const k = STATE_LABEL_KEY[state];
  return k ? locale.t(`afterSaleDetail.${k}`) : state;
}
function typeLabel(type: string): string {
  return type === 'refund_only' ? locale.t('afterSalesList.typeRefundOnly') : type;
}
function fen(v: any): string {
  return (Number(v || 0) / 100).toFixed(2);
}
function fmtTime(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** 详情描述首行（创建时写入「整单退款」或「部分退款：…」） */
function descLine(r: AfterSaleRequest): string {
  const first = String(r.description || '').split('\n').filter(Boolean)[0] || '';
  return first.length > 26 ? first.slice(0, 26) + '…' : first;
}
function open(r: AfterSaleRequest) {
  uni.navigateTo({ url: '/pkg-order/pages/after-sale-detail?id=' + r.id });
}
</script>

<style lang="scss" scoped>
.as-page { min-height: 100vh; background: $bg-color; padding: 20rpx; }
.as-tabs {
  display: flex; gap: 12rpx; margin-bottom: 20rpx;
  .as-tab {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 6rpx;
    padding: 18rpx 0; border-radius: 999rpx; background: $surface;
    font-size: 26rpx; color: $text-color-secondary; border: 2rpx solid $border-color;
    &.on { color: $brand-color; border-color: $brand-color; background: #fff7f2; font-weight: bold; }
    &__n { font-size: 20rpx; }
  }
}
.as-empty {
  display: flex; flex-direction: column; align-items: center; padding: 160rpx 0; gap: 20rpx;
  &__ico { font-size: 64rpx; }
  &__text { font-size: 26rpx; color: $text-color-placeholder; }
}
.as-list { display: flex; flex-direction: column; gap: 20rpx; }
.as-card {
  background: $surface; border-radius: $radius-md; padding: 24rpx;
  &__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
  &__state {
    font-size: 22rpx; border-radius: 999rpx; padding: 6rpx 16rpx;
    &.st-Pending, &.st-Appealed { color: #b45309; background: #fdf3e0; }
    &.st-Approved, &.st-Received { color: $brand-color; background: #fff2ea; }
    &.st-Refunded { color: #16a34a; background: #e6f5ec; }
    &.st-Rejected, &.st-Closed, &.st-RefundFailed { color: $text-color-placeholder; background: $bg-color; }
  }
  &__time { font-size: 22rpx; color: $text-color-placeholder; }
  &__body { display: flex; justify-content: space-between; gap: 16rpx; }
  &__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8rpx; }
  &__title-row { display: flex; align-items: center; gap: 12rpx; flex-wrap: wrap; }
  &__type { font-size: 28rpx; font-weight: bold; }
  &__reason { font-size: 24rpx; color: $brand-color; background: #fff7f2; border-radius: 6rpx; padding: 2rpx 10rpx; }
  &__order { font-size: 22rpx; color: $text-color-placeholder; }
  &__desc { font-size: 24rpx; color: $text-color-secondary; }
  &__right { display: flex; flex-direction: column; align-items: flex-end; gap: 8rpx; flex-shrink: 0; }
  &__amount { font-size: 30rpx; font-weight: bold; color: $price-color; }
  &__msgs { font-size: 20rpx; color: $text-color-placeholder; }
  &__imgs { display: flex; gap: 12rpx; margin-top: 16rpx; }
  &__img { width: 120rpx; height: 120rpx; border-radius: 8rpx; }
  &__foot { display: flex; justify-content: space-between; align-items: center; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $border-color; }
  &__done { font-size: 22rpx; color: #16a34a; }
  &__link { font-size: 24rpx; color: $text-color-secondary; margin-left: auto; }
}
</style>
