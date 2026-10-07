<template>
    <view class="menu-page" :class="{ dark: theme === 'dark' }">
        <view class="hero"></view>
        <!-- 店铺信息卡（浮出压橙头） -->
        <view class="shopcard">
            <view class="shop-top">
                <view class="logo">{{ shopName.slice(0, 1) }}</view>
                <view class="shop-main">
                    <text class="sname">{{ shopName }}</text>
                    <text class="smeta">{{ routesText }}</text>
                </view>
            </view>
            <view class="tags" v-if="promoText">
                <text class="tag">🔥 {{ promoText }}</text>
            </view>
        </view>
        <!-- 三 Tab -->
        <view class="tabs">
            <view class="tb" :class="{ on: tab === 'goods' }" @tap="switchTab('goods')">商品</view>
            <view class="tb" :class="{ on: tab === 'reviews' }" @tap="switchTab('reviews')">评论</view>
            <view class="tb" :class="{ on: tab === 'merchant' }" @tap="switchTab('merchant')">商家</view>
        </view>

        <!-- 商品：左分类右商品 -->
        <view class="panel" v-show="tab === 'goods'">
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
                            <text class="good-desc">{{ plainDescription(g.description) }}</text>
                            <view class="good-rate" v-if="g.customFields?.reviewCount > 0">
                                <text class="good-rate__star">★</text>
                                <text class="good-rate__num">{{ (g.customFields.reviewRating || 0).toFixed(1) }}</text>
                                <text class="good-rate__cnt">{{ g.customFields.reviewCount }}条评价</text>
                            </view>
                            <view class="good-coupon" v-if="couponOf(g)" @tap.stop="claimProduct(couponOf(g))">
                                <text class="good-coupon__txt">{{ couponChipText(couponOf(g)) }}</text>
                                <text class="good-coupon__action">{{ couponClaimed(g.id) ? '已领取' : '领取' }}</text>
                            </view>
                            <view class="price-row">
                                <PriceTag :price="g.variants[0]?.priceWithTax || 0" />
                            </view>
                        </view>
                        <view class="add-btn spec" v-if="(g.variants?.length ?? 0) > 1" @tap.stop="pickSku(g)">选规格</view>
                        <view class="add-btn" v-else @tap.stop="addToCart(g)">+</view>
                    </view>
                    <view class="scroll-pad"></view>
                    <EmptyState v-if="!goodsOf(activeCat).length" text="该分类暂无商品" />
                </scroll-view>
            </view>
        </view>

        <!-- 评论：A 版式（摘要卡 + 筛选 chips + 评论列表，首切加载） -->
        <scroll-view scroll-y class="panel solo" v-show="tab === 'reviews'" @scrolltolower="loadMoreReviews">
            <view class="rv-summary" v-if="reviewStats && reviewStats.totalCount > 0">
                <view class="rv-sum-top">
                    <view class="rv-score">
                        <text class="rv-score__num">{{ reviewStats.averageRating }}</text>
                        <text class="rv-score__lab">综合评分</text>
                    </view>
                    <view class="rv-dist">
                        <view v-for="d in reviewStats.ratingDistribution" :key="d.rating" class="rv-dist__row">
                            <text class="rv-dist__star">{{ d.rating }}★</text>
                            <view class="rv-dist__bar"><view class="rv-dist__fill" :style="{ width: distWidth(d.count) }"></view></view>
                            <text class="rv-dist__pct">{{ distPct(d.count) }}</text>
                        </view>
                    </view>
                </view>
                <view class="rv-sum-foot">
                    <text>共 {{ reviewStats.totalCount }} 条评价</text>
                    <text>好评率 {{ reviewStats.goodRate }}%</text>
                </view>
            </view>
            <view class="rv-chips">
                <view
                    v-for="f in reviewFilters" :key="f.key"
                    class="rv-chip" :class="{ on: reviewFilter === f.key }"
                    @tap="switchReviewFilter(f.key)"
                >{{ f.label }}</view>
            </view>
            <view v-for="r in reviewList" :key="r.id" class="rv-item">
                <view class="rv-head">
                    <view class="rv-avatar">{{ displayName(r) }}</view>
                    <view class="rv-who">
                        <text class="rv-name">{{ displayName(r, true) }}</text>
                        <text class="rv-stars">{{ '★'.repeat(r.rating) }}<text class="off">{{ '★'.repeat(5 - r.rating) }}</text></text>
                    </view>
                    <text class="rv-date">{{ formatDate(r.createdAt) }}</text>
                </view>
                <text class="rv-content">{{ r.content }}</text>
                <view v-if="r.images?.length" class="rv-imgs">
                    <VImage v-for="(img, i) in r.images" :key="i" :src="img" width="150rpx" height="150rpx" />
                </view>
                <view v-if="r.tags?.length" class="rv-tags">
                    <text v-for="(t, i) in r.tags" :key="i" class="rv-tag">{{ t }}</text>
                </view>
                <view v-if="r.reply" class="rv-reply"><text class="rv-reply__who">商家回复</text>{{ r.reply }}</view>
                <view v-for="fu in r.followUps ?? []" :key="fu.id" class="rv-reply">
                    <text class="rv-reply__who">追加评价</text>{{ fu.content }}
                </view>
            </view>
            <view v-if="reviewLoading" class="rv-more">加载中…</view>
            <view v-else-if="reviewList.length && !reviewHasMore" class="rv-more">没有更多了</view>
            <EmptyState v-if="!reviewLoading && !reviewList.length" text="商家暂无评价，下单后评价将在这里展示" />
            <view class="scroll-pad"></view>
        </scroll-view>

        <!-- 商家：店铺信息 -->
        <scroll-view scroll-y class="panel solo" v-show="tab === 'merchant'">
            <view class="mcard">
                <view class="mrow"><text class="mico">🏪</text><text class="mval">{{ shopName }}</text></view>
                <view class="mrow"><text class="mico">🛵</text><text class="mlab">配送服务：</text><text class="mval">{{ routeDetailText }}</text></view>
                <view class="mrow"><text class="mico">🕐</text><text class="mlab">营业时间：</text><text class="mval">10:00–22:00</text></view>
                <view class="mrow"><text class="mico">📍</text><text class="mlab">配送范围：</text><text class="mval">校内宿舍楼与教学楼</text></view>
                <view class="mrow" v-if="storeInfo?.storeAddress"><text class="mico">🏠</text><text class="mlab">店铺地址：</text><text class="mval">{{ storeInfo.storeAddress }}</text></view>
                <view class="mrow" v-if="storeInfo?.storePhone"><text class="mico">📞</text><text class="mlab" @tap="callStore">联系电话：</text><text class="mval" @tap="callStore">{{ storeInfo.storePhone }}</text></view>
            </view>
            <view class="mcard" v-if="promoText || storeInfo?.storeNotice">
                <view class="mrow" v-if="storeInfo?.storeNotice"><text class="mico">📣</text><text class="mlab">店铺公告：</text><text class="mval">{{ storeInfo.storeNotice }}</text></view>
                <view class="mrow" v-if="promoText"><text class="mico">📢</text><text class="mlab">店铺活动：</text><text class="mval">{{ promoText }}</text></view>
            </view>
            <view class="mcard">
                <view class="msrv">
                    <text>商家服务</text>
                    <text class="tag">拾光达配送</text>
                    <text class="tag">拾光传信者接力送达</text>
                </view>
            </view>
        </scroll-view>

        <!-- 购物车悬浮胶囊 -->
        <view class="cart-bar" @tap="goCheckout">
            <view class="cart-btn">
                🛒
                <view class="cart-count" v-if="cartCount">{{ cartCount }}</view>
            </view>
            <view class="cart-total">
                <text class="empty-hint" v-if="!cartCount">购物车空空如也~</text>
                <block v-else>
                    <text class="sum">合计 ¥{{ cart.formatPrice(cartTotal) }}</text>
                </block>
            </view>
            <view class="checkout-btn" :class="{ disabled: !cartCount }">去结算</view>
        </view>
        <SkuSheet v-model:visible="skuOpen" :product="skuProduct" @action="onSkuAction" />
    </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { useTenantStore } from '../../stores/tenant';
