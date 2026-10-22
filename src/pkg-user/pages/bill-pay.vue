<template>
  <view class="bp-page">
    <view class="bp-hero">
      <view class="bp-hero__row">
        <text class="bp-hero__ico">🧮</text>
        <text class="bp-hero__title">{{ $t('billPay.title') }}</text>
      </view>
      <text class="bp-hero__sub">{{ $t('billPay.sub') }}</text>
      <view v-if="logged" class="bp-hero__stats">
        <view class="bp-hero__stat">
          <text class="bp-hero__num">{{ orders.length }}</text>
          <text class="bp-hero__lbl">{{ $t('billPay.statTotal') }}</text>
        </view>
        <view class="bp-hero__stat">
          <text class="bp-hero__num">{{ payableCount }}</text>
          <text class="bp-hero__lbl">{{ $t('billPay.statPayable') }}</text>
        </view>
        <view class="bp-hero__stat">
          <text class="bp-hero__num">¥{{ money(balance) }}</text>
          <text class="bp-hero__lbl">{{ $t('billPay.statBalance') }}</text>
        </view>
      </view>
    </view>

    <!-- 规则说明：来自后端 billPayConfig -->
    <view class="bp-rules" v-if="config">
      <view class="bp-rules__row">
        <text>{{ $t('billPay.ruleRange') }}</text>
        <text>¥{{ money(config.minAmount) }} ~ ¥{{ money(config.maxAmount) }}</text>
      </view>
      <view class="bp-rules__row">
        <text>{{ $t('billPay.ruleDaily') }}</text>
        <text>¥{{ money(config.dailyLimitAmount) }}</text>
      </view>
      <view class="bp-rules__row">
        <text>{{ $t('billPay.ruleQuote') }}</text>
        <text>{{ config.autoQuote ? $t('billPay.ruleQuoteAuto').replace('{m}', String(config.quoteExpireMinutes)) : $t('billPay.ruleQuoteManual') }}</text>
      </view>
      <view class="bp-rules__row" v-if="config.memberDiscount?.percent">
        <text>{{ $t('billPay.ruleMember') }}</text>
        <text>{{ $t('billPay.ruleMemberVal').replace('{n}', String(config.memberDiscount.percent)) }}</text>
      </view>
      <view class="bp-rules__th" v-if="config.thresholds?.length">
        <text class="bp-rules__th-title">{{ $t('billPay.ruleThresholds') }}</text>
        <text v-for="(t, i) in config.thresholds" :key="i" class="bp-rules__th-item">
          {{ localizeLabel(t.label) || $t('billPay.thresholdFallback') }} · {{ $t('billPay.thresholdLine').replace('{a}', money(t.minSpend)).replace('{b}', money(t.reduce)) }}
        </text>
      </view>
    </view>

    <!-- 提交代买单 -->
    <view class="bp-form" v-if="logged">
      <text class="bp-form__title">{{ $t('billPay.formTitle') }}</text>
      <view class="bp-form__field">
        <text class="bp-form__lbl">{{ $t('billPay.merchant') }}</text>
        <input v-model="merchantName" class="bp-form__input" :placeholder="$t('billPay.merchantPh')" placeholder-class="bp-ph" />
      </view>
      <view class="bp-form__field">
        <text class="bp-form__lbl">{{ $t('billPay.amount') }}</text>
        <input v-model="amountYuan" class="bp-form__input" type="digit" :placeholder="$t('billPay.amountPh')" placeholder-class="bp-ph" />
      </view>
      <view class="bp-form__field">
        <text class="bp-form__lbl">{{ $t('billPay.remark') }}</text>
        <input v-model="remark" class="bp-form__input" :placeholder="$t('billPay.remarkPh')" placeholder-class="bp-ph" />
      </view>
      <button class="bp-form__btn" :disabled="busy" @tap="submit">{{ $t('billPay.submit') }}</button>
      <text class="bp-form__hint">{{ $t('billPay.submitHint') }}</text>
    </view>

    <!-- 我的代买单 -->
    <view class="bp-sec" v-if="logged">
      <text class="bp-sec__title">{{ $t('billPay.myOrders') }}</text>
    </view>
    <view v-if="logged && loading" class="bp-tip">{{ $t('billPay.loading') }}</view>
    <view v-else-if="logged && !orders.length" class="bp-empty">
      <text class="bp-empty__ico">🧮</text>
      <text class="bp-empty__text">{{ $t('billPay.empty') }}</text>
    </view>
    <view v-for="o in orders" :key="o.id" class="bp-order">
      <view class="bp-order__head">
        <text class="bp-order__merchant">{{ o.merchantName }}</text>
        <text class="bp-order__status" :class="'bp-order__status--' + o.status">{{ statusLabel(o.status) }}</text>
      </view>
      <view class="bp-order__amounts">
        <view class="bp-order__cell">
          <text class="bp-order__lbl">{{ $t('billPay.expected') }}</text>
          <text class="bp-order__val">¥{{ money(o.expectedAmount) }}</text>
        </view>
        <view class="bp-order__cell">
          <text class="bp-order__lbl">{{ $t('billPay.quote') }}</text>
          <text class="bp-order__val" :class="{ hot: o.quoteAmount != null }">{{ o.quoteAmount != null ? '¥' + money(o.quoteAmount) : $t('billPay.quotePending') }}</text>
        </view>
      </view>
      <text v-if="o.remark" class="bp-order__remark">{{ $t('billPay.remarkLine').replace('{t}', o.remark) }}</text>
      <text v-if="o.quoteNote" class="bp-order__note">{{ $t('billPay.quoteNote').replace('{t}', o.quoteNote) }}</text>
      <text v-if="o.quoteExpireAt && o.status === 'QUOTED'" class="bp-order__expire">
        {{ $t('billPay.quoteExpire').replace('{t}', fmtDate(o.quoteExpireAt)) }}
      </text>
      <text class="bp-order__code">{{ $t('billPay.code').replace('{c}', o.code || o.id) }}</text>
      <view class="bp-order__actions">
        <button v-if="o.status === 'QUOTED'" class="bp-order__btn bp-order__btn--pay" :disabled="busy" @tap="openPay(o)">{{ $t('billPay.pay') }}</button>
        <button v-if="canCancel(o)" class="bp-order__btn" :disabled="busy" @tap="doCancel(o)">{{ $t('billPay.cancel') }}</button>
      </view>
    </view>

    <view v-if="!logged" class="bp-empty">
      <text class="bp-empty__ico">🔒</text>
      <text class="bp-empty__text">{{ $t('billPay.needLogin') }}</text>
      <button class="bp-order__btn bp-order__btn--pay bp-login__btn" @tap="goLogin">{{ $t('billPay.login') }}</button>
    </view>

    <view class="bp-note">{{ $t('billPay.note') }}</view>

    <!-- 支付弹层：余额即时结算 / 微信跳转收银台 -->
    <view class="bp-mask" v-if="payTarget" @tap="closePay">
      <view class="bp-sheet" @tap.stop>
        <text class="bp-sheet__title">{{ $t('billPay.payTitle') }}</text>
        <text class="bp-sheet__name">{{ payTarget.merchantName }}</text>
        <text class="bp-sheet__amount">¥{{ money(payAmount) }}</text>
        <text v-if="discountText" class="bp-sheet__disc">{{ discountText }}</text>
        <view class="bp-sheet__balance">
          <text>{{ $t('billPay.balanceLabel') }}</text>
          <text :class="{ low: balance < payAmount }">¥{{ money(balance) }}</text>
        </view>
        <view class="bp-sheet__way" :class="{ disabled: busy || balance < payAmount }" @tap="payWithBalance">
          <text class="bp-sheet__way-ico">💰</text>
          <text class="bp-sheet__way-txt">{{ $t('billPay.payBalance') }}</text>
          <text class="bp-sheet__way-arrow">›</text>
        </view>
        <view class="bp-sheet__way" :class="{ disabled: busy }" @tap="payWithWechat">
          <text class="bp-sheet__way-ico">💚</text>
          <text class="bp-sheet__way-txt">{{ $t('billPay.payWechat') }}</text>
          <text class="bp-sheet__way-arrow">›</text>
        </view>
        <view class="bp-sheet__cancel" @tap="closePay">{{ $t('billPay.cancel') }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  getBillPayConfig,
  getMyBillPayOrders,
  createBillPayOrder,
  cancelBillPayOrder,
  createWechatBillPayment,
  payBillPayOrderWithBalance,
} from '../../api/queries/billPay';
import { getMyBalance } from '../../api/queries/wallet';
import { handlePayment } from '../../composables/usePayment';
import { getPlatform } from '../../utils/platform';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();

