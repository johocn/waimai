<template>
  <view class="rr-page">
    <view class="rr-hero">
      <view class="rr-hero__row">
        <text class="rr-hero__ico">🔁</text>
        <text class="rr-hero__title">{{ $t('reorderRegulars.title') }}</text>
      </view>
      <text v-if="auth.isLoggedIn" class="rr-hero__sub">{{ heroSub }}</text>
    </view>

    <!-- 未登录：引导登录 -->
    <view v-if="!auth.isLoggedIn" class="rr-guest">
      <text class="rr-guest__ico">🔐</text>
      <text class="rr-guest__title">{{ $t('reorderRegulars.guestTitle') }}</text>
      <text class="rr-guest__hint">{{ $t('reorderRegulars.guestHint') }}</text>
      <button class="rr-guest__btn" @tap="goLogin">{{ $t('reorderRegulars.loginBtn') }}</button>
    </view>

    <view v-else-if="loading" class="rr-tip">{{ $t('reorderRegulars.loading') }}</view>

    <view v-else-if="!items.length" class="rr-empty">
      <text class="rr-empty__ico">🍽️</text>
      <text class="rr-empty__text">{{ $t('reorderRegulars.empty') }}</text>
      <text class="rr-empty__hint">{{ $t('reorderRegulars.emptyHint') }}</text>
    </view>

    <template v-else>
      <scroll-view v-if="sections.length > 1" scroll-x class="rr-chips">
        <view class="rr-chips__row">
          <text class="rr-chip" :class="{ on: !activeStore }" @tap="activeStore = ''">{{ $t('reorderRegulars.all') }}</text>
          <text v-for="s in sections" :key="s.token" class="rr-chip" :class="{ on: s.token === activeStore }" @tap="activeStore = s.token">{{ s.name }}</text>
        </view>
      </scroll-view>

      <view v-for="s in visibleSections" :key="s.token" class="rr-sec">
        <view class="rr-sec__head">
          <view class="rr-sec__l">
            <view class="rr-sec__dot"></view>
            <text class="rr-sec__nm">{{ s.name }}</text>
            <text class="rr-sec__meta">{{ timesText(s.times) }}</text>
          </view>
          <text class="rr-sec__more" @tap="goStore(s.token, s.name)">{{ $t('reorderRegulars.enterShop') }} ›</text>
        </view>

        <view v-for="it in s.items" :key="it.key" class="rr-row" :class="{ off: !it.available }">
          <image v-if="it.image" class="rr-row__img" :src="it.image" mode="aspectFill" />
          <view v-else class="rr-row__img rr-row__img--ph"><text>{{ (it.name || '?').slice(0, 1) }}</text></view>
          <view class="rr-row__info">
            <text class="rr-row__nm">{{ it.name }}</text>
            <text class="rr-row__meta">{{ rowMeta(it) }}</text>
          </view>
          <view v-if="it.available" class="rr-step">
            <text class="rr-step__btn" :class="{ dim: qtyOf(it.key) <= 0 }" @tap="dec(it.key)">−</text>
            <text class="rr-step__n">{{ qtyOf(it.key) }}</text>
            <text class="rr-step__btn rr-step__btn--plus" @tap="inc(it.key)">+</text>
          </view>
          <text v-else class="rr-row__off-tag">{{ $t('reorderRegulars.unavailable') }}</text>
        </view>
      </view>

      <view class="rr-note">{{ $t('reorderRegulars.note') }}</view>
    </template>

    <!-- 底部一键加购：作用于当前店铺（全部态取常点最多的店） -->
    <view v-if="auth.isLoggedIn && !loading && items.length && activeSection" class="rr-bar">
      <view class="rr-bar__sum">
        <text class="rr-bar__qty">{{ selectedText }}</text>
        <text class="rr-bar__store">{{ activeSection.name }}</text>
      </view>
      <button class="rr-bar__btn" :disabled="placing || !selectedCount" @tap="addAll">
        {{ placing ? $t('reorderRegulars.placing') : $t('reorderRegulars.addAll') }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow, onLoad } from '@dcloudio/uni-app';
