<template>
  <view class="sp-page">
    <!-- 汇总卡：累计消费 / 订单数 / 客单价 / 本月 -->
    <view class="sp-hero">
      <text class="sp-hero__label">{{ $t('spending.totalLabel') }}</text>
      <text class="sp-hero__amount">¥{{ money(totalFen) }}</text>
      <view class="sp-hero__row">
        <view class="sp-hero__cell">
          <text class="sp-hero__v">{{ orderCount }}</text>
          <text class="sp-hero__k">{{ $t('spending.orders') }}</text>
        </view>
        <view class="sp-hero__cell">
          <text class="sp-hero__v">¥{{ money(avgFen) }}</text>
          <text class="sp-hero__k">{{ $t('spending.avg') }}</text>
        </view>
        <view class="sp-hero__cell">
          <text class="sp-hero__v">¥{{ money(monthFen) }}</text>
          <text class="sp-hero__k">{{ $t('spending.thisMonth') }}</text>
        </view>
      </view>
    </view>

    <view class="sp-loading" v-if="loading">{{ $t('spending.loading') }}</view>
    <view class="sp-empty" v-else-if="!logged">
      <text class="sp-empty__ico">🔒</text>
      <text class="sp-empty__text">{{ $t('spending.loginTip') }}</text>
    </view>
    <view class="sp-empty" v-else-if="!orderCount">
      <text class="sp-empty__ico">🧾</text>
      <text class="sp-empty__text">{{ $t('spending.empty') }}</text>
    </view>
    <template v-else>
      <!-- 近 6 个月消费趋势 -->
      <view class="sp-card">
        <view class="sp-card__head">
          <text class="sp-card__title">{{ $t('spending.trendTitle') }}</text>
          <text class="sp-card__sub">{{ $t('spending.trendSub') }}</text>
        </view>
        <view class="sp-chart">
          <view v-for="b in trend" :key="b.key" class="sp-bar">
            <text class="sp-bar__val" v-if="b.fen">{{ compactMoney(b.fen) }}</text>
            <view class="sp-bar__track">
              <view class="sp-bar__fill" :style="{ height: b.h + '%' }"></view>
            </view>
            <text class="sp-bar__lab">{{ b.label }}</text>
          </view>
        </view>
      </view>

      <!-- 常点店铺 TOP3 -->
      <view class="sp-card">
        <view class="sp-card__head">
          <text class="sp-card__title">{{ $t('spending.topTitle') }}</text>
          <text class="sp-card__sub">{{ $t('spending.topSub') }}</text>
        </view>
        <view class="sp-tops">
          <view v-for="(s, i) in topStores" :key="s.key" class="sp-top">
            <text class="sp-top__rank" :class="'sp-top__rank--' + (i + 1)">{{ i + 1 }}</text>
            <view class="sp-top__body">
              <text class="sp-top__name">{{ s.name }}</text>
              <text class="sp-top__meta">{{ $t('spending.times').replace('{n}', String(s.count)) }}</text>
            </view>
            <text class="sp-top__amount">¥{{ money(s.fen) }}</text>
          </view>
        </view>
      </view>

      <!-- 最近订单（静态展示，仅看金额） -->
      <view class="sp-card">
        <view class="sp-card__head">
          <text class="sp-card__title">{{ $t('spending.recentTitle') }}</text>
        </view>
        <view class="sp-recent" v-for="o in recent" :key="o.id">
          <view class="sp-recent__body">
            <text class="sp-recent__store">{{ o.storeName }}</text>
            <text class="sp-recent__time">{{ dateText(o.at) }} · {{ o.code }}</text>
          </view>
          <text class="sp-recent__amount">¥{{ money(o.fen) }}</text>
        </view>
      </view>

      <view class="sp-tip">{{ $t('spending.tip') }}</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { fetchStoreList } from '../../api/queries/waimai';
import { getOrdersForChannel } from '../../api/queries/order';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

interface AggOrder {
  id: string;
  code: string;
  storeName: string;
  channelToken: string;
  fen: number;
  at: number;
}

/** 计入消费统计的订单状态（已支付/配送/完成），排除取消与未付款 */
const PAID_STATES = new Set([
  'PaymentAuthorized', 'PaymentSettled', 'Shipped', 'PartiallyShipped', 'Delivered', 'PartiallyDelivered',
]);

