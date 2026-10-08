<template>
  <view class="profile-page">
    <view class="profile-page__header">
      <view class="profile-page__idrow" @click="goProfileEdit">
        <view class="profile-page__avatar">
          <image v-if="avatarUrl" :src="avatarUrl" mode="aspectFill" />
          <text v-else>{{ (customer?.firstName || $t('profile.guest'))[0] }}</text>
        </view>
        <view class="profile-page__id">
          <text class="profile-page__name">{{ customer?.firstName || $t('profile.notLoggedIn') }} {{ customer?.lastName || '' }}</text>
          <text class="profile-page__phone">{{ customer?.phoneNumber || $t('profile.noPhone') }}</text>
        </view>
        <text class="profile-page__edit" v-if="logged">{{ $t('profile.editProfile') }}</text>
      </view>
    </view>

    <view class="profile-page__assets" v-if="logged">
      <view class="asset-item" @click="nav('/pkg-promotion/pages/my-coupons')">
        <text class="asset-item__ico">{{ $t('profile.icoCoupon') }}</text><text class="asset-item__lbl">{{ $t('profile.coupons') }}</text>
        <text class="asset-item__badge" v-if="unusedCouponCount > 0">{{ unusedCouponCount > 99 ? '99+' : unusedCouponCount }}</text>
      </view>
      <view class="asset-item" @click="nav('/pkg-user/pages/address-book')">
        <text class="asset-item__ico">{{ $t('profile.icoAddress') }}</text><text class="asset-item__lbl">{{ $t('profile.addresses') }}</text>
      </view>
      <view class="asset-item" @click="nav('/pkg-user/pages/invoice-titles')">
        <text class="asset-item__ico">{{ $t('profile.icoInvoice') }}</text><text class="asset-item__lbl">{{ $t('profile.invoices') }}</text>
      </view>
      <view class="asset-item" @click="nav('/pkg-user/pages/invite')">
        <text class="asset-item__ico">{{ $t('profile.icoInvite') }}</text><text class="asset-item__lbl">{{ $t('profile.invite') }}</text>
      </view>
    </view>

    <view class="profile-page__orders" v-if="logged">
      <view class="order-shortcut" v-for="s in orderShortcuts" :key="s.label" @click="goOrdersTab(s.tab)">
        <text class="order-shortcut__ico">{{ $t(s.ico) }}</text>
        <text class="order-shortcut__lbl">{{ $t(s.label) }}</text>
      </view>
    </view>

    <view class="profile-page__menu">
      <view class="menu-item" v-if="logged" @click="nav('/pkg-order/pages/my-reviews')"><text>{{ $t('profile.myReviews') }}</text><text class="menu-arrow">></text></view>
      <view class="menu-item" v-if="logged" @click="nav('/pkg-campus/pages/errand/list')"><text>{{ $t('profile.myErrands') }}</text><text class="menu-arrow">></text></view>
      <view class="menu-item" v-if="logged" @click="callService"><text>{{ $t('profile.contactService') }}</text><text class="menu-arrow">></text></view>
      <view class="menu-item" @click="nav('/pkg-user/pages/about')"><text>{{ $t('profile.about') }}</text><text class="menu-arrow">></text></view>
      <view class="menu-item" @click="switchLang"><text>{{ $t('profile.language') }}</text><text class="menu-value">{{ langName }}</text><text class="menu-arrow">></text></view>
      <view class="menu-item" @click="goRiderCenter"><text>{{ $t('profile.becomeRider') }}</text><text class="menu-arrow">></text></view>
    </view>

    <button class="profile-page__logout" v-if="logged" @click="doLogout">{{ $t('profile.logout') }}</button>
    <button class="profile-page__logout" v-else @click="doLogin">{{ $t('profile.loginRegister') }}</button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getActiveCustomer } from '../../api/queries/user';
import { getMyCoupons } from '../../api/queries/coupon';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { getSessionToken } from '../../api/client';
import { logout } from '../../api/mutations/auth';
import { fetchMyRiderProfile } from '../../api/mutations/campus';
import { useLocaleStore } from '../../stores/locale';

