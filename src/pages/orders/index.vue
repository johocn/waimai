<template>
  <view class="orders-page">
    <view class="orders-tabs">
      <text v-for="t in tabs" :key="t.value" class="orders-tab" :class="{ active: activeTab === t.value }" @click="switchTab(t.value)">{{ t.label }}</text>
    </view>
    <scroll-view class="orders-page__scroll" scroll-y @scrolltolower="loadMore" refresher-enabled @refresherrefresh="onRefresh" :refresher-triggered="refreshing">
      <view v-for="order in orders" :key="order.id" class="order-card" @click="goDetail(order.code)">
        <view class="order-card__header">
          <view class="order-card__store-col">
            <text class="order-card__store">{{ order.channelName }}</text>
            <text class="order-card__code">{{ order.code }}</text>
          </view>
          <text class="order-card__state">{{ stateLabel(order) }}</text>
        </view>
        <view v-for="line in order.lines?.slice(0, 3)" :key="line.id" class="order-card__line">
          <VImage :src="line.featuredAsset?.preview || ''" width="100rpx" height="100rpx" />
          <text class="order-card__name">{{ line.productVariant?.name }}</text>
          <text class="order-card__qty">x{{ line.quantity }}</text>
        </view>
        <view class="order-card__footer">
          <text>共{{ order.totalQuantity }}件</text>
          <PriceTag :price="order.totalWithTax" />
        </view>
      </view>
      <view class="orders-page__footer">
        <LoadingSkeleton v-if="loading" type="list" :count="3" />
        <text v-else-if="!hasMore && orders.length > 0" class="footer-text">没有更多了</text>
        <EmptyState v-if="!loading && orders.length === 0" text="暂无订单" />
      </view>
    </scroll-view>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onShow, onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app';
import { getOrdersForChannel } from '../../api/queries/order';
import { fetchStoreList } from '../../api/queries/waimai';
import { fulfillmentBadge } from '../../utils/order-badge';
import { storeDisplayName } from '../../utils/store-display';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import EmptyState from '../../components/EmptyState.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
const orders = ref<any[]>([]);
const loading = ref(false);
const hasMore = ref(true);
const refreshing = ref(false);
const activeTab = ref('');
const tabs = [
    { value: '', label: '全部' }, { value: 'ArrangingPayment', label: '待付款' },
    { value: 'PaymentAuthorized,PaymentSettled', label: '待发货' }, { value: 'Delivered', label: '待收货' },
    { value: 'Cancelled', label: '已取消' },
];
const statusMap: Record<string, string> = { ArrangingPayment:'待付款', Created:'待付款', PaymentAuthorized:'待发货', PaymentSettled:'待发货', Delivered:'待收货', Shipped:'待收货', Cancelled:'已取消' };
// 订单落在各渠道（vendure myOrders 按 activeChannel 过滤），聚合 = 站点渠道 + 全部店铺渠道。
// 渠道身份归一：空 token 与 vendure 内建 '__default_channel__' 是同一渠道，须去重（店铺可挂在默认渠道上）。
const PLATFORM_TOKEN = (import.meta.env.VITE_CHANNEL_TOKEN as string) || '__default_channel__';
function normChannel(t: string): string {
    return !t || t === '__default_channel__' ? '__default_channel__' : t;
}
let channels: Array<{ token: string; name: string }> = [{ token: normChannel(PLATFORM_TOKEN), name: '平台' }];
let channelsLoaded = false;
let page = 0;
const take = 10;

/** 履约徽标优先（校园配送单），否则回退订单 state 文案 */
function stateLabel(order: any): string {
    const cf = order.customFields || {};
    return fulfillmentBadge(cf.fulfillmentRoute, cf.deliveryStatus) || statusMap[order.state] || order.state;
}

