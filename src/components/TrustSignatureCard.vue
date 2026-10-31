<template>
  <view class="trust">
    <view class="trust__head">
      <text class="trust__title">{{ t('reviewTrust.title') }}</text>
      <view class="trust__badges">
        <text v-if="averageRating != null" class="trust__badge">{{ averageRating }} {{ t('reviewTrust.scoreUnit') }}</text>
        <text v-if="goodRate != null" class="trust__badge">{{ t('reviewTrust.goodRate').replace('{n}', String(goodRate)) }}</text>
        <text class="trust__badge">{{ t('reviewTrust.real') }}</text>
      </view>
    </view>
    <!-- 固定顺序：质量 → 服务 → 时间 -->
    <view v-for="row in ROWS" :key="row.key" class="trust__row">
      <text class="trust__label">{{ t(row.label) }}</text>
      <text class="trust__text">{{ t(row.text) }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useLocaleStore } from '../stores/locale';

withDefaults(defineProps<{
    /** 平均分（评价列表页有），可空 */
    averageRating?: number | string | null;
    /** 好评率 0-100（评价列表页有），可空 */
    goodRate?: number | string | null;
}>(), {
    averageRating: null,
    goodRate: null,
});

const locale = useLocaleStore();
const t = locale.t;

/** 三项顺序固定为 质量 / 服务 / 时间，不随数据源变化 */
const ROWS = [
    { key: 'quality', label: 'reviewTrust.quality', text: 'reviewTrust.qualityText' },
    { key: 'service', label: 'reviewTrust.service', text: 'reviewTrust.serviceText' },
    { key: 'time', label: 'reviewTrust.time', text: 'reviewTrust.timeText' },
];
</script>

<style lang="scss" scoped>
.trust {
  background: $surface; border-radius: 16rpx; padding: 20rpx 24rpx; margin-bottom: 24rpx;
  &__head { display: flex; align-items: center; gap: 12rpx; }
  &__title { font-size: 26rpx; font-weight: 600; color: #1f2329; flex-shrink: 0; }
  &__badges { display: flex; flex-wrap: wrap; gap: 10rpx; margin-left: auto; justify-content: flex-end; }
  &__badge { font-size: 20rpx; color: #16a34a; background: #e6f5ec; border-radius: 999rpx; padding: 4rpx 14rpx; }
  &__row { display: flex; align-items: flex-start; gap: 12rpx; margin-top: 14rpx; }
  &__label { font-size: 22rpx; color: #16a34a; background: #e6f5ec; border-radius: 8rpx; padding: 2rpx 12rpx; flex-shrink: 0; }
  &__text { font-size: 22rpx; color: #8a919c; line-height: 1.5; }
}
</style>
