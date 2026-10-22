<template>
  <view class="ps-page">
    <view class="ps-hero">
      <view class="ps-hero__row">
        <text class="ps-hero__ico">📦</text>
        <text class="ps-hero__title">{{ $t('preSale.heroTitle') }}</text>
      </view>
      <text class="ps-hero__sub">{{ $t('preSale.sub') }}</text>
    </view>

    <view v-if="loading" class="ps-tip">{{ $t('preSale.loading') }}</view>
    <view v-else-if="!items.length" class="ps-empty">
      <text class="ps-empty__ico">📦</text>
      <text class="ps-empty__text">{{ $t('preSale.empty') }}</text>
    </view>

    <view v-for="it in items" :key="it.key" class="ps-card">
      <view class="ps-card__media">
        <image class="ps-card__img" :src="it.image || ''" mode="aspectFill" />
        <text class="ps-card__mode">{{ it.mode === 'deposit' ? $t('preSale.modeDeposit') : $t('preSale.modeFull') }}</text>
      </view>
      <view class="ps-card__body">
        <text class="ps-card__shop">{{ it.storeName }}</text>
        <text class="ps-card__name">{{ it.name }}</text>
        <view class="ps-card__price">
          <text class="ps-card__now">¥{{ money(it.price) }}</text>
          <text class="ps-card__origin" v-if="it.originPrice > it.price">¥{{ money(it.originPrice) }}</text>
        </view>
        <text v-if="it.mode === 'deposit' && it.deposit > 0" class="ps-card__deposit">
          {{ $t('preSale.depositLine').replace('{d}', money(it.deposit)).replace('{t}', money(it.tail)) }}
        </text>
        <view class="ps-bar">
          <view class="ps-bar__track">
            <view class="ps-bar__fill" :style="{ width: it.soldPct + '%' }"></view>
          </view>
          <text class="ps-bar__txt">{{ $t('preSale.soldOf').replace('{a}', String(it.soldCount)).replace('{b}', String(it.totalStock)) }}</text>
        </view>
        <view class="ps-card__foot">
          <text class="ps-card__left">{{ $t('preSale.left').replace('{t}', countdown(it.endAt)) }}</text>
          <button class="ps-card__btn" :class="{ off: it.soldOut }" :disabled="busy" @tap="reserve(it)">
            {{ it.soldOut ? $t('preSale.soldOut') : $t('preSale.reserve') }}
          </button>
        </view>
        <text v-if="it.releaseText" class="ps-card__release">{{ it.releaseText }}</text>
      </view>
    </view>

    <view class="ps-note">{{ $t('preSale.note') }}</view>
  </view>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { onShow, onLoad } from '@dcloudio/uni-app';
import { fetchStoreList } from '../../api/queries/waimai';
import { getProductsByIdsInChannel } from '../../api/queries/activity';
import { getActivePreSalesInChannel, applyPreSaleInChannel } from '../../api/queries/preSale';
import { addItemToOrderInChannel } from '../../api/mutations/cart';
import { getActiveOrderForChannel } from '../../api/queries/order';
import { getSessionToken } from '../../api/client';
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
  const d = Math.floor(s / 86400);
  const h = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${d > 0 ? d + locale.t('preSale.dayUnit') + ' ' : ''}${h}:${m}:${sec}`;
}

function releaseText(a: any): string {
  const at = a.releaseAt || a.tailStartAt;
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return locale.t('preSale.releaseAt').replace('{d}', `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}

async function load() {
  loading.value = true;
  try {
    const stores = (await fetchStoreList()).filter((s: any) => !s.paused && s.channelToken);
    const groups = await Promise.all(
      stores.map(async (s: any) => {
        try {
          const acts = await getActivePreSalesInChannel(s.channelToken);
          if (!acts.length) return [];
          const prods = await getProductsByIdsInChannel(s.channelToken, acts.map((a: any) => String(a.productId)));
          const map = new Map<string, any>(prods.map((p: any) => [String(p.id), p]));
          return acts.map((a: any) => {
            const p = map.get(String(a.productId));
            if (!p) return null;
            const v = (p.variants || []).find((x: any) => String(x.id) === String(a.variantId));
            const origin = Number(v?.priceWithTax || 0);
            const price = Number(a.presalePrice) > 0 ? Number(a.presalePrice) : origin;
            const deposit = Number(a.depositAmount) || 0;
            const totalStock = Number(a.totalStock) || 0;
            const soldCount = Number(a.soldCount) || 0;
            return {
              key: `${s.channelToken}-${a.id}`,
              id: String(a.id),
              token: s.channelToken,
              storeName: s.name || '',
              variantId: String(a.variantId),
              name: p.name,
              image: p.featuredAsset?.preview || '',
              mode: a.mode,
              price,
              originPrice: origin,
              deposit,
              tail: Math.max(0, price - deposit),
              totalStock,
              soldCount,
              soldPct: totalStock > 0 ? Math.min(100, Math.round((soldCount / totalStock) * 100)) : 0,
              soldOut: totalStock > 0 && soldCount >= totalStock,
              endAt: a.endAt,
              releaseText: releaseText(a),
            };
          }).filter(Boolean);
        } catch (e) {
          console.warn('[pre-sale] load store failed', s.channelToken, e);
          return [];
        }
      }),
    );
    items.value = groups.flat().filter((x: any) => x && new Date(x.endAt).getTime() > Date.now());
  } finally {
    loading.value = false;
  }
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}