const auth = useAuthStore();
const locale = useLocaleStore();
const loading = ref(true);
const orders = ref<AggOrder[]>([]);
const logged = computed(() => auth.isLoggedIn);

const nowMonth = ref(new Date().getMonth());
const nowYear = ref(new Date().getFullYear());

const monthFen = computed(() => orders.value.reduce((sum, o) => {
  const d = new Date(o.at);
  return d.getFullYear() === nowYear.value && d.getMonth() === nowMonth.value ? sum + o.fen : sum;
}, 0));
const totalFen = computed(() => orders.value.reduce((s, o) => s + o.fen, 0));
const orderCount = computed(() => orders.value.length);
const avgFen = computed(() => (orderCount.value ? Math.round(totalFen.value / orderCount.value) : 0));

/** 近 6 个月柱状趋势（含本月），柱高按最大值归一化 */
const trend = computed(() => {
  const months: Array<{ key: string; label: string; fen: number; h: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(nowYear.value, nowMonth.value - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: locale.t('spending.monthLabel').replace('{m}', String(d.getMonth() + 1)),
      fen: 0,
      h: 0,
    });
  }
  const map = new Map(months.map(m => [m.key, m]));
  for (const o of orders.value) {
    const d = new Date(o.at);
    const hit = map.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (hit) hit.fen += o.fen;
  }
  const max = Math.max(...months.map(m => m.fen), 1);
  for (const m of months) m.h = Math.round((m.fen / max) * 100);
  return months;
});

/** 常点店铺 TOP3：按渠道聚合，单量降序 → 金额降序 */
const topStores = computed(() => {
  const map = new Map<string, { key: string; name: string; count: number; fen: number }>();
  for (const o of orders.value) {
    const key = o.channelToken || o.storeName;
    const prev = map.get(key) ?? { key, name: o.storeName, count: 0, fen: 0 };
    prev.count += 1;
    prev.fen += o.fen;
    map.set(key, prev);
  }
  return Array.from(map.values())
    .sort((a, b) => (b.count - a.count) || (b.fen - a.fen))
    .slice(0, 3);
});

const recent = computed(() => orders.value.slice(0, 5));

function money(fen: number | null | undefined): string {
  return (Math.max(0, Number(fen) || 0) / 100).toFixed(2);
}

/** 柱顶金额：千元以上取 k，其余取整 */
function compactMoney(fen: number): string {
  const y = Number(fen || 0) / 100;
  if (y >= 1000) return `¥${(y / 1000).toFixed(1)}k`;
  return `¥${Math.round(y)}`;
}

function dateText(at: number): string {
  const d = new Date(at || 0);
  if (!Number.isFinite(d.getTime())) return '';
  return locale.t('spending.dateFmt').replace('{m}', String(d.getMonth() + 1)).replace('{d}', String(d.getDate()));
}

/**
 * 跨渠道聚合我的订单：平台渠道 + 各店铺渠道并行查询，按订单 id 去重。
 * 统计口径：已支付/配送中/已完成；金额取 totalWithTax。
 */
