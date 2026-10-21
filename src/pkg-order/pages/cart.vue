<template>
  <view class="cart-page">
    <view v-if="loading && !groups.length" class="cart-empty">
      <text class="cart-empty__ico">🛒</text>
      <text class="cart-empty__text">{{ $t('cart.loading') }}</text>
    </view>

    <view v-else-if="!groups.length" class="cart-empty">
      <text class="cart-empty__ico">🛒</text>
      <text class="cart-empty__text">{{ $t('cart.empty') }}</text>
      <button class="cart-empty__btn" @click="goHome">{{ $t('cart.goHome') }}</button>
    </view>

    <view v-else class="cart-list">
      <view class="cart-card" v-for="g in groups" :key="g.token">
        <view class="cart-card__head" @click="enterStore(g)">
          <view class="cart-card__store">
            <image v-if="g.logo" class="cart-card__logo" :src="g.logo" mode="aspectFill" />
            <view v-else class="cart-card__logo cart-card__logo--txt">{{ (g.name || '?').slice(0, 1) }}</view>
            <view class="cart-card__meta">
              <text class="cart-card__name">{{ g.name }}</text>
              <text class="cart-card__sub">{{ $t('cart.itemsCount').replace('{n}', String(g.order.totalQuantity || g.order.lines.length)) }}</text>
            </view>
          </view>
          <view class="cart-card__head-right">
            <text v-if="closedText(g)" class="cart-card__closed">{{ closedTag(g) }}</text>
            <text class="cart-card__clear" @click.stop="clearGroup(g)">{{ $t('cart.clear') }}</text>
          </view>
        </view>

        <view class="cart-line" v-for="l in g.order.lines" :key="l.id">
          <VImage :src="l.featuredAsset?.preview" width="96rpx" height="96rpx" class="cart-line__img" />
          <view class="cart-line__body">
            <text class="cart-line__name">{{ l.productVariant?.name }}</text>
            <text v-if="optionsText(l)" class="cart-line__opt">{{ optionsText(l) }}</text>
            <view class="cart-line__foot">
              <text class="cart-line__price">¥{{ fen(l.linePriceWithTax ?? l.unitPriceWithTax * l.quantity) }}</text>
              <text class="cart-line__qty">×{{ l.quantity }}</text>
            </view>
          </view>
        </view>

        <!-- 凑单进度：仅免配送费门槛用进度条（起送差额已在下方金额行展示） -->
        <view class="cart-progress" v-if="progress(g) && !gapFen(g)">
          <view class="cart-progress__bar"><view class="cart-progress__fill" :style="{ width: progress(g).pct + '%' }"></view></view>
          <text class="cart-progress__txt" :class="{ ok: progress(g).ok }">{{ progress(g).text }}</text>
        </view>

        <view class="cart-card__foot">
          <view class="cart-card__sum">
            <text class="cart-card__total">¥{{ fen(g.order.subTotalWithTax) }}</text>
            <text class="cart-card__gap" v-if="gapFen(g) > 0">{{ $t('cart.minGap').replace('{d}', yuan(gapFen(g))) }}</text>
            <text class="cart-card__gap cart-card__gap--ok" v-else>{{ $t('cart.minReached') }}</text>
          </view>
          <view class="cart-card__btns">
            <view class="cart-btn cart-btn--ghost" @click="enterStore(g)">{{ gapFen(g) > 0 ? $t('cart.topUp') : $t('cart.addMore') }}</view>
            <view class="cart-btn cart-btn--primary" :class="{ disabled: !!closedText(g) }" @click="goCheckout(g)">{{ closedText(g) ? $t('cart.closedBtn') : $t('cart.checkout') }}</view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow, onUnload } from '@dcloudio/uni-app';
import { fetchStoreList } from '../../api/queries/waimai';
import { getActiveOrderForChannel } from '../../api/queries/order';
import { removeAllOrderLinesForChannel } from '../../api/mutations/cart';
import { useTenantStore } from '../../stores/tenant';
import { useCartStore } from '../../stores/cart';
import { useAuthStore } from '../../stores/auth';
import { getSessionToken } from '../../api/client';
import { useLocaleStore } from '../../stores/locale';
import { getStoreStatus } from '../../utils/store-status';
import VImage from '../../components/VImage.vue';

const tenant = useTenantStore();
const cart = useCartStore();
const authStore = useAuthStore();
const locale = useLocaleStore();

interface CartGroup {
  token: string;
  channelId?: string;
  name: string;
  logo?: string;
  routes: string;
  minOrder?: number | null;
  deliveryFee?: number | null;
  freeShipping?: number | null;
  businessHours?: string | null;
  order: any;
}

