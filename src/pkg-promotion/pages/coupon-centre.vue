<template>
  <view class="cc-page">
    <view class="cc-entries">
      <view class="cc-entry" @tap="go('/pkg-promotion/pages/coupon-mall')">
        <text class="cc-entry__ico">🎫</text>
        <text class="cc-entry__txt">{{ $t('couponCentre.entryMall') }}</text>
      </view>
      <view class="cc-entry" @tap="go('/pkg-promotion/pages/daily-coupon')">
        <text class="cc-entry__ico">📅</text>
        <text class="cc-entry__txt">{{ $t('couponCentre.entryDaily') }}</text>
      </view>
      <view class="cc-entry" @tap="goOrders">
        <text class="cc-entry__ico">🧾</text>
        <text class="cc-entry__txt">{{ $t('couponCentre.entryOrders') }}</text>
      </view>
      <view class="cc-entry" @tap="go('/pkg-promotion/pages/coupon-fission')">
        <text class="cc-entry__ico">🤝</text>
        <text class="cc-entry__txt">{{ $t('couponCentre.entryFission') }}</text>
      </view>
    </view>

    <view class="cc-tabs">
      <text class="cc-tab" :class="{ on: tab === 'claimable' }" @tap="switchTab('claimable')">{{ $t('couponCentre.tabClaimable') }}</text>
      <text class="cc-tab" :class="{ on: tab === 'upcoming' }" @tap="switchTab('upcoming')">{{ $t('couponCentre.tabUpcoming') }}</text>
      <text class="cc-tab" :class="{ on: tab === 'points' }" @tap="switchTab('points')">{{ $t('couponCentre.tabPoints') }}</text>
    </view>

    <scroll-view scroll-y class="cc-list">
      <template v-if="tab === 'points'">
        <view v-for="t in pointsList" :key="'p-' + t.id" class="ticket">
          <view class="ticket__left">
            <view class="ticket__amount">
              <text class="ticket__symbol" v-if="t.type === 'FIXED' || t.type === 'FULL'">¥</text>
              <text class="ticket__num">{{ amountText(t) }}</text>
              <text class="ticket__unit" v-if="t.type === 'PERCENT'">{{ $t('couponCentre.unitPercent') }}</text>
            </view>
            <text class="ticket__cond">{{ condText(t) }}</text>
          </view>
          <view class="ticket__right">
            <text class="ticket__name">{{ t.name }}</text>
            <text v-if="t.description" class="ticket__desc">{{ t.description }}</text>
            <text class="ticket__points">{{ $t('couponCentre.pointsPrice').replace('{n}', String(t.pointsPrice || 0)) }}</text>
            <button class="ticket__btn" :disabled="exchangingId === t.id" @tap="exchange(t)">
              {{ exchangingId === t.id ? $t('couponCentre.exchanging') : $t('couponCentre.exchange') }}
            </button>
          </view>
        </view>
        <view class="empty-wrap" v-if="!loading && !pointsList.length">
          <EmptyState :text="$t('couponCentre.pointsEmpty')" />
        </view>
      </template>

      <template v-else>
        <view v-for="t in list" :key="t.id" class="ticket" :class="{ 'ticket--off': !claimableNow(t) }">
          <view class="ticket__left">
            <view class="ticket__amount">
              <text class="ticket__symbol" v-if="t.type === 'FIXED' || t.type === 'FULL'">¥</text>
              <text class="ticket__num">{{ amountText(t) }}</text>
              <text class="ticket__unit" v-if="t.type === 'PERCENT'">{{ $t('couponCentre.unitPercent') }}</text>
            </view>
            <text class="ticket__cond">{{ condText(t) }}</text>
          </view>
          <view class="ticket__right">
            <text class="ticket__name">{{ t.name }}</text>
            <text class="ticket__window" v-if="t.endsAt">{{ windowText(t) }}</text>
            <button class="ticket__btn" :class="{ 'ticket__btn--done': claimedIds.has(t.id) }"
              :disabled="claimingId === t.id" @tap="claim(t)">
              {{ claimBtnText(t) }}
            </button>
          </view>
        </view>
        <view class="empty-wrap" v-if="!loading && list.length === 0">
          <EmptyState :text="emptyText" />
        </view>
      </template>

      <view class="scroll-pad"></view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import EmptyState from '../../components/EmptyState.vue';
