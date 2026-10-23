<template>
  <view class="na-page">
    <view class="na-hero">
      <view class="na-hero__row">
        <text class="na-hero__ico">🆕</text>
        <text class="na-hero__title">{{ $t('newArrivals.title') }}</text>
      </view>
      <text class="na-hero__sub">{{ heroSub }}</text>
    </view>

    <view class="na-tabs">
      <text
        v-for="w in windows"
        :key="'na-w-' + w.days"
        class="na-tab"
        :class="{ on: activeDays === w.days }"
        @tap="activeDays = w.days"
      >{{ w.label }}</text>
    </view>

    <view v-if="loading" class="na-tip">{{ $t('newArrivals.loading') }}</view>
    <view v-else-if="!filtered.length" class="na-empty">
      <text class="na-empty__ico">🥢</text>
      <text class="na-empty__text">{{ $t('newArrivals.empty') }}</text>
      <text class="na-empty__hint">{{ $t('newArrivals.emptyHint') }}</text>
    </view>

    <template v-else>
      <view v-for="d in filtered" :key="d.storeToken + '-' + d.id" class="na-card" @tap="goStore(d)">
        <image v-if="d.image" class="na-card__img" :src="d.image" mode="aspectFill" />
        <view v-else class="na-card__img na-card__img--ph"><text>{{ (d.name || '?').slice(0, 1) }}</text></view>
        <view class="na-card__info">
          <text class="na-card__nm">{{ d.name }}</text>
          <text class="na-card__store">{{ d.storeName }}</text>
          <view class="na-card__meta">
            <text class="na-pill" :class="{ 'na-pill--hot': naFreshKey(d.ageDays) === 'today' }">{{ freshLabel(d) }}</text>
            <text v-if="d.sales > 0" class="na-pill na-pill--gray">{{ $t('newArrivals.sales').replace('{n}', String(d.sales)) }}</text>
          </view>
          <view class="na-card__foot">
            <text class="na-card__price">{{ fmtPrice(d.priceFen) }}</text>
            <view class="na-card__add" @tap.stop="addOne(d)">+</view>
          </view>
        </view>
      </view>

      <view class="na-note">{{ $t('newArrivals.note') }}</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { fetchStoreList, fetchProductListForChannel } from '../../api/queries/waimai';
import { addItemToOrderInChannel } from '../../api/mutations/cart';
import { useCartStore } from '../../stores/cart';
import { useLocaleStore } from '../../stores/locale';
import {
    naAggregate, naFilterWindow, naFreshKey,
    type NewEntry, type NewStoreGroup,
} from '../../utils/new-arrivals';

const locale = useLocaleStore();
const cart = useCartStore();

const loading = ref(true);
const entries = ref<NewEntry[]>([]);
const storeCount = ref(0);
const activeDays = ref(7);

const storesMap = ref(new Map<string, any>());

const windows = computed(() => [
    { days: 7, label: locale.t('newArrivals.tab7') },
    { days: 30, label: locale.t('newArrivals.tab30') },
]);

const filtered = computed(() => naFilterWindow(entries.value, activeDays.value));
const heroSub = computed(() =>
    locale.t('newArrivals.sub')
        .replace('{s}', String(storeCount.value))
        .replace('{m}', String(entries.value.length)));

function fmtPrice(fen: number): string {
    const y = (Number(fen) || 0) / 100;
    return '¥' + (Number.isInteger(y) ? String(y) : y.toFixed(2));
}

/** 新鲜度角标：今日 / X 天前 / 本周上新 / 近期上新 */
function freshLabel(d: NewEntry): string {
    const key = naFreshKey(d.ageDays);
    if (key === 'today') return locale.t('newArrivals.today');
    if (key === 'd3') return locale.t('newArrivals.daysAgo').replace('{n}', String(d.ageDays));
    if (key === 'week') return locale.t('newArrivals.week');
    return locale.t('newArrivals.recent');
}

async function load() {
    loading.value = true;
    try {
        const stores = (await fetchStoreList()).filter((s: any) => !s.paused && s.channelToken);
        const now = Date.now();
        const groups = await Promise.all(
            stores.map(async (s: any): Promise<NewStoreGroup | null> => {
                try {
                    const products = await fetchProductListForChannel(s.channelToken);
                    storesMap.value.set(s.channelToken, s);
                    return { token: s.channelToken, name: s.name || '', products: products ?? [] };
                } catch (e) {
                    console.warn('[new-arrivals] load store failed', s.channelToken, e);
                    return null;
                }
            }),
        );
        const ok = groups.filter((g): g is NewStoreGroup => !!g);
        const list = naAggregate(ok, now);
        storeCount.value = new Set(list.map((e) => e.storeToken)).size;
        entries.value = list;
    } finally {
        loading.value = false;
    }
}

