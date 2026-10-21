<template>
  <view class="orders-page">
    <view class="orders-tabs">
      <text v-for="t in tabs" :key="t.value" class="orders-tab" :class="{ active: activeTab === t.value }" @click="switchTab(t.value)">{{ $t(t.label) }}</text>
    </view>
    <!-- 订单搜索：本地过滤已加载订单（订单号 / 店名 / 商品名），不额外请求 -->
    <view class="orders-search">
      <input class="orders-search__input" v-model="orderKeyword" :placeholder="$t('orders.searchPh')" confirm-type="search" />
      <text v-if="orderKeyword" class="orders-search__clear" @click="orderKeyword = ''">✕</text>
    </view>
    <!-- 售后聚合：登录后拉取售后单，处理中数量 > 0 时展示，点击只看售后 -->
    <view v-if="afterSaleCount > 0" class="after-bar" :class="{ on: onlyAfterSale }" @click="toggleAfterSale">
      <text class="after-bar__txt">{{ $t('orders.afterSaleBar').replace('{n}', String(afterSaleCount)) }}</text>
      <text class="after-bar__act">{{ onlyAfterSale ? $t('orders.afterSaleAll') : $t('orders.afterSaleOnly') }} ▸</text>
    </view>
    <!-- 待评价聚合：已送达且仍有未评价商品行的订单，点击只看待评价（与售后筛选互斥） -->
    <view v-if="pendingReviewCount > 0" class="after-bar after-bar--review" :class="{ on: onlyPendingReview }" @click="togglePendingReview">
      <text class="after-bar__txt">{{ $t('orders.pendingReviewBar').replace('{n}', String(pendingReviewCount)) }}</text>
      <text class="after-bar__act">{{ onlyPendingReview ? $t('orders.reviewAll') : $t('orders.pendingReviewOnly') }} ▸</text>
    </view>
    <scroll-view class="orders-page__scroll" scroll-y @scrolltolower="loadMore" refresher-enabled @refresherrefresh="onRefresh" :refresher-triggered="refreshing">
      <view v-for="order in filteredOrders" :key="order.id" class="order-card" @click="goDetail(order.code)">
        <view class="order-card__header">
          <view class="order-card__store-col">
            <text class="order-card__store">{{ order.channelName }}</text>
            <text class="order-card__code">{{ order.code }}</text>
          </view>
          <text class="order-card__state">{{ stateLabel(order) }}</text>
        </view>
        <!-- 售后 / 配送异常标记（点击直达售后详情） -->
        <view class="order-card__flags" v-if="afterSaleOf(order) || hasException(order)">
          <text v-if="afterSaleOf(order)" class="flag flag--after" :class="{ done: afterSaleOf(order).state === 'Refunded' }" @click.stop="goAfterSale(order)">
            {{ afterSaleOf(order).state === 'Refunded' ? $t('orders.afterSaleRefunded') : $t('orders.afterSaleProcessing') }}
          </text>
          <text v-if="hasException(order)" class="flag flag--exception" @click.stop="goDetail(order.code)">{{ $t('orders.exceptionTag') }}</text>
        </view>
        <view v-for="line in order.lines?.slice(0, 3)" :key="line.id" class="order-card__line">
          <VImage :src="line.featuredAsset?.preview || ''" width="100rpx" height="100rpx" />
          <text class="order-card__name">{{ line.productVariant?.name }}</text>
          <text class="order-card__qty">x{{ line.quantity }}</text>
        </view>
        <!-- 预约时段：校园配送单 customFields.deliverySlotText -->
        <text v-if="order.customFields?.deliverySlotText" class="order-card__slot">{{ $t('orders.deliverySlot').replace('{t}', order.customFields.deliverySlotText) }}</text>
        <view class="order-card__footer">
          <text>{{ $t('orders.totalItems').replace('{n}', String(order.totalQuantity)) }}</text>
          <view class="order-card__footer-right">
            <text v-if="hasPendingReview(order)" class="review-btn" @click.stop="goReview(order)">{{ $t('orders.reviewBtn') }}</text>
            <PriceTag :price="order.totalWithTax" />
          </view>
        </view>
      </view>
      <view class="orders-page__footer">
        <LoadingSkeleton v-if="loading" type="list" :count="3" />
        <text v-else-if="!hasMore && filteredOrders.length > 0" class="footer-text">{{ $t('orders.noMore') }}</text>
        <EmptyState v-if="!loading && filteredOrders.length === 0" :text="orderKeyword || onlyAfterSale || onlyPendingReview ? $t('orders.searchEmpty') : $t('orders.empty')" />
      </view>
    </scroll-view>
  </view>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow, onHide, onUnload, onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app';
