<template>
  <view class="order-detail" v-if="order">
    <view class="status-header" :class="'status--' + order.state">
      <text class="status-header__text">{{ statusLabel }}</text>
      <text class="status-header__sub">{{ statusHint }}</text>
    </view>

    <!-- 履约时间线（校园单：按路线 R1/R3 区分节点，spec §5.4） -->
    <view class="section" v-if="campusRoute">
      <text class="section__title">配送进度</text>
      <view class="tl">
        <view
          v-for="(n, i) in timeline"
          :key="n.key"
          class="tl__item"
          :class="{ 'tl__item--done': n.done, 'tl__item--active': i === activeTimelineIndex }"
        >
          <view class="tl__rail"><view class="tl__dot"><text v-if="n.done">✓</text></view></view>
          <text class="tl__label">{{ n.label }}</text>
        </view>
      </view>
      <view class="tl-meta" v-if="order.customFields?.campusZone || order.customFields?.deliverySlotText">
        <text v-if="order.customFields?.campusZone">配送至：{{ order.customFields.campusZone }}</text>
        <text v-if="order.customFields?.deliverySlotText">送达时段：{{ order.customFields.deliverySlotText }}</text>
      </view>
    </view>

    <!-- 骑手卡：有骑手显示姓名/信用分；无骑手显示等待/调度中/人工介入提示（10s 轮询） -->
    <view class="section rider" v-if="campusRoute && (rider || !timelineFinished)">
      <view v-if="rider" class="rider__row">
        <view class="rider__avatar"><text>骑</text></view>
        <view class="rider__info">
          <text class="rider__name">{{ rider.realName }}</text>
          <text class="rider__sub">信用分 {{ rider.credit ?? '—' }}<text v-if="campusRoute === 'R1'"> · 接力传信者 · 第二程</text></text>
        </view>
      </view>
      <text v-else class="rider__hint">{{ riderHint }}</text>
    </view>

    <view class="section" v-if="!campusRoute && order.shippingAddress">
      <text class="section__title">收货地址</text>
      <text>{{ order.shippingAddress.fullName }} {{ order.shippingAddress.phoneNumber }}</text>
      <text class="section__sub">{{ order.shippingAddress.province }} {{ order.shippingAddress.city }} {{ order.shippingAddress.streetLine1 }}</text>
    </view>
    <view class="section" v-if="!campusRoute && order.shippingLines?.length">
      <text class="section__title">物流信息</text>
      <view class="logistics">
        <text>{{ order.shippingLines[0]?.shippingMethod?.name || '邮寄' }}</text>
        <text v-if="trackingNo" class="logistics__no">运单号: {{ trackingNo }}</text>
        <text v-else class="logistics__empty">暂无物流信息</text>
      </view>
    </view>
    <view class="section">
      <text class="section__title">商品信息</text>
      <view v-for="line in order.lines" :key="line.id" class="order-line">
        <VImage :src="line.featuredAsset?.preview || ''" width="140rpx" height="140rpx" />
        <view class="order-line__info">
          <text class="order-line__name">{{ line.productVariant?.name }}</text>
          <text class="order-line__spec">{{ line.productVariant?.options?.map((o: any) => o.name).join(' ') }}</text>
          <view class="order-line__bottom">
            <text class="order-line__price">¥{{ (line.unitPriceWithTax / 100).toFixed(2) }}</text>
            <text class="order-line__qty">x{{ line.quantity }}</text>
          </view>
        </view>
      </view>
    </view>
    <view class="section summary">
      <view class="summary__row"><text>商品总额</text><text>¥{{ (order.subTotalWithTax / 100).toFixed(2) }}</text></view>
      <view class="summary__row"><text>运费</text><text>¥{{ (order.shippingWithTax / 100).toFixed(2) }}</text></view>
      <view class="summary__row" v-if="order.discounts?.length"><text>优惠</text><text class="discount">-¥{{ (discountTotal / 100).toFixed(2) }}</text></view>
      <view class="summary__row summary__row--total"><text>实付</text><text class="summary__total">¥{{ (order.totalWithTax / 100).toFixed(2) }}</text></view>
    </view>
    <view class="section" v-if="order.couponCodes?.length">
      <text class="section__title">优惠券</text>
      <text v-for="c in order.couponCodes" :key="c" class="coupon-tag">{{ c }}</text>
    </view>
    <view class="section info">
      <view class="info__row"><text>订单编号</text><text @click="copyCode">{{ order.code }}</text></view>
      <view class="info__row"><text>下单时间</text><text>{{ formatTime(order.createdAt) }}</text></view>
      <view class="info__row" v-if="order.payments?.length"><text>支付方式</text><text>{{ order.payments[0]?.method }}</text></view>
    </view>
    <view class="order-detail__actions">
      <button v-if="canReceive" class="action-btn action-btn--primary" @click="confirmReceive">确认收货</button>
      <button v-if="canAfterSale" class="action-btn" @click="notOpen">申请售后</button>
      <button v-if="canInvoice" class="action-btn" @click="notOpen">开发票</button>
      <button v-if="canCancel" class="action-btn action-btn--ghost" @click="cancelOrder">取消订单</button>
      <button v-if="canReview" class="action-btn" @click="notOpen">去评价</button>
      <button class="action-btn action-btn--primary" @click="reorder">再来一单</button>
    </view>
  </view>
  <LoadingSkeleton v-else type="card" :count="2" />
