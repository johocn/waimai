<template>
  <view class="pm-page">
    <view v-if="!logged" class="pm-empty">
      <text class="pm-empty__ico">🔒</text>
      <text class="pm-empty__text">{{ $t('pointsMall.loginTip') }}</text>
      <button class="pm-empty__btn" @tap="goLogin">{{ $t('member.loginBtn') }}</button>
    </view>

    <template v-else>
      <view class="pm-hero">
        <view class="pm-hero__left">
          <text class="pm-hero__label">{{ $t('pointsMall.myPoints') }}</text>
          <text class="pm-hero__value">{{ points }}</text>
        </view>
        <view class="pm-hero__link" @tap="goOrders">
          <text>{{ $t('pointsMall.myOrders') }}</text>
          <text class="pm-hero__arrow">›</text>
        </view>
      </view>

      <view class="pm-tabs">
        <text
          v-for="t in tabs"
          :key="t.key"
          class="pm-tabs__item"
          :class="{ on: tab === t.key }"
          @tap="tab = t.key"
        >{{ $t(t.label) }}</text>
      </view>

      <view v-if="loading" class="pm-tip">{{ $t('pointsMall.loading') }}</view>
      <view v-else-if="!filtered.length" class="pm-tip">{{ $t('pointsMall.empty') }}</view>

      <view class="pm-card" v-for="p in filtered" :key="p.id">
        <image class="pm-card__img" :src="p.image || ''" mode="aspectFill" />
        <view class="pm-card__body">
          <text class="pm-card__name">{{ p.name }}</text>
          <view class="pm-card__tags">
            <text class="pm-card__tag">{{ p.deliveryType === 'virtual' ? $t('pointsMall.virtual') : $t('pointsMall.physical') }}</text>
            <text class="pm-card__tag" v-if="p.perUserLimit > 0">{{ $t('pointsMall.limit').replace('{n}', String(p.perUserLimit)) }}</text>
          </view>
          <view class="pm-card__bottom">
            <view class="pm-card__price">
              <text class="pm-card__points">{{ p.pointsPrice }}</text>
              <text class="pm-card__unit">{{ $t('pointsMall.pointsUnit') }}</text>
              <text class="pm-card__cash" v-if="Number(p.cashPrice) > 0">+¥{{ money(p.cashPrice) }}</text>
            </view>
            <text class="pm-card__stock">{{ $t('pointsMall.stock').replace('{n}', String(p.stock)) }}</text>
          </view>
          <button class="pm-card__btn" :disabled="!canRedeem(p)" @tap="openExchange(p)">
            {{ canRedeem(p) ? $t('pointsMall.exchangeBtn') : redeemBlockText(p) }}
          </button>
        </view>
      </view>
    </template>

    <!-- 兑换确认 -->
    <view class="pm-mask" v-if="exchanging" @tap="closeExchange">
      <view class="pm-sheet" @tap.stop>
        <view class="pm-sheet__head">
          <text class="pm-sheet__title">{{ $t('pointsMall.confirmTitle') }}</text>
          <text class="pm-sheet__close" @tap="closeExchange">✕</text>
        </view>
        <view class="pm-sheet__product">
          <image class="pm-sheet__img" :src="current?.image || ''" mode="aspectFill" />
          <view class="pm-sheet__info">
            <text class="pm-sheet__name">{{ current?.name }}</text>
            <text class="pm-sheet__meta">{{ current?.deliveryType === 'virtual' ? $t('pointsMall.virtual') : $t('pointsMall.physical') }}</text>
          </view>
        </view>

        <view class="pm-row">
          <text>{{ $t('pointsMall.qty') }}</text>
          <view class="pm-stepper">
            <text class="pm-stepper__btn" :class="{ off: qty <= 1 }" @tap="qty > 1 && qty--">−</text>
            <text class="pm-stepper__num">{{ qty }}</text>
            <text class="pm-stepper__btn" :class="{ off: qty >= maxQty }" @tap="qty < maxQty && qty++">+</text>
          </view>
        </view>

        <view class="pm-row" v-if="current?.deliveryType !== 'virtual'" @tap="pickAddress">
          <text>{{ $t('pointsMall.address') }}</text>
          <text class="pm-row__val" :class="{ ph: !selectedAddress }">{{ addressText }}</text>
        </view>

        <view class="pm-sum">
          <text>{{ $t('pointsMall.total') }}</text>
          <view class="pm-sum__right">
            <text class="pm-sum__points">{{ Number(current?.pointsPrice || 0) * qty }} {{ $t('pointsMall.pointsUnit') }}</text>
            <text class="pm-sum__cash" v-if="cashTotal > 0">+¥{{ money(cashTotal) }}</text>
          </view>
        </view>

        <button class="pm-sheet__btn" :disabled="submitting || (current?.deliveryType !== 'virtual' && !selectedAddress)" @tap="submitExchange">
          {{ submitting ? $t('pointsMall.submitting') : $t('pointsMall.confirmExchange') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getMyMemberInfo } from '../../api/queries/member';
import { getPointsProducts, createPointsOrderExchange, createPointsOrderPayment } from '../../api/queries/pointsMall';
import { getActiveCustomer } from '../../api/queries/user';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';
import { handlePayment } from '../../composables/usePayment';

const auth = useAuthStore();
const locale = useLocaleStore();
const logged = computed(() => auth.isLoggedIn);

const points = ref(0);
const products = ref<any[]>([]);
const addresses = ref<any[]>([]);
const selectedAddress = ref<any>(null);
const loading = ref(true);
const tab = ref<'all' | 'virtual' | 'physical'>('all');
const tabs = [
  { key: 'all', label: 'pointsMall.tabAll' },
  { key: 'virtual', label: 'pointsMall.tabVirtual' },
  { key: 'physical', label: 'pointsMall.tabPhysical' },
] as const;

const exchanging = ref(false);
const current = ref<any>(null);
const qty = ref(1);
const submitting = ref(false);

const filtered = computed(() => {
  if (tab.value === 'all') return products.value;
  return products.value.filter((p) => p.deliveryType === tab.value);
});

const maxQty = computed(() => {
  const p = current.value;
  if (!p) return 1;
  const stockLimit = Math.max(1, Number(p.stock) || 0);
  const left = Number(p.perUserLimit) > 0 ? Number(p.perUserLimit) - Number(p.myRedeemedCount || 0) : stockLimit;
  return Math.max(1, Math.min(stockLimit, left));
});

const cashTotal = computed(() => Number(current.value?.cashPrice || 0) * qty.value);
const addressText = computed(() => {
  const a = selectedAddress.value;
  if (!a) return locale.t('pointsMall.pickAddress');
  return `${a.fullName} ${a.phoneNumber || ''} ${a.streetLine1 || ''}`.trim();
});

function money(cents: number | string): string {
  return ((Number(cents) || 0) / 100).toFixed(2);
}

function canRedeem(p: any): boolean {
  if (!p.inStock) return false;
  if (Number(p.perUserLimit) > 0 && Number(p.myRedeemedCount || 0) >= Number(p.perUserLimit)) return false;
  return true;
}

function redeemBlockText(p: any): string {
  if (!p.inStock) return locale.t('pointsMall.outOfStock');
  return locale.t('pointsMall.limitReached');
}

onShow(async () => {
  if (!logged.value) { loading.value = false; return; }
  loading.value = true;
  try {
    const [member, listRes, cust] = await Promise.all([
      getMyMemberInfo().catch(() => null),
      getPointsProducts(),
      getActiveCustomer().catch(() => null),
    ]);
    points.value = Number((member as any)?.myMemberInfo?.points) || 0;
    products.value = (listRes as any)?.pointsProducts?.items || [];
    addresses.value = (cust as any)?.activeCustomer?.addresses || [];
    const def = addresses.value.find((a: any) => a.defaultShippingAddress) || addresses.value[0] || null;
    if (!selectedAddress.value) selectedAddress.value = def;
  } catch (e) {
    products.value = [];
  } finally {
    loading.value = false;
  }
});

function openExchange(p: any) {
  if (!canRedeem(p)) return;
  current.value = p;
  qty.value = 1;
  exchanging.value = true;
}

function closeExchange() {
  if (submitting.value) return;
  exchanging.value = false;
}

function pickAddress() {
  if (!addresses.value.length) {
    uni.navigateTo({ url: '/pkg-user/pages/address-book' });
    return;
  }
  uni.showActionSheet({
    itemList: addresses.value.map((a: any) => `${a.fullName} ${a.streetLine1 || ''}`),
    success: (res) => { selectedAddress.value = addresses.value[res.tapIndex]; },
  });
}

async function submitExchange() {
  const p = current.value;
  if (!p || submitting.value) return;
  if (p.deliveryType !== 'virtual' && !selectedAddress.value) {
    uni.showToast({ title: locale.t('pointsMall.pickAddress'), icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    const res: any = await createPointsOrderExchange({
      pointsProductId: String(p.id),
      quantity: qty.value,
      addressId: p.deliveryType === 'virtual' ? null : String(selectedAddress.value?.id),
    });
    const order = res?.createPointsOrderExchange;
    if (!order?.id) throw new Error(locale.t('pointsMall.exchangeFail'));

    exchanging.value = false;
    if (Number(order.cashTotal) > 0) {
      const payRes: any = await createPointsOrderPayment(String(order.id));
      const payRaw = payRes?.createPointsOrderPayment?.pay;
      const pay = typeof payRaw === 'string' ? JSON.parse(payRaw) : payRaw;
      if (!pay) throw new Error(locale.t('pointsMall.payFail'));
      uni.showToast({ title: locale.t('pointsMall.payRedirect'), icon: 'none' });
      await handlePayment('wechatpay', { metadata: { public: pay }, h5Url: pay.payUrl, orderCode: order.code });
    } else {
      uni.showToast({ title: locale.t('pointsMall.exchangeOk'), icon: 'success' });
    }
    setTimeout(() => goOrders(), 800);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('pointsMall.exchangeFail'), icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

function goOrders() { uni.navigateTo({ url: '/pkg-user/pages/points-orders' }); }
function goLogin() { auth.requireLogin(); }
</script>

<style lang="scss" scoped>
.pm-page { min-height: 100vh; background: $bg-color; padding: 20rpx; box-sizing: border-box; }
.pm-empty {
  min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20rpx;
  &__ico { font-size: 80rpx; }
  &__text { font-size: 28rpx; color: $text-color-placeholder; }
  &__btn { margin-top: 20rpx; background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 28rpx; padding: 0 60rpx; height: 76rpx; line-height: 76rpx; }
}
.pm-hero {
  display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, #ffa53d, #ff6600);
  border-radius: 24rpx; padding: 32rpx 36rpx; color: #fff;
  &__label { font-size: 24rpx; opacity: .9; }
  &__value { display: block; font-size: 60rpx; font-weight: bold; margin-top: 6rpx; }
  &__link { display: flex; align-items: center; gap: 6rpx; font-size: 26rpx; background: rgba(255,255,255,.2); padding: 12rpx 24rpx; border-radius: 999rpx; }
  &__arrow { font-size: 32rpx; }
}
.pm-tabs {
  display: flex; gap: 40rpx; padding: 28rpx 10rpx 16rpx;
  &__item { font-size: 28rpx; color: $text-color-secondary; padding-bottom: 10rpx; &.on { color: $text-color; font-weight: bold; border-bottom: 6rpx solid $brand-color; } }
}
.pm-tip { padding: 100rpx 0; text-align: center; font-size: 26rpx; color: $text-color-placeholder; }
.pm-card {
  display: flex; gap: 20rpx; background: $surface; border-radius: $radius-md; padding: 20rpx; margin-bottom: 18rpx;
  &__img { width: 180rpx; height: 180rpx; border-radius: 12rpx; background: $bg-color; flex-shrink: 0; }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  &__name { font-size: 28rpx; font-weight: bold; color: $text-color; }
  &__tags { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 10rpx; }
  &__tag { font-size: 20rpx; color: $text-color-secondary; background: $bg-color; border-radius: 6rpx; padding: 3rpx 10rpx; }
  &__bottom { display: flex; align-items: center; justify-content: space-between; margin-top: auto; }
  &__price { display: flex; align-items: baseline; gap: 4rpx; }
  &__points { font-size: 38rpx; font-weight: bold; color: $brand-color; }
  &__unit { font-size: 22rpx; color: $brand-color; }
  &__cash { font-size: 24rpx; color: $text-color-secondary; margin-left: 6rpx; }
  &__stock { font-size: 22rpx; color: $text-color-placeholder; }
  &__btn { margin-top: 14rpx; height: 64rpx; line-height: 64rpx; background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 26rpx; &[disabled] { background: #c9c9c9; color: #fff; } }
}
.pm-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: flex-end; z-index: 20; }
.pm-sheet {
  width: 100%; background: $surface; border-radius: 24rpx 24rpx 0 0; padding: 36rpx 30rpx calc(36rpx + env(safe-area-inset-bottom));
  &__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24rpx; }
  &__title { font-size: 32rpx; font-weight: bold; }
  &__close { font-size: 32rpx; color: $text-color-placeholder; padding: 0 10rpx; }
  &__product { display: flex; gap: 20rpx; align-items: center; margin-bottom: 24rpx; }
  &__img { width: 120rpx; height: 120rpx; border-radius: 12rpx; background: $bg-color; }
  &__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8rpx; }
  &__name { font-size: 30rpx; font-weight: bold; }
  &__meta { font-size: 22rpx; color: $text-color-placeholder; }
  &__btn { margin-top: 30rpx; height: 88rpx; line-height: 88rpx; background: $brand-color; color: #fff; border-radius: $radius-md; font-size: 30rpx; &[disabled] { opacity: .5; } }
}
.pm-row {
  display: flex; align-items: center; justify-content: space-between; padding: 24rpx 0; border-top: 1rpx solid $border-color;
  &__val { font-size: 26rpx; color: $text-color; max-width: 460rpx; text-align: right; &.ph { color: $text-color-placeholder; } }
}
.pm-stepper {
  display: flex; align-items: center; gap: 24rpx;
  &__btn { width: 52rpx; height: 52rpx; line-height: 50rpx; text-align: center; border-radius: 50%; background: $bg-color; font-size: 30rpx; &.off { opacity: .35; } }
  &__num { font-size: 30rpx; min-width: 40rpx; text-align: center; }
}
.pm-sum {
  display: flex; align-items: center; justify-content: space-between; padding: 24rpx 0 0; border-top: 1rpx solid $border-color;
  &__right { display: flex; align-items: baseline; gap: 8rpx; }
  &__points { font-size: 34rpx; font-weight: bold; color: $brand-color; }
  &__cash { font-size: 26rpx; color: $text-color; }
}
</style>
