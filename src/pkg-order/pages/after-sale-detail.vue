<template>
  <view class="as-detail" v-if="req">
    <!-- 状态卡 -->
    <view class="status-card">
      <text class="status-card__state">{{ stateLabel }}</text>
      <text class="status-card__hint">{{ stateHint }}</text>
      <text class="status-card__amount" v-if="req.state === 'Refunded'">¥{{ ((req.actualRefundAmount ?? req.refundAmount) / 100).toFixed(2) }} {{ $t('afterSaleDetail.refundedText') }}</text>
    </view>

    <!-- 四段步骤条：提交申请 → 商家审核 → 平台仲裁 → 完成 -->
    <view class="section">
      <view class="steps">
        <view v-for="(s, i) in steps" :key="s.key" class="step" :class="{ 'step--done': s.done, 'step--active': i === activeStep }">
          <view class="step__dot"><text v-if="s.done">✓</text></view>
          <text class="step__label">{{ s.label }}</text>
        </view>
      </view>
    </view>

    <!-- 被拒理由 / 申诉 -->
    <view class="section reject" v-if="req.state === 'Rejected' || (req.state === 'Closed' && req.rejectReason)">
      <text class="section__title">{{ $t('afterSaleDetail.rejectTitle') }}</text>
      <text class="reject__text">{{ req.rejectReason }}</text>
      <template v-if="req.state === 'Rejected'">
        <textarea v-if="appealOpen" class="reject__input" v-model="appealNote" :placeholder="$t('afterSaleDetail.appealPh')" maxlength="200" />
        <button v-if="!appealOpen" class="btn ghost" @tap="appealOpen = true">{{ $t('afterSaleDetail.appealOpen') }}</button>
        <button v-else class="btn" :disabled="appealing" @tap="doAppeal">{{ appealing ? $t('afterSaleDetail.submitting') : $t('afterSaleDetail.appealSubmit') }}</button>
      </template>
    </view>

    <!-- 退款信息 -->
    <view class="section">
      <text class="section__title">{{ $t('afterSaleDetail.refundInfoTitle') }}</text>
      <view class="kv"><text>{{ $t('afterSaleDetail.applyNo') }}</text><text>{{ $t('afterSaleDetail.asNo').replace('{c}', String(req.id)) }}</text></view>
      <view class="kv"><text>{{ $t('afterSaleDetail.reasonLabel') }}</text><text>{{ req.reason }}</text></view>
      <view class="kv"><text>{{ $t('afterSaleDetail.expectRefund') }}</text><text class="money">¥{{ (req.refundAmount / 100).toFixed(2) }}</text></view>
      <view class="kv" v-if="req.refundedAt"><text>{{ $t('afterSaleDetail.refundTime') }}</text><text>{{ fmtTime(req.refundedAt) }}</text></view>
      <view class="kv" v-if="req.refundTransactionId"><text>{{ $t('afterSaleDetail.refundNo') }}</text><text>{{ req.refundTransactionId }}</text></view>
      <view class="kv" v-if="req.refundError"><text>{{ $t('afterSaleDetail.failReason') }}</text><text class="err">{{ req.refundError }}</text></view>
      <text class="desc" v-if="req.description">{{ req.description }}</text>
      <view class="evidence" v-if="req.evidenceImages?.length">
        <image v-for="img in req.evidenceImages" :key="img" :src="img" mode="aspectFill" class="evidence__img" @tap="preview(img)" />
      </view>
    </view>

    <!-- 留言卡 -->
    <view class="section">
      <text class="section__title">{{ $t('afterSaleDetail.msgTitle') }}</text>
      <view v-if="!messages.length" class="msg-empty">{{ $t('afterSaleDetail.msgEmpty') }}</view>
      <view v-for="m in messages" :key="m.id" class="msg" :class="{ 'msg--mine': m.senderType === 'customer' }">
        <text class="msg__name">{{ m.senderType === 'customer' ? $t('afterSaleDetail.msgMine') : m.senderName }}</text>
        <text class="msg__content">{{ m.content }}</text>
        <text class="msg__time">{{ fmtTime(m.createdAt) }}</text>
      </view>
      <view class="msg-input" v-if="req.state !== 'Closed'">
        <input v-model="msgContent" :placeholder="$t('afterSaleDetail.msgPh')" confirm-type="send" @confirm="sendMsg" />
        <button class="btn small" :disabled="msgSending || !msgContent" @tap="sendMsg">{{ $t('afterSaleDetail.send') }}</button>
      </view>
      <text v-else class="msg-closed">{{ $t('afterSaleDetail.msgClosed') }}</text>
    </view>

    <!-- 操作区 -->
    <view class="footbar" v-if="req.state === 'Pending'">
      <button class="btn ghost" @tap="doCancel">{{ $t('afterSaleDetail.cancel') }}</button>
    </view>
  </view>
  <LoadingSkeleton v-else type="card" :count="2" />
