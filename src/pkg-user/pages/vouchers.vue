<template>
  <view class="vc-page">
    <view class="vc-hero">
      <text class="vc-hero__ico">🎫</text>
      <text class="vc-hero__title">{{ $t('voucher.title') }}</text>
      <text class="vc-hero__sub">{{ $t('voucher.sub') }}</text>
    </view>

    <view class="vc-tabs">
      <text v-for="t in tabs" :key="t.key" class="vc-tab" :class="{ on: tab === t.key }" @tap="tab = t.key">
        {{ $t(t.label) }}<text class="vc-tab__n" v-if="t.key === 'active' && activeList.length"> {{ activeList.length }}</text>
      </text>
    </view>

    <view v-if="!logged" class="vc-empty">
      <text class="vc-empty__ico">🔒</text>
      <text class="vc-empty__text">{{ $t('voucher.needLogin') }}</text>
      <button class="vc-login" @tap="goLogin">{{ $t('voucher.login') }}</button>
    </view>

    <view v-else-if="loading" class="vc-tip">{{ $t('voucher.loading') }}</view>
    <view v-else-if="!list.length" class="vc-empty">
      <text class="vc-empty__ico">🎫</text>
      <text class="vc-empty__text">{{ emptyText }}</text>
    </view>

    <view v-for="v in list" :key="v.id" class="vc-card" :class="{ off: tab !== 'active' }">
      <view class="vc-card__left">
        <text class="vc-card__name">{{ v.productVoucherName }}</text>
        <text class="vc-card__no">{{ $t('voucher.codeLabel') }}</text>
        <text class="vc-card__code" @tap="copyCode(v.code)">{{ v.code }}</text>
        <text class="vc-card__expire">{{ expireText(v) }}</text>
      </view>
      <view class="vc-card__right">
        <text class="vc-card__st" :class="'vc-card__st--' + v.status">{{ statusLabel(v.status) }}</text>
        <text v-if="tab === 'active'" class="vc-card__use">{{ $t('voucher.useHint') }}</text>
      </view>
    </view>

    <view class="vc-note">{{ $t('voucher.note') }}</view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getMyVouchers } from '../../api/queries/voucher';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();

const loading = ref(true);
const tab = ref<'active' | 'used' | 'expired' | 'refunded'>('active');
const vouchers = ref<any[]>([]);

const tabs = [
  { key: 'active', label: 'voucher.tabActive' },
  { key: 'used', label: 'voucher.tabUsed' },
  { key: 'expired', label: 'voucher.tabExpired' },
  { key: 'refunded', label: 'voucher.tabRefunded' },
] as const;

const logged = computed(() => auth.isLoggedIn);

const statusGroup = (s: string) => {
  if (s === 'used') return 'used';
  if (s === 'expired') return 'expired';
  if (s === 'refunded' || s === 'voided') return 'refunded';
  return 'active';
};
const activeList = computed(() => vouchers.value.filter(v => statusGroup(v.status) === 'active'));
const list = computed(() => vouchers.value.filter(v => statusGroup(v.status) === tab.value));
const emptyText = computed(() => locale.t(`voucher.empty${tab.value.charAt(0).toUpperCase() + tab.value.slice(1)}`));

const statusLabels: Record<string, string> = {
  active: 'stActive',
  used: 'stUsed',
  expired: 'stExpired',
  refunded: 'stRefunded',
  voided: 'stVoided',
};
function statusLabel(s: string) {
  const k = statusLabels[s];
  return k ? locale.t(`voucher.${k}`) : s;
}
function fmtDate(v: string) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function expireText(v: any) {
  if (v.usedAt) return locale.t('voucher.usedAt').replace('{t}', fmtDate(v.usedAt));
  if (v.refundedAt) return locale.t('voucher.refundedAt').replace('{t}', fmtDate(v.refundedAt));
  if (v.expiresAt) return locale.t('voucher.expiresAt').replace('{t}', fmtDate(v.expiresAt));
  return locale.t('voucher.effectiveDays').replace('{n}', String(v.effectiveDays || 0));
}

async function load() {
  if (!auth.isLoggedIn) { vouchers.value = []; loading.value = false; return; }
  loading.value = true;
  try {
    vouchers.value = (await getMyVouchers()) || [];
  } catch (e) {
    console.warn('[vouchers] load failed', e);
    vouchers.value = [];
  } finally {
    loading.value = false;
  }
}

function goLogin() { auth.requireLogin(); }

function copyCode(code: string) {
  uni.setClipboardData({
    data: code,
    success: () => uni.showToast({ title: locale.t('voucher.copied'), icon: 'none' }),
  });
}

onShow(() => { void load(); });
</script>

<style scoped lang="scss">
.vc-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.vc-hero { background: linear-gradient(135deg, #2f7d6f, #4bb59a); color: #fff; padding: 40rpx 30rpx 34rpx;
  &__ico { font-size: 44rpx; }
  &__title { display: block; margin-top: 6rpx; font-size: 40rpx; font-weight: bold; }
  &__sub { display: block; margin-top: 10rpx; font-size: 24rpx; opacity: .92; }
}
.vc-tabs { display: flex; background: $surface; padding: 0 10rpx; }
.vc-tab { flex: 1; text-align: center; padding: 24rpx 0; font-size: 26rpx; color: $text-color-secondary; position: relative;
  &.on { color: #2f7d6f; font-weight: 600;
    &::after { content: ''; position: absolute; left: 50%; bottom: 6rpx; transform: translateX(-50%); width: 44rpx; height: 6rpx; border-radius: 999rpx; background: #2f7d6f; }
  }
  &__n { font-size: 20rpx; }
}
.vc-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 70rpx 0; }
.vc-empty { display: flex; flex-direction: column; align-items: center; padding: 110rpx 40rpx; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
}
.vc-login { margin-top: 16rpx; height: 80rpx; line-height: 80rpx; padding: 0 60rpx; font-size: 28rpx; color: #fff; background: linear-gradient(135deg, #2f7d6f, #4bb59a); border-radius: 999rpx; }
.vc-card { display: flex; gap: 16rpx; margin: 20rpx; padding: 24rpx; background: $surface; border-radius: $radius-md; border-left: 8rpx solid #4bb59a;
  &.off { border-left-color: #d9d9d9; opacity: .78; }
  &__left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
  &__name { font-size: 30rpx; font-weight: 600; color: $text-color; }
  &__no { font-size: 20rpx; color: $text-color-placeholder; margin-top: 4rpx; }
  &__code { font-size: 30rpx; font-weight: bold; letter-spacing: 2rpx; color: #2f7d6f; font-family: monospace; }
  &__expire { font-size: 22rpx; color: $text-color-secondary; }
  &__right { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 8rpx; }
  &__st { font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 999rpx; background: #f0f0f0; color: #999;
    &--active { background: #e8f6f2; color: #2f7d6f; }
    &--used { background: #eef0ff; color: #4b5bd7; }
    &--expired, &--voided { background: #f0f0f0; color: #999; }
    &--refunded { background: #fff3e8; color: #d98300; }
  }
  &__use { font-size: 20rpx; color: $text-color-placeholder; text-align: right; }
}
.vc-note { padding: 24rpx 30rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; line-height: 1.6; }
</style>
