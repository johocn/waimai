<template>
  <view class="ab2-page">
    <view class="ab2-page__hero">
      <text class="ab2-page__logo">{{ $t('about.brandName') }}</text>
      <text class="ab2-page__ver">{{ $t('about.version').replace('{n}', APP_VERSION) }}</text>
    </view>
    <view class="ab2-page__menu">
      <view class="ab2-page__item" @click="callService">
        <text>{{ $t('about.serviceHotline') }}</text><text class="ab2-page__val">{{ SERVICE_PHONE || $t('about.notConfigured') }}</text>
      </view>
      <view class="ab2-page__item" @click="openDoc('user')">
        <text>{{ $t('about.userAgreement') }}</text><text class="ab2-page__val">></text>
      </view>
      <view class="ab2-page__item" @click="openDoc('privacy')">
        <text>{{ $t('about.privacyPolicy') }}</text><text class="ab2-page__val">></text>
      </view>
    </view>
    <view class="ab2-page__doc" v-if="docOpen">
      <text class="ab2-page__doc-title">{{ docTitle }}</text>
      <text class="ab2-page__doc-body">{{ docBody }}</text>
      <button class="ab2-page__close" @click="docOpen = false">{{ $t('about.close') }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useLocaleStore } from '../../stores/locale';

const locale = useLocaleStore();

const APP_VERSION = '1.1.0'; // 发版时手动递增（package.json version 同步）
const SERVICE_PHONE = (import.meta.env.VITE_SERVICE_PHONE as string) || '';

const docOpen = ref(false);
const docTitle = ref('');
const docBody = ref('');

// 协议/隐私长文本本期不迁 i18n（保留中文原文，正式文案由运营补充后替换）
const DOCS: Record<string, { body: string }> = {
    user: {
        body: '1. 拾光达为校园配送服务平台，下单前请确认送达信息准确。\n2. 订单支付后由商家备餐、骑手配送；如遇问题可联系客服或申请售后。\n3. 平台禁止利用系统漏洞套利，违者有权限制账号。\n（正式文案由运营补充后替换本段）',
    },
    privacy: {
        body: '1. 我们收集的信息：账号资料（昵称/电话）、订单与配送地址。\n2. 信息用途：仅用于订单履约、配送联系与客服支持，不对外出售。\n3. 你的权利：可在「个人中心-编辑资料」修改资料、删除常用地址。\n（正式文案由运营补充后替换本段）',
    },
};

function callService() {
    if (!SERVICE_PHONE) { uni.showToast({ title: locale.t('about.hotlineMissing'), icon: 'none' }); return; }
    uni.makePhoneCall({ phoneNumber: SERVICE_PHONE });
}
function openDoc(kind: 'user' | 'privacy') {
    docTitle.value = locale.t(kind === 'user' ? 'about.userAgreement' : 'about.privacyPolicy');
    docBody.value = DOCS[kind].body;
    docOpen.value = true;
}
</script>

<style lang="scss" scoped>
.ab2-page {
    min-height: 100vh; background: $bg-color;
    &__hero { display: flex; flex-direction: column; align-items: center; padding: 80rpx 0 40rpx; }
    &__logo { font-size: 48rpx; font-weight: bold; color: $brand-color; }
    &__ver { font-size: 24rpx; color: $text-color-placeholder; margin-top: 12rpx; }
    &__menu { background: $surface; margin: 20rpx; border-radius: $radius-md; }
    &__item { display: flex; justify-content: space-between; padding: 30rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; }
    &__val { color: $text-color-placeholder; }
    &__doc { position: fixed; inset: 0; background: $surface; z-index: 9; padding: 60rpx 40rpx calc(40rpx + env(safe-area-inset-bottom)); display: flex; flex-direction: column; }
    &__doc-title { font-size: 36rpx; font-weight: bold; margin-bottom: 30rpx; }
    &__doc-body { flex: 1; font-size: 26rpx; color: #555; line-height: 1.8; white-space: pre-line; }
    &__close { background: $bg-color; color: $text-color-secondary; border-radius: $radius-md; height: 88rpx; font-size: 28rpx; }
}
</style>
