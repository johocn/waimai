<template>
  <view class="as-create" v-if="order">
    <!-- 退款方式切换 -->
    <view class="mode-tabs">
      <view class="mode-tab" :class="{ on: mode === 'order' }" @tap="mode = 'order'">整单退款</view>
      <view class="mode-tab" :class="{ on: mode === 'lines' }" @tap="mode = 'lines'">部分退款</view>
    </view>

    <!-- 商品清单（部分退款：勾选 + 数量步进） -->
    <view class="section" v-if="mode === 'lines'">
      <text class="section__title">选择退款商品</text>
      <view v-for="line in order.lines" :key="line.id" class="line">
        <view class="line__check" :class="{ on: checked[line.id] > 0 }" @tap="toggleLine(line)">
          <text v-if="checked[line.id] > 0">✓</text>
        </view>
        <VImage :src="line.featuredAsset?.preview || ''" width="120rpx" height="120rpx" />
        <view class="line__info">
          <text class="line__name">{{ line.productVariant?.name }}</text>
          <text class="line__price">¥{{ (line.unitPriceWithTax / 100).toFixed(2) }}</text>
        </view>
        <view class="stepper" v-if="checked[line.id] > 0">
          <view class="stepper__btn" @tap="stepQty(line, -1)">−</view>
          <text class="stepper__num">{{ checked[line.id] }}</text>
          <view class="stepper__btn" @tap="stepQty(line, 1)">＋</view>
        </view>
      </view>
    </view>

    <!-- 金额 -->
    <view class="section amount">
      <text class="section__title">预计退款金额</text>
      <text class="amount__num">¥{{ (refundAmount / 100).toFixed(2) }}</text>
      <text class="amount__tip">{{ mode === 'order' ? '整单退款（含配送费），提交后不可修改' : '按所选商品行自动计算，不可手填' }}</text>
    </view>

    <!-- 原因 -->
    <view class="section">
      <text class="section__title">售后原因</text>
      <view class="chips">
        <text
          v-for="r in REASONS" :key="r"
          class="chip" :class="{ on: reason === r }"
          @tap="reason = r"
        >{{ r }}</text>
      </view>
      <textarea class="desc" v-model="userDesc" placeholder="补充说明（选填）：如缺少的商品、损坏情况" maxlength="200" />
    </view>

    <!-- 凭证（部分退款必传 1-3 张；整单可选） -->
    <view class="section">
      <text class="section__title">凭证照片{{ mode === 'lines' ? '（必传 1-3 张）' : '（选填）' }}</text>
      <view class="evidence">
        <view v-for="(img, i) in evidence" :key="img" class="evidence__item">
          <image :src="img" mode="aspectFill" class="evidence__img" />
          <text class="evidence__del" @tap="evidence.splice(i, 1)">×</text>
        </view>
        <view v-if="evidence.length < 3" class="evidence__add" @tap="chooseEvidence">＋</view>
      </view>
    </view>

    <view class="notice">提交后商家将在 48 小时内处理；超时未处理将自动原路退回</view>
    <view class="footbar">
      <button class="submit" :disabled="submitting" @tap="submit">{{ submitting ? '提交中…' : '提交申请' }}</button>
    </view>
  </view>
  <LoadingSkeleton v-else type="card" :count="2" />
</template>
<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getOrderByCode } from '../../api/queries/order';
import { createAfterSale } from '../../api/queries/afterSale';
import { uploadCustomerAsset } from '../../api/mutations/upload';
import VImage from '../../components/VImage.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';

const REASONS = ['漏送', '错送', '少送', '餐损洒漏', '其他'];
const order = ref<any>(null);
const mode = ref<'order' | 'lines'>('order');
const checked = reactive<Record<string, number>>({});
const reason = ref('');
const userDesc = ref('');
const evidence = ref<string[]>([]);
const submitting = ref(false);

const refundAmount = computed(() => {
    if (!order.value) return 0;
    if (mode.value === 'order') return order.value.totalWithTax;
    return order.value.lines.reduce((s: number, l: any) => {
        const qty = checked[l.id] || 0;
        if (!qty) return s;
        // 按行实付均摊（proratedLinePrice 含行级优惠分摊），防整数溢出用 floor
        return s + Math.floor((l.proratedLinePrice * qty) / l.quantity);
    }, 0);
});

onLoad(async (options: any) => {
    if (!options?.code) return;
    try {
        const res: any = await getOrderByCode(options.code);
        order.value = res.orderByCode;
    } catch (e) {
        uni.showToast({ title: '订单加载失败', icon: 'none' });
    }
});

function toggleLine(line: any) {
    if (checked[line.id] > 0) checked[line.id] = 0;
    else checked[line.id] = line.quantity;
}
function stepQty(line: any, d: number) {
    const next = (checked[line.id] || 0) + d;
    checked[line.id] = Math.max(0, Math.min(line.quantity, next));
}