import { fetchStoreList, fetchProductListForChannel } from '../../api/queries/waimai';
import { getOrdersForChannel } from '../../api/queries/order';
import { addItemToOrderInChannel } from '../../api/mutations/cart';
import { useCartStore } from '../../stores/cart';
import { useLocaleStore } from '../../stores/locale';
import { useAuthStore } from '../../stores/auth';
import {
    roExtract, roGroups, roTotals, roDaysAgo, roStockMap, roApplyStock,
    type RoItemWithStock, type RoStockInfo, type RoStoreOrders,
} from '../../utils/reorder-regulars';

const locale = useLocaleStore();
const auth = useAuthStore();
const cart = useCartStore();

const loading = ref(false);
const placing = ref(false);
const items = ref<RoItemWithStock[]>([]);
const activeStore = ref('');
/** 参与聚合的订单数（hero 副标题） */
const orderCount = ref(0);

/** 店铺原始信息（进店需 routesEnabled/channelId） */
const storesMap = ref(new Map<string, any>());
/** 每个常点项默认数量（最近一单数量，1~9） */
const qty = ref<Record<string, number>>({});

const sections = computed(() => roGroups(items.value));
const visibleSections = computed(() =>
    activeStore.value ? sections.value.filter((s) => s.token === activeStore.value) : sections.value);
const activeSection = computed(() =>
    activeStore.value ? sections.value.find((s) => s.token === activeStore.value) : sections.value[0]);

const totals = computed(() => roTotals(items.value));
const heroSub = computed(() =>
    locale.t('reorderRegulars.sub')
        .replace('{i}', String(totals.value.count))
        .replace('{s}', String(totals.value.stores))
        .replace('{n}', String(orderCount.value)));

const selectedCount = computed(() => {
    const sec = activeSection.value;
    if (!sec) return 0;
    return sec.items.reduce((n, it) => n + (it.available ? qtyOf(it.key) : 0), 0);
});
const selectedTotal = computed(() => {
    const sec = activeSection.value;
    if (!sec) return 0;
    return sec.items.reduce((sum, it) => sum + (it.available ? qtyOf(it.key) * it.unitPriceFen : 0), 0);
});
const selectedText = computed(() =>
    locale.t('reorderRegulars.selected')
        .replace('{n}', String(selectedCount.value))
        .replace('{p}', fmtPrice(selectedTotal.value)));

const timesText = (n: number) => locale.t('reorderRegulars.times').replace('{n}', String(n));

function qtyOf(key: string): number {
    const v = Number(qty.value[key]);
    return Number.isFinite(v) && v > 0 ? v : 0;
}

function fmtPrice(fen: number): string {
    const y = (Number(fen) || 0) / 100;
    return '¥' + (Number.isInteger(y) ? String(y) : y.toFixed(2));
}

function rowMeta(it: RoItemWithStock): string {
    const d = roDaysAgo(it.lastAt);
    const ago = d === null ? ''
        : d === 0 ? locale.t('reorderRegulars.lastToday')
        : d === 1 ? locale.t('reorderRegulars.lastYesterday')
        : locale.t('reorderRegulars.lastDays').replace('{n}', String(d));
    return timesText(it.times) + (ago ? ' · ' + ago : '');
}

function inc(key: string) {
    qty.value[key] = Math.min(9, qtyOf(key) + 1);
}

function dec(key: string) {
    qty.value[key] = Math.max(0, qtyOf(key) - 1);
}

function goLogin() {
    uni.navigateTo({ url: '/pages/login/index?redirect=' + encodeURIComponent('/pkg-order/pages/reorder-regulars') });
}

function goStore(token: string, name: string) {
    const s = storesMap.value.get(token);
    if (s?.paused) return uni.showToast({ title: locale.t('reorderRegulars.shopPaused'), icon: 'none' });
    const routes = (s?.routesEnabled || []).join(',');
    const cid = s?.channelId != null ? `&cid=${s.channelId}` : '';
    uni.navigateTo({ url: `/pages/shop/menu?token=${encodeURIComponent(token)}&name=${encodeURIComponent(name || '')}&routes=${encodeURIComponent(routes)}${cid}` });
}

