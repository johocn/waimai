<template>
  <view class="cm-page">
    <view class="cm-hero">
      <view class="cm-hero__row">
        <text class="cm-hero__ico">🎫</text>
        <view class="cm-hero__info">
          <text class="cm-hero__title">{{ $t('couponMall.title') }}</text>
          <text class="cm-hero__sub">{{ $t('couponMall.sub') }}</text>
        </view>
        <text class="cm-hero__link" @tap="goOrders">{{ $t('couponMall.myOrders') }} ›</text>
      </view>
    </view>

    <!-- 倒计时活动位（后端配置才有） -->
    <view class="cm-campaign" v-if="campaign">
      <view class="cm-campaign__head">
        <text class="cm-campaign__name">{{ campaign.name }}</text>
        <text class="cm-campaign__clock">{{ campaignLeftText }}</text>
      </view>
      <text v-if="campaign.subtitle" class="cm-campaign__sub">{{ campaign.subtitle }}</text>
      <text v-if="campaign.rules" class="cm-campaign__rules">{{ campaign.rules }}</text>
    </view>

    <!-- 首购立减提示 -->
    <view class="cm-firstbuy" v-if="firstBuyDiscount > 0">
      <text class="cm-firstbuy__tag">{{ $t('couponMall.firstBuyTag') }}</text>
      <text class="cm-firstbuy__txt">{{ firstBuyText }}</text>
    </view>

    <view class="cm-tabs">
      <text class="cm-tab" :class="{ on: tab === 'single' }" @tap="tab = 'single'">{{ $t('couponMall.tabSingle') }}</text>
      <text class="cm-tab" :class="{ on: tab === 'bundle' }" @tap="tab = 'bundle'">{{ $t('couponMall.tabBundle') }}</text>
    </view>

    <view v-if="loading" class="cm-tip">{{ $t('couponMall.loading') }}</view>

    <template v-else-if="tab === 'single'">
      <view v-if="!templates.length" class="cm-empty">
        <text class="cm-empty__ico">🎫</text>
        <text class="cm-empty__text">{{ $t('couponMall.empty') }}</text>
      </view>
      <view v-for="t in templates" :key="t.id" class="sale-card">
        <view class="sale-card__left">
          <view class="sale-card__amount">
            <text class="sale-card__symbol" v-if="t.type === 'FIXED' || t.type === 'FULL'">¥</text>
            <text class="sale-card__num">{{ amountText(t) }}</text>
            <text class="sale-card__unit" v-if="t.type === 'PERCENT'">{{ $t('couponMall.unitPercent') }}</text>
          </view>
          <text class="sale-card__cond">{{ condText(t) }}</text>
        </view>
        <view class="sale-card__body">
          <view class="sale-card__title-row">
            <text class="sale-card__name">{{ t.name }}</text>
            <text v-if="t.label" class="sale-card__label">{{ t.label }}</text>
          </view>
          <text v-if="t.description" class="sale-card__desc">{{ t.description }}</text>
          <view class="sale-card__price">
            <text class="sale-card__sale">¥{{ money(t.salePrice) }}</text>
            <text v-if="t.anchorPrice > t.salePrice" class="sale-card__anchor">¥{{ money(t.anchorPrice) }}</text>
            <text class="sale-card__sold">{{ $t('couponMall.sold').replace('{n}', String(t.soldCount || 0)) }}</text>
          </view>
          <button class="sale-card__btn" :disabled="busy" @tap="openPay({ kind: 'template', data: t })">{{ $t('couponMall.buy') }}</button>
        </view>
      </view>
    </template>

    <template v-else>
      <view v-if="!bundles.length" class="cm-empty">
        <text class="cm-empty__ico">📦</text>
        <text class="cm-empty__text">{{ $t('couponMall.emptyBundle') }}</text>
      </view>
      <view v-for="b in bundles" :key="b.id" class="bundle-card">
        <view class="bundle-card__head">
          <text class="bundle-card__name">{{ b.name }}</text>
          <text class="bundle-card__sale">¥{{ money(b.salePrice) }}</text>
        </view>
        <text v-if="b.description" class="bundle-card__desc">{{ b.description }}</text>
        <text class="bundle-card__items">{{ $t('couponMall.bundleItems').replace('{n}', String((b.items || []).reduce((s: number, i: any) => s + (i.quantity || 1), 0))) }}</text>
        <text class="bundle-card__sold">{{ $t('couponMall.sold').replace('{n}', String(b.soldCount || 0)) }}</text>
        <button class="bundle-card__btn" :disabled="busy" @tap="openPay({ kind: 'bundle', data: b })">{{ $t('couponMall.buy') }}</button>
      </view>
    </template>

    <view class="cm-note">{{ $t('couponMall.note') }}</view>

    <!-- 支付方式弹层 -->
    <view class="cm-mask" v-if="payTarget" @tap="closePay">
      <view class="cm-sheet" @tap.stop>
        <text class="cm-sheet__title">{{ $t('couponMall.payTitle') }}</text>
        <text class="cm-sheet__name">{{ payName }}</text>
        <view class="cm-sheet__price">
          <text class="cm-sheet__amount">¥{{ money(payPrice) }}</text>
          <text v-if="payAnchor > payPrice" class="cm-sheet__anchor">¥{{ money(payAnchor) }}</text>
        </view>
        <view class="cm-sheet__balance" v-if="balanceLoaded">
          <text>{{ $t('couponMall.balanceLabel') }}</text>
          <text :class="{ low: balance < payPrice }">¥{{ money(balance) }}</text>
        </view>
        <view class="cm-sheet__way" :class="{ disabled: busy }" @tap="payWithBalance">
          <text class="cm-sheet__way-ico">💰</text>
          <text class="cm-sheet__way-txt">{{ $t('couponMall.payBalance') }}</text>
          <text class="cm-sheet__way-arrow">›</text>
        </view>
        <view class="cm-sheet__way" :class="{ disabled: busy }" @tap="payWithWechat">
          <text class="cm-sheet__way-ico">💚</text>
          <text class="cm-sheet__way-txt">{{ $t('couponMall.payWechat') }}</text>
          <text class="cm-sheet__way-arrow">›</text>
        </view>
        <view class="cm-sheet__cancel" @tap="closePay">{{ $t('couponMall.cancel') }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import {
  getCouponSaleCatalogueInChannel,
  createCouponSaleOrder,
  payCouponSaleWithBalance,
  createWechatCouponPayment,
} from '../../api/queries/couponSale';
import { getMyBalance } from '../../api/queries/wallet';
import { handlePayment } from '../../composables/usePayment';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();

const loading = ref(true);
const busy = ref(false);
const tab = ref<'single' | 'bundle'>('single');
const templates = ref<any[]>([]);
const bundles = ref<any[]>([]);
const firstBuyDiscount = ref(0);
const campaign = ref<any>(null);
const balance = ref(0);
const balanceLoaded = ref(false);
const payTarget = ref<{ kind: 'template' | 'bundle'; data: any } | null>(null);
const now = ref(Date.now());
let timer: any = null;

const payName = computed(() => {
  const t = payTarget.value;
  if (!t) return '';
  return t.kind === 'template' ? t.data.name : t.data.name;
});
const payPrice = computed(() => Number(payTarget.value?.data?.salePrice || 0));
const payAnchor = computed(() => {
  const t = payTarget.value;
  if (!t) return 0;
  return t.kind === 'template' ? Number(t.data.anchorPrice || 0) : 0;
});
const firstBuyText = computed(() => locale.t('couponMall.firstBuyText').replace('{d}', money(firstBuyDiscount.value)));

const campaignLeftText = computed(() => {
  if (!campaign.value?.endsAt) return '';
  const left = Math.max(0, new Date(campaign.value.endsAt).getTime() - now.value);
  if (left <= 0) return locale.t('couponMall.campaignEnded');
  const s = Math.floor(left / 1000);
  return locale.t('couponMall.campaignLeft')
    .replace('{h}', String(Math.floor(s / 3600)).padStart(2, '0'))
    .replace('{m}', String(Math.floor((s % 3600) / 60)).padStart(2, '0'))
    .replace('{s}', String(s % 60).padStart(2, '0'));
});

function money(fen: number) {
  return (Number(fen || 0) / 100).toFixed(2);
}

function amountText(t: any): string {
  if (!t) return '';
  if (t.type === 'PERCENT') return (t.discountValue / 10).toFixed(1).replace(/\.0$/, '');
  if (t.type === 'FREE_SHIPPING') return locale.t('couponMall.freeShort');
  const yuan = t.discountValue / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

function condText(t: any): string {
  if (!t) return '';
  if (t.type === 'FULL') {
    const yuan = t.minSpend / 100;
    return locale.t('couponMall.condFull').replace('{n}', Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2));
  }
  if (t.type === 'PERCENT') return locale.t('couponMall.condPercent');
  if (t.type === 'FREE_SHIPPING') return locale.t('couponMall.condFreeShip');
  return locale.t('couponMall.condNone');
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
  loading.value = true;
  try {
    const cat = await getCouponSaleCatalogueInChannel();
    templates.value = cat.templates || [];
    bundles.value = cat.bundles || [];
    firstBuyDiscount.value = Number(cat.firstBuyDiscount || 0);
    campaign.value = cat.campaign || null;
    void loadBalance();
  } catch (e) {
    console.warn('[coupon-mall] load failed', e);
    templates.value = [];
    bundles.value = [];
  } finally {
    loading.value = false;
  }
}

function goOrders() {
  if (!auth.isLoggedIn) { uni.navigateTo({ url: '/pages/login/index' }); return; }
  uni.navigateTo({ url: '/pkg-promotion/pages/coupon-sale-orders' });
}

function openPay(target: { kind: 'template' | 'bundle'; data: any }) {
  if (busy.value) return;
  if (!auth.isLoggedIn) { uni.navigateTo({ url: '/pages/login/index' }); return; }
  payTarget.value = target;
  void loadBalance();
}

function closePay() {
  if (busy.value) return;
  payTarget.value = null;
}

async function createOrder(): Promise<any> {
  const t = payTarget.value!;
  const input = t.kind === 'template' ? { templateId: String(t.data.id) } : { bundleId: String(t.data.id) };
  const order = await createCouponSaleOrder(input);
  if (!order?.id) throw new Error('CREATE_FAILED');
  return order;
}

function errText(e: any): string {
  const msg = String(e?.response?.errors?.[0]?.message || e?.message || '');
  if (/insufficient|balance/i.test(msg)) return locale.t('couponMall.noBalance');
  if (/not saleable|not available/i.test(msg)) return locale.t('couponMall.notSaleable');
  if (/limit/i.test(msg)) return locale.t('couponMall.limitReached');
  return locale.t('couponMall.payFail');
}

async function payWithBalance() {
  if (busy.value || !payTarget.value) return;
  busy.value = true;
  uni.showLoading({ title: locale.t('couponMall.paying') });
  try {
    const order = await createOrder();
    const paid = await payCouponSaleWithBalance(String(order.id));
    uni.hideLoading();
    payTarget.value = null;
    uni.showToast({ title: locale.t('couponMall.payOk'), icon: 'none' });
    if (paid?.status !== 'PAID') {
      setTimeout(() => uni.navigateTo({ url: '/pkg-promotion/pages/coupon-sale-orders' }), 600);
    } else {
      setTimeout(() => uni.navigateTo({ url: '/pkg-promotion/pages/coupon-sale-orders' }), 600);
    }
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
  uni.showLoading({ title: locale.t('couponMall.paying') });
  try {
    const order = await createOrder();
    const res = await createWechatCouponPayment(String(order.id), 'H5');
    const pay = res?.pay || {};
    uni.hideLoading();
    payTarget.value = null;
    const result = await handlePayment('wechatpay', {
      metadata: { public: pay },
      h5Url: pay.payUrl,
      orderCode: res?.outTradeNo,
    });
    if (!result.success) {
      uni.showToast({ title: result.message || locale.t('couponMall.payFail'), icon: 'none' });
      return;
    }
    uni.showToast({ title: locale.t('couponMall.payRedirect'), icon: 'none' });
  } catch (e: any) {
    uni.hideLoading();
    uni.showToast({ title: errText(e), icon: 'none' });
  } finally {
    busy.value = false;
  }
}

onLoad(() => { void load(); });
onShow(() => {
  timer = setInterval(() => { now.value = Date.now(); }, 1000);
  void loadBalance();
});
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<style scoped lang="scss">
.cm-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.cm-hero { background: linear-gradient(135deg, #ff6600, #ff9a3d); color: #fff; padding: 36rpx 30rpx;
  &__row { display: flex; align-items: center; gap: 16rpx; }
  &__ico { font-size: 44rpx; }
  &__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
  &__title { font-size: 38rpx; font-weight: bold; }
  &__sub { font-size: 22rpx; opacity: .9; }
  &__link { font-size: 24rpx; opacity: .95; flex-shrink: 0; }
}
.cm-campaign { margin: 20rpx; background: #fff4e6; border: 1rpx solid #ffd2a8; border-radius: $radius-md; padding: 20rpx;
  &__head { display: flex; align-items: center; justify-content: space-between; }
  &__name { font-size: 28rpx; font-weight: bold; color: #b45309; }
  &__clock { font-size: 22rpx; color: #ff6600; }
  &__sub { display: block; margin-top: 6rpx; font-size: 22rpx; color: #b45309; }
  &__rules { display: block; margin-top: 6rpx; font-size: 20rpx; color: #b45309; opacity: .8; line-height: 1.4; }
}
.cm-firstbuy { margin: 20rpx 20rpx 0; background: #fff0f0; border-radius: $radius-md; padding: 18rpx 20rpx; display: flex; align-items: center; gap: 12rpx;
  &__tag { font-size: 20rpx; color: #fff; background: #ff4d4f; border-radius: 6rpx; padding: 2rpx 8rpx; flex-shrink: 0; }
  &__txt { font-size: 24rpx; color: #ff4d4f; }
}
.cm-tabs { display: flex; gap: 48rpx; background: $surface; margin-top: 20rpx; padding: 0 30rpx;
  &__0 { }
}
.cm-tab { font-size: 28rpx; color: $text-color-secondary; padding: 24rpx 0; &.on { color: #ff6600; font-weight: bold; border-bottom: 6rpx solid #ff6600; } }
.cm-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 80rpx 0; }
.cm-empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
}
.sale-card { display: flex; background: $surface; margin: 20rpx; border-radius: $radius-md; overflow: hidden;
  &__left { width: 220rpx; flex-shrink: 0; background: linear-gradient(160deg, #ff6600, #ff9a3d); color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24rpx 12rpx; gap: 6rpx; }
  &__amount { display: flex; align-items: baseline; gap: 2rpx; }
  &__symbol { font-size: 26rpx; }
  &__num { font-size: 54rpx; font-weight: bold; }
  &__unit { font-size: 24rpx; }
  &__cond { font-size: 20rpx; opacity: .9; }
  &__body { flex: 1; min-width: 0; padding: 22rpx 24rpx; display: flex; flex-direction: column; gap: 6rpx; }
  &__title-row { display: flex; align-items: center; gap: 10rpx; }
  &__name { font-size: 28rpx; font-weight: bold; color: $text-color; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__label { font-size: 20rpx; color: #fff; background: #ff4d4f; border-radius: 6rpx; padding: 2rpx 8rpx; flex-shrink: 0; }
  &__desc { font-size: 22rpx; color: $text-color-secondary; }
  &__price { display: flex; align-items: baseline; gap: 10rpx; margin-top: 4rpx; }
  &__sale { font-size: 34rpx; font-weight: bold; color: #ff4d4f; }
  &__anchor { font-size: 22rpx; color: $text-color-placeholder; text-decoration: line-through; }
  &__sold { font-size: 20rpx; color: $text-color-placeholder; margin-left: auto; }
  &__btn { margin: 8rpx 0 0 auto; height: 56rpx; line-height: 56rpx; padding: 0 30rpx; font-size: 24rpx; color: #fff; background: linear-gradient(135deg, #ff6600, #ff9a3d); border-radius: 999rpx; }
}
.bundle-card { background: $surface; margin: 20rpx; border-radius: $radius-md; padding: 24rpx; display: flex; flex-direction: column; gap: 8rpx;
  &__head { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
  &__name { font-size: 30rpx; font-weight: bold; color: $text-color; flex: 1; min-width: 0; }
  &__sale { font-size: 34rpx; font-weight: bold; color: #ff4d4f; flex-shrink: 0; }
  &__desc { font-size: 22rpx; color: $text-color-secondary; }
  &__items, &__sold { font-size: 22rpx; color: $text-color-placeholder; }
  &__btn { margin: 10rpx 0 0 auto; height: 60rpx; line-height: 60rpx; padding: 0 34rpx; font-size: 24rpx; color: #fff; background: linear-gradient(135deg, #ff6600, #ff9a3d); border-radius: 999rpx; }
}
.cm-note { padding: 20rpx 30rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; line-height: 1.5; }
.cm-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); display: flex; align-items: flex-end; z-index: 99; }
.cm-sheet { width: 100%; background: $surface; border-radius: $radius-lg $radius-lg 0 0; padding: 32rpx 30rpx 40rpx; display: flex; flex-direction: column; gap: 14rpx;
  &__title { font-size: 30rpx; font-weight: bold; color: $text-color; text-align: center; }
  &__name { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
  &__price { display: flex; align-items: baseline; justify-content: center; gap: 12rpx; }
  &__amount { font-size: 52rpx; font-weight: bold; color: #ff4d4f; }
  &__anchor { font-size: 24rpx; color: $text-color-placeholder; text-decoration: line-through; }
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