import { getOrdersForChannel } from '../../api/queries/order';
import { fetchStoreList } from '../../api/queries/waimai';
import { fetchMyAfterSales } from '../../api/queries/afterSale';
import { getMyReviews } from '../../api/queries/review';
import { fulfillmentBadge } from '../../utils/order-badge';
import { storeDisplayName } from '../../utils/store-display';
import { useLocaleStore } from '../../stores/locale';
import { useAuthStore } from '../../stores/auth';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import EmptyState from '../../components/EmptyState.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
const locale = useLocaleStore();
const auth = useAuthStore();
const orders = ref<any[]>([]);
const loading = ref(false);
const hasMore = ref(true);
const refreshing = ref(false);
const activeTab = ref('');
// 本地搜索 + 售后聚合（不改变服务端分页查询）
const orderKeyword = ref('');
const onlyAfterSale = ref(false);
const onlyPendingReview = ref(false);
const afterSaleByOrderId = ref<Record<string, any>>({});
// 已评价的 orderLineId 集合（同一 orderLine 仅可评价一次；deleted 评价不计入）
const reviewedLineIds = ref<Set<string>>(new Set());
// 售后「处理中」状态集（Vendure AfterSalesState）；Refunded 单独算已退款
const AFTER_ACTIVE = new Set(['Pending', 'Approved', 'Returning', 'Received', 'RefundFailed', 'Appealed', 'ExchangeShipped']);
const afterSaleCount = computed(() => Object.values(afterSaleByOrderId.value).filter((a: any) => AFTER_ACTIVE.has(a.state)).length);
/** 已送达且仍有未评价商品行 */
function hasPendingReview(order: any): boolean {
    if (order.state !== 'Delivered') return false;
    return (order.lines ?? []).some((l: any) => l.id && !reviewedLineIds.value.has(String(l.id)));
}
const pendingReviewCount = computed(() => orders.value.filter((o: any) => hasPendingReview(o)).length);
function toggleAfterSale() {
    onlyAfterSale.value = !onlyAfterSale.value;
    if (onlyAfterSale.value) onlyPendingReview.value = false;
}
function togglePendingReview() {
    onlyPendingReview.value = !onlyPendingReview.value;
    if (onlyPendingReview.value) onlyAfterSale.value = false;
}
const filteredOrders = computed(() => {
    const kw = orderKeyword.value.trim().toLowerCase();
    return orders.value.filter((o: any) => {
        if (onlyAfterSale.value && !afterSaleByOrderId.value[o.id]) return false;
        if (onlyPendingReview.value && !hasPendingReview(o)) return false;
        if (!kw) return true;
        if (String(o.code ?? '').toLowerCase().includes(kw)) return true;
        if (String(o.channelName ?? '').toLowerCase().includes(kw)) return true;
        return (o.lines ?? []).some((l: any) => String(l.productVariant?.name ?? '').toLowerCase().includes(kw));
    });
});