/** 跨店加购：独立客户端固定 vendure-token 指向商品所属店铺渠道（与热销榜同机制） */
async function addOne(d: NewEntry) {
    if (!d.variantId) return uni.showToast({ title: locale.t('newArrivals.soldOut'), icon: 'none' });
    const res: any = await addItemToOrderInChannel(d.storeToken, d.variantId, 1);
    if (res?.addItemToOrder?.errorCode) {
        uni.showToast({ title: res.addItemToOrder.message || locale.t('newArrivals.addFail'), icon: 'none' });
        return;
    }
    cart.setOrder(res.addItemToOrder);
    uni.showToast({ title: locale.t('newArrivals.added'), icon: 'none' });
}

function goStore(d: NewEntry) {
    goStoreToken(d.storeToken, d.storeName);
}

function goStoreToken(token: string, name: string) {
    const s = storesMap.value.get(token);
    if (s?.paused) return uni.showToast({ title: locale.t('newArrivals.storePaused'), icon: 'none' });
    const routes = (s?.routesEnabled || []).join(',');
    const cid = s?.channelId != null ? `&cid=${s.channelId}` : '';
    uni.navigateTo({ url: `/pages/shop/menu?token=${encodeURIComponent(token)}&name=${encodeURIComponent(name || '')}&routes=${encodeURIComponent(routes)}${cid}` });
}

onLoad(() => { void load(); });
onShow(() => { if (!loading.value) void load(); });
</script>

<style scoped lang="scss">
.na-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.na-hero { background: linear-gradient(135deg, #ff6600, #ff9500); color: #fff; padding: 40rpx 30rpx 34rpx;
  &__row { display: flex; align-items: center; gap: 12rpx; }
  &__ico { font-size: 44rpx; }
  &__title { font-size: 40rpx; font-weight: bold; }
  &__sub { display: block; margin-top: 10rpx; font-size: 24rpx; opacity: .92; }
}
.na-tabs { display: flex; gap: 16rpx; padding: 20rpx 24rpx 4rpx; }
.na-tab { font-size: 26rpx; line-height: 1; color: $text-color-secondary; background: $surface; border-radius: 999rpx; padding: 14rpx 30rpx;
  &.on { color: #fff; font-weight: 600; background: linear-gradient(90deg, #ff6600, #ff9500); }
}
.na-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 80rpx 0; }
.na-empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; gap: 14rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 28rpx; color: $text-color-secondary; text-align: center; }
  &__hint { font-size: 22rpx; color: $text-color-placeholder; text-align: center; }
}
.na-card { display: flex; gap: 20rpx; margin: 20rpx 24rpx 0; padding: 20rpx; background: $surface; border-radius: $radius-md;
  &__img { width: 150rpx; height: 150rpx; border-radius: $radius-sm; background: $bg-color; flex-shrink: 0;
    &--ph { display: flex; align-items: center; justify-content: center; font-size: 52rpx; color: #ff6600; background: #fff1e6; }
  }
  &__info { flex: 1; min-width: 0; }
  &__nm { display: block; font-size: 30rpx; font-weight: 600; color: var(--w-text, #333); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__store { display: block; margin-top: 6rpx; font-size: 22rpx; color: $text-color-placeholder; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__meta { display: flex; align-items: center; gap: 10rpx; margin-top: 10rpx; }
  &__foot { display: flex; align-items: center; justify-content: space-between; margin-top: 10rpx; }
  &__price { font-size: 32rpx; font-weight: 700; color: var(--w-brand-text, #ff6600); }
  &__add { width: 52rpx; height: 52rpx; border-radius: 999rpx; background: linear-gradient(135deg, #ff6600, #ff9500); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 34rpx; font-weight: 600; }
}
.na-pill { font-size: 20rpx; line-height: 1; color: #e05f00; background: #fff2e8; border-radius: 6rpx; padding: 6rpx 10rpx;
  &--hot { color: #fff; background: #ff6600; font-weight: 600; }
  &--gray { color: $text-color-placeholder; background: $bg-color; }
}
.na-note { padding: 24rpx 30rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; line-height: 1.6; }
</style>
