<template>
  <view class="ps-page">
    <view class="ps-hero">
      <view class="ps-hero__row">
        <text class="ps-hero__ico">🧾</text>
        <text class="ps-hero__title">{{ $t('paymentSchedule.title') }}</text>
      </view>
      <text class="ps-hero__sub">{{ $t('paymentSchedule.sub') }}</text>
      <text v-if="orderCode" class="ps-hero__code">{{ $t('paymentSchedule.orderNo').replace('{c}', orderCode) }}</text>
    </view>

    <view v-if="loading" class="ps-tip">{{ $t('paymentSchedule.loading') }}</view>
    <view v-else-if="!schedule" class="ps-empty">
      <text class="ps-empty__ico">🧾</text>
      <text class="ps-empty__text">{{ $t('paymentSchedule.empty') }}</text>
      <text class="ps-empty__hint">{{ $t('paymentSchedule.emptyHint') }}</text>
    </view>

    <template v-else>
      <!-- 账单总览 -->
      <view class="ps-sum">
        <view class="ps-sum__head">
          <text class="ps-sum__scenario">{{ scenarioLabel }}</text>
          <text class="ps-sum__status" :class="'ps-sum__status--' + schedule.status">{{ scheduleStatusLabel }}</text>
        </view>
        <view class="ps-sum__amount">
          <text class="ps-sum__paid">¥{{ money(schedule.paidTotal) }}</text>
          <text class="ps-sum__total">/ ¥{{ money(schedule.totalAmount) }}</text>
        </view>
        <view class="ps-bar">
          <view class="ps-bar__track"><view class="ps-bar__fill" :style="{ width: paidPct + '%' }"></view></view>
          <text class="ps-bar__txt">{{ $t('paymentSchedule.paidPct').replace('{n}', String(paidPct)) }}</text>
        </view>
        <text v-if="schedule.shipDeadline" class="ps-sum__ship">{{ $t('paymentSchedule.shipDeadline').replace('{t}', fmtDate(schedule.shipDeadline)) }}</text>
        <text v-if="schedule.breachType" class="ps-sum__breach">{{ breachText }}</text>
      </view>

      <!-- 期次列表 -->
      <view class="ps-list">
        <view v-for="it in schedule.items" :key="it.id" class="ps-item" :class="'ps-item--' + it.status">
          <view class="ps-item__row">
            <view class="ps-item__l">
              <text class="ps-item__seq">{{ $t('paymentSchedule.period').replace('{n}', String(it.seq)) }}</text>
              <text class="ps-item__kind">{{ kindLabel(it.kind) }}</text>
            </view>
            <text class="ps-item__amount">¥{{ money(it.amount) }}</text>
          </view>
          <view class="ps-item__meta">
            <text class="ps-item__status" :class="'st--' + it.status">{{ itemStatusLabel(it.status) }}</text>
            <text v-if="it.dueAt && it.status !== 'paid'" class="ps-item__due">{{ $t('paymentSchedule.dueAt').replace('{t}', fmtDate(it.dueAt)) }}</text>
            <text v-if="it.paidAt" class="ps-item__due">{{ $t('paymentSchedule.paidAt').replace('{t}', fmtDate(it.paidAt)) }}</text>
          </view>
          <text v-if="it.lateFeeAccrued > 0" class="ps-item__late">
            {{ $t('paymentSchedule.lateFee').replace('{y}', money(it.lateFeeAccrued)) }}
          </text>
          <text v-if="it.status === 'overdue'" class="ps-item__overdue">{{ $t('paymentSchedule.overdueHint') }}</text>
          <text v-else-if="it.status === 'locked'" class="ps-item__locked">{{ $t('paymentSchedule.lockedHint') }}</text>
          <button
            v-if="canPay(it)"
            class="ps-item__btn"
            :disabled="busy"
            @tap="openPay(it)"
          >{{ $t('paymentSchedule.payBtn').replace('{y}', money(it.amount + (it.lateFeeAccrued || 0))) }}</button>
        </view>
      </view>

      <view v-if="canCancel" class="ps-cancel">
        <button class="ps-cancel__btn" :disabled="busy" @tap="confirmCancel">{{ $t('paymentSchedule.cancelBtn') }}</button>
        <text class="ps-cancel__hint">{{ cancelHint }}</text>
      </view>

      <view class="ps-note">{{ $t('paymentSchedule.note') }}</view>
    </template>

    <!-- 支付方式弹层：余额扣款即时生效 -->
    <view class="ps-mask" v-if="payItem" @tap="closePay">
      <view class="ps-sheet" @tap.stop>
        <text class="ps-sheet__title">{{ $t('paymentSchedule.payTitle') }}</text>
        <text class="ps-sheet__name">{{ kindLabel(payItem.kind) }} · {{ $t('paymentSchedule.period').replace('{n}', String(payItem.seq)) }}</text>
        <text class="ps-sheet__amount">¥{{ money(payItem.amount + (payItem.lateFeeAccrued || 0)) }}</text>
        <view class="ps-sheet__balance">
          <text>{{ $t('paymentSchedule.balanceLabel') }}</text>
          <text :class="{ low: balance < payItem.amount + (payItem.lateFeeAccrued || 0) }">¥{{ money(balance) }}</text>
        </view>
        <view class="ps-sheet__way" :class="{ disabled: busy || balance < payItem.amount + (payItem.lateFeeAccrued || 0) }" @tap="payWithBalance">
          <text class="ps-sheet__way-ico">💰</text>
          <text class="ps-sheet__way-txt">{{ $t('paymentSchedule.payBalance') }}</text>
          <text class="ps-sheet__way-arrow">›</text>
        </view>
        <view v-if="balance < payItem.amount" class="ps-sheet__recharge" @tap="goWallet">{{ $t('paymentSchedule.recharge') }} ›</view>
        <view class="ps-sheet__cancel" @tap="closePay">{{ $t('paymentSchedule.cancel') }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getPaymentSchedule, paySchedulePeriod, cancelSchedule } from '../../api/queries/paymentSchedule';