function afterSaleOf(order: any): any {
    return afterSaleByOrderId.value[order.id] ?? null;
}
function hasException(order: any): boolean {
    const cf = order.customFields || {};
    return !!cf.exceptionType && !cf.exceptionHandledNote;
}
function goAfterSale(order: any) {
    const req = afterSaleOf(order);
    if (req?.id) uni.navigateTo({ url: '/pkg-order/pages/after-sale-detail?id=' + req.id });
    else goDetail(order.code);
}
/** 去评价：取第一条未评价商品行，跳转评价页（name/thumb 需 encodeURIComponent） */
function goReview(order: any) {
    const line = (order.lines ?? []).find((l: any) => l.id && !reviewedLineIds.value.has(String(l.id)));
    if (!line) return;
    const q = [
        `productId=${line.productVariant?.productId ?? ''}`,
        `lineId=${line.id}`,
        `variantId=${line.productVariant?.id ?? ''}`,
        `name=${encodeURIComponent(line.productVariant?.name ?? '')}`,
        `thumb=${encodeURIComponent(line.featuredAsset?.preview ?? '')}`,
    ].join('&');
    uni.navigateTo({ url: `/pkg-order/pages/review-create?${q}` });
}
// 已评价 orderLineId 集合：登录态拉取，deleted 状态剔除
async function loadMyReviews() {
    if (!auth.isLoggedIn) { reviewedLineIds.value = new Set(); return; }
    try {
        const res: any = await getMyReviews();
        const list: any[] = res?.myReviews?.items ?? res?.myReviews ?? [];
        const set = new Set<string>();
        for (const r of list) {
            if (r.orderLineId && r.status !== 'deleted') set.add(String(r.orderLineId));
        }
        reviewedLineIds.value = set;
    } catch (e) { console.error(e); }
}
/** 售后单按订单聚合（同一订单多条时取最新一条，列表已按时间倒序） */
async function loadAfterSales() {
    if (!auth.isLoggedIn) { afterSaleByOrderId.value = {}; return; }
    try {
        const list = await fetchMyAfterSales();
        const map: Record<string, any> = {};
        for (const r of list) {
            if (r.orderId && !map[r.orderId]) map[r.orderId] = r;
        }
        afterSaleByOrderId.value = map;
    } catch (e) { console.error(e); }
}
const tabs = [
    { value: '', label: 'orders.tabAll' }, { value: 'ArrangingPayment', label: 'orders.stAwaitPay' },
    { value: 'PaymentAuthorized,PaymentSettled', label: 'orders.stAwaitShip' }, { value: 'Delivered', label: 'orders.stAwaitReceive' },
    { value: 'Cancelled', label: 'orders.stCancelled' },
];
// 值为 i18n 键（rider 样式：label 存键不存中文），经 locale.t 解析展示
const statusMap: Record<string, string> = { ArrangingPayment:'orders.stAwaitPay', Created:'orders.stAwaitPay', PaymentAuthorized:'orders.stAwaitShip', PaymentSettled:'orders.stAwaitShip', Delivered:'orders.stAwaitReceive', Shipped:'orders.stAwaitReceive', Cancelled:'orders.stCancelled' };
// 订单落在各渠道（vendure myOrders 按 activeChannel 过滤），聚合 = 站点渠道 + 全部店铺渠道。
// 渠道身份归一：空 token 与 vendure 内建 '__default_channel__' 是同一渠道，须去重（店铺可挂在默认渠道上）。
const PLATFORM_TOKEN = (import.meta.env.VITE_CHANNEL_TOKEN as string) || '__default_channel__';
function normChannel(t: string): string {
    return !t || t === '__default_channel__' ? '__default_channel__' : t;
}
let channels: Array<{ token: string; name: string }> = [{ token: normChannel(PLATFORM_TOKEN), name: locale.t('orders.platform') }];
let channelsLoaded = false;
let page = 0;
const take = 10;

/** 履约徽标优先（校园配送单），否则回退订单 state 文案 */
function stateLabel(order: any): string {
    const cf = order.customFields || {};
    return fulfillmentBadge(cf.fulfillmentRoute, cf.deliveryStatus) || (statusMap[order.state] ? locale.t(statusMap[order.state]) : order.state);
}

