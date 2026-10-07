<template>
  <view class="iv-page">
    <view class="iv-page__card">
      <text class="iv-page__title">我的邀请码</text>
      <text class="iv-page__code">{{ referralCode || '—' }}</text>
      <text class="iv-page__hint">好友通过你的链接注册并下单，双方都可获得福利</text>
      <button class="iv-page__copy" @click="copyLink">复制邀请链接</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getActiveCustomer } from '../../api/queries/user';

const referralCode = ref('');

onMounted(async () => {
    try {
        const res: any = await getActiveCustomer();
        referralCode.value = res?.activeCustomer?.customFields?.referralCode || '';
    } catch (e) {}
});

function copyLink() {
    if (!referralCode.value) { uni.showToast({ title: '邀请码未生成', icon: 'none' }); return; }
    const link = `${window.location.origin}/waimai/?invite_code=${referralCode.value}`;
    uni.setClipboardData({
        data: link,
        success: () => uni.showToast({ title: '链接已复制，快去分享吧', icon: 'none' }),
    });
}
</script>

<style lang="scss" scoped>
.iv-page {
    min-height: 100vh; background: $bg-color; padding: 40rpx 30rpx;
    &__card { background: $surface; border-radius: $radius-md; padding: 60rpx 40rpx; display: flex; flex-direction: column; align-items: center; }
    &__title { font-size: 28rpx; color: #666; }
    &__code { font-size: 72rpx; font-weight: bold; color: $brand-color; letter-spacing: 8rpx; margin: 30rpx 0; }
    &__hint { font-size: 24rpx; color: #999; margin-bottom: 40rpx; text-align: center; }
    &__copy { background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; width: 100%; }
}
</style>
