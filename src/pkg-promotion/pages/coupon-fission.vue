<template>
  <view class="fi-page">
    <view v-if="loading" class="fi-tip">{{ $t('fission.loading') }}</view>

    <view v-else-if="!activity" class="fi-empty">
      <text class="fi-empty__ico">🤝</text>
      <text class="fi-empty__text">{{ $t('fission.empty') }}</text>
      <button class="fi-empty__btn" @tap="goCoupons">{{ $t('fission.goCoupons') }}</button>
    </view>

    <template v-else>
      <view class="fi-hero">
        <text class="fi-hero__title">{{ activity.name }}</text>
        <text v-if="activity.subtitle" class="fi-hero__sub">{{ activity.subtitle }}</text>
        <text class="fi-hero__clock">{{ leftText }}</text>
      </view>

      <view v-if="activity.rules" class="fi-rules">
        <text class="fi-rules__title">{{ $t('fission.rulesTitle') }}</text>
        <text class="fi-rules__body">{{ activity.rules }}</text>
      </view>

      <view class="fi-rewards">
        <view class="fi-reward" v-if="activity.inviteeTemplate">
          <text class="fi-reward__tag">{{ $t('fission.inviteeTag') }}</text>
          <view class="fi-reward__amount">
            <text class="fi-reward__symbol" v-if="isYuan(activity.inviteeTemplate)">¥</text>
            <text class="fi-reward__num">{{ amountText(activity.inviteeTemplate) }}</text>
            <text class="fi-reward__unit" v-if="activity.inviteeTemplate.type === 'PERCENT'">{{ $t('fission.unitPercent') }}</text>
          </view>
          <text class="fi-reward__cond">{{ condText(activity.inviteeTemplate) }}</text>
          <text class="fi-reward__name">{{ activity.inviteeTemplate.name }}</text>
        </view>
        <view class="fi-reward fi-reward--inviter" v-if="activity.inviterTemplate">
          <text class="fi-reward__tag">{{ $t('fission.inviterTag') }}</text>
          <view class="fi-reward__amount">
            <text class="fi-reward__symbol" v-if="isYuan(activity.inviterTemplate)">¥</text>
            <text class="fi-reward__num">{{ amountText(activity.inviterTemplate) }}</text>
            <text class="fi-reward__unit" v-if="activity.inviterTemplate.type === 'PERCENT'">{{ $t('fission.unitPercent') }}</text>
          </view>
          <text class="fi-reward__cond">{{ condText(activity.inviterTemplate) }}</text>
          <text class="fi-reward__name">{{ activity.inviterTemplate.name }}</text>
        </view>
      </view>

      <view class="fi-claim">
        <text class="fi-claim__title">{{ $t('fission.claimTitle') }}</text>
        <input
          class="fi-claim__input"
          v-model="inviteCode"
          :placeholder="$t('fission.codePlaceholder')"
          maxlength="20"
        />
        <button class="fi-claim__btn" :disabled="claiming" @tap="claim">
          {{ claiming ? $t('fission.claiming') : $t('fission.claim') }}
        </button>
        <text class="fi-claim__hint">{{ $t('fission.claimHint') }}</text>
      </view>

      <view class="fi-mine" v-if="myCode">
        <text class="fi-mine__label">{{ $t('fission.myCode') }}</text>
        <text class="fi-mine__code">{{ myCode }}</text>
        <view class="fi-mine__btns">
          <button class="fi-mine__btn fi-mine__btn--ghost" @tap="copyCode">{{ $t('fission.copyCode') }}</button>
          <button class="fi-mine__btn" @tap="share">{{ $t('fission.share') }}</button>
        </view>
        <text class="fi-mine__hint">{{ $t('fission.myCodeHint') }}</text>
      </view>

      <view class="fi-note">{{ $t('fission.note') }}</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { getCouponFissionActivity, claimFissionReward, fissionInviteCodeOf } from '../../api/queries/fission';
import { getActiveCustomer } from '../../api/queries/user';
import { sharePage } from '../../utils/share';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();

