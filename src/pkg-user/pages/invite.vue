<template>
  <view class="iv-page">
    <view class="iv-page__card">
      <text class="iv-page__title">{{ $t('invite.title') }}</text>
      <text class="iv-page__code">{{ referralCode || '—' }}</text>
      <text class="iv-page__hint">{{ $t('invite.hint') }}</text>
      <button class="iv-page__copy" @click="copyLink">{{ $t('invite.copy') }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getActiveCustomer } from '../../api/queries/user';
import { useLocaleStore } from '../../stores/locale';

const locale = useLocaleStore();
const referralCode = ref('');

onMounted(async () => {
    try {
        const res: any = await getActiveCustomer();
        referralCode.value = res?.activeCustomer?.customFields?.referralCode || '';
    } catch (e) {}
});

function copyLink() {
    if (!referralCode.value) { uni.showToast({ title: locale.t('invite.codeMissing'), icon: 'none' }); return; }
    const link = `${window.location.origin}/waimai/?invite_code=${referralCode.value}`;
    uni.setClipboardData({
        data: link,
        success: () => uni.showToast({ title: locale.t('invite.copied'), icon: 'none' }),
    });
}
</script>

<style lang="scss" scoped>
.iv-page {
    min-height: 100vh; background: $bg-color; padding: 40rpx 30rpx;
    &__card { background: $surface; border-radius: $radius-md; padding: 60rpx 40rpx; display: flex; flex-direction: column; align-items: center; }
    &__title { font-size: 28rpx; color: $text-color-secondary; }
    &__code { font-size: 72rpx; font-weight: bold; color: $brand-color; letter-spacing: 8rpx; margin: 30rpx 0; }
    &__hint { font-size: 24rpx; color: $text-color-placeholder; margin-bottom: 40rpx; text-align: center; }
    &__copy { background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; width: 100%; }
}
</style>