async function load() {
  if (!auth.isLoggedIn) {
    orders.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  const now = new Date();
  nowYear.value = now.getFullYear();
  nowMonth.value = now.getMonth();
  try {
    const stores = await fetchStoreList().catch(() => [] as any[]);
    const platformToken = (import.meta.env.VITE_CHANNEL_TOKEN as string) || '__default_channel__';
    const channels = new Map<string, string>();
    channels.set(platformToken, locale.t('orders.platform'));
    for (const s of stores) {
      if (!s?.channelToken) continue;
      channels.set(String(s.channelToken), s.name || '');
    }
    const results = await Promise.all(Array.from(channels.entries()).map(async ([token, name]) => {
      const res: any = await getOrdersForChannel(token, { take: 50, skip: 0, sort: { createdAt: 'DESC' } }).catch(() => null);
      return { token, name, items: res?.myOrders?.items ?? [] };
    }));
    const seen = new Set<string>();
    const merged: AggOrder[] = [];
    for (const r of results) {
      for (const o of r.items) {
        if (!o?.id || seen.has(String(o.id))) continue;
        seen.add(String(o.id));
        if (!PAID_STATES.has(String(o.state))) continue;
        const fen = Math.round(Number(o.totalWithTax) || 0);
        if (fen <= 0) continue;
        merged.push({
          id: String(o.id),
          code: String(o.code || ''),
          storeName: r.name || '',
          channelToken: r.token,
          fen,
          at: new Date(o.createdAt || 0).getTime() || 0,
        });
      }
    }
    orders.value = merged.sort((a, b) => b.at - a.at);
  } finally {
    loading.value = false;
  }
}

onShow(() => { void load(); });
</script>

<style scoped lang="scss">
.sp-page { min-height: 100vh; background: $bg-color; padding: 20rpx 20rpx 40rpx; box-sizing: border-box; }
.sp-hero {
  background: linear-gradient(135deg, #ff7a1a 0%, #ff5a00 100%);
  border-radius: $radius-md;
  padding: 36rpx 30rpx 28rpx;
  color: #fff;
  box-shadow: 0 10rpx 30rpx rgba(255, 90, 0, 0.25);
  &__label { display: block; font-size: 24rpx; opacity: 0.88; }
  &__amount { display: block; font-size: 64rpx; font-weight: 700; margin-top: 8rpx; letter-spacing: 1rpx; }
  &__row { display: flex; margin-top: 28rpx; padding-top: 24rpx; border-top: 1rpx solid rgba(255, 255, 255, 0.28); }
  &__cell { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6rpx; }
  &__v { font-size: 30rpx; font-weight: 600; }
  &__k { font-size: 22rpx; opacity: 0.86; }
}
.sp-loading { padding: 120rpx 0; text-align: center; font-size: 26rpx; color: $text-color-placeholder; }
.sp-empty {
  padding: 110rpx 0; display: flex; flex-direction: column; align-items: center; gap: 16rpx;
  background: $surface; border-radius: $radius-md; margin-top: 20rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; }
}
.sp-card {
  background: $surface; border-radius: $radius-md; padding: 24rpx; margin-top: 20rpx;
  &__head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 20rpx; }
  &__title { font-size: 28rpx; font-weight: 600; color: $text-color; }
  &__sub { font-size: 22rpx; color: $text-color-placeholder; }
}
/* 月度趋势：6 列等宽柱，柱高百分比 */
.sp-chart { display: flex; align-items: flex-end; gap: 12rpx; height: 280rpx; padding-top: 24rpx; }
.sp-bar {
  flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; height: 100%;
  &__val { font-size: 18rpx; color: $text-color-secondary; margin-bottom: 6rpx; white-space: nowrap; }
  &__track { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
  &__fill { width: 56%; min-height: 6rpx; border-radius: 10rpx 10rpx 0 0; background: linear-gradient(180deg, #ff9a4d 0%, #ff6600 100%); }
  &__lab { font-size: 20rpx; color: $text-color-placeholder; margin-top: 10rpx; }
}
.sp-tops { display: flex; flex-direction: column; gap: 8rpx; }
.sp-top {
  display: flex; align-items: center; gap: 18rpx; padding: 14rpx 0; border-bottom: 1rpx solid $border-color;
  &:last-child { border-bottom: none; }
  &__rank {
    flex-shrink: 0; width: 44rpx; height: 44rpx; line-height: 44rpx; text-align: center; border-radius: 50%;
    font-size: 22rpx; font-weight: 600; color: $text-color-secondary; background: $bg-color;
    &--1 { color: #fff; background: #ffb300; }
    &--2 { color: #fff; background: #b0b7c3; }
    &--3 { color: #fff; background: #cd8b5a; }
  }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
  &__name { font-size: 26rpx; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__meta { font-size: 22rpx; color: $text-color-placeholder; }
  &__amount { flex-shrink: 0; font-size: 26rpx; font-weight: 600; color: $price-color; }
}
.sp-recent {
  display: flex; align-items: center; gap: 16rpx; padding: 16rpx 0; border-bottom: 1rpx solid $border-color;
  &:last-child { border-bottom: none; }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
  &__store { font-size: 26rpx; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__time { font-size: 20rpx; color: $text-color-placeholder; }
  &__amount { flex-shrink: 0; font-size: 26rpx; font-weight: 600; color: $price-color; }
}
.sp-tip { margin: 24rpx 8rpx 0; font-size: 20rpx; line-height: 1.6; color: $text-color-placeholder; }
</style>
