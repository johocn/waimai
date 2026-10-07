<template>
  <view class="profile-page">
    <view class="profile-page__header">
      <view class="profile-page__idrow" @click="goProfileEdit">
        <view class="profile-page__avatar">
          <image v-if="avatarUrl" :src="avatarUrl" mode="aspectFill" />
          <text v-else>{{ (customer?.firstName || '客')[0] }}</text>
        </view>
        <view class="profile-page__id">
          <text class="profile-page__name">{{ customer?.firstName || '未登录' }} {{ customer?.lastName || '' }}</text>
          <text class="profile-page__phone">{{ customer?.phoneNumber || '未绑定电话' }}</text>
        </view>
        <text class="profile-page__edit" v-if="logged">编辑资料</text>
      </view>
    </view>

    <view class="profile-page__assets" v-if="logged">
      <view class="asset-item asset-item--off" @click="comingSoon('优惠券')">
        <text class="asset-item__ico">券</text><text class="asset-item__lbl">优惠券</text><text class="asset-item__hint">即将上线</text>
      </view>
      <view class="asset-item" @click="nav('/pkg-user/pages/address-book')">
        <text class="asset-item__ico">址</text><text class="asset-item__lbl">常用地址</text>
      </view>
      <view class="asset-item" @click="nav('/pkg-user/pages/invoice-titles')">
        <text class="asset-item__ico">票</text><text class="asset-item__lbl">发票抬头</text>
      </view>
      <view class="asset-item" @click="nav('/pkg-user/pages/invite')">
        <text class="asset-item__ico">邀</text><text class="asset-item__lbl">邀请好友</text>
      </view>
    </view>

    <view class="profile-page__orders" v-if="logged">
      <view class="order-shortcut" v-for="s in orderShortcuts" :key="s.label" @click="goOrdersTab(s.tab)">
        <text class="order-shortcut__ico">{{ s.ico }}</text>
        <text class="order-shortcut__lbl">{{ s.label }}</text>
      </view>
    </view>

    <view class="profile-page__menu">
      <view class="menu-item" v-if="logged" @click="nav('/pkg-order/pages/my-reviews')"><text>我的评价</text><text class="menu-arrow">></text></view>
      <view class="menu-item" v-if="logged" @click="nav('/pkg-campus/pages/errand/list')"><text>我的跑腿单</text><text class="menu-arrow">></text></view>
      <view class="menu-item" v-if="logged" @click="callService"><text>联系客服</text><text class="menu-arrow">></text></view>
      <view class="menu-item" @click="nav('/pkg-user/pages/about')"><text>关于拾光达</text><text class="menu-arrow">></text></view>
      <view class="menu-item" @click="goRiderCenter"><text>成为传信者</text><text class="menu-arrow">></text></view>
    </view>

    <button class="profile-page__logout" v-if="logged" @click="doLogout">退出登录</button>
    <button class="profile-page__logout" v-else @click="doLogin">登录 / 注册</button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getActiveCustomer } from '../../api/queries/user';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { getSessionToken } from '../../api/client';
import { logout } from '../../api/mutations/auth';
import { fetchMyRiderProfile } from '../../api/mutations/campus';

const authStore = useAuthStore();
const cartStore = useCartStore();
const customer = ref<any>(null);
const SERVICE_PHONE = (import.meta.env.VITE_SERVICE_PHONE as string) || '';

const logged = computed(() => !!(authStore.token || getSessionToken()));
const avatarUrl = computed(() => customer.value?.customFields?.avatarUrl || '');

const orderShortcuts = [
    { ico: '付', label: '待付款', tab: 'ArrangingPayment' },
    { ico: '送', label: '待送达', tab: 'PaymentAuthorized,PaymentSettled' },
    { ico: '评', label: '待评价', tab: 'Delivered' },
    { ico: '退', label: '退款售后', tab: '' },
];

onShow(async () => {
    if (!logged.value) { customer.value = null; return; }
    try { const res: any = await getActiveCustomer(); customer.value = res.activeCustomer; } catch (e) {}
});

