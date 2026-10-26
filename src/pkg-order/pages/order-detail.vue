<template>
  <view class="order-detail" v-if="order">
    <view class="status-header" :class="'status--' + order.state">
      <text class="status-header__text">{{ statusLabel }}</text>
      <text class="status-header__sub">{{ statusHint }}</text>
    </view>

    <!-- 准时达承诺条（P0 超时赔付）：支付时固化承诺送达时间，超时自动发券，送达后原地展示赔付结果 -->
    <view v-if="promiseVisible" class="section promise-card" :class="'promise-card--' + promiseState">
      <view class="promise-card__row">
        <text class="promise-card__title">{{ promiseTitle }}</text>
        <text class="promise-card__tag">{{ promiseTag }}</text>
      </view>
      <text class="promise-card__hint">{{ promiseHint }}</text>
    </view>

    <!-- 预约单提醒：带送达时段且未完成时置顶展示，避免用户错过预约时间 -->
    <view class="section sched-card" v-if="scheduledText && !['Delivered', 'Cancelled'].includes(order.state)">
      <view class="sched-card__row">
        <text class="sched-card__title">{{ $t('orderDetail.scheduleTitle') }}</text>
        <text class="sched-card__slot">{{ scheduledText }}</text>
      </view>
      <text class="sched-card__hint">{{ $t('orderDetail.scheduleHint') }}</text>
    </view>

    <!-- 预计送达倒计时：仅待配送/配送中，预约单与已送达单不展示 -->
    <view class="section eta-card" v-if="etaText && !promiseVisible" :class="{ 'eta-card--late': etaLate }">
      <text class="eta-card__title">{{ etaText }}</text>
      <text class="eta-card__hint">{{ etaLate ? $t('orderDetail.etaLateHint') : $t('orderDetail.etaHint') }}</text>
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

    <!-- 通用配送进度（非校园路线订单）：下单 → 支付 → 配送 → 完成，按订单状态推导 -->
    <view class="section" v-if="!campusRoute && simpleTimeline.length">
      <text class="section__title">{{ $t('orderDetail.progressTitle') }}</text>
      <view class="tl">
        <view
          v-for="(n, i) in simpleTimeline"
          :key="n.key"
          class="tl__item"
          :class="{ 'tl__item--done': n.done, 'tl__item--active': i === activeSimpleIndex }"
        >
          <view class="tl__rail"><view class="tl__dot"><text v-if="n.done">✓</text></view></view>
          <view class="tl__body">
            <text class="tl__label">{{ n.label }}</text>
            <text v-if="n.time" class="tl__time">{{ formatTime(n.time) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- R4 到店自取核销码（二期 spec §5.4） -->
    <view class="section pickup-code" v-if="isR4 && pickupCode">
      <text class="section__title">{{ $t('orderDetail.pickupTitle') }}</text>
      <text class="code-text">{{ pickupCode.code }}</text>
      <text class="r2-hint" v-if="pickupCode.status === 'redeemed'">{{ $t('orderDetail.redeemed') }}</text>
      <button class="action-btn r2-btn" @click="openPickupPass">{{ $t('orderDetail.pickupPassBtn') }}</button>
      <button class="action-btn r2-btn" v-if="canSelfRedeem" @click="selfRedeem">{{ $t('orderDetail.selfRedeem') }}</button>
      <text class="r2-hint" v-else>{{ $t('orderDetail.showToStaff') }}</text>
    </view>

    <!-- 配送卡：按订单快照展示承运方（商户/自营快递/外部快递）、平台单号、骑手电话与校园交接点 -->
    <view class="section delivery-card" v-if="order.campusOrderDelivery">
      <text class="section__title">{{ $t('orderDetail.deliveryTitle') }}</text>
      <view class="kv">
        <text class="k">{{ $t('orderDetail.deliveryProvider') }}</text>
        <text class="v">{{ providerText }}</text>
      </view>
      <view v-if="order.campusOrderDelivery.thirdPartyNo" class="kv">
        <text class="k">{{ $t('orderDetail.deliveryNo') }}</text>
        <text class="v">{{ order.campusOrderDelivery.thirdPartyNo }}</text>
      </view>
      <view v-if="order.campusOrderDelivery.courierName" class="kv">
        <text class="k">{{ $t('orderDetail.deliveryCourier') }}</text>
        <text class="v">{{ order.campusOrderDelivery.courierName }}</text>
      </view>
      <view v-if="order.campusOrderDelivery.courierPhone" class="kv" @tap="callCourier(order.campusOrderDelivery.courierPhone)">
        <text class="k">{{ $t('orderDetail.deliveryPhone') }}</text>
        <text class="v link">{{ order.campusOrderDelivery.courierPhone }}</text>
      </view>
      <view v-if="order.campusOrderDelivery.handoverPointName" class="kv">
        <text class="k">{{ $t('orderDetail.handoverPoint') }}</text>
        <text class="v">{{ order.campusOrderDelivery.handoverPointName }} {{ order.campusOrderDelivery.handoverPointAddress }}</text>
      </view>
      <!-- 交接码：第一段送达交接点后生成，第二段骑手取货时需核对（防丢餐扯皮） -->
      <view v-if="order.customFields?.handoverCode" class="kv">
        <text class="k">{{ $t('orderDetail.handoverCode') }}</text>
        <text class="v code">{{ order.customFields.handoverCode }}</text>
      </view>
      <text v-if="order.customFields?.handoverCode" class="kv-hint">{{ $t('orderDetail.handoverCodeHint') }}</text>
    </view>

    <!-- 骑手卡：有骑手显示姓名/信用分；无骑手显示等待/调度中/人工介入提示（10s 轮询）
         plan 2.2：配送中（assigned/in_progress）且有坐标时内嵌腾讯地图显示骑手 Marker（送达/转单后端即不返回位置） -->
    <view class="section rider" v-if="campusRoute && campusRoute !== 'R4' && !isScheduled && (rider || !timelineFinished)">
      <view v-if="rider" class="rider__row">
        <view class="rider__avatar"><text>{{ $t('orderDetail.riderAvatar') }}</text></view>
        <view class="rider__info">
          <text class="rider__name">{{ rider.realName }}</text>
          <text class="rider__sub">{{ $t('orderDetail.credit').replace('{n}', String(rider.credit ?? '—')) }}<text v-if="['R1','R2'].includes(campusRoute)">{{ $t('orderDetail.relayRider') }}</text></text>
          <!-- 配送中补充实时距离与预计送达（后端 campusOrderRider 字段，缺失则不展示） -->
          <view class="rider__meta" v-if="rider.distanceMeters != null || rider.etaMinutes != null">
            <text v-if="rider.distanceMeters != null">{{ $t('orderDetail.riderDistance').replace('{n}', distanceText(rider.distanceMeters)) }}</text>
            <text v-if="rider.etaMinutes != null">{{ $t('orderDetail.riderEta').replace('{n}', String(rider.etaMinutes)) }}</text>
          </view>
        </view>
        <view class="rider__ops">
          <text v-if="rider.phone" class="rider__contact" @tap="callRider">{{ $t('orderDetail.contactRider') }}</text>
          <text class="rider__contact" @tap="callStore">{{ $t('orderDetail.contactStore') }}</text>
        </view>
      </view>
      <text v-else class="rider__hint">{{ riderHint }}</text>
      <!-- 全屏 GPS 跟踪页入口（仅配送中且有骑手时） -->
      <view class="rider__track" v-if="rider && ['assigned','in_progress'].includes(order.customFields?.deliveryStatus ?? '')" @tap="goTracking">
        <text>{{ $t('orderDetail.trackLive') }} ›</text>
      </view>
      <view class="rider__urge" v-if="canUrge">
        <text v-if="urged" class="rider__urged-tag">{{ $t('orderDetail.urgedTag') }}</text>
        <button v-else class="rider__urge-btn" @tap="onUrge">{{ $t('orderDetail.urgeBtn') }}</button>
        <text class="rider__urge-hint">{{ $t('orderDetail.urgeHint') }}</text>
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

    <!-- 改址（取货前可改，可跨分区）：方案 A 居中弹层；差额多退少补后台台账结算 -->
    <view class="section addr-change" v-if="campusRoute && campusRoute !== 'R4'">
      <view class="addr-change__head">
        <text class="section__title">{{ $t('orderDetail.changeAddrTitle') }}</text>
        <text v-if="canChangeAddr" class="addr-change__btn" @tap="openAddrChange">{{ $t('orderDetail.changeAddrBtn') }}</text>
      </view>
      <text class="addr-change__cur">{{ $t('orderDetail.changeAddrCurrent').replace('{t}', currentAddrText) }}</text>
      <text class="addr-change__hint">{{ canChangeAddr ? $t('orderDetail.changeAddrHint') : $t('orderDetail.changeAddrLocked') }}</text>
      <!-- 改址运费差额状态条：待补 / 待退 / 已结清 -->
      <view class="addr-diff" v-if="addrLatest" :class="addrLatestClass">
        <view class="addr-diff__top">
          <text class="addr-diff__label">{{ addrLatestText }}</text>
          <text class="addr-diff__tag">{{ addrLatestTag }}</text>
        </view>
        <text class="addr-diff__meta">{{ addrLatestMeta }}</text>
        <text class="addr-diff__note" v-if="addrLatest.status === 'pending'">{{ $t('orderDetail.diffStripNote') }}</text>
      </view>
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
    <!-- 费用明细：商品小计 / 配送费 / 逐条优惠 / 实付；优惠合计单列展示 -->
    <view class="section summary">
      <text class="section__title">{{ $t('orderDetail.feeTitle') }}</text>
      <view class="summary__row"><text>{{ $t('orderDetail.goodsTotal') }}</text><text>¥{{ (order.subTotalWithTax / 100).toFixed(2) }}</text></view>
      <view class="summary__row"><text>{{ $t('orderDetail.shipping') }}</text><text>{{ order.shippingWithTax > 0 ? '¥' + (order.shippingWithTax / 100).toFixed(2) : $t('orderDetail.freeShipping') }}</text></view>
      <view class="summary__row summary__row--disc" v-for="d in (order.discounts ?? [])" :key="d.id">
        <text class="summary__dname">{{ d.description || $t('orderDetail.discount') }}</text>
        <text class="discount">-¥{{ (d.amountWithTax / 100).toFixed(2) }}</text>
      </view>
      <view class="summary__row summary__row--total"><text>{{ $t('orderDetail.paid') }}</text><text class="summary__total">¥{{ (order.totalWithTax / 100).toFixed(2) }}</text></view>
      <text class="summary__saved" v-if="discountTotal > 0">{{ $t('orderDetail.savedTotal').replace('{y}', (discountTotal / 100).toFixed(2)) }}</text>
    </view>
    <!-- 支付计划（预售尾款/分期/租赁）：有账单时提供入口 -->
    <view class="section plan-card" v-if="hasSchedule" @tap="goPaymentSchedule">
      <view class="plan-card__row">
        <text class="plan-card__title">{{ $t('orderDetail.planTitle') }}</text>
        <text class="plan-card__link">{{ $t('orderDetail.planView') }} ›</text>
      </view>
      <text class="plan-card__hint">{{ $t('orderDetail.planHint') }}</text>
    </view>
    <!-- 配送进度：有配送包裹档案时展示骑手/运单与轨迹入口 -->
    <view class="section plan-card" v-if="hasPackages" @tap="goDeliveryTrack">
      <view class="plan-card__row">
        <text class="plan-card__title">{{ $t('orderDetail.trackTitle') }}</text>
        <text class="plan-card__link">{{ $t('orderDetail.trackView') }} ›</text>
      </view>
      <text class="plan-card__hint">{{ packageHint || $t('orderDetail.trackHint') }}</text>
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
    <!-- 发票：已提交开票申请展示完整抬头/邮箱/申请时间，可复制 -->
    <view class="invoice-card" v-if="order.customFields?.invoiceApplied">
      <view class="invoice-card__head">
        <text class="invoice-card__tag">{{ $t('orderDetail.invoiceApplied') }}</text>
        <text class="invoice-card__copy" @click="copyInvoiceInfo">{{ $t('orderDetail.copyInvoice') }}</text>
      </view>
      <view class="invoice-card__row" v-for="row in invoiceRows" :key="row.label">
        <text class="invoice-card__label">{{ row.label }}</text>
        <text class="invoice-card__val">{{ row.value }}</text>
      </view>
      <text class="invoice-card__hint">{{ $t('orderDetail.invoiceMailHint') }}</text>
    </view>
    <view class="order-detail__actions">
      <button v-if="canReceive" class="action-btn action-btn--primary" @click="confirmReceive">{{ $t('orderDetail.receiveBtn') }}</button>
      <button v-if="canAfterSale" class="action-btn" @click="goAfterSale">{{ $t('orderDetail.afterSaleBtn') }}</button>
      <button v-if="canInvoice" class="action-btn" @click="openInvoice">{{ $t('orderDetail.invoice') }}</button>
      <button v-if="canCancel" class="action-btn action-btn--ghost" @click="cancelOrder">{{ $t('orderDetail.cancelBtn') }}</button>
      <button v-if="canReview" class="action-btn" @click="goReview">{{ $t('orderDetail.reviewBtn') }}</button>
      <button class="action-btn" @click="goSupportChat">{{ $t('orderDetail.supportChatBtn') }}</button>
      <button class="action-btn action-btn--primary" @click="reorder">{{ $t('orderDetail.reorderBtn') }}</button>
      <button class="action-btn action-btn--ghost" @click="shareOrder">{{ $t('orderDetail.shareOrderBtn') }}</button>
      <button class="action-btn action-btn--ghost" @click="goPoster">{{ $t('orderDetail.posterBtn') }}</button>
      <button class="action-btn action-btn--ghost" @click="goReceipt">{{ $t('orderDetail.receiptBtn') }}</button>
    </view>

    <!-- 改址弹层（方案 A 居中）：分区含运费 → 楼栋 → 门牌；提交后展示运费差额 -->
    <view class="addr-mask" v-if="addrShow" @tap.self="closeAddrChange">
      <view class="addr-dialog">
        <template v-if="!addrResult">
          <text class="addr-dialog__title">{{ $t('orderDetail.changeAddrTitle') }}</text>
          <scroll-view scroll-y class="addr-dialog__body">
            <text class="addr-label">{{ $t('orderDetail.changeZone') }}</text>
            <view class="addr-chips">
              <view
                v-for="z in addrZones"
                :key="z.id"
                class="addr-chip"
                :class="{ on: addrZoneId === z.id }"
                @tap="pickZone(z.id)"
              >
                <text>{{ z.name }}</text>
                <text class="addr-chip__fee">¥{{ (Number(z.price ?? z.fee ?? 0) / 100).toFixed(2) }}</text>
              </view>
            </view>
            <text class="addr-label">{{ $t('orderDetail.changeBuilding') }}</text>
            <view class="addr-chips" v-if="addrBuildings.length">
              <view
                v-for="b in addrBuildings"
                :key="b.id"
                class="addr-chip"
                :class="{ on: addrBuildingId === b.id }"
                @tap="addrBuildingId = b.id"
              >
                <text>{{ b.name }}</text>
              </view>
            </view>
            <text v-else class="addr-empty">{{ $t('orderDetail.changeNoBuildings') }}</text>
            <text class="addr-label">{{ $t('orderDetail.changeDetail') }}</text>
            <input class="addr-input" v-model="addrDetail" :placeholder="$t('orderDetail.changeDetailPh')" />
            <text class="addr-note">{{ $t('orderDetail.changeDiffNote') }}</text>
          </scroll-view>
          <view class="addr-dialog__actions">
            <button class="addr-btn addr-btn--ghost" @tap="closeAddrChange">{{ $t('orderDetail.changeCancel') }}</button>
            <button class="addr-btn addr-btn--primary" :disabled="addrSubmitting" @tap="submitAddrChange">
              {{ addrSubmitting ? $t('orderDetail.changeSubmitting') : $t('orderDetail.changeSubmit') }}
            </button>
          </view>
        </template>
        <template v-else>
          <text class="addr-dialog__title">{{ $t('orderDetail.changeOkTitle') }}</text>
          <text class="addr-result">{{ addrResultText }}</text>
          <view class="addr-dialog__actions">
            <button class="addr-btn addr-btn--primary" @tap="closeAddrChange">{{ $t('orderDetail.changeOkBtn') }}</button>
          </view>
        </template>
      </view>
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
        <text class="invoice-sheet__manage" @click="manageTitles">{{ $t('orderDetail.manageTitles') }}</text>
        <button class="invoice-sheet__btn" @click="submitInvoice">{{ $t('orderDetail.submitInvoiceBtn') }}</button>
      </view>
    </view>

    <!-- 再来一单确认弹层：跨渠道定位原店铺 → 校验在售 → 一键加购进店 -->
    <view class="reorder-mask" v-if="reorderOpen" @click.self="closeReorder">
      <view class="reorder-sheet">
        <view class="reorder-head">
          <text class="reorder-title">{{ $t('orderDetail.reorderTitle') }}</text>
          <text class="reorder-close" @click="closeReorder">✕</text>
        </view>
        <view v-if="reorderLoading" class="reorder-loading">{{ $t('orderDetail.reorderLocating') }}</view>
        <template v-else>
          <text class="reorder-shop">{{ reorderShop?.name }}</text>
          <scroll-view scroll-y class="reorder-list">
            <view v-for="l in reorderLines" :key="l.variantId" class="reorder-line" :class="{ off: !l.available }">
              <VImage v-if="l.image" :src="l.image" width="80rpx" height="80rpx" class="reorder-img" />
              <view v-else class="reorder-img reorder-img--ph"></view>
              <view class="reorder-info">
                <text class="reorder-name">{{ l.name }}</text>
                <text v-if="!l.available" class="reorder-off">{{ $t('orderDetail.reorderUnavailable') }}</text>
              </view>
              <text class="reorder-qty">×{{ l.quantity }}</text>
            </view>
            <view v-if="reorderSkippedCount" class="reorder-hint">
              {{ $t('orderDetail.reorderSkipHint').replace('{n}', String(reorderSkippedCount)) }}
            </view>
          </scroll-view>
          <button class="reorder-btn" :disabled="reorderPlacing || !reorderAvailableCount" @click="confirmReorder">
            {{ reorderPlacing ? $t('orderDetail.reorderLoading') : $t('orderDetail.reorderConfirm') }}
          </button>
        </template>
      </view>
    </view>
  </view>
  <LoadingSkeleton v-else type="card" :count="2" />
</template>
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getOrderByCode, getOrdersForChannel } from '../../api/queries/order';
import { getPaymentSchedule } from '../../api/queries/paymentSchedule';
import { getOrderPackages } from '../../api/queries/package';
import { addItemToOrder } from '../../api/mutations/cart';
import { useTenantStore } from '../../stores/tenant';
import { useCartStore } from '../../stores/cart';
import { useAuthStore } from '../../stores/auth';
import { getGraphQLClient } from '../../api/client';
import { fetchOrderRider, urgeOrder, fetchZones, fetchBuildings, changeDeliveryAddress, fetchMyAddressChange } from '../../api/mutations/campus';
import { fetchStoreList, fetchProductListForChannel } from '../../api/queries/waimai';
import { orderEta, clockHM } from '../../utils/order-eta';
import { fetchMyAfterSales } from '../../api/queries/afterSale';
import type { AfterSaleRequest } from '../../api/queries/afterSale';
import { getActiveCustomer } from '../../api/queries/user';
import { applyOrderInvoice } from '../../api/mutations/user';
import { parseInvoiceTitles, type InvoiceTitle } from '../../utils/profile-mapping';
import { fetchMyPickupCode, claimPickup } from '../../api/queries/pickup';
import { sharePage } from '../../utils/share';
import { buildTimeline, isNoRiderFinal, isExceptionFinal } from '../../utils/timeline';
import { useLocaleStore } from '../../stores/locale';
import VImage from '../../components/VImage.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
const locale = useLocaleStore();
const tenant = useTenantStore();
const cart = useCartStore();
const auth = useAuthStore();
const order = ref<any>(null);
const trackingNo = ref('');
const rider = ref<{ realName: string; credit: number; phone?: string | null; distanceMeters?: number | null; etaMinutes?: number | null; location?: { lat: number; lng: number } | null } | null>(null);
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
// 预售/分期订单存在支付计划时展示尾款入口（paymentSchedule 依赖登录态，未登录静默）
const hasSchedule = ref(false);
// 配送包裹：有包裹档案时展示配送进度入口（含骑手/运单/轨迹）
const hasPackages = ref(false);
const firstPackage = ref<any>(null);
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
const timeline = computed(() => buildTimeline(
    campusRoute.value,
    order.value?.customFields?.hallStatus ?? null,
    order.value?.customFields?.deliveryStatus ?? null,
    order.value?.customFields?.leg1Status ?? null,
    {
        deliveryPlan: order.value?.campusOrderDelivery?.deliveryPlan ?? null,
        thirdPartyState: order.value?.campusOrderDelivery?.state ?? null,
        handoverAt: order.value?.campusOrderDelivery?.handoverAt ?? null,
    },
));
const timelineFinished = computed(() => timeline.value.every(n => n.done));
const activeTimelineIndex = computed(() => timeline.value.findIndex(n => !n.done));

/** 通用配送进度（无校园路线的普通订单）：按订单状态与配送状态推导节点 */
const simpleTimeline = computed(() => {
    const o = order.value;
    if (!o || campusRoute.value) return [] as Array<{ key: string; label: string; done: boolean; time: string | null }>;
    const state = String(o.state || '');
    const paidStates = ['PaymentAuthorized', 'PaymentSettled', 'Shipped', 'PartiallyDelivered', 'Delivered', 'Completed'];
    const deliveryStatus = String(o.customFields?.deliveryStatus || '');
    const paid = paidStates.includes(state);
    const delivering = ['Shipped', 'PartiallyDelivered', 'Delivered', 'Completed'].includes(state)
        || ['assigned', 'in_progress', 'delivered'].includes(deliveryStatus);
    const done = ['Delivered', 'PartiallyDelivered', 'Completed'].includes(state) || deliveryStatus === 'delivered';
    const t = (k: string) => locale.t(`orderDetail.${k}`);
    if (state === 'Cancelled' || state === 'Modifying') {
        return [
            { key: 'created', label: t('stepCreated'), done: true, time: o.createdAt ?? null },
            { key: 'cancelled', label: t('stepCancelled'), done: true, time: null },
        ];
    }
    return [
        { key: 'created', label: t('stepCreated'), done: true, time: o.createdAt ?? null },
        { key: 'paid', label: t('stepPaid'), done: paid, time: paid ? (o.payments?.[0]?.createdAt ?? null) : null },
        { key: 'delivering', label: t('stepDelivering'), done: delivering, time: null },
        { key: 'done', label: t('stepDone'), done: done, time: done ? (o.customFields?.deliveredAt ?? null) : null },
    ];
});
const activeSimpleIndex = computed(() => {
    const i = simpleTimeline.value.findIndex(n => !n.done);
    return i < 0 ? simpleTimeline.value.length - 1 : i;
});
const canReceive = computed(() =>
    ['Delivered','PartiallyDelivered','Shipped'].includes(order.value?.state));
const canAfterSale = computed(() =>
    order.value?.customFields?.deliveryStatus === 'delivered'
    && withinAfterSaleWindow.value
    && !hasActiveAfterSale.value);
// 开发票（Task 11）：已支付未开票即可申请（后端幂等闸 INVOICE_ALREADY_APPLIED 兜底）
const canInvoice = computed(() =>
    ['PaymentAuthorized', 'PaymentSettled', 'Shipped', 'Delivered'].includes(order.value?.state)
    && !order.value?.customFields?.invoiceApplied);
// 已支付未取货也允许自助取消（与后端 cancel-guard.process.ts 一致）：
// 履约在途（骑手已接单/外部运单已接/商户自配送/已送达）禁止，未取货（open/pending_dispatch 等）放行
const IN_FLIGHT_HALL = ['grabbed', 'third_party', 'owned_dispatched', 'merchant_delivering'];
const canCancel = computed(() => {
  const o = order.value;
  if (!o) return false;
  if (['Created', 'AddingItems', 'ArrangingPayment'].includes(o.state)) return true;
  if (!['PaymentAuthorized', 'PaymentSettled'].includes(o.state)) return false;
  const cf = o.customFields ?? {};
  if (cf.deliveredAt || cf.hallStatus === 'delivered') return false;
  if (['assigned', 'in_progress'].includes(cf.deliveryStatus)) return false;
  const thirdPartyState = String(o.campusOrderDelivery?.state ?? cf.thirdPartyState ?? '');
  if (['accepted', 'pickup'].includes(thirdPartyState)) return false;
  return !IN_FLIGHT_HALL.includes(String(cf.hallStatus ?? ''));
});
const canReview = computed(() => ['Delivered', 'Completed'].includes(order.value?.state));
// 预约单（plan 3.1）：未放量进大厅前不显示骑手等待卡（时间线首节点已表达预约态）
const isScheduled = computed(() => ((order.value?.customFields?.hallStatus ?? '') + '').toLowerCase() === 'scheduled');
// 预约送达时段（结算页写入 customFields.deliverySlotText）
const scheduledText = computed(() => String(order.value?.customFields?.deliverySlotText ?? ''));
// —— 预计送达倒计时：按店铺 deliveryMinutes 估算，30s 刷新 ——
const nowTs = ref(Date.now());
const etaMinutes = ref<number | null>(null);
let etaTimer: ReturnType<typeof setInterval> | null = null;
const eta = computed(() => orderEta(order.value, etaMinutes.value, nowTs.value));
const etaLate = computed(() => (eta.value?.overdueMin ?? 0) > 0);
const etaText = computed(() => {
    const e = eta.value;
    if (!e) return '';
    return e.overdueMin > 0
        ? locale.t('orderDetail.etaOverdue').replace('{n}', String(e.overdueMin))
        : locale.t('orderDetail.etaArrive').replace('{t}', clockHM(e.etaAt)).replace('{n}', String(e.remainMin));
});

// —— 准时达承诺条（P0 超时赔付）：承诺时间由后端支付时固化，超时自动赔券 ——
const promisedAt = computed(() => order.value?.customFields?.promisedAt ?? null);
const promiseVisible = computed(() => {
    if (!promisedAt.value) return false;
    if (!['R1', 'R2', 'R3'].includes(String(campusRoute.value))) return false;
    return String(order.value?.state ?? '') !== 'Cancelled';
});
/** 超时分钟：已送达按实际送达时间算，未送达按当前时间动态算（30s 刷新） */
const promiseLateMin = computed(() => {
    const p = promisedAt.value ? new Date(promisedAt.value).getTime() : NaN;
    if (!Number.isFinite(p)) return 0;
    const end = deliveredAt.value ? new Date(deliveredAt.value).getTime() : nowTs.value;
    return Math.max(0, Math.floor((end - p) / 60_000));
});
const promiseState = computed(() => {
    const late = promiseLateMin.value > 0;
    if (!deliveredAt.value) return late ? 'late' : 'ontime';
    if (order.value?.customFields?.timeoutCompensatedAt) return 'compensated';
    return late ? 'pending' : 'ontime';
});
const promiseTitle = computed(() => {
    const p = promisedAt.value ? new Date(promisedAt.value).getTime() : NaN;
    switch (promiseState.value) {
        case 'late': return locale.t('orderDetail.promiseLate').replace('{n}', String(promiseLateMin.value));
        case 'compensated': return locale.t('orderDetail.promiseCompensated');
        case 'pending': return locale.t('orderDetail.promisePending').replace('{n}', String(promiseLateMin.value));
        default:
            return deliveredAt.value
                ? locale.t('orderDetail.promiseOnTimeDone')
                : locale.t('orderDetail.promiseOnTime').replace('{t}', Number.isFinite(p) ? clockHM(p) : '');
    }
});
const promiseTag = computed(() => (promiseState.value === 'ontime' ? locale.t('orderDetail.promiseTag') : ''));
const promiseHint = computed(() => {
    switch (promiseState.value) {
        case 'ontime': return deliveredAt.value ? '' : locale.t('orderDetail.promiseHint');
        case 'late': return locale.t('orderDetail.promiseLateHint');
        case 'pending': return locale.t('orderDetail.promisePendingHint');
        case 'compensated': return locale.t('orderDetail.promiseCompHint');
        default: return '';
    }
});
function startEtaTicker() {
    stopEtaTicker();
    etaTimer = setInterval(() => { nowTs.value = Date.now(); }, 30000);
}
function stopEtaTicker() { if (etaTimer) { clearInterval(etaTimer); etaTimer = null; } }
/** 店铺配送时长：优先按 channelToken 匹配，回退店名 */
const shopNameOfOrder = ref('');
async function loadEtaMinutes() {
    try {
        const list: any[] = await fetchStoreList();
        const o = order.value;
        const hit = list.find(s => s.channelToken === o?.channelToken) || list.find(s => s.name === o?.channelName);
        if (hit?.name) shopNameOfOrder.value = String(hit.name);
        const mins = Number(hit?.deliveryMinutes);
        if (Number.isFinite(mins) && mins > 0) etaMinutes.value = mins;
    } catch (e) { /* 静默：无配置按默认 40 分钟估算 */ }
}
/** 晒单海报：带订单号与店名进入绘图页 */
function goPoster() {
    if (!order.value?.code) return;
    uni.navigateTo({
        url: '/pkg-order/pages/share-poster?code=' + encodeURIComponent(order.value.code)
            + '&shop=' + encodeURIComponent(shopNameOfOrder.value),
    });
}
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
/** 距离展示：<1km 用米（取整），否则公里保留 1 位 */
function distanceText(meters: number): string {
    const m = Number(meters);
    if (!Number.isFinite(m) || m < 0) return '—';
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
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
/** 拨骑手电话（campusOrderRider.phone；旧后端无该字段时按钮不渲染） */
function callRider() {
    const phone = rider.value?.phone;
    if (!phone) return;
    uni.makePhoneCall({ phoneNumber: String(phone) });
}
/** 配送卡承运方文案：按订单快照 deliveryPlan 展示，外部快递再区分美团/达达 */
const providerText = computed(() => {
    const d = order.value?.campusOrderDelivery;
    if (!d) return '';
    if (d.deliveryPlan === 'external_courier') {
        if (d.provider === 'meituan') return locale.t('orderDetail.providerMeituan');
        if (d.provider === 'dada') return locale.t('orderDetail.providerDada');
        return locale.t('orderDetail.providerExternal');
    }
    if (d.deliveryPlan === 'owned') return locale.t('orderDetail.providerOwned');
    if (d.deliveryPlan === 'merchant') return locale.t('orderDetail.providerMerchant');
    if (d.deliveryPlan === 'campus_rider') return locale.t('orderDetail.providerCampus');
    if (d.deliveryPlan === 'self_pickup') return locale.t('orderDetail.providerPickup');
    return '';
});
/** 拨外部快递骑手电话（配送卡内） */
function callCourier(phone: string) {
    if (!phone) return;
    uni.makePhoneCall({ phoneNumber: String(phone) });
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
    void loadAddrLatest();
    void loadScheduleFlag();
    void loadPackageFlag();
    startRiderPolling();
    startEtaTicker();
    void loadEtaMinutes();
    // 订单列表「再来一单」直达：加载完成后自动打开复购弹层
    if (page?.options?.reorder === '1' && order.value) void reorder();
});
// 轮询：校园单统一轮询骑手卡（R2 的第二段同样是传信者接力；送达/无骑手终态即停）
let riderTimer: ReturnType<typeof setInterval> | null = null;
function startRiderPolling() {
    stopRiderPolling();
    if (!order.value?.id || !campusRoute.value || campusRoute.value === 'R4') return;
    pollRiderOnce();
    riderTimer = setInterval(pollRiderOnce, 10000);
}
async function pollRiderOnce() {
    const cf = order.value?.customFields;
    if (!order.value?.id) return;
    if (cf?.deliveryStatus === 'delivered' || isNoRiderFinal(cf?.hallStatus ?? null) || isExceptionFinal(cf?.hallStatus ?? null)) return stopRiderPolling();
    try { rider.value = await fetchOrderRider(String(order.value.id)); } catch (e) {}
}
function stopRiderPolling() { if (riderTimer) { clearInterval(riderTimer); riderTimer = null; } }
onUnmounted(stopRiderPolling);
onUnmounted(stopEtaTicker);
async function reloadOrder() {
    const pages = getCurrentPages(); const page = pages[pages.length - 1] as any;
    const code = page?.options?.code; if (!code) return;
    try { const res: any = await getOrderByCode(code); order.value = res.orderByCode; } catch (e) {}
}

// —— 改址（取货前可改，可跨分区；差额多退少补，后台台账结算）——
const addrShow = ref(false);
const addrZones = ref<any[]>([]);
const addrBuildings = ref<any[]>([]);
const addrZoneId = ref('');
const addrBuildingId = ref('');
const addrDetail = ref('');
const addrSubmitting = ref(false);
const addrResult = ref<{ diff: number } | null>(null);
// 锁死条件与后端 address-change.service 同口径：已取消/已送达/已取货/外部配送已接单
const addrLocked = computed(() => {
    const o = order.value; if (!o) return true;
    const cf = o.customFields ?? {};
    if (String(o.state ?? '') === 'Cancelled') return true;
    if (cf.deliveredAt || cf.deliveryStatus === 'delivered') return true;
    if (cf.deliveryStatus === 'in_progress') return true;
    return ['accepted', 'pickup', 'delivered'].includes(String(cf.thirdPartyState ?? ''));
});
const canChangeAddr = computed(() => !!campusRoute.value && campusRoute.value !== 'R4' && !addrLocked.value);
const currentAddrText = computed(() => {
    const cf = order.value?.customFields ?? {};
    const zone = cf.campusZone ? String(cf.campusZone) : '';
    const detail = cf.deliveryDetail ? String(cf.deliveryDetail) : '';
    return [zone, detail].filter(Boolean).join(' ') || '—';
});
const addrResultText = computed(() => {
    const d = addrResult.value?.diff ?? 0;
    if (!d) return locale.t('orderDetail.changeDiffNone');
    const y = (Math.abs(d) / 100).toFixed(2);
    return d > 0
        ? locale.t('orderDetail.changeDiffCollect').replace('{y}', y)
        : locale.t('orderDetail.changeDiffRefund').replace('{y}', y);
});
// 最近一次改址的差额状态（待补/待退/已结清）；失败静默，不影响主流程
const addrLatest = ref<any>(null);
const addrLatestClass = computed(() => {
    const r = addrLatest.value; if (!r) return '';
    if (r.status === 'settled') return 'done';
    return Number(r.diff) > 0 ? 'collect' : Number(r.diff) < 0 ? 'refund' : 'done';
});
const addrLatestText = computed(() => {
    const r = addrLatest.value; if (!r) return '';
    const y = (Math.abs(Number(r.diff ?? 0)) / 100).toFixed(2);
    if (r.status !== 'settled') {
        return Number(r.diff) > 0
            ? locale.t('orderDetail.diffStripCollect').replace('{y}', y)
            : locale.t('orderDetail.diffStripRefund').replace('{y}', y);
    }
    if (r.settleAction === 'collect') return locale.t('orderDetail.diffStripSettledCollect').replace('{y}', y);
    if (r.settleAction === 'refund') return locale.t('orderDetail.diffStripSettledRefund').replace('{y}', y);
    return locale.t('orderDetail.diffStripSettledWaive');
});
const addrLatestTag = computed(() => (addrLatest.value?.status === 'settled' ? locale.t('orderDetail.diffStripTagDone') : locale.t('orderDetail.diffStripTagPending')));
const addrLatestMeta = computed(() => {
    const r = addrLatest.value; if (!r) return '';
    return `${r.fromZone} ${r.fromBuilding} → ${r.toZone} ${r.toBuilding}`;
});
async function loadAddrLatest() {
    if (!order.value?.id) return;
    try { addrLatest.value = await fetchMyAddressChange(String(order.value.id)); } catch (e) { /* 静默 */ }
}

async function openAddrChange() {
    if (!canChangeAddr.value) return;
    addrShow.value = true;
    addrResult.value = null;
    addrSubmitting.value = false;
    addrBuildings.value = [];
    addrBuildingId.value = '';
    const cf = order.value?.customFields ?? {};
    addrDetail.value = cf.deliveryDetail ? String(cf.deliveryDetail) : '';
    try {
        if (!addrZones.value.length) addrZones.value = await fetchZones();
        const cur = addrZones.value.find((z: any) => z.name === cf.campusZone);
        addrZoneId.value = String(cur?.id ?? addrZones.value[0]?.id ?? '');
        if (!addrZoneId.value) return;
        addrBuildings.value = await fetchBuildings(addrZoneId.value);
        if (cur && cf.buildingId && addrBuildings.value.some((b: any) => String(b.id) === String(cf.buildingId))) {
            addrBuildingId.value = String(cf.buildingId);
        }
    } catch (e) { /* 分区/楼栋加载失败静默，弹层仍可取消 */ }
}
async function loadAddrBuildings() {
    addrBuildings.value = [];
    addrBuildingId.value = '';
    if (!addrZoneId.value) return;
    try { addrBuildings.value = await fetchBuildings(addrZoneId.value); } catch (e) {}
}
function pickZone(id: string) {
    if (addrZoneId.value === id) return;
    addrZoneId.value = id;
    void loadAddrBuildings();
}
function closeAddrChange() {
    addrShow.value = false;
    addrResult.value = null;
}
async function submitAddrChange() {
    if (addrSubmitting.value || !order.value?.id) return;
    if (!addrZoneId.value || !addrBuildingId.value) {
        uni.showToast({ title: locale.t('orderDetail.changeNeedAddr'), icon: 'none' });
        return;
    }
    addrSubmitting.value = true;
    try {
        const r = await changeDeliveryAddress({
            orderId: String(order.value.id),
            zoneId: addrZoneId.value,
            buildingId: addrBuildingId.value,
            detail: addrDetail.value.trim() || undefined,
        });
        addrResult.value = { diff: Number(r?.diff ?? 0) };
        await reloadOrder();
        void loadAddrLatest();
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('orderDetail.changeFail'), icon: 'none' });
    } finally {
        addrSubmitting.value = false;
    }
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

