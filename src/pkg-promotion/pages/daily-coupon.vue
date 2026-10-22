<template>
  <view class="dc-page">
    <view class="dc-hero">
      <view class="dc-hero__top">
        <text class="dc-hero__badge">{{ $t('dailyCoupon.badge') }}</text>
        <text class="dc-hero__link" @tap="goMyCoupons">{{ $t('dailyCoupon.myCoupons') }} ›</text>
      </view>
      <text class="dc-hero__title">{{ activity?.name || $t('dailyCoupon.title') }}</text>
      <text v-if="activity?.subtitle" class="dc-hero__sub">{{ activity.subtitle }}</text>
      <view class="dc-hero__clock">
        <text class="dc-hero__clock-label">{{ clockLabel }}</text>
        <text class="dc-hero__clock-time" v-if="leftText">{{ leftText }}</text>
      </view>
    </view>

    <view class="dc-rules" v-if="activity?.rules">
      <text class="dc-rules__ico">📌</text>
      <text class="dc-rules__txt">{{ activity.rules }}</text>
    </view>

    <view v-if="loading" class="dc-tip">{{ $t('dailyCoupon.loading') }}</view>

    <template v-else>
      <view v-for="(item, idx) in items" :key="item?.template?.id || idx" class="ticket" :class="{ 'ticket--off': !canClaim(item) }">
        <view class="ticket__left">
          <view class="ticket__amount">
            <text class="ticket__symbol" v-if="item.template.type === 'FIXED' || item.template.type === 'FULL'">¥</text>
            <text class="ticket__num">{{ amountText(item.template) }}</text>
            <text class="ticket__unit" v-if="item.template.type === 'PERCENT'">{{ $t('dailyCoupon.unitPercent') }}</text>
          </view>
          <text class="ticket__cond">{{ condText(item.template) }}</text>
        </view>
        <view class="ticket__right">
          <text class="ticket__name">{{ item.template.name }}</text>
          <text v-if="item.template.description" class="ticket__desc">{{ item.template.description }}</text>
          <text class="ticket__remain" v-if="remainText(item)">{{ remainText(item) }}</text>
          <button class="ticket__btn" :class="{ 'ticket__btn--done': !canClaim(item) }" :disabled="claimingId === item.template.id" @tap="onClaim(item)">
            {{ btnText(item) }}
          </button>
        </view>
      </view>

      <EmptyState v-if="!items.length" :text="activity ? $t('dailyCoupon.emptyItems') : $t('dailyCoupon.empty')" :buttonText="activity ? '' : $t('dailyCoupon.goMall')" @action="goMall" />
    </template>

    <view class="dc-note">{{ $t('dailyCoupon.tips') }}</view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import EmptyState from '../../components/EmptyState.vue';
import { getCouponDailyClaimActivity, claimDailyCoupon } from '../../api/queries/coupon';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const PAGE = '/pkg-promotion/pages/daily-coupon';

const auth = useAuthStore();
const locale = useLocaleStore();

const loading = ref(true);
const activity = ref<any>(null);
const claimingId = ref('');
const now = ref(Date.now());
let timer: any = null;

const items = computed<any[]>(() => activity.value?.items || []);

function winState(): 'PENDING' | 'ACTIVE' | 'ENDED' | 'NONE' {
  const a = activity.value;
  if (!a) return 'NONE';
  const nowMs = now.value;
  const start = a.startsAt ? new Date(a.startsAt).getTime() : 0;
  const end = a.endsAt ? new Date(a.endsAt).getTime() : 0;
  if (start && nowMs < start) return 'PENDING';
  if (end && nowMs >= end) return 'ENDED';
  return 'ACTIVE';
}

const clockLabel = computed(() => {
  const st = winState();
  if (st === 'NONE') return locale.t('dailyCoupon.title');
  if (st === 'PENDING') return locale.t('dailyCoupon.notStarted');
  if (st === 'ENDED') return locale.t('dailyCoupon.ended');
  return locale.t('dailyCoupon.countdown');
});

