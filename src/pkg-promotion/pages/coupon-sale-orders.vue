<template>
  <view class="cso-page">
    <view class="cso-head">
      <view class="cso-head__row">
        <view class="cso-head__info">
          <text class="cso-head__title">{{ $t('couponSaleOrders.title') }}</text>
          <text class="cso-head__sub">{{ $t('couponSaleOrders.sub') }}</text>
        </view>
        <text class="cso-head__link" @tap="goMall">{{ $t('couponSaleOrders.goMall') }} ›</text>
      </view>
    </view>

    <view class="cso-tabs">
      <text v-for="f in FILTERS" :key="f.key" class="cso-tab" :class="{ on: filter === f.key }" @tap="filter = f.key">
        {{ $t('couponSaleOrders.' + f.label) }}<text class="cso-tab__n" v-if="counts[f.key]">{{ counts[f.key] }}</text>
      </text>
    </view>

    <view v-if="!auth.isLoggedIn" class="cso-empty">
      <text class="cso-empty__ico">🧾</text>
      <text class="cso-empty__text">{{ $t('couponSaleOrders.needLogin') }}</text>
      <button class="cso-empty__btn" @tap="goLogin">{{ $t('couponSaleOrders.login') }}</button>
    </view>

    <view v-else-if="loading" class="cso-tip">{{ $t('couponSaleOrders.loading') }}</view>

    <template v-else>
      <view v-for="o in filtered" :key="o.id" class="so-card">
        <view class="so-card__top">
          <text class="so-card__type">{{ typeText(o) }}</text>
          <text class="so-card__status" :class="statusClass(o)">{{ statusText(o) }}</text>
        </view>
        <text class="so-card__name">{{ nameOf(o) }}</text>
        <view class="so-card__meta">
          <text class="so-card__meta-txt">{{ $t('couponSaleOrders.orderNo').replace('{n}', String(o.id)) }}</text>
          <text class="so-card__meta-txt">{{ fmtDateTime(o.createdAt) }}</text>
        </view>
        <view class="so-card__amount">
          <text class="so-card__symbol">¥</text>
          <text class="so-card__num">{{ money(o.amount) }}</text>
          <text v-if="o.status === 'PAID' && o.paidAt" class="so-card__paid-at">{{ fmtDateTime(o.paidAt) }}</text>
        </view>

        <view class="so-card__foot">
          <text v-if="o.payMode === 'ORDER_SURCHARGE'" class="so-card__note">{{ $t('couponSaleOrders.surchargeNote') }}</text>
          <template v-else>
            <text v-if="o.status === 'PENDING'" class="so-card__cancel" @tap="cancelOrder(o)">{{ $t('couponSaleOrders.cancelOrder') }}</text>
            <button v-if="o.status === 'PENDING'" class="so-card__btn" @tap="openPay(o)">{{ $t('couponSaleOrders.pay') }}</button>
            <button v-else-if="o.status === 'PAID'" class="so-card__btn so-card__btn--ghost" @tap="refundOrder(o)">{{ $t('couponSaleOrders.refund') }}</button>
            <text v-else class="so-card__note">{{ $t('couponSaleOrders.closedNote') }}</text>
          </template>
        </view>
      </view>

      <view v-if="!filtered.length" class="cso-empty">
        <text class="cso-empty__ico">🧾</text>
        <text class="cso-empty__text">{{ $t('couponSaleOrders.empty') }}</text>
        <button class="cso-empty__btn" @tap="goMall">{{ $t('couponSaleOrders.goMall') }}</button>
      </view>
    </template>

    <view class="cso-note">{{ $t('couponSaleOrders.note') }}</view>

    <view class="cso-mask" v-if="payTarget" @tap="closePay">
      <view class="cso-sheet" @tap.stop>
        <text class="cso-sheet__title">{{ $t('couponSaleOrders.payTitle') }}</text>
        <text class="cso-sheet__name">{{ nameOf(payTarget) }}</text>
        <view class="cso-sheet__price">
          <text class="cso-sheet__amount">¥{{ money(payTarget.amount) }}</text>
        </view>
        <view class="cso-sheet__balance" v-if="balanceLoaded">
          <text>{{ $t('couponSaleOrders.balanceLabel') }}</text>
          <text :class="{ low: balance < Number(payTarget.amount || 0) }">¥{{ money(balance) }}</text>
        </view>
        <view class="cso-sheet__way" :class="{ disabled: busy }" @tap="payWithBalance">
          <text class="cso-sheet__way-ico">💰</text>
          <text class="cso-sheet__way-txt">{{ $t('couponSaleOrders.payBalance') }}</text>
          <text class="cso-sheet__way-arrow">›</text>
        </view>
        <view class="cso-sheet__way" :class="{ disabled: busy }" @tap="payWithWechat">
          <text class="cso-sheet__way-ico">💚</text>
          <text class="cso-sheet__way-txt">{{ $t('couponSaleOrders.payWechat') }}</text>
          <text class="cso-sheet__way-arrow">›</text>
        </view>
        <view class="cso-sheet__cancel" @tap="closePay">{{ $t('couponSaleOrders.cancel') }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  getMyCouponSaleOrders,
  getCouponSaleCatalogueInChannel,
  payCouponSaleWithBalance,
  createWechatCouponPayment,
  cancelCouponSaleOrder,
  refundCouponSaleOrder,
} from '../../api/queries/couponSale';
import { getMyBalance } from '../../api/queries/wallet';
import { handlePayment } from '../../composables/usePayment';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const FILTERS = [
  { key: 'all', label: 'filterAll' },
  { key: 'pending', label: 'filterPending' },
  { key: 'paid', label: 'filterPaid' },
  { key: 'closed', label: 'filterClosed' },
] as const;