const config = ref<any>(null);
const orders = ref<any[]>([]);
const loading = ref(true);
const busy = ref(false);
const balance = ref(0);
const merchantName = ref('');
const amountYuan = ref('');
const remark = ref('');
const payTarget = ref<any>(null);

const logged = computed(() => auth.isLoggedIn);
const payableCount = computed(() => orders.value.filter(o => o.status === 'QUOTED').length);
const payAmount = computed(() => Number(payTarget.value?.quoteAmount || 0));
const discountText = computed(() => {
  const d = payTarget.value?.discountDetail;
  if (!d) return '';
  try {
    const arr = typeof d === 'string' ? JSON.parse(d) : d;
    if (!Array.isArray(arr) || !arr.length) return '';
    const total = arr.reduce((s: number, x: any) => s + Number(x.amount || 0), 0);
    return total > 0 ? locale.t('billPay.discountLine').replace('{y}', money(total)) : '';
  } catch { return ''; }
});

const statusLabels: Record<string, string> = {
  PENDING_QUOTE: 'stPendingQuote',
  QUOTED: 'stQuoted',
  PAID: 'stPaid',
  IN_SERVICE: 'stInService',
  COMPLETED: 'stCompleted',
  SETTLED: 'stSettled',
  CANCELLED: 'stCancelled',
  REFUNDED: 'stRefunded',
};
function statusLabel(s: string) {
  const k = statusLabels[s];
  return k ? locale.t(`billPay.${k}`) : s || '';
}
function canCancel(o: any) {
  return o.status === 'PENDING_QUOTE' || o.status === 'QUOTED';
}
function money(fen: number) {
  return (Number(fen || 0) / 100).toFixed(2);
}
function fmtDate(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** 阈值/会员折扣文案为 LocalizedText（string | {locale: text}），逐级回退 */
function localizeLabel(label: any): string {
  if (!label) return '';
  if (typeof label === 'string') return label;
  const cur = locale.locale || 'zh-Hans';
  return label[cur] || label['zh-Hans'] || label['en'] || Object.values(label)[0] as string || '';
}

async function loadConfig() {
  try { config.value = await getBillPayConfig(); } catch (e) { console.warn('[bill-pay] config failed', e); }
}
async function loadOrders() {
  if (!auth.isLoggedIn) { orders.value = []; loading.value = false; return; }
  loading.value = true;
  try {
    const res = await getMyBillPayOrders({ take: 50 });
    orders.value = res?.items || [];
  } catch (e) {
    console.warn('[bill-pay] orders failed', e);
    orders.value = [];
  } finally {
    loading.value = false;
  }
}
async function loadBalance() {
  if (!auth.isLoggedIn) { balance.value = 0; return; }
  try {
    const res: any = await getMyBalance();
    balance.value = Number(res?.myBalanceWithFrozen?.balance || 0);
  } catch { balance.value = 0; }
}

function goLogin() { auth.requireLogin(); }

async function submit() {
  if (busy.value) return;
  if (!auth.isLoggedIn) { goLogin(); return; }
  const merchant = merchantName.value.trim();
  if (!merchant) { uni.showToast({ title: locale.t('billPay.merchantRequired'), icon: 'none' }); return; }
  const yuan = Number(amountYuan.value);
  if (!Number.isFinite(yuan) || yuan <= 0) { uni.showToast({ title: locale.t('billPay.amountInvalid'), icon: 'none' }); return; }
  const fen = Math.round(yuan * 100);
  if (config.value?.minAmount && fen < config.value.minAmount) {
    uni.showToast({ title: locale.t('billPay.amountTooLow').replace('{y}', money(config.value.minAmount)), icon: 'none' }); return;
  }
  if (config.value?.maxAmount && fen > config.value.maxAmount) {
    uni.showToast({ title: locale.t('billPay.amountTooHigh').replace('{y}', money(config.value.maxAmount)), icon: 'none' }); return;
  }
  busy.value = true;
  uni.showLoading({ title: locale.t('billPay.submitting'), mask: true });
  try {
    await createBillPayOrder({ merchantName: merchant, expectedAmount: fen, remark: remark.value.trim() || undefined });
    uni.hideLoading();
    merchantName.value = ''; amountYuan.value = ''; remark.value = '';
    uni.showToast({ title: locale.t('billPay.submitOk'), icon: 'success' });
    await loadOrders();
    void loadBalance();
  } catch (e: any) {
    uni.hideLoading();
    const msg = String(e?.message || '');
    let text = locale.t('billPay.submitFail');
    if (/minimum/i.test(msg)) text = locale.t('billPay.amountTooLow').replace('{y}', money(config.value?.minAmount || 0));
    else if (/limit/i.test(msg)) text = locale.t('billPay.dailyLimit');
    else if (/authenticat|authoriz/i.test(msg)) { goLogin(); return; }
    uni.showToast({ title: text, icon: 'none' });
  } finally {
    busy.value = false;
  }
}

function openPay(o: any) {
  if (busy.value) return;
  payTarget.value = o;
  void loadBalance();
}
function closePay() { if (!busy.value) payTarget.value = null; }

async function payWithBalance() {
  const o = payTarget.value;
  if (!o || busy.value) return;
  if (balance.value < payAmount.value) {
    uni.showToast({ title: locale.t('billPay.balanceLow'), icon: 'none' });
    return;
  }
  busy.value = true;
  uni.showLoading({ title: locale.t('billPay.paying'), mask: true });
  try {
    await payBillPayOrderWithBalance(String(o.id));
    uni.hideLoading();
    payTarget.value = null;
    uni.showToast({ title: locale.t('billPay.payOk'), icon: 'success' });
    await loadOrders();
    await loadBalance();
  } catch (e: any) {
    uni.hideLoading();
    const msg = String(e?.message || '');
    let key = 'billPay.payFail';
    if (/not payable/i.test(msg)) key = 'billPay.notPayable';
    else if (/insufficient|余额/i.test(msg)) key = 'billPay.balanceLow';
    uni.showToast({ title: locale.t(key), icon: 'none' });
    await loadOrders();
  } finally {
    busy.value = false;
  }
}

async function payWithWechat() {
  const o = payTarget.value;
  if (!o || busy.value) return;
  busy.value = true;
  uni.showLoading({ title: locale.t('billPay.paying'), mask: true });
  try {
    const platform = getPlatform();
    let res: any;
    // 微信内/小程序优先 JSAPI（后端按客户档案取 openid）；普通浏览器 JSAPI 取不到 openid 时回落 H5 跳转
    try {
      res = await createWechatBillPayment(String(o.id), 'JSAPI');
    } catch (e) {
      if (platform !== 'h5') throw e;
      res = await createWechatBillPayment(String(o.id), 'H5');
    }
    const pay = res?.pay || {};
    uni.hideLoading();
    const r = await handlePayment('wechatpay', {
      metadata: { public: pay },
      h5Url: pay.payUrl || pay.h5Url,
      orderCode: res?.outTradeNo || o.code,
    });
    if (!r.success) {
      uni.showToast({ title: r.message || locale.t('billPay.payFail'), icon: 'none' });
      return;
    }
    payTarget.value = null;
    // JSAPI 同步返回成功；H5 跳转支付由微信回调结算，返回后 onShow 刷新
    if (pay.payType !== 'h5') {
      uni.showToast({ title: locale.t('billPay.paySubmitted'), icon: 'none' });
      await loadOrders();
    }
  } catch (e: any) {
    uni.hideLoading();
    uni.showToast({ title: e?.message || locale.t('billPay.payFail'), icon: 'none' });
  } finally {
    busy.value = false;
  }
}

function doCancel(o: any) {
  if (busy.value) return;
  uni.showModal({
    title: locale.t('billPay.cancelTitle'),
    content: locale.t('billPay.cancelConfirm'),
    confirmText: locale.t('billPay.cancel'),
    confirmColor: '#e54d42',
    cancelText: locale.t('billPay.close'),
    success: async (res) => {
      if (!res.confirm) return;
      busy.value = true;
      try {
        await cancelBillPayOrder(String(o.id));
        uni.showToast({ title: locale.t('billPay.cancelOk'), icon: 'none' });
        await loadOrders();
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('billPay.cancelFail'), icon: 'none' });
      } finally {
        busy.value = false;
      }
    },
  });
}

