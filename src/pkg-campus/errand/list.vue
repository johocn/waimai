<template>
  <view class="errand-page">
    <view v-for="o in items" :key="o.id" class="order-card" @click="goDetail(o.code)">
      <view class="order-card__header">
        <view class="order-card__store-col">
          <text class="order-card__store">{{ $t(kindKey(o)) }}</text>
          <text class="order-card__code">{{ o.code }}</text>
        </view>
        <text class="order-card__state">{{ $t(statusKey(o)) }}</text>
      </view>
      <view class="order-card__route">
        <text>{{ o.customFields?.errandFrom || '—' }} → {{ o.customFields?.errandTo || '—' }}</text>
        <text v-if="o.customFields?.errandNote" class="order-card__note">{{ o.customFields.errandNote }}</text>
      </view>
      <view class="order-card__footer">
        <text>{{ $t('errandList.feeAndTip') }}</text>
        <PriceTag :price="o.totalWithTax" />
      </view>
    </view>
    <view v-if="!loading && !items.length" class="empty-wrap">
      <EmptyState :text="$t('errandList.empty')" />
      <button class="go-create" @click="goCreate">{{ $t('errandList.goCreate') }}</button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getOrdersForChannel } from '../../api/queries/order';
import { fetchStoreList } from '../../api/queries/waimai';
import PriceTag from '../../components/PriceTag.vue';
import EmptyState from '../../components/EmptyState.vue';

// 订单落在各渠道（myOrders 按 activeChannel 过滤），聚合 = 平台渠道 + 全部店铺渠道（同 pages/orders/index.vue）
const PLATFORM_TOKEN = (import.meta.env.VITE_CHANNEL_TOKEN as string) || '__default_channel__';
function normChannel(t: string): string {
    return !t || t === '__default_channel__' ? '__default_channel__' : t;
}

const items = ref<any[]>([]);
const loading = ref(false);

async function loadData() {
    loading.value = true;
    try {
        const tokens = new Set<string>([normChannel(PLATFORM_TOKEN)]);
        try {
            const stores = await fetchStoreList();
            for (const s of stores) tokens.add(normChannel(s.channelToken || ''));
        } catch (e) { /* 店铺列表拉取失败仍有平台渠道 */ }
        const results = await Promise.all(Array.from(tokens).map((token) =>
            getOrdersForChannel(token, { take: 50, sort: { createdAt: 'DESC' } })
                .then((res: any) => res?.myOrders?.items || [])
                .catch(() => [] as any[]),
        ));
        items.value = results.flat()
            .filter((o: any) => o.customFields?.orderKind === 'errand')
            // Vendure 订单同属 default channel：平台渠道与店铺渠道会返回同单，按 id 去重（同 pages/orders/index.vue）
            .filter((o: any, i: number, arr: any[]) => arr.findIndex(x => x.id === o.id) === i)
            .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } finally {
        loading.value = false;
    }
}
onShow(() => { loadData(); });

// 服务类型值 → i18n 键（渲染处走 $t，与 ERRAND_KINDS 值约定一致）
const KIND_KEYS: Record<string, string> = {
    pickup_express: 'errandList.kindPickupExpress',
    bring_food: 'errandList.kindBringFood',
    buy: 'errandList.kindBuy',
    other: 'errandList.kindOther',
};
function kindKey(o: any): string {
    return KIND_KEYS[o.customFields?.errandKind as string] || 'errandList.kindErrand';
}
function statusKey(o: any): string {
    if (o.state === 'Cancelled') return 'errandList.statusCancelled';
    const cf = o.customFields ?? {};
    if (cf.deliveryStatus === 'delivered') return 'errandList.statusDelivered';
    if (cf.deliveryStatus === 'in_progress') return 'errandList.statusInProgress';
    if (cf.deliveryStatus || cf.hallStatus === 'grabbed') return 'errandList.statusTaken';
    if (cf.hallStatus === 'open') return 'errandList.statusDispatching';
    if (cf.hallStatus === 'no_rider_final') return 'errandList.statusNoRider';
    return ['Created', 'AddingItems', 'ArrangingPayment'].includes(o.state) ? 'errandList.statusUnpaid' : 'errandList.statusWaiting';
}
function goDetail(code: string) { uni.navigateTo({ url: '/pkg-order/pages/order-detail?code=' + code }); }
function goCreate() { uni.navigateTo({ url: '/pkg-campus/errand/create' }); }
</script>
<style lang="scss" scoped>
.errand-page { min-height: 100vh; padding: 20rpx; }
.order-card { background: $surface; border-radius: $radius-md; padding: 20rpx; margin-bottom: 20rpx; &__header { display: flex; justify-content: space-between; margin-bottom: 16rpx; } &__store-col { display: flex; flex-direction: column; gap: 4rpx; } &__store { font-size: 28rpx; font-weight: 600; color: $text-color; } &__code { font-size: 22rpx; color: $text-color-secondary; } &__state { color: $brand-color; font-size: 26rpx; } &__route { display: flex; flex-direction: column; gap: 6rpx; font-size: 26rpx; color: $text-color; padding: 8rpx 0 16rpx; border-bottom: 1rpx solid $border-color; } &__note { font-size: 24rpx; color: $text-color-secondary; } &__footer { display: flex; justify-content: space-between; align-items: center; margin-top: 16rpx; font-size: 24rpx; color: $text-color-secondary; } }
.empty-wrap { padding-top: 120rpx; display: flex; flex-direction: column; align-items: center; gap: 32rpx; }
.go-create { margin-top: 16rpx; background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; padding: 0 60rpx; }
</style>
