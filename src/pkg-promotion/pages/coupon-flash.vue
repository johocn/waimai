<template>
  <view class="cf-page">
    <view class="cf-hero">
      <text class="cf-hero__title">{{ activity?.name || $t('couponFlash.title') }}</text>
      <text class="cf-hero__sub" v-if="activity?.subtitle">{{ activity.subtitle }}</text>
      <view class="cf-hero__clock">
        <text class="cf-hero__label">{{ clockLabel }}</text>
        <text class="cf-hero__time">{{ countdownText }}</text>
      </view>
    </view>

    <view v-if="loading" class="cf-tip">{{ $t('couponFlash.loading') }}</view>
    <view v-else-if="!activity" class="cf-empty">
      <text class="cf-empty__ico">🎟️</text>
      <text class="cf-empty__text">{{ $t('couponFlash.empty') }}</text>
      <button class="cf-empty__btn" @tap="goCoupons">{{ $t('couponFlash.goMine') }}</button>
    </view>

    <template v-else>
      <view class="cf-rules" v-if="activity.rules">
        <text class="cf-rules__title">{{ $t('couponFlash.rules') }}</text>
        <text class="cf-rules__text">{{ activity.rules }}</text>
      </view>

      <view v-for="(it, idx) in activity.items" :key="it.template?.id || idx" class="ticket" :class="{ 'ticket--off': it.soldOut }">
        <view class="ticket__left">
          <view class="ticket__amount">
            <text class="ticket__symbol" v-if="it.template.type === 'FIXED' || it.template.type === 'FULL'">¥</text>
            <text class="ticket__num">{{ amountText(it.template) }}</text>
            <text class="ticket__unit" v-if="it.template.type === 'PERCENT'">{{ $t('couponCentre.unitPercent') }}</text>
          </view>
          <text class="ticket__cond">{{ condText(it.template) }}</text>
        </view>
        <view class="ticket__right">
          <text class="ticket__name">{{ it.template.name }}</text>
          <text class="ticket__window" v-if="it.template.validDays">{{ $t('couponFlash.validDays').replace('{n}', String(it.template.validDays)) }}</text>
          <text class="ticket__progress" v-if="it.template.totalCount > 0">
            {{ $t('couponFlash.leftCount').replace('{n}', String(Math.max(0, it.template.totalCount - it.template.claimedCount))) }}
          </text>
          <button class="ticket__btn" :class="{ 'ticket__btn--done': btnState(it) !== 'claim' }" :disabled="claimingId || btnState(it) !== 'claim'" @tap="claim(it)">
            {{ btnText(it) }}
          </button>
        </view>
      </view>

      <view class="cf-foot">
        <text class="cf-foot__link" @tap="goCoupons">{{ $t('couponFlash.goMine') }} ›</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getCouponFlashSale, claimFlashCoupon } from '../../api/queries/activity';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();

const loading = ref(true);
const claimingId = ref('');
const activity = ref<any>(null);
const now = ref(Date.now());
let timer: any = null;

const phase = computed<'pending' | 'active' | 'ended'>(() => {
  const a = activity.value;
  if (!a) return 'ended';
  if (new Date(a.startsAt).getTime() > now.value) return 'pending';
  if (new Date(a.endsAt).getTime() <= now.value) return 'ended';
  return 'active';
});

const clockLabel = computed(() => {
  if (phase.value === 'pending') return locale.t('couponFlash.startsIn');
  if (phase.value === 'active') return locale.t('couponFlash.endsIn');
  return locale.t('couponFlash.ended');
});

