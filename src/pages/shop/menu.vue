<template>
    <view class="menu-page">
        <view class="notice" v-if="promoText">{{ promoText }}</view>
        <view class="body">
            <scroll-view scroll-y class="cats">
                <view v-for="c in cats" :key="c.id" class="cat" :class="{ on: c.id === activeCat }" @tap="activeCat = c.id">
                    {{ c.name }}
                </view>
            </scroll-view>
            <scroll-view scroll-y class="goods">
                <view v-for="g in goodsOf(activeCat)" :key="g.id" class="good" @tap="pickSku(g)">
                    <VImage :src="g.featuredAsset?.preview" width="140rpx" height="140rpx" class="good-img" />
                    <view class="good-info">
                        <text class="good-name">{{ g.name }}</text>
                        <text class="good-desc">{{ g.description }}</text>
                        <PriceTag :price="g.variants[0]?.priceWithTax || 0" />
                    </view>
                    <view class="add-btn" @tap.stop="addToCart(g)">+</view>
                </view>
                <EmptyState v-if="!goodsOf(activeCat).length" text="该分类暂无商品" />
            </scroll-view>
        </view>
        <view class="cart-bar" @tap="goCheckout">
            <view class="cart-count" v-if="cartCount">{{ cartCount }}</view>
            <text class="cart-total">合计 ¥{{ cart.formatPrice(cartTotal) }}</text>
            <view class="checkout-btn" :class="{ disabled: !cartCount }">去结算</view>
        </view>
        <SkuSheet v-model:visible="skuOpen" :product="skuProduct" @action="onSkuAction" />
    </view>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { useTenantStore } from '../../stores/tenant';
import { useCartStore } from '../../stores/cart';
import { fetchProductList } from '../../api/queries/waimai';
import { addItemToOrder } from '../../api/mutations/cart';
import { getActiveOrder } from '../../api/queries/order';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import EmptyState from '../../components/EmptyState.vue';
import SkuSheet from '../../components/SkuSheet.vue';

const tenant = useTenantStore();
const cart = useCartStore();
const shopToken = ref('');
const shopRoutes = ref('');
const promoText = ref('');
const cats = ref([{ id: 'all', name: '全部' }]);
const activeCat = ref('all');
const products = ref<any[]>([]);
const skuOpen = ref(false);
const skuProduct = ref<any>(null);

const cartCount = computed(() => cart.totalQuantity);
const cartTotal = computed(() => cart.totalPrice);

onLoad(async (q: any) => {
    shopToken.value = q?.token ?? '';
    shopRoutes.value = decodeURIComponent(q?.routes ?? '');
    promoText.value = decodeURIComponent(q?.promo ?? '');
    // 关键：切到店铺渠道（activeOrder 随 session+渠道隔离 = 每店独立购物车）
    await tenant.switchTenant(shopToken.value);
    try {
        // 恢复本店已加购的 activeOrder（切渠道后 session 内该渠道购物车）
        const active: any = await getActiveOrder().catch(() => null);
        if (active?.activeOrder) cart.setOrder(active.activeOrder);
        products.value = await fetchProductList();
        cats.value = buildCats(products.value);
    } catch (e: any) {
        // 切渠道失败（token 无效）→ 提示并返回首页
        uni.showToast({ title: '店铺不存在', icon: 'none' });
        setTimeout(() => uni.redirectTo({ url: '/pages/home/index' }), 800);
    }
});

// 返回站点默认渠道：orders/profile 等聚合页不受店铺 token 影响（各店购物车由 session+渠道隔离保留）
onUnload(() => { void tenant.backToDefault(); });
onUnmounted(() => { void tenant.backToDefault(); });

function buildCats(list: any[]) {
    const names: string[] = [];
    list.forEach(p => {
        const name = p.collections?.find((c: any) => c.parent?.name === '__root_collection__')?.name
            || p.collections?.[0]?.name || '全部';
        if (!names.includes(name)) names.push(name);
    });
    return [{ id: 'all', name: '全部' }, ...names.map(n => ({ id: n, name: n }))];
}

