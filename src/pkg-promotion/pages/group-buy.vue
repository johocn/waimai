<template>
  <view class="gb-page">
    <view class="gb-hero">
      <view class="gb-hero__row">
        <text class="gb-hero__ico">👥</text>
        <text class="gb-hero__title">{{ $t('groupBuy.title') }}</text>
      </view>
      <text class="gb-hero__sub">{{ $t('groupBuy.sub') }}</text>
    </view>

    <view class="gb-tabs">
      <text class="gb-tabs__item" :class="{ on: tab === 'open' }" @tap="tab = 'open'">{{ $t('groupBuy.tabOpen') }}</text>
      <text class="gb-tabs__item" :class="{ on: tab === 'mine' }" @tap="switchMine">{{ $t('groupBuy.tabMine') }}</text>
    </view>

    <view v-if="loading" class="gb-tip">{{ $t('groupBuy.loading') }}</view>

    <template v-else-if="tab === 'open'">
      <view v-if="!items.length" class="gb-empty">
        <text class="gb-empty__ico">🫱</text>
        <text class="gb-empty__text">{{ $t('groupBuy.empty') }}</text>
      </view>

      <view v-for="it in items" :key="it.key" class="gb-card">
        <image class="gb-card__img" :src="it.image || ''" mode="aspectFill" />
        <view class="gb-card__body">
          <text class="gb-card__shop">{{ it.storeName }}</text>
          <text class="gb-card__name">{{ it.name }}</text>
          <view class="gb-card__price">
            <text class="gb-card__group">¥{{ money(it.groupPrice) }}</text>
            <text class="gb-card__origin" v-if="it.originPrice > 0">¥{{ money(it.originPrice) }}</text>
            <text class="gb-card__tag">{{ $t('groupBuy.people').replace('{n}', String(it.targetCount)) }}</text>
          </view>
          <view class="gb-bar">
            <view class="gb-bar__track">
              <view class="gb-bar__fill" :style="{ width: it.pct + '%' }"></view>
            </view>
            <text class="gb-bar__txt">{{ $t('groupBuy.joined').replace('{a}', String(it.currentCount)).replace('{b}', String(it.targetCount)) }}</text>
          </view>
          <view class="gb-card__foot">
            <text class="gb-card__left">{{ countdown(it.endAt) }}</text>
            <button class="gb-card__btn" :disabled="busy" @tap="join(it)">
              {{ it.currentCount > 0 ? $t('groupBuy.joinBtn') : $t('groupBuy.openBtn') }}
            </button>
          </view>
          <text v-if="it.leaderDiscount > 0" class="gb-card__leader">{{ $t('groupBuy.leaderBonus').replace('{d}', money(it.leaderDiscount)) }}</text>
        </view>
      </view>
    </template>

    <template v-else>
      <view v-if="!myGroups.length" class="gb-empty">
        <text class="gb-empty__ico">📭</text>
        <text class="gb-empty__text">{{ $t('groupBuy.mineEmpty') }}</text>
      </view>
      <view v-for="g in myGroups" :key="g.id" class="gb-mine">
        <view class="gb-mine__head">
          <text class="gb-mine__name">{{ g.activity?.name || $t('groupBuy.unknownActivity') }}</text>
          <text class="gb-mine__st" :class="'st-' + (g.status || 'pending')">{{ statusText(g.status, g.isLeader) }}</text>
        </view>
        <view class="gb-mine__row">
          <text>{{ $t('groupBuy.orderCode').replace('{c}', g.orderCode || g.orderId || '') }}</text>
          <text class="gb-mine__price" v-if="g.activity?.groupPrice">¥{{ money(g.activity.groupPrice) }}</text>
        </view>
        <view class="gb-mine__row gb-mine__row--sub">
          <text>{{ g.isLeader ? $t('groupBuy.roleLeader') : $t('groupBuy.roleMember') }}</text>
          <text v-if="g.activity">{{ $t('groupBuy.joined').replace('{a}', String(g.activity.currentCount)).replace('{b}', String(g.activity.targetCount)) }}</text>
        </view>
      </view>
    </template>

    <view class="gb-note">{{ $t('groupBuy.note') }}</view>
  </view>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { fetchStoreList } from '../../api/queries/waimai';
