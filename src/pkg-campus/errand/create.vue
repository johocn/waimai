<template>
    <view class="page" :class="{ dark: theme === 'dark' }">
        <view class="nav-row">
            <text class="nav-link" @tap="goList">{{ $t('errandCreate.myOrders') }} ›</text>
        </view>
        <view class="section">
            <text class="section__title">{{ $t('errandCreate.sectionKind') }}</text>
            <view class="kind-row">
                <view v-for="k in ERRAND_KINDS" :key="k.value" class="kind-chip"
                    :class="{ on: form.kind === k.value }" @tap="form.kind = k.value">
                    <text>{{ $t(KIND_KEYS[k.value] || 'errandCreate.kindOther') }}</text>
                </view>
            </view>
        </view>
        <view class="section">
            <text class="section__title">{{ $t('errandCreate.labelFrom') }}</text>
            <input class="ipt" v-model="form.fromText" :placeholder="$t('errandCreate.phFrom')" />
            <text class="section__title">{{ $t('errandCreate.labelTo') }}</text>
            <input class="ipt" v-model="form.toText" :placeholder="$t('errandCreate.phTo')" />
            <text class="section__title">{{ $t('errandCreate.labelNote') }}</text>
            <input class="ipt" v-model="form.note" :placeholder="$t('errandCreate.phNote')" />
        </view>
        <view class="section" v-if="prefill.relayFrom">
            <text class="relay-badge">{{ $t('errandCreate.relayBadge').replace('{code}', prefill.relayFrom) }}</text>
        </view>
        <view class="section">
            <view class="fee-row">
                <text>{{ $t('errandCreate.feeBase') }}</text><text class="fee">¥{{ (baseFee / 100).toFixed(2) }}</text>
            </view>
            <view class="fee-row">
                <text>{{ $t('errandCreate.feeTip') }}</text><text class="fee">¥{{ (form.tip / 100).toFixed(2) }}</text>
            </view>
            <slider :min="0" :max="TIP_STEPS.length - 1" :step="1" :value="tipIdx"
                @change="(e: any) => (tipIdx = Number(e.detail.value))" show-value />
            <text class="tip-hint">{{ $t('errandCreate.tipHint') }}</text>
        </view>
        <button class="submit-btn" :disabled="submitting || !payloadOk" @tap="submit">
            {{ submitting ? $t('errandCreate.submitting') : `¥${((baseFee + form.tip) / 100).toFixed(2)} ${$t('errandCreate.submitNow')}` }}
        </button>
    </view>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { addItemToOrder } from '../../api/mutations/cart';
import { capacityCheck, fetchErrandVariant, setErrandInfo } from '../../api/mutations/campus';
import { getEligibleShippingMethods, getOrderByCode } from '../../api/queries/order';
import { getEligiblePaymentMethods } from '../../api/queries/user';
import { addPaymentToOrder, setOrderShippingMethod, transitionOrderToState, cancelPayment } from '../../api/mutations/checkout';
import { handlePayment, type PaymentMethod } from '../../composables/usePayment';
import { theme, initTheme } from '../../utils/theme';
import { buildErrandPayload, ERRAND_KINDS, parseRelayPrefill, TIP_STEPS } from '../../utils/errand';
import { useLocaleStore } from '../../stores/locale';

const locale = useLocaleStore();

// 服务类型值 → i18n 键（label 展示在渲染处走 $t）
const KIND_KEYS: Record<string, string> = {
    pickup_express: 'errandCreate.kindPickupExpress',
    bring_food: 'errandCreate.kindBringFood',
    buy: 'errandCreate.kindBuy',
    other: 'errandCreate.kindOther',
};

const form = ref({ kind: 'pickup_express', fromText: '', toText: '', note: '', tip: 0 });
const tipIdx = ref(0);
const baseFee = ref(200);
const prefill = ref({ relayFrom: '', fromText: '', toText: '', buildingId: '' }); // R2 接力预填
const variantId = ref('');
const submitting = ref(false);

function goList() { uni.navigateTo({ url: '/pkg-campus/errand/list' }); }

