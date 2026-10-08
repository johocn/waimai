<template>
  <view class="order-detail" v-if="order">
    <view class="status-header" :class="'status--' + order.state">
      <text class="status-header__text">{{ statusLabel }}</text>
      <text class="status-header__sub">{{ statusHint }}</text>
    </view>

    <!-- 异常赔付提示（plan 3.4）：处理中黄条 / 已处理绿条（展示赔付结果） -->
    <view
      v-if="campusRoute && (exceptionPending || exceptionFinal)"
      class="section exc-banner"
      :class="{ 'exc-banner--done': exceptionFinal }"
    >
      <text class="exc-banner__title">{{ exceptionPending ? $t('orderDetail.excPending') : $t('orderDetail.excDone') }}</text>
      <text class="exc-banner__sub" v-if="exceptionResultText">{{ exceptionResultText }}</text>
      <text class="exc-banner__sub" v-else-if="exceptionPending">{{ $t('orderDetail.excWaiting') }}</text>
    </view>

    <!-- 售后状态卡：存在售后单时展示摘要，点击进详情；进行中售后单隐藏「申请售后」入口 -->
    <view class="section as-card" v-if="afterSale" @tap="goAfterSaleDetail">
      <view class="as-card__row">
        <text class="as-card__title">{{ $t('orderDetail.afterSale') }} {{ asStateLabel }}</text>
        <text class="as-card__amount">¥{{ ((afterSale.actualRefundAmount ?? afterSale.refundAmount) / 100).toFixed(2) }}</text>
      </view>
      <text class="as-card__sub">{{ afterSale.reason }} · {{ $t('orderDetail.submittedAt').replace('{t}', formatTime(afterSale.createdAt)) }}</text>
    </view>

    <!-- 履约时间线（校园单：按路线 R1/R3 区分节点，spec §5.4） -->
    <view class="section" v-if="campusRoute && campusRoute !== 'R4'">
      <text class="section__title">{{ $t('orderDetail.timelineTitle') }}</text>
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
        <text v-if="order.customFields?.campusZone">{{ $t('orderDetail.deliverTo').replace('{t}', order.customFields.campusZone) }}</text>
        <text v-if="order.customFields?.deliverySlotText">{{ $t('orderDetail.slotText').replace('{t}', order.customFields.deliverySlotText) }}</text>
      </view>
    </view>

    <!-- R2 快递到校卡（二期 spec §5.2）：preparing=确认到校；arrived_gate=选取件方式 -->
    <view class="section r2-card" v-if="campusRoute === 'R2'">
      <text class="section__title">{{ $t('orderDetail.r2Title') }}</text>
      <template v-if="(order.customFields?.leg1Status ?? 'preparing') === 'preparing'">
        <text class="r2-hint">{{ $t('orderDetail.r2Preparing') }}</text>
        <button class="action-btn action-btn--primary r2-btn" @click="confirmArrived">{{ $t('orderDetail.r2ArrivedBtn') }}</button>
      </template>
      <template v-else>
        <text class="r2-hint">{{ $t('orderDetail.r2Arrived') }}</text>
        <text class="r2-hint" v-if="relayLabel">{{ relayLabel }}</text>
        <view class="r2-actions">
          <button class="action-btn r2-btn" @click="selfPickup">{{ $t('orderDetail.selfPickupBtn') }}</button>
          <button class="action-btn action-btn--primary r2-btn" @click="goRelay" :disabled="relayActive">{{ $t('orderDetail.relayBtn') }}</button>
        </view>
      </template>
    </view>

    <!-- R4 到店自取核销码（二期 spec §5.4） -->
    <view class="section pickup-code" v-if="isR4 && pickupCode">
      <text class="section__title">{{ $t('orderDetail.pickupTitle') }}</text>
      <text class="code-text">{{ pickupCode.code }}</text>
      <text class="r2-hint" v-if="pickupCode.status === 'redeemed'">{{ $t('orderDetail.redeemed') }}</text>
      <button class="action-btn r2-btn" v-else-if="canSelfRedeem" @click="selfRedeem">{{ $t('orderDetail.selfRedeem') }}</button>
      <text class="r2-hint" v-else>{{ $t('orderDetail.showToStaff') }}</text>
    </view>

    <!-- 骑手卡：有骑手显示姓名/信用分；无骑手显示等待/调度中/人工介入提示（10s 轮询）
         plan 2.2：配送中（assigned/in_progress）且有坐标时内嵌腾讯地图显示骑手 Marker（送达/转单后端即不返回位置） -->
    <view class="section rider" v-if="campusRoute && !['R2','R4'].includes(campusRoute) && !isScheduled && (rider || !timelineFinished)">
      <view v-if="rider" class="rider__row">
        <view class="rider__avatar"><text>{{ $t('orderDetail.riderAvatar') }}</text></view>
        <view class="rider__info">
          <text class="rider__name">{{ rider.realName }}</text>
          <text class="rider__sub">{{ $t('orderDetail.credit').replace('{n}', String(rider.credit ?? '—')) }}<text v-if="campusRoute === 'R1'">{{ $t('orderDetail.relayRider') }}</text></text>
        </view>
        <text class="rider__contact" @tap="callStore">{{ $t('orderDetail.contactStore') }}</text>
      </view>
      <text v-else class="rider__hint">{{ riderHint }}</text>
      <view class="rider__urge" v-if="canUrge">
        <text v-if="urged" class="rider__urged-tag">{{ $t('orderDetail.urgedTag') }}</text>
        <button v-else class="rider__urge-btn" @tap="onUrge">{{ $t('orderDetail.urgeBtn') }}</button>
      </view>
      <map
        v-if="rider?.location"
        class="rider__map"
        :latitude="rider.location.lat"
        :longitude="rider.location.lng"
        :markers="riderMarkers"
        :scale="16"
      />
    </view>

    <view class="section" v-if="!campusRoute && order.shippingAddress">
      <text class="section__title">{{ $t('orderDetail.addrTitle') }}</text>
      <text>{{ order.shippingAddress.fullName }} {{ order.shippingAddress.phoneNumber }}</text>
      <text class="section__sub">{{ order.shippingAddress.province }} {{ order.shippingAddress.city }} {{ order.shippingAddress.streetLine1 }}</text>
    </view>
    <view class="section" v-if="!campusRoute && order.shippingLines?.length">
      <text class="section__title">{{ $t('orderDetail.logisticsTitle') }}</text>
      <view class="logistics">
        <text>{{ order.shippingLines[0]?.shippingMethod?.name || $t('orderDetail.mailing') }}</text>
        <text v-if="trackingNo" class="logistics__no">{{ $t('orderDetail.trackingNoLabel').replace('{t}', trackingNo) }}</text>
        <text v-else class="logistics__empty">{{ $t('orderDetail.logisticsEmpty') }}</text>
      </view>
    </view>
    <view class="section">
      <text class="section__title">{{ $t('orderDetail.goodsTitle') }}</text>
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
      <view class="summary__row"><text>{{ $t('orderDetail.goodsTotal') }}</text><text>¥{{ (order.subTotalWithTax / 100).toFixed(2) }}</text></view>
      <view class="summary__row"><text>{{ $t('orderDetail.shipping') }}</text><text>¥{{ (order.shippingWithTax / 100).toFixed(2) }}</text></view>
      <view class="summary__row" v-if="order.discounts?.length"><text>{{ $t('orderDetail.discount') }}</text><text class="discount">-¥{{ (discountTotal / 100).toFixed(2) }}</text></view>
      <view class="summary__row summary__row--total"><text>{{ $t('orderDetail.paid') }}</text><text class="summary__total">¥{{ (order.totalWithTax / 100).toFixed(2) }}</text></view>
    </view>
    <view class="section" v-if="order.couponCodes?.length">
      <text class="section__title">{{ $t('orderDetail.couponTitle') }}</text>
      <text v-for="c in order.couponCodes" :key="c" class="coupon-tag">{{ c }}</text>
    </view>
    <view class="section info">
      <view class="info__row"><text>{{ $t('orderDetail.orderNo') }}</text><text @click="copyCode">{{ order.code }}</text></view>
      <view class="info__row"><text>{{ $t('orderDetail.orderTime') }}</text><text>{{ formatTime(order.createdAt) }}</text></view>
      <view class="info__row" v-if="order.payments?.length"><text>{{ $t('orderDetail.payMethod') }}</text><text>{{ order.payments[0]?.method }}</text></view>
    </view>
    <!-- 发票：已提交开票申请只读条（Task 11） -->
    <view class="invoice-done" v-if="order.customFields?.invoiceApplied">
      <text class="invoice-done__tag">{{ $t('orderDetail.invoiceApplied') }}</text>
      <text class="invoice-done__txt">{{ invoiceSummary(order.customFields.invoiceInfo) }}</text>
    </view>
    <view class="order-detail__actions">
      <button v-if="canReceive" class="action-btn action-btn--primary" @click="confirmReceive">{{ $t('orderDetail.receiveBtn') }}</button>
      <button v-if="canAfterSale" class="action-btn" @click="goAfterSale">{{ $t('orderDetail.afterSaleBtn') }}</button>
      <button v-if="canInvoice" class="action-btn" @click="openInvoice">{{ $t('orderDetail.invoice') }}</button>
      <button v-if="canCancel" class="action-btn action-btn--ghost" @click="cancelOrder">{{ $t('orderDetail.cancelBtn') }}</button>
      <button v-if="canReview" class="action-btn" @click="goReview">{{ $t('orderDetail.reviewBtn') }}</button>
      <button class="action-btn action-btn--primary" @click="reorder">{{ $t('orderDetail.reorderBtn') }}</button>
    </view>

    <!-- 开发票弹层（Task 11）：抬头选择 + 接收邮箱 + 提交申请 -->
    <view class="invoice-mask" v-if="invoiceShow" @click="invoiceShow = false">
      <view class="invoice-sheet" @click.stop>
        <text class="invoice-sheet__title">{{ $t('orderDetail.invoice') }}</text>
        <view class="invoice-sheet__opt" v-for="(t, i) in invoiceTitles" :key="i"
              :class="{ on: invoiceSelIdx === i }" @click="invoiceEmail = t.email; invoiceSelIdx = i">
          <text>{{ t.name }}（{{ t.type === 'company' ? $t('orderDetail.titleCompany') : $t('orderDetail.titlePersonal') }}）</text>
        </view>
        <input class="invoice-sheet__ipt" v-model="invoiceEmail" :placeholder="$t('orderDetail.emailPh')" />
        <button class="invoice-sheet__btn" @click="submitInvoice">{{ $t('orderDetail.submitInvoiceBtn') }}</button>
      </view>
    </view>
  </view>
  <LoadingSkeleton v-else type="card" :count="2" />