import { useCartStore } from '../../stores/cart';
import { useAuthStore } from '../../stores/auth';
import { fetchProductList, fetchStoreList } from '../../api/queries/waimai';
import { getProductCoupons } from '../../api/queries/coupon';
import { getChannelReviews, getChannelReviewStats } from '../../api/queries/review';
import { plainDescription, routeText, routeDetail } from '../../utils/store-display';
import { theme, initTheme } from '../../utils/theme';
import { addItemToOrder } from '../../api/mutations/cart';
import { claimProductCoupon } from '../../api/mutations/coupon';
import { getActiveOrder } from '../../api/queries/order';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import EmptyState from '../../components/EmptyState.vue';
import SkuSheet from '../../components/SkuSheet.vue';

const tenant = useTenantStore();
const cart = useCartStore();
const authStore = useAuthStore();
const shopToken = ref('');
const shopRoutes = ref('');
const shopName = ref('校内店铺');
const routesText = ref('拾光传信者配送');
const promoText = ref('');
const storeInfo = ref<any>(null);
const tab = ref<'goods' | 'reviews' | 'merchant'>('goods');
const cats = ref([{ id: 'all', name: '全部' }]);
const activeCat = ref('all');
const products = ref<any[]>([]);
const skuOpen = ref(false);
const skuProduct = ref<any>(null);

