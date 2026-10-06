<template>
  <view class="profile-page">
    <view class="profile-page__header">
      <text class="profile-page__name">{{ customer?.firstName || '用户' }} {{ customer?.lastName || '' }}</text>
      <text class="profile-page__email">{{ customer?.emailAddress || '' }}</text>
    </view>
    <view class="profile-page__menu">
      <view class="menu-item" @click="goOrders">
        <text>我的订单</text><text class="menu-arrow">></text>
      </view>
      <view class="menu-item" @click="goMyReviews">
        <text>我的评价</text><text class="menu-arrow">></text>
      </view>
      <view class="menu-item" @click="goRiderCenter">
        <text>成为传信者</text><text class="menu-arrow">></text>
      </view>
    </view>
    <button class="profile-page__logout" @click="doLogout">退出登录</button>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getActiveCustomer } from '../../api/queries/user';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { getSessionToken } from '../../api/client';
import { logout } from '../../api/mutations/auth';
import { fetchMyRiderProfile } from '../../api/mutations/campus';

const authStore = useAuthStore();
const cartStore = useCartStore();
const customer = ref<any>(null);

onMounted(async () => {
    try { const res: any = await getActiveCustomer(); customer.value = res.activeCustomer; } catch (e) {}
});

function goOrders() { uni.switchTab({ url: '/pages/orders/index' }); }
function goMyReviews() { uni.navigateTo({ url: '/pkg-order/pages/my-reviews' }); }

/**
 * 骑手中心入口（常显「成为骑手」）：按骑手档案分流
 * 未登录 → 登录页；APPROVED → 接单大厅；未入驻/审核中/被拒 → 入驻页（页内显示状态）
 */
async function goRiderCenter() {
    if (!authStore.token && !getSessionToken()) {
        authStore.requireLogin();
        return;
    }
    try {
        const profile = await fetchMyRiderProfile();
        const status = profile?.riderStatus;
        uni.navigateTo({ url: status === 'APPROVED' ? '/pkg-rider/pages/rider-home' : '/pkg-rider/pages/rider-join' });
    } catch (e) {
        // 查询失败多为会话失效（后端 requireCustomer 抛未授权），按未登录处理
        authStore.requireLogin();
    }
}

async function doLogout() {
    try { await logout(); } catch (e) {}
    authStore.logout();
    cartStore.clearCart();
    uni.reLaunch({ url: '/pages/login/index' });
}
</script>

<style lang="scss" scoped>
.profile-page {
    min-height: 100vh; background: $bg-color;
    &__header {
        background: $brand-color; color: #fff; padding: 60rpx 30rpx;
    }
    &__name { font-size: 36rpx; font-weight: bold; display: block; }
    &__email { font-size: 26rpx; opacity: 0.8; margin-top: 8rpx; display: block; }
    &__menu { background: #fff; margin: 20rpx; border-radius: $radius-md; }
    &__logout {
        margin: 40rpx 20rpx; background: #fff; color: #999;
        border: 1rpx solid $border-color; border-radius: $radius-md; height: 88rpx; font-size: 28rpx;
    }
}
.menu-item {
    display: flex; justify-content: space-between; align-items: center;
    padding: 30rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx;
}
.menu-arrow { color: #ccc; }
</style>