</template>
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getOrderByCode } from '../../api/queries/order';
import { getGraphQLClient } from '../../api/client';
import { fetchOrderRider, fetchR2Relay, markArrived, urgeOrder } from '../../api/mutations/campus';
import { fetchStoreList } from '../../api/queries/waimai';
import { fetchMyAfterSales } from '../../api/queries/afterSale';
import type { AfterSaleRequest } from '../../api/queries/afterSale';
import { getActiveCustomer } from '../../api/queries/user';
import { applyOrderInvoice } from '../../api/mutations/user';
import { parseInvoiceTitles, type InvoiceTitle } from '../../utils/profile-mapping';
import { fetchMyPickupCode, claimPickup } from '../../api/queries/pickup';
import { relayStatusLabel } from '../../utils/errand';
import { buildTimeline, isNoRiderFinal, isExceptionFinal } from '../../utils/timeline';
import { useLocaleStore } from '../../stores/locale';
import VImage from '../../components/VImage.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
const locale = useLocaleStore();
const order = ref<any>(null);
const trackingNo = ref('');
const rider = ref<{ realName: string; credit: number; location?: { lat: number; lng: number } | null } | null>(null);
// plan 2.2：骑手 Marker（callout 显示骑手姓名 + 送往楼栋，目标楼栋无经纬度以文字标注）
const riderMarkers = computed(() => {
    const loc = rider.value?.location; if (!loc) return [];
    return [{
        id: 1,
        latitude: loc.lat,
        longitude: loc.lng,
        width: 28,
        height: 28,
        callout: {
            content: `${rider.value!.realName} ${locale.t('orderDetail.calloutDelivering')}${order.value?.customFields?.campusZone ? locale.t('orderDetail.calloutTo').replace('{t}', order.value.customFields.campusZone) : ''}`,
            display: 'ALWAYS',
            fontSize: 12,
            borderRadius: 6,
            padding: 6,
        },
    }];
});
// 状态展示映射：值存 i18n 键（enum → labelKey 模式）
const statusMap: Record<string, string> = { Created:'stCreated', PaymentAuthorized:'stToShip', PaymentSettled:'stToShip', Delivered:'stToReceive', PartiallyDelivered:'stToReceive', Shipped:'stToReceive', Cancelled:'stCancelled', Modified:'stModified' };
const statusHintMap: Record<string, string> = { Created:'hintPayNow', PaymentAuthorized:'hintProcessing', PaymentSettled:'hintProcessing', Delivered:'hintConfirmReceive', Shipped:'hintDelivering' };
const statusLabel = computed(() => {
    const k = statusMap[order.value?.state];
    return k ? locale.t(`orderDetail.${k}`) : order.value?.state || '';
});
const statusHint = computed(() => {
    const k = statusHintMap[order.value?.state];
    return k ? locale.t(`orderDetail.${k}`) : '';
});
// —— 异常赔付（plan 3.4）：骑手上报异常 → 平台处置（退差价/发券/退单/重派）——
const exceptionPending = computed(() => {
    const cf = order.value?.customFields;
    return cf?.deliveryStatus === 'exception' && !isExceptionFinal(cf?.hallStatus ?? null);
});
const exceptionFinal = computed(() => isExceptionFinal(order.value?.customFields?.hallStatus ?? null));
const exceptionResultText = computed(() => {
    const cf = order.value?.customFields;
    if (!cf) return '';
    if (cf.exceptionAction === 'refund_diff' && cf.exceptionCompensation != null) {
        return locale.t('orderDetail.excRefundDiff').replace('{c}', (cf.exceptionCompensation / 100).toFixed(2));
    }
    if (cf.exceptionAction === 'coupon') return locale.t('orderDetail.excCoupon');
    if (cf.exceptionAction === 'refund_all') return locale.t('orderDetail.excRefundAll');
    if (cf.exceptionAction === 'reassign') return locale.t('orderDetail.excReassign');
    return '';
});
const discountTotal = computed(() => order.value?.discounts?.reduce((s:number,d:any)=>s+d.amountWithTax,0) || 0);
// —— 售后（送达后 24h 内，整单/按行部分退）——
const afterSale = ref<AfterSaleRequest | null>(null);
// 售后状态映射：值存 i18n 键
const asStateLabels: Record<string, string> = {
    Pending: 'asPending', Approved: 'asApproved', Received: 'asReceived', Refunded: 'asRefunded',
    RefundFailed: 'asRefundFailed', Rejected: 'asRejected', Appealed: 'asAppealed', Closed: 'asClosed',
};
const asStateLabel = computed(() => {
    const k = asStateLabels[afterSale.value?.state ?? ''];
    return k ? locale.t(`orderDetail.${k}`) : '';
});
const deliveredAt = computed(() => order.value?.customFields?.deliveredAt ?? null);
const withinAfterSaleWindow = computed(() => {
    if (!deliveredAt.value) return false;
    return Date.now() - new Date(deliveredAt.value).getTime() <= 24 * 60 * 60 * 1000;
});
// 进行中售后单（非 Closed）→ 展示状态卡并隐藏入口；Closed/无单且送达 24h 内 → 显示入口
const hasActiveAfterSale = computed(() => !!afterSale.value && afterSale.value.state !== 'Closed');
// —— 校园履约（spec §5.4）：customFields 驱动时间线与骑手卡 ——
const campusRoute = computed(() => order.value?.customFields?.fulfillmentRoute || '');
const timeline = computed(() => buildTimeline(campusRoute.value, order.value?.customFields?.hallStatus ?? null, order.value?.customFields?.deliveryStatus ?? null, order.value?.customFields?.leg1Status ?? null));
const timelineFinished = computed(() => timeline.value.every(n => n.done));
const activeTimelineIndex = computed(() => timeline.value.findIndex(n => !n.done));
const canReceive = computed(() =>
    ['Delivered','PartiallyDelivered','Shipped'].includes(order.value?.state)
    || (campusRoute.value === 'R2' && order.value?.state === 'PaymentSettled'
        && (order.value?.customFields?.leg1Status ?? '') === 'arrived_gate'));
