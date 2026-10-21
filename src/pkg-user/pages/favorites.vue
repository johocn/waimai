<template>
  <view class="fav-page">
    <view class="fav-tabs">
      <view class="fav-tab" :class="{ on: tab === 'stores' }" @click="tab = 'stores'">
        {{ $t('favorites.stores') }}<text class="fav-tab__n">{{ storeList.length }}</text>
      </view>
      <view class="fav-tab" :class="{ on: tab === 'items' }" @click="tab = 'items'">
        {{ $t('favorites.items') }}<text class="fav-tab__n">{{ itemList.length }}</text>
      </view>
    </view>

    <view v-if="tab === 'stores'">
      <view v-if="!storeList.length" class="fav-empty">
        <text class="fav-empty__ico">🏪</text>
        <text class="fav-empty__text">{{ $t('favorites.emptyStores') }}</text>
        <button class="fav-empty__btn" @click="goHome">{{ $t('favorites.goHome') }}</button>
      </view>
      <view v-else class="fav-list">
        <view class="fav-store" v-for="s in storeList" :key="'fs-' + s.channelId" @click="enterStore(s)">
          <image v-if="s.logo" class="fav-store__logo" :src="s.logo" mode="aspectFill" />
          <view v-else class="fav-store__logo fav-store__logo--txt">{{ (s.name || '?').slice(0, 1) }}</view>
          <view class="fav-store__body">
            <text class="fav-store__name">{{ s.name }}</text>
            <text class="fav-store__meta">{{ storeMeta(s) }}</text>
          </view>
          <view class="fav-store__side">
            <text class="fav-store__del" @click.stop="removeStore(s)">{{ $t('favorites.remove') }}</text>
            <text class="fav-store__go">›</text>
          </view>
        </view>
      </view>
    </view>

    <view v-else>
      <view v-if="!itemList.length" class="fav-empty">
        <text class="fav-empty__ico">🍽️</text>
        <text class="fav-empty__text">{{ $t('favorites.emptyItems') }}</text>
        <button class="fav-empty__btn" @click="goHome">{{ $t('favorites.goHome') }}</button>
      </view>
      <view v-else class="fav-items">
        <view class="fav-item" v-for="p in itemList" :key="'fi-' + p.variantId" @click="openItem(p)">
          <VImage :src="p.image" class="fav-item__img" />
          <view class="fav-item__body">
            <text class="fav-item__name">{{ p.name || $t('favorites.itemFallback') }}</text>
            <text class="fav-item__store">{{ p.storeName || '' }}</text>
            <view class="fav-item__foot">
              <text class="fav-item__price" v-if="p.price != null">¥{{ fen(p.price) }}</text>
              <text class="fav-item__del" @click.stop="removeItem(p)">{{ $t('favorites.remove') }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { fetchStoreList } from '../../api/queries/waimai';
import { useFavoritesStore } from '../../stores/favorites';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';
import { routeText } from '../../utils/store-display';
import VImage from '../../components/VImage.vue';

const favorites = useFavoritesStore();
const authStore = useAuthStore();
const locale = useLocaleStore();

const tab = ref<'stores' | 'items'>('stores');
const stores = ref<any[]>([]);

const storeList = computed(() => stores.value.filter(s => favorites.isFavorite(s.channelId)));
const itemList = computed(() => favorites.variantItems.slice().sort((a, b) => (b.at || 0) - (a.at || 0)));

onShow(async () => {
  await favorites.loadRemote().catch(() => {});
  stores.value = await fetchStoreList().catch(() => [] as any[]);
  void favorites.hydrateVariantMeta(stores.value);
});

function fen(v: any): string {
  return (Number(v || 0) / 100).toFixed(2);
}

function storeMeta(s: any): string {
  const parts: string[] = [];
  if (s.businessHours) parts.push(s.businessHours);
  const route = routeText(s.routesEnabled);
  if (route) parts.push(route);
  if (s.minOrderAmount != null) parts.push(locale.t('favorites.minOrder').replace('{y}', (Number(s.minOrderAmount) / 100).toFixed(2)));
  return parts.join(' · ');
}

async function removeStore(s: any) {
  try {
    await favorites.toggle(s.channelId);
    uni.showToast({ title: locale.t('favorites.removed'), icon: 'none' });
  } catch {
    uni.showToast({ title: locale.t('favorites.removeFail'), icon: 'none' });
  }
}

async function removeItem(p: any) {
  try {
    await favorites.toggleVariant(p);
    uni.showToast({ title: locale.t('favorites.removed'), icon: 'none' });
  } catch {
    uni.showToast({ title: locale.t('favorites.removeFail'), icon: 'none' });
  }
}

function enterStore(s: any) {
  if (s.paused) {
    uni.showToast({ title: locale.t('favorites.paused'), icon: 'none' });
    return;
  }
  const routes = (s.routesEnabled || []).join(',');
  const cid = s.channelId != null ? `&cid=${s.channelId}` : '';
  uni.navigateTo({
    url: `/pages/shop/menu?token=${encodeURIComponent(s.channelToken)}&name=${encodeURIComponent(s.name)}&routes=${encodeURIComponent(routes)}${cid}`,
  });
}

function openItem(p: any) {
  const s = stores.value.find(x => String(x.channelId) === String(p.channelId)) || null;
  const token = p.channelToken || s?.channelToken;
  if (!token) {
    uni.showToast({ title: locale.t('favorites.paused'), icon: 'none' });
    return;
  }
  const routes = (s?.routesEnabled || []).join(',');
  const cid = p.channelId != null ? `&cid=${p.channelId}` : '';
  uni.navigateTo({
    url: `/pages/shop/menu?token=${encodeURIComponent(token)}&name=${encodeURIComponent(s?.name || p.storeName || '')}&routes=${encodeURIComponent(routes)}${cid}&q=${encodeURIComponent(p.name || '')}`,
  });
}

function goHome() {
  uni.switchTab({ url: '/pages/home/index' });
}
</script>

<style scoped lang="scss">
.fav-page { min-height: 100vh; background: $bg-color; padding: 20rpx 20rpx 40rpx; box-sizing: border-box; }
.fav-tabs { display: flex; gap: 16rpx; margin-bottom: 20rpx;
  &__n { font-size: 22rpx; color: $text-color-placeholder; margin-left: 6rpx; }
}
.fav-tab { flex: 1; text-align: center; padding: 18rpx 0; font-size: 26rpx; border-radius: $radius-md; background: $surface; color: $text-color-secondary; border: 1rpx solid transparent;
  &.on { color: $brand-color; border-color: $brand-color; background: $brand-color-light; font-weight: 600; }
}
.fav-list { display: flex; flex-direction: column; gap: 16rpx; }
.fav-store { display: flex; align-items: center; gap: 16rpx; background: $surface; border-radius: $radius-md; padding: 24rpx;
  &__logo { width: 88rpx; height: 88rpx; border-radius: $radius-sm; flex-shrink: 0; background: $bg-color;
    &--txt { display: flex; align-items: center; justify-content: center; color: $brand-color; font-size: 34rpx; } }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
  &__name { font-size: 28rpx; font-weight: 600; color: $text-color; }
  &__meta { font-size: 22rpx; color: $text-color-secondary; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__side { display: flex; align-items: center; gap: 16rpx; flex-shrink: 0; }
  &__del { font-size: 22rpx; color: $text-color-placeholder; padding: 8rpx 14rpx; border: 1rpx solid $border-color; border-radius: 999rpx; }
  &__go { font-size: 32rpx; color: $text-color-placeholder; }
}
.fav-items { display: flex; flex-wrap: wrap; gap: 16rpx; }
.fav-item { width: calc(50% - 8rpx); background: $surface; border-radius: $radius-md; padding: 16rpx; box-sizing: border-box;
  &__img { border-radius: $radius-sm; background: $bg-color; display: block; width: 100%; height: 220rpx; }
  &__body { display: flex; flex-direction: column; gap: 6rpx; margin-top: 12rpx; }
  &__name { font-size: 26rpx; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__store { font-size: 22rpx; color: $text-color-secondary; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__foot { display: flex; align-items: center; justify-content: space-between; margin-top: 4rpx; }
  &__price { font-size: 28rpx; color: $price-color; font-weight: 600; }
  &__del { font-size: 22rpx; color: $text-color-placeholder; padding: 4rpx 10rpx; border: 1rpx solid $border-color; border-radius: 999rpx; }
}
.fav-empty { padding: 120rpx 0; display: flex; flex-direction: column; align-items: center; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; }
  &__btn { margin-top: 12rpx; background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; padding: 0 56rpx; height: 80rpx; line-height: 80rpx; }
}
</style>
