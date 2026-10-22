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
                <view class="share-btn" @tap.stop="shareShop">
                    <text class="share-ico">↗</text>
                    <text class="share-txt">{{ $t('menu.share') }}</text>
                </view>
                <view class="fav-btn" :class="{ on: isFav, disabled: favChannelId == null }" @tap.stop="toggleFav">
                    <text class="fav-ico">{{ isFav ? '♥' : '♡' }}</text>
                    <text class="fav-txt">{{ isFav ? $t('menu.favRemove') : $t('menu.favAdd') }}</text>
                </view>
            </view>
            <view class="tags" v-if="promoText">
                <text class="tag">🔥 {{ promoText }}</text>
            </view>
            <!-- 阶梯满减：全部档位 + 已达成/下一档差额 -->
            <view class="promo-tiers" v-if="promoTierList.length">
                <view
                    v-for="t in promoTierList" :key="'tier-' + t.thresholdFen"
                    class="promo-tier" :class="{ hit: t.reached, next: t.next }"
                >
                    <text class="promo-tier__main">{{ $t('menu.tierLabel').replace('{t}', yuan(t.thresholdFen)).replace('{d}', yuan(t.discountFen)) }}</text>
                    <text v-if="t.next && t.gapFen > 0" class="promo-tier__gap">{{ $t('menu.tierGap').replace('{d}', yuan(t.gapFen)) }}</text>
                </view>
            </view>
        </view>
        <!-- 营业状态提示：打烊/即将打烊（打烊仍可浏览加购，不可提交订单） -->
        <view v-if="storeStateText" class="shop-state" :class="storeClosed ? 'shop-state--closed' : 'shop-state--closing'">
            <text class="shop-state__ico">{{ storeClosed ? '🌙' : '⏰' }}</text>
            <text class="shop-state__txt">{{ storeStateText }}</text>
        </view>
        <!-- 店铺公告条：单行省略，点击查看完整公告（首次进店每日自动弹一次） -->
        <view v-if="storeNotice" class="notice-bar" @tap="openNotice">
            <text class="notice-bar__ico">📣</text>
            <text class="notice-bar__txt">{{ storeNotice }}</text>
            <text class="notice-bar__more">{{ $t('menu.noticeMore') }} ›</text>
        </view>
        <!-- 三 Tab -->
        <view class="tabs">
            <view class="tb" :class="{ on: tab === 'goods' }" @tap="switchTab('goods')">{{ $t('menu.tabGoods') }}</view>
            <view class="tb" :class="{ on: tab === 'reviews' }" @tap="switchTab('reviews')">{{ $t('menu.tabReviews') }}</view>
            <view class="tb" :class="{ on: tab === 'merchant' }" @tap="switchTab('merchant')">{{ $t('menu.tabMerchant') }}</view>
        </view>

        <!-- 商品：左分类右商品 -->
        <view class="panel" v-show="tab === 'goods'">
            <view class="body">
                <scroll-view scroll-y class="cats">
                    <view v-for="c in cats" :key="c.id" class="cat" :class="{ on: c.id === activeCat }" @tap="activeCat = c.id">
                        {{ c.id === 'all' ? $t('menu.catAll') : c.name }}
                    </view>
                </scroll-view>
                <scroll-view scroll-y class="goods">
                    <!-- 店内搜索：实时本地过滤 + 历史/热门词（纯前端，无额外请求） -->
                    <view class="shop-search">
                        <text class="shop-search__ico">🔍</text>
                        <input
                            class="shop-search__ipt" v-model="keyword" :placeholder="$t('menu.searchInShop')"
                            confirm-type="search" @confirm="commitKeyword"
                        />
                        <text v-if="keyword" class="shop-search__x" @tap="clearKeyword">✕</text>
                    </view>
                    <view class="suggest" v-if="!keyword && (searchHistory.length || hotWords.length)">
                        <view class="suggest__group" v-if="searchHistory.length">
                            <view class="suggest__head">
                                <text>{{ $t('menu.searchHistory') }}</text>
                                <text class="suggest__clear" @tap="clearSearchHistory">🗑</text>
                            </view>
                            <view class="suggest__chips">
                                <text v-for="w in searchHistory" :key="'h-' + w" class="suggest__chip" @tap="applyKeyword(w)">{{ w }}</text>
                            </view>
                        </view>
                        <view class="suggest__group" v-if="hotWords.length">
                            <view class="suggest__head"><text>{{ $t('menu.hotSearch') }}</text></view>
                            <view class="suggest__chips">
                                <text v-for="w in hotWords" :key="'t-' + w" class="suggest__chip suggest__chip--hot" @tap="applyKeyword(w)">{{ w }}</text>
                            </view>
                        </view>
                    </view>
                    <!-- 排序 chips：售罄始终置底，切换不重新请求接口 -->
                    <view class="good-sort">
                        <view class="sort-chip" :class="{ on: sortKey === 'default' }" @tap="setSort('default')">{{ $t('menu.sortDefault') }}</view>
                        <view class="sort-chip" :class="{ on: sortKey === 'sales' }" @tap="setSort('sales')">{{ $t('menu.sortSales') }}</view>
                        <view class="sort-chip" :class="{ on: sortKey === 'price' }" @tap="setSort('price')">{{ $t('menu.sortPrice') }} {{ priceAsc ? '↑' : '↓' }}</view>
                    </view>
                    <!-- 筛选 chips：与排序分行，避免 5 个 chip 挤在一起折行 -->
                    <view class="good-filter">
                        <view class="sort-chip" :class="{ on: onlyCoupon }" @tap="onlyCoupon = !onlyCoupon">{{ $t('menu.filterCoupon') }}</view>
                        <view class="sort-chip" :class="{ on: hideSoldOut }" @tap="hideSoldOut = !hideSoldOut">{{ $t('menu.filterInStock') }}</view>
                    </view>
                    <!-- 首页搜索/收藏/常买商品带 q 进店：只筛当前分类商品，可一键清除 -->
                    <view v-if="productQuery" class="good-search">
                        <text class="good-search__txt">{{ $t('menu.searchChip').replace('{q}', productQuery) }}</text>
                        <text class="good-search__x" @tap="clearProductQuery">✕</text>
                    </view>
                    <view v-for="g in goodsOf(activeCat)" :key="g.id" class="good" :class="{ 'good--sold': goodSoldOut(g) }" @tap="pickSku(g)">
                        <VImage :src="g.featuredAsset?.preview" width="140rpx" height="140rpx" class="good-img" />
                        <view class="good-info">
                            <view class="good-title">
                                <text class="good-name">{{ g.name }}</text>
                                <text v-if="goodSoldOut(g)" class="good-tag good-tag--sold">{{ $t('menu.soldOut') }}</text>
                                <text v-else-if="goodLowStock(g)" class="good-tag good-tag--low">{{ $t('menu.lowStock') }}</text>
                            </view>
                            <text class="good-desc">{{ plainDescription(g.description) }}</text>
                            <view class="good-rate" v-if="g.customFields?.reviewCount > 0">
                                <text class="good-rate__star">★</text>
                                <text class="good-rate__num">{{ (g.customFields.reviewRating || 0).toFixed(1) }}</text>
                                <text class="good-rate__cnt">{{ $t('menu.reviewCount').replace('{n}', String(g.customFields.reviewCount)) }}</text>
                            </view>
                            <view class="good-coupon" v-if="couponOf(g)" @tap.stop="claimProduct(couponOf(g))">
                                <text class="good-coupon__txt">{{ couponChipText(couponOf(g)) }}</text>
                                <text class="good-coupon__action">{{ couponClaimed(g.id) ? $t('menu.claimed') : $t('menu.claim') }}</text>
                            </view>
                            <view class="price-row">
                                <PriceTag :price="g.variants[0]?.priceWithTax || 0" />
                            </view>
                        </view>
                        <view class="add-btn spec" :class="{ disabled: goodSoldOut(g) }" v-if="(g.variants?.length ?? 0) > 1" @tap.stop="pickSku(g)">{{ $t('menu.pickSpec') }}</view>
                        <view class="add-btn" :class="{ disabled: goodSoldOut(g) }" v-else @tap.stop="addToCart(g)">+</view>
                        <view class="good-fav" :class="{ on: isGoodFav(g) }" @tap.stop="toggleGoodFav(g)">{{ isGoodFav(g) ? '♥' : '♡' }}</view>
                    </view>
                    <view class="scroll-pad"></view>
                    <EmptyState v-if="!goodsOf(activeCat).length" :text="$t('menu.emptyCat')" />
                </scroll-view>
            </view>
        </view>

        <!-- 评论：A 版式（摘要卡 + 筛选 chips + 评论列表，首切加载） -->
        <scroll-view scroll-y class="panel solo" v-show="tab === 'reviews'" @scrolltolower="loadMoreReviews">
            <view class="rv-summary" v-if="reviewStats && reviewStats.totalCount > 0">
                <view class="rv-sum-top">
                    <view class="rv-score">
                        <text class="rv-score__num">{{ reviewStats.averageRating }}</text>
                        <text class="rv-score__lab">{{ $t('menu.overallScore') }}</text>
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
                    <text>{{ $t('menu.totalReviews').replace('{n}', String(reviewStats.totalCount)) }}</text>
                    <text>{{ $t('menu.goodRate').replace('{n}', String(reviewStats.goodRate)) }}</text>
                </view>
            </view>
            <view class="rv-chips">
                <view
                    v-for="f in reviewFilters" :key="f.key"
                    class="rv-chip" :class="{ on: reviewFilter === f.key }"
                    @tap="switchReviewFilter(f.key)"
                >{{ $t(f.label) }}</view>
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
                <view v-if="r.reply" class="rv-reply"><text class="rv-reply__who">{{ $t('menu.merchantReply') }}</text>{{ r.reply }}</view>
                <view v-for="fu in r.followUps ?? []" :key="fu.id" class="rv-reply">
                    <text class="rv-reply__who">{{ $t('menu.followUp') }}</text>{{ fu.content }}
                </view>
            </view>
            <view v-if="reviewLoading" class="rv-more">{{ $t('menu.loading') }}</view>
            <view v-else-if="reviewList.length && !reviewHasMore" class="rv-more">{{ $t('menu.noMore') }}</view>
            <EmptyState v-if="!reviewLoading && !reviewList.length" :text="$t('menu.emptyReviews')" />
            <view class="scroll-pad"></view>
        </scroll-view>

        <!-- 商家：店铺信息 -->
        <scroll-view scroll-y class="panel solo" v-show="tab === 'merchant'">
            <view class="mcard">
                <view class="mrow"><text class="mico">🏪</text><text class="mval">{{ shopName }}</text></view>
                <view class="mrow"><text class="mico">🛵</text><text class="mlab">{{ $t('menu.deliveryService') }}</text><text class="mval">{{ routeDetailText }}</text></view>
                <view class="mrow"><text class="mico">🕐</text><text class="mlab">{{ $t('menu.businessHours') }}</text><text class="mval">{{ storeInfo?.businessHours || '10:00–22:00' }}</text></view>
                <view class="mrow"><text class="mico">📍</text><text class="mlab">{{ $t('menu.deliveryArea') }}</text><text class="mval">{{ $t('menu.deliveryAreaVal') }}</text></view>
                <view class="mrow" v-if="storeInfo?.storeAddress"><text class="mico">🏠</text><text class="mlab">{{ $t('menu.storeAddress') }}</text><text class="mval">{{ storeInfo.storeAddress }}</text></view>
                <view class="mrow" v-if="storeInfo?.storePhone"><text class="mico">📞</text><text class="mlab" @tap="callStore">{{ $t('menu.storePhone') }}</text><text class="mval" @tap="callStore">{{ storeInfo.storePhone }}</text></view>
            </view>
            <view class="mcard" v-if="promoText || storeInfo?.storeNotice">
                <view class="mrow" v-if="storeInfo?.storeNotice"><text class="mico">📣</text><text class="mlab">{{ $t('menu.storeNotice') }}</text><text class="mval">{{ storeInfo.storeNotice }}</text></view>
                <view class="mrow" v-if="promoText"><text class="mico">📢</text><text class="mlab">{{ $t('menu.storePromo') }}</text><text class="mval">{{ promoText }}</text></view>
            </view>
            <view class="mcard">
                <view class="msrv">
                    <text>{{ $t('menu.service') }}</text>
                    <text class="tag">{{ $t('menu.serviceDelivery') }}</text>
                    <text class="tag">{{ $t('menu.serviceRelay') }}</text>
                </view>
            </view>
        </scroll-view>

        <!-- 凑单推荐：购物车未达起送价/满减门槛时，推荐店内低价商品一键加购 -->
        <view class="cross-sell" v-if="crossSellProducts.length">
            <view class="cross-sell__head">
                <text class="cross-sell__title">{{ $t('menu.crossSellTitle') }}</text>
                <text class="cross-sell__gap">{{ crossSellHint }}</text>
            </view>
            <scroll-view scroll-x class="cross-sell__row">
                <view v-for="it in crossSellProducts" :key="'cs-' + it.p.id" class="cs-item" @tap.stop="crossSellAdd(it)">
                    <VImage :src="it.p.featuredAsset?.preview" width="132rpx" height="132rpx" class="cs-img" />
                    <text class="cs-name">{{ it.p.name }}</text>
                    <view class="cs-foot">
                        <PriceTag :price="it.price" />
                        <text class="cs-add">+</text>
                    </view>
                </view>
            </scroll-view>
        </view>
        <!-- 购物车悬浮胶囊 -->
        <view class="cart-bar" @tap="goCheckout">
            <view class="cart-btn">
                🛒
                <view class="cart-count" v-if="cartCount">{{ cartCount }}</view>
            </view>
            <view class="cart-total">
                <text class="empty-hint" v-if="!cartCount">{{ $t('menu.cartEmpty') }}</text>
                <block v-else>
                    <text class="sum">{{ $t('menu.total').replace('{v}', cart.formatPrice(cartTotal)) }}</text>
                    <text v-if="cartPromoText" class="cart-promo">{{ cartPromoText }}</text>
                </block>
            </view>
            <view class="checkout-btn" :class="{ disabled: !cartCount || belowMinOrder || storeClosed }">
                {{ storeClosed ? $t('menu.closedBtn') : belowMinOrder ? $t('menu.minOrderGap').replace('{d}', minGapYuan) : $t('menu.checkout') }}
            </view>
        </view>
        <SkuSheet v-model:visible="skuOpen" :product="skuProduct" :preferred-variant-id="skuPreferred" @action="onSkuAction" @share="shareProduct" />

        <!-- 店铺公告弹层 -->
        <view v-if="noticeOpen" class="notice-mask" @tap="noticeOpen = false">
            <view class="notice-sheet" @tap.stop>
                <view class="notice-sheet__head">
                    <text class="notice-sheet__ico">📣</text>
                    <text class="notice-sheet__title">{{ $t('menu.storeNoticeTitle') }}</text>
                </view>
                <scroll-view scroll-y class="notice-sheet__body">
                    <text class="notice-sheet__text">{{ storeNotice }}</text>
                </scroll-view>
                <button class="notice-sheet__btn" @tap="noticeOpen = false">{{ $t('menu.noticeOk') }}</button>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { useTenantStore } from '../../stores/tenant';
