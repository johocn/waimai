<template>
    <view class="page" :class="{ dark: theme === 'dark' }">
        <view class="head">
            <view class="loc-row">
                <text class="loc">{{ $t('home.locText') }}</text>
                <view class="head-right">
                    <view class="theme-btn" @tap="toggleTheme">{{ theme === 'dark' ? '☀️' : '🌙' }}</view>
                    <text class="hlink" @tap="goOrders">{{ $t('home.myOrders') }}</text>
                </view>
            </view>
            <input class="search" v-model="keyword" :placeholder="$t('home.searchPh')" confirm-type="search" />
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
                <view class="qk" @tap="showNotice">
                    <view class="qico">📣</view>
                    <text class="qtxt">{{ $t('home.notice') }}</text>
                </view>
                <view class="qk" v-if="jianghuEntry" @tap="goJianghu">
                    <view class="qico">🗡️</view>
                    <text class="qtxt">江湖</text>
                </view>
            </view>
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
            <LoadingSkeleton v-if="loading" />
            <template v-else>
                <view class="sec" v-if="shown.length">
                    <text class="sec-t">{{ secTitle }}</text>
                    <text class="sec-n">{{ $t('home.nearbyCount').replace('{n}', String(shown.length)) }}</text>
                </view>
                <EmptyState v-if="!shown.length" :text="emptyText" />
                <view v-else class="cards">
                    <view v-for="s in shown" :key="s.channelId" class="card" @tap="enterStore(s)">
                        <image v-if="s.logo" class="logo" :src="s.logo" mode="aspectFill" />
                        <view v-else class="logo logo-text">{{ s.name.slice(0, 1) }}</view>
                        <view class="info">
                            <view class="name-row">
                                <text class="name">{{ s.name }}</text>
                                <text v-if="s.paused" class="paused">{{ $t('home.paused') }}</text>
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
    </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { fetchStoreList } from '../../api/queries/waimai';
import { filterStores, applyStoreFilters, sortStores, type StoreSort, type StoreFilterOptions } from '../../utils/store-filter';
import { storeDisplayName, routeText, deliveryTag } from '../../utils/store-display';
import { theme, initTheme, toggleTheme } from '../../utils/theme';
import { useLocaleStore } from '../../stores/locale';
import { useFavoritesStore } from '../../stores/favorites';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
import EmptyState from '../../components/EmptyState.vue';

const TAGS = ['全部', '米饭快餐', '奶茶甜品', '面食', '夜宵'];
const TAG_ICONS: Record<string, string> = { 全部: '🍽️', 米饭快餐: '🍚', 奶茶甜品: '🧋', 面食: '🍜', 夜宵: '🌙' };
const MIN_ORDER_OPTIONS = [15, 20, 30];
const locale = useLocaleStore();
const favorites = useFavoritesStore();
const keyword = ref('');
const activeTag = ref('全部');
const loading = ref(true);
const stores = ref<any[]>([]);
const sortBy = ref<StoreSort>('default');
const filterOpen = ref(false);
const filters = ref<StoreFilterOptions>({});

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
function goJianghu() { uni.navigateTo({ url: '/pkg-jianghu/pages/jh-hall' }); }
function showNotice() {
    uni.showModal({ title: locale.t('home.notice'), content: locale.t('home.noticeText'), showCancel: false, confirmText: locale.t('home.noticeOk') });
}

async function load() {
    loading.value = true;
    try {
        const list = await fetchStoreList();
        stores.value = list.map((s: any) => ({ ...s, name: storeDisplayName(s.name) }));
    } finally { loading.value = false; }
}

function enterStore(s: any) {
    if (s.paused) return uni.showToast({ title: locale.t('home.shopPaused'), icon: 'none' });
    const routes = (s.routesEnabled || []).join(',');
    const cid = s.channelId != null ? `&cid=${s.channelId}` : '';
    uni.navigateTo({ url: `/pages/shop/menu?token=${s.channelToken}&name=${encodeURIComponent(s.name)}&routes=${encodeURIComponent(routes)}${cid}` });
}

onMounted(() => {
    initTheme();
    void favorites.loadRemote();
    load();
});
// 登录/退出后回到首页：同步云端收藏（登录时会把游客收藏补写到云端）
onShow(() => { void favorites.loadRemote(); });
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
.hlink { color: #fff; font-size: 24rpx; opacity: .92; padding: 4rpx 0 4rpx 8rpx; }
.search { background: var(--w-search-bg); color: var(--w-text); border-radius: 999rpx; padding: 12rpx 24rpx; font-size: 26rpx; }
.search :deep(.uni-input-placeholder) { color: var(--w-text-muted); }
.body { padding: 0 24rpx; }
.quick { margin-top: 20rpx; background: var(--w-surface); border-radius: $radius-card; padding: 24rpx 0; display: flex; }
.qk { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx; }
.qico { width: 76rpx; height: 76rpx; border-radius: 999rpx; background: var(--w-brand-soft); display: flex; align-items: center; justify-content: center; font-size: 38rpx; }
.qtxt { font-size: 22rpx; color: var(--w-text); }
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
</style>