const cartCount = computed(() => cart.totalQuantity);
const cartTotal = computed(() => cart.totalPrice);
const routeDetailText = computed(() =>
    routeDetail(shopRoutes.value.split(',').filter(Boolean)).join('、') || '暂未开通配送'
);

// ── 评论 tab（A 版式：摘要卡 + chips + 列表，首切 tab 才拉取） ──
type ReviewFilterKey = 'all' | 'images' | 'good' | 'bad';
const REVIEW_PAGE_SIZE = 10;
const reviewFilters: { key: ReviewFilterKey; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'images', label: '有图' },
    { key: 'good', label: '好评' },
    { key: 'bad', label: '差评' },
];
const reviewFilter = ref<ReviewFilterKey>('all');
const reviewList = ref<any[]>([]);
const reviewTotal = ref(0);
const reviewStats = ref<any>(null);
const reviewLoading = ref(false);
const reviewLoadingMore = ref(false);
const reviewLoaded = ref(false);
const reviewHasMore = computed(() => reviewList.value.length < reviewTotal.value);

function switchTab(t: 'goods' | 'reviews' | 'merchant') {
    tab.value = t;
    if (t === 'reviews' && !reviewLoaded.value) {
        reviewLoaded.value = true;
        loadReviewStats();
        loadReviews(true);
    }
}

function reviewOptions(key: ReviewFilterKey) {
    if (key === 'images') return { hasImages: true };
    if (key === 'good') return { ratingMin: 4 };
    if (key === 'bad') return { ratingMax: 3 };
    return {};
}

async function loadReviews(reset: boolean) {
    if (reset) reviewLoading.value = true;
    else reviewLoadingMore.value = true;
    try {
        const options = {
            skip: reset ? 0 : reviewList.value.length,
            take: REVIEW_PAGE_SIZE,
            ...reviewOptions(reviewFilter.value),
        };
        const res: any = await getChannelReviews(options);
        const items = res?.channelReviews?.items ?? [];
        reviewTotal.value = res?.channelReviews?.totalItems ?? 0;
        reviewList.value = reset ? items : [...reviewList.value, ...items];
    } catch {
        if (reset) { reviewList.value = []; reviewTotal.value = 0; }
    } finally {
        reviewLoading.value = false;
        reviewLoadingMore.value = false;
    }
}

async function loadReviewStats() {
    try {
        const res: any = await getChannelReviewStats();
        reviewStats.value = res?.channelReviewStats ?? null;
    } catch { reviewStats.value = null; }
}