async function loadChannels() {
    if (channelsLoaded) return;
    const map = new Map<string, string>([[normChannel(PLATFORM_TOKEN), '平台']]);
    try {
        const stores = await fetchStoreList();
        for (const s of stores) {
            const key = normChannel(s.channelToken || '');
            if (!map.has(key) || key === normChannel(PLATFORM_TOKEN)) {
                map.set(key, storeDisplayName(s.name) || map.get(key) || '平台'); // 店铺挂在站点渠道时显示店铺名
            }
        }
    } catch (e) { console.error(e); }
    channels = Array.from(map, ([token, name]) => ({ token, name }));
    channelsLoaded = true;
}

onShow(() => {
    if (orders.value.length === 0) loadData();
});
onReachBottom(() => loadMore());
onPullDownRefresh(async () => { await refreshData(); uni.stopPullDownRefresh(); });
async function loadData() {
    if (loading.value || !hasMore.value) return;
    loading.value = true;
    try {
        await loadChannels();
        const options: any = { take, skip: page * take, sort: { createdAt: 'DESC' } };
        if (activeTab.value) {
            const states = activeTab.value.split(',').filter(Boolean);
            options.filter = { state: states.length > 1 ? { in: states } : { eq: states[0] } };
        }
        const results = await Promise.all(channels.map((c) =>
            getOrdersForChannel(c.token, options)
                .then((res: any) => ({
                    items: (res?.myOrders?.items || []).map((o: any) => ({ ...o, channelName: c.name })),
                    total: res?.myOrders?.totalItems || 0,
                }))
                .catch((e) => { console.error('myOrders@' + (c.name || 'default'), e); return { items: [], total: 0 }; }),
        ));
        const incoming = results.flatMap((r) => r.items);
        const seen = new Set(orders.value.map((o) => o.id));
        orders.value = [...orders.value, ...incoming.filter((o: any) => !seen.has(o.id))]
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        const totalSum = results.reduce((s, r) => s + r.total, 0);
        page += 1;
        hasMore.value = orders.value.length < totalSum;
    } catch (e) { console.error(e); }
    loading.value = false;
}
function loadMore() { loadData(); }
async function refreshData() { page = 0; hasMore.value = true; orders.value = []; await loadData(); }
async function onRefresh() { refreshing.value = true; await refreshData(); refreshing.value = false; }
function switchTab(val: string) { activeTab.value = val; page = 0; hasMore.value = true; orders.value = []; loadData(); }
function goDetail(code: string) { uni.navigateTo({ url: '/pkg-order/pages/order-detail?code=' + code }); }
</script>
<style lang="scss" scoped>
.orders-page { display: flex; flex-direction: column; height: 100vh; &__scroll { flex: 1; box-sizing: border-box; padding: 0 20rpx; } &__footer { padding: 30rpx; text-align: center; } }
.orders-tabs { display: flex; background: #fff; border-bottom: 1rpx solid $border-color; }
.orders-tab { flex: 1; text-align: center; padding: 20rpx 0; font-size: 26rpx; position: relative; &.active { color: $brand-color; &::after { content: ''; position: absolute; bottom: 0; left: 30%; right: 30%; height: 4rpx; background: $brand-color; border-radius: 4rpx; } } }
.order-card { background: #fff; border-radius: $radius-md; padding: 20rpx; margin-top: 20rpx; &__header { display: flex; justify-content: space-between; margin-bottom: 16rpx; } &__store-col { display: flex; flex-direction: column; gap: 4rpx; } &__store { font-size: 28rpx; font-weight: 600; color: $text-color; } &__code { font-size: 22rpx; color: $text-color-secondary; } &__state { color: $brand-color; font-size: 26rpx; } &__line { display: flex; align-items: center; gap: 16rpx; padding: 8rpx 0; } &__name { flex: 1; font-size: 26rpx; } &__qty { font-size: 24rpx; color: #999; } &__footer { display: flex; justify-content: space-between; align-items: center; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $border-color; } }
.footer-text { font-size: 24rpx; color: #999; }
</style>
