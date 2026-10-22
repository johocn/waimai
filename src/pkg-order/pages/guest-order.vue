<template>
  <view class="guest-page">
    <view class="guest-hero">
      <text class="guest-hero__ico">🔎</text>
      <text class="guest-hero__title">{{ $t('guestOrder.title') }}</text>
      <text class="guest-hero__sub">{{ $t('guestOrder.subtitle') }}</text>
    </view>

    <view class="guest-form">
      <view class="guest-field">
        <text class="guest-field__label">{{ $t('guestOrder.orderCode') }}</text>
        <input class="guest-field__input" v-model="code" :placeholder="$t('guestOrder.orderCodePh')" confirm-type="search" />
      </view>
      <view class="guest-field">
        <text class="guest-field__label">{{ $t('guestOrder.phone') }}</text>
        <input class="guest-field__input" v-model="phone" type="number" :maxlength="11" :placeholder="$t('guestOrder.phonePh')" />
      </view>
      <text v-if="error" class="guest-error">{{ error }}</text>
      <button class="guest-submit" :disabled="!canSubmit" @click="submit">
        {{ loading ? $t('guestOrder.searching') : $t('guestOrder.search') }}
      </button>
      <text class="guest-form__tip">{{ $t('guestOrder.formTip') }}</text>
    </view>

    <view v-if="order" class="guest-order">
      <view class="go-head">
        <view class="go-head__col">
          <text class="go-code">{{ order.orderCode }}</text>
          <text v-if="order.orderPlacedAt" class="go-time">{{ fmtTime(order.orderPlacedAt) }}</text>
        </view>
        <text class="go-state" :class="stateClass">{{ stateLabel }}</text>
      </view>

      <!-- 自提：取餐码与自提点 -->
      <view v-if="order.isPickup" class="go-pickup">
        <view class="go-pickup__top">
          <text class="go-pickup__label">{{ $t('guestOrder.pickupCode') }}</text>
          <text class="go-pickup__code">{{ order.pickupCode || '—' }}</text>
        </view>
        <text class="go-pickup__hint" :class="{ done: order.pickupClaimed, warn: order.pickupClaimable }">
          {{ order.pickupClaimed ? $t('guestOrder.claimed') : order.pickupClaimable ? $t('guestOrder.claimable') : $t('guestOrder.notReady') }}
        </text>
        <view v-if="order.pickupLocation" class="go-pickup__loc">
          <text class="go-pickup__name">{{ order.pickupLocation.name }}</text>
          <text class="go-pickup__sub">{{ order.pickupLocation.address }}</text>
          <text v-if="order.pickupLocation.businessHours" class="go-pickup__sub">{{ $t('guestOrder.hours').replace('{v}', order.pickupLocation.businessHours) }}</text>
        </view>
        <button v-if="order.pickupCode" class="go-pickup__pass" @click="openPickupPass">{{ $t('pickupPass.openBtn') }}</button>
      </view>

      <!-- 商品行 -->
      <view class="go-lines">
        <view v-for="(l, i) in order.lines" :key="i" class="go-line">
          <view class="go-line__main">
            <text class="go-line__name">{{ l.productName || l.sku }}</text>
            <text v-if="l.hotelNights" class="go-line__hotel">
              {{ $t('guestOrder.hotelStay').replace('{in}', l.hotelCheckIn || '').replace('{out}', l.hotelCheckOut || '').replace('{n}', String(l.hotelNights)) }}
            </text>
          </view>
          <text class="go-line__qty">×{{ l.quantity }}</text>
          <text class="go-line__amt">¥{{ money(l.linePriceWithTax) }}</text>
        </view>
      </view>

      <!-- 金额 -->
      <view class="go-fees">
        <view class="go-fee"><text>{{ $t('guestOrder.goodsTotal') }}</text><text>¥{{ money(order.subTotal) }}</text></view>
        <view v-if="order.shippingWithTax > 0" class="go-fee"><text>{{ $t('guestOrder.shipping') }}</text><text>¥{{ money(order.shippingWithTax) }}</text></view>
        <view class="go-fee go-fee--total"><text>{{ $t('guestOrder.total') }}</text><text class="amt">¥{{ money(order.totalWithTax) }}</text></view>
      </view>

      <view class="go-pay">
        <text class="go-pay__chip" :class="order.collected ? 'ok' : 'wait'">{{ order.collected ? $t('guestOrder.paid') : $t('guestOrder.unpaid') }}</text>
        <text class="go-pay__qty">{{ $t('guestOrder.items').replace('{n}', String(order.totalQuantity)) }}</text>
      </view>

      <text class="go-tip">{{ $t('guestOrder.tip') }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { lookupGuestOrder, isGuestOrderNotFound } from '../../api/queries/guest-order';
import { useLocaleStore } from '../../stores/locale';

const locale = useLocaleStore();
const code = ref('');
const phone = ref('');
const loading = ref(false);
const error = ref('');
const order = ref<any>(null);

const canSubmit = computed(() => !!code.value.trim() && !!phone.value.trim() && !loading.value);

onLoad((q: any) => {
    if (q?.code) code.value = String(q.code);
    if (q?.phone) phone.value = String(q.phone);
});

const STATE_KEYS: Record<string, string> = {
    Created: 'orders.stAwaitPay',
    ArrangingPayment: 'orders.stAwaitPay',
    PaymentAuthorized: 'orders.stAwaitShip',
    PaymentSettled: 'orders.stAwaitShip',
    Shipped: 'orders.stAwaitReceive',
    Delivered: 'orders.stAwaitReceive',
    Cancelled: 'orders.stCancelled',
};

const stateLabel = computed(() => {
    const s = String(order.value?.state ?? '');
    return STATE_KEYS[s] ? locale.t(STATE_KEYS[s]) : s;
});

const stateClass = computed(() => {
    const s = String(order.value?.state ?? '');
    if (s === 'Cancelled') return 'muted';
    if (s === 'Delivered') return 'done';
    return '';
});

async function submit() {
    if (!canSubmit.value) return;
    loading.value = true;
    error.value = '';
    order.value = null;
    try {
        const res = await lookupGuestOrder(code.value, phone.value);
        if (!res) {
            error.value = locale.t('guestOrder.notFound');
            return;
        }
        order.value = res;
    } catch (e: any) {
        error.value = isGuestOrderNotFound(e) ? locale.t('guestOrder.notFound') : locale.t('guestOrder.fail');
    } finally {
        loading.value = false;
    }
}

function money(cents: number | string): string {
    return ((Number(cents) || 0) / 100).toFixed(2);
}

function fmtTime(raw: string): string {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 大字取餐凭证：游客无登录态，全部参数随链接带入，接收者无需登录即可查看 */
function openPickupPass() {
    const o = order.value;
    if (!o?.pickupCode) return;
    const st = o.pickupClaimed ? 'redeemed' : o.pickupClaimable ? 'ready' : '';
    const params = [
        'code=' + encodeURIComponent(o.orderCode || ''),
        'k=' + encodeURIComponent(o.pickupCode),
        'st=' + encodeURIComponent(st),
        'n=' + encodeURIComponent(o.pickupLocation?.name || ''),
        'a=' + encodeURIComponent(o.pickupLocation?.address || ''),
        'h=' + encodeURIComponent(o.pickupLocation?.businessHours || ''),
    ].join('&');
    uni.navigateTo({ url: '/pkg-order/pages/pickup-pass?' + params });
}
</script>

<style lang="scss" scoped>
.guest-page { min-height: 100vh; background: $bg-color; padding-bottom: 60rpx; }
.guest-hero {
  display: flex; flex-direction: column; align-items: center; gap: 10rpx;
  background: linear-gradient(135deg, #ff8a3d, #ff6600);
  padding: 56rpx 30rpx 44rpx;
  &__ico { font-size: 56rpx; }
  &__title { font-size: 36rpx; font-weight: bold; color: #fff; }
  &__sub { font-size: 24rpx; color: rgba(255, 255, 255, 0.86); }
}
.guest-form {
  margin: -24rpx 24rpx 0; background: $surface; border-radius: $radius-md; padding: 28rpx;
  display: flex; flex-direction: column; gap: 22rpx; box-shadow: $shadow;
  &__tip { font-size: 22rpx; color: $text-color-placeholder; line-height: 1.5; }
}
.guest-field {
  display: flex; flex-direction: column; gap: 10rpx;
  &__label { font-size: 24rpx; color: $text-color-secondary; }
  &__input { height: 84rpx; padding: 0 24rpx; background: $bg-color; border-radius: $radius-md; font-size: 28rpx; color: $text-color; }
}
.guest-error { font-size: 24rpx; color: $error-color; }
.guest-submit {
  height: 88rpx; line-height: 88rpx; border-radius: 44rpx; background: $brand-color; color: #fff;
  font-size: 30rpx; font-weight: 600; border: none;
  &[disabled] { background: #ccc; color: #fff; }
}
.guest-submit::after { border: none; }

.guest-order {
  margin: 24rpx; background: $surface; border-radius: $radius-md; padding: 28rpx;
  display: flex; flex-direction: column; gap: 22rpx;
}
.go-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16rpx;
  &__col { display: flex; flex-direction: column; gap: 6rpx; min-width: 0; }
}
.go-code { font-size: 28rpx; font-weight: 600; color: $text-color; word-break: break-all; }
.go-time { font-size: 22rpx; color: $text-color-placeholder; }
.go-state {
  flex-shrink: 0; font-size: 24rpx; color: $brand-color; background: $brand-color-light;
  padding: 6rpx 18rpx; border-radius: 999rpx;
  &.done { color: #1f8a4c; background: #e8f7ee; }
  &.muted { color: $text-color-secondary; background: $bg-color; }
}
.go-pickup {
  background: $brand-color-light; border-radius: $radius-md; padding: 22rpx;
  display: flex; flex-direction: column; gap: 10rpx;
  &__top { display: flex; align-items: baseline; gap: 16rpx; }
  &__label { font-size: 24rpx; color: $brand-color; }
  &__code { font-size: 44rpx; font-weight: 700; letter-spacing: 6rpx; color: $brand-color; }
  &__hint { font-size: 24rpx; color: $text-color-secondary; &.warn { color: $warning-color; } &.done { color: #1f8a4c; } }
  &__loc { display: flex; flex-direction: column; gap: 4rpx; padding-top: 8rpx; border-top: 1rpx solid rgba(255, 102, 0, 0.15); }
  &__name { font-size: 26rpx; font-weight: 600; color: $text-color; }
  &__sub { font-size: 22rpx; color: $text-color-secondary; }
  &__pass {
    margin-top: 8rpx; height: 72rpx; line-height: 72rpx; border-radius: 36rpx;
    background: $brand-color; color: #fff; font-size: 26rpx; font-weight: 600; border: none;
  }
  &__pass::after { border: none; }
}
.go-lines { display: flex; flex-direction: column; gap: 18rpx; }
.go-line {
  display: flex; align-items: flex-start; gap: 16rpx;
  &__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
  &__name { font-size: 26rpx; color: $text-color; }
  &__hotel { font-size: 22rpx; color: $text-color-placeholder; }
  &__qty { flex-shrink: 0; font-size: 24rpx; color: $text-color-secondary; }
  &__amt { flex-shrink: 0; font-size: 26rpx; color: $text-color; }
}
.go-fees { display: flex; flex-direction: column; gap: 12rpx; padding-top: 20rpx; border-top: 1rpx dashed $border-color; }
.go-fee {
  display: flex; justify-content: space-between; font-size: 24rpx; color: $text-color-secondary;
  &--total { font-size: 28rpx; color: $text-color; font-weight: 600; .amt { color: $price-color; font-size: 34rpx; } }
}
.go-pay { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.go-pay {
  &__chip { font-size: 22rpx; padding: 6rpx 16rpx; border-radius: 999rpx; &.ok { color: #1f8a4c; background: #e8f7ee; } &.wait { color: $warning-color; background: #fff7e6; } }
  &__qty { font-size: 22rpx; color: $text-color-placeholder; }
}
.go-tip { font-size: 22rpx; color: $text-color-placeholder; line-height: 1.6; }
</style>
