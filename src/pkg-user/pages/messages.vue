<template>
  <view class="msg-page">
    <view class="msg-head">
      <view class="msg-head__left">
        <text class="msg-head__title">{{ $t('messages.title') }}</text>
        <text class="msg-head__sub">{{ $t('messages.unread').replace('{n}', String(messages.unreadCount)) }}</text>
      </view>
      <view class="msg-head__action" v-if="messages.unreadCount > 0" @click="messages.markAllRead()">
        {{ $t('messages.markAll') }}
      </view>
    </view>

    <view v-if="!logged" class="msg-empty">
      <text class="msg-empty__ico">🔔</text>
      <text class="msg-empty__text">{{ $t('messages.needLogin') }}</text>
      <button class="msg-empty__btn" @click="doLogin">{{ $t('messages.login') }}</button>
    </view>

    <view v-else-if="!messages.items.length && !messages.loading" class="msg-empty">
      <text class="msg-empty__ico">📭</text>
      <text class="msg-empty__text">{{ $t('messages.empty') }}</text>
    </view>

    <view class="msg-list" v-else>
      <view
        v-for="m in messages.items"
        :key="m.key"
        class="msg-card"
        :class="{ 'msg-card--unread': !messages.readKeys.has(m.key) }"
        @tap="openMessage(m)"
      >
        <view class="msg-card__ico">{{ iconOf(m.kind) }}</view>
        <view class="msg-card__body">
          <view class="msg-card__top">
            <text class="msg-card__title">{{ titleOf(m) }}</text>
            <text class="msg-card__time">{{ timeText(m) }}</text>
          </view>
          <text class="msg-card__desc">{{ descOf(m) }}</text>
          <view class="msg-card__foot">
            <text class="msg-card__go">{{ actionText(m) }} ›</text>
            <text v-if="!messages.readKeys.has(m.key)" class="msg-card__dot"></text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useMessagesStore } from '../../stores/messages';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const messages = useMessagesStore();
const authStore = useAuthStore();
const locale = useLocaleStore();
const logged = computed(() => authStore.isLoggedIn);

onShow(() => {
  void messages.load();
});

function iconOf(kind: string): string {
  if (kind === 'waitPay') return '💰';
  if (kind === 'delivering') return '🛵';
  if (kind === 'waitReview') return '⭐';
  return '⏰';
}

function titleOf(m: any): string {
  return locale.t(`messages.${m.kind}Title`);
}

function descOf(m: any): string {
  if (m.kind === 'couponExpiring') {
    return locale.t('messages.couponExpiringDesc')
      .replace('{n}', m.couponName || locale.t('messages.couponFallback'))
      .replace('{d}', String(m.daysLeft ?? 0));
  }
  return locale.t(`messages.${m.kind}Desc`).replace('{c}', m.code || '');
}

function actionText(m: any): string {
  return m.kind === 'couponExpiring' ? locale.t('messages.goCoupon') : locale.t('messages.goOrder');
}

function timeText(m: any): string {
  if (!m.at) return '';
  const d = new Date(m.at);
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openMessage(m: any) {
  messages.markRead(m.key);
  if (m.kind === 'couponExpiring') {
    uni.navigateTo({ url: '/pkg-promotion/pages/my-coupons' });
    return;
  }
  if (m.code) {
    uni.navigateTo({ url: `/pkg-order/pages/order-detail?code=${encodeURIComponent(m.code)}` });
  }
}

function doLogin() {
  authStore.requireLogin();
}
</script>

<style scoped lang="scss">
.msg-page { min-height: 100vh; background: $bg-color; padding: 20rpx 24rpx 40rpx; box-sizing: border-box; }
.msg-head { display: flex; align-items: center; justify-content: space-between; padding: 8rpx 4rpx 20rpx;
  &__left { display: flex; align-items: baseline; gap: 16rpx; }
  &__title { font-size: 34rpx; font-weight: 600; color: $text-color; }
  &__sub { font-size: 24rpx; color: $text-color-secondary; }
  &__action { font-size: 24rpx; color: $brand-color; padding: 8rpx 12rpx; }
}
.msg-list { display: flex; flex-direction: column; gap: 16rpx; }
.msg-card { display: flex; gap: 16rpx; background: $surface; border-radius: $radius-md; padding: 24rpx; position: relative;
  &--unread { box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06); }
  &__ico { width: 64rpx; height: 64rpx; border-radius: 999rpx; background: $brand-color-light; display: flex; align-items: center; justify-content: center; font-size: 30rpx; flex-shrink: 0; }
  &__body { flex: 1; min-width: 0; }
  &__top { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
  &__title { font-size: 28rpx; font-weight: 600; color: $text-color; }
  &__time { font-size: 22rpx; color: $text-color-placeholder; flex-shrink: 0; }
  &__desc { display: block; font-size: 24rpx; color: $text-color-secondary; margin-top: 8rpx; line-height: 1.5; }
  &__foot { display: flex; align-items: center; justify-content: space-between; margin-top: 10rpx; }
  &__go { font-size: 24rpx; color: $brand-color; }
  &__dot { width: 14rpx; height: 14rpx; border-radius: 999rpx; background: $brand-color; }
}
.msg-empty { padding: 120rpx 0; display: flex; flex-direction: column; align-items: center; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; }
  &__btn { margin-top: 12rpx; background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; padding: 0 48rpx; height: 76rpx; line-height: 76rpx; }
}
</style>