async function load() {
    if (!auth.isLoggedIn) {
        items.value = [];
        return;
    }
    loading.value = true;
    try {
        const stores = (await fetchStoreList()).filter((s: any) => !s.paused && s.channelToken);
        stores.forEach((s: any) => storesMap.value.set(s.channelToken, s));
        const groups: RoStoreOrders[] = await Promise.all(stores.map(async (s: any): Promise<RoStoreOrders> => {
            try {
                const res: any = await getOrdersForChannel(s.channelToken, { take: 20, sort: { createdAt: 'DESC' } });
                return { token: s.channelToken, name: s.name || '', orders: res?.myOrders?.items || [] };
            } catch (e) {
                console.warn('[reorder-regulars] load orders failed', s.channelToken, e);
                return { token: s.channelToken, name: s.name || '', orders: [] };
            }
        }));
        // 已取消订单不计入页脚「近 n 单」口径（与聚合口径一致）
        orderCount.value = groups.reduce(
            (n, g) => n + g.orders.filter((o: any) => String(o?.state ?? '') !== 'Cancelled').length, 0);

        // 只保留近 90 天常点
        const now = Date.now();
        const list = roExtract(groups, 20).filter((it) => {
            const d = roDaysAgo(it.lastAt, now);
            return d !== null && d <= 90;
        });

        // 逐店拉当前目录：补商品名/图片/现价 + 可售判断
        const tokens = [...new Set(list.map((i) => i.storeToken))];
        const stockByStore = new Map<string, Map<string, RoStockInfo>>();
        await Promise.all(tokens.map(async (t) => {
            try {
                const products = await fetchProductListForChannel(t);
                stockByStore.set(t, roStockMap(products));
            } catch (e) {
                console.warn('[reorder-regulars] load products failed', t, e);
                stockByStore.set(t, new Map());
            }
        }));
        items.value = list.map((it) => roApplyStock([it], stockByStore.get(it.storeToken))[0]);

        const nextQty: Record<string, number> = {};
        items.value.forEach((it) => {
            nextQty[it.key] = it.available ? Math.min(9, Math.max(1, it.quantity)) : 0;
        });
        qty.value = nextQty;
        if (activeStore.value && !items.value.some((i) => i.storeToken === activeStore.value)) activeStore.value = '';
    } finally {
        loading.value = false;
    }
}

/** 一键加购当前店铺：逐行加购（跨店购物车限制由后端错误提示） */
async function addAll() {
    const sec = activeSection.value;
    if (!sec || placing.value || !selectedCount.value) return;
    placing.value = true;
    let added = 0;
    let skipped = 0;
    let lastOrder: any = null;
    try {
        for (const it of sec.items) {
            const n = it.available ? qtyOf(it.key) : 0;
            if (!n) continue;
            const res: any = await addItemToOrderInChannel(sec.token, it.variantId, n);
            if (res?.addItemToOrder?.errorCode) {
                if (!added) {
                    uni.showToast({ title: res.addItemToOrder.message || locale.t('reorderRegulars.addFail'), icon: 'none' });
                    return;
                }
                skipped += 1;
                continue;
            }
            added += 1;
            lastOrder = res.addItemToOrder;
        }
        if (lastOrder) cart.setOrder(lastOrder);
        if (!added) {
            uni.showToast({ title: locale.t('reorderRegulars.addFail'), icon: 'none' });
            return;
        }
        uni.showToast({
            title: skipped
                ? locale.t('reorderRegulars.addPartial').replace('{n}', String(skipped))
                : locale.t('reorderRegulars.added'),
            icon: 'none',
        });
        goStore(sec.token, sec.name);
    } finally {
        placing.value = false;
    }
}

onLoad(() => { void load(); });
onShow(() => { if (!loading.value) void load(); });
</script>