function switchReviewFilter(key: ReviewFilterKey) {
    if (reviewFilter.value === key) return;
    reviewFilter.value = key;
    loadReviews(true);
}

function loadMoreReviews() {
    if (!reviewHasMore.value || reviewLoadingMore.value || reviewLoading.value) return;
    loadReviews(false);
}

function displayName(r: any, nameOnly = false) {
    if (r.isAnonymous) return nameOnly ? '匿名用户' : '匿';
    return r.customerName?.slice(0, 1) || '评';
}

function formatDate(d: string) {
    return d ? new Date(d).toLocaleDateString('zh-CN') : '';
}

function distWidth(count: number) {
    const dist: number[] = (reviewStats.value?.ratingDistribution ?? []).map((d: any) => d.count);
    const max = Math.max(...dist, 1);
    return `${Math.round((count / max) * 100)}%`;
}

function distPct(count: number) {
    const total = reviewStats.value?.totalCount ?? 0;
    return total ? `${Math.round((count / total) * 100)}%` : '0%';
}

onLoad(async (q: any) => {
    initTheme();
    shopToken.value = q?.token ?? '';
    shopRoutes.value = decodeURIComponent(q?.routes ?? '');
    shopName.value = decodeURIComponent(q?.name ?? '') || '校内店铺';
    routesText.value = routeText(shopRoutes.value.split(',').filter(Boolean));
    promoText.value = decodeURIComponent(q?.promo ?? '');
    // 店铺配置（地址/电话/公告/时长）：waimaiStoreList 按渠道 token 找本店；无配置行 → null 走页面兜底
    fetchStoreList().then((list: any[]) => {
        storeInfo.value = list.find((s: any) => s.channelToken === shopToken.value) ?? null;
    }).catch(() => { storeInfo.value = null; });
    uni.setNavigationBarTitle({ title: shopName.value });
    // 关键：切到店铺渠道（activeOrder 随 session+渠道隔离 = 每店独立购物车）
    await tenant.switchTenant(shopToken.value);
    try {
        // 恢复本店已加购的 activeOrder（切渠道后 session 内该渠道购物车）
        const active: any = await getActiveOrder().catch(() => null);
        if (active?.activeOrder) cart.setOrder(active.activeOrder);
        products.value = await fetchProductList();
        cats.value = buildCats(products.value);
        loadProductCoupons(goodsOf(activeCat.value));
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
        // 「全部」已作为内置首项，避免分类列表出现重复项
        if (name !== '全部' && !names.includes(name)) names.push(name);
    });
    return [{ id: 'all', name: '全部' }, ...names.map(n => ({ id: n, name: n }))];
}

function goodsOf(catId: string) {
    if (catId === 'all') return products.value;
    return products.value.filter(p => p.collections?.some((c: any) => c.name === catId));
}

// ===== 商品专属券 chip：按当前分类商品拉绑定，productId → 绑定（取首个启用项） =====
const productCouponMap = ref(new Map<string, any>());
const claimedProductIds = ref(new Set<string>());
const claimingProductId = ref('');

function couponOf(g: any): any | null {
    const b = productCouponMap.value.get(String(g.id));
    return b && b.enabled && b.template?.enabled !== false ? b : null;
}

function couponChipText(b: any): string {
    const t = b.template;
    if (t.type === 'FIXED' || t.type === 'FULL') {
        const yuan = t.discountValue / 100;
        const y = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
        return `¥${y} 券`;
    }
    if (t.type === 'PERCENT') return `${(t.discountValue / 10).toFixed(1).replace(/\.0$/, '')}折券`;
    return '免配送费券';
}

function couponClaimed(productId: string): boolean {
    return claimedProductIds.value.has(String(productId));
}

async function loadProductCoupons(goods: any[]) {
    const ids = goods.map(g => String(g.id)).filter(id => !productCouponMap.value.has(id));
    if (!ids.length) return;
    await Promise.all(ids.map(async id => {
        try {
            const res = await getProductCoupons(id);
            const binding = (res?.productCoupons ?? []).filter((b: any) => b.enabled)[0] ?? null;
            productCouponMap.value.set(id, binding);
        } catch { productCouponMap.value.set(id, null); }
    }));
    productCouponMap.value = new Map(productCouponMap.value); // 触发响应式
}

