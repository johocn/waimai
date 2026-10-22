<template>
  <view class="fs-page">
    <view class="fs-hero">
      <view class="fs-hero__row">
        <text class="fs-hero__ico">⚡</text>
        <text class="fs-hero__title">{{ $t('flashSale.title') }}</text>
      </view>
      <text class="fs-hero__sub">{{ $t('flashSale.sub') }}</text>
    </view>

    <view v-if="loading" class="fs-tip">{{ $t('flashSale.loading') }}</view>
    <view v-else-if="!items.length" class="fs-empty">
      <text class="fs-empty__ico">⏰</text>
      <text class="fs-empty__text">{{ $t('flashSale.empty') }}</text>
    </view>

    <view v-for="it in items" :key="it.key" class="fs-card">
      <image class="fs-card__img" :src="it.image || ''" mode="aspectFill" />
      <view class="fs-card__body">
        <text class="fs-card__shop">{{ it.storeName }}</text>
        <text class="fs-card__name">{{ it.name }}</text>
        <view class="fs-card__price">
          <text class="fs-card__flash">¥{{ money(it.flashPrice) }}</text>
          <text class="fs-card__origin" v-if="it.originPrice > 0">¥{{ money(it.originPrice) }}</text>
          <text class="fs-card__off" v-if="it.discount > 0">{{ $t('flashSale.off').replace('{n}', String(it.discount)) }}</text>
        </view>
        <view class="fs-bar">
          <view class="fs-bar__track">
            <view class="fs-bar__fill" :style="{ width: it.soldPct + '%' }"></view>
          </view>
          <text class="fs-bar__txt">{{ $t('flashSale.soldOf').replace('{a}', String(it.soldCount)).replace('{b}', String(it.totalStock)) }}</text>
        </view>
        <view class="fs-card__foot">
          <text class="fs-card__left">{{ $t('flashSale.left').replace('{t}', countdown(it.endAt)) }}</text>
          <button class="fs-card__btn" :class="{ off: it.soldOut }" :disabled="busy" @tap="grab(it)">
            {{ it.soldOut ? $t('flashSale.soldOut') : $t('flashSale.grab') }}
          </button>
        </view>
      </view>
    </view>

    <view class="fs-note">{{ $t('flashSale.note') }}</view>
  </view>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { onShow, onLoad } from '@dcloudio/uni-app';
import { fetchStoreList } from '../../api/queries/waimai';
import { getActiveFlashSalesInChannel, getProductsByIdsInChannel, applyFlashSaleInChannel } from '../../api/queries/activity';
import { addItemToOrderInChannel } from '../../api/mutations/cart';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const cart = useCartStore();
const locale = useLocaleStore();

const loading = ref(true);
const busy = ref(false);
const items = ref<any[]>([]);
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

async function load() {
  loading.value = true;
  try {
    const stores = (await fetchStoreList()).filter((s: any) => !s.paused && s.channelToken);
    const groups = await Promise.all(
      stores.map(async (s: any) => {
        try {
          const acts = await getActiveFlashSalesInChannel(s.channelToken);
          if (!acts.length) return [];
          const prods = await getProductsByIdsInChannel(s.channelToken, acts.map((a: any) => String(a.productId)));
          const map = new Map<string, any>(prods.map((p: any) => [String(p.id), p]));
          return acts.map((a: any) => {
            const p = map.get(String(a.productId));
            if (!p) return null;
            const v = (p.variants || []).find((x: any) => String(x.id) === String(a.variantId));
            const origin = Number(v?.priceWithTax || 0);
            const soldPct = a.totalStock > 0 ? Math.min(100, Math.round((a.soldCount / a.totalStock) * 100)) : 0;
            return {
              key: `${s.channelToken}-${a.id}`,
              id: String(a.id),
              token: s.channelToken,
              storeName: s.name || '',
              variantId: String(a.variantId),
              name: p.name,
              image: p.featuredAsset?.preview || '',
              flashPrice: Number(a.flashPrice) || 0,
              originPrice: origin,
              discount: origin > 0 && origin > Number(a.flashPrice)
                ? Math.round((1 - Number(a.flashPrice) / origin) * 100)
                : 0,
              totalStock: Number(a.totalStock) || 0,
              soldCount: Number(a.soldCount) || 0,
              soldPct,
              soldOut: Number(a.totalStock) > 0 && Number(a.soldCount) >= Number(a.totalStock),
              endAt: a.endAt,
              limitPerUser: Number(a.limitPerUser) || 0,
            };
          }).filter(Boolean);
        } catch (e) {
          console.warn('[flash-sale] load store failed', s.channelToken, e);
          return [];
        }
      }),
    );
    items.value = groups.flat().filter((x: any) => new Date(x.endAt).getTime() > Date.now());
  } finally {
    loading.value = false;
  }
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}