const auth = useAuthStore();
const locale = useLocaleStore();

const loading = ref(true);
const orders = ref<any[]>([]);
const templates = ref<any[]>([]);
const bundles = ref<any[]>([]);
const filter = ref<string>('all');

const busy = ref(false);
const payTarget = ref<any>(null);
const balance = ref(0);
const balanceLoaded = ref(false);

const templateMap = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {};
  for (const t of templates.value) m[String(t.id)] = t.name;
  return m;
});
const bundleMap = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {};
  for (const b of bundles.value) m[String(b.id)] = b.name;
  return m;
});

const counts = computed<Record<string, number>>(() => ({
  all: orders.value.length,
  pending: orders.value.filter(o => o.status === 'PENDING').length,
  paid: orders.value.filter(o => o.status === 'PAID').length,
  closed: orders.value.filter(o => o.status === 'CANCELLED' || o.status === 'REFUNDED').length,
}));

const filtered = computed(() => {
  if (filter.value === 'all') return orders.value;
  if (filter.value === 'pending') return orders.value.filter(o => o.status === 'PENDING');
  if (filter.value === 'paid') return orders.value.filter(o => o.status === 'PAID');
  return orders.value.filter(o => o.status === 'CANCELLED' || o.status === 'REFUNDED');
});

function money(fen: any): string {
  return (Number(fen || 0) / 100).toFixed(2);
}

