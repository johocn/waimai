<template>
  <view class="po-page">
    <view v-if="!logged" class="po-empty">
      <text class="po-empty__ico">🔒</text>
      <text class="po-empty__text">{{ $t('pointsOrders.loginTip') }}</text>
      <button class="po-empty__btn" @tap="goLogin">{{ $t('member.loginBtn') }}</button>
    </view>

    <template v-else>
      <scroll-view scroll-x class="po-filter">
        <text
          v-for="f in filters"
          :key="f.key"
          class="po-filter__item"
          :class="{ on: status === f.key }"
          @tap="switchStatus(f.key)"
        >{{ $t(f.label) }}</text>
      </scroll-view>

      <view v-if="loading" class="po-tip">{{ $t('pointsOrders.loading') }}</view>
      <view v-else-if="!items.length" class="po-empty_small">
        <text class="po-empty__ico">🎁</text>
        <text class="po-empty__text">{{ $t('pointsOrders.empty') }}</text>
        <button class="po-empty__btn" @tap="goMall">{{ $t('pointsOrders.goMall') }}</button>
      </view>

      <view class="po-card" v-for="o in items" :key="o.id">
        <view class="po-card__head">
          <text class="po-card__code">{{ o.code }}</text>
          <text class="po-card__state" :class="stateClass(o.status)">{{ stateLabel(o.status) }}</text>
        </view>
        <view class="po-card__body">
          <image class="po-card__img" :src="o.productSnapshot?.image || ''" mode="aspectFill" />
          <view class="po-card__info">
            <text class="po-card__name">{{ o.productSnapshot?.name }}</text>
            <text class="po-card__spec" v-if="o.productSnapshot?.spec">{{ o.productSnapshot.spec }}</text>
            <view class="po-card__sum">
              <text class="po-card__points">{{ o.pointsTotal }} {{ $t('pointsMall.pointsUnit') }}</text>
              <text class="po-card__cash" v-if="Number(o.cashTotal) > 0">+¥{{ money(o.cashTotal) }}</text>
              <text class="po-card__qty">×{{ o.quantity }}</text>
            </view>
          </view>
        </view>
        <view class="po-card__addr" v-if="o.addressSnapshot">
          <text>{{ o.addressSnapshot.name }} {{ o.addressSnapshot.phone }}</text>
          <text class="po-card__addr-detail">{{ fullAddress(o.addressSnapshot) }}</text>
        </view>
        <view class="po-card__meta">
          <text>{{ fmtTime(o.createdAt) }}</text>
          <text v-if="o.trackingNo">{{ $t('pointsOrders.tracking').replace('{n}', o.trackingNo) }}</text>
          <text v-if="o.refundStatus && o.refundStatus !== 'none'">{{ $t('pointsOrders.refund').replace('{n}', o.refundStatus) }}</text>
        </view>
        <view class="po-card__ops" v-if="o.status === 'pending_payment'">
          <button class="po-btn po-btn--ghost" :disabled="busyId === o.id" @tap="cancelOrder(o)">{{ $t('pointsOrders.cancel') }}</button>
          <button class="po-btn po-btn--main" :disabled="busyId === o.id" @tap="payOrder(o)">{{ $t('pointsOrders.pay') }}</button>
        </view>
      </view>

      <view class="po-foot" v-if="items.length">
        <text v-if="loadingMore">{{ $t('pointsOrders.loadingMore') }}</text>
        <text v-else-if="!hasMore">{{ $t('pointsOrders.noMore') }}</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow, onReachBottom } from '@dcloudio/uni-app';
import { getMyPointsOrders, createPointsOrderPayment, cancelPointsOrder } from '../../api/queries/pointsMall';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';
import { handlePayment } from '../../composables/usePayment';

const PAGE_SIZE = 20;
const auth = useAuthStore();
const locale = useLocaleStore();
const logged = computed(() => auth.isLoggedIn);

const items = ref<any[]>([]);
const total = ref(0);
const loading = ref(true);
const loadingMore = ref(false);
const status = ref('');
const busyId = ref('');
const hasMore = computed(() => items.value.length < total.value);

const filters = [
  { key: '', label: 'pointsOrders.filterAll' },
  { key: 'pending_payment', label: 'pointsOrders.filterUnpaid' },
  { key: 'pending_ship', label: 'pointsOrders.filterShip' },
  { key: 'shipped', label: 'pointsOrders.filterShipped' },
  { key: 'completed', label: 'pointsOrders.filterDone' },
];

function money(cents: number): string {
  return ((Number(cents) || 0) / 100).toFixed(2);
}

