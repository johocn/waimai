<template>
  <view class="wal-page">
    <view v-if="!logged" class="wal-empty">
      <text class="wal-empty__ico">🔒</text>
      <text class="wal-empty__text">{{ $t('wallet.loginTip') }}</text>
      <button class="wal-empty__btn" @tap="goLogin">{{ $t('member.loginBtn') }}</button>
    </view>

    <template v-else>
      <view class="wal-hero">
        <text class="wal-hero__label">{{ $t('wallet.balanceLabel') }}</text>
        <text class="wal-hero__amount">¥{{ money(balance) }}</text>
        <text class="wal-hero__frozen" v-if="frozen > 0">{{ $t('wallet.frozenTip').replace('{n}', money(frozen)) }}</text>
        <view class="wal-hero__ops">
          <button class="wal-hero__btn wal-hero__btn--main" @tap="openRecharge">{{ $t('wallet.recharge') }}</button>
          <button class="wal-hero__btn" @tap="openCard">{{ $t('wallet.redeemCard') }}</button>
        </view>
      </view>

      <view class="wal-tabs">
        <text class="wal-tabs__item" :class="{ on: tab === 'tx' }" @tap="switchTab('tx')">{{ $t('wallet.tabTx') }}</text>
        <text class="wal-tabs__item" :class="{ on: tab === 'orders' }" @tap="switchTab('orders')">{{ $t('wallet.tabOrders') }}</text>
      </view>

      <view v-if="loading" class="wal-tip">{{ $t('wallet.loading') }}</view>

      <template v-else-if="tab === 'tx'">
        <view v-if="!txItems.length" class="wal-empty_small">{{ $t('wallet.txEmpty') }}</view>
        <view class="wal-item" v-for="r in txItems" :key="r.id">
          <view class="wal-item__main">
            <text class="wal-item__title">{{ txTitle(r) }}</text>
            <text class="wal-item__time">{{ fmtTime(r.createdAt) }}</text>
            <text class="wal-item__remark" v-if="r.remark && !isBuiltinRemark(r.remark)">{{ r.remark }}</text>
          </view>
          <view class="wal-item__side">
            <text class="wal-item__amount" :class="{ plus: Number(r.amount) > 0 }">
              {{ Number(r.amount) > 0 ? '+' : '' }}{{ money(r.amount) }}
            </text>
            <text class="wal-item__balance">{{ $t('wallet.balanceAfter').replace('{n}', money(r.balanceAfter)) }}</text>
          </view>
        </view>
        <view class="wal-foot" v-if="txItems.length">
          <text v-if="loadingMore">{{ $t('wallet.loadingMore') }}</text>
          <text v-else-if="!hasMore">{{ $t('wallet.noMore') }}</text>
        </view>
      </template>

      <template v-else>
        <view v-if="!rechargeOrders.length" class="wal-empty_small">{{ $t('wallet.orderEmpty') }}</view>
        <view class="wal-item" v-for="o in rechargeOrders" :key="o.id">
          <view class="wal-item__main">
            <text class="wal-item__title">{{ $t('wallet.rechargeOrder') }} ¥{{ money(o.amount) }}</text>
            <text class="wal-item__time">{{ fmtTime(o.createdAt) }}</text>
            <text class="wal-item__remark" v-if="o.remark">{{ o.remark }}</text>
          </view>
          <view class="wal-item__side">
            <text class="wal-item__state" :class="stateClass(o.status)">{{ orderStateLabel(o.status) }}</text>
            <text class="wal-item__pay" v-if="o.status === 'pending'" @tap="payExisting(o.id)">{{ $t('wallet.payNow') }}</text>
          </view>
        </view>
      </template>
    </template>

    <!-- 在线充值 -->
    <view class="wal-mask" v-if="rechargeOpen" @tap="rechargeOpen = false">
      <view class="wal-sheet" @tap.stop>
        <view class="wal-sheet__head">
          <text class="wal-sheet__title">{{ $t('wallet.rechargeTitle') }}</text>
          <text class="wal-sheet__close" @tap="rechargeOpen = false">✕</text>
        </view>
        <view class="wal-amounts">
          <text
            class="wal-amount"
            v-for="v in presets"
            :key="v"
            :class="{ on: amount === v && !customAmount }"
            @tap="pickAmount(v)"
          >¥{{ v }}</text>
        </view>
        <view class="wal-custom">
          <text class="wal-custom__unit">¥</text>
          <input class="wal-custom__ipt" type="digit" v-model="customAmount" :placeholder="$t('wallet.customPh')" @input="onCustomInput" />
        </view>
        <text class="wal-sheet__hint">{{ $t('wallet.rechargeHint') }}</text>
        <button class="wal-sheet__btn" :disabled="paying || !finalAmount" @tap="submitRecharge">
          {{ paying ? $t('wallet.paying') : $t('wallet.payAmount').replace('{n}', money(finalAmount * 100)) }}
        </button>
      </view>
    </view>

    <!-- 充值卡兑换 -->
    <view class="wal-mask" v-if="cardOpen" @tap="cardOpen = false">
      <view class="wal-sheet" @tap.stop>
        <view class="wal-sheet__head">
          <text class="wal-sheet__title">{{ $t('wallet.cardTitle') }}</text>
          <text class="wal-sheet__close" @tap="cardOpen = false">✕</text>
        </view>
        <input class="wal-sheet__ipt" v-model="cardCode" :placeholder="$t('wallet.codePh')" />
        <input class="wal-sheet__ipt" v-model="cardPin" :placeholder="$t('wallet.pinPh')" />
        <text class="wal-sheet__hint">{{ $t('wallet.cardHint') }}</text>
        <button class="wal-sheet__btn" :disabled="cardSaving || !cardCode" @tap="submitCard">
          {{ cardSaving ? $t('wallet.redeeming') : $t('wallet.confirmRedeem') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow, onReachBottom } from '@dcloudio/uni-app';
import {
  getMyBalance, getMyBalanceTransactions, getMyRechargeOrders,
  redeemRechargeCard, createRechargeOrder, createWechatRechargePayment,
} from '../../api/queries/wallet';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';
import { handlePayment } from '../../composables/usePayment';

const PAGE_SIZE = 20;
const PRESETS = [50, 100, 200, 500];
const auth = useAuthStore();
const locale = useLocaleStore();
const logged = computed(() => auth.isLoggedIn);

const balance = ref(0);
const frozen = ref(0);
const tab = ref<'tx' | 'orders'>('tx');
const txItems = ref<any[]>([]);
const txTotal = ref(0);
const rechargeOrders = ref<any[]>([]);
const loading = ref(true);
const loadingMore = ref(false);
const hasMore = computed(() => txItems.value.length < txTotal.value);

const rechargeOpen = ref(false);
const presets = PRESETS;
const amount = ref(100);
const customAmount = ref('');
const paying = ref(false);
const cardOpen = ref(false);
const cardCode = ref('');
const cardPin = ref('');
const cardSaving = ref(false);

/** 充值金额（元）；自定义输入优先 */
const finalAmount = computed(() => {
  const c = Number(customAmount.value);
  if (customAmount.value !== '' && c > 0) return Math.min(Math.round(c * 100) / 100, 50000);
  return amount.value;
});

function money(cents: number | string | null | undefined): string {
  return ((Number(cents) || 0) / 100).toFixed(2);
}

function fmtTime(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TX_TYPES = ['recharge', 'consume', 'refund', 'freeze', 'unfreeze', 'adjust'];
function txTitle(row: any): string {
  const key = TX_TYPES.includes(row?.type) ? row.type : 'adjust';
  return locale.t('wallet.tx_' + key);
}

/** 系统写入的 remark 多为内部编码，不展示给用户 */
function isBuiltinRemark(remark: string): boolean {
  return /^[a-zA-Z0-9_:-]+$/.test(remark);
}

function orderStateLabel(status: string): string {
  if (status === 'paid') return locale.t('wallet.statePaid');
  if (status === 'cancelled') return locale.t('wallet.stateCancelled');
  return locale.t('wallet.statePending');
}

function stateClass(status: string): string {
  if (status === 'paid') return 'ok';
  if (status === 'cancelled') return 'off';
  return 'wait';
}

onShow(() => {
  if (!logged.value) { loading.value = false; return; }
  void loadAll(true);
});

async function loadAll(reset: boolean) {
  if (reset) { loading.value = true; txItems.value = []; txTotal.value = 0; }
  try {
    const [bal, orders] = await Promise.all([
      getMyBalance().catch(() => null),
      getMyRechargeOrders().catch(() => null),
    ]);
    const b: any = (bal as any)?.myBalanceWithFrozen;
    if (b) { balance.value = Number(b.balance) || 0; frozen.value = Number(b.frozenBalance) || 0; }
    rechargeOrders.value = (orders as any)?.myRechargeOrders || [];
    if (tab.value === 'tx') await loadTx(reset);
  } finally {
    loading.value = false;
  }
}

async function loadTx(reset: boolean) {
  if (!reset && (loadingMore.value || !hasMore.value)) return;
  if (!reset) loadingMore.value = true;
  try {
    const res: any = await getMyBalanceTransactions({ take: PAGE_SIZE, skip: reset ? 0 : txItems.value.length });
    const list = res?.myBalanceTransactions?.items || [];
    txTotal.value = Number(res?.myBalanceTransactions?.totalItems) || 0;
    txItems.value = reset ? list : [...txItems.value, ...list];
  } catch {
    if (reset) txTotal.value = 0;
  } finally {
    loadingMore.value = false;
  }
}

onReachBottom(() => { if (tab.value === 'tx') void loadTx(false); });

function switchTab(next: 'tx' | 'orders') {
  if (tab.value === next) return;
  tab.value = next;
  if (next === 'tx' && !txItems.value.length) void loadTx(true);
}

function openRecharge() {
  amount.value = 100;
  customAmount.value = '';
  rechargeOpen.value = true;
}

function onCustomInput(e: any) {
  const raw = String(e?.detail?.value ?? customAmount.value ?? '').replace(/[^\d.]/g, '');
  customAmount.value = raw;
  if (raw && Number(raw) > 0) amount.value = 0;
}

function pickAmount(v: number) {
  amount.value = v;
  customAmount.value = '';
}

function openCard() {
  cardCode.value = '';
  cardPin.value = '';
  cardOpen.value = true;
}

async function submitCard() {
  if (cardSaving.value || !cardCode.value.trim()) return;
  cardSaving.value = true;
  try {
    const res: any = await redeemRechargeCard(cardCode.value.trim(), cardPin.value.trim() || undefined);
    const r = res?.redeemRechargeCard;
    if (!r?.success) throw new Error(locale.t('wallet.redeemFail'));
    uni.showToast({ title: locale.t('wallet.redeemOk').replace('{n}', money(r.faceValue)), icon: 'none' });
    cardOpen.value = false;
    await loadAll(true);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('wallet.redeemFail'), icon: 'none' });
  } finally {
    cardSaving.value = false;
  }
}