function fmtDateTime(s: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function typeText(o: any): string {
  return o?.bundleId ? locale.t('couponSaleOrders.typeBundle') : locale.t('couponSaleOrders.typeTemplate');
}

function nameOf(o: any): string {
  if (!o) return '';
  const id = String(o.bundleId || o.templateId || '');
  const name = (o.bundleId ? bundleMap.value[id] : templateMap.value[id]) || '';
  return name || locale.t('couponSaleOrders.unknown');
}

function statusText(o: any): string {
  if (o?.payMode === 'ORDER_SURCHARGE' && o?.status === 'PENDING') return locale.t('couponSaleOrders.statusSurchargePending');
  if (o?.status === 'PAID') return locale.t('couponSaleOrders.statusPaid');
  if (o?.status === 'CANCELLED') return locale.t('couponSaleOrders.statusCancelled');
  if (o?.status === 'REFUNDED') return locale.t('couponSaleOrders.statusRefunded');
  return locale.t('couponSaleOrders.statusPending');
}

function statusClass(o: any): string {
  if (o?.status === 'PAID') return 'is-paid';
  if (o?.status === 'CANCELLED' || o?.status === 'REFUNDED') return 'is-closed';
  return 'is-pending';
}

async function loadBalance() {
  if (!auth.isLoggedIn) { balanceLoaded.value = false; return; }
  try {
    const res: any = await getMyBalance();
    balance.value = Number(res?.myBalanceWithFrozen?.balance || 0);
    balanceLoaded.value = true;
  } catch { balanceLoaded.value = false; }
}

async function load() {
  if (!auth.isLoggedIn) {
    orders.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const [orderRes, catRes] = await Promise.allSettled([
      getMyCouponSaleOrders(),
      getCouponSaleCatalogueInChannel(),
    ]);
    orders.value = orderRes.status === 'fulfilled' ? orderRes.value : [];
    if (catRes.status === 'fulfilled') {
      templates.value = catRes.value?.templates || [];
      bundles.value = catRes.value?.bundles || [];
    }
    void loadBalance();
  } finally {
    loading.value = false;
  }
}

function goMall() {
  uni.navigateTo({ url: '/pkg-promotion/pages/coupon-mall' });
}

function goLogin() {
  auth.requireLogin('/pkg-promotion/pages/coupon-sale-orders');
}

function openPay(o: any) {
  if (busy.value) return;
  if (!auth.isLoggedIn) { goLogin(); return; }
  payTarget.value = o;
  void loadBalance();
}

function closePay() {
  if (busy.value) return;
  payTarget.value = null;
}

function errText(e: any): string {
  const msg = String(e?.response?.errors?.[0]?.message || e?.message || '');
  if (/insufficient|balance/i.test(msg)) return locale.t('couponSaleOrders.noBalance');
  if (/not refundable|already used/i.test(msg)) return locale.t('couponSaleOrders.refundFail');
  if (/not pending|is (PAID|CANCELLED|REFUNDED)/i.test(msg)) return locale.t('couponSaleOrders.payFail');
  return locale.t('couponSaleOrders.payFail');
}

async function payWithBalance() {
  if (busy.value || !payTarget.value) return;
  busy.value = true;
  uni.showLoading({ title: locale.t('couponSaleOrders.paying') });
  try {
    await payCouponSaleWithBalance(String(payTarget.value.id));
    uni.hideLoading();
    payTarget.value = null;
    uni.showToast({ title: locale.t('couponSaleOrders.payOk'), icon: 'none' });
    await load();
  } catch (e: any) {
    uni.hideLoading();
    uni.showToast({ title: errText(e), icon: 'none' });
  } finally {
    busy.value = false;
  }
}

async function payWithWechat() {
  if (busy.value || !payTarget.value) return;
  busy.value = true;
  uni.showLoading({ title: locale.t('couponSaleOrders.paying') });
  try {
    const res = await createWechatCouponPayment(String(payTarget.value.id), 'H5');
    const pay = res?.pay || {};
    uni.hideLoading();
    payTarget.value = null;
    const result = await handlePayment('wechatpay', {
      metadata: { public: pay },
      h5Url: pay.payUrl,
      orderCode: res?.outTradeNo,
    });
    if (!result.success) {
      uni.showToast({ title: result.message || locale.t('couponSaleOrders.payFail'), icon: 'none' });
      return;
    }
    uni.showToast({ title: locale.t('couponSaleOrders.payOk'), icon: 'none' });
    await load();
  } catch (e: any) {
    uni.hideLoading();
    uni.showToast({ title: errText(e), icon: 'none' });
  } finally {
    busy.value = false;
  }
}

function confirmModal(title: string, content: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title,
      content,
      success: (r) => resolve(!!r.confirm),
      fail: () => resolve(false),
    });
  });
}

async function cancelOrder(o: any) {
  if (busy.value) return;
  const ok = await confirmModal(locale.t('couponSaleOrders.cancelOrder'), locale.t('couponSaleOrders.cancelConfirm'));
  if (!ok) return;
  busy.value = true;
  uni.showLoading({ title: locale.t('couponSaleOrders.processing') });
  try {
    await cancelCouponSaleOrder(String(o.id));
    uni.hideLoading();
    uni.showToast({ title: locale.t('couponSaleOrders.cancelOk'), icon: 'none' });
    await load();
  } catch (e: any) {
    uni.hideLoading();
    uni.showToast({ title: errText(e), icon: 'none' });
  } finally {
    busy.value = false;
  }
}

async function refundOrder(o: any) {
  if (busy.value) return;
  const ok = await confirmModal(locale.t('couponSaleOrders.refund'), locale.t('couponSaleOrders.refundConfirm'));
  if (!ok) return;
  busy.value = true;
  uni.showLoading({ title: locale.t('couponSaleOrders.processing') });
  try {
    await refundCouponSaleOrder(String(o.id));
    uni.hideLoading();
    uni.showToast({ title: locale.t('couponSaleOrders.refundOk'), icon: 'none' });
    await load();
  } catch (e: any) {
    uni.hideLoading();
    uni.showToast({ title: errText(e), icon: 'none' });
  } finally {
    busy.value = false;
  }
}

onShow(() => { void load(); });
</script>