const canAfterSale = computed(() =>
    order.value?.customFields?.deliveryStatus === 'delivered'
    && withinAfterSaleWindow.value
    && !hasActiveAfterSale.value);
// 开发票（Task 11）：已支付未开票即可申请（后端幂等闸 INVOICE_ALREADY_APPLIED 兜底）
const canInvoice = computed(() =>
    ['PaymentAuthorized', 'PaymentSettled', 'Shipped', 'Delivered'].includes(order.value?.state)
    && !order.value?.customFields?.invoiceApplied);
const canCancel = computed(() => ['Created','AddingItems','ArrangingPayment'].includes(order.value?.state));
const canReview = computed(() => ['Delivered', 'Completed'].includes(order.value?.state));
// 预约单（plan 3.1）：未放量进大厅前不显示骑手等待卡（时间线首节点已表达预约态）
const isScheduled = computed(() => ((order.value?.customFields?.hallStatus ?? '') + '').toLowerCase() === 'scheduled');
// 「平台调度中」降级（spec §5.4）：无骑手且在大厅停留超 2 分钟
const dispatching = computed(() => {
    const cf = order.value?.customFields;
    if (!cf || cf.hallStatus !== 'open' || cf.deliveryStatus || !cf.hallEnteredAt) return false;
    return Date.now() - new Date(cf.hallEnteredAt).getTime() > 2 * 60 * 1000;
});
const riderHint = computed(() => {
    const cf = order.value?.customFields;
    if (isNoRiderFinal(cf?.hallStatus ?? null)) return locale.t('orderDetail.hintNoRider');
    if (dispatching.value) return locale.t('orderDetail.hintDispatching');
    return locale.t('orderDetail.hintWaiting');
});
// —— 催单/联系商家（plan 2.4）——
const urged = computed(() => !!order.value?.customFields?.urged);
const canUrge = computed(() => {
    const st = order.value?.customFields?.deliveryStatus;
    return campusRoute.value && !!st && !['delivered', 'exception'].includes(st);
});
function onUrge() {
    uni.showModal({
        title: locale.t('orderDetail.urgeTitle'),
        content: locale.t('orderDetail.urgeConfirm'),
        success: async (r: any) => {
            if (!r.confirm) return;
            try {
                await urgeOrder(String(order.value.id));
                uni.showToast({ title: locale.t('orderDetail.urgedOk'), icon: 'success' });
                await reloadOrder();
            } catch (e: any) {
                uni.showToast({ title: e?.response?.errors?.[0]?.message || e?.message || locale.t('orderDetail.urgeFail'), icon: 'none' });
            }
        },
    });
}
/** 拨门店电话（虚拟号回拨下一轮）；Order 有 channelToken 时精确匹配店铺，否则回退第一家 */
async function callStore() {
    try {
        const list: any[] = await fetchStoreList();
        const token = order.value?.channelToken;
        const store = (token && list.find(s => s.channelToken === token)) || list[0];
        const phone = store?.storePhone;
        if (!phone) return uni.showToast({ title: locale.t('orderDetail.noPhone'), icon: 'none' });
        uni.makePhoneCall({ phoneNumber: phone });
    } catch { uni.showToast({ title: locale.t('orderDetail.phoneFail'), icon: 'none' }); }
}
onMounted(async () => {
    const pages = getCurrentPages(); const page = pages[pages.length - 1] as any;
    const code = page?.options?.code; if (!code) return;
    try { const res: any = await getOrderByCode(code); order.value = res.orderByCode; } catch (e) { console.error(e); }
    // 售后单查询（整单维度，client-side 按 orderId 过滤）；旧 returnTrackingNo 死查询已移除
    try {
        const mine = await fetchMyAfterSales();
        afterSale.value = mine.find(r => String(r.orderId) === String(order.value?.id))
            ?? mine.find(r => r.order?.id === order.value?.id) ?? null;
    } catch (e) { /* 未登录等场景静默 */ }
    loadPickupCode();
    startRiderPolling();
});
// 轮询：R2 原单轮询接力状态（10s，动态反查不写回标记）；其余校园单轮询骑手卡（送达/无骑手终态即停）
let riderTimer: ReturnType<typeof setInterval> | null = null;
function startRiderPolling() {
    stopRiderPolling();
    if (!order.value?.id || !campusRoute.value || campusRoute.value === 'R4') return;
    if (campusRoute.value === 'R2') {
        if ((order.value?.customFields?.leg1Status ?? 'preparing') === 'arrived_gate') {
            loadRelay();
            riderTimer = setInterval(loadRelay, 10000);
        }
        return;
    }
    pollRiderOnce();
    riderTimer = setInterval(pollRiderOnce, 10000);
}
async function pollRiderOnce() {
    const cf = order.value?.customFields;
    if (!order.value?.id) return;
    if (cf?.deliveryStatus === 'delivered' || isNoRiderFinal(cf?.hallStatus ?? null) || isExceptionFinal(cf?.hallStatus ?? null)) return stopRiderPolling();
    try { rider.value = await fetchOrderRider(String(order.value.id)); } catch (e) {}
}
// R2 接力状态动态反查（spec §3.5/§4.3）；接力送达即停轮询（退款终态继续轮询，学生可重发）
async function loadRelay() {
    if (campusRoute.value !== 'R2' || !order.value?.id) return;
    try { relay.value = await fetchR2Relay(String(order.value.id)); } catch (e) {}
    if (relay.value?.deliveryStatus === 'delivered') stopRiderPolling();
}
function stopRiderPolling() { if (riderTimer) { clearInterval(riderTimer); riderTimer = null; } }
onUnmounted(stopRiderPolling);
// —— R2 快递到校（二期 spec §5.2）——
const relay = ref<any>(null);
const relayLabel = computed(() => relayStatusLabel(relay.value));
// 进行中接力单禁止重复发单（已送达/退款终态放开：已送达应去确认收货，退款可重发）
const relayActive = computed(() => {
    if (!relay.value) return false;
    return !(relay.value.state === 'Cancelled' || relay.value.hallStatus === 'no_rider_final' || relay.value.deliveryStatus === 'delivered');
});

