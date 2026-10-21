<template>
    <view class="page" :class="{ dark: theme === 'dark' }">
        <view class="head">
            <view class="loc-row">
                <text class="loc">{{ $t('home.locText') }}</text>
                <view class="head-right">
                    <view class="theme-btn" @tap="toggleTheme">{{ theme === 'dark' ? '☀️' : '🌙' }}</view>
                    <view class="bell-btn" @tap="goMessages">
                        <text class="bell-ico">🔔</text>
                        <text class="bell-badge" v-if="messages.unreadCount > 0">{{ messages.unreadCount > 99 ? '99+' : messages.unreadCount }}</text>
                    </view>
                    <text class="hlink" @tap="goOrders">{{ $t('home.myOrders') }}</text>
                </view>
            </view>
            <!-- 当前配送楼栋：取结算页最近保存的配送目标，点击可快捷切换 -->
            <view class="target-row" v-if="deliveryTarget" @tap="openTargetSheet">
                <text class="target-row__txt">📍 {{ deliveryTarget.zoneName }} · {{ deliveryTarget.buildingName }}</text>
                <text class="target-row__sw">{{ $t('home.switchTarget') }} ▸</text>
            </view>
            <input
                class="search" v-model="keyword" :placeholder="$t('home.searchPh')" confirm-type="search"
                @focus="onSearchFocus" @blur="onSearchBlur" @input="onKeywordInput" @confirm="submitSearch(keyword)"
            />
        </view>
        <view class="body">
            <view class="quick">
                <view class="qk" @tap="goOrders">
                    <view class="qico">🧾</view>
                    <text class="qtxt">{{ $t('home.myOrders') }}</text>
                </view>
                <view class="qk" @tap="goRider">
                    <view class="qico">🛵</view>
                    <text class="qtxt">{{ $t('home.becomeRider') }}</text>
                </view>
                <view class="qk" @tap="goErrand">
                    <view class="qico">🏃</view>
                    <text class="qtxt">{{ $t('home.errand') }}</text>
                </view>
                <view class="qk" @tap="goCart">
                    <view class="qico">🛒</view>
                    <text class="qtxt">{{ $t('home.cart') }}</text>
                </view>
                <view class="qk" @tap="showNotice">
                    <view class="qico">📣</view>
                    <text class="qtxt">{{ $t('home.notice') }}</text>
                </view>
                <view class="qk" @tap="goCouponCentre">
                    <view class="qico">🎟️<text class="qk-badge" v-if="unusedCouponCount > 0">{{ unusedCouponCount > 99 ? '99+' : unusedCouponCount }}</text></view>
                    <text class="qtxt">{{ $t('home.couponCentre') }}</text>
                </view>
                <view class="qk" v-if="jianghuEntry" @tap="goJianghu">
                    <view class="qico">🗡️</view>
                    <text class="qtxt">江湖</text>
                </view>
            </view>
            <!-- 搜索面板：聚焦且关键词为空时展示（历史 + 热搜），不发请求 -->
            <view v-if="showSearchPanel" class="search-panel">
                <view v-if="searchHistory.length" class="sp-group">
                    <view class="sp-head">
                        <text class="sp-title">{{ $t('home.searchHistory') }}</text>
                        <text class="sp-clear" @tap.stop="clearHistory">{{ $t('home.clearHistory') }}</text>
                    </view>
                    <view class="sp-chips">
                        <view v-for="h in searchHistory" :key="'h-' + h" class="sp-chip" @tap="pickWord(h)">{{ h }}</view>
                    </view>
                </view>
                <view v-if="hotWords.length" class="sp-group">
                    <view class="sp-head"><text class="sp-title">{{ $t('home.hotSearch') }}</text></view>
                    <view class="sp-chips">
                        <view v-for="w in hotWords" :key="'w-' + w" class="sp-chip sp-chip--hot" @tap="pickWord(w)">🔥 {{ w }}</view>
                    </view>
                </view>
                <view v-if="!searchHistory.length && !hotWords.length" class="sp-tip">{{ $t('home.emptySearch') }}</view>
            </view>
            <!-- 搜索联想：聚焦且有输入时展示（与历史/热搜面板互斥），纯本地推导不发请求 -->
            <scroll-view v-if="showSuggest" scroll-y class="search-panel suggest-panel">
                <view v-if="storeSuggestions.length" class="sp-group">
                    <view class="sp-head"><text class="sp-title">{{ $t('home.suggestStores') }}</text></view>
                    <view class="sg-list">
                        <view v-for="it in storeSuggestions" :key="'sg-' + it.store.channelId" class="sg-row" @tap="pickWord(it.store.name)">
                            <text class="sg-ico">🏪</text>
                            <text class="sg-name">{{ it.store.name }}</text>
                            <text v-if="it.meta" class="sg-meta">{{ it.meta }}</text>
                            <text class="sg-chev">›</text>
                        </view>
                    </view>
                </view>
                <view v-if="historySuggestions.length" class="sp-group">
                    <view class="sp-head"><text class="sp-title">{{ $t('home.suggestHistory') }}</text></view>
                    <view class="sg-list">
                        <view v-for="h in historySuggestions" :key="'sh-' + h" class="sg-row" @tap="pickWord(h)">
                            <text class="sg-ico">🕘</text>
                            <text class="sg-name">{{ h }}</text>
                        </view>
                    </view>
                </view>
                <view v-if="hotSuggestions.length" class="sp-group">
                    <view class="sp-head"><text class="sp-title">{{ $t('home.suggestHot') }}</text></view>
                    <view class="sg-list">
                        <view v-for="w in hotSuggestions" :key="'sw-' + w" class="sg-row" @tap="pickWord(w)">
                            <text class="sg-ico">🔥</text>
                            <text class="sg-name">{{ w }}</text>
                        </view>
                    </view>
                </view>
            </scroll-view>
            <template v-if="!showSearchPanel">
            <scroll-view scroll-x class="pills" v-if="!keyword">
                <view
                    v-for="t in tagList" :key="t"
                    class="pill" :class="{ on: t === activeTag }"
                    @tap="activeTag = t"
                ><text class="pico">{{ tagIcon(t) }}</text>{{ tagLabel(t) }}</view>
            </scroll-view>
            <scroll-view scroll-x class="sortbar" v-if="!keyword">
                <view class="sort-chip" :class="{ on: sortBy === 'default' }" @tap="sortBy = 'default'">{{ $t('home.sortDefault') }}</view>
                <view class="sort-chip" :class="{ on: sortBy === 'fastest' }" @tap="sortBy = 'fastest'">{{ $t('home.sortFastest') }}</view>
                <view class="sort-chip" :class="{ on: sortBy === 'minOrder' }" @tap="sortBy = 'minOrder'">{{ $t('home.sortMinOrder') }}</view>
                <view class="sort-chip" :class="{ on: sortBy === 'freeDelivery' }" @tap="sortBy = 'freeDelivery'">{{ $t('home.sortFreeDelivery') }}</view>
                <view class="sort-chip sort-chip--filter" :class="{ on: filterCount > 0 }" @tap="filterOpen = true">
                    ⚙ {{ $t('home.filterBtn') }}<text v-if="filterCount"> · {{ filterCount }}</text>
                </view>
            </scroll-view>
            <view v-if="promoStore" class="notice" @tap="enterStore(promoStore)">
                <text class="ntext">🔥 {{ promoStore.name }} · {{ promoStore.promoText }}</text>
                <text class="nmore">›</text>
            </view>
            <!-- 临期券提示：未使用券中 3 天内到期数量（与角标同一份 myCoupons 数据） -->
            <view v-if="expiringCouponCount > 0" class="coupon-expiring" @tap="goMyCoupons">
                <text class="ce-ico">⏰</text>
                <text class="ce-text">{{ $t('home.couponExpiring').replace('{n}', String(expiringCouponCount)) }}</text>
                <text class="ce-more">›</text>
            </view>
            <!-- 常买店铺：本地最近进店记录（无关键词时展示，失效店铺自动隐藏） -->
            <view v-if="recentStores.length" class="recent">
                <view class="sec"><text class="sec-t">{{ $t('home.recentTitle') }}</text></view>
                <scroll-view scroll-x class="recent-row">
                    <view v-for="s in recentStores" :key="'recent-' + s.channelId" class="recent-card" @tap="enterStore(s)">
                        <image v-if="s.logo" class="recent-logo" :src="s.logo" mode="aspectFill" />
                        <view v-else class="recent-logo recent-logo--text">{{ s.name.slice(0, 1) }}</view>
                        <text class="recent-name">{{ s.name }}</text>
                        <text class="recent-meta">{{ deliveryTag(s) || routeText(s.routesEnabled) }}</text>
                    </view>
                </scroll-view>
            </view>
            <!-- 收藏商品：收藏的 variant 按店铺进店定位（本地元数据，登录后远端同步） -->
            <view v-if="favoriteProducts.length" class="recent">
                <view class="sec"><text class="sec-t">{{ $t('home.favoriteProducts') }}</text></view>
                <scroll-view scroll-x class="recent-row">
                    <view v-for="p in favoriteProducts" :key="'favp-' + p.variantId" class="item-card" @tap="openFavoriteProduct(p)">
                        <image v-if="p.image" class="item-img" :src="p.image" mode="aspectFill" />
                        <view v-else class="item-img item-img--text">{{ (p.name || '?').slice(0, 1) }}</view>
                        <text class="item-name">{{ p.name || $t('home.itemPlaceholder') }}</text>
                        <text class="item-price" v-if="p.price != null">¥{{ fenText(p.price) }}</text>
                        <text class="item-store">{{ p.storeName || '' }}</text>
                    </view>
                </scroll-view>
            </view>
            <!-- 常买商品：下单成功后记录，点一下进店并自动加购 -->
            <view v-if="recentProducts.length" class="recent">
                <view class="sec"><text class="sec-t">{{ $t('home.recentProducts') }}</text></view>
                <scroll-view scroll-x class="recent-row">
                    <view v-for="it in recentProducts" :key="'item-' + it.variantId" class="item-card" @tap="openRecentProduct(it)">
                        <image v-if="it.image" class="item-img" :src="it.image" mode="aspectFill" />
                        <view v-else class="item-img item-img--text">{{ it.name.slice(0, 1) }}</view>
                        <text class="item-name">{{ it.name }}</text>
                        <text class="item-price">¥{{ fenText(it.price) }}</text>
                        <text class="item-store">{{ it.storeName || '' }}</text>
                    </view>
                </scroll-view>
            </view>
            <!-- 跨店商品搜索结果（仅在提交搜索后展示） -->
            <view v-if="searchKeyword && searching" class="sp-loading">{{ $t('home.searchLoading') }}</view>
            <template v-if="searchKeyword && searchProductHits.length">
                <view class="sec">
                    <text class="sec-t">{{ $t('home.searchProducts') }}</text>
                    <text class="sec-n">{{ searchProductHits.length }}</text>
                </view>
                <view class="phits">
                    <view v-for="hit in searchProductHits" :key="'hit-' + hit.store.channelId + '-' + hit.product.id" class="phit" @tap="openProductHit(hit)">
                        <image v-if="hit.product.featuredAsset?.preview" class="phit-img" :src="hit.product.featuredAsset.preview" mode="aspectFill" />
                        <view v-else class="phit-img phit-img--text">{{ hit.product.name.slice(0, 1) }}</view>
                        <view class="phit-info">
                            <text class="phit-name">{{ hit.product.name }}</text>
                            <text class="phit-store">{{ hit.store.name }}</text>
                        </view>
                        <text class="phit-price" v-if="hit.variant">¥{{ fenText(hit.variant.priceWithTax) }}</text>
                    </view>
                </view>
            </template>
            <!-- 无结果：热销店铺推荐兜底 -->
            <view v-if="searchKeyword && !searching && !shown.length && !searchProductHits.length && hotStores.length" class="recent">
                <view class="sec"><text class="sec-t">{{ $t('home.hotStores') }}</text></view>
                <scroll-view scroll-x class="recent-row">
                    <view v-for="s in hotStores" :key="'hot-' + s.channelId" class="recent-card" @tap="enterStore(s)">
                        <image v-if="s.logo" class="recent-logo" :src="s.logo" mode="aspectFill" />
                        <view v-else class="recent-logo recent-logo--text">{{ s.name.slice(0, 1) }}</view>
                        <text class="recent-name">{{ s.name }}</text>
                        <text class="recent-meta">{{ $t('home.monthlySales').replace('{n}', String(s.monthlySales)) }}</text>
                    </view>
                </scroll-view>
            </view>
            <LoadingSkeleton v-if="loading" />
            <template v-else>
                <view class="sec" v-if="shown.length">
                    <text class="sec-t">{{ secTitle }}</text>
                    <text class="sec-n">{{ $t('home.nearbyCount').replace('{n}', String(shown.length)) }}</text>
                </view>
                <EmptyState v-if="!shown.length && !(searchKeyword && (searching || searchProductHits.length || hotStores.length))" :text="emptyText" />
                <view v-else class="cards">
                    <view v-for="s in shown" :key="s.channelId" class="card" @tap="enterStore(s)">
                        <image v-if="s.logo" class="logo" :src="s.logo" mode="aspectFill" />
                        <view v-else class="logo logo-text">{{ s.name.slice(0, 1) }}</view>
                        <view class="info">
                            <view class="name-row">
                                <text class="name">{{ s.name }}</text>
                                <text v-if="s.paused" class="paused">{{ $t('home.paused') }}</text>
                                <text v-else-if="storeStatusOf(s) === 'closed'" class="paused paused--closed">{{ $t('home.storeClosed') }}</text>
                                <text v-else-if="storeStatusOf(s) === 'closing'" class="paused paused--closing">{{ $t('home.storeClosing') }}</text>
                            </view>
                            <text class="meta">{{ $t('home.monthlySales').replace('{n}', String(s.monthlySales)) }}</text>
                            <view class="tags">
                                <text class="tag tag-route">{{ deliveryTag(s) || routeText(s.routesEnabled) }}</text>
                                <text v-if="s.promoText" class="tag tag-promo">{{ s.promoText }}</text>
                                <text v-if="isFreeDelivery(s)" class="tag tag-free">{{ $t('home.freeDeliveryTag') }}</text>
                            </view>
                        </view>
                        <view class="fav" :class="{ on: favorites.isFavorite(s.channelId) }" @tap.stop="toggleFav(s)">
                            <text>{{ favorites.isFavorite(s.channelId) ? '♥' : '♡' }}</text>
                        </view>
                        <text class="chev">›</text>
                    </view>
                </view>
            </template>
            </template>
        </view>
        <!-- 筛选弹层：即时生效，点「完成」关闭 -->
        <view v-if="filterOpen" class="filter-mask" @tap.self="filterOpen = false">
            <view class="filter-sheet">
                <view class="fs-head">
                    <text class="fs-title">{{ $t('home.filterTitle') }}</text>
                    <text class="fs-close" @tap="filterOpen = false">✕</text>
                </view>
                <view class="fs-group">
                    <text class="fs-label">{{ $t('home.filterCommon') }}</text>
                    <view class="fs-chips">
                        <view class="fs-chip" :class="{ on: filters.openOnly }" @tap="filters.openOnly = !filters.openOnly">{{ $t('home.filterOpenOnly') }}</view>
                        <view class="fs-chip" :class="{ on: filters.freeDelivery }" @tap="filters.freeDelivery = !filters.freeDelivery">{{ $t('home.filterFreeDelivery') }}</view>
                        <view class="fs-chip" :class="{ on: filters.hasPromo }" @tap="filters.hasPromo = !filters.hasPromo">{{ $t('home.filterPromo') }}</view>
                    </view>
                </view>
                <view class="fs-group">
                    <text class="fs-label">{{ $t('home.filterMinOrderLabel') }}</text>
                    <view class="fs-chips">
                        <view class="fs-chip" :class="{ on: filters.minOrderMax == null }" @tap="filters.minOrderMax = null">{{ $t('home.filterMinOrderAny') }}</view>
                        <view v-for="v in MIN_ORDER_OPTIONS" :key="v" class="fs-chip" :class="{ on: filters.minOrderMax === v }" @tap="filters.minOrderMax = v">≤ ¥{{ v }}</view>
                    </view>
                </view>
                <view class="fs-actions">
                    <view class="fs-reset" @tap="resetFilters">{{ $t('home.filterReset') }}</view>
                    <view class="fs-apply" @tap="filterOpen = false">{{ $t('home.filterApply') }}</view>
                </view>
            </view>
        </view>
        <!-- 配送楼栋快捷切换（数据源：结算页缓存的 zones/buildings，缺省回退渠道接口） -->
        <view v-if="targetOpen" class="target-mask" @tap.self="targetOpen = false">
            <view class="target-sheet">
                <view class="fs-head">
                    <text class="fs-title">{{ $t('home.targetTitle') }}</text>
                    <text class="fs-close" @tap="targetOpen = false">✕</text>
                </view>
                <view v-if="targetLoading" class="sp-tip">{{ $t('home.searchLoading') }}</view>
                <template v-else>
                    <view class="fs-group" v-if="targetZones.length">
                        <text class="fs-label">{{ $t('checkout.pickZone') }}</text>
                        <view class="fs-chips">
                            <view v-for="z in targetZones" :key="'tz-' + z.id" class="fs-chip" :class="{ on: String(targetZoneId) === String(z.id) }" @tap="pickTargetZone(z.id)">{{ z.name }}</view>
                        </view>
                    </view>
                    <view class="fs-group" v-if="targetBuildings.length">
                        <text class="fs-label">{{ $t('checkout.pickBuilding') }}</text>
                        <view class="fs-chips">
                            <view v-for="b in targetBuildings" :key="'tb-' + b.id" class="fs-chip" :class="{ on: String(targetBuildingId) === String(b.id) }" @tap="targetBuildingId = String(b.id)">{{ b.name }}</view>
                        </view>
                    </view>
                    <view v-if="!targetZones.length" class="sp-tip">{{ $t('home.noTargetOptions') }}</view>
                    <view class="fs-actions">
                        <view class="fs-apply" @tap="saveTarget">{{ $t('home.saveTarget') }}</view>
                    </view>
                </template>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { fetchStoreList, fetchProductListForChannel } from '../../api/queries/waimai';