import { getMyBalance } from '../../api/queries/wallet';
import { getOrderByCode } from '../../api/queries/order';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();

const loading = ref(true);
const busy = ref(false);
const schedule = ref<any>(null);
const orderId = ref('');
const orderCode = ref('');
const balance = ref(0);
const payItem = ref<any>(null);

const scenarioLabels: Record<string, string> = {
  presale: 'scenarioPresale',
  installment: 'scenarioInstallment',
  rental: 'scenarioRental',
};
const scheduleStatusLabels: Record<string, string> = {
  pending: 'schedulePending',
  in_progress: 'scheduleInProgress',
  completed: 'scheduleCompleted',
  breached: 'scheduleBreached',
  cancelled: 'scheduleCancelled',
};
const itemStatusLabels: Record<string, string> = {
  locked: 'itemLocked',
  payable: 'itemPayable',
  paid: 'itemPaid',
  overdue: 'itemOverdue',
  forfeited: 'itemForfeited',
  refunded: 'itemRefunded',
  waived: 'itemWaived',
};
const kindLabels: Record<string, string> = {
  deposit: 'kindDeposit',
  balance: 'kindBalance',
  down_payment: 'kindDownPayment',
  installment: 'kindInstallment',
  rent: 'kindRent',
  buyout: 'kindBuyout',
};
const breachLabels: Record<string, string> = {
  buyer_timeout: 'breachBuyerTimeout',
  seller_breach: 'breachSeller',
  group_buy_failed: 'breachGroupBuy',
};