async function submitRecharge() {
  if (paying.value || !finalAmount.value) return;
  paying.value = true;
  try {
    const created: any = await createRechargeOrder(Math.round(finalAmount.value * 100));
    const order = created?.createRechargeOrder;
    if (!order?.id) throw new Error(locale.t('wallet.createFail'));
    rechargeOpen.value = false;
    await payOrder(String(order.id));
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('wallet.createFail'), icon: 'none' });
  } finally {
    paying.value = false;
  }
}

async function payExisting(orderId: string) {
  if (paying.value) return;
  paying.value = true;
  try { await payOrder(orderId); }
  finally { paying.value = false; }
}

async function payOrder(orderId: string) {
  const res: any = await createWechatRechargePayment(orderId);
  const pay = res?.createWechatRechargePayment?.pay;
  if (!pay) throw new Error(locale.t('wallet.payFail'));
  const result = await handlePayment('wechatpay', {
    metadata: { public: pay },
    h5Url: pay.payUrl,
    orderCode: res?.createWechatRechargePayment?.outTradeNo,
  });
  if (!result.success) {
    uni.showToast({ title: result.message || locale.t('wallet.payFail'), icon: 'none' });
    return;
  }
  uni.showToast({ title: locale.t('wallet.paySuccess'), icon: 'success' });
  setTimeout(() => { void loadAll(true); }, 1500);
}