const authStore = useAuthStore();
const cartStore = useCartStore();
const locale = useLocaleStore();
const customer = ref<any>(null);
const unusedCouponCount = ref(0);
const SERVICE_PHONE = (import.meta.env.VITE_SERVICE_PHONE as string) || '';

const logged = computed(() => !!(authStore.token || getSessionToken()));
const avatarUrl = computed(() => customer.value?.customFields?.avatarUrl || '');
const langName = computed(() => locale.locale === 'en' ? locale.t('profile.langEn') : locale.t('profile.langZh'));

const orderShortcuts = [
    { ico: 'profile.icoPay', label: 'profile.stWaitPay', tab: 'ArrangingPayment' },
    { ico: 'profile.icoShip', label: 'profile.stWaitReceive', tab: 'PaymentAuthorized,PaymentSettled' },
    { ico: 'profile.icoReview', label: 'profile.stWaitReview', tab: 'Delivered' },
    { ico: 'profile.icoRefund', label: 'profile.stRefund', tab: '' },
];

onShow(async () => {
    if (!logged.value) { customer.value = null; unusedCouponCount.value = 0; return; }
    try { const res: any = await getActiveCustomer(); customer.value = res.activeCustomer; } catch (e) {}
    loadCouponBadge();
});

async function loadCouponBadge() {
    if (!authStore.isLoggedIn) { unusedCouponCount.value = 0; return; }
    try {
        const res = await getMyCoupons('UNUSED');
        unusedCouponCount.value = (res?.myCoupons ?? []).length;
    } catch { unusedCouponCount.value = 0; }
}

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
function callService() {
    if (!SERVICE_PHONE) { uni.showToast({ title: locale.t('profile.servicePhoneMissing'), icon: 'none' }); return; }
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

// F11 i18n：语言切换（同步 uni.setLocale，导航栏/TabBar %key% 文案随动）
function switchLang() {
    const opts = [locale.t('profile.langZh'), locale.t('profile.langEn')];
    uni.showActionSheet({
        itemList: opts,
        success: (res) => {
            const next = res.tapIndex === 1 ? 'en' : 'zh-Hans';
            if (next !== locale.locale) locale.apply(next);
        }
    });
}
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
        background: $surface; margin: 20rpx; border-radius: $radius-md; display: flex; padding: 30rpx 0;
    }
    &__orders {
        background: $surface; margin: 0 20rpx; border-radius: $radius-md; display: flex; padding: 30rpx 0;
    }
    &__menu { background: $surface; margin: 20rpx; border-radius: $radius-md; }
    &__logout {
        margin: 40rpx 20rpx; background: $surface; color: $text-color-placeholder;
        border: 1rpx solid $border-color; border-radius: $radius-md; height: 88rpx; font-size: 28rpx;
    }
}
.asset-item {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx; position: relative;
    &__ico { width: 56rpx; height: 56rpx; border-radius: $radius-md; background: $brand-soft; color: $brand-color; font-size: 26rpx; display: flex; align-items: center; justify-content: center; }
    &__lbl { font-size: 24rpx; color: $text-color; }
    &__badge { position: absolute; top: 8rpx; right: 8rpx; min-width: 32rpx; height: 32rpx; line-height: 32rpx; padding: 0 8rpx; border-radius: 16rpx; background: #ff4d4f; color: #fff; font-size: 20rpx; text-align: center; }
}
.order-shortcut {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx;
    &__ico { width: 56rpx; height: 56rpx; border-radius: $radius-md; background: $brand-soft; color: $brand-color; font-size: 26rpx; display: flex; align-items: center; justify-content: center; }
    &__lbl { font-size: 24rpx; color: $text-color; }
}
.menu-item {
    display: flex; justify-content: space-between; align-items: center;
    padding: 30rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx;
    > text:first-child { flex: 1; }
}
.menu-value { color: $text-color-placeholder; margin-right: 12rpx; }
.menu-arrow { color: $text-color-placeholder; }
</style>