const countdownText = computed(() => {
  const a = activity.value;
  if (!a) return '--:--:--';
  const target = phase.value === 'pending' ? a.startsAt : a.endsAt;
  const left = Math.max(0, new Date(target).getTime() - now.value);
  if (left <= 0) return '00:00:00';
  const s = Math.floor(left / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
});

function amountText(t: any): string {
  if (!t) return '';
  if (t.type === 'PERCENT') return (t.discountValue / 10).toFixed(1).replace(/\.0$/, '');
  if (t.type === 'FREE_SHIPPING') return locale.t('couponCentre.freeShort');
  const yuan = t.discountValue / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

function condText(t: any): string {
  if (t.type === 'FULL') {
    const yuan = t.minSpend / 100;
    return locale.t('couponCentre.condFull').replace('{n}', Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2));
  }
  if (t.type === 'PERCENT') return locale.t('couponCentre.condPercent');
  if (t.type === 'FREE_SHIPPING') return locale.t('couponCentre.condFreeShip');
  return locale.t('couponCentre.condNone');
}

function btnState(it: any): 'claim' | 'soldOut' | 'mine' | 'pending' | 'ended' {
  if (phase.value === 'pending') return 'pending';
  if (phase.value === 'ended') return 'ended';
  if (it.soldOut) return 'soldOut';
  if (Number(it.myClaimed || 0) >= Number(activity.value?.perUserLimit || 0)) return 'mine';
  return 'claim';
}

function btnText(it: any): string {
  const st = btnState(it);
  if (st === 'pending') return locale.t('couponFlash.notStarted');
  if (st === 'ended') return locale.t('couponFlash.ended');
  if (st === 'soldOut') return locale.t('couponFlash.soldOut');
  if (st === 'mine') return locale.t('couponFlash.claimed');
  return locale.t('couponFlash.claim');
}

async function load() {
  loading.value = true;
  try {
    activity.value = await getCouponFlashSale();
  } catch (e) {
    console.warn('[coupon-flash] load failed', e);
    activity.value = null;
  } finally {
    loading.value = false;
  }
}

async function claim(it: any) {
  if (claimingId.value || btnState(it) !== 'claim') return;
  if (!auth.isLoggedIn) {
    uni.navigateTo({ url: '/pages/login/index' });
    return;
  }
  claimingId.value = String(it.template?.id || '');
  try {
    const res: any = await claimFlashCoupon(String(it.template.id));
    const status = String(res?.status || '');
    const key: Record<string, string> = {
      OK: 'couponFlash.claimOk',
      NOT_LOGGED_IN: 'couponFlash.needLogin',
      NOT_STARTED: 'couponFlash.notStarted',
      ENDED: 'couponFlash.ended',
      PER_USER_LIMIT: 'couponFlash.claimed',
      SOLD_OUT: 'couponFlash.soldOut',
      INACTIVE: 'couponFlash.empty',
      NOT_IN_ACTIVITY: 'couponFlash.empty',
    };
    uni.showToast({ title: locale.t(key[status] || 'couponFlash.claimFail'), icon: 'none' });
    if (status === 'NOT_LOGGED_IN') uni.navigateTo({ url: '/pages/login/index' });
    if (status === 'OK') void load();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponFlash.claimFail'), icon: 'none' });
  } finally {
    claimingId.value = '';
  }
}

function goCoupons() {
  uni.navigateTo({ url: '/pkg-promotion/pages/my-coupons' });
}

onLoad(() => {
  void load();
  timer = setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<style scoped lang="scss">
.cf-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.cf-hero { background: linear-gradient(135deg, #ff8a00, #ff5f6d); color: #fff; padding: 40rpx 30rpx 34rpx;
  &__title { font-size: 40rpx; font-weight: bold; display: block; }
  &__sub { display: block; margin-top: 8rpx; font-size: 24rpx; opacity: .9; }
  &__clock { display: flex; align-items: center; gap: 12rpx; margin-top: 20rpx; }
  &__label { font-size: 22rpx; opacity: .9; }
  &__time { font-size: 30rpx; font-weight: bold; letter-spacing: 2rpx; }
}
.cf-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 80rpx 0; }
.cf-empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
  &__btn { margin-top: 12rpx; background: $brand-color; color: #fff; font-size: 26rpx; border-radius: 999rpx; padding: 0 40rpx; height: 68rpx; line-height: 68rpx; }
}
.cf-rules { margin: 20rpx; background: #fff8ef; border: 1rpx solid #ffd9ad; border-radius: $radius-md; padding: 20rpx;
  &__title { display: block; font-size: 24rpx; font-weight: 600; color: #b45309; }
  &__text { display: block; margin-top: 8rpx; font-size: 22rpx; color: #b45309; line-height: 1.5; }
}
.ticket { display: flex; background: $surface; margin: 20rpx; border-radius: $radius-md; overflow: hidden; position: relative;
  &--off { opacity: .55; }
  &__left { width: 220rpx; flex-shrink: 0; background: linear-gradient(135deg, #ff8a00, #ff5f6d); color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24rpx 12rpx; gap: 6rpx; }
  &__amount { display: flex; align-items: baseline; gap: 2rpx; }
  &__symbol { font-size: 26rpx; }
  &__num { font-size: 52rpx; font-weight: bold; }
  &__unit { font-size: 24rpx; }
  &__cond { font-size: 20rpx; opacity: .9; }
  &__right { flex: 1; min-width: 0; padding: 22rpx 24rpx; display: flex; flex-direction: column; gap: 6rpx; }
  &__name { font-size: 28rpx; font-weight: 600; color: $text-color; }
  &__window, &__progress { font-size: 22rpx; color: $text-color-secondary; }
  &__btn { margin: auto 0 0 auto; height: 56rpx; line-height: 56rpx; padding: 0 28rpx; font-size: 24rpx; color: #fff; background: linear-gradient(135deg, #ff8a00, #ff5f6d); border-radius: 999rpx;
    &--done { background: #c9c9c9; } }
}
.cf-foot { padding: 10rpx 30rpx; text-align: center;
  &__link { font-size: 24rpx; color: $brand-color; }
}
</style>