function confirmArrived() {
    uni.showModal({
        title: locale.t('orderDetail.arriveTitle'),
        content: locale.t('orderDetail.arriveConfirm'),
        success: async (r: any) => {
            if (!r.confirm) return;
            try {
                await markArrived(String(order.value.id));
                await reloadOrder();
                startRiderPolling(); // leg1Status 已变 arrived_gate，重启轮询进入接力状态轮询
            } catch (e: any) {
                uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('orderDetail.arriveFail'), icon: 'none' });
            }
        },
    });
}
async function reloadOrder() {
    const pages = getCurrentPages(); const page = pages[pages.length - 1] as any;
    const code = page?.options?.code; if (!code) return;
    try { const res: any = await getOrderByCode(code); order.value = res.orderByCode; } catch (e) {}
}
function selfPickup() {
    uni.showModal({
        title: locale.t('orderDetail.selfPickupTitle'),
        content: locale.t('orderDetail.selfPickupContent'),
        showCancel: false,
    });
}
// 发 R5 接力：预填 A 点=校内代收点、B 点=原单 campusZone（默认宿舍楼）、buildingId=原单楼栋（spec §5.2）
function goRelay() {
    const o = order.value; if (!o?.code) return;
    const cf = o.customFields ?? {};
    const a = encodeURIComponent('校内代收点');
    const b = encodeURIComponent(cf.campusZone || '');
    const buildingId = cf.buildingId || '';
    uni.navigateTo({ url: `/pkg-campus/errand/create?from=R2&code=${o.code}&a=${a}&b=${b}&buildingId=${buildingId}` });
}
// —— R4 到店自取核销码（fetchMyPickupCode 返回 { myPickupCode } 由调用方解包，Task 12 Step 4）——
const isR4 = computed(() => campusRoute.value === 'R4');
const pickupCode = ref<any>(null);
// 前端简化：到店收款（cod*）单由店员核销；判断偏差由后端 claimMyPickup 拒绝并 toast
const canSelfRedeem = computed(() => {
    if (pickupCode.value?.status !== 'generated') return false;
    const method = order.value?.payments?.[0]?.method ?? '';
    return !method.startsWith('cod'); // 实际 COD 模板 code 为 cod-payment-template
});