import { fetchZones, fetchBuildings } from '../../api/mutations/campus';
import { getMyCoupons } from '../../api/queries/coupon';
import { readSearchHistory, pushSearchHistory, clearSearchHistory, buildHotWords, matchesProduct } from '../../utils/search';
import { filterStores, applyStoreFilters, sortStores, type StoreSort, type StoreFilterOptions } from '../../utils/store-filter';
import { storeDisplayName, routeText, deliveryTag } from '../../utils/store-display';
import { getStoreStatus, type StoreOpenState } from '../../utils/store-status';
import { theme, initTheme, toggleTheme } from '../../utils/theme';
import { useLocaleStore } from '../../stores/locale';
import { useFavoritesStore } from '../../stores/favorites';
import { useAuthStore } from '../../stores/auth';
import { useMessagesStore } from '../../stores/messages';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
import EmptyState from '../../components/EmptyState.vue';

const TAGS = ['全部', '米饭快餐', '奶茶甜品', '面食', '夜宵'];
const TAG_ICONS: Record<string, string> = { 全部: '🍽️', 米饭快餐: '🍚', 奶茶甜品: '🧋', 面食: '🍜', 夜宵: '🌙' };
const MIN_ORDER_OPTIONS = [15, 20, 30];
const locale = useLocaleStore();
const favorites = useFavoritesStore();
const authStore = useAuthStore();
const messages = useMessagesStore();
const unusedCouponCount = ref(0);
const expiringCouponCount = ref(0);
const keyword = ref('');
const activeTag = ref('全部');
const loading = ref(true);
const stores = ref<any[]>([]);
const sortBy = ref<StoreSort>('default');
const filterOpen = ref(false);
const filters = ref<StoreFilterOptions>({});