const scenarioLabel = computed(() => {
  const k = scenarioLabels[schedule.value?.scenario];
  return k ? locale.t(`paymentSchedule.${k}`) : '';
});
const scheduleStatusLabel = computed(() => {
  const k = scheduleStatusLabels[schedule.value?.status];
  return k ? locale.t(`paymentSchedule.${k}`) : schedule.value?.status || '';
});
const breachText = computed(() => {
  const k = breachLabels[schedule.value?.breachType];
  return k ? locale.t(`paymentSchedule.${k}`) : '';
});
const paidPct = computed(() => {
  const total = Number(schedule.value?.totalAmount || 0);
  if (!total) return 0;
  return Math.min(100, Math.round((Number(schedule.value?.paidTotal || 0) / total) * 100));
});
const isLegalDeposit = computed(() => {
  const rule = schedule.value?.depositRule;
  return !!rule && rule.kind === 'legal_deposit';
});
const canCancel = computed(() => {
  return ['pending', 'in_progress'].includes(schedule.value?.status);
});
const cancelHint = computed(() => {
  return isLegalDeposit.value
    ? locale.t('paymentSchedule.cancelHintDeposit')
    : locale.t('paymentSchedule.cancelHintNormal');
});

function money(fen: number) {
  return (Number(fen || 0) / 100).toFixed(2);
}
function kindLabel(kind: string) {
  const k = kindLabels[kind];
  return k ? locale.t(`paymentSchedule.${k}`) : kind || '';
}
function itemStatusLabel(status: string) {
  const k = itemStatusLabels[status];
  return k ? locale.t(`paymentSchedule.${k}`) : status || '';
}
function fmtDate(v: string) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function canPay(it: any) {
  return ['payable', 'overdue', 'locked'].includes(it.status) && schedule.value?.status !== 'cancelled';
}