async function loadPickupCode() {
    if (campusRoute.value !== 'R4' || !order.value?.id) return;
    try { const r: any = await fetchMyPickupCode(String(order.value.id)); pickupCode.value = r?.myPickupCode ?? null; } catch (e) {}
}
async function selfRedeem() {
    try {
        await claimPickup(String(order.value.id), pickupCode.value.code);
        await loadPickupCode();
        uni.showToast({ title: locale.t('orderDetail.redeemOk'), icon: 'success' });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('orderDetail.redeemFail'), icon: 'none' });
    }
}
function formatTime(t: string) { return t ? new Date(t).toLocaleString('zh-CN') : ''; }
function copyCode() { uni.setClipboardData({ data: order.value.code }); uni.showToast({ title: locale.t('orderDetail.copied'), icon: 'success' }); }
function confirmReceive() { uni.showModal({ title: locale.t('orderDetail.receiveBtn'), content: locale.t('orderDetail.receiveConfirm'), success: async (r: any) => { if (r.confirm) { try { const client = getGraphQLClient(); await client.request(`mutation { transitionOrderToState(state: "Delivered") { ... on Order { id state } ... on ErrorResult { errorCode message } } }`); uni.showToast({ title: locale.t('orderDetail.received') }); order.value.state = 'Delivered'; } catch (e: any) { uni.showToast({ title: e.message, icon: 'none' }); } } } }); }
function cancelOrder() { uni.showModal({ title: locale.t('orderDetail.cancelBtn'), content: locale.t('orderDetail.cancelConfirm'), success: async (r: any) => { if (r.confirm) { try { const client = getGraphQLClient(); await client.request(`mutation { cancelOrder(orderId: "${order.value.id}") { ... on Order { id state } ... on ErrorResult { errorCode message } } }`); uni.showToast({ title: locale.t('orderDetail.cancelled') }); order.value.state = 'Cancelled'; stopRiderPolling(); } catch (e: any) { uni.showToast({ title: e.message, icon: 'none' }); } } } }); }
// 去评价：默认带第一个商品行（同一行同一客户只能评一次，后端防重）
function goReview() {
    const line = order.value?.lines?.[0];
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
// —— 开发票弹层（Task 11）：抬头拉取 → 弹层选择 → applyOrderInvoice 幂等留痕 ——
const invoiceTitles = ref<InvoiceTitle[]>([]);
const invoiceSelIdx = ref(0);
const invoiceEmail = ref('');
const invoiceShow = ref(false);

async function openInvoice() {
    try {
        const res: any = await getActiveCustomer();
        invoiceTitles.value = parseInvoiceTitles(res?.activeCustomer?.customFields?.invoiceTitles);
    } catch (e) { /* 未登录等场景静默，走空抬头引导 */ }
    if (!invoiceTitles.value.length) {
        uni.showModal({
            title: locale.t('orderDetail.noTitleTitle'), content: locale.t('orderDetail.noTitleContent'),
            success: (r: any) => { if (r.confirm) uni.navigateTo({ url: '/pkg-user/pages/invoice-titles' }); },
        });
        return;
    }
    invoiceSelIdx.value = 0;
    invoiceEmail.value = invoiceTitles.value[0].email || '';
    invoiceShow.value = true;
}

async function submitInvoice() {
    const t = invoiceTitles.value[invoiceSelIdx.value];
    if (!t) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceEmail.value)) {
        uni.showToast({ title: locale.t('orderDetail.emailInvalid'), icon: 'none' }); return;
    }
    try {
        const snapshot = JSON.stringify({ titleType: t.type, titleName: t.name, taxNo: t.taxNo || '', email: invoiceEmail.value, appliedAt: new Date().toISOString() });
        await applyOrderInvoice(String(order.value.id), snapshot);
        order.value.customFields = { ...(order.value.customFields || {}), invoiceApplied: true, invoiceInfo: snapshot };
        invoiceShow.value = false;
        uni.showToast({ title: locale.t('orderDetail.invoiceDone'), icon: 'success' });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || e?.message || locale.t('orderDetail.submitFail'), icon: 'none' });
    }
}