/** 取餐凭证：大字码 + 自提点信息，支持分享给同学代取 */
function openPickupPass() {
    if (!order.value?.code || !pickupCode.value?.code) return;
    const params = [
        'code=' + encodeURIComponent(order.value.code),
        'k=' + encodeURIComponent(pickupCode.value.code),
        'st=' + encodeURIComponent(pickupCode.value.status || ''),
    ].join('&');
    uni.navigateTo({ url: '/pkg-order/pages/pickup-pass?' + params });
}

/** 分享订单：微信内发送卡片，其它环境复制订单链接 */
async function shareOrder() {
    if (!order.value?.code) return;
    const how = await sharePage({
        title: locale.t('orderDetail.shareOrderTitle').replace('{c}', order.value.code),
        desc: locale.t('orderDetail.shareOrderDesc').replace('{y}', (Number(order.value.totalWithTax || 0) / 100).toFixed(2)),
        path: `/pkg-order/pages/order-detail?code=${encodeURIComponent(order.value.code)}`,
        image: order.value.lines?.[0]?.featuredAsset?.preview || '',
    });
    if (how === 'copy') uni.showToast({ title: locale.t('orderDetail.shareCopied'), icon: 'none' });
}
/** 电子小票：以订单号加载独立小票页，便于复制/存档 */
function goReceipt() {
    if (!order.value?.code) return;
    uni.navigateTo({ url: `/pkg-order/pages/receipt?code=${encodeURIComponent(order.value.code)}` });
}
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
        `orderId=${order.value?.id ?? ''}`,
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

