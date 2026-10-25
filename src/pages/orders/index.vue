<template>
  <view class="orders-page">
    <!-- 免登录查单入口：未登录时展示，订单号 + 手机号即可查（访客单） -->
    <view v-if="!auth.isLoggedIn" class="guest-entry" @click="goGuestOrder">
      <text class="guest-entry__ico">🔎</text>
      <view class="guest-entry__col">
        <text class="guest-entry__title">{{ $t('guestOrder.entryTitle') }}</text>
        <text class="guest-entry__sub">{{ $t('guestOrder.entrySub') }}</text>
      </view>
      <text class="guest-entry__arrow">›</text>
    </view>
    <view class="orders-tabs">
      <text v-for="t in tabs" :key="t.value" class="orders-tab" :class="{ active: activeTab === t.value }" @click="switchTab(t.value)">{{ $t(t.label) }}</text>
    </view>
    <!-- 常点清单入口（第 36 轮）：登录后聚合近 90 天常点，按店铺一键加购 -->
    <view v-if="auth.isLoggedIn" class="regular-entry" @click="goRegulars">
      <text class="regular-entry__ico">🔁</text>
      <view class="regular-entry__col">
        <text class="regular-entry__title">{{ $t('reorderRegulars.entryTitle') }}</text>
        <text class="regular-entry__sub">{{ $t('reorderRegulars.entrySub') }}</text>
      </view>
      <text class="regular-entry__arrow">›</text>
    </view>
    <!-- 订单搜索：本地过滤已加载订单（订单号 / 店名 / 商品名），不额外请求 -->
    <view class="orders-search">
      <input class="orders-search__input" v-model="orderKeyword" :placeholder="$t('orders.searchPh')" confirm-type="search" />
      <text v-if="orderKeyword" class="orders-search__clear" @click="orderKeyword = ''">✕</text>
    </view>
    <!-- 筛选（第 39 轮）：时间范围 + 店铺，服务端过滤（切换即重新查询，分页口径一致） -->
    <view class="filter-bar">
      <view class="filter-btn" :class="{ on: filterBadge > 0 }" @click="openFilter">
        ⚙ {{ $t('orders.filterBtn') }}<text v-if="filterBadge" class="filter-btn__n"> · {{ filterBadge }}</text>
      </view>
      <view class="filter-chips">
        <text v-if="rangeText" class="fchip" @click="clearRange">{{ rangeText }} ✕</text>
        <text v-if="storeText" class="fchip" @click="clearStore">{{ storeText }} ✕</text>
        <text v-if="!filterBadge" class="filter-idle">{{ $t('orders.filterIdle') }}</text>
      </view>
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
    <!-- 预约单聚合：带送达时段且未完成的订单，点击只看预约单 -->
    <view v-if="scheduledCount > 0" class="after-bar after-bar--slot" :class="{ on: onlyScheduled }" @click="toggleScheduled">
      <text class="after-bar__txt">{{ $t('orders.scheduledBar').replace('{n}', String(scheduledCount)) }}</text>
      <text class="after-bar__act">{{ onlyScheduled ? $t('orders.scheduledAll') : $t('orders.scheduledOnly') }} ▸</text>
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
        <!-- 预计送达：待配送/配送中订单按店铺配送时长倒计时，超时转红 -->
        <text v-if="etaText(order)" class="order-card__eta" :class="{ late: isEtaLate(order) }">{{ etaText(order) }}</text>
        <view class="order-card__footer">
          <text>{{ $t('orders.totalItems').replace('{n}', String(order.totalQuantity)) }}</text>
          <view class="order-card__footer-right">
            <text v-if="hasPendingReview(order)" class="review-btn" @click.stop="goReview(order)">{{ $t('orders.reviewBtn') }}</text>
            <PriceTag :price="order.totalWithTax" />
          </view>
        </view>
        <!-- 快捷操作：配送中可直接看骑手地图，已完成/已取消可再来一单，已支付未开票可开票 -->
        <view class="order-card__quick" v-if="canTrack(order) || canReorder(order) || canInvoice(order)">
          <text v-if="canTrack(order)" class="quick-btn" @click.stop="goTracking(order)">{{ $t('orders.trackBtn') }}</text>
          <text v-if="canInvoice(order)" class="quick-btn" @click.stop="goInvoice(order)">{{ $t('orders.invoiceBtn') }}</text>
          <text v-if="canReorder(order)" class="quick-btn quick-btn--primary" @click.stop="goReorder(order)">{{ $t('orders.reorderShort') }}</text>
        </view>
      </view>
      <view class="orders-page__footer">
        <LoadingSkeleton v-if="loading" type="list" :count="3" />
        <text v-else-if="!hasMore && filteredOrders.length > 0" class="footer-text">{{ $t('orders.noMore') }}</text>
        <EmptyState v-if="!loading && filteredOrders.length === 0" :text="orderKeyword || onlyAfterSale || onlyPendingReview || onlyScheduled || filterBadge ? $t('orders.searchEmpty') : $t('orders.empty')" />
      </view>
    </scroll-view>
    <!-- 筛选弹层：草稿态选择，点「应用」才重新查询，避免每点一次都请求 -->
    <view v-if="filterOpen" class="filter-mask" @tap.self="filterOpen = false">
      <view class="filter-sheet">
        <view class="fs-head">
          <text class="fs-title">{{ $t('orders.filterTitle') }}</text>
          <text class="fs-close" @click="filterOpen = false">✕</text>
        </view>
        <text class="fs-label">{{ $t('orders.filterTime') }}</text>
        <view class="fs-chips">
          <view
            v-for="r in RANGE_OPTIONS" :key="r.value" class="fs-chip"
            :class="{ on: draftRange === r.value }" @click="draftRange = r.value"
          >{{ $t(r.label) }}</view>
        </view>
        <text class="fs-label">{{ $t('orders.filterStore') }}</text>
        <view class="fs-chips">
          <view class="fs-chip" :class="{ on: !draftStore }" @click="draftStore = ''">{{ $t('orders.filterAllStores') }}</view>
          <view
            v-for="s in storeOptions" :key="s.token" class="fs-chip"
            :class="{ on: draftStore === s.token }" @click="draftStore = s.token"
          >{{ s.name }}</view>
        </view>
        <view class="fs-actions">
          <view class="fs-reset" @click="resetDraft">{{ $t('orders.filterReset') }}</view>
          <view class="fs-apply" @click="applyFilter">{{ $t('orders.filterApply') }}</view>
        </view>
      </view>
    </view>
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
import { orderEta, clockHM } from '../../utils/order-eta';
import { storeDisplayName } from '../../utils/store-display';
import {
    isOrderRange, orderFilterCount, buildOrderFilter,
    type OrderRange,
} from '../../utils/order-filter';
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
// —— 第 39 轮：筛选（时间范围 + 店铺），走服务端查询并持久化 ——
const RANGE_OPTIONS: { value: OrderRange; label: string }[] = [
    { value: 'all', label: 'orders.rangeAll' },
    { value: '7d', label: 'orders.range7d' },
    { value: '30d', label: 'orders.range30d' },
    { value: '90d', label: 'orders.range90d' },
];
const RANGE_LABEL: Record<OrderRange, string> = {
    all: 'orders.rangeAll', '7d': 'orders.range7d', '30d': 'orders.range30d', '90d': 'orders.range90d',
};
const FILTER_KEY = 'orders_filter_v39';
function readSavedFilter(): { range: OrderRange; store: string } {
    try {
        const raw: any = uni.getStorageSync(FILTER_KEY);
        const obj = raw && typeof raw === 'object' ? raw : {};
        return {
            range: isOrderRange(obj.range) ? obj.range : 'all',
            store: typeof obj.store === 'string' ? obj.store : '',
        };
    } catch { return { range: 'all', store: '' }; }
}
const savedFilter = readSavedFilter();
const rangeFilter = ref<OrderRange>(savedFilter.range);
const storeFilter = ref(savedFilter.store);
const filterOpen = ref(false);
const draftRange = ref<OrderRange>(savedFilter.range);
const draftStore = ref(savedFilter.store);
const storeOptions = ref<{ token: string; name: string }[]>([]);
const filterBadge = computed(() => orderFilterCount(rangeFilter.value, storeFilter.value));
const rangeText = computed(() => rangeFilter.value === 'all' ? '' : locale.t(RANGE_LABEL[rangeFilter.value]));
const storeText = computed(() => storeOptions.value.find((s) => s.token === storeFilter.value)?.name ?? '');
function persistFilter() {
    try { uni.setStorageSync(FILTER_KEY, { range: rangeFilter.value, store: storeFilter.value }); } catch { /* ignore */ }
}
function reloadOrders() {
    page = 0;
    hasMore.value = true;
    orders.value = [];
    void loadData();
}
function openFilter() {
    draftRange.value = rangeFilter.value;
    draftStore.value = storeFilter.value;
    filterOpen.value = true;
}
function applyFilter() {
    rangeFilter.value = draftRange.value;
    storeFilter.value = draftStore.value;
    filterOpen.value = false;
    persistFilter();
    reloadOrders();
}
function resetDraft() {
    draftRange.value = 'all';
    draftStore.value = '';
}
function clearRange() {
    rangeFilter.value = 'all';
    persistFilter();
    reloadOrders();
}
function clearStore() {
    storeFilter.value = '';
    persistFilter();
    reloadOrders();
}
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
// —— 预约单：带送达时段且未完成（已送达/已取消不算待履约预约）——
const onlyScheduled = ref(false);
function isScheduled(order: any): boolean {
    if (!order?.customFields?.deliverySlotText) return false;
    return !['Delivered', 'Cancelled'].includes(String(order.state ?? ''));
}
const scheduledCount = computed(() => orders.value.filter(isScheduled).length);
// —— 预计送达倒计时：按店铺 deliveryMinutes 估算，30s 刷新 ——
const nowTs = ref(Date.now());
const deliveryMinutesByName = ref<Record<string, number>>({});
function etaOf(order: any) {
    const name = String(order?.channelName ?? '');
    return orderEta(order, deliveryMinutesByName.value[name] ?? null, nowTs.value);
}
function etaText(order: any): string {
    const eta = etaOf(order);
    if (!eta) return '';
    if (eta.overdueMin > 0) return locale.t('orders.etaOverdue').replace('{n}', String(eta.overdueMin));
    return locale.t('orders.etaArrive').replace('{t}', clockHM(eta.etaAt)).replace('{n}', String(eta.remainMin));
}
function isEtaLate(order: any): boolean {
    return (etaOf(order)?.overdueMin ?? 0) > 0;
}
function toggleScheduled() {
    onlyScheduled.value = !onlyScheduled.value;
    if (onlyScheduled.value) {
        onlyAfterSale.value = false;
        onlyPendingReview.value = false;
    }
}
// —— 快捷操作：配送中 → 全屏骑手地图；已结束/已取消 → 再来一单（详情页自动打开复购弹层）——
function canTrack(order: any): boolean {
    const cf = order.customFields || {};
    return !!cf.fulfillmentRoute && ['assigned', 'in_progress'].includes(String(cf.deliveryStatus ?? ''));
}
function canReorder(order: any): boolean {
    return !order.active || ['Delivered', 'Cancelled'].includes(String(order.state ?? ''));
}
function goTracking(order: any) {
    if (!order?.code) return;
    uni.navigateTo({ url: '/pkg-order/pages/rider-tracking?code=' + order.code });
}
function goReorder(order: any) {
    if (!order?.code) return;
    uni.navigateTo({ url: '/pkg-order/pages/order-detail?code=' + order.code + '&reorder=1' });
}
function goGuestOrder() {
    uni.navigateTo({ url: '/pkg-order/pages/guest-order' });
}
/** 常点清单：跨订单聚合常点商品，按店铺一键加购 */
function goRegulars() {
    uni.navigateTo({ url: '/pkg-order/pages/reorder-regulars' });
}
/** 已支付且未申请开票：列表直达开票弹层（invoice-center 按 order 参数自动打开） */
const INVOICE_STATES = ['PaymentAuthorized', 'PaymentSettled', 'Shipped', 'Delivered'];
function canInvoice(order: any): boolean {
    return INVOICE_STATES.includes(String(order?.state ?? '')) && !order?.customFields?.invoiceApplied;
}
function goInvoice(order: any) {
    if (!order?.code) return;
    uni.navigateTo({ url: '/pkg-user/pages/invoice-center?order=' + encodeURIComponent(order.code) });
}
function toggleAfterSale() {
    onlyAfterSale.value = !onlyAfterSale.value;
    if (onlyAfterSale.value) { onlyPendingReview.value = false; onlyScheduled.value = false; }
}
function togglePendingReview() {
    onlyPendingReview.value = !onlyPendingReview.value;
    if (onlyPendingReview.value) { onlyAfterSale.value = false; onlyScheduled.value = false; }
}
const filteredOrders = computed(() => {
    const kw = orderKeyword.value.trim().toLowerCase();
    return orders.value.filter((o: any) => {
        if (onlyAfterSale.value && !afterSaleByOrderId.value[o.id]) return false;
        if (onlyPendingReview.value && !hasPendingReview(o)) return false;
        if (onlyScheduled.value && !isScheduled(o)) return false;
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
        `orderId=${order?.id ?? ''}`,
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
    const minutes: Record<string, number> = {};
    try {
        const stores = await fetchStoreList();
        for (const s of stores) {
            const key = normChannel(s.channelToken || '');
            if (!map.has(key) || key === normChannel(PLATFORM_TOKEN)) {
                map.set(key, storeDisplayName(s.name) || map.get(key) || locale.t('orders.platform')); // 店铺挂在站点渠道时显示店铺名
            }
            const mins = Number(s.deliveryMinutes);
            if (s.name && Number.isFinite(mins) && mins > 0) {
                minutes[String(s.name)] = mins;
                minutes[String(storeDisplayName(s.name) || '')] = mins;
            }
        }
    } catch (e) { console.error(e); }
    deliveryMinutesByName.value = minutes;
    channels = Array.from(map, ([token, name]) => ({ token, name }));
    storeOptions.value = channels
        .filter((c) => c.token !== normChannel(PLATFORM_TOKEN))
        .map((c) => ({ token: c.token, name: c.name }));
    // 已存的店铺筛选失效（店铺下线/换 token）→ 自动清空，避免查询恒空
    if (storeFilter.value && !storeOptions.value.some((s) => s.token === storeFilter.value)) {
        storeFilter.value = '';
        persistFilter();
    }
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
    pollTimer = setInterval(() => { nowTs.value = Date.now(); void pollStates(); }, POLL_INTERVAL);
}
/** 按店铺筛选收窄查询渠道（未选中店铺 → 全部渠道） */
function queryChannels(): Array<{ token: string; name: string }> {
    if (!storeFilter.value) return channels;
    const picked = channels.filter((c) => c.token === storeFilter.value);
    return picked.length ? picked : channels;
}
async function pollStates() {
    if (polling || !auth.isLoggedIn || orders.value.length === 0) return;
    polling = true;
    try {
        await loadChannels();
        // 不带 tab 过滤，避免订单状态变化后被当前 tab 漏掉
        const results = await Promise.all(queryChannels().map((c) =>
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
    nowTs.value = Date.now();
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
        const states = activeTab.value ? activeTab.value.split(',').filter(Boolean) : [];
        const filter = buildOrderFilter({ states, range: rangeFilter.value });
        if (filter) options.filter = filter;
        const results = await Promise.all(queryChannels().map((c) =>
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
/* 未登录查单入口 */
.regular-entry {
  display: flex; align-items: center; gap: 16rpx; margin: 16rpx 20rpx 0; padding: 20rpx 24rpx;
  background: linear-gradient(135deg, #fff0e4, #ffdfc4); border-radius: $radius-md;
  &__ico { font-size: 32rpx; }
  &__col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
  &__title { font-size: 26rpx; font-weight: 600; color: #b34a00; }
  &__sub { font-size: 22rpx; color: #b37400; }
  &__arrow { font-size: 32rpx; color: #b34a00; }
}
.guest-entry {
  display: flex; align-items: center; gap: 16rpx; margin: 16rpx 20rpx 0; padding: 20rpx 24rpx;
  background: linear-gradient(135deg, #fff3e6, #ffe8d1); border-radius: $radius-md;
  &__ico { font-size: 32rpx; }
  &__col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
  &__title { font-size: 26rpx; font-weight: 600; color: #b34a00; }
  &__sub { font-size: 22rpx; color: #b37400; }
  &__arrow { font-size: 32rpx; color: #b34a00; }
}
.orders-tab { flex: 1; text-align: center; padding: 20rpx 0; font-size: 26rpx; position: relative; &.active { color: $brand-color; &::after { content: ''; position: absolute; bottom: 0; left: 30%; right: 30%; height: 4rpx; background: $brand-color; border-radius: 4rpx; } } }
.order-card { background: $surface; border-radius: $radius-md; padding: 20rpx; margin-top: 20rpx; &__header { display: flex; justify-content: space-between; margin-bottom: 16rpx; } &__store-col { display: flex; flex-direction: column; gap: 4rpx; } &__store { font-size: 28rpx; font-weight: 600; color: $text-color; } &__code { font-size: 22rpx; color: $text-color-secondary; } &__state { color: $brand-color; font-size: 26rpx; } &__line { display: flex; align-items: center; gap: 16rpx; padding: 8rpx 0; } &__name { flex: 1; font-size: 26rpx; } &__qty { font-size: 24rpx; color: $text-color-placeholder; } &__footer { display: flex; justify-content: space-between; align-items: center; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $border-color; } }
.footer-text { font-size: 24rpx; color: $text-color-placeholder; }
.orders-search { position: relative; padding: 16rpx 20rpx 0; background: $surface; }
.orders-search__input { height: 68rpx; padding: 0 60rpx 0 24rpx; background: #f5f5f5; border-radius: 999rpx; font-size: 26rpx; }
.orders-search__clear { position: absolute; right: 40rpx; top: 50%; transform: translateY(-30%); font-size: 24rpx; color: $text-color-placeholder; padding: 10rpx; }
/* 筛选条（第 39 轮）：时间范围 + 店铺，服务端过滤 */
.filter-bar { display: flex; align-items: center; gap: 12rpx; padding: 12rpx 20rpx 0; background: $surface; }
.filter-btn { flex-shrink: 0; padding: 10rpx 20rpx; border-radius: 999rpx; font-size: 24rpx; color: $text-color-secondary; background: #f5f5f5; &.on { color: $brand-color; background: #fff0e4; } }
.filter-btn__n { font-size: 22rpx; }
.filter-chips { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10rpx; overflow: hidden; }
.fchip { flex-shrink: 0; max-width: 220rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 6rpx 16rpx; border-radius: 999rpx; font-size: 22rpx; color: $brand-color; background: #fff0e4; }
.filter-idle { font-size: 22rpx; color: $text-color-placeholder; }
.filter-mask { position: fixed; inset: 0; z-index: 1000; background: rgba(0, 0, 0, 0.45); display: flex; align-items: flex-end; }
.filter-sheet { width: 100%; background: $surface; border-radius: 24rpx 24rpx 0 0; padding: 24rpx 24rpx 40rpx; box-sizing: border-box; }
.fs-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16rpx; }
.fs-title { font-size: 30rpx; font-weight: 600; color: $text-color; }
.fs-close { font-size: 28rpx; color: $text-color-placeholder; padding: 10rpx; }
.fs-label { display: block; margin: 16rpx 0 12rpx; font-size: 24rpx; color: $text-color-secondary; }
.fs-chips { display: flex; flex-wrap: wrap; gap: 16rpx; }
.fs-chip { padding: 12rpx 28rpx; border-radius: 999rpx; font-size: 24rpx; color: $text-color-secondary; background: #f5f5f5; border: 1rpx solid transparent; &.on { color: $brand-color; background: #fff0e4; border-color: $brand-color; } }
.fs-actions { display: flex; gap: 20rpx; margin-top: 32rpx; }
.fs-reset { flex: 1; text-align: center; padding: 20rpx 0; border-radius: 999rpx; font-size: 26rpx; color: $text-color-secondary; background: #f5f5f5; }
.fs-apply { flex: 2; text-align: center; padding: 20rpx 0; border-radius: 999rpx; font-size: 26rpx; color: #fff; background: $brand-color; }
.after-bar { display: flex; align-items: center; justify-content: space-between; margin: 12rpx 20rpx 0; padding: 14rpx 24rpx; border-radius: $radius-md; background: #fff4e5; }
.after-bar.on { background: #ffe7c7; }
.after-bar__txt { font-size: 24rpx; color: #b25c00; }
.after-bar__act { font-size: 22rpx; color: #b25c00; }
.after-bar--review { background: #e8f7ef; }
.after-bar--review.on { background: #d3f0e0; }
.after-bar--review .after-bar__txt, .after-bar--review .after-bar__act { color: #0a7d4b; }
.after-bar--slot { background: #eef4ff; }
.after-bar--slot.on { background: #dce9ff; }
.after-bar--slot .after-bar__txt, .after-bar--slot .after-bar__act { color: #2d5bd1; }
.order-card__quick { display: flex; justify-content: flex-end; gap: 16rpx; margin-top: 16rpx; }
.quick-btn { font-size: 24rpx; color: $text-color-secondary; padding: 8rpx 24rpx; border: 1rpx solid $border-color; border-radius: 999rpx; background: $surface; }
.quick-btn--primary { color: $brand-color; border-color: $brand-color; }
.order-card__flags { display: flex; flex-wrap: wrap; gap: 10rpx; margin-bottom: 10rpx; }
.flag { font-size: 20rpx; padding: 4rpx 14rpx; border-radius: 8rpx; }
.flag--after { color: #b25c00; background: #fff1e0; }
.flag--after.done { color: #0a7d4b; background: #e8f7ef; }
.flag--exception { color: #c62828; background: #fdecea; }
.order-card__slot { display: block; margin-top: 8rpx; font-size: 22rpx; color: $text-color-secondary; }
/* 预计送达倒计时：正常为品牌色，超时转红 */
.order-card__eta { display: block; margin-top: 6rpx; font-size: 22rpx; color: $brand-color; }
.order-card__eta.late { color: #d93025; font-weight: 600; }
.order-card__footer-right { display: flex; align-items: center; gap: 16rpx; }
.review-btn { font-size: 24rpx; color: $brand-color; padding: 6rpx 20rpx; border: 1rpx solid $brand-color; border-radius: 999rpx; }
</style>
