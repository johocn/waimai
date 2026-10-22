<template>
  <view class="help-page">
    <!-- 顶部：客服热线 -->
    <view class="help-hero">
      <text class="help-hero__title">{{ $t('help.title') }}</text>
      <text class="help-hero__sub">{{ $t('help.subtitle') }}</text>
      <button class="help-hero__call" v-if="SERVICE_PHONE" @click="callService">
        {{ $t('help.callBtn') }} {{ SERVICE_PHONE }}
      </button>
      <text class="help-hero__hint" v-else>{{ $t('help.noPhoneHint') }}</text>
    </view>

    <!-- 快捷入口 -->
    <view class="help-quick">
      <view class="help-quick__item" v-for="q in QUICK" :key="q.url" @click="nav(q.url)">
        <text class="help-quick__ico">{{ q.ico }}</text>
        <text class="help-quick__lbl">{{ $t('help.' + q.labelKey) }}</text>
      </view>
    </view>

    <!-- 常见问题：后台 FAQ 优先，无数据/失败回落内置静态分组 -->
    <view class="faq">
      <text class="faq__title">{{ $t('help.faqTitle') }}</text>
      <view class="faq__group" v-for="g in faqGroups" :key="g.key">
        <text class="faq__gtitle">{{ g.title }}</text>
        <view class="faq__item" v-for="it in g.items" :key="it.key" @click="toggle(it.key)">
          <view class="faq__q">
            <text class="faq__qtext">{{ it.q }}</text>
            <text class="faq__arrow">{{ openKey === it.key ? '▾' : '›' }}</text>
          </view>
          <text class="faq__a" v-if="openKey === it.key">{{ it.a }}</text>
        </view>
      </view>
    </view>

    <text class="help-foot">{{ $t('help.foot') }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../stores/locale';
import { fetchFaqs } from '../../api/queries/faq';
import type { FaqItem } from '../../api/queries/faq';

const locale = useLocaleStore();
// 客服热线走构建环境变量，未配置时给出提示（与「关于」页同一变量）
const SERVICE_PHONE = (import.meta.env.VITE_SERVICE_PHONE as string) || '';

const QUICK = [
  { ico: '📄', labelKey: 'quickAfterSales', url: '/pkg-order/pages/after-sales' },
  { ico: '⭐', labelKey: 'quickReviews', url: '/pkg-order/pages/my-reviews' },
  { ico: '🧾', labelKey: 'quickInvoice', url: '/pkg-user/pages/invoice-titles' },
  { ico: '📦', labelKey: 'quickOrders', url: '__orders__' },
];

// 内置静态 FAQ：问题/答案均为字典键，展示时经 t() 解析；分组标题同样是键
const STATIC_FAQ_GROUPS = [
  {
    titleKey: 'faqPayTitle',
    items: [
      { q: 'q1', a: 'a1' },
      { q: 'q2', a: 'a2' },
    ],
  },
  {
    titleKey: 'faqDeliveryTitle',
    items: [
      { q: 'q3', a: 'a3' },
      { q: 'q4', a: 'a4' },
    ],
  },
  {
    titleKey: 'faqAfterSaleTitle',
    items: [
      { q: 'q5', a: 'a5' },
      { q: 'q6', a: 'a6' },
    ],
  },
  {
    titleKey: 'faqInvoiceTitle',
    items: [
      { q: 'q7', a: 'a7' },
      { q: 'q8', a: 'a8' },
    ],
  },
  {
    titleKey: 'faqAccountTitle',
    items: [
      { q: 'q9', a: 'a9' },
      { q: 'q10', a: 'a10' },
    ],
  },
];

// 后台 FAQ 的 type → 分组标题（未命中用 type 原文兜底）
const FAQ_TYPE_TITLE: Record<string, string> = {
  general: 'help.faqGeneralTitle',
  pay: 'help.faqPayTitle',
  payment: 'help.faqPayTitle',
  delivery: 'help.faqDeliveryTitle',
  order: 'help.faqDeliveryTitle',
  aftersale: 'help.faqAfterSaleTitle',
  'after-sale': 'help.faqAfterSaleTitle',
  refund: 'help.faqAfterSaleTitle',
  invoice: 'help.faqInvoiceTitle',
  account: 'help.faqAccountTitle',
};

const serverFaqs = ref<FaqItem[]>([]);
let faqLoaded = false;

const faqGroups = computed(() => {
  if (serverFaqs.value.length) {
    const groups: Array<{ key: string; title: string; items: Array<{ key: string; q: string; a: string }> }> = [];
    const index = new Map<string, number>();
    for (const f of serverFaqs.value) {
      if (!index.has(f.type)) {
        index.set(f.type, groups.length);
        const titleKey = FAQ_TYPE_TITLE[f.type];
        groups.push({ key: 's-' + f.type, title: titleKey ? locale.t(titleKey) : f.type, items: [] });
      }
      groups[index.get(f.type)!].items.push({ key: 'f-' + f.id, q: f.title, a: f.content });
    }
    return groups;
  }
  return STATIC_FAQ_GROUPS.map((g) => ({
    key: 'k-' + g.titleKey,
    title: locale.t('help.' + g.titleKey),
    items: g.items.map((it) => ({ key: it.q, q: locale.t('help.' + it.q), a: locale.t('help.' + it.a) })),
  }));
});

const openKey = ref('');

onShow(async () => {
  if (faqLoaded) return;
  faqLoaded = true;
  const list = await fetchFaqs(locale.locale);
  if (list.length) serverFaqs.value = list;
});

function toggle(key: string) {
  openKey.value = openKey.value === key ? '' : key;
}
function callService() {
  if (!SERVICE_PHONE) {
    uni.showToast({ title: locale.t('help.phoneMissing'), icon: 'none' });
    return;
  }
  uni.makePhoneCall({ phoneNumber: SERVICE_PHONE });
}
function nav(url: string) {
  if (url === '__orders__') {
    uni.switchTab({ url: '/pages/orders/index' });
    return;
  }
  uni.navigateTo({ url });
}
</script>

<style lang="scss" scoped>
.help-page { min-height: 100vh; background: $bg-color; padding: 20rpx 20rpx 40rpx; }
.help-hero {
  display: flex; flex-direction: column; align-items: center; gap: 12rpx;
  background: linear-gradient(135deg, #ff8a3d, #ff6600);
  border-radius: $radius-md; padding: 48rpx 30rpx 40rpx; margin-bottom: 20rpx;
  &__title { font-size: 36rpx; font-weight: bold; color: #fff; }
  &__sub { font-size: 24rpx; color: rgba(255, 255, 255, 0.85); }
  &__call {
    margin-top: 16rpx; background: #fff; color: $brand-color; font-size: 28rpx; font-weight: bold;
    border-radius: 999rpx; height: 76rpx; line-height: 76rpx; padding: 0 48rpx;
  }
  &__hint { font-size: 22rpx; color: rgba(255, 255, 255, 0.85); }
}
.help-quick {
  display: flex; background: $surface; border-radius: $radius-md; padding: 24rpx 0; margin-bottom: 20rpx;
  &__item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 10rpx; }
  &__ico { font-size: 40rpx; }
  &__lbl { font-size: 24rpx; color: $text-color-secondary; }
}
.faq {
  background: $surface; border-radius: $radius-md; padding: 24rpx;
  &__title { font-size: 30rpx; font-weight: bold; display: block; margin-bottom: 8rpx; }
  &__group { padding-top: 16rpx; }
  &__gtitle { font-size: 24rpx; color: $brand-color; font-weight: bold; display: block; padding: 12rpx 0 4rpx; }
  &__item { border-bottom: 1rpx solid $border-color; padding: 18rpx 0; &:last-child { border-bottom: none; } }
  &__q { display: flex; justify-content: space-between; align-items: center; gap: 16rpx; }
  &__qtext { font-size: 26rpx; color: #1f2329; flex: 1; }
  &__arrow { font-size: 24rpx; color: $text-color-placeholder; }
  &__a { display: block; font-size: 24rpx; color: $text-color-secondary; line-height: 1.7; padding-top: 12rpx; }
}
.help-foot { display: block; text-align: center; font-size: 22rpx; color: $text-color-placeholder; padding: 30rpx 20rpx 10rpx; }
</style>
