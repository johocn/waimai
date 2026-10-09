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
            <view v-if="promoStore" class="notice" @tap="enterStore(promoStore)">
                <text class="ntext">🔥 {{ promoStore.name }} · {{ promoStore.promoText }}</text>
                <text class="nmore">›</text>
            </view>
            <LoadingSkeleton v-if="loading" />
            <template v-else>
                <view class="sec" v-if="shown.length">
                    <text class="sec-t">{{ secTitle }}</text>
                    <text class="sec-n">{{ $t('home.nearbyCount').replace('{n}', String(shown.length)) }}</text>
                </view>
                <EmptyState v-if="!shown.length" :text="$t('home.emptySearch')" />
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
                            </view>
                        </view>
                        <text class="chev">›</text>
                    </view>
                </view>
            </template>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import { fetchStoreList } from '../../api/queries/waimai';
import { filterStores } from '../../utils/store-filter';
import { storeDisplayName, routeText, deliveryTag } from '../../utils/store-display';
import { theme, initTheme, toggleTheme } from '../../utils/theme';
import { useLocaleStore } from '../../stores/locale';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
import EmptyState from '../../components/EmptyState.vue';

const TAGS = ['全部', '米饭快餐', '奶茶甜品', '面食', '夜宵'];
const TAG_ICONS: Record<string, string> = { 全部: '🍽️', 米饭快餐: '🍚', 奶茶甜品: '🧋', 面食: '🍜', 夜宵: '🌙' };
const locale = useLocaleStore();
const keyword = ref('');
const activeTag = ref('全部');
const loading = ref(true);
const stores = ref<any[]>([]);

const tagList = computed(() => {
    // 店铺未配置 tag 时不出现空类目：固定类目里只保留有店铺的
    const used = new Set(stores.value.flatMap((s: any) => s.tags ?? []));
    return TAGS.filter(t => t === '全部' || used.has(t));
});
const shown = computed(() => filterStores(stores.value, keyword.value, activeTag.value));
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
    uni.navigateTo({ url: `/pages/shop/menu?token=${s.channelToken}&name=${encodeURIComponent(s.name)}&routes=${encodeURIComponent(routes)}` });
}

onMounted(() => {
    initTheme();
    load();
});
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh(); });
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
</style>