function goLogin() { auth.requireLogin(); }
</script>

<style lang="scss" scoped>
.wal-page { min-height: 100vh; background: $bg-color; padding: 20rpx 20rpx 40rpx; box-sizing: border-box; }
.wal-empty {
  min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20rpx;
  &__ico { font-size: 80rpx; }
  &__text { font-size: 28rpx; color: $text-color-placeholder; }
  &__btn { margin-top: 20rpx; background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 28rpx; padding: 0 60rpx; height: 76rpx; line-height: 76rpx; }
}
.wal-empty_small { padding: 100rpx 0; text-align: center; font-size: 26rpx; color: $text-color-placeholder; }
.wal-hero {
  background: linear-gradient(135deg, #ff8a3d, #ff6600); border-radius: 24rpx; padding: 40rpx 36rpx; color: #fff;
  &__label { font-size: 26rpx; opacity: .9; }
  &__amount { display: block; font-size: 66rpx; font-weight: bold; margin-top: 12rpx; letter-spacing: 1rpx; }
  &__frozen { display: block; font-size: 22rpx; opacity: .85; margin-top: 8rpx; }
  &__ops { display: flex; gap: 20rpx; margin-top: 32rpx; }
  &__btn { flex: 1; height: 76rpx; line-height: 76rpx; border-radius: 999rpx; font-size: 28rpx; background: rgba(255,255,255,.18); color: #fff; border: 1rpx solid rgba(255,255,255,.5); }
  &__btn--main { background: #fff; color: $brand-color; border-color: #fff; font-weight: bold; }
}
.wal-tabs {
  display: flex; gap: 40rpx; padding: 30rpx 10rpx 16rpx;
  &__item { font-size: 30rpx; color: $text-color-secondary; position: relative; padding-bottom: 10rpx; &.on { color: $text-color; font-weight: bold; } &.on::after { content: ''; position: absolute; left: 50%; bottom: 0; width: 40rpx; height: 6rpx; border-radius: 3rpx; background: $brand-color; transform: translateX(-50%); } }
}
.wal-tip { padding: 80rpx 0; text-align: center; font-size: 26rpx; color: $text-color-placeholder; }
.wal-item {
  display: flex; align-items: flex-start; gap: 20rpx; background: $surface; border-radius: $radius-md; padding: 26rpx; margin-bottom: 16rpx;
  &__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
  &__title { font-size: 28rpx; color: $text-color; }
  &__time { font-size: 22rpx; color: $text-color-placeholder; }
  &__remark { font-size: 22rpx; color: $text-color-secondary; }
  &__side { display: flex; flex-direction: column; align-items: flex-end; gap: 8rpx; }
  &__amount { font-size: 30rpx; font-weight: bold; color: $text-color; &.plus { color: $brand-color; } }
  &__balance { font-size: 22rpx; color: $text-color-placeholder; }
  &__state { font-size: 24rpx; &.ok { color: #1f9d55; } &.wait { color: $brand-color; } &.off { color: $text-color-placeholder; } }
  &__pay { font-size: 24rpx; color: #fff; background: $brand-color; padding: 8rpx 24rpx; border-radius: 999rpx; }
}
.wal-foot { padding: 24rpx 0 40rpx; text-align: center; font-size: 24rpx; color: $text-color-placeholder; }
.wal-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: flex-end; z-index: 20; }
.wal-sheet {
  width: 100%; background: $surface; border-radius: 24rpx 24rpx 0 0; padding: 36rpx 30rpx calc(36rpx + env(safe-area-inset-bottom));
  &__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28rpx; }
  &__title { font-size: 32rpx; font-weight: bold; }
  &__close { font-size: 32rpx; color: $text-color-placeholder; padding: 0 10rpx; }
  &__ipt { height: 88rpx; border-bottom: 1rpx solid $border-color; font-size: 30rpx; margin-bottom: 6rpx; }
  &__hint { display: block; font-size: 22rpx; color: $text-color-placeholder; margin: 20rpx 0 28rpx; }
  &__btn { height: 88rpx; line-height: 88rpx; background: $brand-color; color: #fff; border-radius: $radius-md; font-size: 30rpx; &[disabled] { opacity: .5; } }
}
.wal-amounts { display: flex; flex-wrap: wrap; gap: 20rpx; }
.wal-amount {
  width: calc(50% - 10rpx); height: 90rpx; line-height: 90rpx; text-align: center; border-radius: $radius-md;
  background: $bg-color; border: 2rpx solid transparent; font-size: 32rpx; font-weight: bold;
  &.on { border-color: $brand-color; color: $brand-color; background: $brand-soft; }
}
.wal-custom {
  display: flex; align-items: center; gap: 10rpx; margin-top: 22rpx; border-bottom: 1rpx solid $border-color;
  &__unit { font-size: 32rpx; color: $text-color-secondary; }
  &__ipt { flex: 1; height: 88rpx; font-size: 32rpx; }
}
</style>