// ── 搜索：焦点面板（历史/热搜）+ 提交后跨店商品搜索 ──
const searchFocused = ref(false);
const searchHistory = ref<string[]>(readSearchHistory());
const searchKeyword = ref('');
const searching = ref(false);
const searchProductHits = ref<Array<{ store: any; product: any; variant: any }>>([]);
const showSearchPanel = computed(() => searchFocused.value && !keyword.value.trim());
const hotWords = computed(() => buildHotWords(stores.value, 6));
/** 联想关键词（小写）；空则无面板 */
const suggestKey = computed(() => keyword.value.trim().toLowerCase());
/** 店铺联想：店名 / tags 包含关键词，最多 4 条 */
const storeSuggestions = computed(() => {
    const kw = suggestKey.value;
    if (!kw) return [] as Array<{ store: any; meta: string }>;
    return stores.value
        .filter((s: any) =>
            String(s.name ?? '').toLowerCase().includes(kw) ||
            (s.tags ?? []).some((t: any) => String(t).toLowerCase().includes(kw)))
        .slice(0, 4)
        .map((s: any) => {
            const sales = s.monthlySales != null ? locale.t('home.monthlySales').replace('{n}', String(s.monthlySales)) : '';
            const meta = [sales, deliveryTag(s) || ''].filter(Boolean).join(' · ');
            return { store: s, meta };
        });
});
/** 历史联想：历史记录包含关键词，最多 3 条 */
const historySuggestions = computed(() => {
    const kw = suggestKey.value;
    if (!kw) return [] as string[];
    return searchHistory.value.filter(h => String(h).toLowerCase().includes(kw)).slice(0, 3);
});
/** 热搜联想：热词包含关键词（去掉已在历史组出现的），最多 3 条 */
const hotSuggestions = computed(() => {
    const kw = suggestKey.value;
    if (!kw) return [] as string[];
    return hotWords.value
        .filter(w => String(w).toLowerCase().includes(kw) && !historySuggestions.value.includes(w))
        .slice(0, 3);
});
/** 有任意联想才显示面板，避免空白浮层 */
const showSuggest = computed(() => searchFocused.value && !!suggestKey.value &&
    (storeSuggestions.value.length + historySuggestions.value.length + hotSuggestions.value.length > 0));