const leftText = computed(() => {
  if (winState() !== 'ACTIVE') return '';
  const a = activity.value;
  if (!a?.endsAt) return '';
  let left = Math.max(0, new Date(a.endsAt).getTime() - now.value);
  if (left <= 0) return '';
  const s = Math.floor(left / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
});

function amountText(t: any): string {
  if (!t) return '';
  if (t.type === 'PERCENT') return (t.discountValue / 10).toFixed(1).replace(/\.0$/, '');
  if (t.type === 'FREE_SHIPPING') return locale.t('dailyCoupon.freeShort');
  const yuan = t.discountValue / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

function condText(t: any): string {
  if (!t) return '';
  if (t.type === 'FULL') {
    const yuan = t.minSpend / 100;
    return locale.t('dailyCoupon.condFull').replace('{n}', Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2));
  }
  if (t.type === 'PERCENT') return locale.t('dailyCoupon.condPercent');
  if (t.type === 'FREE_SHIPPING') return locale.t('dailyCoupon.condFreeShip');
  return locale.t('dailyCoupon.condNone');
}

function remainText(item: any): string {
  const t = item?.template;
  if (!t || !(t.totalCount > 0)) return '';
  const left = Math.max(0, Number(t.totalCount) - Number(t.claimedCount || 0));
  return locale.t('dailyCoupon.remain').replace('{n}', String(left));
}

function canClaim(item: any): boolean {
  if (!item?.template || item.claimedToday || item.soldOut) return false;
  return winState() === 'ACTIVE';
}

function btnText(item: any): string {
  if (item?.claimedToday) return locale.t('dailyCoupon.claimedToday');
  if (item?.soldOut) return locale.t('dailyCoupon.soldOut');
  if (winState() === 'PENDING') return locale.t('dailyCoupon.notStarted');
  if (winState() === 'ENDED') return locale.t('dailyCoupon.ended');
  return locale.t('dailyCoupon.claim');
}

function statusMessage(status: string): string {
  if (status === 'NOT_LOGGED_IN') return locale.t('dailyCoupon.loginFirst');
  if (status === 'NOT_STARTED') return locale.t('dailyCoupon.notStarted');
  if (status === 'ENDED') return locale.t('dailyCoupon.ended');
  if (status === 'PER_USER_LIMIT') return locale.t('dailyCoupon.limit');
  if (status === 'MEMBER_LEVEL_BLOCKED') return locale.t('dailyCoupon.tierBlocked');
  if (status === 'INACTIVE' || status === 'NOT_IN_ACTIVITY') return locale.t('dailyCoupon.empty');
  return locale.t('dailyCoupon.claimFail');
}

async function onClaim(item: any) {
  if (!canClaim(item) || claimingId.value) return;
  if (!auth.requireLogin(PAGE)) return;
  claimingId.value = item.template.id;
  try {
    const res: any = await claimDailyCoupon(String(item.template.id));
    const status = String(res?.status || '');
    if (status === 'OK' || status === 'ALREADY_CLAIMED') {
      item.claimedToday = true;
      uni.showToast({ title: locale.t(status === 'OK' ? 'dailyCoupon.claimOk' : 'dailyCoupon.claimedToday'), icon: 'none' });
    } else if (status === 'SOLD_OUT') {
      item.soldOut = true;
      uni.showToast({ title: locale.t('dailyCoupon.soldOut'), icon: 'none' });
    } else {
      uni.showToast({ title: statusMessage(status), icon: 'none' });
    }
  } catch (e: any) {
    const msg = String(e?.response?.errors?.[0]?.message || e?.message || '');
    uni.showToast({ title: msg && /sold out/i.test(msg) ? locale.t('dailyCoupon.soldOut') : locale.t('dailyCoupon.claimFail'), icon: 'none' });
  } finally {
    claimingId.value = '';
  }
}

async function load() {
  loading.value = true;
  try {
    activity.value = await getCouponDailyClaimActivity();
  } catch (e) {
    console.warn('[daily-coupon] load failed', e);
    activity.value = null;
  } finally {
    loading.value = false;
  }
}

function goMyCoupons() {
  if (!auth.isLoggedIn) { auth.requireLogin(PAGE); return; }
  uni.navigateTo({ url: '/pkg-promotion/pages/my-coupons' });
}

function goMall() {
  uni.navigateTo({ url: '/pkg-promotion/pages/coupon-mall' });
}

onLoad(() => {
  void load();
  timer = setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<style scoped lang="scss">
.dc-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.dc-hero { background: linear-gradient(135deg, #ff6600, #ff9a3d); color: #fff; padding: 32rpx 30rpx 36rpx; display: flex; flex-direction: column; gap: 10rpx;
  &__top { display: flex; align-items: center; justify-content: space-between; }
  &__badge { font-size: 20rpx; background: rgba(255, 255, 255, .22); border-radius: 999rpx; padding: 4rpx 16rpx; }
  &__link { font-size: 24rpx; opacity: .95; }
  &__title { font-size: 42rpx; font-weight: bold; margin-top: 6rpx; }
  &__sub { font-size: 24rpx; opacity: .9; line-height: 1.4; }
  &__clock { display: flex; align-items: center; gap: 10rpx; margin-top: 8rpx; }
  &__clock-label { font-size: 22rpx; opacity: .9; }
  &__clock-time { font-size: 30rpx; font-weight: bold; letter-spacing: 2rpx; }
}
.dc-rules { margin: 20rpx; background: #fff4e6; border: 1rpx solid #ffd2a8; border-radius: $radius-md; padding: 18rpx 20rpx; display: flex; gap: 10rpx;
  &__ico { font-size: 24rpx; flex-shrink: 0; }
  &__txt { font-size: 22rpx; color: #b45309; line-height: 1.5; }
}
.dc-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 100rpx 0; }
.ticket { display: flex; background: $surface; margin: 20rpx; border-radius: $radius-md; overflow: hidden;
  &__left { width: 210rpx; flex-shrink: 0; background: linear-gradient(160deg, #ff6600, #ff9a3d); color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 26rpx 10rpx; gap: 6rpx; }
  &__amount { display: flex; align-items: baseline; gap: 2rpx; }
  &__symbol { font-size: 26rpx; }
  &__num { font-size: 52rpx; font-weight: bold; }
  &__unit { font-size: 24rpx; }
  &__cond { font-size: 20rpx; opacity: .9; }
  &__right { flex: 1; min-width: 0; padding: 22rpx 24rpx; display: flex; flex-direction: column; gap: 6rpx; }
  &__name { font-size: 28rpx; font-weight: bold; color: $text-color; }
  &__desc { font-size: 22rpx; color: $text-color-secondary; line-height: 1.4; }
  &__remain { font-size: 20rpx; color: $text-color-placeholder; }
  &__btn { margin: 8rpx 0 0 auto; height: 56rpx; line-height: 56rpx; padding: 0 30rpx; font-size: 24rpx; color: #fff; background: linear-gradient(135deg, #ff6600, #ff9a3d); border-radius: 999rpx;
    &--done { background: #eee; color: $text-color-placeholder; }
  }
  &--off .ticket__left { background: #ccc; }
}
.dc-note { padding: 24rpx 30rpx 0; font-size: 22rpx; color: $text-color-placeholder; text-align: center; line-height: 1.5; }
</style>
