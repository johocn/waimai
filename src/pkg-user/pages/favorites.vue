<template>
  <view class="fav-page">
    <view class="fav-tabs">
      <view class="fav-tab" :class="{ on: tab === 'stores' }" @click="switchTab('stores')">
        {{ $t('favorites.stores') }}<text class="fav-tab__n">{{ storeList.length }}</text>
      </view>
      <view class="fav-tab" :class="{ on: tab === 'items' }" @click="switchTab('items')">
        {{ $t('favorites.items') }}<text class="fav-tab__n">{{ itemList.length }}</text>
        <text v-if="dropCount" class="fav-tab__n fav-tab__n--drop">· ↓{{ dropCount }}</text>
      </view>
      <view class="fav-tab" :class="{ on: tab === 'dynamics' }" @click="switchTab('dynamics')">
        {{ $t('favorites.dynamics') }}<text class="fav-tab__n fav-tab__n--new" v-if="dynNewCount">{{ dynNewCount }}</text>
      </view>
    </view>

    <view v-if="tab === 'stores'">
      <!-- 店铺分组筛选：全部 / 自定义分组 / 未分组 -->
      <view v-if="storeList.length" class="grp-chips">
        <text class="grp-chip" :class="{ on: groupFilter === '__all__' }" @tap="groupFilter = '__all__'">{{ $t('favorites.groupAll') }}</text>
        <text
          v-for="gn in groupNames" :key="'g-' + gn"
          class="grp-chip" :class="{ on: groupFilter === gn }"
          @tap="groupFilter = gn"
        >{{ gn }}</text>
        <text
          v-if="ungroupedCount" class="grp-chip" :class="{ on: groupFilter === '__none__' }"
          @tap="groupFilter = '__none__'"
        >{{ $t('favorites.groupNone') }} {{ ungroupedCount }}</text>
      </view>
      <view v-if="!storeList.length" class="fav-empty">
        <text class="fav-empty__ico">🏪</text>
        <text class="fav-empty__text">{{ $t('favorites.emptyStores') }}</text>
        <button class="fav-empty__btn" @click="goHome">{{ $t('favorites.goHome') }}</button>
      </view>
      <view v-else-if="!visibleStores.length" class="grp-empty">{{ $t('favorites.groupEmpty') }}</view>
      <view v-else class="fav-list">
        <view class="fav-store" v-for="s in visibleStores" :key="'fs-' + s.channelId" @click="enterStore(s)">
          <image v-if="s.logo" class="fav-store__logo" :src="s.logo" mode="aspectFill" />
          <view v-else class="fav-store__logo fav-store__logo--txt">{{ (s.name || '?').slice(0, 1) }}</view>
          <view class="fav-store__body">
            <view class="fav-store__name-row">
              <text class="fav-store__name">{{ s.name }}</text>
              <text v-if="isPinned(s)" class="fav-store__pin-tag">{{ $t('favorites.pinnedTag') }}</text>
              <text class="fav-store__grp" @click.stop="assignGroup(s)">{{ groupOf(s) || '＋' + $t('favorites.groupAssign') }}</text>
            </view>
            <text class="fav-store__meta">{{ storeMeta(s) }}</text>
          </view>
          <view class="fav-store__side">
            <text class="fav-store__pin" :class="{ on: isPinned(s) }" @click.stop="togglePin(s)">{{ isPinned(s) ? $t('favorites.unpin') : $t('favorites.pin') }}</text>
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
        <!-- 补货提醒：订阅过且已到货的收藏商品汇总提示 -->
        <view v-if="arrivedCount > 0" class="restock-banner">
          <text class="restock-banner__text">{{ $t('favorites.restockBanner').replace('{n}', String(arrivedCount)) }}</text>
          <text class="restock-banner__clear" @click="clearArrived">{{ $t('favorites.restockBannerClear') }}</text>
        </view>
        <view class="fav-item" v-for="p in itemList" :key="'fi-' + p.variantId" @click="openItem(p)">
          <VImage :src="p.image" width="100%" height="220rpx" class="fav-item__img" />
          <text v-if="stockOf(p) === 'out'" class="fav-item__soldout">{{ $t('favorites.soldOut') }}</text>
          <text v-else-if="isWatched(p)" class="fav-item__arrived">{{ $t('favorites.restockArrived') }}</text>
          <view class="fav-item__body">
            <text class="fav-item__name">{{ p.name || $t('favorites.itemFallback') }}</text>
            <text class="fav-item__store">{{ p.storeName || '' }}</text>
            <view class="fav-item__foot">
              <view class="fav-item__prices" v-if="p.price != null">
                <text class="fav-item__price">¥{{ fen(p.price) }}</text>
                <text v-if="dropOf(p)" class="fav-item__old">¥{{ fen(dropOf(p).original) }}</text>
              </view>
              <view class="fav-item__acts">
                <text v-if="stockOf(p) === 'out'" class="fav-item__restock" @click.stop="toggleRestock(p)">
                  {{ isWatched(p) ? $t('favorites.restockCancel') : $t('favorites.restockWatch') }}
                </text>
                <text v-else class="fav-item__add" @click.stop="addCart(p)">{{ $t('favorites.addCart') }}</text>
                <text class="fav-item__del" @click.stop="removeItem(p)">{{ $t('favorites.remove') }}</text>
              </view>
            </view>
            <text v-if="dropOf(p)" class="fav-item__drop">{{ $t('favorites.priceDrop').replace('{d}', fen(dropOf(p).diff)) }}</text>
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

    <!-- 新建分组弹层 -->
    <view v-if="groupEditor" class="grp-mask" @click="groupEditor = null">
      <view class="grp-panel" @click.stop>
        <text class="grp-panel__title">{{ $t('favorites.groupNew') }}</text>
        <input
          class="grp-panel__input"
          v-model="groupInput"
          :placeholder="$t('favorites.groupPlaceholder')"
          :maxlength="8"
          confirm-type="done"
          @confirm="confirmNewGroup"
        />
        <view class="grp-panel__acts">
          <text class="grp-panel__btn" @click="groupEditor = null">{{ $t('favorites.groupCancel') }}</text>
          <text class="grp-panel__btn grp-panel__btn--primary" @click="confirmNewGroup">{{ $t('favorites.groupSave') }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { fetchStoreList, fetchProductListForChannel } from '../../api/queries/waimai';
import { addItemToOrderInChannel } from '../../api/mutations/cart';
import { useFavoritesStore } from '../../stores/favorites';
import { useCartStore } from '../../stores/cart';
import { useLocaleStore } from '../../stores/locale';
import { routeText } from '../../utils/store-display';
import { priceDrop } from '../../utils/fav-price';
import {
    readRestockWatch, toggleRestockWatch, readStockSnapshot, writeStockSnapshot, stockStateOf,
    type RestockWatchItem, type StockState,
} from '../../utils/restock';
import VImage from '../../components/VImage.vue';

const favorites = useFavoritesStore();
const locale = useLocaleStore();

const tab = ref<'stores' | 'items' | 'dynamics'>('stores');
const stores = ref<any[]>([]);

// —— 置顶：本地记录置顶店铺（channelId 序），置顶店排最前（仅本地，不进云端收藏） ——
const PINS_KEY = 'fav_store_pins';

function readPins(): string[] {
    try {
        const raw = uni.getStorageSync(PINS_KEY);
        const list = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
        return Array.isArray(list) ? list.map(String) : [];
    } catch {
        return [];
    }
}

const pins = ref<string[]>(readPins());

/** 置顶优先稳定排序：置顶店按 pin 顺序排前，其余保持原序 */
const storeList = computed(() => {
    const list = stores.value.filter(s => favorites.isFavorite(s.channelId));
    const rank = (cid: any) => {
        const i = pins.value.indexOf(String(cid));
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return list.slice().sort((a, b) => rank(a.channelId) - rank(b.channelId));
});

function isPinned(s: any): boolean {
    return pins.value.includes(String(s.channelId));
}

// —— 店铺分组：按 channelId 记组名，本地保存（仅本机，不进云端收藏） ——
const GROUPS_KEY = 'fav_store_groups';

function readStoreGroups(): Record<string, string> {
    try {
        const raw = uni.getStorageSync(GROUPS_KEY);
        const obj = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
        return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
    } catch {
        return {};
    }
}

const storeGroups = ref<Record<string, string>>(readStoreGroups());
/** 当前筛选：__all__ 全部 / __none__ 未分组 / 其余为组名 */
const groupFilter = ref('__all__');
const groupNames = computed(() => Array.from(new Set(Object.values(storeGroups.value).filter(Boolean))).sort());
const ungroupedCount = computed(() => storeList.value.filter(s => !storeGroups.value[String(s.channelId)]).length);

const visibleStores = computed(() => {
    if (groupFilter.value === '__all__') return storeList.value;
    if (groupFilter.value === '__none__') return storeList.value.filter(s => !storeGroups.value[String(s.channelId)]);
    return storeList.value.filter(s => storeGroups.value[String(s.channelId)] === groupFilter.value);
});

const groupEditor = ref<{ channelId: string } | null>(null);
const groupInput = ref('');

function groupOf(s: any): string {
    return storeGroups.value[String(s.channelId)] || '';
}

/** 设置/清除分组：空组名即取消分组 */
function setGroup(id: string, name: string) {
    const next = { ...storeGroups.value };
    if (name) next[id] = name;
    else delete next[id];
    storeGroups.value = next;
    try { uni.setStorageSync(GROUPS_KEY, JSON.stringify(next)); } catch { /* 忽略存储异常 */ }
    // 当前筛选的组被删空时回到全部
    if (groupFilter.value !== '__all__' && groupFilter.value !== '__none__' && !groupNames.value.includes(groupFilter.value)) {
        groupFilter.value = '__all__';
    }
    uni.showToast({ title: name ? locale.t('favorites.groupSet') : locale.t('favorites.groupRemoved'), icon: 'none' });
}

function assignGroup(s: any) {
    const id = String(s.channelId);
    const names = groupNames.value;
    const cur = groupOf(s);
    const items = names.map(n => (n === cur ? '✓ ' + n : n));
    items.push(locale.t('favorites.groupNew'));
    if (cur) items.push(locale.t('favorites.groupClear'));
    uni.showActionSheet({
        itemList: items,
        success: (r: any) => {
            const idx = Number(r?.tapIndex);
            if (idx < names.length) setGroup(id, names[idx]);
            else if (idx === names.length) { groupEditor.value = { channelId: id }; groupInput.value = ''; }
            else setGroup(id, '');
        },
    });
}

function confirmNewGroup() {
    if (!groupEditor.value) return;
    const name = groupInput.value.trim().slice(0, 8);
    if (!name) { uni.showToast({ title: locale.t('favorites.groupPlaceholder'), icon: 'none' }); return; }
    const id = groupEditor.value.channelId;
    groupEditor.value = null;
    groupInput.value = '';
    setGroup(id, name);
}

function togglePin(s: any) {
    const id = String(s.channelId);
    if (pins.value.includes(id)) {
        pins.value = pins.value.filter(x => x !== id);
        uni.showToast({ title: locale.t('favorites.pinRemoved'), icon: 'none' });
    } else {
        pins.value = [id, ...pins.value];
        uni.showToast({ title: locale.t('favorites.pinAdded'), icon: 'none' });
    }
    uni.setStorageSync(PINS_KEY, JSON.stringify(pins.value));
}

const itemList = computed(() => favorites.variantItems.slice().sort((a, b) => (b.at || 0) - (a.at || 0)));
/** 降价条目：收藏时快照价高于当前价 */
const dropCount = computed(() => itemList.value.filter(p => !!dropOf(p)).length);

function dropOf(p: any) {
    return priceDrop(p?.variantId, p?.price);
}

/** 刷新收藏商品当前价：按渠道各拉一次商品，命中 variant 后用最新价覆盖（失败保留旧价）；同时记录库存快照 */
async function refreshPrices() {
    const groups = new Map<string, Set<string>>();
    for (const v of itemList.value) {
        const token = v.channelToken
            || stores.value.find((s: any) => String(s.channelId) === String(v.channelId))?.channelToken;
        if (!token) continue;
        if (!groups.has(token)) groups.set(token, new Set());
        groups.get(token)!.add(String(v.variantId));
    }
    if (!groups.size) return;
    const prices = new Map<string, number>();
    const stock: Record<string, StockState> = { ...readStockSnapshot() };
    await Promise.all(Array.from(groups.entries()).map(async ([token, ids]) => {
        const goods = await fetchProductListForChannel(token).catch(() => [] as any[]);
        for (const p of goods) {
            for (const v of p.variants ?? []) {
                const id = String(v.id);
                if (!ids.has(id)) continue;
                const fen = Math.round(Number(v.priceWithTax));
                if (Number.isFinite(fen) && fen > 0) prices.set(id, fen);
                stock[id] = stockStateOf(v);
            }
        }
    }));
    stockMap.value = stock;
    writeStockSnapshot(stock);
    favorites.refreshVariantPrices(prices);
}

// —— 收藏商品补货提醒（本地订阅，进入页面按最新库存比对） ——
const stockMap = ref<Record<string, StockState>>(readStockSnapshot());
const watchList = ref<RestockWatchItem[]>(readRestockWatch());
function stockOf(p: any): StockState {
    return stockMap.value[String(p?.variantId ?? '')] ?? 'ok';
}
function isWatched(p: any): boolean {
    return watchList.value.some((x) => x.variantId === String(p?.variantId ?? ''));
}
/** 已到货 = 订阅过且当前有货 */
const arrivedCount = computed(() => itemList.value.filter((p) => isWatched(p) && stockOf(p) === 'ok').length);
function toggleRestock(p: any) {
    const token = p?.channelToken
        || stores.value.find((s: any) => String(s.channelId) === String(p?.channelId))?.channelToken
        || '';
    watchList.value = toggleRestockWatch({ variantId: String(p?.variantId ?? ''), name: p?.name, channelToken: token });
    const watched = isWatched(p);
    uni.showToast({ title: locale.t(watched ? 'favorites.restockWatchOk' : 'favorites.restockCancelOk'), icon: 'none' });
}
/** 一键取消全部「已到货」订阅 */
function clearArrived() {
    for (const p of itemList.value) {
        if (isWatched(p) && stockOf(p) === 'ok') {
            watchList.value = toggleRestockWatch({ variantId: String(p.variantId) });
        }
    }
    uni.showToast({ title: locale.t('favorites.restockCancelOk'), icon: 'none' });
}

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
    await favorites.hydrateVariantMeta(stores.value);
    watchList.value = readRestockWatch();
    void refreshPrices();
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

/** 一键加购：跨店固定 vendure-token 直加商品所属店铺购物车，成功后同步角标 */
async function addCart(p: any) {
    const token = p.channelToken
        || stores.value.find((s: any) => String(s.channelId) === String(p.channelId))?.channelToken;
    if (!token) {
        uni.showToast({ title: locale.t('history.noStore'), icon: 'none' });
        return;
    }
    try {
        const res: any = await addItemToOrderInChannel(token, String(p.variantId), 1);
        if (!res?.addItemToOrder?.id) throw new Error(res?.addItemToOrder?.message || 'fail');
        useCartStore().setOrder(res.addItemToOrder);
        uni.showToast({ title: locale.t('favorites.addCartOk'), icon: 'success' });
    } catch (e: any) {
        uni.showToast({ title: e?.message && e.message !== 'fail' ? String(e.message) : locale.t('favorites.addCartFail'), icon: 'none' });
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
    &--new { color: #fff; background: #e02020; border-radius: 999rpx; padding: 0 10rpx; margin-left: 8rpx; }
    &--drop { color: #fff; background: #ff6600; border-radius: 999rpx; padding: 0 10rpx; margin-left: 8rpx; } }
}
.fav-tab { flex: 1; text-align: center; padding: 18rpx 0; font-size: 26rpx; border-radius: $radius-md; background: $surface; color: $text-color-secondary; border: 1rpx solid transparent;
  &.on { color: $brand-color; border-color: $brand-color; background: $brand-color-light; font-weight: 600; }
}
.fav-list { display: flex; flex-direction: column; gap: 16rpx; }
// —— 店铺分组 ——
.grp-chips { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 16rpx; }
.grp-chip { font-size: 22rpx; color: $text-color-secondary; background: $surface; border: 1rpx solid $border-color; border-radius: 999rpx; padding: 8rpx 22rpx;
  &.on { color: $brand-color; border-color: $brand-color; background: $brand-color-light; font-weight: 600; }
}
.grp-empty { padding: 100rpx 0; text-align: center; font-size: 26rpx; color: $text-color-placeholder; }
.grp-mask { position: fixed; left: 0; right: 0; top: 0; bottom: 0; background: rgba(0, 0, 0, .45); z-index: 99; display: flex; align-items: center; justify-content: center; }
.grp-panel { width: 560rpx; background: $surface; border-radius: $radius-md; padding: 32rpx 28rpx;
  &__title { display: block; font-size: 30rpx; font-weight: 600; color: $text-color; text-align: center; }
  &__input { margin-top: 24rpx; height: 80rpx; padding: 0 20rpx; font-size: 28rpx; color: $text-color; background: $bg-color; border-radius: $radius-sm; }
  &__acts { display: flex; gap: 20rpx; margin-top: 28rpx; }
  &__btn { flex: 1; height: 76rpx; line-height: 76rpx; text-align: center; font-size: 28rpx; color: $text-color-secondary; background: $bg-color; border-radius: $radius-md;
    &--primary { color: #fff; background: $brand-color; font-weight: 600; } }
}
.fav-store { display: flex; align-items: center; gap: 16rpx; background: $surface; border-radius: $radius-md; padding: 24rpx;
  &__logo { width: 88rpx; height: 88rpx; border-radius: $radius-sm; flex-shrink: 0; background: $bg-color;
    &--txt { display: flex; align-items: center; justify-content: center; color: $brand-color; font-size: 34rpx; } }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
  &__name-row { display: flex; align-items: center; gap: 8rpx; min-width: 0; }
  &__name { font-size: 28rpx; font-weight: 600; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__pin-tag { font-size: 18rpx; color: #fff; background: #ff6600; border-radius: 999rpx; padding: 2rpx 10rpx; flex-shrink: 0; }
  &__grp { font-size: 18rpx; color: $text-color-placeholder; border: 1rpx dashed $border-color; border-radius: 999rpx; padding: 2rpx 12rpx; flex-shrink: 0; margin-left: auto; }
  &__meta { font-size: 22rpx; color: $text-color-secondary; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__side { display: flex; align-items: center; gap: 16rpx; flex-shrink: 0; }
  &__pin { font-size: 22rpx; color: $text-color-placeholder; padding: 8rpx 14rpx; border: 1rpx solid $border-color; border-radius: 999rpx;
    &.on { color: #ff6600; border-color: #ff6600; } }
  &__del { font-size: 22rpx; color: $text-color-placeholder; padding: 8rpx 14rpx; border: 1rpx solid $border-color; border-radius: 999rpx; }
  &__go { font-size: 32rpx; color: $text-color-placeholder; }
}
.fav-items { display: flex; flex-wrap: wrap; gap: 16rpx; }
.fav-item { position: relative; width: calc(50% - 8rpx); background: $surface; border-radius: $radius-md; padding: 16rpx; box-sizing: border-box;
  &__img { border-radius: $radius-sm; background: $bg-color; display: block; width: 100%; height: 220rpx; }
  &__soldout, &__arrived { position: absolute; top: 24rpx; left: 24rpx; font-size: 20rpx; color: #fff; border-radius: 6rpx; padding: 2rpx 10rpx; }
  &__soldout { background: rgba(0, 0, 0, .62); }
  &__arrived { background: #2e7d32; }
  &__body { display: flex; flex-direction: column; gap: 6rpx; margin-top: 12rpx; }
  &__name { font-size: 26rpx; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__store { font-size: 22rpx; color: $text-color-secondary; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__foot { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; row-gap: 8rpx; margin-top: 4rpx; gap: 8rpx; }
  &__prices { display: flex; align-items: baseline; gap: 8rpx; min-width: 0; }
  &__price { font-size: 28rpx; color: $price-color; font-weight: 600; }
  &__old { font-size: 20rpx; color: $text-color-placeholder; text-decoration: line-through; }
  &__drop { align-self: flex-start; margin-top: 4rpx; font-size: 20rpx; color: #fff; background: #ff6600; border-radius: 999rpx; padding: 2rpx 12rpx; }
  &__acts { display: flex; align-items: center; gap: 12rpx; flex-shrink: 0; margin-left: auto; }
  &__add { font-size: 22rpx; color: #fff; background: $brand-color; border-radius: 999rpx; padding: 6rpx 22rpx; font-weight: 600; }
  &__del { font-size: 22rpx; color: $text-color-placeholder; padding: 4rpx 10rpx; border: 1rpx solid $border-color; border-radius: 999rpx; }
  &__restock { font-size: 22rpx; color: $brand-color; border: 1rpx solid $brand-color; border-radius: 999rpx; padding: 4rpx 18rpx; }
}
/* 补货提醒汇总条 */
.restock-banner { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12rpx; margin-bottom: 4rpx;
  padding: 14rpx 20rpx; border-radius: $radius-md; background: #eef8ee; border: 1rpx solid #b7dfb9;
  &__text { font-size: 24rpx; color: #2e7d32; font-weight: 600; }
  &__clear { font-size: 22rpx; color: #2e7d32; text-decoration: underline; }
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