// 发票信息卡：解析下单时留存的快照（titleType/titleName/taxNo/email/appliedAt）
const invoiceRows = computed(() => {
    const raw = order.value?.customFields?.invoiceInfo;
    let o: any = {};
    try { o = typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch { o = {}; }
    const rows: Array<{ label: string; value: string }> = [
        { label: locale.t('orderDetail.invoiceType'), value: o.titleType === 'company' ? locale.t('orderDetail.titleCompany') : (o.titleType ? locale.t('orderDetail.titlePersonal') : '') },
        { label: locale.t('orderDetail.invoiceName'), value: o.titleName || '' },
        { label: locale.t('orderDetail.invoiceTaxNo'), value: o.taxNo || '' },
        { label: locale.t('orderDetail.invoiceEmailLabel'), value: o.email || '' },
        { label: locale.t('orderDetail.invoiceTime'), value: o.appliedAt ? formatTime(o.appliedAt) : '' },
    ];
    return rows.filter(r => r.value);
});

function copyInvoiceInfo() {
    const text = invoiceRows.value.map(r => `${r.label}：${r.value}`).join('\n');
    uni.setClipboardData({
        data: text,
        success: () => uni.showToast({ title: locale.t('orderDetail.copyOk'), icon: 'none' }),
    });
}

/** 开票弹层 → 抬头管理（新增/编辑后返回，重新打开弹层即刷新） */
function manageTitles() {
    invoiceShow.value = false;
    uni.navigateTo({ url: '/pkg-user/pages/invoice-titles' });
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
/** 在线客服：带本单号发起（后端按「顾客 + 订单号 + open」复用同一条会话） */
function goSupportChat() {
    const code = order.value?.code;
    uni.navigateTo({ url: '/pkg-user/pages/support-chat' + (code ? `?orderCode=${code}` : '') });
}
/** 是否有支付计划（尾款/分期）：仅登录后查询，失败视为无 */
async function loadScheduleFlag() {
    if (!auth.isLoggedIn || !order.value?.id) return;
    try {
        const s = await getPaymentSchedule(order.value.id);
        hasSchedule.value = !!s?.id;
    } catch { hasSchedule.value = false; }
}
// 配送包裹探测：有包裹记录才展示进度入口；未登录/无档案静默
const PKG_ST: Record<string, string> = {
    pending: 'deliveryTrack.stPending',
    packed: 'deliveryTrack.stPacked',
    shipped: 'deliveryTrack.stShipped',
    delivering: 'deliveryTrack.stDelivering',
    delivered: 'deliveryTrack.stDelivered',
    cancelled: 'deliveryTrack.stCancelled',
    returned: 'deliveryTrack.stReturned',
};
const packageHint = computed(() => {
    const p = firstPackage.value;
    if (!p) return '';
    const parts: string[] = [];
    if (p.courierName) parts.push(String(p.courierName));
    const key = PKG_ST[String(p.status || '').toLowerCase()];
    if (key) parts.push(locale.t(key));
    if (p.etaMinutes != null) parts.push(locale.t('deliveryTrack.etaMin').replace('{n}', String(p.etaMinutes)));
    return parts.join(' · ');
});
async function loadPackageFlag() {
    if (!auth.isLoggedIn || !order.value?.id) return;
    try {
        const list = await getOrderPackages(order.value.id);
        hasPackages.value = list.length > 0;
        firstPackage.value = list[0] || null;
    } catch { hasPackages.value = false; firstPackage.value = null; }
}
function goDeliveryTrack() {
    if (!order.value?.id) return;
    uni.navigateTo({
        url: `/pkg-order/pages/delivery-track?orderId=${order.value.id}&code=${encodeURIComponent(order.value.code || '')}`,
    });
}
// 支付计划（尾款/分期账单）：按订单 id 查询，附带订单号用于页面展示
function goPaymentSchedule() {
    if (!order.value?.id) return;
    uni.navigateTo({
        url: `/pkg-order/pages/payment-schedule?orderId=${order.value.id}&code=${encodeURIComponent(order.value.code || '')}`,
    });
}
// 全屏骑手跟踪（版式 B）：订单号即可反查，跟踪页自行轮询骑手位置/距离/ETA
function goTracking() {
    if (!order.value?.code) return;
    uni.navigateTo({ url: `/pkg-order/pages/rider-tracking?code=${order.value.code}` });
}
// ─── 再来一单 ───────────────────────────────────────────────
// shop-api 的 Order 无 channelToken：用店铺列表的每个 token 并发查本单号，命中即原店铺。
// 命中后拉该渠道商品校验变体在售/有库存，跳过下架行，再加购并直达店铺菜单。
const reorderOpen = ref(false);
const reorderLoading = ref(false);
const reorderPlacing = ref(false);
const reorderShop = ref<any>(null);
const reorderLines = ref<Array<{ variantId: string; name: string; quantity: number; image?: string; available: boolean }>>([]);
const reorderSkippedCount = computed(() => reorderLines.value.filter(l => !l.available).length);
const reorderAvailableCount = computed(() => reorderLines.value.filter(l => l.available).length);

function closeReorder() {
    if (reorderPlacing.value) return;
    reorderOpen.value = false;
}

async function reorder() {
    if (reorderLoading.value) return;
    if (!auth.isLoggedIn) {
        uni.navigateTo({ url: '/pages/login/index?redirect=' + encodeURIComponent('/pages/profile/index') });
        return;
    }
    const code = order.value?.code;
    if (!code) return;
    reorderOpen.value = true;
    reorderLoading.value = true;
    reorderLines.value = [];
    reorderShop.value = null;
    try {
        const stores = await fetchStoreList();
        const hit = await Promise.any(
            stores.map(async (s: any) => {
                const res: any = await getOrdersForChannel(s.channelToken, { take: 1, filter: { code: { eq: code } } });
                if (res?.myOrders?.items?.length) return s;
                throw new Error('miss');
            }),
        ).catch(() => null);
        if (!hit) {
            reorderOpen.value = false;
            uni.showToast({ title: locale.t('orderDetail.reorderNoShop'), icon: 'none' });
            return;
        }
        reorderShop.value = hit;
        const products = await fetchProductListForChannel(hit.channelToken);
        const variantMap = new Map<string, any>();
        for (const p of products) {
            for (const v of p.variants ?? []) variantMap.set(String(v.id), v);
        }
        // shop-api 的 stockLevel 是枚举（IN_STOCK / LOW_STOCK / OUT_OF_STOCK / null=不跟踪库存）
        const inStock = (v: any) => v.stockLevel == null || v.stockLevel === 'IN_STOCK' || v.stockLevel === 'LOW_STOCK';
        reorderLines.value = (order.value?.lines ?? []).map((l: any) => {
            const vid = String(l.productVariant?.id ?? '');
            const v = variantMap.get(vid);
            return {
                variantId: vid,
                name: l.productVariant?.name || l.productVariant?.productName || '',
                quantity: l.quantity,
                image: l.featuredAsset?.preview,
                available: !!v && v.enabled !== false && inStock(v),
            };
        });
    } catch {
        reorderOpen.value = false;
        uni.showToast({ title: locale.t('orderDetail.reorderNoShop'), icon: 'none' });
    } finally {
        reorderLoading.value = false;
    }
}

async function confirmReorder() {
    const shop = reorderShop.value;
    const lines = reorderLines.value.filter(l => l.available);
    if (!shop || !lines.length || reorderPlacing.value) return;
    reorderPlacing.value = true;
    try {
        await tenant.switchTenant(shop.channelToken);
        let failed = 0;
        for (const l of lines) {
            try {
                const res: any = await addItemToOrder(l.variantId, l.quantity);
                if (res?.addItemToOrder?.errorCode) { failed++; continue; }
                cart.setOrder(res.addItemToOrder);
            } catch { failed++; }
        }
        const added = lines.length - failed;
        if (!added) {
            await tenant.backToDefault();
            uni.showToast({ title: locale.t('orderDetail.reorderAllSkipped'), icon: 'none' });
            return;
        }
        const skipped = reorderLines.value.length - added;
        uni.showToast({
            title: skipped
                ? locale.t('orderDetail.reorderSkipped').replace('{n}', String(skipped))
                : locale.t('orderDetail.reorderAdded'),
            icon: 'none',
        });
        reorderOpen.value = false;
        const routes = (shop.routesEnabled || []).join(',');
        const cid = shop.channelId != null ? `&cid=${shop.channelId}` : '';
        uni.navigateTo({
            url: `/pages/shop/menu?token=${shop.channelToken}&name=${encodeURIComponent(shop.name ?? '')}&routes=${encodeURIComponent(routes)}${cid}`,
        });
    } finally {
        reorderPlacing.value = false;
    }
}
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
.tl { &__body { display: flex; flex-direction: column; } &__time { font-size: 22rpx; color: $text-color-placeholder; padding-bottom: 24rpx; } &__item { display: flex; align-items: flex-start; } &__rail { display: flex; flex-direction: column; align-items: center; margin-right: 20rpx; } &__dot { width: 32rpx; height: 32rpx; border-radius: 50%; background: #eee; color: #fff; font-size: 20rpx; display: flex; align-items: center; justify-content: center; flex-shrink: 0; } &__label { font-size: 26rpx; color: $text-color-placeholder; padding: 4rpx 0 28rpx; } &__item:last-child &__label { padding-bottom: 4rpx; } &__item--done &__dot { background: $brand-color; } &__item--done &__label { color: $text-color; } &__item--active &__dot { background: $brand-color; box-shadow: 0 0 0 8rpx rgba(255, 102, 0, 0.15); } &__item--active &__label { color: $brand-color; font-weight: bold; } }
.tl-meta { display: flex; flex-direction: column; gap: 6rpx; border-top: 1rpx solid $border-color; padding-top: 16rpx; font-size: 24rpx; color: $text-color-secondary; }
// 预约单提醒卡（蓝底区别于橙色营销信息）
.sched-card { background: #eef4ff; border: 1rpx solid #cbdcff;
  &__row { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
  &__title { font-size: 26rpx; font-weight: bold; color: #2d5bd1; }
  &__slot { font-size: 26rpx; color: #2d5bd1; font-weight: bold; }
  &__hint { display: block; margin-top: 10rpx; font-size: 22rpx; color: #5b76b8; }
}
// 准时达承诺条（绿=准时/已赔，琥珀=超时或待赔）
.promise-card { background: #eaf8ee; border: 1rpx solid #b7e3c4;
  &__row { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
  &__title { font-size: 26rpx; font-weight: bold; color: #0a7d45; }
  &__tag { font-size: 22rpx; color: #0a7d45; }
  &__hint { display: block; margin-top: 8rpx; font-size: 22rpx; color: #3f7a56; }
  &--late, &--pending { background: #fff8ef; border-color: #ffd9ad; }
  &--late &__title, &--pending &__title { color: #b45309; }
  &--late &__hint, &--pending &__hint { color: #9a6a2a; }
}
// 预计送达卡（品牌色浅底，超时转红）
.eta-card { background: #fff8ef; border: 1rpx solid #ffd9ad;
  &__title { font-size: 26rpx; font-weight: bold; color: #b45309; }
  &__hint { display: block; margin-top: 8rpx; font-size: 22rpx; color: #9a6a2a; }
  &--late { background: #fff2f0; border-color: #f3b6b0; }
  &--late &__title { color: #b42318; }
  &--late &__hint { color: #b42318; }
}
// 骑手卡
.rider { &__row { display: flex; align-items: center; gap: 20rpx; } &__avatar { width: 80rpx; height: 80rpx; border-radius: 50%; background: $brand-color; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 32rpx; flex-shrink: 0; } &__info { flex: 1; display: flex; flex-direction: column; gap: 6rpx; } &__name { font-size: 28rpx; font-weight: bold; } &__sub { font-size: 24rpx; color: $text-color-secondary; } &__meta { display: flex; gap: 16rpx; font-size: 22rpx; color: $brand-color; } &__hint { font-size: 26rpx; color: $brand-color; } &__contact { font-size: 24rpx; color: $brand-color; border: 1rpx solid $brand-color; border-radius: 999rpx; padding: 8rpx 20rpx; flex-shrink: 0; } &__ops { display: flex; flex-direction: column; align-items: flex-end; gap: 12rpx; flex-shrink: 0; } &__urge { margin-top: 16rpx; display: flex; flex-direction: column; align-items: center; gap: 8rpx; } &__urge-btn { width: 240rpx; height: 64rpx; line-height: 64rpx; font-size: 26rpx; border-radius: 999rpx; background: $surface; color: $brand-color; border: 1rpx solid $brand-color; padding: 0; margin: 0; } &__urge-hint { font-size: 20rpx; color: $text-color-placeholder; } &__urged-tag { font-size: 24rpx; color: #e02020; background: #fdeaea; border-radius: 999rpx; padding: 8rpx 24rpx; } &__map { width: 100%; height: 320rpx; border-radius: $radius-md; margin-top: 16rpx; } &__track { margin-top: 16rpx; font-size: 26rpx; color: $brand-color; font-weight: bold; } }
.logistics { &__no { font-size: 26rpx; color: $brand-color; display: block; margin-top: 8rpx; } &__empty { font-size: 26rpx; color: $text-color-placeholder; } }
.order-line { display: flex; gap: 16rpx; padding: 16rpx 0; border-bottom: 1rpx solid #f5f5f5; &:last-child { border-bottom: none; } &__info { flex: 1; display: flex; flex-direction: column; justify-content: space-between; } &__name { font-size: 26rpx; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; } &__spec { font-size: 22rpx; color: $text-color-placeholder; margin-top: 4rpx; } &__bottom { display: flex; justify-content: space-between; align-items: center; } &__price { font-size: 28rpx; color: $price-color; } &__qty { font-size: 24rpx; color: $text-color-placeholder; } }
.summary { &__row { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 26rpx; &--total { padding-top: 16rpx; margin-top: 8rpx; border-top: 1rpx solid $border-color; font-size: 28rpx; } &--disc { padding: 4rpx 0; } } &__dname { font-size: 24rpx; color: $text-color-secondary; flex: 1; margin-right: 16rpx; } &__total { font-size: 36rpx; color: $price-color; font-weight: bold; } &__saved { display: block; text-align: right; font-size: 22rpx; color: #07c160; margin-top: 8rpx; } }
.discount { color: #07c160; }
.coupon-tag { display: inline-block; background: #fff3e6; color: $brand-color; font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 20rpx; margin-right: 12rpx; border: 1rpx solid $brand-color; }
.info { &__row { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 26rpx; color: $text-color-secondary; } }
.order-detail__actions { padding: 20rpx; display: flex; gap: 16rpx; flex-wrap: wrap; }
// 售后状态卡
.as-card { &__row { display: flex; justify-content: space-between; align-items: center; } &__title { font-size: 28rpx; font-weight: bold; } &__amount { font-size: 28rpx; color: $price-color; font-weight: bold; } &__sub { font-size: 24rpx; color: $text-color-secondary; margin-top: 8rpx; display: block; } }
// 支付计划入口（尾款/分期账单）
.plan-card { &__row { display: flex; justify-content: space-between; align-items: center; } &__title { font-size: 28rpx; font-weight: bold; } &__link { font-size: 26rpx; color: $brand-color; } &__hint { font-size: 22rpx; color: $text-color-placeholder; margin-top: 8rpx; display: block; } }
// 开发票（Task 11）：已申请只读条 + 底部弹层
.invoice-card {
  background: $surface; border-radius: $radius-md; padding: 24rpx 30rpx; margin: 20rpx;
  &__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12rpx; }
  &__tag { font-size: 26rpx; color: $brand-color; font-weight: bold; }
  &__copy { font-size: 24rpx; color: $text-color-secondary; }
  &__row { display: flex; justify-content: space-between; gap: 24rpx; padding: 8rpx 0; }
  &__label { font-size: 24rpx; color: $text-color-placeholder; flex-shrink: 0; }
  &__val { font-size: 24rpx; color: $text-color; text-align: right; word-break: break-all; }
  &__hint { display: block; font-size: 22rpx; color: $text-color-placeholder; margin-top: 12rpx; }
}
.invoice-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: flex-end; z-index: 9; }
.invoice-sheet { width: 100%; background: $surface; border-radius: 24rpx 24rpx 0 0; padding: 40rpx 30rpx calc(40rpx + env(safe-area-inset-bottom)); &__title { font-size: 32rpx; font-weight: bold; display: block; margin-bottom: 24rpx; } &__opt { border: 1rpx solid $border-color; border-radius: $radius-md; padding: 20rpx; margin-bottom: 16rpx; font-size: 26rpx; &.on { border-color: $brand-color; color: $brand-color; background: #fff3e6; } } &__ipt { border-bottom: 1rpx solid $border-color; height: 80rpx; font-size: 28rpx; margin: 16rpx 0 8rpx; } &__manage { display: block; text-align: right; font-size: 24rpx; color: $brand-color; padding: 8rpx 0 24rpx; } &__btn { background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; } }
.action-btn { flex: 1; min-width: 200rpx; height: 80rpx; font-size: 28rpx; border-radius: $radius-md; border: none; display: flex; align-items: center; justify-content: center; &--primary { background: $brand-color; color: #fff; } &--ghost { background: $surface; color: $text-color-placeholder; border: 1rpx solid $border-color; } }
.r2-hint { font-size: 26rpx; color: $text-color-secondary; display: block; margin-top: 8rpx; }
.r2-actions { display: flex; gap: 16rpx; margin-top: 16rpx; }
/* 配送卡：承运方 / 平台单号 / 骑手电话 / 校园交接点 */
.delivery-card {
  .kv { display: flex; justify-content: space-between; gap: 24rpx; padding: 10rpx 0; }
  .k { font-size: 24rpx; color: $text-color-placeholder; flex-shrink: 0; }
  .v { font-size: 24rpx; color: $text-color; text-align: right; word-break: break-all; }
  .v.link { color: $brand-color; }
  .v.code { font-weight: bold; letter-spacing: 4rpx; color: $brand-color; }
  .kv-hint { display: block; font-size: 22rpx; color: $text-color-placeholder; padding-top: 4rpx; }
}
.code-text { font-size: 48rpx; font-weight: bold; letter-spacing: 8rpx; text-align: center; display: block; padding: 16rpx 0; color: $text-color; }
/* 再来一单确认弹层 */
.reorder-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); z-index: 1000; display: flex; align-items: flex-end; }
.reorder-sheet { width: 100%; max-height: 78vh; background: #fff; border-radius: 28rpx 28rpx 0 0; padding: 28rpx 28rpx calc(28rpx + env(safe-area-inset-bottom)); display: flex; flex-direction: column; }
.reorder-head { display: flex; align-items: center; justify-content: space-between; }
.reorder-title { font-size: 32rpx; font-weight: 600; color: $text-color; }
.reorder-close { font-size: 30rpx; color: $text-color-secondary; padding: 8rpx; }
.reorder-loading { padding: 60rpx 0; text-align: center; font-size: 26rpx; color: $text-color-secondary; }
.reorder-shop { font-size: 26rpx; color: $text-color-secondary; margin: 12rpx 0 16rpx; display: block; }
.reorder-list { max-height: 46vh; }
.reorder-line { display: flex; align-items: center; gap: 16rpx; padding: 14rpx 0; border-bottom: 1rpx solid #f2f2f5; }
.reorder-line.off { opacity: .45; }
.reorder-img { width: 80rpx; height: 80rpx; border-radius: 10rpx; flex-shrink: 0; background: #f4f4f6; }
.reorder-img--ph { background: #f4f4f6; }
.reorder-info { flex: 1; min-width: 0; }
.reorder-name { font-size: 26rpx; color: $text-color; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reorder-off { font-size: 22rpx; color: #d4380d; margin-top: 4rpx; display: block; }
.reorder-qty { font-size: 24rpx; color: $text-color-secondary; }
.reorder-hint { font-size: 22rpx; color: #c47b00; background: #fff7e6; border-radius: 10rpx; padding: 12rpx 16rpx; margin-top: 16rpx; }
.reorder-btn { margin-top: 24rpx; height: 88rpx; line-height: 88rpx; border-radius: 999rpx; background: $brand-color; color: #fff; font-size: 30rpx; font-weight: 600; }
.reorder-btn[disabled] { opacity: .5; }
/* 改址卡片 + 方案 A 居中弹层 */
.addr-change {
  &__head { display: flex; align-items: center; justify-content: space-between; }
  &__btn { font-size: 26rpx; color: $brand-color; padding: 8rpx 0 8rpx 24rpx; }
  &__cur { display: block; font-size: 26rpx; color: $text-color; margin-top: 8rpx; }
  &__hint { display: block; font-size: 22rpx; color: $text-color-placeholder; margin-top: 6rpx; }
}
.addr-diff {
  margin-top: 14rpx; padding: 18rpx 20rpx; border-radius: $radius-md;
  background: #f7f8fa; border-left: 6rpx solid $border-color;
  &.collect { background: #fff7ec; border-left-color: #f59e0b; }
  &.refund { background: #eef6ff; border-left-color: #2f7cf6; }
  &.done { background: #f2fbf5; border-left-color: #16a34a; }
  &__top { display: flex; align-items: center; justify-content: space-between; }
  &__label { font-size: 26rpx; font-weight: 600; color: $text-color; }
  &__tag { font-size: 20rpx; color: $text-color-secondary; background: #fff; border-radius: 999rpx; padding: 2rpx 14rpx; }
  &__meta { display: block; font-size: 22rpx; color: $text-color-secondary; margin-top: 6rpx; }
  &__note { display: block; font-size: 20rpx; color: $text-color-placeholder; margin-top: 6rpx; }
}
.addr-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 0 48rpx; }
.addr-dialog { width: 100%; max-height: 76vh; background: #fff; border-radius: 24rpx; padding: 36rpx 32rpx; display: flex; flex-direction: column; }
.addr-dialog__title { display: block; font-size: 32rpx; font-weight: 600; color: $text-color; text-align: center; margin-bottom: 20rpx; }
.addr-dialog__body { max-height: 50vh; }
.addr-label { display: block; font-size: 24rpx; color: $text-color-secondary; margin: 18rpx 0 10rpx; }
.addr-chips { display: flex; flex-wrap: wrap; gap: 14rpx; }
.addr-chip {
  display: flex; align-items: center; gap: 8rpx; padding: 12rpx 22rpx;
  border: 1rpx solid $border-color; border-radius: $radius-md;
  font-size: 24rpx; color: $text-color;
  &.on { border-color: $brand-color; color: $brand-color; background: #fff3e6; }
}
.addr-chip__fee { font-size: 22rpx; color: $text-color-placeholder; }
.addr-chip.on .addr-chip__fee { color: $brand-color; }
.addr-empty { display: block; font-size: 24rpx; color: $text-color-placeholder; padding: 12rpx 0; }
.addr-input { height: 80rpx; border: 1rpx solid $border-color; border-radius: $radius-md; padding: 0 20rpx; font-size: 26rpx; }
.addr-note { display: block; font-size: 22rpx; color: #c47b00; background: #fff7e6; border-radius: 10rpx; padding: 12rpx 16rpx; margin-top: 20rpx; }
.addr-dialog__actions { display: flex; gap: 20rpx; margin-top: 28rpx; }
.addr-btn { flex: 1; height: 80rpx; line-height: 80rpx; border-radius: $radius-md; font-size: 28rpx; border: none; }
.addr-btn--primary { background: $brand-color; color: #fff; }
.addr-btn--ghost { background: $surface; color: $text-color-secondary; border: 1rpx solid $border-color; }
.addr-btn[disabled] { opacity: .5; }
.addr-result { display: block; font-size: 30rpx; color: $text-color; text-align: center; padding: 24rpx 0 8rpx; }
</style>