function fmtTime(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fullAddress(a: any): string {
  return [a?.province, a?.city, a?.district, a?.detail].filter(Boolean).join(' ');
}

function stateLabel(s: string): string {
  const map: Record<string, string> = {
    pending_payment: 'pointsOrders.stateUnpaid',
    pending_ship: 'pointsOrders.stateShip',
    shipped: 'pointsOrders.stateShipped',
    completed: 'pointsOrders.stateDone',
    cancelled: 'pointsOrders.stateCancelled',
  };
  return locale.t(map[s] || 'pointsOrders.stateUnknown');
}

function stateClass(s: string): string {
  if (s === 'completed') return 'ok';
  if (s === 'cancelled') return 'off';
  if (s === 'pending_payment') return 'wait';
  return 'ship';
}

onShow(() => {
  if (!logged.value) { loading.value = false; return; }
  void load(true);
});

async function load(reset: boolean) {
  if (!reset && (loadingMore.value || !hasMore.value)) return;
  if (reset) { loading.value = true; items.value = []; total.value = 0; } else loadingMore.value = true;
  try {
    const res: any = await getMyPointsOrders({
      take: PAGE_SIZE,
      skip: reset ? 0 : items.value.length,
      ...(status.value ? { status: status.value } : {}),
    });
    const list = res?.myPointsOrders?.items || [];
    total.value = Number(res?.myPointsOrders?.totalItems) || 0;
    items.value = reset ? list : [...items.value, ...list];
  } catch {
    if (reset) total.value = 0;
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

onReachBottom(() => void load(false));

function switchStatus(key: string) {
  if (status.value === key) return;
  status.value = key;
  void load(true);
}

async function payOrder(o: any) {
  if (busyId.value) return;
  busyId.value = o.id;
  try {
    const res: any = await createPointsOrderPayment(String(o.id));
    const payRaw = res?.createPointsOrderPayment?.pay;
    const pay = typeof payRaw === 'string' ? JSON.parse(payRaw) : payRaw;
    if (!pay) throw new Error(locale.t('pointsMall.payFail'));
    await handlePayment('wechatpay', { metadata: { public: pay }, h5Url: pay.payUrl, orderCode: o.code });
    setTimeout(() => void load(true), 1200);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('pointsMall.payFail'), icon: 'none' });
  } finally {
    busyId.value = '';
  }
}

function cancelOrder(o: any) {
  if (busyId.value) return;
  uni.showModal({
    title: locale.t('pointsOrders.cancelTitle'),
    content: locale.t('pointsOrders.cancelConfirm'),
    success: async (res: any) => {
      if (!res.confirm) return;
      busyId.value = o.id;
      try {
        await cancelPointsOrder(String(o.id));
        uni.showToast({ title: locale.t('pointsOrders.cancelled'), icon: 'success' });
        void load(true);
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('pointsOrders.cancelFail'), icon: 'none' });
      } finally {
        busyId.value = '';
      }
    },
  });
}

function goMall() { uni.redirectTo({ url: '/pkg-user/pages/points-mall' }); }
function goLogin() { auth.requireLogin(); }
</script>

<style lang="scss" scoped>
.po-page { min-height: 100vh; background: $bg-color; padding: 20rpx; box-sizing: border-box; }
.po-empty {
  min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20rpx;
  &__ico { font-size: 80rpx; }
  &__text { font-size: 28rpx; color: $text-color-placeholder; }
  &__btn { margin-top: 20rpx; background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 28rpx; padding: 0 60rpx; height: 76rpx; line-height: 76rpx; }
}
.po-empty_small { padding: 100rpx 0; display: flex; flex-direction: column; align-items: center; gap: 20rpx; }
.po-filter { white-space: nowrap; padding: 6rpx 0 20rpx; }
.po-filter__item { display: inline-block; margin-right: 18rpx; padding: 12rpx 28rpx; border-radius: 999rpx; background: $surface; font-size: 26rpx; color: $text-color-secondary; &.on { background: $brand-color; color: #fff; } }
.po-tip { padding: 100rpx 0; text-align: center; font-size: 26rpx; color: $text-color-placeholder; }
.po-card {
  background: $surface; border-radius: $radius-md; padding: 24rpx; margin-bottom: 18rpx;
  &__head { display: flex; align-items: center; justify-content: space-between; }
  &__code { font-size: 24rpx; color: $text-color-placeholder; }
  &__state { font-size: 24rpx; &.ok { color: #1f9d55; } &.off { color: $text-color-placeholder; } &.wait { color: $brand-color; } &.ship { color: #3b7ddd; } }
  &__body { display: flex; gap: 20rpx; margin-top: 16rpx; }
  &__img { width: 140rpx; height: 140rpx; border-radius: 12rpx; background: $bg-color; flex-shrink: 0; }
  &__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8rpx; }
  &__name { font-size: 28rpx; font-weight: bold; }
  &__spec { font-size: 22rpx; color: $text-color-placeholder; }
  &__sum { display: flex; align-items: baseline; gap: 10rpx; margin-top: auto; }
  &__points { font-size: 28rpx; font-weight: bold; color: $brand-color; }
  &__cash { font-size: 24rpx; color: $text-color-secondary; }
  &__qty { font-size: 24rpx; color: $text-color-placeholder; margin-left: auto; }
  &__addr { margin-top: 16rpx; padding: 16rpx; background: $bg-color; border-radius: 10rpx; font-size: 24rpx; display: flex; flex-direction: column; gap: 4rpx; }
  &__addr-detail { color: $text-color-secondary; }
  &__meta { display: flex; flex-wrap: wrap; gap: 20rpx; margin-top: 14rpx; font-size: 22rpx; color: $text-color-placeholder; }
  &__ops { display: flex; justify-content: flex-end; gap: 18rpx; margin-top: 20rpx; }
}
.po-btn {
  height: 64rpx; line-height: 64rpx; padding: 0 36rpx; border-radius: 999rpx; font-size: 26rpx;
  &--main { background: $brand-color; color: #fff; }
  &--ghost { background: $bg-color; color: $text-color-secondary; border: 1rpx solid $border-color; }
  &[disabled] { opacity: .5; }
}
.po-foot { padding: 24rpx 0 40rpx; text-align: center; font-size: 24rpx; color: $text-color-placeholder; }
</style>