import { useCartStore } from '../../stores/cart';
import { useAuthStore } from '../../stores/auth';
import { useFavoritesStore } from '../../stores/favorites';
import { useLocaleStore } from '../../stores/locale';
import { fetchProductList, fetchStoreList } from '../../api/queries/waimai';
import { getProductCoupons } from '../../api/queries/coupon';
import { getChannelReviews, getChannelReviewStats } from '../../api/queries/review';
import { plainDescription, routeText, routeDetail } from '../../utils/store-display';
import { matchesProduct, readSearchHistory, pushSearchHistory, clearSearchHistory as clearHistoryStorage } from '../../utils/search';
import { nextPromoHint, promoTiers, yuan } from '../../utils/promo';
import { getStoreStatus } from '../../utils/store-status';
import { theme, initTheme } from '../../utils/theme';
import { sharePage } from '../../utils/share';
import { addItemToOrder } from '../../api/mutations/cart';
import { claimProductCoupon } from '../../api/mutations/coupon';
import { getActiveOrder } from '../../api/queries/order';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import EmptyState from '../../components/EmptyState.vue';
import SkuSheet from '../../components/SkuSheet.vue';
import { recordFootprint } from '../../utils/footprint';
import { rememberVariant, resolvePreferredVariant } from '../../utils/sku-memory';