<style scoped lang="scss">
.rr-page { min-height: 100vh; background: $bg-color; padding-bottom: 160rpx; }
.rr-hero { background: linear-gradient(135deg, #ff6600, #ff9500); color: #fff; padding: 40rpx 30rpx 34rpx;
  &__row { display: flex; align-items: center; gap: 12rpx; }
  &__ico { font-size: 44rpx; }
  &__title { font-size: 40rpx; font-weight: bold; }
  &__sub { display: block; margin-top: 10rpx; font-size: 24rpx; opacity: .92; }
}
.rr-guest, .rr-empty { display: flex; flex-direction: column; align-items: center; padding: 110rpx 40rpx; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__title { font-size: 30rpx; font-weight: 600; color: $text-color; }
  &__text { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
  &__hint { font-size: 22rpx; color: $text-color-placeholder; text-align: center; }
  &__btn { margin-top: 16rpx; padding: 0 80rpx; height: 76rpx; line-height: 76rpx; font-size: 28rpx; color: #fff; border: none; border-radius: 999rpx; background: linear-gradient(90deg, #ff6600, #ff9500); }
}
.rr-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 80rpx 0; }
.rr-chips { background: $surface; white-space: nowrap;
  &__row { display: inline-flex; gap: 16rpx; padding: 16rpx 24rpx; }
}
.rr-chip { display: inline-block; font-size: 26rpx; line-height: 1; color: $text-color-secondary; background: $bg-color; border-radius: 999rpx; padding: 12rpx 26rpx;
  &.on { color: #fff; font-weight: 600; background: linear-gradient(90deg, #ff6600, #ff9500); }
}
.rr-sec { margin-top: 24rpx;
  &__head { display: flex; align-items: center; justify-content: space-between; padding: 0 24rpx 12rpx; }
  &__l { display: flex; align-items: center; gap: 12rpx; min-width: 0; }
  &__dot { width: 8rpx; height: 28rpx; border-radius: 4rpx; background: linear-gradient(180deg, #ff6600, #ff9500); }
  &__nm { font-size: 30rpx; font-weight: bold; color: var(--w-text, #333); }
  &__meta { font-size: 22rpx; color: $text-color-placeholder; }
  &__more { font-size: 22rpx; color: #ff6600; flex-shrink: 0; }
}
.rr-row { display: flex; align-items: center; gap: 18rpx; background: $surface; border-radius: $radius-md; margin: 0 24rpx 14rpx; padding: 18rpx;
  &.off { opacity: .6; }
  &__img { width: 100rpx; height: 100rpx; border-radius: 12rpx; flex: 0 0 auto; background: #fff1e6;
    &--ph { display: flex; align-items: center; justify-content: center; font-size: 38rpx; color: #ff6600; }
  }
  &__info { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 6rpx; }
  &__nm { font-size: 28rpx; font-weight: 600; color: var(--w-text, #333); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__meta { font-size: 22rpx; color: $text-color-placeholder; }
  &__off-tag { font-size: 22rpx; color: #b0b3b8; flex-shrink: 0; }
}
.rr-step { display: flex; align-items: center; gap: 10rpx; flex: 0 0 auto;
  &__btn { width: 44rpx; height: 44rpx; border-radius: 999rpx; border: 1rpx solid $border-color; display: flex; align-items: center; justify-content: center; font-size: 30rpx; color: $text-color-secondary;
    &.dim { opacity: .35; }
    &--plus { background: linear-gradient(135deg, #ff6600, #ff9500); border: none; color: #fff; }
  }
  &__n { font-size: 26rpx; min-width: 26rpx; text-align: center; color: var(--w-text, #333); }
}
.rr-note { font-size: 21rpx; color: $text-color-placeholder; text-align: center; padding: 20rpx 30rpx 0; }
.rr-bar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 18rpx; padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom)); background: $surface; box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, .06);
  &__sum { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
  &__qty { font-size: 28rpx; font-weight: 600; color: var(--w-text, #333); }
  &__store { font-size: 22rpx; color: $text-color-placeholder; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__btn { flex: 0 0 auto; height: 74rpx; line-height: 74rpx; padding: 0 34rpx; border: none; border-radius: 999rpx; font-size: 28rpx; font-weight: 600; color: #fff; background: linear-gradient(90deg, #ff6600, #ff9500);
    &[disabled] { opacity: .5; }
  }
}
</style>