/** 无结果兜底：热销店铺（月售降序前 4，含休息中的店，点进去有休息提示） */
const hotStores = computed(() => [...stores.value].sort((a: any, b: any) => (b.monthlySales || 0) - (a.monthlySales || 0)).slice(0, 4));
let blurTimer: any = null;

function onSearchFocus() {
    if (blurTimer) clearTimeout(blurTimer);
    searchFocused.value = true;
}
/** 延迟收起：让面板里的点击先命中，避免 blur 先关面板 */
function onSearchBlur() {
    blurTimer = setTimeout(() => { searchFocused.value = false; }, 200);
}
function onKeywordInput(e: any) {
    const val = String(e?.detail?.value ?? '').trim();
    if (!val) {
        searchKeyword.value = '';
        searchProductHits.value = [];
    }
}
function pickWord(w: string) {
    keyword.value = w;
    submitSearch(w);
}
function clearHistory() {
    clearSearchHistory();
    searchHistory.value = [];
}

/** 提交搜索：写历史 → 店铺即时过滤（keyword）→ 跨店并发搜商品 */
async function submitSearch(raw: string) {
    const kw = String(raw ?? '').trim();
    keyword.value = kw;
    searchFocused.value = false;
    if (!kw) return;
    searchHistory.value = pushSearchHistory(kw);
    searchKeyword.value = kw;
    searchProductHits.value = [];
    searching.value = true;
    try {
        const targets = stores.value.filter((s: any) => !s.paused && s.channelToken);
        const results = await Promise.allSettled(targets.map((s: any) =>
            fetchProductListForChannel(s.channelToken).then((list: any[]) => {
                const hits: Array<{ store: any; product: any; variant: any }> = [];
                for (const p of list) {
                    if (!matchesProduct(p, kw)) continue;
                    hits.push({ store: s, product: p, variant: p.variants?.[0] });
                    if (hits.length >= 6) break;
                }
                return hits;
            }),
        ));
        // 关键词在 await 期间被改掉：丢弃过期结果
        if (searchKeyword.value !== kw) return;
        const merged: Array<{ store: any; product: any; variant: any }> = [];
        for (const r of results) {
            if (r.status === 'fulfilled') merged.push(...r.value);
            if (merged.length >= 24) break;
        }
        searchProductHits.value = merged.slice(0, 24);
    } finally {
        searching.value = false;
    }
}