<style scoped lang="scss">
.cso-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.cso-head { background: linear-gradient(135deg, #ff6600, #ff9a3d); color: #fff; padding: 36rpx 30rpx;
  &__row { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
  &__info { display: flex; flex-direction: column; gap: 6rpx; min-width: 0; }
  &__title { font-size: 38rpx; font-weight: bold; }
  &__sub { font-size: 22rpx; opacity: .9; }
  &__link { font-size: 24rpx; opacity: .95; flex-shrink: 0; }
}
.cso-tabs { display: flex; background: $surface; padding: 0 24rpx; overflow-x: auto;
  .cso-tab { flex-shrink: 0; padding: 24rpx 0; margin-right: 40rpx; font-size: 28rpx; color: $text-color-secondary;
    &.on { color: #ff6600; font-weight: bold; border-bottom: 4rpx solid #ff6600; }
    &__n { font-size: 20rpx; margin-left: 4rpx; }
  }
}
.cso-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 100rpx 0; }
.cso-empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; gap: 18rpx;
  &__ico { font-size: 80rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; }
  &__btn { margin-top: 8rpx; background: #ff6600; color: #fff; font-size: 26rpx; height: 68rpx; line-height: 68rpx; padding: 0 44rpx; border-radius: 999rpx; }
}
.so-card { background: $surface; margin: 20rpx; border-radius: $radius-md; padding: 24rpx; display: flex; flex-direction: column; gap: 10rpx;
  &__top { display: flex; align-items: center; justify-content: space-between; }
  &__type { font-size: 20rpx; color: #ff6600; background: #fff4e6; border-radius: 6rpx; padding: 2rpx 10rpx; }
  &__status { font-size: 24rpx; }
  &__status.is-pending { color: #ff4d4f; }
  &__status.is-paid { color: #2e7d32; }
  &__status.is-closed { color: $text-color-placeholder; }
  &__name { font-size: 30rpx; font-weight: bold; color: $text-color; }
  &__meta { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
  &__meta-txt { font-size: 20rpx; color: $text-color-placeholder; }
  &__amount { display: flex; align-items: baseline; gap: 4rpx; }
  &__symbol { font-size: 24rpx; color: $price-color; }
  &__num { font-size: 38rpx; font-weight: bold; color: $price-color; }
  &__paid-at { margin-left: auto; font-size: 20rpx; color: $text-color-placeholder; }
  &__foot { display: flex; align-items: center; justify-content: flex-end; gap: 16rpx; margin-top: 6rpx; padding-top: 16rpx; border-top: 1rpx solid $border-color; }
  &__note { font-size: 20rpx; color: $text-color-placeholder; flex: 1; line-height: 1.4; }
  &__cancel { font-size: 24rpx; color: $text-color-secondary; }
  &__btn { margin: 0; height: 60rpx; line-height: 60rpx; padding: 0 34rpx; font-size: 24rpx; color: #fff; background: linear-gradient(135deg, #ff6600, #ff9a3d); border-radius: 999rpx;
    &--ghost { background: transparent; color: #ff6600; border: 1rpx solid #ff6600; }
  }
}
.cso-note { padding: 24rpx 30rpx 0; font-size: 22rpx; color: $text-color-placeholder; text-align: center; line-height: 1.5; }
.cso-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); display: flex; align-items: flex-end; z-index: 99; }
.cso-sheet { width: 100%; background: $surface; border-radius: $radius-lg $radius-lg 0 0; padding: 32rpx 30rpx 40rpx; display: flex; flex-direction: column; gap: 14rpx;
  &__title { font-size: 30rpx; font-weight: bold; color: $text-color; text-align: center; }
  &__name { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
  &__price { display: flex; align-items: baseline; justify-content: center; }
  &__amount { font-size: 52rpx; font-weight: bold; color: $price-color; }
  &__balance { display: flex; align-items: center; justify-content: space-between; font-size: 24rpx; color: $text-color-secondary; padding: 8rpx 4rpx;
    .low { color: #ff4d4f; }
  }
  &__way { display: flex; align-items: center; gap: 14rpx; padding: 24rpx 22rpx; background: $bg-color; border-radius: $radius-md;
    &.disabled { opacity: .6; }
  }
  &__way-ico { font-size: 34rpx; }
  &__way-txt { flex: 1; font-size: 28rpx; color: $text-color; }
  &__way-arrow { font-size: 28rpx; color: $text-color-placeholder; }
  &__cancel { margin-top: 12rpx; text-align: center; font-size: 26rpx; color: $text-color-secondary; padding: 16rpx 0; }
}
</style>
