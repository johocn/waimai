<template>
  <view class="fav-page">
    <view class="fav-tabs">
      <view class="fav-tab" :class="{ on: tab === 'stores' }" @click="switchTab('stores')">
        {{ $t('favorites.stores') }}<text class="fav-tab__n">{{ storeList.length }}</text>
      </view>
      <view class="fav-tab" :class="{ on: tab === 'items' }" @click="switchTab('items')">
        {{ $t('favorites.items') }}<text class="fav-tab__n">{{ itemList.length }}</text>
      </view>
      <view class="fav-tab" :class="{ on: tab === 'dynamics' }" @click="switchTab('dynamics')">
        {{ $t('favorites.dynamics') }}<text class="fav-tab__n fav-tab__n--new" v-if="dynNewCount">{{ dynNewCount }}</text>
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

    <view v-else-if="tab === 'items'">
      <view v-if="!itemList.length" class="fav-empty">
        <text class="fav-empty__ico">🍽️</text>
        <text class="fav-empty__text">{{ $t('favorites.emptyItems') }}</text>
        <button class="fav-empty__btn" @click="goHome">{{ $t('favorites.goHome') }}</button>
      </view>
      <view v-else class="fav-items">
        <view class="fav-item" v-for="p in itemList" :key="'fi-' + p.variantId" @click="openItem(p)">
          <VImage :src="p.image" width="100%" height="220rpx" class="fav-item__img" />
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

    <!-- 店铺动态：关注店铺的上新 + 热销，首次进入建立基线（不误报新品） -->
    <view v-else class="dyn">
      <view class="dyn-top">
        <text class="dyn-top__title">{{ $t('favorites.dynamicsTitle') }}</text>
        <text v-if="dynNewCount > 0" class="dyn-top__clear" @click="markAllRead">{{ $t('favorites.clearNew') }}</text>
      </view>
      <view v-if="dynLoading" class="dyn-loading">{{ $t('favorites.dynamicsLoading') }}</view>
      <view v-else-if="!storeList.length" class="fav-empty">
        <text class="fav-empty__ico">🔔</text>
        <text class="fav-empty__text">{{ $t('favorites.dynEmpty') }}</text>
        <button class="fav-empty__btn" @click="goHome">{{ $t('favorites.goHome') }}</button>
      </view>
      <view v-else class="dyn-list">
        <view v-for="g in dynamics" :key="'dyn-' + g.store.channelId" class="dyn-store">
          <view class="dyn-store__head" @click="enterStore(g.store)">
            <image v-if="g.store.logo" class="dyn-store__logo" :src="g.store.logo" mode="aspectFill" />
            <view v-else class="dyn-store__logo dyn-store__logo--txt">{{ (g.store.name || '?').slice(0, 1) }}</view>
            <view class="dyn-store__body">
              <view class="dyn-store__title-row">
                <text class="dyn-store__name">{{ g.store.name }}</text>
                <text v-if="g.newProducts.length" class="dyn-store__new">{{ $t('favorites.newProducts').replace('{n}', String(g.newProducts.length)) }}</text>
              </view>
              <text class="dyn-store__promo" v-if="g.store.promoText">🔥 {{ g.store.promoText }}</text>
              <text class="dyn-store__promo" v-else>{{ storeMeta(g.store) }}</text>
            </view>
            <text class="dyn-store__go">›</text>
          </view>

          <view class="dyn-goods">
            <view
              v-for="p in g.newProducts" :key="'new-' + p.id" class="dyn-good"
              @click="openDynamicProduct(g.store, p)"
            >
              <VImage :src="p.featuredAsset?.preview" width="200rpx" height="160rpx" class="dyn-good__img" />
              <text class="dyn-good__tag dyn-good__tag--new">{{ $t('favorites.newBadge') }}</text>
              <text class="dyn-good__name">{{ p.name }}</text>
              <text class="dyn-good__price">¥{{ fen(lowPrice(p)) }}</text>
            </view>
            <view
              v-for="p in g.recommend" :key="'hot-' + p.id" class="dyn-good"
              @click="openDynamicProduct(g.store, p)"
            >
              <VImage :src="p.featuredAsset?.preview" width="200rpx" height="160rpx" class="dyn-good__img" />
              <text class="dyn-good__tag">{{ $t('favorites.hotBadge') }}</text>
              <text class="dyn-good__name">{{ p.name }}</text>
              <text class="dyn-good__price">¥{{ fen(lowPrice(p)) }}</text>
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
import { fetchStoreList, fetchProductListForChannel } from '../../api/queries/waimai';
import { useFavoritesStore } from '../../stores/favorites';
import { useLocaleStore } from '../../stores/locale';
import { routeText } from '../../utils/store-display';
import VImage from '../../components/VImage.vue';