async function grab(it: any) {
  if (busy.value || it.soldOut) return;
  if (!auth.isLoggedIn) {
    goLogin();
    return;
  }
  busy.value = true;
  uni.showLoading({ title: locale.t('flashSale.grabbing') });
  try {
    const added: any = await addItemToOrderInChannel(it.token, it.variantId, 1);
    const order = added?.addItemToOrder;
    if (!order?.id) {
      throw new Error(order?.errorCode || order?.message || 'ADD_FAILED');
    }
    const applied = await applyFlashSaleInChannel(it.token, it.id);
    if (!applied?.id) throw new Error('APPLY_FAILED');
    cart.setOrder(applied);
    uni.hideLoading();
    uni.showToast({ title: locale.t('flashSale.grabbed'), icon: 'none' });
    setTimeout(() => uni.navigateTo({ url: '/pkg-order/pages/cart' }), 500);
  } catch (e: any) {
    uni.hideLoading();
    const msg = String(e?.message || '');
    let key = 'flashSale.fail';
    if (/Sold out/i.test(msg)) key = 'flashSale.soldOut';
    else if (/Purchase limit/i.test(msg)) key = 'flashSale.limitReached';
    else if (/not authenticated|authorized/i.test(msg)) { goLogin(); return; }
    else if (/does not contain/i.test(msg)) key = 'flashSale.variantGone';
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
.fs-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.fs-hero { background: linear-gradient(135deg, #ff4d2e, #ff8a3d); color: #fff; padding: 40rpx 30rpx 34rpx;
  &__row { display: flex; align-items: center; gap: 12rpx; }
  &__ico { font-size: 44rpx; }
  &__title { font-size: 40rpx; font-weight: bold; }
  &__sub { display: block; margin-top: 10rpx; font-size: 24rpx; opacity: .9; }
}
.fs-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 80rpx 0; }
.fs-empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
}
.fs-card { display: flex; gap: 20rpx; background: $surface; margin: 20rpx; padding: 20rpx; border-radius: $radius-md;
  &__img { width: 190rpx; height: 190rpx; border-radius: $radius-sm; background: $bg-color; flex-shrink: 0; }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
  &__shop { font-size: 20rpx; color: $text-color-placeholder; }
  &__name { font-size: 30rpx; font-weight: 600; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__price { display: flex; align-items: baseline; gap: 10rpx; margin-top: 2rpx; }
  &__flash { font-size: 40rpx; font-weight: bold; color: #ff4d2e; }
  &__origin { font-size: 22rpx; color: $text-color-placeholder; text-decoration: line-through; }
  &__off { font-size: 20rpx; color: #ff4d2e; background: #fff0ec; border: 1rpx solid #ffc4b5; border-radius: 6rpx; padding: 2rpx 8rpx; }
  &__foot { display: flex; align-items: center; justify-content: space-between; margin-top: 8rpx; }
  &__left { font-size: 22rpx; color: $text-color-secondary; }
  &__btn { margin: 0; height: 56rpx; line-height: 56rpx; padding: 0 32rpx; font-size: 26rpx; color: #fff; background: linear-gradient(135deg, #ff4d2e, #ff7a2d); border-radius: 999rpx;
    &.off { background: #c9c9c9; } }
}
.fs-bar { display: flex; align-items: center; gap: 12rpx; margin-top: 6rpx;
  &__track { flex: 1; height: 12rpx; border-radius: 999rpx; background: #ffe7e0; overflow: hidden; }
  &__fill { height: 100%; border-radius: 999rpx; background: linear-gradient(90deg, #ff4d2e, #ffa53d); }
  &__txt { font-size: 20rpx; color: #ff4d2e; flex-shrink: 0; }
}
.fs-note { padding: 20rpx 30rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; }
</style>
