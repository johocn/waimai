<template>
  <view class="dt-page">
    <view v-if="!logged" class="dt-empty">
      <text class="dt-empty__ico">📣</text>
      <text class="dt-empty__text">{{ $t('distribution.needLogin') }}</text>
      <button class="dt-empty__btn" @tap="doLogin">{{ $t('distribution.login') }}</button>
    </view>

    <view v-else-if="loading" class="dt-tip">{{ $t('distribution.loading') }}</view>

    <!-- 未申请：申请卡片 -->
    <template v-else-if="!profile">
      <view class="dt-apply">
        <text class="dt-apply__ico">🤝</text>
        <text class="dt-apply__title">{{ $t('distribution.applyTitle') }}</text>
        <text class="dt-apply__desc">{{ $t('distribution.applyDesc') }}</text>
        <view class="dt-apply__perks">
          <view class="dt-apply__perk"><text>①</text><text>{{ $t('distribution.perk1') }}</text></view>
          <view class="dt-apply__perk"><text>②</text><text>{{ $t('distribution.perk2') }}</text></view>
          <view class="dt-apply__perk"><text>③</text><text>{{ $t('distribution.perk3') }}</text></view>
        </view>
        <input class="dt-apply__input" v-model="referredBy" :placeholder="$t('distribution.referrerPh')" maxlength="20" />
        <button class="dt-apply__btn" :disabled="applying" @tap="apply">
          {{ applying ? $t('distribution.applying') : $t('distribution.applyBtn') }}
        </button>
        <text class="dt-apply__hint">{{ $t('distribution.applyHint') }}</text>
      </view>
    </template>

    <template v-else>
      <view class="dt-hero">
        <view class="dt-hero__top">
          <text class="dt-hero__title">{{ $t('distribution.heroTitle') }}</text>
          <text class="dt-hero__status" :class="'dt-hero__status--' + profile.status">{{ statusText }}</text>
        </view>
        <view class="dt-hero__earn">
          <text class="dt-hero__label">{{ $t('distribution.available') }}</text>
          <text class="dt-hero__amount">¥{{ money(profile.availableBalance) }}</text>
        </view>
        <view class="dt-hero__row">
          <view class="dt-hero__cell">
            <text class="dt-hero__cell-num">¥{{ money(profile.totalEarnings) }}</text>
            <text class="dt-hero__cell-lbl">{{ $t('distribution.totalEarnings') }}</text>
          </view>
          <view class="dt-hero__cell">
            <text class="dt-hero__cell-num">¥{{ money(profile.frozenBalance) }}</text>
            <text class="dt-hero__cell-lbl">{{ $t('distribution.frozen') }}</text>
          </view>
        </view>
      </view>

      <view class="dt-code">
        <view class="dt-code__info">
          <text class="dt-code__label">{{ $t('distribution.myCode') }}</text>
          <text class="dt-code__value">{{ profile.referralCode }}</text>
        </view>
        <view class="dt-code__btns">
          <text class="dt-code__btn" @tap="copyCode">{{ $t('distribution.copyCode') }}</text>
          <text class="dt-code__btn dt-code__btn--solid" @tap="share">{{ $t('distribution.share') }}</text>
        </view>
      </view>

      <view class="dt-team">
        <text class="dt-team__title">{{ $t('distribution.teamTitle') }}</text>
        <view class="dt-team__grid">
          <view class="dt-team__cell"><text class="dt-team__num">{{ team.directTeamSize }}</text><text class="dt-team__lbl">{{ $t('distribution.direct') }}</text></view>
          <view class="dt-team__cell"><text class="dt-team__num">{{ team.indirectTeamSize }}</text><text class="dt-team__lbl">{{ $t('distribution.indirect') }}</text></view>
          <view class="dt-team__cell"><text class="dt-team__num">{{ team.totalTeamSize }}</text><text class="dt-team__lbl">{{ $t('distribution.totalTeam') }}</text></view>
        </view>
        <view class="dt-team__grid">
          <view class="dt-team__cell"><text class="dt-team__num">{{ team.orderCount }}</text><text class="dt-team__lbl">{{ $t('distribution.orderCount') }}</text></view>
          <view class="dt-team__cell"><text class="dt-team__num">¥{{ money(team.orderAmount) }}</text><text class="dt-team__lbl">{{ $t('distribution.orderAmount') }}</text></view>
          <view class="dt-team__cell"><text class="dt-team__num">¥{{ money(team.teamCommission) }}</text><text class="dt-team__lbl">{{ $t('distribution.teamCommission') }}</text></view>
        </view>
      </view>

      <view class="dt-tabs">
        <text class="dt-tab" :class="{ on: tab === 'commission' }" @tap="tab = 'commission'">{{ $t('distribution.tabCommission') }}</text>
        <text class="dt-tab" :class="{ on: tab === 'withdrawal' }" @tap="tab = 'withdrawal'">{{ $t('distribution.tabWithdrawal') }}</text>
      </view>

      <template v-if="tab === 'commission'">
        <view v-if="!commissions.length" class="dt-empty dt-empty--inline">
          <text class="dt-empty__ico">💼</text>
          <text class="dt-empty__text">{{ $t('distribution.noCommission') }}</text>
        </view>
        <view v-for="c in commissions" :key="c.id" class="dt-card">
          <view class="dt-card__top">
            <text class="dt-card__type">{{ c.commissionType === 'direct' ? $t('distribution.typeDirect') : $t('distribution.typeIndirect') }}</text>
            <text class="dt-card__status" :class="'dt-card__status--' + c.status">{{ commissionStatus(c.status) }}</text>
          </view>
          <view class="dt-card__amount">+¥{{ money(c.commissionAmount) }}</view>
          <view class="dt-card__meta">
            <text>{{ $t('distribution.orderNo') }}{{ c.orderId }}</text>
            <text>{{ $t('distribution.fromAmount').replace('{n}', money(c.orderAmount)) }}</text>
          </view>
          <view class="dt-card__meta">
            <text>{{ $t('distribution.rate').replace('{n}', rateText(c.commissionRate)) }}</text>
            <text>{{ fmtDate(c.createdAt) }}</text>
          </view>
        </view>
      </template>

      <template v-else>
        <view class="dt-withdraw">
          <button class="dt-withdraw__btn" @tap="openWithdraw">{{ $t('distribution.withdraw') }}</button>
          <text class="dt-withdraw__hint">{{ $t('distribution.withdrawHint') }}</text>
        </view>
        <view v-if="!withdrawals.length" class="dt-empty dt-empty--inline">
          <text class="dt-empty__ico">🏦</text>
          <text class="dt-empty__text">{{ $t('distribution.noWithdrawal') }}</text>
        </view>
        <view v-for="w in withdrawals" :key="w.id" class="dt-card">
          <view class="dt-card__top">
            <text class="dt-card__type">{{ methodText(w.method) }}</text>
            <text class="dt-card__status" :class="'dt-card__status--' + w.status">{{ withdrawalStatus(w.status) }}</text>
          </view>
          <view class="dt-card__amount">¥{{ money(w.amount) }}</view>
          <view class="dt-card__meta">
            <text>{{ $t('distribution.applyAt') }}{{ fmtDate(w.createdAt) }}</text>
            <text v-if="w.paidAt">{{ $t('distribution.paidAt') }}{{ fmtDate(w.paidAt) }}</text>
          </view>
        </view>
      </template>

      <view class="dt-note">{{ $t('distribution.note') }}</view>
    </template>

    <!-- 提现弹层 -->
    <view class="dt-mask" v-if="withdrawOpen" @tap="closeWithdraw">
      <view class="dt-sheet" @tap.stop>
        <text class="dt-sheet__title">{{ $t('distribution.withdrawTitle') }}</text>
        <text class="dt-sheet__avail">{{ $t('distribution.available') }} ¥{{ money(profile?.availableBalance) }}</text>
        <input class="dt-sheet__input" v-model="amountYuan" type="digit" :placeholder="$t('distribution.amountPh')" />
        <view class="dt-sheet__methods">
          <text v-for="m in METHODS" :key="m.key" class="dt-sheet__method" :class="{ on: method === m.key }" @tap="method = m.key">{{ $t(m.label) }}</text>
        </view>
        <input class="dt-sheet__input" v-model="accountInfo" :placeholder="$t('distribution.accountPh')" />
        <button class="dt-sheet__submit" :disabled="submitting" @tap="submitWithdraw">
          {{ submitting ? $t('distribution.submitting') : $t('distribution.submit') }}
        </button>
        <text class="dt-sheet__cancel" @tap="closeWithdraw">{{ $t('distribution.cancel') }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import {
  getMyDistributorProfile,
  getMyCommissionRecords,
  getMyWithdrawalRequests,
  getMyTeamSummary,
  applyDistributor,
  requestWithdrawal,
} from '../../api/queries/distribution';
import { sharePage } from '../../utils/share';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const METHODS = [
  { key: 'alipay', label: 'distribution.methodAlipay' },
  { key: 'wechat', label: 'distribution.methodWechat' },
  { key: 'bank', label: 'distribution.methodBank' },
];

const auth = useAuthStore();
const locale = useLocaleStore();

const logged = computed(() => auth.isLoggedIn);
const loading = ref(true);
const applying = ref(false);
const submitting = ref(false);
const profile = ref<any>(null);
const team = ref<any>({
  directTeamSize: 0,
  indirectTeamSize: 0,
  totalTeamSize: 0,
  orderCount: 0,
  orderAmount: 0,
  teamCommission: 0,
});
const commissions = ref<any[]>([]);
const withdrawals = ref<any[]>([]);
const tab = ref<'commission' | 'withdrawal'>('commission');
const referredBy = ref('');
const withdrawOpen = ref(false);
const amountYuan = ref('');
const method = ref('alipay');
const accountInfo = ref('');

const statusText = computed(() => {
  const s = profile.value?.status;
  if (s === 'active') return locale.t('distribution.statusActive');
  if (s === 'frozen') return locale.t('distribution.statusFrozen');
  return locale.t('distribution.statusPending');
});

function money(fen: number | string | undefined): string {
  return (Number(fen || 0) / 100).toFixed(2);
}

/** 佣金比例后端按万分比存（1000 = 10%），前端换算成百分数展示 */
function rateText(bp: number | string): string {
  const pct = Number(bp || 0) / 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/0$/, '');
}

