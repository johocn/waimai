<template>
  <view class="pay-result">
    <view class="pay-result__icon">
      <text v-if="status === 'success'" style="font-size: 120rpx;">✅</text>
      <text v-else-if="status === 'pending'" style="font-size: 120rpx;">⏳</text>
      <text v-else-if="status === 'unpaid'" style="font-size: 120rpx;">⚠️</text>
      <text v-else style="font-size: 120rpx;">❌</text>
    </view>
    <text class="pay-result__title">{{ statusText }}</text>
    <text v-if="statusHint" class="pay-result__hint">{{ statusHint }}</text>
    <text v-if="orderCodes.length === 1" class="pay-result__code">{{ $t('payResult.orderNo').replace('{c}', orderCodes[0]) }}</text>
    <view v-else class="pay-result__codes">
      <text class="pay-result__codes-title">{{ $t('payResult.orderCount').replace('{n}', String(orderCodes.length)) }}</text>
      <view v-for="code in orderCodes" :key="code" class="pay-result__code-item">
        <text>{{ $t('payResult.orderNo').replace('{c}', code) }}</text>
        <text class="pay-result__code-link" @click="viewOrder(code)">{{ $t('payResult.view') }}</text>
      </view>
    </view>
    <view class="pay-result__actions">
      <button v-if="status === 'unpaid' || status === 'fail'" class="btn-primary" :disabled="paying" @click="rePay">{{ paying ? $t('payResult.repaying') : $t('payResult.rePay') }}</button>
      <button v-else class="btn-primary" @click="viewOrder(orderCodes[0] || '')">{{ $t('payResult.viewOrder') }}</button>
      <button class="btn-secondary" :disabled="checking" @click="refreshStatus(true)">{{ checking ? $t('payResult.refreshing') : $t('payResult.refresh') }}</button>
      <button v-if="orderCodes.length" class="btn-secondary" @click="shareOrder">{{ $t('payResult.share') }}</button>
      <button class="btn-secondary" @click="goHome">{{ $t('payResult.continueShopping') }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { useCartStore } from '../../stores/cart';
import { useLocaleStore } from '../../stores/locale';
import { useTenantStore } from '../../stores/tenant';
import { addItemToOrder } from '../../api/mutations/cart';
import { getOrderByCode } from '../../api/queries/order';
import { resumePay } from '../../utils/resume-pay';
import { classifyPayOutcome } from '../../utils/pay-status';

const cart = useCartStore();
const locale = useLocaleStore();
const tenant = useTenantStore();

onShow(async () => {
    const pending = [...cart.pendingLines];
    if (pending.length === 0) return;
    // 进入本页代表本次结算已结束：未勾选行（未购买）必须回填，不能丢弃
    for (const p of pending) {
        try {
            await addItemToOrder(p.variantId, p.quantity);
        } catch (e) {
            console.warn('[pay-result] restore pending line failed', p, e);
        }
    }
    cart.clearPendingLines();
});

type PayStatus = 'success' | 'pending' | 'unpaid' | 'fail';
const status = ref<PayStatus>('pending');
const orderCodes = ref<string[]>([]);
/** 结果页展示的真实订单（刷新/重付都以它为准，而不是 URL 参数） */
const firstOrder = ref<any>(null);
const checking = ref(false);
const paying = ref(false);
/** 订单所属店铺渠道（checkout 透传；缺省用当前租户渠道） */
const channelToken = ref('');

const statusText = computed(() => {
    switch (status.value) {
        case 'success': return locale.t('payResult.stSuccess');
        case 'pending': return locale.t('payResult.stPending');
        case 'unpaid': return locale.t('payResult.stUnpaid');
        default: return locale.t('payResult.stFail');
    }
});
const statusHint = computed(() => {
    if (status.value === 'pending') return locale.t('payResult.pendingHint');
    if (status.value === 'unpaid') return locale.t('payResult.unpaidHint');
    return '';
});

onLoad((query: any) => {
    // URL 参数只作为首屏兜底；进页面后必须再查一次订单真实状态
    const qs = String(query?.status || '');
    status.value = (['success', 'pending', 'unpaid', 'fail'].includes(qs) ? qs : 'pending') as PayStatus;
    channelToken.value = query?.token ? decodeURIComponent(String(query.token)) : '';
    if (channelToken.value) void tenant.switchTenant(channelToken.value);
    // 兼容单订单 code 参数 与 多订单 codes 参数（逗号分隔）
    const single = query?.code;
    const multi = query?.codes;
    if (single) {
        orderCodes.value = [single];
    } else if (multi) {
        orderCodes.value = String(multi).split(',').filter(Boolean);
    }
    void refreshStatus(false);
});

/**
 * 主动查询订单真实状态：
 * - 已结算/已履约 → 支付成功
 * - PaymentAuthorized → 处理中（微信回调延迟，稍后自动更新）
 * - 其余（ArrangingPayment/Cancelled/查询失败） → 未支付（可重新支付）
 */
async function refreshStatus(showToast: boolean) {
    if (checking.value || !orderCodes.value.length) return;
    checking.value = true;
    let fetched = 0;
    const states: string[] = [];
    for (const code of orderCodes.value) {
        try {
            const res: any = await getOrderByCode(code);
            const o = res?.orderByCode;
            if (!o) continue;
            fetched++;
            if (!firstOrder.value) firstOrder.value = o;
            states.push(String(o.state ?? ''));
        } catch (e) {
            console.warn('[pay-result] query order state failed', code, e);
        }
    }
    if (fetched > 0) {
        status.value = classifyPayOutcome(states);
        if (showToast) uni.showToast({ title: locale.t('payResult.refreshDone'), icon: 'none' });
    } else if (showToast) {
        uni.showToast({ title: locale.t('payResult.refreshFail'), icon: 'none' });
    }
    checking.value = false;
}

/** 未支付：直接复用订单续付流程（重新拉起收银台） */
async function rePay() {
    if (paying.value) return;
    const o = firstOrder.value;
    if (!o?.id) { viewOrder(orderCodes.value[0] || ''); return; }
    paying.value = true;
    uni.showLoading({ title: locale.t('payResult.repaying'), mask: true });
    try {
        const res = await resumePay({
            id: String(o.id),
            code: String(o.code || orderCodes.value[0] || ''),
            channelToken: channelToken.value || tenant.token,
            totalWithTax: Number(o.totalWithTax),
        });
        if (res.status === 'blocked') {
            uni.showModal({
                title: locale.t('payResult.rePayBlockedTitle'),
                content: locale.t('payResult.rePayBlocked').replace('{n}', String(res.cartCount ?? 0)),
                showCancel: false,
            });
            return;
        }
        if (res.status === 'fail') {
            uni.showToast({ title: res.message || locale.t('payResult.rePayFail'), icon: 'none' });
            return;
        }
        status.value = res.status === 'success' ? 'success' : 'pending';
        if (res.status === 'success') uni.showToast({ title: locale.t('payResult.stSuccess'), icon: 'success' });
        else void refreshStatus(false);
    } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('payResult.rePayFail'), icon: 'none' });
    } finally {
        uni.hideLoading();
        paying.value = false;
    }
}