function invoiceSummary(raw: unknown): string {
    try {
        const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return `${o?.titleName || ''} · ${o?.email || ''}`;
    } catch { return ''; }
}
// 售后：入口创建页 / 状态卡详情页
function goAfterSale() {
    if (!order.value?.code) return;
    uni.navigateTo({ url: `/pkg-order/pages/after-sale-create?code=${order.value.code}` });
}
function goAfterSaleDetail() {
    if (!afterSale.value?.id) return;
    uni.navigateTo({ url: `/pkg-order/pages/after-sale-detail?id=${afterSale.value.id}` });
}
// 再来一单：shop-api 的 Order 无 channelToken，无法精确回店，回首页店铺列表重选
function reorder() { uni.switchTab({ url: '/pages/home/index' }); }
</script>
<style lang="scss" scoped>
.order-detail { padding-bottom: 40rpx; }
.status-header { padding: 40rpx 30rpx; background: linear-gradient(135deg, $brand-color, #ff9966); color: #fff; &__text { font-size: 36rpx; font-weight: bold; display: block; } &__sub { font-size: 26rpx; opacity: 0.85; margin-top: 8rpx; display: block; } }
.status--Cancelled { background: linear-gradient(135deg, #999, #bbb); }
// 异常赔付提示（plan 3.4）：处理中黄条 / 已处理绿条
.exc-banner { background: #fff7e6; border: 1rpx solid #ffe1a8;
  &__title { font-size: 26rpx; font-weight: bold; color: #c47b00; display: block; }
  &__sub { font-size: 24rpx; color: #c47b00; display: block; margin-top: 6rpx; }
  &--done { background: #ecfaf1; border-color: #b7ebd0;
    .exc-banner__title { color: #0a9d58; }
    .exc-banner__sub { color: #0a9d58; } }
}
.section { background: $surface; margin: 20rpx; padding: 24rpx; border-radius: $radius-md; &__title { font-size: 28rpx; font-weight: bold; display: block; margin-bottom: 16rpx; } &__sub { font-size: 26rpx; color: $text-color-secondary; display: block; margin-top: 6rpx; } }
// 履约时间线
.tl { &__item { display: flex; align-items: flex-start; } &__rail { display: flex; flex-direction: column; align-items: center; margin-right: 20rpx; } &__dot { width: 32rpx; height: 32rpx; border-radius: 50%; background: #eee; color: #fff; font-size: 20rpx; display: flex; align-items: center; justify-content: center; flex-shrink: 0; } &__label { font-size: 26rpx; color: $text-color-placeholder; padding: 4rpx 0 28rpx; } &__item:last-child &__label { padding-bottom: 4rpx; } &__item--done &__dot { background: $brand-color; } &__item--done &__label { color: $text-color; } &__item--active &__dot { background: $brand-color; box-shadow: 0 0 0 8rpx rgba(255, 102, 0, 0.15); } &__item--active &__label { color: $brand-color; font-weight: bold; } }
.tl-meta { display: flex; flex-direction: column; gap: 6rpx; border-top: 1rpx solid $border-color; padding-top: 16rpx; font-size: 24rpx; color: $text-color-secondary; }
// 骑手卡
.rider { &__row { display: flex; align-items: center; gap: 20rpx; } &__avatar { width: 80rpx; height: 80rpx; border-radius: 50%; background: $brand-color; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 32rpx; flex-shrink: 0; } &__info { flex: 1; display: flex; flex-direction: column; gap: 6rpx; } &__name { font-size: 28rpx; font-weight: bold; } &__sub { font-size: 24rpx; color: $text-color-secondary; } &__hint { font-size: 26rpx; color: $brand-color; } &__contact { font-size: 24rpx; color: $brand-color; border: 1rpx solid $brand-color; border-radius: 999rpx; padding: 8rpx 20rpx; flex-shrink: 0; } &__urge { margin-top: 16rpx; display: flex; justify-content: center; } &__urge-btn { width: 240rpx; height: 64rpx; line-height: 64rpx; font-size: 26rpx; border-radius: 999rpx; background: $surface; color: $brand-color; border: 1rpx solid $brand-color; padding: 0; margin: 0; } &__urged-tag { font-size: 24rpx; color: #e02020; background: #fdeaea; border-radius: 999rpx; padding: 8rpx 24rpx; } &__map { width: 100%; height: 320rpx; border-radius: $radius-md; margin-top: 16rpx; } }
.logistics { &__no { font-size: 26rpx; color: $brand-color; display: block; margin-top: 8rpx; } &__empty { font-size: 26rpx; color: $text-color-placeholder; } }
.order-line { display: flex; gap: 16rpx; padding: 16rpx 0; border-bottom: 1rpx solid #f5f5f5; &:last-child { border-bottom: none; } &__info { flex: 1; display: flex; flex-direction: column; justify-content: space-between; } &__name { font-size: 26rpx; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; } &__spec { font-size: 22rpx; color: $text-color-placeholder; margin-top: 4rpx; } &__bottom { display: flex; justify-content: space-between; align-items: center; } &__price { font-size: 28rpx; color: $price-color; } &__qty { font-size: 24rpx; color: $text-color-placeholder; } }
.summary { &__row { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 26rpx; &--total { padding-top: 16rpx; margin-top: 8rpx; border-top: 1rpx solid $border-color; font-size: 28rpx; } } &__total { font-size: 36rpx; color: $price-color; font-weight: bold; } }
.discount { color: #07c160; }
.coupon-tag { display: inline-block; background: #fff3e6; color: $brand-color; font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 20rpx; margin-right: 12rpx; border: 1rpx solid $brand-color; }
.info { &__row { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 26rpx; color: $text-color-secondary; } }
.order-detail__actions { padding: 20rpx; display: flex; gap: 16rpx; flex-wrap: wrap; }
// 售后状态卡
.as-card { &__row { display: flex; justify-content: space-between; align-items: center; } &__title { font-size: 28rpx; font-weight: bold; } &__amount { font-size: 28rpx; color: $price-color; font-weight: bold; } &__sub { font-size: 24rpx; color: $text-color-secondary; margin-top: 8rpx; display: block; } }
// 开发票（Task 11）：已申请只读条 + 底部弹层
.invoice-done { background: $surface; border-radius: $radius-md; padding: 24rpx 30rpx; margin: 20rpx; &__tag { font-size: 26rpx; color: $brand-color; font-weight: bold; display: block; } &__txt { font-size: 24rpx; color: $text-color-placeholder; margin-top: 8rpx; display: block; } }
.invoice-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: flex-end; z-index: 9; }
.invoice-sheet { width: 100%; background: $surface; border-radius: 24rpx 24rpx 0 0; padding: 40rpx 30rpx calc(40rpx + env(safe-area-inset-bottom)); &__title { font-size: 32rpx; font-weight: bold; display: block; margin-bottom: 24rpx; } &__opt { border: 1rpx solid $border-color; border-radius: $radius-md; padding: 20rpx; margin-bottom: 16rpx; font-size: 26rpx; &.on { border-color: $brand-color; color: $brand-color; background: #fff3e6; } } &__ipt { border-bottom: 1rpx solid $border-color; height: 80rpx; font-size: 28rpx; margin: 16rpx 0 24rpx; } &__btn { background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; } }
.action-btn { flex: 1; min-width: 200rpx; height: 80rpx; font-size: 28rpx; border-radius: $radius-md; border: none; display: flex; align-items: center; justify-content: center; &--primary { background: $brand-color; color: #fff; } &--ghost { background: $surface; color: $text-color-placeholder; border: 1rpx solid $border-color; } }
.r2-hint { font-size: 26rpx; color: $text-color-secondary; display: block; margin-top: 8rpx; }
.r2-actions { display: flex; gap: 16rpx; margin-top: 16rpx; }
.code-text { font-size: 48rpx; font-weight: bold; letter-spacing: 8rpx; text-align: center; display: block; padding: 16rpx 0; color: $text-color; }
</style>