async function chooseEvidence() {
    const res: any = await uni.chooseImage({ count: 3 - evidence.value.length });
    const paths: string[] = res.tempFilePaths || [];
    for (const p of paths) {
        try {
            const asset = await uploadCustomerAsset(p);
            evidence.value.push(asset.preview);
        } catch (e: any) {
            uni.showToast({ title: e?.message || '上传失败', icon: 'none' });
        }
    }
}

async function submit() {
    if (!order.value) return;
    if (!reason.value) return uni.showToast({ title: '请选择售后原因', icon: 'none' });
    if (refundAmount.value <= 0) return uni.showToast({ title: '请先选择退款商品', icon: 'none' });
    if (mode.value === 'lines' && evidence.value.length === 0) {
        return uni.showToast({ title: '部分退款需上传 1-3 张凭证', icon: 'none' });
    }
    const linesDesc = mode.value === 'lines'
        ? '部分退款：' + order.value.lines
              .filter((l: any) => checked[l.id] > 0)
              .map((l: any) => `${l.productVariant?.name}×${checked[l.id]}`)
              .join('；') + '\n'
        : '整单退款\n';
    submitting.value = true;
    try {
        const req = await createAfterSale({
            orderId: String(order.value.id),
            type: 'refund_only',
            reason: reason.value,
            description: linesDesc + (userDesc.value || ''),
            evidenceImages: evidence.value.length ? evidence.value : undefined,
            refundAmount: refundAmount.value,
        });
        uni.redirectTo({ url: `/pkg-order/pages/after-sale-detail?id=${req.id}` });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || e?.message || '提交失败', icon: 'none' });
    } finally {
        submitting.value = false;
    }
}
</script>
<style lang="scss" scoped>
.as-create { padding: 20rpx 20rpx 200rpx; }
.mode-tabs { display: flex; gap: 16rpx; margin-bottom: 20rpx;
  .mode-tab { flex: 1; text-align: center; padding: 20rpx 0; border-radius: $radius-md; background: $surface; font-size: 28rpx; color: $text-color-secondary; border: 2rpx solid $border-color;
    &.on { color: $brand-color; border-color: $brand-color; background: #fff7f2; font-weight: bold; } } }
.section { background: $surface; border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx;
  &__title { font-size: 28rpx; font-weight: bold; display: block; margin-bottom: 16rpx; } }
.line { display: flex; align-items: center; gap: 16rpx; padding: 16rpx 0; border-bottom: 1rpx solid #f5f5f5;
  &:last-child { border-bottom: none; }
  &__check { width: 40rpx; height: 40rpx; border-radius: 8rpx; border: 2rpx solid #ddd; display: flex; align-items: center; justify-content: center; font-size: 24rpx; color: #fff; flex-shrink: 0;
    &.on { background: $brand-color; border-color: $brand-color; } }
  &__info { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
  &__name { font-size: 26rpx; }
  &__price { font-size: 24rpx; color: $price-color; } }
.stepper { display: flex; align-items: center; gap: 16rpx;
  &__btn { width: 48rpx; height: 48rpx; border-radius: 8rpx; background: $bg-color; display: flex; align-items: center; justify-content: center; font-size: 28rpx; }
  &__num { font-size: 26rpx; min-width: 40rpx; text-align: center; } }
.amount { display: flex; flex-direction: column;
  &__num { font-size: 48rpx; font-weight: bold; color: $price-color; }
  &__tip { font-size: 22rpx; color: $text-color-secondary; margin-top: 8rpx; } }
.chips { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 16rpx;
  .chip { font-size: 26rpx; padding: 12rpx 28rpx; border-radius: 999rpx; background: $bg-color; color: $text-color-secondary;
    &.on { background: #fff7f2; color: $brand-color; border: 1rpx solid $brand-color; } } }
.desc { width: 100%; box-sizing: border-box; min-height: 140rpx; background: $bg-color; border-radius: $radius-md; padding: 16rpx; font-size: 26rpx; }
.evidence { display: flex; gap: 16rpx; flex-wrap: wrap;
  &__item { position: relative; }
  &__img { width: 160rpx; height: 160rpx; border-radius: $radius-md; }
  &__del { position: absolute; top: -12rpx; right: -12rpx; width: 40rpx; height: 40rpx; background: rgba(0,0,0,.6); color: #fff; border-radius: 50%; text-align: center; line-height: 40rpx; font-size: 24rpx; }
  &__add { width: 160rpx; height: 160rpx; border: 2rpx dashed #ddd; border-radius: $radius-md; display: flex; align-items: center; justify-content: center; font-size: 48rpx; color: $text-color-placeholder; } }
.notice { font-size: 22rpx; color: $text-color-secondary; text-align: center; padding: 8rpx 0 20rpx; }
.footbar { position: fixed; left: 0; right: 0; bottom: 0; padding: 16rpx 20rpx calc(16rpx + env(safe-area-inset-bottom)); background: $surface;
  .submit { background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 30rpx;
    &:disabled { opacity: .5; } } }
</style>