import { useAuthStore } from '../../stores/auth';
import { getCouponCentre, getCouponCentreUpcoming, getPointsMallTemplates, exchangeCouponWithPoints } from '../../api/queries/coupon';
import { claimCoupon } from '../../api/mutations/coupon';
import { useLocaleStore } from '../../stores/locale';

type TabKey = 'claimable' | 'upcoming' | 'points';

const auth = useAuthStore();
const locale = useLocaleStore();
const tab = ref<TabKey>('claimable');
const claimableList = ref<any[]>([]);
const upcomingList = ref<any[]>([]);
const pointsList = ref<any[]>([]);
const loading = ref(false);
const claimingId = ref('');
const exchangingId = ref('');
const claimedIds = ref(new Set<string>());

const list = computed(() => (tab.value === 'claimable' ? claimableList.value : upcomingList.value));

const emptyText = computed(() => {
  if (tab.value === 'upcoming') return locale.t('couponCentre.emptyUpcoming');
  return locale.t('couponCentre.empty');
});

function claimableNow(t: any): boolean {
  return tab.value === 'claimable';
}

function amountText(t: any): string {
  if (t.type === 'PERCENT') return (t.discountValue / 10).toFixed(1).replace(/\.0$/, '');
  if (t.type === 'FREE_SHIPPING') return locale.t('couponCentre.freeShort');
  const yuan = t.discountValue / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

function condText(t: any): string {
  if (t.type === 'FULL') {
    const yuan = t.minSpend / 100;
    const y = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
    return locale.t('couponCentre.condFull').replace('{n}', y);
  }
  if (t.type === 'PERCENT') return locale.t('couponCentre.condPercent');
  if (t.type === 'FREE_SHIPPING') return locale.t('couponCentre.condFreeShip');
  return locale.t('couponCentre.condNone');
}

function windowText(t: any): string {
  if (!t.endsAt) return locale.t('couponCentre.validForever');
  return locale.t('couponCentre.windowRange').replace('{a}', fmtDate(t.startsAt)).replace('{b}', fmtDate(t.endsAt));
}

function fmtDate(s: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
}

function canClaim(t: any): boolean {
  return !claimedIds.value.has(t.id) && tab.value !== 'upcoming'
    && !((t.totalCount ?? 0) > 0 && t.claimedCount >= t.totalCount);
}

function claimBtnText(t: any): string {
  if (claimedIds.value.has(t.id)) return locale.t('couponCentre.claimed');
  if (tab.value === 'upcoming') return locale.t('couponCentre.notStarted');
  if ((t.totalCount ?? 0) > 0 && t.claimedCount >= t.totalCount) return locale.t('couponCentre.soldOut');
  return locale.t('couponCentre.claimNow');
}

function switchTab(k: TabKey) {
  tab.value = k;
}

function go(url: string) {
  uni.navigateTo({ url });
}

function goOrders() {
  if (!auth.requireLogin('/pkg-promotion/pages/coupon-centre')) return;
  uni.navigateTo({ url: '/pkg-promotion/pages/coupon-sale-orders' });
}

async function claim(t: any) {
  if (!canClaim(t)) return;
  if (!auth.requireLogin('/pkg-promotion/pages/coupon-centre')) return;
  claimingId.value = t.id;
  try {
    await claimCoupon(t.id);
    claimedIds.value.add(t.id);
    uni.showToast({ title: locale.t('couponCentre.claimSuccess'), icon: 'none' });
  } catch (e: any) {
    const msg = e?.response?.errors?.[0]?.message || locale.t('couponCentre.claimFail');
    uni.showToast({ title: msg, icon: 'none' });
    load();
  } finally {
    claimingId.value = '';
  }
}

async function exchange(t: any) {
  if (exchangingId.value) return;
  if (!auth.requireLogin('/pkg-promotion/pages/coupon-centre')) return;
  const ok = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: locale.t('couponCentre.exchange'),
      content: locale.t('couponCentre.exchangeConfirm')
        .replace('{n}', String(t.pointsPrice || 0))
        .replace('{s}', t.name),
      success: (r) => resolve(!!r.confirm),
      fail: () => resolve(false),
    });
  });
  if (!ok) return;
  exchangingId.value = t.id;
  try {
    await exchangeCouponWithPoints(t.id);
    uni.showToast({ title: locale.t('couponCentre.exchangeOk'), icon: 'none' });
  } catch (e: any) {
    const msg = String(e?.response?.errors?.[0]?.message || '');
    if (/points/i.test(msg) && /insufficient|not enough|balance/i.test(msg)) {
      uni.showToast({ title: locale.t('couponCentre.pointsNotEnough'), icon: 'none' });
    } else if (/limit/i.test(msg)) {
      uni.showToast({ title: locale.t('couponCentre.pointsLimit'), icon: 'none' });
    } else if (/sold out/i.test(msg)) {
      uni.showToast({ title: locale.t('couponCentre.soldOut'), icon: 'none' });
    } else {
      uni.showToast({ title: msg || locale.t('couponCentre.exchangeFail'), icon: 'none' });
    }
  } finally {
    exchangingId.value = '';
  }
}