function fmtDate(at?: string) {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function commissionStatus(s: string) {
  return locale.t(`distribution.cStatus${s.charAt(0).toUpperCase()}${s.slice(1)}`);
}

function withdrawalStatus(s: string) {
  return locale.t(`distribution.wStatus${s.charAt(0).toUpperCase()}${s.slice(1)}`);
}

function methodText(m: string) {
  if (m === 'bank') return locale.t('distribution.methodBank');
  if (m === 'wechat') return locale.t('distribution.methodWechat');
  return locale.t('distribution.methodAlipay');
}

async function load() {
  if (!logged.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    profile.value = await getMyDistributorProfile();
    if (!profile.value) {
      commissions.value = [];
      withdrawals.value = [];
      return;
    }
    const [teamRes, records, requests] = await Promise.allSettled([
      getMyTeamSummary(),
      getMyCommissionRecords(),
      getMyWithdrawalRequests(),
    ]);
    if (teamRes.status === 'fulfilled') team.value = teamRes.value;
    commissions.value = records.status === 'fulfilled' ? (records.value.items || []) : [];
    withdrawals.value = requests.status === 'fulfilled' ? (requests.value.items || []) : [];
  } catch (e) {
    console.warn('[distribution] load failed', e);
    profile.value = null;
  } finally {
    loading.value = false;
  }
}

async function apply() {
  if (applying.value) return;
  applying.value = true;
  try {
    await applyDistributor(referredBy.value.trim() || undefined);
    uni.showToast({ title: locale.t('distribution.applyOk'), icon: 'none' });
    await load();
  } catch (e: any) {
    const msg = String(e?.message || '');
    const key = /already/i.test(msg) ? 'distribution.applyAlready' : 'distribution.applyFail';
    uni.showToast({ title: locale.t(key), icon: 'none' });
  } finally {
    applying.value = false;
  }
}

function copyCode() {
  uni.setClipboardData({
    data: profile.value?.referralCode || '',
    success: () => uni.showToast({ title: locale.t('distribution.copied'), icon: 'none' }),
  });
}

async function share() {
  if (!profile.value?.referralCode) return;
  const channel = await sharePage({
    title: locale.t('distribution.shareTitle'),
    desc: locale.t('distribution.shareDesc'),
    path: `/pkg-user/pages/distribution?ref=${encodeURIComponent(profile.value.referralCode)}`,
  });
  if (channel === 'copy') {
    uni.showToast({ title: locale.t('distribution.copied'), icon: 'none' });
  }
}

function openWithdraw() {
  amountYuan.value = '';
  accountInfo.value = '';
  method.value = 'alipay';
  withdrawOpen.value = true;
}

function closeWithdraw() {
  withdrawOpen.value = false;
}

async function submitWithdraw() {
  if (submitting.value) return;
  const yuan = Number(amountYuan.value);
  const fen = Math.round(yuan * 100);
  const available = Number(profile.value?.availableBalance || 0);
  if (!Number.isFinite(fen) || fen <= 0) {
    uni.showToast({ title: locale.t('distribution.amountInvalid'), icon: 'none' });
    return;
  }
  if (fen > available) {
    uni.showToast({ title: locale.t('distribution.amountTooMuch'), icon: 'none' });
    return;
  }
  if (!accountInfo.value.trim()) {
    uni.showToast({ title: locale.t('distribution.accountRequired'), icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    await requestWithdrawal(fen, method.value, accountInfo.value.trim());
    uni.showToast({ title: locale.t('distribution.withdrawOk'), icon: 'none' });
    withdrawOpen.value = false;
    tab.value = 'withdrawal';
    await load();
  } catch (e: any) {
    const msg = String(e?.message || '');
    const key = /minimum/i.test(msg)
      ? 'distribution.belowMin'
      : /balance/i.test(msg)
        ? 'distribution.amountTooMuch'
        : 'distribution.withdrawFail';
    uni.showToast({ title: locale.t(key), icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

function doLogin() {
  auth.requireLogin();
}

onLoad((options: any) => {
  const ref_code = options?.ref || options?.invite_code || options?.code;
  if (ref_code) referredBy.value = String(ref_code);
});

onShow(() => {
  void load();
});
</script>

<style scoped lang="scss">
.dt-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.dt-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 120rpx 0; }
.dt-empty { display: flex; flex-direction: column; align-items: center; padding: 140rpx 40rpx; gap: 16rpx;
  &--inline { padding: 80rpx 40rpx; }
  &__ico { font-size: 76rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
  &__btn { margin-top: 16rpx; background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; padding: 0 48rpx; height: 76rpx; line-height: 76rpx; }
}
.dt-apply { margin: 24rpx; background: $surface; border-radius: $radius-md; padding: 40rpx 30rpx; display: flex; flex-direction: column; align-items: center;
  &__ico { font-size: 72rpx; }
  &__title { margin-top: 16rpx; font-size: 34rpx; font-weight: 600; color: $text-color; }
  &__desc { margin-top: 10rpx; font-size: 24rpx; color: $text-color-secondary; text-align: center; line-height: 1.6; }
  &__perks { width: 100%; margin-top: 24rpx; display: flex; flex-direction: column; gap: 12rpx; }
  &__perk { display: flex; gap: 10rpx; font-size: 24rpx; color: $text-color-secondary; }
  &__input { width: 100%; margin-top: 24rpx; height: 84rpx; background: $bg-color; border-radius: $radius-sm; padding: 0 20rpx; font-size: 26rpx; box-sizing: border-box; }
  &__btn { width: 100%; margin-top: 20rpx; height: 88rpx; line-height: 88rpx; background: linear-gradient(135deg, #ff6600, #ff9838); color: #fff; font-size: 30rpx; font-weight: 600; border-radius: $radius-md; }
  &__hint { margin-top: 14rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; }
}
.dt-hero { background: linear-gradient(135deg, #ff6600, #ff9838); color: #fff; padding: 34rpx 30rpx;
  &__top { display: flex; align-items: center; justify-content: space-between; }
  &__title { font-size: 34rpx; font-weight: 600; }
  &__status { font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 999rpx; background: rgba(255,255,255,.24);
    &--active { background: rgba(255,255,255,.28); }
    &--frozen { background: rgba(0,0,0,.18); }
  }
  &__earn { margin-top: 24rpx; display: flex; flex-direction: column; gap: 6rpx; }
  &__label { font-size: 24rpx; opacity: .9; }
  &__amount { font-size: 64rpx; font-weight: bold; }
  &__row { display: flex; gap: 20rpx; margin-top: 24rpx; }
  &__cell { flex: 1; background: rgba(255,255,255,.16); border-radius: $radius-sm; padding: 16rpx 20rpx; display: flex; flex-direction: column; gap: 4rpx; }
  &__cell-num { font-size: 30rpx; font-weight: 600; }
  &__cell-lbl { font-size: 22rpx; opacity: .9; }
}
.dt-code { margin: 20rpx; background: $surface; border-radius: $radius-md; padding: 24rpx; display: flex; align-items: center; justify-content: space-between;
  &__info { display: flex; flex-direction: column; gap: 6rpx; }
  &__label { font-size: 22rpx; color: $text-color-secondary; }
  &__value { font-size: 40rpx; font-weight: bold; color: $brand-color; letter-spacing: 4rpx; }
  &__btns { display: flex; gap: 12rpx; }
  &__btn { font-size: 24rpx; color: $brand-color; padding: 10rpx 20rpx; border: 2rpx solid $brand-color; border-radius: 999rpx;
    &--solid { background: $brand-color; color: #fff; }
  }
}
.dt-team { margin: 0 20rpx 20rpx; background: $surface; border-radius: $radius-md; padding: 24rpx;
  &__title { font-size: 28rpx; font-weight: 600; color: $text-color; }
  &__grid { display: flex; margin-top: 16rpx; }
  &__cell { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4rpx; }
  &__num { font-size: 30rpx; font-weight: 600; color: $text-color; }
  &__lbl { font-size: 22rpx; color: $text-color-secondary; }
}
.dt-tabs { display: flex; margin: 0 20rpx; background: $surface; border-radius: $radius-md; padding: 8rpx; }
.dt-tab { flex: 1; text-align: center; font-size: 26rpx; color: $text-color-secondary; padding: 14rpx 0; border-radius: $radius-sm;
  &.on { background: $brand-color-light; color: $brand-color; font-weight: 600; }
}
.dt-withdraw { margin: 20rpx; background: $surface; border-radius: $radius-md; padding: 24rpx; text-align: center;
  &__btn { height: 80rpx; line-height: 80rpx; background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; }
  &__hint { display: block; margin-top: 10rpx; font-size: 22rpx; color: $text-color-placeholder; }
}
.dt-card { margin: 0 20rpx 16rpx; background: $surface; border-radius: $radius-md; padding: 24rpx;
  &__top { display: flex; align-items: center; justify-content: space-between; }
  &__type { font-size: 26rpx; font-weight: 600; color: $text-color; }
  &__status { font-size: 22rpx; padding: 2rpx 12rpx; border-radius: 999rpx; background: #f2f2f2; color: $text-color-secondary;
    &--confirmed, &--paid, &--approved { background: #e8f7ec; color: #1a9d4b; }
    &--pending { background: #fff5e6; color: #d98300; }
    &--cancelled, &--rejected { background: #fdecec; color: #d64545; }
  }
  &__amount { margin-top: 10rpx; font-size: 38rpx; font-weight: bold; color: $brand-color; }
  &__meta { margin-top: 8rpx; display: flex; justify-content: space-between; font-size: 22rpx; color: $text-color-placeholder; }
}
.dt-note { padding: 24rpx 30rpx; text-align: center; font-size: 22rpx; color: $text-color-placeholder; line-height: 1.6; }
.dt-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: flex-end; z-index: 20; }
.dt-sheet { width: 100%; background: $surface; border-radius: $radius-md $radius-md 0 0; padding: 32rpx 30rpx 44rpx; display: flex; flex-direction: column; gap: 16rpx;
  &__title { font-size: 30rpx; font-weight: 600; color: $text-color; text-align: center; }
  &__avail { font-size: 24rpx; color: $text-color-secondary; text-align: center; }
  &__input { height: 84rpx; background: $bg-color; border-radius: $radius-sm; padding: 0 20rpx; font-size: 28rpx; }
  &__methods { display: flex; gap: 16rpx; }
  &__method { flex: 1; text-align: center; font-size: 24rpx; padding: 14rpx 0; border-radius: $radius-sm; background: $bg-color; color: $text-color-secondary; border: 2rpx solid transparent;
    &.on { border-color: $brand-color; color: $brand-color; background: $brand-color-light; }
  }
  &__submit { width: 100%; height: 88rpx; line-height: 88rpx; background: $brand-color; color: #fff; font-size: 30rpx; border-radius: $radius-md; }
  &__cancel { text-align: center; font-size: 26rpx; color: $text-color-secondary; padding: 10rpx 0; }
}
</style>