const loading = ref(true);
const claiming = ref(false);
const activity = ref<any>(null);
const inviteCode = ref('');
const myCode = ref('');
const now = ref(Date.now());
let timer: any = null;

const leftText = computed(() => {
  const endsAt = activity.value?.endsAt;
  if (!endsAt) return '';
  const left = Math.max(0, new Date(endsAt).getTime() - now.value);
  if (left <= 0) return locale.t('fission.ended');
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return locale.t('fission.left')
    .replace('{d}', String(d))
    .replace('{h}', h)
    .replace('{m}', m)
    .replace('{s}', sec);
});

function isYuan(t: any): boolean {
  return t?.type === 'FIXED' || t?.type === 'FULL';
}

function amountText(t: any): string {
  if (!t) return '';
  if (t.type === 'PERCENT') return (Number(t.discountValue || 0) / 10).toFixed(1).replace(/\.0$/, '');
  if (t.type === 'FREE_SHIPPING') return locale.t('fission.freeShort');
  const yuan = Number(t.discountValue || 0) / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

function condText(t: any): string {
  if (!t) return '';
  if (t.type === 'FULL') {
    const yuan = Number(t.minSpend || 0) / 100;
    return locale.t('fission.condFull').replace('{n}', Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2));
  }
  if (t.type === 'PERCENT') return locale.t('fission.condPercent');
  if (t.type === 'FREE_SHIPPING') return locale.t('fission.condFreeShip');
  return locale.t('fission.condNone');
}

async function load() {
  loading.value = true;
  try {
    activity.value = await getCouponFissionActivity();
    if (auth.isLoggedIn) {
      try {
        const res: any = await getActiveCustomer();
        const id = res?.activeCustomer?.id;
        myCode.value = id ? fissionInviteCodeOf(id) : '';
      } catch { myCode.value = ''; }
    } else {
      myCode.value = '';
    }
  } catch (e) {
    console.warn('[coupon-fission] load failed', e);
    activity.value = null;
  } finally {
    loading.value = false;
  }
}

function statusKey(status: string): string {
  switch (status) {
    case 'OK': return 'fission.ok';
    case 'ALREADY_REWARDED': return 'fission.already';
    case 'SELF_SHARE': return 'fission.self';
    case 'BLOCKED_NEW_CUSTOMER': return 'fission.newOnly';
    case 'SOLD_OUT': return 'fission.soldOut';
    case 'NO_INVITER': return 'fission.noInviter';
    case 'INACTIVE': return 'fission.inactive';
    case 'NOT_LOGGED_IN': return 'fission.needLogin';
    default: return 'fission.fail';
  }
}

async function claim() {
  if (claiming.value) return;
  const code = inviteCode.value.trim();
  if (!auth.isLoggedIn) {
    auth.requireLogin();
    return;
  }
  if (!code) {
    uni.showToast({ title: locale.t('fission.codeRequired'), icon: 'none' });
    return;
  }
  claiming.value = true;
  try {
    const res = await claimFissionReward(code);
    const key = statusKey(String(res?.status || ''));
    uni.showToast({ title: locale.t(key), icon: 'none' });
    if (res?.status === 'OK') {
      inviteCode.value = '';
      void load();
    }
  } catch (e: any) {
    console.warn('[coupon-fission] claim failed', e);
    uni.showToast({ title: locale.t('fission.fail'), icon: 'none' });
  } finally {
    claiming.value = false;
  }
}

function copyCode() {
  uni.setClipboardData({
    data: myCode.value,
    success: () => uni.showToast({ title: locale.t('fission.copied'), icon: 'none' }),
  });
}

async function share() {
  if (!myCode.value) {
    uni.showToast({ title: locale.t('fission.needLogin'), icon: 'none' });
    return;
  }
  const channel = await sharePage({
    title: locale.t('fission.shareTitle').replace('{n}', activity.value?.name || ''),
    desc: locale.t('fission.shareDesc'),
    path: `/pkg-promotion/pages/coupon-fission?invite=${encodeURIComponent(myCode.value)}`,
  });
  if (channel === 'copy') {
    uni.showToast({ title: locale.t('fission.copied'), icon: 'none' });
  }
}