async function load() {
  loading.value = true;
  try {
    schedule.value = await getPaymentSchedule(orderId.value);
  } catch (e) {
    console.warn('[payment-schedule] load failed', e);
    schedule.value = null;
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

function openPay(it: any) {
  if (busy.value) return;
  if (it.status === 'locked') {
    uni.showToast({ title: locale.t('paymentSchedule.lockedToast'), icon: 'none' });
    return;
  }
  payItem.value = it;
  void loadBalance();
}
function closePay() { if (!busy.value) payItem.value = null; }

async function payWithBalance() {
  const it = payItem.value;
  if (!it || busy.value) return;
  const due = Number(it.amount || 0) + Number(it.lateFeeAccrued || 0);
  if (balance.value < due) {
    uni.showToast({ title: locale.t('paymentSchedule.balanceLow'), icon: 'none' });
    return;
  }
  busy.value = true;
  uni.showLoading({ title: locale.t('paymentSchedule.paying'), mask: true });
  try {
    await paySchedulePeriod(orderId.value, Number(it.seq), 'balance-pay');
    uni.hideLoading();
    payItem.value = null;
    uni.showToast({ title: locale.t('paymentSchedule.payOk'), icon: 'success' });
    await load();
    await loadBalance();
  } catch (e: any) {
    uni.hideLoading();
    const msg = String(e?.message || '');
    let key = 'paymentSchedule.payFail';
    if (/already paid/i.test(msg)) key = 'paymentSchedule.alreadyPaid';
    else if (/locked/i.test(msg)) key = 'paymentSchedule.lockedToast';
    else if (/insufficient|余额/i.test(msg)) key = 'paymentSchedule.balanceLow';
    else if (/not payable/i.test(msg)) key = 'paymentSchedule.notPayable';
    uni.showToast({ title: locale.t(key), icon: 'none' });
    await load();
  } finally {
    busy.value = false;
  }
}

function confirmCancel() {
  if (busy.value) return;
  const title = locale.t('paymentSchedule.cancelTitle');
  const content = isLegalDeposit.value
    ? locale.t('paymentSchedule.cancelConfirmDeposit')
    : locale.t('paymentSchedule.cancelConfirmNormal');
  uni.showModal({
    title,
    content,
    confirmText: locale.t('paymentSchedule.cancelConfirm'),
    confirmColor: '#e54d42',
    cancelText: locale.t('paymentSchedule.cancel'),
    success: async (res) => {
      if (!res.confirm) return;
      busy.value = true;
      uni.showLoading({ title: locale.t('paymentSchedule.cancelling'), mask: true });
      try {
        await cancelSchedule(orderId.value, isLegalDeposit.value);
        uni.hideLoading();
        uni.showToast({ title: locale.t('paymentSchedule.cancelOk'), icon: 'none' });
        await load();
      } catch (e: any) {
        uni.hideLoading();
        uni.showToast({ title: e?.message || locale.t('paymentSchedule.cancelFail'), icon: 'none' });
      } finally {
        busy.value = false;
      }
    },
  });
}

function goWallet() {
  payItem.value = null;
  uni.navigateTo({ url: '/pkg-user/pages/wallet' });
}

onLoad(async (options: any) => {
  orderId.value = String(options?.orderId || '');
  orderCode.value = String(options?.code || '');
  if (!orderId.value && options?.code) {
    // 兼容仅传订单号的入口：按 code 反查订单 id
    try {
      const res: any = await getOrderByCode(options.code);
      orderId.value = String(res?.orderByCode?.id || '');
    } catch {}
  }
  if (!orderId.value) { loading.value = false; return; }
  await load();
});
</script>

<style scoped lang="scss">
.ps-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.ps-hero { background: linear-gradient(135deg, #4b5bd7, #8f6cf0); color: #fff; padding: 40rpx 30rpx 34rpx;
  &__row { display: flex; align-items: center; gap: 12rpx; }
  &__ico { font-size: 44rpx; }
  &__title { font-size: 40rpx; font-weight: bold; }
  &__sub { display: block; margin-top: 10rpx; font-size: 24rpx; opacity: .9; }
  &__code { display: block; margin-top: 6rpx; font-size: 22rpx; opacity: .78; }
}
.ps-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 80rpx 0; }
.ps-empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 28rpx; color: $text-color; font-weight: 600; text-align: center; }
  &__hint { font-size: 24rpx; color: $text-color-placeholder; text-align: center; line-height: 1.6; }
}
.ps-sum { margin: 20rpx; padding: 26rpx; background: $surface; border-radius: $radius-md;
  &__head { display: flex; align-items: center; justify-content: space-between; }
  &__scenario { font-size: 28rpx; font-weight: 600; color: $text-color; }
  &__status { font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 999rpx; background: #eef0ff; color: #4b5bd7;
    &--completed { background: #e8f7ee; color: #2f9e44; }
    &--breached { background: #fdecec; color: #e54d42; }
    &--cancelled { background: #f0f0f0; color: #999; }
  }
  &__amount { margin-top: 14rpx; display: flex; align-items: baseline; gap: 8rpx; }
  &__paid { font-size: 44rpx; font-weight: bold; color: #4b5bd7; }
  &__total { font-size: 24rpx; color: $text-color-placeholder; }
  &__ship { display: block; margin-top: 10rpx; font-size: 22rpx; color: $text-color-secondary; }
  &__breach { display: block; margin-top: 8rpx; font-size: 22rpx; color: #e54d42; }
}
.ps-bar { display: flex; align-items: center; gap: 12rpx; margin-top: 12rpx;
  &__track { flex: 1; height: 12rpx; border-radius: 999rpx; background: #e9ecff; overflow: hidden; }
  &__fill { height: 100%; border-radius: 999rpx; background: linear-gradient(90deg, #4b5bd7, #8f6cf0); }
  &__txt { font-size: 20rpx; color: #4b5bd7; flex-shrink: 0; }
}
.ps-list { margin: 0 20rpx; }
.ps-item { background: $surface; border-radius: $radius-md; padding: 24rpx; margin-bottom: 16rpx; border-left: 6rpx solid #d9def0;
  &--paid { border-left-color: #2f9e44; }
  &--payable { border-left-color: #4b5bd7; }
  &--overdue { border-left-color: #e54d42; }
  &--forfeited, &--refunded, &--waived { border-left-color: #bbb; }
  &__row { display: flex; align-items: center; justify-content: space-between; }
  &__l { display: flex; align-items: center; gap: 12rpx; }
  &__seq { font-size: 28rpx; font-weight: 600; color: $text-color; }
  &__kind { font-size: 20rpx; color: #4b5bd7; background: #eef0ff; padding: 2rpx 12rpx; border-radius: 999rpx; }
  &__amount { font-size: 32rpx; font-weight: bold; color: $text-color; }
  &__meta { display: flex; align-items: center; gap: 16rpx; margin-top: 10rpx; flex-wrap: wrap; }
  &__status { font-size: 22rpx; color: $text-color-secondary;
    &.st--paid { color: #2f9e44; }
    &.st--payable { color: #4b5bd7; font-weight: 600; }
    &.st--overdue { color: #e54d42; font-weight: 600; }
    &.st--locked { color: $text-color-placeholder; }
  }
  &__due { font-size: 22rpx; color: $text-color-placeholder; }
  &__late { display: block; margin-top: 8rpx; font-size: 22rpx; color: #e54d42; }
  &__overdue { display: block; margin-top: 6rpx; font-size: 22rpx; color: #e54d42; }
  &__locked { display: block; margin-top: 6rpx; font-size: 22rpx; color: $text-color-placeholder; }
  &__btn { margin: 16rpx 0 0; height: 68rpx; line-height: 68rpx; font-size: 28rpx; color: #fff; background: linear-gradient(135deg, #4b5bd7, #8f6cf0); border-radius: 999rpx; }
}
.ps-cancel { margin: 24rpx 20rpx 0; text-align: center;
  &__btn { height: 72rpx; line-height: 72rpx; font-size: 26rpx; color: #e54d42; background: #fff; border: 1rpx solid #f0c2c0; border-radius: 999rpx; }
  &__hint { display: block; margin-top: 10rpx; font-size: 22rpx; color: $text-color-placeholder; line-height: 1.5; }
}
.ps-note { padding: 24rpx 30rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; line-height: 1.6; }
.ps-mask { position: fixed; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0,0,0,.5); display: flex; align-items: flex-end; z-index: 50; }
.ps-sheet { width: 100%; background: #fff; border-radius: 28rpx 28rpx 0 0; padding: 36rpx 30rpx calc(30rpx + env(safe-area-inset-bottom));
  &__title { display: block; font-size: 32rpx; font-weight: bold; text-align: center; color: $text-color; }
  &__name { display: block; margin-top: 16rpx; font-size: 24rpx; text-align: center; color: $text-color-secondary; }
  &__amount { display: block; margin-top: 10rpx; font-size: 48rpx; font-weight: bold; text-align: center; color: #e54d42; }
  &__balance { display: flex; justify-content: space-between; margin-top: 24rpx; padding: 18rpx 20rpx; background: $bg-color; border-radius: $radius-sm; font-size: 24rpx; color: $text-color-secondary;
    .low { color: #e54d42; }
  }
  &__way { display: flex; align-items: center; gap: 14rpx; margin-top: 20rpx; padding: 24rpx 20rpx; border: 1rpx solid #e5e5e5; border-radius: $radius-sm;
    &.disabled { opacity: .45; }
  }
  &__way-ico { font-size: 34rpx; }
  &__way-txt { flex: 1; font-size: 28rpx; color: $text-color; }
  &__way-arrow { color: $text-color-placeholder; }
  &__recharge { margin-top: 16rpx; text-align: center; font-size: 24rpx; color: #4b5bd7; }
  &__cancel { margin-top: 24rpx; text-align: center; font-size: 28rpx; color: $text-color-secondary; padding: 12rpx 0; }
}
</style>