/** 分 → 元字符串（整数不带小数） */
function fenText(fen?: number | null): string {
    const v = Math.max(0, Number(fen) || 0) / 100;
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function openProductHit(hit: { store: any; product: any }) {
    const s = hit.store;
    const cid = s.channelId != null ? `&cid=${s.channelId}` : '';
    const routes = (s.routesEnabled || []).join(',');
    uni.navigateTo({ url: `/pages/shop/menu?token=${s.channelToken}&name=${encodeURIComponent(s.name)}&routes=${encodeURIComponent(routes)}${cid}&q=${encodeURIComponent(hit.product.name)}` });
}

/** 收藏商品：补齐渠道后带 q 进店定位；缺 token 时静默忽略（关机/下线店） */
const favoriteProducts = computed(() => favorites.variantItems.filter(v => !!v.name).slice(0, 8));
const recentProducts = computed(() => (keyword.value || searchKeyword.value ? [] : favorites.recentItems.slice(0, 8)));

function storeOfVariant(v: any): any {
    return stores.value.find((s: any) =>
        (v.channelToken && s.channelToken === v.channelToken) ||
        (v.channelId != null && String(s.channelId) === String(v.channelId)));
}

function openFavoriteProduct(p: any) {
    const s = storeOfVariant(p);
    const token = p.channelToken || s?.channelToken;
    if (!token) return uni.showToast({ title: locale.t('home.shopPaused'), icon: 'none' });
    const cidVal = p.channelId ?? s?.channelId;
    const cid = cidVal != null ? `&cid=${cidVal}` : '';
    const routes = (s?.routesEnabled || []).join(',');
    uni.navigateTo({ url: `/pages/shop/menu?token=${token}&name=${encodeURIComponent(s?.name || p.storeName || '')}&routes=${encodeURIComponent(routes)}${cid}&q=${encodeURIComponent(p.name || '')}` });
}

function openRecentProduct(it: any) {
    const s = storeOfVariant(it);
    const token = it.channelToken || s?.channelToken;
    if (!token) return uni.showToast({ title: locale.t('home.shopPaused'), icon: 'none' });
    const cidVal = it.channelId ?? s?.channelId;
    const cid = cidVal != null ? `&cid=${cidVal}` : '';
    const routes = (s?.routesEnabled || it.routes || '').toString();
    uni.navigateTo({ url: `/pages/shop/menu?token=${token}&name=${encodeURIComponent(s?.name || it.storeName || '')}&routes=${encodeURIComponent(routes)}${cid}&add=${it.variantId}` });
}

// ── 当前配送楼栋（结算页保存）与快捷切换 ──
interface DeliveryTargetLocal { zoneId: string; zoneName: string; buildingId: string; buildingName: string; at?: number }
function readLocalJSON(key: string): any {
    try {
        const raw = uni.getStorageSync(key);
        if (!raw) return null;
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch { return null; }
}
const deliveryTarget = ref<DeliveryTargetLocal | null>(readLocalJSON('delivery_target'));
const targetOpen = ref(false);
const targetLoading = ref(false);
const targetZones = ref<any[]>([]);
const targetBuildings = ref<any[]>([]);
const targetZoneId = ref('');
const targetBuildingId = ref('');
let targetOptionsCache: { zones: any[]; buildings: any[] } = { zones: [], buildings: [] };

async function openTargetSheet() {
    targetOpen.value = true;
    const opts = readLocalJSON('delivery_target_options');
    targetOptionsCache = {
        zones: Array.isArray(opts?.zones) ? opts.zones : [],
        buildings: Array.isArray(opts?.buildings) ? opts.buildings : [],
    };
    if (targetOptionsCache.zones.length) {
        targetZones.value = targetOptionsCache.zones;
        await pickTargetZone(deliveryTarget.value?.zoneId || targetZones.value[0].id);
        return;
    }
    targetLoading.value = true;
    try {
        targetZones.value = await fetchZones();
        await pickTargetZone(deliveryTarget.value?.zoneId || targetZones.value[0]?.id);
    } catch {
        targetZones.value = [];
        targetBuildings.value = [];
    }
    targetLoading.value = false;
}

async function pickTargetZone(zoneId: string | number) {
    if (zoneId == null || zoneId === '') return;
    targetZoneId.value = String(zoneId);
    const local = targetOptionsCache.buildings.filter((b: any) => String(b.zoneId ?? '') === String(zoneId));
    if (local.length) {
        targetBuildings.value = local;
    } else {
        try {
            targetBuildings.value = await fetchBuildings(String(zoneId));
        } catch {
            targetBuildings.value = [];
        }
    }
    const prefer = deliveryTarget.value?.buildingId;
    targetBuildingId.value = targetBuildings.value.some((b: any) => String(b.id) === String(prefer))
        ? String(prefer)
        : String(targetBuildings.value[0]?.id ?? '');
}

function saveTarget() {
    const z = targetZones.value.find((x: any) => String(x.id) === targetZoneId.value);
    const b = targetBuildings.value.find((x: any) => String(x.id) === targetBuildingId.value);
    if (!z || !b) {
        uni.showToast({ title: locale.t('home.noTargetOptions'), icon: 'none' });
        return;
    }
    const target: DeliveryTargetLocal = {
        zoneId: String(z.id), zoneName: z.name, buildingId: String(b.id), buildingName: b.name, at: Date.now(),
    };
    uni.setStorageSync('delivery_target', JSON.stringify(target));
    deliveryTarget.value = target;
    targetOpen.value = false;
}

const tagList = computed(() => {
    // 店铺未配置 tag 时不出现空类目：固定类目里只保留有店铺的
    const used = new Set(stores.value.flatMap((s: any) => s.tags ?? []));
    return TAGS.filter(t => t === '全部' || used.has(t));
});
const filterCount = computed(() => [
    filters.value.openOnly, filters.value.freeDelivery, filters.value.hasPromo, filters.value.minOrderMax != null,
].filter(Boolean).length);
const shown = computed(() => sortStores(
    applyStoreFilters(filterStores(stores.value, keyword.value, activeTag.value), filters.value),
    sortBy.value,
    favorites.ids,
));
const emptyText = computed(() => filterCount.value ? locale.t('home.filteredEmpty') : locale.t('home.emptySearch'));
/** 店铺营业状态：按 businessHours 实时计算（未配置返回 unknown，不额外标注） */
function storeStatusOf(s: any): StoreOpenState {
    return getStoreStatus(s?.businessHours).state;
}
/** 常买店铺：本地记录 → 匹配当前店铺列表（已下线/休息不隐藏，点进店有休息提示） */
const recentStores = computed(() => {
    if (keyword.value) return [] as any[];
    return favorites.recents
        .map((r: any) => {
            const hit = stores.value.find((s: any) =>
                (r.channelId && String(s.channelId) === String(r.channelId)) || s.channelToken === r.channelToken);
            return hit ? { ...hit, recentAt: r.at } : null;
        })
        .filter((s: any) => !!s)
        .slice(0, 6);
});
const secTitle = computed(() => {
    if (keyword.value) return locale.t('home.searchResult').replace('{kw}', keyword.value);
    return activeTag.value === '全部' ? locale.t('home.allStores') : tagLabel(activeTag.value);
});
const promoStore = computed(() => stores.value.find((s: any) => s.promoText && !s.paused));
// 本地测试版入口：仅当 .env 配置 VITE_JIANGHU_ENTRY=true 时显示（prod 默认隐藏，避免产品级入口决策前置）
const jianghuEntry = String(import.meta.env.VITE_JIANGHU_ENTRY) === 'true';

function tagIcon(t: string): string {
    return TAG_ICONS[t] ?? '🍴';
}

function isFreeDelivery(s: any): boolean {
    return Number(s.deliveryFee) === 0;
}

function resetFilters() {
    filters.value = {};
}

async function toggleFav(s: any) {
    if (s.channelId == null) return;
    try {
        const on = await favorites.toggle(s.channelId);
        uni.showToast({ title: on ? locale.t('home.favAdded') : locale.t('home.favRemoved'), icon: 'none' });
    } catch {
        uni.showToast({ title: locale.t('home.favFail'), icon: 'none' });
    }
}

// 类目值为业务值（匹配店铺 tags），仅展示层翻译
function tagLabel(t: string): string {
    if (t === '全部') return locale.t('home.tagAll');
    if (t === '米饭快餐') return locale.t('home.tagRice');
    if (t === '奶茶甜品') return locale.t('home.tagTea');
    if (t === '面食') return locale.t('home.tagNoodle');
    if (t === '夜宵') return locale.t('home.tagNight');
    return t;
}

function goOrders() {
    uni.switchTab({ url: '/pages/orders/index' });
}
function goRider() {
    uni.navigateTo({ url: '/pkg-rider/pages/rider-join' });
}
function goErrand() { uni.navigateTo({ url: '/pkg-campus/errand/create' }); }
function goCouponCentre() { uni.navigateTo({ url: '/pkg-promotion/pages/coupon-centre' }); }
function goMyCoupons() { uni.navigateTo({ url: '/pkg-promotion/pages/my-coupons' }); }
function goJianghu() { uni.navigateTo({ url: '/pkg-jianghu/pages/jh-hall' }); }
function goMessages() { uni.navigateTo({ url: '/pkg-user/pages/messages' }); }
function goCart() { uni.navigateTo({ url: '/pkg-order/pages/cart' }); }

/** 未使用券角标 + 临期券提示：同一次 myCoupons 返回计算两项；未登录不请求；失败静默置 0，不阻塞首页店铺加载 */
async function loadCouponBadge() {
    if (!authStore.isLoggedIn) { unusedCouponCount.value = 0; expiringCouponCount.value = 0; return; }
    try {
        const res = await getMyCoupons('UNUSED');
        const list: any[] = res?.myCoupons ?? [];
        unusedCouponCount.value = list.length;
        const now = Date.now();
        const deadline = now + 3 * 24 * 60 * 60 * 1000;
        expiringCouponCount.value = list.filter((c: any) => {
            if (!c?.expiredAt) return false;
            const t = typeof c.expiredAt === 'number' ? c.expiredAt : new Date(c.expiredAt).getTime();
            return Number.isFinite(t) && t >= now && t <= deadline;
        }).length;
    } catch { unusedCouponCount.value = 0; expiringCouponCount.value = 0; }
}
function showNotice() {
    uni.showModal({ title: locale.t('home.notice'), content: locale.t('home.noticeText'), showCancel: false, confirmText: locale.t('home.noticeOk') });
}

async function load() {
    loading.value = true;
    try {
        const list = await fetchStoreList();
        stores.value = list.map((s: any) => ({ ...s, name: storeDisplayName(s.name) }));
        // 远端商品收藏只存 id：用渠道商品列表回填名称/图/价（失败静默，不阻塞首页）
        void favorites.hydrateVariantMeta(stores.value);
    } finally { loading.value = false; }
}

function enterStore(s: any) {
    if (s.paused) return uni.showToast({ title: locale.t('home.shopPaused'), icon: 'none' });
    favorites.touchRecent({ channelId: s.channelId, channelToken: s.channelToken, name: s.name, routes: (s.routesEnabled || []).join(',') });
    const routes = (s.routesEnabled || []).join(',');
    const cid = s.channelId != null ? `&cid=${s.channelId}` : '';
    uni.navigateTo({ url: `/pages/shop/menu?token=${s.channelToken}&name=${encodeURIComponent(s.name)}&routes=${encodeURIComponent(routes)}${cid}` });
}

onMounted(() => {
    initTheme();
    void favorites.loadRemote();
    load();
});
// 登录/退出后回到首页：同步云端收藏（登录时会把游客收藏补写到云端）；同时刷新结算页刚保存的楼栋
onShow(() => {
    void favorites.loadRemote();
    void loadCouponBadge();
    void messages.load();
    deliveryTarget.value = readLocalJSON('delivery_target');
});
onPullDownRefresh(async () => { await load(); await favorites.loadRemote(); uni.stopPullDownRefresh(); });
</script>

<style scoped lang="scss">
/* ── 双主题 token（亮色默认，.dark 覆盖；头部保持品牌橙不换肤=方案A「橙头」） ── */
.page {
    --w-bg: #f5f5f5;
    --w-surface: #ffffff;
    --w-surface-muted: #f0f0f0;
    --w-text: #1a1a1a;
    --w-text-muted: #999999;
    --w-border: #ececec;
    --w-brand-soft: #fff3e6;
    --w-brand-text: #ff6600;
    --w-search-bg: #ffffff;
    --w-skel-from: #f0f0f0;
    --w-skel-to: #e0e0e0;

    background: var(--w-bg);
    min-height: 100vh;
    padding-bottom: 24rpx;
}
.page.dark {
    --w-bg: #161618;
    --w-surface: #242428;
    --w-surface-muted: #1e1e21;
    --w-text: #ececf0;
    --w-text-muted: #9a9aa3;
    --w-border: #35353a;
    --w-brand-soft: rgba(255, 102, 0, 0.16);
    --w-brand-text: #ff8a3d;
    --w-search-bg: #2a2a2f;
    --w-skel-from: #2a2a2f;
    --w-skel-to: #34343a;
}
.head { padding: 24rpx 24rpx 28rpx; background: $brand; }
.loc-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.loc { color: #fff; font-size: 28rpx; font-weight: 600; }
.head-right { display: flex; align-items: center; gap: 8rpx; }
.theme-btn { width: 56rpx; height: 56rpx; border-radius: 999rpx; background: rgba(255, 255, 255, 0.22); display: flex; align-items: center; justify-content: center; font-size: 28rpx; }
.bell-btn { position: relative; width: 56rpx; height: 56rpx; border-radius: 999rpx; background: rgba(255, 255, 255, 0.22); display: flex; align-items: center; justify-content: center; }
.bell-ico { font-size: 26rpx; line-height: 1; }
.bell-badge { position: absolute; top: -6rpx; right: -8rpx; min-width: 30rpx; height: 30rpx; line-height: 30rpx; padding: 0 6rpx; border-radius: 999rpx; background: #ff3b30; color: #fff; font-size: 18rpx; text-align: center; }
.hlink { color: #fff; font-size: 24rpx; opacity: .92; padding: 4rpx 0 4rpx 8rpx; }
.search { background: var(--w-search-bg); color: var(--w-text); border-radius: 999rpx; padding: 12rpx 24rpx; font-size: 26rpx; }
.search :deep(.uni-input-placeholder) { color: var(--w-text-muted); }
.body { padding: 0 24rpx; }
.quick { margin-top: 20rpx; background: var(--w-surface); border-radius: $radius-card; padding: 24rpx 0; display: flex; }
.qk { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 8rpx; }
.qico { position: relative; flex-shrink: 0; width: 76rpx; height: 76rpx; border-radius: 999rpx; background: var(--w-brand-soft); display: flex; align-items: center; justify-content: center; font-size: 38rpx; }
.qtxt { max-width: 100%; font-size: 22rpx; color: var(--w-text); text-align: center; }
.qk-badge { position: absolute; top: -8rpx; right: -12rpx; min-width: 32rpx; height: 32rpx; line-height: 32rpx; padding: 0 6rpx; border-radius: 16rpx; background: #ff4d4f; color: #fff; font-size: 20rpx; font-weight: 600; text-align: center; }
.pills { white-space: nowrap; padding: 20rpx 0 4rpx; }
.pill { display: inline-flex; align-items: center; gap: 6rpx; padding: 10rpx 24rpx; margin-right: 16rpx; border-radius: 999rpx; font-size: 24rpx; color: var(--w-text-muted); background: var(--w-surface); border: 1rpx solid var(--w-border); }
.pill.on { background: $brand; border-color: $brand; color: #fff; }
.pico { font-size: 24rpx; }
.notice { margin-top: 20rpx; display: flex; align-items: center; background: var(--w-brand-soft); color: var(--w-brand-text); border-radius: 999rpx; padding: 14rpx 24rpx; font-size: 24rpx; }
.ntext { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nmore { margin-left: 8rpx; flex-shrink: 0; }
.sec { display: flex; justify-content: space-between; align-items: baseline; padding: 28rpx 4rpx 8rpx; }
.sec-t { font-size: 32rpx; font-weight: 600; color: var(--w-text); }
.sec-n { font-size: 22rpx; color: var(--w-text-muted); }
.cards { display: flex; flex-direction: column; gap: 16rpx; padding-bottom: 8rpx; }
.card { display: flex; align-items: center; gap: 20rpx; background: var(--w-surface); border-radius: $radius-card; padding: 24rpx; }
.logo { width: 120rpx; height: 120rpx; border-radius: $radius; flex-shrink: 0; }
.logo-text { background: var(--w-brand-soft); color: var(--w-brand-text); font-size: 48rpx; text-align: center; line-height: 120rpx; }
.info { flex: 1; min-width: 0; }
.name-row { display: flex; align-items: center; gap: 12rpx; }
.name { font-size: 30rpx; font-weight: 600; color: var(--w-text); }
.paused { font-size: 20rpx; color: var(--w-text-muted); border: 1rpx solid var(--w-border); border-radius: 6rpx; padding: 0 8rpx; }
.paused--closed { color: #b42318; border-color: #f3b6b0; background: #fff2f0; }
.paused--closing { color: #b45309; border-color: #ffd9ad; background: #fff8ef; }
.meta { display: block; font-size: 24rpx; color: var(--w-text-muted); margin-top: 6rpx; }
.tags { display: flex; flex-wrap: wrap; gap: 8rpx; margin-top: 12rpx; }
.tag { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; }
.tag-route { color: var(--w-text-muted); background: var(--w-bg); }
.tag-promo { color: var(--w-brand-text); background: var(--w-brand-soft); }
.chev { color: var(--w-text-muted); font-size: 32rpx; margin-left: 8rpx; flex-shrink: 0; }
/* 排序 chips */
.sortbar { white-space: nowrap; padding: 16rpx 0 0; }
.sort-chip { display: inline-flex; align-items: center; gap: 4rpx; padding: 8rpx 20rpx; margin-right: 12rpx; border-radius: 999rpx; font-size: 22rpx; color: var(--w-text-muted); background: var(--w-surface); border: 1rpx solid var(--w-border); }
.sort-chip.on { color: var(--w-brand-text); border-color: $brand; background: var(--w-brand-soft); }
/* 常买店铺横排 */
.recent { margin-top: 8rpx; }
.recent-row { white-space: nowrap; padding-bottom: 8rpx; }
.recent-card { display: inline-flex; flex-direction: column; align-items: center; width: 148rpx; margin-right: 16rpx; background: var(--w-surface); border-radius: $radius-card; padding: 16rpx 12rpx; vertical-align: top; }
.recent-logo { width: 88rpx; height: 88rpx; border-radius: 999rpx; }
.recent-logo--text { background: var(--w-brand-soft); color: var(--w-brand-text); font-size: 38rpx; line-height: 88rpx; text-align: center; }
.recent-name { width: 100%; font-size: 22rpx; color: var(--w-text); margin-top: 10rpx; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-meta { font-size: 20rpx; color: var(--w-text-muted); margin-top: 4rpx; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 收藏心（卡片右上角） */
.card { position: relative; }
.name-row { padding-right: 48rpx; }
.fav { position: absolute; top: 14rpx; right: 18rpx; font-size: 34rpx; color: var(--w-text-muted); padding: 6rpx; line-height: 1; }
.fav.on { color: #ff4d6d; }
.tag-free { color: #0a9d58; background: #ecfaf1; }
/* 筛选弹层 */
/* z-index 需高于 uni tabbar（998），否则底部按钮被 tab 栏拦截点击 */
.filter-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); z-index: 1000; display: flex; align-items: flex-end; }
.filter-sheet { width: 100%; background: var(--w-surface); border-radius: 28rpx 28rpx 0 0; padding: 28rpx 28rpx calc(28rpx + env(safe-area-inset-bottom)); }
.fs-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
.fs-title { font-size: 32rpx; font-weight: 600; color: var(--w-text); }
.fs-close { font-size: 30rpx; color: var(--w-text-muted); padding: 8rpx; }
.fs-group { margin-top: 20rpx; }
.fs-label { font-size: 24rpx; color: var(--w-text-muted); display: block; margin-bottom: 12rpx; }
.fs-chips { display: flex; flex-wrap: wrap; gap: 14rpx; }
.fs-chip { padding: 12rpx 26rpx; border-radius: 999rpx; font-size: 24rpx; color: var(--w-text); background: var(--w-bg); border: 1rpx solid var(--w-border); }
.fs-chip.on { color: var(--w-brand-text); background: var(--w-brand-soft); border-color: $brand; }
.fs-actions { display: flex; gap: 20rpx; margin-top: 32rpx; }
.fs-reset { flex: 1; height: 84rpx; line-height: 84rpx; text-align: center; border-radius: 999rpx; font-size: 28rpx; color: var(--w-text-muted); background: var(--w-surface-muted); }
.fs-apply { flex: 2; height: 84rpx; line-height: 84rpx; text-align: center; border-radius: 999rpx; font-size: 28rpx; font-weight: 600; color: #fff; background: $brand; }
/* 当前配送楼栋条（头部品牌底色上） */
.target-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; padding: 8rpx 20rpx; border-radius: 999rpx; background: rgba(255, 255, 255, .18); }
.target-row__txt { font-size: 24rpx; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.target-row__sw { flex-shrink: 0; margin-left: 12rpx; font-size: 22rpx; color: #fff; opacity: .92; }
/* 搜索面板（历史 / 热搜） */
.search-panel { margin-top: 20rpx; background: var(--w-surface); border-radius: $radius-card; padding: 8rpx 24rpx 24rpx; }
.sp-group { padding-top: 20rpx; }
.sp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
.sp-title { font-size: 26rpx; font-weight: 600; color: var(--w-text); }
.sp-clear { font-size: 22rpx; color: var(--w-text-muted); padding: 4rpx 8rpx; }
.sp-chips { display: flex; flex-wrap: wrap; gap: 14rpx; }
.sp-chip { max-width: 100%; padding: 10rpx 24rpx; border-radius: 999rpx; font-size: 24rpx; color: var(--w-text); background: var(--w-bg); border: 1rpx solid var(--w-border); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-chip--hot { color: var(--w-brand-text); background: var(--w-brand-soft); border-color: transparent; }
.sp-tip { padding: 28rpx 0 8rpx; font-size: 24rpx; color: var(--w-text-muted); text-align: center; }
.sp-loading { padding: 20rpx 4rpx; font-size: 24rpx; color: var(--w-text-muted); }
/* 搜索联想（店铺 / 历史 / 热搜）：沿用搜索面板底色与圆角，最多约 8 行后滚动 */
.suggest-panel { max-height: 680rpx; }
.sg-row { display: flex; align-items: center; gap: 12rpx; padding: 16rpx 4rpx; border-bottom: 1rpx solid var(--w-border); }
.sg-list .sg-row:last-child { border-bottom: none; }
.sg-ico { flex-shrink: 0; font-size: 24rpx; }
.sg-name { flex: 1; min-width: 0; font-size: 26rpx; color: var(--w-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sg-meta { flex-shrink: 0; max-width: 46%; font-size: 22rpx; color: var(--w-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sg-chev { flex-shrink: 0; font-size: 28rpx; color: var(--w-text-muted); }
/* 临期券提示条：紧凑橙色描边，位于搜索区与店铺列表之间 */
.coupon-expiring { margin-top: 16rpx; display: flex; align-items: center; gap: 8rpx; background: var(--w-brand-soft); color: var(--w-brand-text); border: 1rpx solid rgba(255, 102, 0, 0.35); border-radius: 999rpx; padding: 10rpx 24rpx; font-size: 22rpx; }
.ce-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ce-ico, .ce-more { flex-shrink: 0; }
/* 商品横排（收藏商品 / 常买商品） */
.item-card { display: inline-flex; flex-direction: column; width: 168rpx; margin-right: 16rpx; background: var(--w-surface); border-radius: $radius-card; padding: 12rpx; vertical-align: top; }
.item-img { width: 144rpx; height: 144rpx; border-radius: $radius; }
.item-img--text { display: flex; align-items: center; justify-content: center; background: var(--w-brand-soft); color: var(--w-brand-text); font-size: 48rpx; }
.item-name { width: 100%; margin-top: 10rpx; font-size: 22rpx; color: var(--w-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-price { margin-top: 4rpx; font-size: 24rpx; font-weight: 600; color: var(--w-brand-text); }
.item-store { width: 100%; margin-top: 2rpx; font-size: 20rpx; color: var(--w-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 跨店商品搜索结果 */
.phits { background: var(--w-surface); border-radius: $radius-card; padding: 0 20rpx; }
.phit { display: flex; align-items: center; gap: 16rpx; padding: 18rpx 0; border-bottom: 1rpx solid var(--w-border); }
.phit:last-child { border-bottom: none; }
.phit-img { width: 96rpx; height: 96rpx; border-radius: $radius; flex-shrink: 0; }
.phit-img--text { display: flex; align-items: center; justify-content: center; background: var(--w-brand-soft); color: var(--w-brand-text); font-size: 36rpx; }
.phit-info { flex: 1; min-width: 0; }
.phit-name { display: block; font-size: 26rpx; color: var(--w-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.phit-store { display: block; margin-top: 4rpx; font-size: 22rpx; color: var(--w-text-muted); }
.phit-price { flex-shrink: 0; font-size: 26rpx; font-weight: 600; color: var(--w-brand-text); }
/* 楼栋切换弹层（z-index 高于 tabbar 998） */
.target-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); z-index: 1000; display: flex; align-items: flex-end; }
.target-sheet { width: 100%; max-height: 70vh; overflow-y: auto; background: var(--w-surface); border-radius: 28rpx 28rpx 0 0; padding: 28rpx 28rpx calc(28rpx + env(safe-area-inset-bottom)); }
</style>