onMounted(async () => {
    initTheme();
    // R2 接力预填：order-detail 跳入 /pkg-campus/errand/create?from=R2&code=原单号&a=…&b=…&buildingId=…
    const pages = getCurrentPages(); const page = pages[pages.length - 1] as any;
    prefill.value = parseRelayPrefill(page?.options ?? {});
    if (prefill.value.fromText) form.value.fromText = prefill.value.fromText;
    if (prefill.value.toText) form.value.toText = prefill.value.toText;
    try {
        const res: any = await fetchErrandVariant();
        variantId.value = String(res.variantId);
        baseFee.value = res.errandBaseFee ?? 200;
    } catch (e) { uni.showToast({ title: locale.t('errandCreate.initFail'), icon: 'none' }); }
});

// 小费档位联动（滑杆索引 → 分）
watch(tipIdx, (i) => { form.value.tip = TIP_STEPS[i] ?? 0; });

const payloadOk = computed(() =>
    !!buildErrandPayload({ ...form.value, errandFrom: prefill.value.relayFrom, buildingId: prefill.value.buildingId }));

async function submit() {
    if (submitting.value) return;
    const payload = buildErrandPayload({ ...form.value, errandFrom: prefill.value.relayFrom, buildingId: prefill.value.buildingId });
    if (!payload) { uni.showToast({ title: locale.t('errandCreate.incomplete'), icon: 'none' }); return; }
    submitting.value = true;
    try {
        // T0 预检：紧张提示但不阻断
        try {
            const c: any = await capacityCheck();
            if (c?.ridersOnline === 0) uni.showToast({ title: locale.t('errandCreate.capacityTight'), icon: 'none' });
        } catch (e) { /* 预检失败不阻断 */ }
        if (!variantId.value) throw new Error(locale.t('errandCreate.variantNotReady'));
        await addItemToOrder(variantId.value, 1);
        await setErrandInfo(payload);
        // 选运费：setErrandInfo 写 fulfillmentRoute=R5 后，campus-errand calculator 按 errandBaseFee 出价
        const eligibleRes: any = await getEligibleShippingMethods();
        const all: any[] = eligibleRes?.eligibleShippingMethods || [];
        const campusMethod = all.find((m: any) => m.code?.startsWith('campus-errand'));
        if (campusMethod) await setOrderShippingMethod([campusMethod.id]);
        await transitionOrderToState('ArrangingPayment');
        // 支付：与 checkout.vue submitOrder/payCurrentOrder 同款
        const pmRes: any = await getEligiblePaymentMethods();
        const pms: any[] = (pmRes?.eligiblePaymentMethods ?? []).filter((p: any) => p.isEligible);
        // 小程序优先 wechatpay；H5（yourbao 站专属）必须用本站公众号 JSAPI PM
        //（wechatpay 为小程序专用，wechatpay-youshop-jsapi 为他站公众号）
        // #ifdef H5
        const method = pms.find((p: any) => p.code === 'wechatpay-yourbao-h5')?.code
            || pms.find((p: any) => p.code.includes('wechatpay') && p.code !== 'wechatpay' && p.code !== 'wechatpay-youshop-jsapi')?.code
            || pms[0]?.code;
        // #endif
        // #ifndef H5
        const method = pms.find((p: any) => p.code === 'wechatpay')?.code || pms[0]?.code;
        // #endif
        if (!method) throw new Error(locale.t('errandCreate.noPaymentMethod'));
        const metadata: Record<string, any> = {};
        if (method === 'wechatpay') {
            const openid = uni.getStorageSync('auth_openid');
            if (openid) metadata.openid = openid;
        }
        const payRes: any = await addPaymentToOrder(method, metadata);
        const po = payRes?.addPaymentToOrder;
        // PM 拒单返回 ErrorResult——透出后端错误信息
        if (po?.errorCode) throw new Error(po.message || locale.t('errandCreate.payFail'));
        const lastPayment = po?.payments?.[po.payments.length - 1];
        const pub = lastPayment?.metadata?.public || lastPayment?.metadata || {};
        // JSAPI：PaymentAuthorized ≠ 已支付，须调起收银台由微信回调结算，不能提前跳 success
        if (po?.state === 'PaymentAuthorized' && pub.payType === 'jsapi') {
            const result = await handlePayment(method as PaymentMethod, { ...lastPayment, orderCode: po?.code, orderState: po?.state });
            if (!result.success) {
                try { await cancelPayment(lastPayment.id); } catch (e) { console.warn('[errand] cancelPayment failed', e); }
                uni.showToast({ title: result.message || locale.t('errandCreate.payIncomplete'), icon: 'none' });
                return;
            }
            // 轻量轮询回调结果（2 次 × 1.5s）：未确认 → pending 页提示等待，不伪装成功
            let settled = false;
            for (let i = 0; i < 2; i++) {
                await new Promise(r => setTimeout(r, 1500));
                try {
                    const o: any = await getOrderByCode(po.code);
                    if (o?.orderByCode?.state === 'PaymentSettled') { settled = true; break; }
                } catch (e) { console.warn('[errand] poll order failed', e); }
            }
            uni.redirectTo({ url: `/pkg-order/pages/pay-result?code=${encodeURIComponent(po.code)}&status=${settled ? 'success' : 'pending'}` });
            return;
        }
        if (po?.state === 'PaymentSettled' || po?.state === 'PaymentAuthorized') {
            uni.redirectTo({ url: `/pkg-order/pages/pay-result?code=${encodeURIComponent(po.code)}&status=success` });
            return;
        }
        const result = await handlePayment(method as PaymentMethod, { ...lastPayment, orderCode: po?.code, orderState: po?.state });
        if (!result.success) { uni.showToast({ title: result.message || locale.t('errandCreate.payIncomplete'), icon: 'none' }); return; }
        uni.redirectTo({ url: `/pkg-order/pages/pay-result?code=${encodeURIComponent(po.code)}&status=success` });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || e?.message || locale.t('errandCreate.submitFail'), icon: 'none' });
    } finally {
        submitting.value = false;
    }
}
</script>
<style lang="scss" scoped>
/* ── 双主题 token（亮色默认，.dark 覆盖；沿用首页「橙头」方案） ── */
.page {
    --w-bg: #f5f5f5;
    --w-surface: #ffffff;
    --w-surface-muted: #f0f0f0;
    --w-text: #1a1a1a;
    --w-text-muted: #999999;
    --w-border: #ececec;
    --w-brand-soft: #fff3e6;
    --w-brand-text: #ff6600;

    background: var(--w-bg);
    min-height: 100vh;
    padding: 20rpx 20rpx 180rpx;
    box-sizing: border-box;
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
}
.nav-row { display: flex; justify-content: flex-end; margin-bottom: 16rpx; }
.nav-link { font-size: 26rpx; color: var(--w-brand-text); padding: 8rpx; }
.section { background: var(--w-surface); border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx; }
.section__title { display: block; font-size: 26rpx; font-weight: 600; color: var(--w-text); margin: 16rpx 0 12rpx; &:first-child { margin-top: 0; } }
.kind-row { display: flex; flex-wrap: wrap; gap: 16rpx; }
.kind-chip { padding: 12rpx 28rpx; border-radius: 999rpx; background: var(--w-surface-muted); color: var(--w-text-muted); font-size: 26rpx; border: 1rpx solid transparent; &.on { background: var(--w-brand-soft); color: var(--w-brand-text); border-color: var(--w-brand-text); font-weight: 600; } }
.ipt { width: 100%; height: 80rpx; background: var(--w-surface-muted); border-radius: $radius-sm; padding: 0 20rpx; font-size: 26rpx; color: var(--w-text); margin-bottom: 8rpx; box-sizing: border-box; }
.relay-badge { display: inline-block; font-size: 24rpx; color: var(--w-brand-text); background: var(--w-brand-soft); border-radius: $radius-sm; padding: 8rpx 16rpx; }
.fee-row { display: flex; justify-content: space-between; align-items: center; font-size: 26rpx; color: var(--w-text); margin-bottom: 8rpx; .fee { color: var(--w-brand-text); font-weight: 600; } }
.tip-hint { display: block; font-size: 22rpx; color: var(--w-text-muted); margin-top: 8rpx; }
.submit-btn { position: fixed; left: 20rpx; right: 20rpx; bottom: 40rpx; height: 88rpx; line-height: 88rpx; background: $brand-color; color: #fff; font-size: 30rpx; border-radius: $radius-md; border: none; &[disabled] { opacity: 0.5; } }
</style>