</template>
<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
    fetchAfterSaleDetail, fetchAfterSaleMessages, cancelAfterSale,
    appealAfterSale, addAfterSaleMessage,
} from '../../api/queries/afterSale';
import type { AfterSaleRequest } from '../../api/queries/afterSale';
import { useLocaleStore } from '../../stores/locale';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';

const locale = useLocaleStore();
const req = ref<AfterSaleRequest | null>(null);
const messages = ref<any[]>([]);
const appealOpen = ref(false);
const appealNote = ref('');
const appealing = ref(false);
const msgContent = ref('');
const msgSending = ref(false);

const STATE_MAP: Record<string, { labelKey: string; hintKey: string }> = {
    Pending:      { labelKey: 'stPending', hintKey: 'hintPending' },
    Approved:     { labelKey: 'stApproved', hintKey: 'hintApproved' },
    Received:     { labelKey: 'stReceived', hintKey: 'hintReceived' },
    Refunded:     { labelKey: 'stRefunded', hintKey: 'hintRefunded' },
    RefundFailed: { labelKey: 'stRefundFailed', hintKey: 'hintRefundFailed' },
    Rejected:     { labelKey: 'stRejected', hintKey: 'hintRejected' },
    Appealed:     { labelKey: 'stAppealed', hintKey: 'hintAppealed' },
    Closed:       { labelKey: 'stClosed', hintKey: 'hintClosed' },
};
const stateLabel = computed(() => {
    const m = STATE_MAP[req.value?.state ?? ''];
    return m ? locale.t(`afterSaleDetail.${m.labelKey}`) : req.value?.state ?? '';
});
const stateHint = computed(() => {
    const m = STATE_MAP[req.value?.state ?? ''];
    return m ? locale.t(`afterSaleDetail.${m.hintKey}`) : '';
});

// 四段步骤条：提交申请 → 商家审核 → 平台仲裁 → 完成
const steps = computed(() => {
    const st = req.value?.state ?? '';
    const mk = (k: string, done: boolean) => ({
        key: k,
        label: locale.t(`afterSaleDetail.${k === 'submit' ? 'stSubmit' : k === 'review' ? 'stReview' : k === 'arbitrate' ? 'stArbitrate' : 'stFinish'}`),
        done,
    });
    const list = [
        mk('submit', true),
        mk('review', ['Approved', 'Received', 'Refunded', 'RefundFailed', 'Rejected', 'Appealed', 'Closed'].includes(st)),
        mk('arbitrate', ['Refunded', 'Closed'].includes(st) || st === 'Appealed'),
        mk('finish', ['Refunded', 'Closed'].includes(st)),
    ];
    return list;
});
const activeStep = computed(() => {
    const idx = steps.value.findIndex(s => !s.done);
    return idx === -1 ? steps.value.length - 1 : idx;
});

let timer: ReturnType<typeof setInterval> | null = null;
const TERMINAL = ['Refunded', 'Closed', 'Rejected'];
let pageId = '';

onLoad(async (options: any) => {
    if (!options?.id) return;
    pageId = String(options.id);
    await refresh();
    timer = setInterval(refresh, 8000); // 非终态 8s 轮询
});
onUnmounted(() => { if (timer) clearInterval(timer); });

async function refresh() {
    try {
        req.value = await fetchAfterSaleDetail(pageId);
        if (TERMINAL.includes(req.value?.state ?? '')) { if (timer) { clearInterval(timer); timer = null; } }
        messages.value = await fetchAfterSaleMessages(String(req.value!.id)).catch(() => messages.value);
    } catch (e) { /* 网络抖动静默重试 */ }
}

function fmtTime(t?: string | null) { return t ? new Date(t).toLocaleString('zh-CN') : ''; }
function preview(url: string) { uni.previewImage({ urls: [url] }); }