const groups = ref<CartGroup[]>([]);
const loading = ref(false);

onShow(() => {
  void load();
});
onUnload(() => { void tenant.backToDefault(); });

async function load() {
  if (!authStore.isLoggedIn && !getSessionToken()) {
    groups.value = [];
    return;
  }
  loading.value = true;
  try {
    const stores = await fetchStoreList().catch(() => [] as any[]);
    const results = await Promise.allSettled(
      stores.map(async (s: any) => {
        const res: any = await getActiveOrderForChannel(s.channelToken);
        const order = res?.activeOrder;
        if (!order || !(order.lines ?? []).length) return null;
        return {
          token: s.channelToken,
          channelId: s.channelId != null ? String(s.channelId) : undefined,
          name: s.name,
          logo: s.logo,
          routes: (s.routesEnabled || []).join(','),
          minOrder: s.minOrderAmount,
          deliveryFee: s.deliveryFee,
          freeShipping: s.freeShippingThreshold,
          businessHours: s.businessHours,
          order,
        } as CartGroup;
      }),
    );
    groups.value = results
      .filter((r): r is PromiseFulfilledResult<CartGroup | null> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter((g): g is CartGroup => !!g);
  } finally {
    loading.value = false;
  }
}

function fen(v: any): string {
  return (Number(v || 0) / 100).toFixed(2);
}
function yuan(v: any): string {
  return (Math.round(Number(v || 0)) / 100).toFixed(2);
}
function gapFen(g: CartGroup): number {
  const min = Number(g.minOrder);
  if (!Number.isFinite(min) || min <= 0) return 0;
  return Math.max(0, Math.round(min) - Number(g.order?.subTotalWithTax || 0));
}
function optionsText(l: any): string {
  const opts = (l?.productVariant?.options ?? []).map((o: any) => o?.name).filter(Boolean);
  return opts.join(' / ');
}

/** 打烊提示：仅 closed 才拦截提交，closing 由店铺页提示 */
function closedText(g: CartGroup): string {
  const st = getStoreStatus(g.businessHours);
  if (st.state !== 'closed') return '';
  const key = st.nextOpenDayOffset === 1 ? 'menu.closedTomorrow' : 'menu.closedToday';
  return locale.t(key).replace('{t}', st.nextOpenHM);
}

/** 购物车头部窄条用的短文案，避免 300rpx 内被截断 */
function closedTag(g: CartGroup): string {
  const st = getStoreStatus(g.businessHours);
  if (st.state !== 'closed') return '';
  return locale.t('cart.closedTag').replace('{t}', st.nextOpenHM);
}

/** 凑单进度：未达起送价优先，其次免配送费门槛；都无配置返回 null 不占位 */
function progress(g: CartGroup): { pct: number; text: string; ok: boolean } | null {
  const sub = Number(g.order?.subTotalWithTax || 0);
  const min = Number(g.minOrder);
  if (Number.isFinite(min) && min > 0 && sub < min) {
    return { pct: Math.max(4, Math.round((sub / min) * 100)), text: locale.t('cart.minGap').replace('{d}', yuan(min - sub)), ok: false };
  }
  const free = Number(g.freeShipping);
  if (Number.isFinite(free) && free > 0 && Number(g.deliveryFee || 0) > 0) {
    if (sub < free) {
      return { pct: Math.max(4, Math.round((sub / free) * 100)), text: locale.t('cart.freeShipGap').replace('{d}', yuan(free - sub)), ok: false };
    }
    return { pct: 100, text: locale.t('cart.freeShipOk'), ok: true };
  }
  return null;
}

function enterStore(g: CartGroup) {
  const cid = g.channelId ? `&cid=${g.channelId}` : '';
  uni.navigateTo({
    url: `/pages/shop/menu?token=${encodeURIComponent(g.token)}&name=${encodeURIComponent(g.name)}&routes=${encodeURIComponent(g.routes)}${cid}`,
  });
}

async function clearGroup(g: CartGroup) {
  const done = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: locale.t('cart.clearTitle'),
      content: locale.t('cart.clearConfirm').replace('{s}', g.name),
      success: (r) => resolve(!!r.confirm),
      fail: () => resolve(false),
    });
  });
  if (!done) return;
  try {
    await removeAllOrderLinesForChannel(g.token);
    if (tenant.token === g.token) cart.clearCart();
    uni.showToast({ title: locale.t('cart.cleared'), icon: 'none' });
  } catch {
    uni.showToast({ title: locale.t('cart.clearFail'), icon: 'none' });
  }
  void load();
}