async function reserve(it: any) {
  if (busy.value || it.soldOut) return;
  if (!auth.isLoggedIn && !getSessionToken()) {
    goLogin();
    return;
  }
  busy.value = true;
  uni.showLoading({ title: locale.t('preSale.reserving') });
  try {
    const added: any = await addItemToOrderInChannel(it.token, it.variantId, 1);
    const order = added?.addItemToOrder;
    if (!order?.id) {
      throw new Error(order?.errorCode || order?.message || 'ADD_FAILED');
    }
    await applyPreSaleInChannel(it.token, it.id);
    // applyPreSale 只回传精简订单，购物车需要完整 OrderDetail 才能渲染分组与金额
    const fresh: any = await getActiveOrderForChannel(it.token);
    if (fresh?.activeOrder) cart.setOrder(fresh.activeOrder);
    uni.hideLoading();
    uni.showToast({ title: locale.t('preSale.reserved'), icon: 'none' });
    setTimeout(() => uni.navigateTo({ url: '/pkg-order/pages/cart' }), 500);
  } catch (e: any) {
    uni.hideLoading();
    const msg = String(e?.message || '');
    let key = 'preSale.fail';
    if (/Sold out|已售罄/i.test(msg)) key = 'preSale.soldOut';
    else if (/Purchase limit/i.test(msg)) key = 'preSale.limitReached';
    else if (/not authenticated|authorized/i.test(msg)) { goLogin(); return; }
    else if (/does not contain/i.test(msg)) key = 'preSale.variantGone';
    else if (/not active|has not started|has ended/i.test(msg)) key = 'preSale.notActive';
    uni.showToast({ title: locale.t(key), icon: 'none' });
    void load();
  } finally {
    busy.value = false;
  }
}

onLoad(() => { void load(); });
onShow(() => {
  if (!timer) timer = setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<style scoped lang="scss">
.ps-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.ps-hero { background: linear-gradient(135deg, #5b6ef5, #8f6cf0); color: #fff; padding: 40rpx 30rpx 34rpx;
  &__row { display: flex; align-items: center; gap: 12rpx; }
  &__ico { font-size: 44rpx; }
  &__title { font-size: 40rpx; font-weight: bold; }
  &__sub { display: block; margin-top: 10rpx; font-size: 24rpx; opacity: .9; }
}
.ps-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 80rpx 0; }
.ps-empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
}
.ps-card { display: flex; gap: 20rpx; background: $surface; margin: 20rpx; padding: 20rpx; border-radius: $radius-md;
  &__media { position: relative; flex-shrink: 0; }
  &__img { width: 190rpx; height: 190rpx; border-radius: $radius-sm; background: $bg-color; display: block; }
  &__mode { position: absolute; left: 0; top: 0; font-size: 20rpx; color: #fff; background: rgba(91,110,245,.9); padding: 4rpx 12rpx; border-radius: $radius-sm 0 $radius-sm 0; }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
  &__shop { font-size: 20rpx; color: $text-color-placeholder; }
  &__name { font-size: 30rpx; font-weight: 600; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__price { display: flex; align-items: baseline; gap: 10rpx; margin-top: 2rpx; }
  &__now { font-size: 40rpx; font-weight: bold; color: #5b6ef5; }
  &__origin { font-size: 22rpx; color: $text-color-placeholder; text-decoration: line-through; }
  &__deposit { font-size: 22rpx; color: #d98300; }
  &__foot { display: flex; align-items: center; justify-content: space-between; margin-top: 8rpx; }
  &__left { font-size: 22rpx; color: $text-color-secondary; }
  &__release { font-size: 20rpx; color: $text-color-placeholder; }
  &__btn { margin: 0; height: 56rpx; line-height: 56rpx; padding: 0 32rpx; font-size: 26rpx; color: #fff; background: linear-gradient(135deg, #5b6ef5, #8f6cf0); border-radius: 999rpx;
    &.off { background: #c9c9c9; } }
}
.ps-bar { display: flex; align-items: center; gap: 12rpx; margin-top: 6rpx;
  &__track { flex: 1; height: 12rpx; border-radius: 999rpx; background: #e9ecff; overflow: hidden; }
  &__fill { height: 100%; border-radius: 999rpx; background: linear-gradient(90deg, #5b6ef5, #8f6cf0); }
  &__txt { font-size: 20rpx; color: #5b6ef5; flex-shrink: 0; }
}
.ps-note { padding: 20rpx 30rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; line-height: 1.6; }
</style>