async function load() {
  loading.value = true;
  try {
    const [res, up, pts] = await Promise.allSettled([
      getCouponCentre(),
      getCouponCentreUpcoming(),
      getPointsMallTemplates(),
    ]);
    claimableList.value = res.status === 'fulfilled' ? (res.value?.couponCentre ?? []) : [];
    upcomingList.value = up.status === 'fulfilled' ? (up.value?.couponCentreUpcoming ?? []) : [];
    pointsList.value = pts.status === 'fulfilled' ? (pts.value ?? []) : [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style lang="scss" scoped>
.cc-page { min-height: 100vh; background: #f5f5f5; display: flex; flex-direction: column; }
.cc-entries { display: flex; background: #fff; padding: 20rpx 16rpx; gap: 12rpx; }
.cc-entry { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6rpx; padding: 16rpx 8rpx; background: #fff8f2; border: 1rpx solid #ffe0c7; border-radius: 12rpx;
  &__ico { font-size: 34rpx; }
  &__txt { font-size: 22rpx; color: #b45309; }
}
.cc-tabs { display: flex; background: #fff; padding: 0 24rpx; }
.cc-tab { padding: 24rpx 0; margin-right: 40rpx; font-size: 30rpx; color: #666; &.on { color: #ff6600; font-weight: bold; border-bottom: 4rpx solid #ff6600; } }
.cc-list { flex: 1; height: 0; padding: 24rpx; box-sizing: border-box; }
.ticket { display: flex; background: #fff; border-radius: 16rpx; margin-bottom: 24rpx; overflow: hidden; }
.ticket__left { width: 220rpx; background: #ff6600; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 28rpx 0; }
.ticket--off .ticket__left { background: #ccc; }
.ticket__amount { display: flex; align-items: baseline; }
.ticket__symbol { font-size: 28rpx; }
.ticket__num { font-size: 52rpx; font-weight: bold; }
.ticket__unit { font-size: 24rpx; margin-left: 4rpx; }
.ticket__cond { font-size: 22rpx; margin-top: 8rpx; opacity: 0.9; }
.ticket__right { flex: 1; padding: 24rpx; display: flex; flex-direction: column; }
.ticket__name { font-size: 28rpx; color: #333; font-weight: bold; }
.ticket__desc { font-size: 22rpx; color: #999; margin-top: 6rpx; line-height: 1.4; }
.ticket__window { font-size: 22rpx; color: #999; margin-top: 6rpx; }
.ticket__points { font-size: 24rpx; color: #ff6600; font-weight: bold; margin-top: 8rpx; }
.ticket__btn { margin-top: auto; align-self: flex-end; background: #ff6600; color: #fff; font-size: 24rpx; padding: 0 28rpx; height: 56rpx; line-height: 56rpx; border-radius: 28rpx; &--done { background: #eee; color: #999; } }
.empty-wrap { padding-top: 120rpx; }
.scroll-pad { height: 40rpx; }
</style>