</template>
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getOrderByCode } from '../../api/queries/order';
import { getGraphQLClient } from '../../api/client';
import { fetchOrderRider } from '../../api/mutations/campus';
import { buildTimeline, isNoRiderFinal } from '../../utils/timeline';
import VImage from '../../components/VImage.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
const order = ref<any>(null);
const trackingNo = ref('');
const rider = ref<{ realName: string; credit: number } | null>(null);
const statusMap: Record<string, string> = { Created:'待付款', PaymentAuthorized:'待发货', PaymentSettled:'待发货', Delivered:'待收货', PartiallyDelivered:'待收货', Shipped:'待收货', Cancelled:'已取消', Modified:'已修改' };
const statusHintMap: Record<string, string> = { Created:'请尽快完成支付', PaymentAuthorized:'商家正在处理', PaymentSettled:'商家正在处理', Delivered:'请确认收货', Shipped:'商品正在配送中' };
const statusLabel = computed(() => statusMap[order.value?.state] || order.value?.state || '');
const statusHint = computed(() => statusHintMap[order.value?.state] || '');
const discountTotal = computed(() => order.value?.discounts?.reduce((s:number,d:any)=>s+d.amountWithTax,0) || 0);
// —— 校园履约（spec §5.4）：customFields 驱动时间线与骑手卡 ——
const campusRoute = computed(() => order.value?.customFields?.fulfillmentRoute || '');
const timeline = computed(() => buildTimeline(campusRoute.value, order.value?.customFields?.hallStatus ?? null, order.value?.customFields?.deliveryStatus ?? null));
const timelineFinished = computed(() => timeline.value.every(n => n.done));
const activeTimelineIndex = computed(() => timeline.value.findIndex(n => !n.done));
const canReceive = computed(() => ['Delivered','PartiallyDelivered','Shipped'].includes(order.value?.state));
const canAfterSale = computed(() => ['Delivered','PaymentSettled','PaymentAuthorized'].includes(order.value?.state));
const canInvoice = computed(() => ['Delivered','Completed','PartiallyDelivered'].includes(order.value?.state));
const canCancel = computed(() => ['Created','AddingItems','ArrangingPayment'].includes(order.value?.state));
const canReview = computed(() => ['Delivered', 'Completed'].includes(order.value?.state));
// 「平台调度中」降级（spec §5.4）：无骑手且在大厅停留超 2 分钟
const dispatching = computed(() => {
    const cf = order.value?.customFields;
    if (!cf || cf.hallStatus !== 'open' || cf.deliveryStatus || !cf.hallEnteredAt) return false;
    return Date.now() - new Date(cf.hallEnteredAt).getTime() > 2 * 60 * 1000;
});
const riderHint = computed(() => {
    const cf = order.value?.customFields;
    if (isNoRiderFinal(cf?.hallStatus ?? null)) return '暂无传信者接单，平台人工介入处理中';
    if (dispatching.value) return '平台调度中，正在为您加急派单';
    return '等待传信者接单…';
});
onMounted(async () => {
    const pages = getCurrentPages(); const page = pages[pages.length - 1] as any;
    const code = page?.options?.code; if (!code) return;
    try { const res: any = await getOrderByCode(code); order.value = res.orderByCode; } catch (e) { console.error(e); }
    try {
        const client = getGraphQLClient();
        const tRes: any = await client.request(`query { afterSalesRequest(id: "${order.value?.id}") { returnTrackingNo } }`);
        if (tRes?.afterSalesRequest?.returnTrackingNo) trackingNo.value = tRes.afterSalesRequest.returnTrackingNo;
    } catch (e) {}
    startRiderPolling();
});
// 骑手卡 10s 轮询：送达 / 无骑手终态即停
let riderTimer: ReturnType<typeof setInterval> | null = null;
function startRiderPolling() {
    stopRiderPolling();
    if (!order.value?.id || !campusRoute.value) return;
    pollRiderOnce();
    riderTimer = setInterval(pollRiderOnce, 10000);
}
async function pollRiderOnce() {
    const cf = order.value?.customFields;
    if (!order.value?.id) return;
    if (cf?.deliveryStatus === 'delivered' || isNoRiderFinal(cf?.hallStatus ?? null)) return stopRiderPolling();
    try { rider.value = await fetchOrderRider(String(order.value.id)); } catch (e) {}
}
function stopRiderPolling() { if (riderTimer) { clearInterval(riderTimer); riderTimer = null; } }
onUnmounted(stopRiderPolling);
function formatTime(t: string) { return t ? new Date(t).toLocaleString('zh-CN') : ''; }
function copyCode() { uni.setClipboardData({ data: order.value.code }); uni.showToast({ title: '已复制', icon: 'success' }); }
function confirmReceive() { uni.showModal({ title: '确认收货', content: '确认已收到商品?', success: async (r: any) => { if (r.confirm) { try { const client = getGraphQLClient(); await client.request(`mutation { transitionOrderToState(state: "Delivered") { ... on Order { id state } ... on ErrorResult { errorCode message } } }`); uni.showToast({ title: '已确认收货' }); order.value.state = 'Delivered'; } catch (e: any) { uni.showToast({ title: e.message, icon: 'none' }); } } } }); }
function cancelOrder() { uni.showModal({ title: '取消订单', content: '确定取消该订单?', success: async (r: any) => { if (r.confirm) { try { const client = getGraphQLClient(); await client.request(`mutation { cancelOrder(orderId: "${order.value.id}") { ... on Order { id state } ... on ErrorResult { errorCode message } } }`); uni.showToast({ title: '已取消' }); order.value.state = 'Cancelled'; stopRiderPolling(); } catch (e: any) { uni.showToast({ title: e.message, icon: 'none' }); } } } }); }
// 死链兜底：售后/发票/评价目标页面本模板未建
function notOpen() { uni.showToast({ title: '暂未开放', icon: 'none' }); }
// 再来一单：shop-api 的 Order 无 channelToken，无法精确回店，回首页店铺列表重选
function reorder() { uni.switchTab({ url: '/pages/home/index' }); }
</script>
<style lang="scss" scoped>
.order-detail { padding-bottom: 40rpx; }
.status-header { padding: 40rpx 30rpx; background: linear-gradient(135deg, $brand-color, #ff9966); color: #fff; &__text { font-size: 36rpx; font-weight: bold; display: block; } &__sub { font-size: 26rpx; opacity: 0.85; margin-top: 8rpx; display: block; } }
.status--Cancelled { background: linear-gradient(135deg, #999, #bbb); }
.section { background: #fff; margin: 20rpx; padding: 24rpx; border-radius: $radius-md; &__title { font-size: 28rpx; font-weight: bold; display: block; margin-bottom: 16rpx; } &__sub { font-size: 26rpx; color: $text-color-secondary; display: block; margin-top: 6rpx; } }
// 履约时间线
.tl { &__item { display: flex; align-items: flex-start; } &__rail { display: flex; flex-direction: column; align-items: center; margin-right: 20rpx; } &__dot { width: 32rpx; height: 32rpx; border-radius: 50%; background: #eee; color: #fff; font-size: 20rpx; display: flex; align-items: center; justify-content: center; flex-shrink: 0; } &__label { font-size: 26rpx; color: #999; padding: 4rpx 0 28rpx; } &__item:last-child &__label { padding-bottom: 4rpx; } &__item--done &__dot { background: $brand-color; } &__item--done &__label { color: $text-color; } &__item--active &__dot { background: $brand-color; box-shadow: 0 0 0 8rpx rgba(255, 102, 0, 0.15); } &__item--active &__label { color: $brand-color; font-weight: bold; } }
.tl-meta { display: flex; flex-direction: column; gap: 6rpx; border-top: 1rpx solid $border-color; padding-top: 16rpx; font-size: 24rpx; color: $text-color-secondary; }
// 骑手卡
.rider { &__row { display: flex; align-items: center; gap: 20rpx; } &__avatar { width: 80rpx; height: 80rpx; border-radius: 50%; background: $brand-color; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 32rpx; flex-shrink: 0; } &__info { display: flex; flex-direction: column; gap: 6rpx; } &__name { font-size: 28rpx; font-weight: bold; } &__sub { font-size: 24rpx; color: $text-color-secondary; } &__hint { font-size: 26rpx; color: $brand-color; } }
.logistics { &__no { font-size: 26rpx; color: $brand-color; display: block; margin-top: 8rpx; } &__empty { font-size: 26rpx; color: #999; } }
.order-line { display: flex; gap: 16rpx; padding: 16rpx 0; border-bottom: 1rpx solid #f5f5f5; &:last-child { border-bottom: none; } &__info { flex: 1; display: flex; flex-direction: column; justify-content: space-between; } &__name { font-size: 26rpx; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; } &__spec { font-size: 22rpx; color: #999; margin-top: 4rpx; } &__bottom { display: flex; justify-content: space-between; align-items: center; } &__price { font-size: 28rpx; color: $price-color; } &__qty { font-size: 24rpx; color: #999; } }
.summary { &__row { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 26rpx; &--total { padding-top: 16rpx; margin-top: 8rpx; border-top: 1rpx solid $border-color; font-size: 28rpx; } } &__total { font-size: 36rpx; color: $price-color; font-weight: bold; } }
.discount { color: #07c160; }
.coupon-tag { display: inline-block; background: #fff3e6; color: $brand-color; font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 20rpx; margin-right: 12rpx; border: 1rpx solid $brand-color; }
.info { &__row { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 26rpx; color: $text-color-secondary; } }
.order-detail__actions { padding: 20rpx; display: flex; gap: 16rpx; flex-wrap: wrap; }
.action-btn { flex: 1; min-width: 200rpx; height: 80rpx; font-size: 28rpx; border-radius: $radius-md; border: none; display: flex; align-items: center; justify-content: center; &--primary { background: $brand-color; color: #fff; } &--ghost { background: #fff; color: #999; border: 1rpx solid $border-color; } }
</style>