onShow(() => {
  void loadConfig();
  void loadOrders();
  void loadBalance();
});
</script>

<style scoped lang="scss">
.bp-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.bp-hero { background: linear-gradient(135deg, #2f7d6f, #3fae94); color: #fff; padding: 40rpx 30rpx 34rpx;
  &__row { display: flex; align-items: center; gap: 12rpx; }
  &__ico { font-size: 44rpx; }
  &__title { font-size: 40rpx; font-weight: bold; }
  &__sub { display: block; margin-top: 10rpx; font-size: 24rpx; opacity: .9; }
  &__stats { display: flex; margin-top: 24rpx; }
  &__stat { flex: 1; text-align: center; }
  &__num { display: block; font-size: 34rpx; font-weight: bold; }
  &__lbl { display: block; margin-top: 4rpx; font-size: 20rpx; opacity: .85; }
}
.bp-rules { margin: 20rpx; padding: 24rpx; background: $surface; border-radius: $radius-md;
  &__row { display: flex; justify-content: space-between; font-size: 24rpx; color: $text-color-secondary; padding: 8rpx 0; }
  &__th { margin-top: 12rpx; padding-top: 12rpx; border-top: 1rpx solid #f0f0f0; }
  &__th-title { display: block; font-size: 22rpx; color: $text-color-placeholder; }
  &__th-item { display: block; margin-top: 6rpx; font-size: 22rpx; color: #2f7d6f; }
}
.bp-form { margin: 20rpx; padding: 26rpx; background: $surface; border-radius: $radius-md;
  &__title { display: block; font-size: 28rpx; font-weight: 600; color: $text-color; margin-bottom: 16rpx; }
  &__field { margin-bottom: 18rpx; }
  &__lbl { display: block; font-size: 24rpx; color: $text-color-secondary; margin-bottom: 8rpx; }
  &__input { height: 76rpx; background: $bg-color; border-radius: $radius-sm; padding: 0 20rpx; font-size: 28rpx; color: $text-color; }
  &__btn { height: 80rpx; line-height: 80rpx; font-size: 30rpx; color: #fff; background: linear-gradient(135deg, #2f7d6f, #3fae94); border-radius: 999rpx; margin-top: 6rpx; }
  &__hint { display: block; margin-top: 12rpx; font-size: 22rpx; color: $text-color-placeholder; line-height: 1.5; }
}
.bp-sec { padding: 24rpx 30rpx 8rpx;
  &__title { font-size: 28rpx; font-weight: 600; color: $text-color; }
}
.bp-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 60rpx 0; }
.bp-empty { display: flex; flex-direction: column; align-items: center; padding: 100rpx 40rpx; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
}
.bp-login__btn { margin-top: 20rpx; padding: 0 60rpx; }
.bp-order { margin: 0 20rpx 16rpx; padding: 24rpx; background: $surface; border-radius: $radius-md;
  &__head { display: flex; align-items: center; justify-content: space-between; }
  &__merchant { font-size: 30rpx; font-weight: 600; color: $text-color; }
  &__status { font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 999rpx; background: #f0f0f0; color: #999;
    &--QUOTED { background: #e8f6f2; color: #2f7d6f; }
    &--PAID, &--IN_SERVICE { background: #eef0ff; color: #4b5bd7; }
    &--COMPLETED, &--SETTLED { background: #e8f7ee; color: #2f9e44; }
    &--CANCELLED, &--REFUNDED { background: #f0f0f0; color: #999; }
  }
  &__amounts { display: flex; margin-top: 16rpx; }
  &__cell { flex: 1; }
  &__lbl { display: block; font-size: 22rpx; color: $text-color-placeholder; }
  &__val { display: block; margin-top: 4rpx; font-size: 30rpx; font-weight: 600; color: $text-color;
    &.hot { color: #2f7d6f; }
  }
  &__remark, &__note, &__expire, &__code { display: block; margin-top: 10rpx; font-size: 22rpx; color: $text-color-secondary; }
  &__expire { color: #d98300; }
  &__code { color: $text-color-placeholder; }
  &__actions { display: flex; gap: 16rpx; margin-top: 18rpx; }
  &__btn { flex: 1; margin: 0; height: 68rpx; line-height: 68rpx; font-size: 26rpx; color: $text-color-secondary; background: $bg-color; border-radius: 999rpx;
    &--pay { color: #fff; background: linear-gradient(135deg, #2f7d6f, #3fae94); }
  }
}
.bp-note { padding: 24rpx 30rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; line-height: 1.6; }
.bp-mask { position: fixed; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0,0,0,.5); display: flex; align-items: flex-end; z-index: 50; }
.bp-sheet { width: 100%; background: #fff; border-radius: 28rpx 28rpx 0 0; padding: 36rpx 30rpx calc(30rpx + env(safe-area-inset-bottom));
  &__title { display: block; font-size: 32rpx; font-weight: bold; text-align: center; color: $text-color; }
  &__name { display: block; margin-top: 16rpx; font-size: 24rpx; text-align: center; color: $text-color-secondary; }
  &__amount { display: block; margin-top: 10rpx; font-size: 48rpx; font-weight: bold; text-align: center; color: #2f7d6f; }
  &__disc { display: block; margin-top: 6rpx; font-size: 22rpx; text-align: center; color: #d98300; }
  &__balance { display: flex; justify-content: space-between; margin-top: 24rpx; padding: 18rpx 20rpx; background: $bg-color; border-radius: $radius-sm; font-size: 24rpx; color: $text-color-secondary;
    .low { color: #e54d42; }
  }
  &__way { display: flex; align-items: center; gap: 14rpx; margin-top: 20rpx; padding: 24rpx 20rpx; border: 1rpx solid #e5e5e5; border-radius: $radius-sm;
    &.disabled { opacity: .45; }
  }
  &__way-ico { font-size: 34rpx; }
  &__way-txt { flex: 1; font-size: 28rpx; color: $text-color; }
  &__way-arrow { color: $text-color-placeholder; }
  &__cancel { margin-top: 24rpx; text-align: center; font-size: 28rpx; color: $text-color-secondary; padding: 12rpx 0; }
}
</style>