async function loadChannels() {
    if (channelsLoaded) return;
    const map = new Map<string, string>([[normChannel(PLATFORM_TOKEN), locale.t('orders.platform')]]);
    try {
        const stores = await fetchStoreList();
        for (const s of stores) {
            const key = normChannel(s.channelToken || '');
            if (!map.has(key) || key === normChannel(PLATFORM_TOKEN)) {
                map.set(key, storeDisplayName(s.name) || map.get(key) || locale.t('orders.platform')); // 店铺挂在站点渠道时显示店铺名
            }
        }
    } catch (e) { console.error(e); }
    channels = Array.from(map, ([token, name]) => ({ token, name }));
    channelsLoaded = true;
}

// —— 状态自动刷新：页面可见期间每 30s 轻量拉取各渠道最新订单，仅同步 state ——
const POLL_INTERVAL = 30000;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let polling = false;
function stopStatePolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
function startStatePolling() {
    stopStatePolling();
    pollTimer = setInterval(() => { void pollStates(); }, POLL_INTERVAL);
}
async function pollStates() {
    if (polling || !auth.isLoggedIn || orders.value.length === 0) return;
    polling = true;
    try {
        await loadChannels();
        // 不带 tab 过滤，避免订单状态变化后被当前 tab 漏掉
        const results = await Promise.all(channels.map((c) =>
            getOrdersForChannel(c.token, { take: 10, skip: 0, sort: { createdAt: 'DESC' } })
                .then((res: any) => res?.myOrders?.items || [])
                .catch(() => []),
        ));
        const latest = new Map<string, any>();
        for (const o of results.flat()) if (o?.id && !latest.has(o.id)) latest.set(o.id, o);
        let changed = false;
        for (const local of orders.value) {
            const remote = latest.get(local.id);
            if (remote?.state && remote.state !== local.state) {
                local.state = remote.state; // 保留 channelName 等本地字段
                changed = true;
            }
        }
        if (changed) uni.showToast({ title: locale.t('orders.stateUpdated'), icon: 'none' });
    } catch (e) { /* 轮询失败静默 */ }
    polling = false;
}
onShow(() => {
    void loadAfterSales();
    void loadMyReviews();
    startStatePolling();
    const pending = uni.getStorageSync('orders_pending_tab');
    if (pending !== '' && pending !== null && pending !== undefined) {
        uni.removeStorageSync('orders_pending_tab');
        if (pending !== activeTab.value) {
            activeTab.value = pending as string;
            orders.value = []; page = 0; hasMore.value = true;
            loadData();
            return;
        }
    }
    if (orders.value.length === 0) loadData();
});
onHide(() => stopStatePolling());
onUnload(() => stopStatePolling());
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
        // 同一订单可能同时出现在平台渠道与店铺渠道的 myOrders 结果里：按 id 与 code 双重去重（含本批次内重复）
        const seenIds = new Set(orders.value.map((o) => o.id));
        const byCode = new Map(orders.value.map((o) => [o.code, o]));
        const platformName = locale.t('orders.platform');
        const fresh: any[] = [];
        for (const o of incoming) {
            const dup = byCode.get(o.code);
            if (dup) {
                // 平台渠道结果无店铺名：用店铺渠道的同单信息补上，展示更可读
                if (dup.channelName === platformName && o.channelName !== platformName) dup.channelName = o.channelName;
                continue;
            }
            if (seenIds.has(o.id)) continue;
            seenIds.add(o.id);
            byCode.set(o.code, o);
            fresh.push(o);
        }
        orders.value = [...orders.value, ...fresh]
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        // totalItems 会因跨渠道重复计数，不能作为终止条件；任一渠道本页取满即认为可能还有下一页
        page += 1;
        hasMore.value = results.some((r) => r.items.length >= take);
    } catch (e) { console.error(e); }
    loading.value = false;
}
function loadMore() { loadData(); }
async function refreshData() { page = 0; hasMore.value = true; orders.value = []; await loadData(); void loadAfterSales(); }
async function onRefresh() { refreshing.value = true; await refreshData(); refreshing.value = false; }
function switchTab(val: string) { activeTab.value = val; page = 0; hasMore.value = true; orders.value = []; loadData(); }
function goDetail(code: string) { uni.navigateTo({ url: '/pkg-order/pages/order-detail?code=' + code }); }
</script>
<style lang="scss" scoped>
.orders-page { display: flex; flex-direction: column; height: 100vh; &__scroll { flex: 1; box-sizing: border-box; padding: 0 20rpx; } &__footer { padding: 30rpx; text-align: center; } }
.orders-tabs { display: flex; background: $surface; border-bottom: 1rpx solid $border-color; }
.orders-tab { flex: 1; text-align: center; padding: 20rpx 0; font-size: 26rpx; position: relative; &.active { color: $brand-color; &::after { content: ''; position: absolute; bottom: 0; left: 30%; right: 30%; height: 4rpx; background: $brand-color; border-radius: 4rpx; } } }
.order-card { background: $surface; border-radius: $radius-md; padding: 20rpx; margin-top: 20rpx; &__header { display: flex; justify-content: space-between; margin-bottom: 16rpx; } &__store-col { display: flex; flex-direction: column; gap: 4rpx; } &__store { font-size: 28rpx; font-weight: 600; color: $text-color; } &__code { font-size: 22rpx; color: $text-color-secondary; } &__state { color: $brand-color; font-size: 26rpx; } &__line { display: flex; align-items: center; gap: 16rpx; padding: 8rpx 0; } &__name { flex: 1; font-size: 26rpx; } &__qty { font-size: 24rpx; color: $text-color-placeholder; } &__footer { display: flex; justify-content: space-between; align-items: center; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $border-color; } }
.footer-text { font-size: 24rpx; color: $text-color-placeholder; }
.orders-search { position: relative; padding: 16rpx 20rpx 0; background: $surface; }
.orders-search__input { height: 68rpx; padding: 0 60rpx 0 24rpx; background: #f5f5f5; border-radius: 999rpx; font-size: 26rpx; }
.orders-search__clear { position: absolute; right: 40rpx; top: 50%; transform: translateY(-30%); font-size: 24rpx; color: $text-color-placeholder; padding: 10rpx; }
.after-bar { display: flex; align-items: center; justify-content: space-between; margin: 12rpx 20rpx 0; padding: 14rpx 24rpx; border-radius: $radius-md; background: #fff4e5; }
.after-bar.on { background: #ffe7c7; }
.after-bar__txt { font-size: 24rpx; color: #b25c00; }
.after-bar__act { font-size: 22rpx; color: #b25c00; }
.after-bar--review { background: #e8f7ef; }
.after-bar--review.on { background: #d3f0e0; }
.after-bar--review .after-bar__txt, .after-bar--review .after-bar__act { color: #0a7d4b; }
.order-card__flags { display: flex; flex-wrap: wrap; gap: 10rpx; margin-bottom: 10rpx; }
.flag { font-size: 20rpx; padding: 4rpx 14rpx; border-radius: 8rpx; }
.flag--after { color: #b25c00; background: #fff1e0; }
.flag--after.done { color: #0a7d4b; background: #e8f7ef; }
.flag--exception { color: #c62828; background: #fdecea; }
.order-card__slot { display: block; margin-top: 8rpx; font-size: 22rpx; color: $text-color-secondary; }
.order-card__footer-right { display: flex; align-items: center; gap: 16rpx; }
.review-btn { font-size: 24rpx; color: $brand-color; padding: 6rpx 20rpx; border: 1rpx solid $brand-color; border-radius: 999rpx; }
</style>