const favorites = useFavoritesStore();
const locale = useLocaleStore();

const tab = ref<'stores' | 'items' | 'dynamics'>('stores');
const stores = ref<any[]>([]);

const storeList = computed(() => stores.value.filter(s => favorites.isFavorite(s.channelId)));
const itemList = computed(() => favorites.variantItems.slice().sort((a, b) => (b.at || 0) - (a.at || 0)));

// —— 店铺动态：本地记录已见商品 ID，用于区分「上新」与常规商品 ——
const SEEN_KEY = 'follow_seen_products';
const DYN_STORE_LIMIT = 12;

function readSeen(): Record<string, string[]> {
    try {
        const raw = uni.getStorageSync(SEEN_KEY);
        const obj = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
        return obj && typeof obj === 'object' ? obj : {};
    } catch {
        return {};
    }
}

function writeSeen(map: Record<string, string[]>) {
    uni.setStorageSync(SEEN_KEY, JSON.stringify(map));
}

interface DynGroup {
    store: any;
    newProducts: any[];
    recommend: any[];
    allIds: string[];
}

const dynamics = ref<DynGroup[]>([]);
const dynLoading = ref(false);
const dynLoaded = ref(false);
const dynNewCount = computed(() => dynamics.value.reduce((s, g) => s + g.newProducts.length, 0));

onShow(async () => {
    await favorites.loadRemote().catch(() => {});
    stores.value = await fetchStoreList().catch(() => [] as any[]);
    void favorites.hydrateVariantMeta(stores.value);
    if (tab.value === 'dynamics') dynLoaded.value = false;
});

function switchTab(t: 'stores' | 'items' | 'dynamics') {
    tab.value = t;
    if (t === 'dynamics' && !dynLoaded.value) void loadDynamics();
}

/** 拉取关注店铺商品：首见店铺只建基线不报新品；已有基线则取新增 productId 标「新品」 */
async function loadDynamics() {
    dynLoading.value = true;
    const followed = storeList.value.slice(0, DYN_STORE_LIMIT);
    const seen = readSeen();
    try {
        const groups = await Promise.all(followed.map(async (s: any) => {
            const products = await fetchProductListForChannel(s.channelToken).catch(() => [] as any[]);
            const ids = products.map(p => String(p.id));
            const prev = seen[String(s.channelId)];
            const newProducts = prev?.length ? products.filter(p => !prev.includes(String(p.id))) : [];
            seen[String(s.channelId)] = Array.from(new Set([...ids, ...(prev ?? [])])).slice(-300);
            const newSet = new Set(newProducts.map(p => String(p.id)));
            const recommend = products
                .filter(p => !newSet.has(String(p.id)))
                .sort((a, b) => (Number(b.customFields?.waimaiMonthlySales) || 0) - (Number(a.customFields?.waimaiMonthlySales) || 0))
                .slice(0, 3);
            return { store: s, newProducts: newProducts.slice(0, 4), recommend, allIds: ids };
        }));
        writeSeen(seen);
        dynamics.value = groups;
        dynLoaded.value = true;
    } finally {
        dynLoading.value = false;
    }
}

/** 全部已读：把当前店铺商品全部记为已见，清空新品角标 */
function markAllRead() {
    const seen = readSeen();
    for (const g of dynamics.value) {
        seen[String(g.store.channelId)] = g.allIds;
        g.newProducts = [];
    }
    writeSeen(seen);
}