const tenant = useTenantStore();
const cart = useCartStore();
const authStore = useAuthStore();
const favorites = useFavoritesStore();
const locale = useLocaleStore();
const shopToken = ref('');
const shopRoutes = ref('');
const shopName = ref(locale.t('menu.defaultShop'));
const routesText = ref(locale.t('menu.defaultDelivery'));
const promoText = ref('');
const storeInfo = ref<any>(null);
/** 店铺公告（storeInfo 的 storeNotice，空则整块不显示） */
const storeNotice = computed(() => String(storeInfo.value?.storeNotice || '').trim());
const noticeOpen = ref(false);
const tab = ref<'goods' | 'reviews' | 'merchant'>('goods');
const cats = ref([{ id: 'all', name: '全部' }]);
const activeCat = ref('all');
const products = ref<any[]>([]);
const skuOpen = ref(false);
const skuProduct = ref<any>(null);
const skuPreferred = ref('');
// 首页搜索/收藏商品带 q 进店：仅筛商品（不改分类），✕ 可清除
const productQuery = ref('');
// 商品排序：综合（接口原序）/ 销量 / 价格（再次点击切升/降）；售罄始终置底
type SortKey = 'default' | 'sales' | 'price';
const sortKey = ref<SortKey>('default');
const priceAsc = ref(true);
const soldOutTipShown = ref(false);