import {
  getActiveGroupBuysInChannel,
  getProductsByIdsInChannel,
  getMyGroupBuysInChannel,
  joinGroupBuyInChannel,
} from '../../api/queries/activity';
import { addItemToOrderInChannel } from '../../api/mutations/cart';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const cart = useCartStore();
const locale = useLocaleStore();

const tab = ref<'open' | 'mine'>('open');
const loading = ref(true);
const busy = ref(false);
const items = ref<any[]>([]);
const myGroups = ref<any[]>([]);
const now = ref(Date.now());
let timer: any = null;

function money(fen: number) {
  return (Number(fen || 0) / 100).toFixed(2);
}

function countdown(endAt: string) {
  const left = Math.max(0, new Date(endAt).getTime() - now.value);
  const s = Math.floor(left / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

function statusText(status: string, isLeader: boolean) {
  if (status === 'success') return locale.t('groupBuy.stSuccess');
  if (status === 'failed') return locale.t('groupBuy.stFailed');
  return isLeader ? locale.t('groupBuy.stPendingLeader') : locale.t('groupBuy.stPending');
}

async function load() {
  loading.value = true;
  try {
    const stores = (await fetchStoreList()).filter((s: any) => !s.paused && s.channelToken);
    const groups = await Promise.all(
      stores.map(async (s: any) => {
        try {
          const acts = await getActiveGroupBuysInChannel(s.channelToken);
          if (!acts.length) return [];
          const prods = await getProductsByIdsInChannel(s.channelToken, acts.map((a: any) => String(a.productId)));
          const map = new Map<string, any>(prods.map((p: any) => [String(p.id), p]));
          return acts.map((a: any) => {
            const p = map.get(String(a.productId));
            if (!p) return null;
            const v = (p.variants || []).find((x: any) => String(x.id) === String(a.variantId));
            const total = Number(a.targetCount) || 1;
            return {
              key: `${s.channelToken}-${a.id}`,
              id: String(a.id),
              token: s.channelToken,
              storeName: s.name || '',
              variantId: String(a.variantId),
              name: p.name,
              image: p.featuredAsset?.preview || '',
              groupPrice: Number(a.groupPrice) || 0,
              originPrice: Number(v?.priceWithTax || 0),
              targetCount: total,
              currentCount: Number(a.currentCount) || 0,
              pct: Math.min(100, Math.round((Number(a.currentCount) / total) * 100)),
              leaderDiscount: Number(a.leaderDiscount) || 0,
              endAt: a.endAt,
            };
          }).filter(Boolean);
        } catch (e) {
          console.warn('[group-buy] load store failed', s.channelToken, e);
          return [];
        }
      }),
    );
    items.value = groups.flat().filter((x: any) => new Date(x.endAt).getTime() > Date.now());
    await loadMine(stores);
  } finally {
    loading.value = false;
  }
}

async function loadMine(stores: any[]) {
  if (!auth.isLoggedIn) {
    myGroups.value = [];
    return;
  }
  const all = await Promise.all(
    stores.map(async (s: any) => {
      try {
        const list = await getMyGroupBuysInChannel(s.channelToken);
        return list.map((o: any) => ({ ...o, __token: s.channelToken, __store: s.name }));
      } catch {
        return [];
      }
    }),
  );
  myGroups.value = all.flat();
}

function switchMine() {
  tab.value = 'mine';
  if (auth.isLoggedIn && !myGroups.value.length) void load();
  if (!auth.isLoggedIn) {
    uni.navigateTo({ url: '/pages/login/index' });
  }
}

async function join(it: any) {
  if (busy.value) return;
  if (!auth.isLoggedIn) {
    uni.navigateTo({ url: '/pages/login/index' });
    return;
  }
  const isLeader = Number(it.currentCount) === 0;
  busy.value = true;
  uni.showLoading({ title: locale.t('groupBuy.joining') });
  try {
    const added: any = await addItemToOrderInChannel(it.token, it.variantId, 1);
    const order = added?.addItemToOrder;
    if (!order?.id) throw new Error(order?.errorCode || order?.message || 'ADD_FAILED');
    const joined = await joinGroupBuyInChannel(it.token, it.id, String(order.id), isLeader);
    if (!joined?.id) throw new Error('JOIN_FAILED');
    uni.hideLoading();
    uni.showToast({ title: locale.t(isLeader ? 'groupBuy.opened' : 'groupBuy.joinedOk'), icon: 'none' });
    setTimeout(() => uni.navigateTo({ url: '/pkg-order/pages/cart' }), 500);
  } catch (e: any) {
    uni.hideLoading();
    const msg = String(e?.message || '');
    let key = 'groupBuy.fail';
    if (/full|not joinable/i.test(msg)) key = 'groupBuy.full';
    else if (/expired|ended/i.test(msg)) key = 'groupBuy.ended';
    else if (/does not contain/i.test(msg)) key = 'groupBuy.variantGone';
    uni.showToast({ title: locale.t(key), icon: 'none' });
    void load();
  } finally {
    busy.value = false;
  }
}

onLoad(() => { void load(); });
onShow(() => {
  timer = setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<style scoped lang="scss">
.gb-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.gb-hero { background: linear-gradient(135deg, #7b4dff, #b06bff); color: #fff; padding: 40rpx 30rpx 34rpx;
  &__row { display: flex; align-items: center; gap: 12rpx; }
  &__ico { font-size: 44rpx; }
  &__title { font-size: 40rpx; font-weight: bold; }
  &__sub { display: block; margin-top: 10rpx; font-size: 24rpx; opacity: .9; }
}
.gb-tabs { display: flex; gap: 40rpx; background: $surface; padding: 0 30rpx;
  &__item { font-size: 28rpx; color: $text-color-secondary; padding: 24rpx 0; &.on { color: $text-color; font-weight: bold; border-bottom: 6rpx solid #7b4dff; } }
}
.gb-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 80rpx 0; }
.gb-empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
}
.gb-card { display: flex; gap: 20rpx; background: $surface; margin: 20rpx; padding: 20rpx; border-radius: $radius-md;
  &__img { width: 190rpx; height: 190rpx; border-radius: $radius-sm; background: $bg-color; flex-shrink: 0; }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
  &__shop { font-size: 20rpx; color: $text-color-placeholder; }
  &__name { font-size: 30rpx; font-weight: 600; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__price { display: flex; align-items: baseline; gap: 10rpx; }
  &__group { font-size: 40rpx; font-weight: bold; color: #7b4dff; }
  &__origin { font-size: 22rpx; color: $text-color-placeholder; text-decoration: line-through; }
  &__tag { font-size: 20rpx; color: #7b4dff; background: #f1eaff; border-radius: 6rpx; padding: 2rpx 8rpx; }
  &__foot { display: flex; align-items: center; justify-content: space-between; margin-top: 8rpx; }
  &__left { font-size: 22rpx; color: $text-color-secondary; }
  &__btn { margin: 0; height: 56rpx; line-height: 56rpx; padding: 0 32rpx; font-size: 26rpx; color: #fff; background: linear-gradient(135deg, #7b4dff, #a86bff); border-radius: 999rpx; }
  &__leader { font-size: 20rpx; color: #b45309; margin-top: 4rpx; }
}
.gb-bar { display: flex; align-items: center; gap: 12rpx; margin-top: 4rpx;
  &__track { flex: 1; height: 12rpx; border-radius: 999rpx; background: #ede5ff; overflow: hidden; }
  &__fill { height: 100%; border-radius: 999rpx; background: linear-gradient(90deg, #7b4dff, #b06bff); }
  &__txt { font-size: 20rpx; color: #7b4dff; flex-shrink: 0; }
}
.gb-mine { background: $surface; margin: 20rpx; padding: 24rpx; border-radius: $radius-md;
  &__head { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
  &__name { font-size: 28rpx; font-weight: 600; color: $text-color; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__st { font-size: 22rpx; padding: 2rpx 10rpx; border-radius: 6rpx; flex-shrink: 0; color: #b45309; background: #fff8ef;
    &.st-success { color: #2e7d32; background: #ecfaf1; }
    &.st-failed { color: #b42318; background: #fff2f0; } }
  &__row { display: flex; align-items: center; justify-content: space-between; margin-top: 12rpx; font-size: 24rpx; color: $text-color-secondary;
    &--sub { color: $text-color-placeholder; font-size: 22rpx; }
  }
  &__price { color: #7b4dff; font-weight: 600; }
}
.gb-note { padding: 20rpx 30rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; }
</style>