function fen(v: any): string {
    return (Number(v || 0) / 100).toFixed(2);
}

/** 商品最低价（PriceRange/单值两种返回形态） */
function lowPrice(p: any): number {
    const first = p?.variants?.[0]?.priceWithTax;
    const n = Number(first);
    return Number.isFinite(n) ? n : 0;
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
        if (tab.value === 'dynamics') dynamics.value = dynamics.value.filter(g => String(g.store.channelId) !== String(s.channelId));
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

function menuUrl(s: any, q?: string) {
    const routes = (s.routesEnabled || []).join(',');
    const cid = s.channelId != null ? `&cid=${s.channelId}` : '';
    const kw = q ? `&q=${encodeURIComponent(q)}` : '';
    return `/pages/shop/menu?token=${encodeURIComponent(s.channelToken)}&name=${encodeURIComponent(s.name)}&routes=${encodeURIComponent(routes)}${cid}${kw}`;
}

function enterStore(s: any) {
    if (s.paused) {
        uni.showToast({ title: locale.t('favorites.paused'), icon: 'none' });
        return;
    }
    uni.navigateTo({ url: menuUrl(s) });
}

function openDynamicProduct(store: any, product: any) {
    if (store.paused) {
        uni.showToast({ title: locale.t('favorites.paused'), icon: 'none' });
        return;
    }
    uni.navigateTo({ url: menuUrl(store, product?.name || '') });
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
.fav-tabs { display: flex; gap: 12rpx; margin-bottom: 20rpx;
  &__n { font-size: 22rpx; color: $text-color-placeholder; margin-left: 6rpx;
    &--new { color: #fff; background: #e02020; border-radius: 999rpx; padding: 0 10rpx; margin-left: 8rpx; } }
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
// —— 店铺动态 ——
.dyn-top { display: flex; align-items: center; justify-content: space-between; padding: 4rpx 8rpx 16rpx;
  &__title { font-size: 26rpx; font-weight: 600; color: $text-color; }
  &__clear { font-size: 22rpx; color: $brand-color; padding: 6rpx 18rpx; border: 1rpx solid $brand-color; border-radius: 999rpx; }
}
.dyn-loading { padding: 120rpx 0; text-align: center; font-size: 26rpx; color: $text-color-placeholder; }
.dyn-list { display: flex; flex-direction: column; gap: 20rpx; }
.dyn-store { background: $surface; border-radius: $radius-md; padding: 20rpx;
  &__head { display: flex; align-items: center; gap: 16rpx; }
  &__logo { width: 72rpx; height: 72rpx; border-radius: $radius-sm; flex-shrink: 0; background: $bg-color;
    &--txt { display: flex; align-items: center; justify-content: center; color: $brand-color; font-size: 30rpx; } }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
  &__title-row { display: flex; align-items: center; gap: 12rpx; }
  &__name { font-size: 28rpx; font-weight: 600; color: $text-color; }
  &__new { font-size: 20rpx; color: #fff; background: #e02020; border-radius: 999rpx; padding: 2rpx 12rpx; flex-shrink: 0; }
  &__promo { font-size: 22rpx; color: $text-color-secondary; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__go { font-size: 32rpx; color: $text-color-placeholder; }
}
.dyn-goods { display: flex; gap: 16rpx; margin-top: 18rpx; overflow-x: auto; }
.dyn-good { width: 200rpx; flex-shrink: 0; position: relative;
  &__img { border-radius: $radius-sm; background: $bg-color; display: block; }
  &__tag { position: absolute; top: 8rpx; left: 8rpx; font-size: 18rpx; color: #fff; background: rgba(0, 0, 0, .55); border-radius: 6rpx; padding: 2rpx 10rpx;
    &--new { background: #e02020; } }
  &__name { display: block; font-size: 24rpx; color: $text-color; margin-top: 8rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__price { display: block; font-size: 26rpx; color: $price-color; font-weight: 600; margin-top: 4rpx; }
}
</style>