const cartCount = computed(() => cart.totalQuantity);
const cartTotal = computed(() => cart.totalPrice);
// 收藏（店铺 = 渠道）：storeInfo 由 fetchStoreList 按 token 匹配后才有 channelId
const favChannelId = computed(() => storeInfo.value?.channelId ?? null);
const isFav = computed(() => favorites.isFavorite(favChannelId.value));

/** 打开公告弹层（点公告条） */
function openNotice() {
    if (storeNotice.value) noticeOpen.value = true;
}

/** 首次进店每日自动弹一次公告：同店同一天只弹一次 */
function maybeAutoNotice() {
    if (!storeNotice.value) return;
    const d = new Date();
    const key = `store_notice_seen_${shopToken.value || storeInfo.value?.channelId || shopName.value}_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    try {
        if (uni.getStorageSync(key)) return;
        uni.setStorageSync(key, '1');
    } catch {
        /* 存储不可用时仍弹一次 */
    }
    noticeOpen.value = true;
}

// 起送价（后端配置单位为分）与满减凑单提示
const minOrderFen = computed(() => {
    const n = Number(storeInfo.value?.minOrderAmount);
    return storeInfo.value?.minOrderAmount == null || !Number.isFinite(n) || n <= 0 ? null : Math.round(n);
});
const belowMinOrder = computed(() => !!cartCount.value && minOrderFen.value != null && cartTotal.value < minOrderFen.value);
const minGapYuan = computed(() => (minOrderFen.value == null ? '' : yuan(minOrderFen.value - cartTotal.value)));

// —— 营业状态：按 businessHours 判断打烊/即将打烊；打烊仍可浏览加购，仅拦截提交 ——
const storeStatus = computed(() => getStoreStatus(storeInfo.value?.businessHours));
const storeClosed = computed(() => storeStatus.value.state === 'closed');
const storeStateText = computed(() => {
    const st = storeStatus.value;
    if (st.state === 'closed') {
        const key = st.nextOpenDayOffset === 1 ? 'menu.closedTomorrow' : 'menu.closedToday';
        return locale.t(key).replace('{t}', st.nextOpenHM);
    }
    if (st.state === 'closing') return locale.t('menu.closingSoon').replace('{n}', String(st.closesInMin ?? 0));
    return '';
});
// 免配送费门槛（后端配置单位为分）
const freeShippingFen = computed(() => {
    const n = Number(storeInfo.value?.freeShippingThreshold);
    return storeInfo.value?.freeShippingThreshold == null || !Number.isFinite(n) || n <= 0 ? null : Math.round(n);
});
const freeShippingGapFen = computed(() => {
    if (!cartCount.value || freeShippingFen.value == null) return 0;
    return Math.max(0, freeShippingFen.value - cartTotal.value);
});
// 阶梯满减面板：按当前购物车金额标出已达成与下一档差额
const promoTierList = computed(() => promoTiers(storeInfo.value?.promoText || promoText.value, cartTotal.value));
const cartPromoText = computed(() => {
    if (!cartCount.value) return '';
    const hint = nextPromoHint(storeInfo.value?.promoText || promoText.value, cartTotal.value);
    if (!hint) return '';
    return hint.reached
        ? locale.t('menu.promoReached').replace('{t}', yuan(hint.thresholdFen)).replace('{y}', yuan(hint.discountFen))
        : locale.t('menu.promoGap').replace('{d}', yuan(hint.gapFen)).replace('{y}', yuan(hint.discountFen));
});

// 凑单推荐：起送价差额 > 满减差额 > 免配送费差额；无门槛差额不展示
const crossSellGapFen = computed(() => {
    if (!cartCount.value) return 0;
    if (belowMinOrder.value) return (minOrderFen.value ?? 0) - cartTotal.value;
    const hint = nextPromoHint(storeInfo.value?.promoText || promoText.value, cartTotal.value);
    if (hint && !hint.reached) return hint.gapFen;
    return freeShippingGapFen.value;
});
const crossSellHint = computed(() => {
    if (crossSellGapFen.value <= 0) return '';
    if (belowMinOrder.value) {
        return locale.t('menu.minOrderGap').replace('{d}', yuan(crossSellGapFen.value));
    }
    const hint = nextPromoHint(storeInfo.value?.promoText || promoText.value, cartTotal.value);
    if (hint && !hint.reached) {
        return locale.t('menu.promoGap').replace('{d}', yuan(hint.gapFen)).replace('{y}', yuan(hint.discountFen));
    }
    return locale.t('menu.freeShipGap').replace('{d}', yuan(crossSellGapFen.value));
});
// —— 店内搜索 / 筛选（纯前端）——
const keyword = ref('');
const searchHistory = ref<string[]>(readSearchHistory());
/** 热门搜索：取店内销量前 6 的商品名，名额不足用分类名补齐 */
const hotWords = computed(() => {
    const words: string[] = [];
    const push = (w?: string) => {
        const v = String(w ?? '').trim();
        if (v && !words.includes(v)) words.push(v);
    };
    [...products.value]
        .sort((a: any, b: any) => goodSales(b) - goodSales(a))
        .forEach((p: any) => push(p.name));
    cats.value.filter((c: any) => c.id !== 'all').forEach((c: any) => push(c.name));
    return words.slice(0, 6);
});
const onlyCoupon = ref(false);
const hideSoldOut = ref(false);

function commitKeyword() {
    if (!keyword.value.trim()) return;
    searchHistory.value = pushSearchHistory(keyword.value);
}
function applyKeyword(w: string) {
    keyword.value = w;
    searchHistory.value = pushSearchHistory(w);
}
function clearKeyword() {
    keyword.value = '';
}
function clearSearchHistory() {
    clearHistoryStorage();
    searchHistory.value = [];
}

const crossSellProducts = computed(() => {
    if (crossSellGapFen.value <= 0) return [];
    const inCart = new Set(cart.lines.map((l: any) => String(l.productVariant?.id ?? '')));
    return products.value
        .map((p: any) => {
            const vs = (p.variants ?? []).filter((v: any) => variantAvailable(v) && Number(v.priceWithTax) > 0);
            if (!vs.length) return null;
            const v = vs.reduce((a: any, b: any) => (Number(b.priceWithTax) < Number(a.priceWithTax) ? b : a));
            return { p, v, price: Number(v.priceWithTax) || 0 };
        })
        .filter((it: any) => it && !inCart.has(String(it.v.id)))
        .sort((a: any, b: any) => a.price - b.price)
        .slice(0, 8);
});
async function crossSellAdd(it: { v: any }) {
    const ok = await doAddItem(it.v.id, 1);
    if (ok) uni.showToast({ title: locale.t('menu.crossSellAdded'), icon: 'none' });
}

/** 店铺分享：微信内走 JS-SDK 卡片，其它环境复制带店铺 token 的链接 */
async function shareShop() {
    const path = `/pages/shop/menu?token=${encodeURIComponent(shopToken.value)}&name=${encodeURIComponent(shopName.value)}&routes=${encodeURIComponent(shopRoutes.value)}${favChannelId.value != null ? `&cid=${favChannelId.value}` : ''}`;
    const how = await sharePage({
        title: shopName.value,
        desc: locale.t('menu.shareShopDesc'),
        path,
        image: storeInfo.value?.logo || '',
    });
    if (how === 'copy') uni.showToast({ title: locale.t('menu.shareCopied'), icon: 'none' });
}

/** 商品分享：商品详情弹层右上角 ↗ */
async function shareProduct(p: any) {
    if (!p) return;
    const how = await sharePage({
        title: p.name,
        desc: locale.t('menu.shareProductDesc').replace('{s}', shopName.value),
        path: `/pages/shop/menu?token=${encodeURIComponent(shopToken.value)}&name=${encodeURIComponent(shopName.value)}&routes=${encodeURIComponent(shopRoutes.value)}${favChannelId.value != null ? `&cid=${favChannelId.value}` : ''}`,
        image: p.featuredAsset?.preview || '',
    });
    if (how === 'copy') uni.showToast({ title: locale.t('menu.shareCopied'), icon: 'none' });
}

/** 商品收藏：任一 variant 已收藏即显示实心（多规格商品用首个 variant 作为代表） */
function isGoodFav(g: any): boolean {
    return (g.variants ?? []).some((v: any) => favorites.isVariantFavorite(v.id));
}

async function toggleGoodFav(g: any) {
    const variants = g.variants ?? [];
    if (!variants.length) return;
    const recorded = variants.filter((v: any) => favorites.isVariantFavorite(v.id));
    const willAdd = !recorded.length;
    const channelId = favChannelId.value != null ? String(favChannelId.value) : undefined;
    try {
        if (willAdd) {
            const target = variants[0];
            await favorites.toggleVariant({
                variantId: String(target.id),
                channelId,
                channelToken: shopToken.value,
                productId: String(g.id),
                name: g.name,
                image: g.featuredAsset?.preview,
                price: target?.priceWithTax,
                storeName: shopName.value,
            });
        } else {
            for (const v of recorded) {
                await favorites.toggleVariant({ variantId: String(v.id), channelId });
            }
        }
        uni.showToast({ title: willAdd ? locale.t('menu.favProductAddOk') : locale.t('menu.favProductRemoveOk'), icon: 'none' });
    } catch {
        uni.showToast({ title: locale.t('menu.favFail'), icon: 'none' });
    }
}

async function toggleFav() {
    if (favChannelId.value == null) return;
    try {
        const on = await favorites.toggle(favChannelId.value);
        uni.showToast({ title: on ? locale.t('menu.favAddOk') : locale.t('menu.favRemoveOk'), icon: 'none' });
    } catch {
        uni.showToast({ title: locale.t('menu.favFail'), icon: 'none' });
    }
}
const routeDetailText = computed(() =>
    routeDetail(shopRoutes.value.split(',').filter(Boolean)).join('、') || locale.t('menu.noDelivery')
);

// ── 评论 tab（A 版式：摘要卡 + chips + 列表，首切 tab 才拉取） ──
type ReviewFilterKey = 'all' | 'images' | 'good' | 'bad';
const REVIEW_PAGE_SIZE = 10;
const reviewFilters: { key: ReviewFilterKey; label: string }[] = [
    { key: 'all', label: 'menu.filterAll' },
    { key: 'images', label: 'menu.filterImages' },
    { key: 'good', label: 'menu.filterGood' },
    { key: 'bad', label: 'menu.filterBad' },
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
    if (r.isAnonymous) return nameOnly ? locale.t('menu.anon') : locale.t('menu.anonShort');
    return r.customerName?.slice(0, 1) || locale.t('menu.anonAvatar');
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
    shopName.value = decodeURIComponent(q?.name ?? '') || locale.t('menu.defaultShop');
    routesText.value = routeText(shopRoutes.value.split(',').filter(Boolean));
    promoText.value = decodeURIComponent(q?.promo ?? '');
    productQuery.value = decodeURIComponent(q?.q ?? '');
    const pendingAdd = q?.add ? String(q.add) : '';
    // 常买店铺：首页会带 cid 直接记；直接进店时等 storeInfo 匹配到 channelId 再记（下方 then）
    const cid = q?.cid ? String(q.cid) : '';
    if (cid) {
        favorites.touchRecent({ channelId: cid, channelToken: shopToken.value, name: shopName.value, routes: shopRoutes.value });
    }
    // 店铺配置（地址/电话/公告/时长）：waimaiStoreList 按渠道 token 找本店；无配置行 → null 走页面兜底
    fetchStoreList().then((list: any[]) => {
        const hit = list.find((s: any) => s.channelToken === shopToken.value) ?? null;
        storeInfo.value = hit;
        if (hit) {
            favorites.touchRecent({ channelId: hit.channelId, channelToken: shopToken.value, name: shopName.value, routes: shopRoutes.value });
            maybeAutoNotice();
        }
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
        // 首页「常买商品」点进来的 add 参数：加载完成后自动加购 1 件（仅消费一次）
        if (pendingAdd) {
            const ok = await doAddItem(pendingAdd, 1);
            uni.showToast({ title: ok ? locale.t('menu.added') : locale.t('menu.addFail'), icon: 'none' });
        }
    } catch (e: any) {
        // 切渠道失败（token 无效）→ 提示并返回首页
        uni.showToast({ title: locale.t('menu.shopNotFound'), icon: 'none' });
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
    let list = catId === 'all' ? products.value : products.value.filter(p => p.collections?.some((c: any) => c.name === catId));
    if (productQuery.value) list = list.filter(p => matchesProduct(p, productQuery.value));
    if (keyword.value.trim()) list = list.filter(p => matchesProduct(p, keyword.value));
    if (onlyCoupon.value) list = list.filter(p => !!couponOf(p));
    if (hideSoldOut.value) list = list.filter(p => !goodSoldOut(p));
    return sortGoods(list);
}

/** 销量缺失按 0；价格取可售 variants 最低 priceWithTax（全售罄时退回首个 variant） */
function goodSales(g: any): number {
    return Number(g?.customFields?.waimaiMonthlySales) || 0;
}

function goodMinPrice(g: any): number {
    const prices = (g?.variants ?? [])
        .filter((v: any) => variantAvailable(v))
        .map((v: any) => Number(v?.priceWithTax) || 0);
    if (prices.length) return Math.min(...prices);
    return Number(g?.variants?.[0]?.priceWithTax) || 0;
}

/** 稳定排序（数组 sort 稳定）：售罄恒在组外末尾，组内依当前排序规则 */
function sortGoods(list: any[]): any[] {
    const arr = list.slice();
    const soldRank = (g: any) => (goodSoldOut(g) ? 1 : 0);
    if (sortKey.value === 'default') return arr.sort((a, b) => soldRank(a) - soldRank(b));
    arr.sort((a, b) => {
        const rank = soldRank(a) - soldRank(b);
        if (rank) return rank;
        if (sortKey.value === 'sales') return goodSales(b) - goodSales(a);
        const diff = goodMinPrice(a) - goodMinPrice(b);
        return priceAsc.value ? diff : -diff;
    });
    return arr;
}

function setSort(key: SortKey) {
    if (key === 'price') {
        if (sortKey.value === 'price') priceAsc.value = !priceAsc.value;
        else sortKey.value = 'price';
    } else {
        sortKey.value = key;
    }
    if (!soldOutTipShown.value && goodsOf(activeCat.value).some(g => goodSoldOut(g))) {
        soldOutTipShown.value = true;
        uni.showToast({ title: locale.t('menu.soldOutLast'), icon: 'none' });
    }
}

function clearProductQuery() {
    productQuery.value = '';
    loadProductCoupons(goodsOf(activeCat.value));
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
        return locale.t('menu.couponFixed').replace('{v}', y);
    }
    if (t.type === 'PERCENT') return locale.t('menu.couponPercent').replace('{v}', (t.discountValue / 10).toFixed(1).replace(/\.0$/, ''));
    return locale.t('menu.couponFreeShip');
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
        uni.showToast({ title: locale.t('menu.claimOk'), icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('menu.claimFail'), icon: 'none' });
    } finally {
        claimingProductId.value = '';
    }
}

watch(activeCat, () => { loadProductCoupons(goodsOf(activeCat.value)); });

/** shop-api stockLevel 枚举：IN_STOCK / LOW_STOCK / OUT_OF_STOCK / null（不跟踪库存） */
function variantAvailable(v: any): boolean {
    return !!v && v.enabled !== false && v.stockLevel !== 'OUT_OF_STOCK';
}

function goodSoldOut(g: any): boolean {
    const variants: any[] = g?.variants ?? [];
    return !variants.some(v => variantAvailable(v));
}

function goodLowStock(g: any): boolean {
    const variants: any[] = g?.variants ?? [];
    return variants.some(v => variantAvailable(v)) && variants.some(v => variantAvailable(v) && v.stockLevel === 'LOW_STOCK');
}

function findVariant(variantId: string): any {
    for (const p of products.value) {
        const hit = (p.variants ?? []).find((v: any) => String(v.id) === String(variantId));
        if (hit) return hit;
    }
    return null;
}

function toastSoldOut() {
    uni.showToast({ title: locale.t('menu.soldOutToast'), icon: 'none' });
}

/** 点商品：统一打开详情弹层（大图/描述/月销/规格/收藏/加购），单规格也可先看清详情 */
function pickSku(g: any) {
    if (goodSoldOut(g)) { toastSoldOut(); return; }
    rememberView(g);
    skuProduct.value = g;
    const preferred = resolvePreferredVariant(g?.id, g?.variants);
    skuPreferred.value = preferred ? String(preferred.id) : '';
    skuOpen.value = true;
}

/** 浏览足迹：记录商品 + 店铺信息，供「我的足迹」页回访 */
function rememberView(g: any) {
    const variant = g?.variants?.[0];
    recordFootprint({
        productId: String(g?.id ?? ''),
        variantId: variant?.id ? String(variant.id) : '',
        name: g?.name || '',
        image: g?.featuredAsset?.preview || '',
        price: Number(variant?.priceWithTax ?? 0),
        storeName: shopName.value,
        channelToken: shopToken.value,
        channelId: storeInfo.value?.channelId != null ? String(storeInfo.value.channelId) : (favChannelId.value != null ? String(favChannelId.value) : ''),
        routes: shopRoutes.value,
    });
}

async function doAddItem(variantId: string, quantity: number) {
    const target = findVariant(variantId);
    if (target && !variantAvailable(target)) { toastSoldOut(); return false; }
    const res: any = await addItemToOrder(variantId, quantity);
    if (res?.addItemToOrder?.errorCode) {
        uni.showToast({ title: res.addItemToOrder.message || locale.t('menu.addFail'), icon: 'none' });
        return false;
    }
    cart.setOrder(res.addItemToOrder);
    return true;
}

async function addToCart(g: any) {
    const variant = resolvePreferredVariant(g?.id, g?.variants) || g?.variants?.[0];
    if (!variant || !variantAvailable(variant)) { toastSoldOut(); return false; }
    rememberView(g);
    const ok = await doAddItem(variant.id, 1);
    if (ok) {
        rememberVariant(g?.id, variant.id);
        uni.showToast({ title: locale.t('menu.added'), icon: 'none' });
    }
    return ok;
}

async function onSkuAction(v: { action: 'cart' | 'buy'; variantId: string; quantity: number }) {
    const ok = await doAddItem(v.variantId, v.quantity);
    if (ok) {
        rememberVariant(skuProduct.value?.id, v.variantId);
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
    if (storeClosed.value) {
        uni.showToast({ title: storeStateText.value || locale.t('menu.closedBtn'), icon: 'none' });
        return;
    }
    if (belowMinOrder.value) {
        uni.showToast({ title: locale.t('menu.minOrderGap').replace('{d}', minGapYuan.value), icon: 'none' });
        return;
    }
    const routes = encodeURIComponent(shopRoutes.value);
    const mo = storeInfo.value?.minOrderAmount ?? '';
    const fee = storeInfo.value?.deliveryFee ?? '';
    const cid = favChannelId.value != null ? `&cid=${favChannelId.value}` : '';
    const shop = `&shop=${encodeURIComponent(shopName.value)}`;
    const token = `&token=${encodeURIComponent(shopToken.value)}`;
    uni.navigateTo({ url: `/pkg-order/pages/checkout?routes=${routes}&minOrder=${mo}&dfee=${fee}${cid}${shop}${token}` });
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
.share-btn { display: flex; flex-direction: column; align-items: center; gap: 4rpx; padding: 4rpx 8rpx; flex-shrink: 0; }
.share-ico { font-size: 34rpx; line-height: 1.1; color: var(--w-text-muted); }
.share-txt { font-size: 20rpx; color: var(--w-text-muted); }
.fav-btn { display: flex; flex-direction: column; align-items: center; gap: 4rpx; padding: 4rpx 8rpx; flex-shrink: 0; }
.fav-btn.disabled { opacity: 0.4; }
.fav-ico { font-size: 40rpx; line-height: 1; color: var(--w-text-muted); }
.fav-btn.on .fav-ico { color: #ff4d6d; }
.fav-txt { font-size: 20rpx; color: var(--w-text-muted); }
.fav-btn.on .fav-txt { color: #ff4d6d; }
.smeta em { font-style: normal; color: var(--w-text-muted); }
.tags { display: flex; gap: 12rpx; margin-top: 16rpx; flex-wrap: wrap; }
.tag { font-size: 20rpx; color: var(--w-brand-text); background: var(--w-brand-soft); border-radius: 8rpx; padding: 4rpx 12rpx; }
/* 阶梯满减：达成置亮、下一档描边并提示差额 */
.promo-tiers { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 12rpx; }
.promo-tier { display: flex; align-items: center; gap: 8rpx; font-size: 20rpx; padding: 4rpx 12rpx; border-radius: 8rpx; border: 1rpx solid var(--w-border); color: var(--w-text-muted); background: var(--w-surface);
  &__main { color: inherit; }
  &__gap { font-size: 18rpx; color: #b45309; }
  &.hit { border-color: var(--w-brand); background: var(--w-brand-soft); color: var(--w-brand-text); }
  &.next { border-style: dashed; border-color: #ffb27a; color: #b45309; }
}
/* 营业状态条：打烊红、即将打烊橙，均贴在店铺卡下方 */
.shop-state { display: flex; align-items: center; gap: 10rpx; margin: 16rpx 24rpx 0; padding: 14rpx 20rpx; border-radius: 12rpx; flex-shrink: 0; }
.shop-state--closed { background: #fff2f0; border: 1rpx solid #f3b6b0; }
.shop-state--closing { background: #fff8ef; border: 1rpx solid #ffd9ad; }
.shop-state__ico { font-size: 26rpx; }
.shop-state__txt { font-size: 24rpx; line-height: 1.4; flex: 1; }
.shop-state--closed .shop-state__txt { color: #b42318; }
.shop-state--closing .shop-state__txt { color: #b45309; }
/* 店铺公告条 + 公告弹层 */
.notice-bar { display: flex; align-items: center; gap: 10rpx; margin: 12rpx 24rpx 0; padding: 14rpx 20rpx; border-radius: 12rpx; background: #fff8ef; border: 1rpx solid #ffe2c2; flex-shrink: 0; }
.notice-bar__ico { font-size: 24rpx; flex-shrink: 0; }
.notice-bar__txt { flex: 1; min-width: 0; font-size: 24rpx; color: #8a5a1f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notice-bar__more { flex-shrink: 0; font-size: 22rpx; color: #ff6600; }
.notice-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 260; display: flex; align-items: center; justify-content: center; padding: 0 60rpx; }
.notice-sheet { width: 100%; max-height: 70vh; background: #fff; border-radius: 24rpx; padding: 36rpx 32rpx 28rpx; display: flex; flex-direction: column; gap: 20rpx; box-sizing: border-box; }
.notice-sheet__head { display: flex; align-items: center; gap: 12rpx; }
.notice-sheet__ico { font-size: 34rpx; }
.notice-sheet__title { font-size: 32rpx; font-weight: 600; color: #222; }
.notice-sheet__body { max-height: 44vh; }
.notice-sheet__text { font-size: 26rpx; line-height: 1.7; color: #555; white-space: pre-wrap; }
.notice-sheet__btn { width: 100%; margin-top: 8rpx; height: 88rpx; line-height: 88rpx; border-radius: 44rpx; background: #ff6600; color: #fff; font-size: 30rpx; border: none; }
.notice-sheet__btn::after { border: none; }
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
.good-title { display: flex; align-items: center; gap: 8rpx; min-width: 0; }
.good-name { flex: 1; min-width: 0; font-size: 28rpx; font-weight: 600; color: var(--w-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.good-tag { flex-shrink: 0; font-size: 20rpx; line-height: 1; padding: 4rpx 10rpx; border-radius: 6rpx; }
.good-tag--sold { color: var(--w-surface); background: var(--w-text-muted); }
.good-tag--low { color: var(--w-brand-text); background: var(--w-brand-soft); }
.good--sold .good-img, .good--sold .good-info { opacity: 0.5; }
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
.add-btn.disabled { background: var(--w-surface-muted); color: var(--w-text-muted); }
/* 商品收藏心标 + 搜索定位 chip（复用 --w-* 主题 token） */
.good-fav { position: absolute; right: 0; top: 16rpx; width: 56rpx; height: 56rpx; display: flex; align-items: center; justify-content: center; font-size: 36rpx; color: var(--w-text-muted); }
.good-fav.on { color: #ff4d6d; }
.good-sort { display: flex; gap: 12rpx; padding: 16rpx 0 0; flex-wrap: wrap; }
.good-filter { display: flex; gap: 12rpx; padding: 12rpx 0 0; flex-wrap: wrap; }
.sort-chip { font-size: 22rpx; line-height: 1; color: var(--w-text-muted); background: var(--w-surface-muted); border-radius: 999rpx; padding: 12rpx 22rpx; white-space: nowrap; }
.sort-chip.on { color: var(--w-brand-text); background: var(--w-brand-soft); font-weight: 600; }
.shop-search { display: flex; align-items: center; gap: 10rpx; margin-top: 16rpx; padding: 0 20rpx; height: 68rpx; border-radius: 999rpx; background: var(--w-surface-muted); }
.shop-search__ico { font-size: 24rpx; }
.shop-search__ipt { flex: 1; font-size: 24rpx; height: 68rpx; color: var(--w-text); }
.shop-search__x { font-size: 24rpx; color: var(--w-text-muted); padding: 8rpx; }
.suggest { margin-top: 16rpx; display: flex; flex-direction: column; gap: 14rpx; }
.suggest__group { display: flex; flex-direction: column; gap: 10rpx; }
.suggest__head { display: flex; justify-content: space-between; align-items: center; font-size: 22rpx; color: var(--w-text-muted); }
.suggest__clear { font-size: 22rpx; padding: 4rpx 8rpx; }
.suggest__chips { display: flex; flex-wrap: wrap; gap: 12rpx; }
.suggest__chip { font-size: 22rpx; color: var(--w-text); background: var(--w-surface-muted); border-radius: 999rpx; padding: 10rpx 20rpx; }
.suggest__chip--hot { color: var(--w-brand-text); background: var(--w-brand-soft); }
.good-search { display: flex; align-items: center; gap: 12rpx; margin: 16rpx 0 0; padding: 10rpx 20rpx; background: var(--w-brand-soft); border-radius: 999rpx; }
.good-search__txt { flex: 1; min-width: 0; font-size: 22rpx; color: var(--w-brand-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.good-search__x { font-size: 24rpx; color: var(--w-text-muted); padding: 0 8rpx; }
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
.cross-sell { position: absolute; left: 24rpx; right: 24rpx; bottom: calc(136rpx + env(safe-area-inset-bottom)); z-index: 49; background: var(--w-surface, #fff); border-radius: $radius; padding: 16rpx 16rpx 12rpx; box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.12); }
.cross-sell__head { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; margin-bottom: 12rpx; }
.cross-sell__title { font-size: 24rpx; font-weight: 600; color: var(--w-text, #333); }
.cross-sell__gap { font-size: 22rpx; color: var(--w-brand-text, #ff6600); }
.cross-sell__row { white-space: nowrap; }
.cs-item { display: inline-block; vertical-align: top; width: 132rpx; margin-right: 16rpx; }
.cs-img { border-radius: $radius-sm; background: var(--w-surface-muted, #f5f5f5); }
.cs-name { display: block; font-size: 22rpx; color: var(--w-text, #333); margin-top: 6rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 4rpx; }
.cs-add { width: 34rpx; height: 34rpx; border-radius: 999rpx; background: $brand; color: #fff; font-size: 26rpx; line-height: 34rpx; text-align: center; }
.cart-bar { position: absolute; left: 24rpx; right: 24rpx; bottom: calc(24rpx + env(safe-area-inset-bottom)); height: 96rpx; background: var(--w-cart); border-radius: 999rpx; display: flex; align-items: center; padding-right: 8rpx; box-shadow: 0 12rpx 32rpx rgba(0, 0, 0, 0.28); z-index: 50; }
.cart-btn { width: 96rpx; height: 96rpx; border-radius: 999rpx; background: $brand; display: flex; align-items: center; justify-content: center; font-size: 40rpx; margin-top: -36rpx; border: 6rpx solid var(--w-bg); position: relative; flex-shrink: 0; }
.cart-count { position: absolute; top: -10rpx; right: -10rpx; min-width: 36rpx; height: 36rpx; border-radius: 999rpx; background: $surface; color: $brand; font-size: 20rpx; display: flex; align-items: center; justify-content: center; font-weight: 600; padding: 0 6rpx; }
.cart-total { flex: 1; padding-left: 20rpx; min-width: 0; }
.empty-hint { font-size: 26rpx; color: rgba(255, 255, 255, 0.75); }
.sum { display: block; font-size: 32rpx; font-weight: 600; color: #fff; }
.cart-promo { display: block; font-size: 20rpx; color: #ffd08a; margin-top: 2rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.checkout-btn { background: $brand; color: #fff; border-radius: 999rpx; padding: 20rpx 44rpx; font-size: 26rpx; font-weight: 600; flex-shrink: 0; }
.checkout-btn.disabled { opacity: 0.4; }
</style>