function nav(url: string) {
    if (!logged.value) { authStore.requireLogin(); return; }
    uni.navigateTo({ url });
}
function goProfileEdit() {
    if (!logged.value) { authStore.requireLogin(); return; }
    uni.navigateTo({ url: '/pkg-user/pages/profile-edit' });
}
function goOrdersTab(tab: string) {
    uni.setStorageSync('orders_pending_tab', tab);
    uni.switchTab({ url: '/pages/orders/index' });
}
function comingSoon(name: string) { uni.showToast({ title: `${name}即将上线`, icon: 'none' }); }
function callService() {
    if (!SERVICE_PHONE) { uni.showToast({ title: '客服电话未配置', icon: 'none' }); return; }
    uni.makePhoneCall({ phoneNumber: SERVICE_PHONE });
}
async function goRiderCenter() {
    if (!logged.value) { authStore.requireLogin(); return; }
    try {
        const profile = await fetchMyRiderProfile();
        const status = profile?.riderStatus;
        uni.navigateTo({ url: status === 'APPROVED' ? '/pkg-rider/pages/rider-home' : '/pkg-rider/pages/rider-join' });
    } catch (e) { authStore.requireLogin(); }
}
async function doLogout() {
    try { await logout(); } catch (e) {}
    authStore.logout();
    cartStore.clearCart();
    uni.reLaunch({ url: '/pages/login/index' });
}
function doLogin() { authStore.requireLogin(); }
</script>

<style lang="scss" scoped>
.profile-page {
    min-height: 100vh; background: $bg-color; padding-bottom: 40rpx;
    &__header { background: $brand-color; color: #fff; padding: 40rpx 30rpx; }
    &__idrow { display: flex; align-items: center; gap: 24rpx; }
    &__avatar {
        width: 110rpx; height: 110rpx; border-radius: 50%; background: rgba(255,255,255,.9);
        display: flex; align-items: center; justify-content: center; overflow: hidden; flex: none;
        image { width: 100%; height: 100%; }
        text { font-size: 44rpx; color: $brand-color; font-weight: bold; }
    }
    &__id { flex: 1; min-width: 0; }
    &__name { font-size: 36rpx; font-weight: bold; display: block; }
    &__phone { font-size: 24rpx; opacity: .85; margin-top: 8rpx; display: block; }
    &__edit { font-size: 24rpx; border: 1rpx solid rgba(255,255,255,.7); border-radius: 999rpx; padding: 6rpx 20rpx; }
    &__assets {
        background: #fff; margin: 20rpx; border-radius: $radius-md; display: flex; padding: 30rpx 0;
    }
    &__orders {
        background: #fff; margin: 0 20rpx; border-radius: $radius-md; display: flex; padding: 30rpx 0;
    }
    &__menu { background: #fff; margin: 20rpx; border-radius: $radius-md; }
    &__logout {
        margin: 40rpx 20rpx; background: #fff; color: #999;
        border: 1rpx solid $border-color; border-radius: $radius-md; height: 88rpx; font-size: 28rpx;
    }
}
.asset-item {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx; position: relative;
    &__ico { width: 56rpx; height: 56rpx; border-radius: $radius-md; background: $brand-soft; color: $brand-color; font-size: 26rpx; display: flex; align-items: center; justify-content: center; }
    &__lbl { font-size: 24rpx; color: #333; }
    &__hint { font-size: 18rpx; color: #bbb; position: absolute; top: -6rpx; right: 14rpx; }
    &--off { opacity: .55; }
}
.order-shortcut {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx;
    &__ico { width: 56rpx; height: 56rpx; border-radius: $radius-md; background: $brand-soft; color: $brand-color; font-size: 26rpx; display: flex; align-items: center; justify-content: center; }
    &__lbl { font-size: 24rpx; color: #333; }
}
.menu-item {
    display: flex; justify-content: space-between; align-items: center;
    padding: 30rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx;
}
.menu-arrow { color: #ccc; }
</style>