function viewOrder(code: string) {
    if (!code) return;
    uni.redirectTo({ url: '/pkg-order/pages/order-detail?code=' + code });
}
function goHome() {
    uni.switchTab({ url: '/pages/home/index' });
}

// —— 分享订单：拉详情拼摘要文本复制到剪贴板（失败退化为订单号） ——
async function shareOrder() {
    const code = orderCodes.value[0] || '';
    if (!code) return;
    let text = '';
    try {
        const res: any = await getOrderByCode(code);
        const o = res?.orderByCode;
        if (o) {
            const items = (o.lines ?? [])
                .map((l: any) => `${l.productVariant?.name ?? ''} x${l.quantity}`)
                .filter((s: string) => !!s)
                .join('、');
            const rows = [
                locale.t('payResult.orderNo').replace('{c}', o.code),
                items ? locale.t('payResult.shareItems').replace('{s}', items) : '',
                locale.t('payResult.sharePaid').replace('{y}', (Number(o.totalWithTax) / 100).toFixed(2)),
                o.customFields?.deliverySlotText ? locale.t('payResult.shareSlot').replace('{s}', o.customFields.deliverySlotText) : '',
            ].filter(Boolean);
            text = `${locale.t('payResult.shareTitle')}\n${rows.join('\n')}`;
        }
    } catch { /* 查不到详情：退化分享订单号 */ }
    if (!text) {
        const codes = orderCodes.value.join('、');
        text = `${locale.t('payResult.shareTitle')}\n${locale.t('payResult.orderNo').replace('{c}', codes)}`;
    }
    uni.setClipboardData({
        data: text,
        success: () => uni.showToast({ title: locale.t('payResult.shareCopied'), icon: 'none' }),
    });
}
</script>

<style lang="scss" scoped>
.pay-result {
    min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx;
    &__icon { margin-bottom: 30rpx; }
    &__title { font-size: 36rpx; font-weight: bold; margin-bottom: 16rpx; }
    &__hint { font-size: 24rpx; color: $text-color-secondary; text-align: center; line-height: 1.6; margin-bottom: 24rpx; padding: 0 24rpx; }
    &__code { font-size: 26rpx; color: $text-color-secondary; margin-bottom: 60rpx; }
    &__codes { width: 100%; margin-bottom: 60rpx; }
    &__codes-title { display: block; font-size: 28rpx; font-weight: bold; margin-bottom: 16rpx; text-align: center; }
    &__code-item { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 20rpx; background: $bg-color; border-radius: $radius-md; margin-bottom: 12rpx; font-size: 26rpx; color: $text-color-secondary; }
    &__code-link { color: $brand-color; }
    &__actions { width: 100%; display: flex; flex-direction: column; gap: 20rpx; }
}
.btn-primary { background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; border: none; }
.btn-secondary { background: $surface; color: $text-color; border: 1rpx solid $border-color; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; }
</style>
