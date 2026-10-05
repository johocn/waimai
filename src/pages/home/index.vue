<template>
    <view class="page">
        <view class="head">
            <text class="loc">📍 东门校内站</text>
            <input class="search" v-model="keyword" placeholder="搜索店铺：麻辣香锅 / 奶茶" confirm-type="search" />
        </view>
        <scroll-view scroll-x class="pills" v-if="!keyword">
            <view
                v-for="t in tagList" :key="t"
                class="pill" :class="{ on: t === activeTag }"
                @tap="activeTag = t"
            >{{ t }}</view>
        </scroll-view>
        <LoadingSkeleton v-if="loading" />
        <EmptyState v-else-if="!shown.length" text="没有找到相关店铺" />
        <view v-else class="cards">
            <view v-for="s in shown" :key="s.channelId" class="card" @tap="enterStore(s)">
                <image v-if="s.logo" class="logo" :src="s.logo" mode="aspectFill" />
                <view v-else class="logo logo-text">{{ s.name.slice(0, 1) }}</view>
                <view class="info">
                    <view class="name-row">
                        <text class="name">{{ s.name }}</text>
                        <text v-if="s.paused" class="paused">休息中</text>
                    </view>
                    <text class="meta">月售 {{ s.monthlySales }}</text>
                    <text class="meta">{{ routeText(s.routesEnabled) }}</text>
                    <text v-if="s.promoText" class="promo">{{ s.promoText }}</text>
                </view>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import { fetchStoreList } from '../../api/queries/waimai';
import { filterStores } from '../../utils/store-filter';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
import EmptyState from '../../components/EmptyState.vue';

const TAGS = ['全部', '米饭快餐', '奶茶甜品', '面食', '夜宵'];
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

function routeText(routes: string[]): string {
    if (!routes?.length) return '暂未开通配送';
    return routes.includes('R1') ? '商家自送 + 校内骑手接力' : '档口直送 · 校内骑手上楼';
}

async function load() {
    loading.value = true;
    try { stores.value = await fetchStoreList(); } finally { loading.value = false; }
}

function enterStore(s: any) {
    if (s.paused) return uni.showToast({ title: '店铺休息中', icon: 'none' });
    uni.navigateTo({ url: `/pages/shop/menu?token=${s.channelToken}&name=${encodeURIComponent(s.name)}` });
}

onMounted(load);
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh(); });
</script>

<style scoped lang="scss">
.page { padding-bottom: 24rpx; }
.head { padding: 24rpx; background: $brand; }
.loc { color: #fff; font-size: 26rpx; font-weight: 600; display: block; margin-bottom: 16rpx; }
.search { background: #fff; border-radius: 999rpx; padding: 12rpx 24rpx; font-size: 26rpx; }
.pills { white-space: nowrap; padding: 16rpx 24rpx; background: $surface; }
.pill { display: inline-block; padding: 6rpx 24rpx; margin-right: 16rpx; border-radius: 999rpx; font-size: 24rpx; color: $text-muted; background: $bg; }
.pill.on { background: $brand; color: #fff; }
.cards { padding: 16rpx 24rpx; display: flex; flex-direction: column; gap: 16rpx; }
.card { display: flex; gap: 20rpx; background: $surface; border-radius: $radius-card; padding: 24rpx; }
.logo { width: 120rpx; height: 120rpx; border-radius: $radius; flex-shrink: 0; }
.logo-text { background: $brand-soft; color: $brand; font-size: 48rpx; text-align: center; line-height: 120rpx; }
.info { flex: 1; min-width: 0; }
.name-row { display: flex; align-items: center; gap: 12rpx; }
.name { font-size: 30rpx; font-weight: 600; color: $text; }
.paused { font-size: 20rpx; color: #999; border: 1rpx solid #ddd; border-radius: 6rpx; padding: 0 8rpx; }
.meta { display: block; font-size: 24rpx; color: $text-muted; margin-top: 6rpx; }
.promo { display: inline-block; margin-top: 10rpx; font-size: 20rpx; color: $brand; background: $brand-soft; border-radius: 6rpx; padding: 2rpx 12rpx; }
</style>
