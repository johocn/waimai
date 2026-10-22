<template>
  <view class="pp-page">
    <view class="pp-card">
      <text class="pp-card__brand">{{ $t('pickupPass.brand') }}</text>
      <text class="pp-code">{{ pickupCode || '—' }}</text>
      <text class="pp-code__hint">{{ statusHint }}</text>
      <view class="pp-dash"></view>
      <view class="pp-meta">
        <view class="pp-row"><text class="pp-row__k">{{ $t('pickupPass.orderNo') }}</text><text class="pp-row__v">{{ orderCode || '—' }}</text></view>
        <view v-if="locationName" class="pp-row"><text class="pp-row__k">{{ $t('pickupPass.pickupAt') }}</text><text class="pp-row__v">{{ locationName }}</text></view>
        <view v-if="address" class="pp-row"><text class="pp-row__k">{{ $t('pickupPass.address') }}</text><text class="pp-row__v">{{ address }}</text></view>
        <view v-if="hours" class="pp-row"><text class="pp-row__k">{{ $t('pickupPass.hours') }}</text><text class="pp-row__v">{{ hours }}</text></view>
      </view>
      <view class="pp-actions">
        <button class="pp-btn" @click="copyCode">{{ $t('pickupPass.copy') }}</button>
        <button class="pp-btn pp-btn--line" @click="shareToFriend">{{ $t('pickupPass.share') }}</button>
      </view>
    </view>

    <view class="pp-tips">
      <text class="pp-tips__title">{{ $t('pickupPass.tipsTitle') }}</text>
      <text class="pp-tips__item">· {{ $t('pickupPass.tip1') }}</text>
      <text class="pp-tips__item">· {{ $t('pickupPass.tip2') }}</text>
      <text class="pp-tips__item">· {{ $t('pickupPass.tip3') }}</text>
    </view>

    <text v-if="!pickupCode" class="pp-empty">{{ $t('pickupPass.empty') }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getOrderByCode } from '../../api/queries/order';
import { fetchMyPickupCode } from '../../api/queries/pickup';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';
import { sharePage } from '../../utils/share';

const auth = useAuthStore();
const locale = useLocaleStore();

const orderCode = ref('');
const pickupCode = ref('');
const status = ref('');
const locationName = ref('');
const address = ref('');
const hours = ref('');

const statusHint = computed(() => {
    const map: Record<string, string> = {
        redeemed: 'pickupPass.stRedeemed',
        generated: 'pickupPass.stReady',
        ready: 'pickupPass.stReady',
    };
    return locale.t(map[status.value] || 'pickupPass.stGeneric');
});

onLoad(async (q: any) => {
    orderCode.value = String(q?.code ?? '');
    pickupCode.value = String(q?.k ?? '');
    status.value = String(q?.st ?? '');
    locationName.value = String(q?.n ?? '');
    address.value = String(q?.a ?? '');
    hours.value = String(q?.h ?? '');
    // 分享链接自带取餐码（代取同学生效）；缺码时才尝试按订单补拉
    if (!pickupCode.value && orderCode.value && auth.isLoggedIn) {
        try {
            const res: any = await getOrderByCode(orderCode.value);
            const order = res?.orderByCode ?? res?.order ?? null;
            if (order?.id) {
                const r: any = await fetchMyPickupCode(String(order.id));
                pickupCode.value = String(r?.myPickupCode?.code ?? '');
                status.value = String(r?.myPickupCode?.status ?? '');
            }
        } catch { /* 非自提单/未支付：保持空态 */ }
    }
});

function copyCode() {
    if (!pickupCode.value) return;
    uni.setClipboardData({
        data: pickupCode.value,
        success: () => uni.showToast({ title: locale.t('pickupPass.copied'), icon: 'none' }),
    });
}

async function shareToFriend() {
    if (!pickupCode.value) return;
    const params = [
        'code=' + encodeURIComponent(orderCode.value),
        'k=' + encodeURIComponent(pickupCode.value),
        'st=' + encodeURIComponent(status.value),
        locationName.value ? 'n=' + encodeURIComponent(locationName.value) : '',
        address.value ? 'a=' + encodeURIComponent(address.value) : '',
        hours.value ? 'h=' + encodeURIComponent(hours.value) : '',
    ].filter(Boolean).join('&');
    const how = await sharePage({
        title: locale.t('pickupPass.shareTitle').replace('{k}', pickupCode.value),
        desc: locale.t('pickupPass.shareDesc').replace('{n}', locationName.value || locale.t('pickupPass.pickupAt')),
        path: '/pkg-order/pages/pickup-pass?' + params,
    });
    if (how === 'copy') uni.showToast({ title: locale.t('pickupPass.linkCopied'), icon: 'none' });
}
</script>

<style lang="scss" scoped>
.pp-page { min-height: 100vh; background: $bg-color; padding: 32rpx 24rpx 60rpx; box-sizing: border-box; }
.pp-card {
  background: $surface; border-radius: 24rpx; padding: 36rpx 30rpx 28rpx;
  display: flex; flex-direction: column; align-items: center; gap: 12rpx;
  box-shadow: 0 8rpx 30rpx rgba(255, 102, 0, 0.12);
  &__brand { font-size: 24rpx; color: $brand-color; letter-spacing: 2rpx; }
}
.pp-code {
  font-size: 96rpx; font-weight: 800; letter-spacing: 12rpx; color: $text-color; line-height: 1.15;
  &__hint { font-size: 24rpx; color: $text-color-secondary; }
}
.pp-dash { width: 100%; margin: 18rpx 0 6rpx; border-top: 2rpx dashed $border-color; }
.pp-meta { width: 100%; display: flex; flex-direction: column; gap: 14rpx; }
.pp-row {
  display: flex; align-items: flex-start; gap: 20rpx; font-size: 25rpx;
  &__k { width: 110rpx; flex-shrink: 0; color: $text-color-placeholder; }
  &__v { flex: 1; min-width: 0; color: $text-color; word-break: break-all; }
}
.pp-actions { width: 100%; display: flex; gap: 18rpx; margin-top: 18rpx; }
.pp-btn {
  flex: 1; height: 84rpx; line-height: 84rpx; border-radius: 42rpx; border: none;
  background: $brand-color; color: #fff; font-size: 28rpx; font-weight: 600;
  &--line { background: transparent; color: $brand-color; border: 2rpx solid $brand-color; }
}
.pp-btn::after { border: none; }
.pp-tips {
  margin-top: 24rpx; background: $surface; border-radius: $radius-md; padding: 26rpx;
  display: flex; flex-direction: column; gap: 10rpx;
  &__title { font-size: 26rpx; font-weight: 600; color: $text-color; }
  &__item { font-size: 22rpx; color: $text-color-placeholder; line-height: 1.6; }
}
.pp-empty { display: block; margin-top: 18rpx; text-align: center; font-size: 22rpx; color: $text-color-placeholder; }
</style>