function goodsOf(catId: string) {
    if (catId === 'all') return products.value;
    return products.value.filter(p => p.collections?.some((c: any) => c.name === catId));
}

function pickSku(g: any) {
    if ((g.variants?.length ?? 0) > 1) { skuProduct.value = g; skuOpen.value = true; }
    else addToCart(g);
}

async function doAddItem(variantId: string, quantity: number) {
    const res: any = await addItemToOrder(variantId, quantity);
    if (res?.addItemToOrder?.errorCode) {
        uni.showToast({ title: res.addItemToOrder.message || '加购失败', icon: 'none' });
        return false;
    }
    cart.setOrder(res.addItemToOrder);
    return true;
}

async function addToCart(g: any) {
    const ok = await doAddItem(g.variants[0].id, 1);
    if (ok) uni.showToast({ title: '已加购', icon: 'none' });
}

async function onSkuAction(v: { action: 'cart' | 'buy'; variantId: string; quantity: number }) {
    const ok = await doAddItem(v.variantId, v.quantity);
    if (ok) {
        skuOpen.value = false;
        if (v.action === 'buy') goCheckout();
    }
}

function goCheckout() {
    if (!cartCount.value) return;
    const routes = encodeURIComponent(shopRoutes.value);
    uni.navigateTo({ url: `/pkg-order/pages/checkout?routes=${routes}` });
}
</script>

<style scoped lang="scss">
.menu-page { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
/* #ifdef H5 */
/* uni H5 页头 44px 占位，否则整页可滚 44px、购物车条被顶出视口 */
.menu-page { height: calc(100vh - 44px); }
/* #endif */
.notice { background: $brand-soft; color: $brand; font-size: 24rpx; padding: 12rpx 24rpx; flex-shrink: 0; }
.body { flex: 1; display: flex; overflow: hidden; min-height: 0; }
.cats { width: 176rpx; background: $bg; height: 100%; flex-shrink: 0; }
.cat { padding: 28rpx 16rpx; font-size: 26rpx; color: $text-muted; }
.cat.on { background: $surface; color: $text; font-weight: 600; border-left: 6rpx solid $brand; }
.goods { flex: 1; background: $surface; padding: 16rpx; box-sizing: border-box; height: 100%; }
.good { display: flex; gap: 16rpx; padding: 16rpx 0; border-bottom: 1rpx solid #f0f0f0; position: relative; }
.good-img { flex-shrink: 0; background: $bg; border-radius: $radius; overflow: hidden; }
.good-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; padding-right: 80rpx; }
.good-name { font-size: 28rpx; font-weight: 600; color: $text; }
.good-desc { font-size: 22rpx; color: $text-muted; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.add-btn { position: absolute; right: 8rpx; bottom: 16rpx; width: 56rpx; height: 56rpx; border-radius: 999rpx; background: $brand; color: #fff; font-size: 36rpx; text-align: center; line-height: 52rpx; }
.cart-bar { display: flex; align-items: center; background: $surface; padding: 16rpx 24rpx; padding-bottom: calc(16rpx + env(safe-area-inset-bottom)); box-shadow: 0 -4rpx 16rpx rgba(0,0,0,.06); position: relative; }
.cart-count { position: absolute; left: 12rpx; top: -10rpx; min-width: 36rpx; height: 36rpx; border-radius: 999rpx; background: $brand; color: #fff; font-size: 22rpx; text-align: center; line-height: 36rpx; z-index: 1; }
.cart-total { flex: 1; font-size: 32rpx; font-weight: 600; color: $text; }
.checkout-btn { background: $brand; color: #fff; border-radius: 999rpx; padding: 16rpx 48rpx; font-size: 28rpx; }
.checkout-btn.disabled { opacity: .5; }
</style>