async function claimProduct(binding: any) {
    if (claimedProductIds.value.has(String(binding.productId)) || claimingProductId.value) return;
    if (!authStore.requireLogin()) return;
    claimingProductId.value = String(binding.productId);
    try {
        await claimProductCoupon(binding.id);
        claimedProductIds.value.add(String(binding.productId));
        uni.showToast({ title: '领取成功', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '领取失败', icon: 'none' });
    } finally {
        claimingProductId.value = '';
    }
}

watch(activeCat, () => { loadProductCoupons(goodsOf(activeCat.value)); });

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

function callStore() {
    const p = storeInfo.value?.storePhone;
    if (p) uni.makePhoneCall({ phoneNumber: p });
}

function goCheckout() {
    if (!cartCount.value) return;
    const routes = encodeURIComponent(shopRoutes.value);
    const mo = storeInfo.value?.minOrderAmount ?? '';
    const fee = storeInfo.value?.deliveryFee ?? '';
    uni.navigateTo({ url: `/pkg-order/pages/checkout?routes=${routes}&minOrder=${mo}&dfee=${fee}` });
}
</script>

<style scoped lang="scss">
/* ── 双主题 token（同首页 --w-* 体系） ── */
.menu-page {
    --w-bg: #f5f5f5;
    --w-surface: #ffffff;
    --w-surface-muted: #f0f0f0;
    --w-text: #1a1a1a;
    --w-text-muted: #999999;
    --w-border: #ececec;
    --w-brand-soft: #fff3e6;
    --w-brand-text: #ff6600;
    --w-cart: #1f1f23;

    position: relative;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--w-bg);
}
/* #ifdef H5 */
/* uni H5 页头 44px 占位，否则整页可滚 44px、购物车条被顶出视口 */
.menu-page { height: calc(100vh - 44px); }
/* #endif */
.menu-page.dark {
    --w-bg: #161618;
    --w-surface: #242428;
    --w-surface-muted: #1e1e21;
    --w-text: #ececf0;
    --w-text-muted: #9a9aa3;
    --w-border: #35353a;
    --w-brand-soft: rgba(255, 102, 0, 0.16);
    --w-brand-text: #ff8a3d;
    --w-cart: #0d0d0f;
}
/* ── 橙头 + 浮出信息卡（版式 A） ── */
.hero { height: 96rpx; background: $brand; flex-shrink: 0; }
.shopcard { margin: -72rpx 24rpx 0; background: var(--w-surface); border-radius: $radius-card; padding: 24rpx; position: relative; flex-shrink: 0; box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.08); }
.shop-top { display: flex; gap: 20rpx; align-items: flex-start; }
.logo { width: 88rpx; height: 88rpx; border-radius: $radius; background: var(--w-brand-soft); color: var(--w-brand-text); display: flex; align-items: center; justify-content: center; font-size: 40rpx; font-weight: 600; flex-shrink: 0; }
.shop-main { flex: 1; min-width: 0; }
.sname { display: block; font-size: 32rpx; font-weight: 600; color: var(--w-text); line-height: 1.3; }
.smeta { display: block; font-size: 22rpx; color: var(--w-brand-text); margin-top: 8rpx; }
.smeta em { font-style: normal; color: var(--w-text-muted); }
.tags { display: flex; gap: 12rpx; margin-top: 16rpx; flex-wrap: wrap; }
.tag { font-size: 20rpx; color: var(--w-brand-text); background: var(--w-brand-soft); border-radius: 8rpx; padding: 4rpx 12rpx; }
/* ── Tab 行 ── */
.tabs { display: flex; gap: 48rpx; padding: 0 32rpx; border-bottom: 1rpx solid var(--w-border); flex-shrink: 0; }
.tb { padding: 20rpx 0; font-size: 28rpx; color: var(--w-text-muted); border-bottom: 4rpx solid transparent; margin-bottom: -1rpx; }
.tb.on { color: var(--w-text); font-weight: 600; border-bottom-color: $brand; }
/* ── 商品面板 ── */
.panel { flex: 1; min-height: 0; }
.body { display: flex; height: 100%; }
.cats { width: 176rpx; background: var(--w-surface-muted); height: 100%; flex-shrink: 0; }
.cat { padding: 28rpx 16rpx; font-size: 26rpx; color: var(--w-text-muted); }
.cat.on { background: var(--w-surface); color: var(--w-text); font-weight: 600; border-left: 6rpx solid $brand; }
.goods { flex: 1; background: var(--w-surface); padding: 8rpx 24rpx 0; box-sizing: border-box; height: 100%; }
.good { display: flex; gap: 16rpx; padding: 20rpx 0; border-bottom: 1rpx solid var(--w-border); position: relative; }
.good-img { flex-shrink: 0; background: var(--w-surface-muted); border-radius: $radius; overflow: hidden; }
.good-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; padding-right: 120rpx; }
.good-name { font-size: 28rpx; font-weight: 600; color: var(--w-text); }
.good-desc { font-size: 22rpx; color: var(--w-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.good-rate { display: flex; align-items: center; gap: 6rpx; font-size: 22rpx; }
.good-rate__star { color: #f59e0b; font-size: 22rpx; }
.good-rate__num { color: #f59e0b; font-weight: 600; }
.good-rate__cnt { color: var(--w-text-muted); }
.price-row { margin-top: 4rpx; }
.good-coupon { display: inline-flex; align-items: center; gap: 8rpx; margin-top: 8rpx; padding: 2rpx 12rpx; border: 1rpx solid #ff6600; border-radius: 6rpx; background: #fff7f0; }
.good-coupon__txt { font-size: 20rpx; color: #ff6600; }
.good-coupon__action { font-size: 20rpx; color: #fff; background: #ff6600; border-radius: 4rpx; padding: 0 8rpx; }
.add-btn { position: absolute; right: 0; bottom: 20rpx; min-width: 56rpx; height: 56rpx; border-radius: 999rpx; background: $brand; color: #fff; font-size: 36rpx; display: flex; align-items: center; justify-content: center; }
.add-btn.spec { font-size: 22rpx; padding: 0 20rpx; font-weight: 600; }
.scroll-pad { height: 150rpx; }
/* ── 评论 / 商家面板 ── */
.solo { padding-bottom: 160rpx; box-sizing: border-box; }
/* ── 评论 A 版式 ── */
.rv-summary { background: var(--w-surface); border-radius: $radius-card; margin: 20rpx 24rpx 0; padding: 24rpx; }
.rv-sum-top { display: flex; gap: 32rpx; align-items: center; }
.rv-score { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 4rpx; }
.rv-score__num { font-size: 64rpx; font-weight: 700; color: var(--w-text); line-height: 1.1; }
.rv-score__lab { font-size: 22rpx; color: var(--w-text-muted); }
.rv-dist { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8rpx; }
.rv-dist__row { display: flex; align-items: center; gap: 12rpx; }
.rv-dist__star { font-size: 20rpx; color: var(--w-text-muted); flex-shrink: 0; width: 44rpx; }
.rv-dist__bar { flex: 1; height: 12rpx; border-radius: 999rpx; background: var(--w-surface-muted); overflow: hidden; }
.rv-dist__fill { height: 100%; border-radius: 999rpx; background: #f59e0b; }
.rv-dist__pct { font-size: 20rpx; color: var(--w-text-muted); flex-shrink: 0; width: 64rpx; text-align: right; }
.rv-sum-foot { display: flex; justify-content: space-between; margin-top: 20rpx; padding-top: 20rpx; border-top: 1rpx solid var(--w-border); font-size: 24rpx; color: var(--w-text-muted); }
.rv-chips { display: flex; gap: 16rpx; padding: 24rpx 24rpx 0; flex-wrap: wrap; }
.rv-chip { font-size: 24rpx; color: var(--w-text-muted); background: var(--w-surface); border: 1rpx solid var(--w-border); border-radius: 999rpx; padding: 10rpx 28rpx; }
.rv-chip.on { color: var(--w-brand-text); background: var(--w-brand-soft); border-color: transparent; font-weight: 600; }
.rv-item { background: var(--w-surface); border-radius: $radius-card; margin: 20rpx 24rpx 0; padding: 24rpx; display: flex; flex-direction: column; gap: 16rpx; }
.rv-head { display: flex; align-items: center; gap: 16rpx; }
.rv-avatar { width: 64rpx; height: 64rpx; border-radius: 999rpx; background: var(--w-brand-soft); color: var(--w-brand-text); font-size: 26rpx; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.rv-who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
.rv-name { font-size: 26rpx; color: var(--w-text); font-weight: 500; }
.rv-stars { font-size: 22rpx; color: #f59e0b; .off { color: var(--w-border); } }
.rv-date { font-size: 22rpx; color: var(--w-text-muted); flex-shrink: 0; }
.rv-content { font-size: 26rpx; color: var(--w-text); line-height: 1.6; }
.rv-imgs { display: flex; gap: 12rpx; flex-wrap: wrap; }
.rv-tags { display: flex; gap: 12rpx; flex-wrap: wrap; }
.rv-tag { font-size: 20rpx; color: var(--w-brand-text); background: var(--w-brand-soft); border-radius: 8rpx; padding: 4rpx 12rpx; }
.rv-reply { background: var(--w-surface-muted); border-radius: 12rpx; padding: 16rpx; font-size: 24rpx; color: var(--w-text-muted); line-height: 1.5; }
.rv-reply__who { color: var(--w-brand-text); margin-right: 12rpx; font-weight: 500; }
.rv-more { text-align: center; font-size: 24rpx; color: var(--w-text-muted); padding: 32rpx 0 0; }
.mcard { background: var(--w-surface); border-radius: $radius-card; margin: 20rpx 24rpx 0; padding: 8rpx 24rpx; }
.mrow { display: flex; gap: 12rpx; align-items: flex-start; padding: 24rpx 0; border-bottom: 1rpx solid var(--w-border); font-size: 26rpx; }
.mrow:last-child { border-bottom: 0; }
.mico { flex-shrink: 0; }
.mlab { color: var(--w-text-muted); flex-shrink: 0; }
.mval { color: var(--w-text); flex: 1; }
.msrv { display: flex; gap: 12rpx; align-items: center; padding: 20rpx 0; font-size: 24rpx; color: var(--w-text-muted); flex-wrap: wrap; }
/* ── 购物车悬浮胶囊 ── */
.cart-bar { position: absolute; left: 24rpx; right: 24rpx; bottom: calc(24rpx + env(safe-area-inset-bottom)); height: 96rpx; background: var(--w-cart); border-radius: 999rpx; display: flex; align-items: center; padding-right: 8rpx; box-shadow: 0 12rpx 32rpx rgba(0, 0, 0, 0.28); z-index: 50; }
.cart-btn { width: 96rpx; height: 96rpx; border-radius: 999rpx; background: $brand; display: flex; align-items: center; justify-content: center; font-size: 40rpx; margin-top: -36rpx; border: 6rpx solid var(--w-bg); position: relative; flex-shrink: 0; }
.cart-count { position: absolute; top: -10rpx; right: -10rpx; min-width: 36rpx; height: 36rpx; border-radius: 999rpx; background: $surface; color: $brand; font-size: 20rpx; display: flex; align-items: center; justify-content: center; font-weight: 600; padding: 0 6rpx; }
.cart-total { flex: 1; padding-left: 20rpx; min-width: 0; }
.empty-hint { font-size: 26rpx; color: rgba(255, 255, 255, 0.75); }
.sum { display: block; font-size: 32rpx; font-weight: 600; color: #fff; }
.checkout-btn { background: $brand; color: #fff; border-radius: 999rpx; padding: 20rpx 44rpx; font-size: 26rpx; font-weight: 600; flex-shrink: 0; }
.checkout-btn.disabled { opacity: 0.4; }
</style>