function doCancel() {
    uni.showModal({
        title: locale.t('afterSaleDetail.cancel'), content: locale.t('afterSaleDetail.cancelConfirm'),
        success: async (r: any) => {
            if (!r.confirm) return;
            try {
                req.value = await cancelAfterSale(String(req.value!.id));
                uni.showToast({ title: locale.t('afterSaleDetail.cancelled'), icon: 'success' });
            } catch (e: any) {
                uni.showToast({ title: e?.response?.errors?.[0]?.message || e?.message || locale.t('afterSaleDetail.cancelFail'), icon: 'none' });
            }
        },
    });
}
async function doAppeal() {
    if (!appealNote.value.trim()) return uni.showToast({ title: locale.t('afterSaleDetail.appealNoteRequired'), icon: 'none' });
    appealing.value = true;
    try {
        req.value = await appealAfterSale(String(req.value!.id), appealNote.value.trim());
        appealOpen.value = false;
        uni.showToast({ title: locale.t('afterSaleDetail.appealed'), icon: 'success' });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || e?.message || locale.t('afterSaleDetail.appealFail'), icon: 'none' });
    } finally { appealing.value = false; }
}
async function sendMsg() {
    if (!msgContent.value.trim()) return;
    msgSending.value = true;
    try {
        const m = await addAfterSaleMessage(String(req.value!.id), msgContent.value.trim());
        messages.value.push(m);
        msgContent.value = '';
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || e?.message || locale.t('afterSaleDetail.sendFail'), icon: 'none' });
    } finally { msgSending.value = false; }
}
</script>
<style lang="scss" scoped>
.as-detail { padding: 20rpx 20rpx 160rpx; }
.status-card { background: linear-gradient(135deg, $brand-color, #ff9966); border-radius: $radius-md; padding: 40rpx 30rpx; color: #fff; margin-bottom: 20rpx;
  &__state { font-size: 36rpx; font-weight: bold; display: block; }
  &__hint { font-size: 24rpx; opacity: .85; margin-top: 8rpx; display: block; }
  &__amount { font-size: 30rpx; margin-top: 12rpx; display: block; font-weight: bold; } }
.section { background: $surface; border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx;
  &__title { font-size: 28rpx; font-weight: bold; display: block; margin-bottom: 16rpx; } }
.steps { display: flex;
  .step { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx;
    &__dot { width: 40rpx; height: 40rpx; border-radius: 50%; background: #eee; color: #fff; font-size: 22rpx; display: flex; align-items: center; justify-content: center; }
    &__label { font-size: 22rpx; color: $text-color-placeholder; }
    &--done .step__dot { background: $brand-color; }
    &--done .step__label { color: $text-color; }
    &--active .step__dot { background: $brand-color; box-shadow: 0 0 0 8rpx rgba(255,102,0,.15); }
    &--active .step__label { color: $brand-color; font-weight: bold; } } }
.reject__text { font-size: 26rpx; color: #e02020; display: block; margin-bottom: 16rpx; }
.reject__input { width: 100%; box-sizing: border-box; min-height: 120rpx; background: $bg-color; border-radius: $radius-md; padding: 16rpx; font-size: 26rpx; margin-bottom: 16rpx; }
.kv { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 26rpx; color: $text-color-secondary;
  .money { color: $price-color; font-weight: bold; }
  .err { color: #e02020; } }
.desc { font-size: 24rpx; color: $text-color-secondary; display: block; margin-top: 8rpx; white-space: pre-wrap; }
.evidence { display: flex; gap: 16rpx; flex-wrap: wrap; margin-top: 16rpx;
  &__img { width: 140rpx; height: 140rpx; border-radius: $radius-md; } }
.msg { margin-bottom: 16rpx; display: flex; flex-direction: column; gap: 4rpx; align-items: flex-start;
  &--mine { align-items: flex-end; }
  &__name { font-size: 20rpx; color: $text-color-placeholder; }
  &__content { font-size: 26rpx; background: $bg-color; border-radius: 12rpx; padding: 12rpx 20rpx; max-width: 80%; }
  &--mine .msg__content { background: #fff7f2; }
  &__time { font-size: 20rpx; color: $text-color-placeholder; }
  &-empty { font-size: 24rpx; color: $text-color-placeholder; }
  &-closed { font-size: 22rpx; color: $text-color-placeholder; } }
.msg-input { display: flex; gap: 16rpx; margin-top: 8rpx;
  input { flex: 1; background: $bg-color; border-radius: 999rpx; padding: 12rpx 24rpx; font-size: 26rpx; } }
.btn { background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 28rpx; margin-top: 8rpx;
  &.ghost { background: $surface; color: $brand-color; border: 1rpx solid $brand-color; }
  &.small { margin-top: 0; font-size: 26rpx; padding: 0 28rpx; }
  &:disabled { opacity: .5; } }
.footbar { position: fixed; left: 0; right: 0; bottom: 0; padding: 16rpx 20rpx calc(16rpx + env(safe-area-inset-bottom)); background: $surface; }
</style>