async function goCheckout(g: CartGroup) {
  const closed = closedText(g);
  if (closed) {
    uni.showToast({ title: closed, icon: 'none' });
    return;
  }
  if (gapFen(g) > 0) {
    uni.showToast({ title: locale.t('cart.minGap').replace('{d}', yuan(gapFen(g))), icon: 'none' });
    return;
  }
  await tenant.switchTenant(g.token);
  cart.setOrder(g.order);
  const cid = g.channelId ? `&cid=${g.channelId}` : '';
  const mo = g.minOrder ?? '';
  const fee = g.deliveryFee ?? '';
  uni.navigateTo({
    url: `/pkg-order/pages/checkout?routes=${encodeURIComponent(g.routes)}&minOrder=${mo}&dfee=${fee}${cid}&shop=${encodeURIComponent(g.name)}&token=${encodeURIComponent(g.token)}`,
  });
}

function goHome() {
  uni.switchTab({ url: '/pages/home/index' });
}
</script>

<style scoped lang="scss">
.cart-page { min-height: 100vh; background: $bg-color; padding: 20rpx 20rpx 40rpx; box-sizing: border-box; }
.cart-list { display: flex; flex-direction: column; gap: 20rpx; }
.cart-card { background: $surface; border-radius: $radius-md; padding: 24rpx;
  &__head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16rpx; border-bottom: 1rpx solid $border-color; }
  &__store { display: flex; align-items: center; gap: 16rpx; min-width: 0; }
  &__logo { width: 72rpx; height: 72rpx; border-radius: $radius-sm; background: $brand-color-light; flex-shrink: 0;
    &--txt { display: flex; align-items: center; justify-content: center; color: $brand-color; font-size: 32rpx; } }
  &__meta { display: flex; flex-direction: column; gap: 4rpx; min-width: 0; }
  &__name { font-size: 28rpx; font-weight: 600; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__sub { font-size: 22rpx; color: $text-color-secondary; }
  &__clear { font-size: 24rpx; color: $text-color-placeholder; padding: 8rpx; flex-shrink: 0; }
  &__head-right { display: flex; align-items: center; gap: 12rpx; flex-shrink: 0; }
  &__closed { font-size: 20rpx; color: #b42318; background: #fff2f0; border: 1rpx solid #f3b6b0; border-radius: 6rpx; padding: 2rpx 8rpx; max-width: 300rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__foot { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin-top: 20rpx; padding-top: 20rpx; border-top: 1rpx solid $border-color; }
  &__sum { display: flex; flex-direction: column; gap: 4rpx; }
  &__total { font-size: 32rpx; font-weight: 600; color: $price-color; }
  &__gap { font-size: 22rpx; color: $brand-color;
    &--ok { color: $text-color-secondary; } }
  &__btns { display: flex; gap: 12rpx; }
}
/* 凑单进度条 */
.cart-progress { display: flex; align-items: center; gap: 16rpx; margin-top: 16rpx;
  &__bar { flex: 1; height: 10rpx; border-radius: 999rpx; background: $brand-color-light; overflow: hidden; }
  &__fill { height: 100%; border-radius: 999rpx; background: $brand-color; transition: width 0.2s; }
  &__txt { font-size: 22rpx; color: $brand-color; flex-shrink: 0; }
  &__txt.ok { color: #2e7d32; }
}
.cart-line { display: flex; gap: 16rpx; padding: 18rpx 0; border-bottom: 1rpx solid $border-color;
  &__img { border-radius: $radius-sm; background: $bg-color; flex-shrink: 0; }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
  &__name { font-size: 26rpx; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__opt { font-size: 22rpx; color: $text-color-secondary; }
  &__foot { display: flex; align-items: center; justify-content: space-between; }
  &__price { font-size: 26rpx; color: $price-color; }
  &__qty { font-size: 24rpx; color: $text-color-secondary; }
}
.cart-btn { height: 72rpx; line-height: 72rpx; padding: 0 32rpx; border-radius: 999rpx; font-size: 26rpx; text-align: center;
  &--ghost { background: $bg-color; color: $text-color-secondary; border: 1rpx solid $border-color; }
  &--primary { background: $brand-color; color: #fff; }
  &--primary.disabled { background: $text-color-placeholder; opacity: 0.7; }
}
.cart-empty { min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16rpx;
  &__ico { font-size: 84rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; }
  &__btn { margin-top: 12rpx; background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; padding: 0 56rpx; height: 80rpx; line-height: 80rpx; }
}
</style>