function goCoupons() {
  uni.navigateTo({ url: '/pkg-promotion/pages/coupon-centre' });
}

onLoad((options: any) => {
  const code = options?.invite || options?.invite_code || options?.code;
  if (code) inviteCode.value = String(code);
});

onShow(() => {
  void load();
  if (!timer) timer = setInterval(() => { now.value = Date.now(); }, 1000);
});

onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<style scoped lang="scss">
.fi-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.fi-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 120rpx 0; }
.fi-empty { display: flex; flex-direction: column; align-items: center; padding: 160rpx 40rpx; gap: 16rpx;
  &__ico { font-size: 80rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
  &__btn { margin-top: 16rpx; background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; padding: 0 48rpx; height: 76rpx; line-height: 76rpx; }
}
.fi-hero { background: linear-gradient(135deg, #e8452c, #ff8a3d); color: #fff; padding: 48rpx 30rpx 40rpx; display: flex; flex-direction: column; gap: 10rpx;
  &__title { font-size: 44rpx; font-weight: bold; }
  &__sub { font-size: 26rpx; opacity: .92; line-height: 1.5; }
  &__clock { margin-top: 8rpx; font-size: 24rpx; opacity: .9; }
}
.fi-rules { margin: 20rpx; background: $surface; border-radius: $radius-md; padding: 24rpx;
  &__title { font-size: 26rpx; font-weight: 600; color: $text-color; }
  &__body { display: block; margin-top: 10rpx; font-size: 24rpx; color: $text-color-secondary; line-height: 1.7; white-space: pre-wrap; }
}
.fi-rewards { display: flex; gap: 20rpx; padding: 0 20rpx;
  .fi-reward { flex: 1; background: $surface; border-radius: $radius-md; padding: 24rpx; display: flex; flex-direction: column; gap: 6rpx; border: 2rpx solid #ffd9cf;
    &--inviter { border-color: #ffe3b3; }
    &__tag { font-size: 22rpx; color: #e8452c; font-weight: 600; }
    &__amount { display: flex; align-items: baseline; gap: 4rpx; color: #e8452c; }
    &__symbol { font-size: 26rpx; }
    &__num { font-size: 56rpx; font-weight: bold; line-height: 1.1; }
    &__unit { font-size: 24rpx; }
    &__cond { font-size: 22rpx; color: $text-color-secondary; }
    &__name { margin-top: 6rpx; font-size: 22rpx; color: $text-color-placeholder; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }
}
.fi-claim { margin: 20rpx; background: $surface; border-radius: $radius-md; padding: 28rpx 24rpx;
  &__title { font-size: 28rpx; font-weight: 600; color: $text-color; }
  &__input { margin-top: 16rpx; height: 84rpx; background: $bg-color; border-radius: $radius-sm; padding: 0 20rpx; font-size: 28rpx; color: $text-color; }
  &__btn { margin-top: 20rpx; height: 84rpx; line-height: 84rpx; background: linear-gradient(135deg, #e8452c, #ff8a3d); color: #fff; font-size: 30rpx; font-weight: 600; border-radius: $radius-md; }
  &__hint { display: block; margin-top: 12rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; }
}
.fi-mine { margin: 20rpx; background: $surface; border-radius: $radius-md; padding: 28rpx 24rpx; display: flex; flex-direction: column; align-items: center; gap: 8rpx;
  &__label { font-size: 24rpx; color: $text-color-secondary; }
  &__code { font-size: 60rpx; font-weight: bold; color: $brand-color; letter-spacing: 6rpx; }
  &__btns { display: flex; gap: 20rpx; width: 100%; margin-top: 12rpx; }
  &__btn { flex: 1; height: 76rpx; line-height: 76rpx; font-size: 28rpx; color: #fff; background: $brand-color; border-radius: $radius-md; margin: 0;
    &--ghost { background: transparent; color: $brand-color; border: 2rpx solid $brand-color; }
  }
  &__hint { margin-top: 6rpx; font-size: 22rpx; color: $text-color-placeholder; }
}
.fi-note { padding: 24rpx 30rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; line-height: 1.6; }
</style>
