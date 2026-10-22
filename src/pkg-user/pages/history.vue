<template>
  <view class="hist-page">
    <view class="hist-tabs">
      <view class="hist-tab" :class="{ on: tab === 'footprint' }" @tap="switchTab('footprint')">
        {{ $t('history.tabFootprint') }}<text class="hist-tab__n">{{ footprint.length }}</text>
      </view>
      <view class="hist-tab" :class="{ on: tab === 'frequent' }" @tap="switchTab('frequent')">
        {{ $t('history.tabFrequent') }}<text class="hist-tab__n" v-if="frequent.length">{{ frequent.length }}</text>
      </view>
    </view>

    <!-- 浏览足迹：本地记录，最新在前；支持按时间 / 按店铺聚合两种视图与单条删除 -->
    <view v-if="tab === 'footprint'">
      <view class="hist-top" v-if="footprint.length">
        <text class="hist-top__hint">{{ $t('history.footprintHint') }}</text>
        <view class="hist-top__ops">
          <text class="hist-top__mode" @tap="toggleFpMode">{{ fpMode === 'time' ? $t('history.groupByStore') : $t('history.byTime') }}</text>
          <text class="hist-top__clear" @tap="clearAll">{{ $t('history.clear') }}</text>
        </view>
      </view>
      <view class="hist-list" v-if="footprint.length">
        <view class="hist-group" v-for="g in fpDisplay" :key="'fpg-' + g.key">
          <view class="hist-group__head" v-if="g.name">
            <text class="hist-group__name">{{ g.name }}</text>
            <text class="hist-group__n">{{ $t('history.itemCount').replace('{n}', String(g.items.length)) }}</text>
          </view>
          <view class="hist-row" v-for="it in g.items" :key="'fp-' + it.productId + '-' + (it.variantId || '')" @tap="openFootprint(it)">
            <VImage :src="it.image" width="140rpx" height="140rpx" class="hist-row__img" />
            <view class="hist-row__body">
              <text class="hist-row__name">{{ it.name }}</text>
              <text class="hist-row__store" v-if="!g.name">{{ it.storeName || '' }}</text>
              <view class="hist-row__foot">
                <text class="hist-row__price" v-if="it.price">¥{{ yuan(it.price) }}</text>
                <text class="hist-row__time">{{ timeText(it.at) }}</text>
              </view>
            </view>
            <text class="hist-row__del" @tap.stop="removeOne(it)">×</text>
            <text class="hist-row__arrow">›</text>
          </view>
        </view>
      </view>
      <view class="hist-empty" v-else>
        <text class="hist-empty__ico">👀</text>
        <text class="hist-empty__text">{{ $t('history.emptyFootprint') }}</text>
        <button class="hist-empty__btn" @tap="goHome">{{ $t('history.goHome') }}</button>
      </view>
    </view>

    <!-- 常买清单：历史订单商品聚合，按购买次数排序 -->
    <view v-else>
      <view class="hist-top" v-if="frequent.length">
        <text class="hist-top__hint">{{ $t('history.frequentHint') }}</text>
        <text class="hist-top__clear" @tap="loadFrequent(true)">{{ $t('history.refresh') }}</text>
      </view>
      <view class="hist-loading" v-if="loadingFrequent">{{ $t('history.loading') }}</view>
      <view class="hist-list" v-else-if="frequent.length">
        <view class="hist-row" v-for="it in frequent" :key="'fr-' + it.variantId" @tap="addFrequent(it)">
          <VImage :src="it.image" width="140rpx" height="140rpx" class="hist-row__img" />
          <view class="hist-row__body">
            <view class="hist-row__title">
              <text class="hist-row__name">{{ it.name }}</text>
              <text class="hist-row__count">{{ $t('history.boughtTimes').replace('{n}', String(it.count)) }}</text>
            </view>
            <text class="hist-row__store">{{ it.storeName || '' }}</text>
            <view class="hist-row__foot">
              <text class="hist-row__price" v-if="it.price">¥{{ yuan(it.price) }}</text>
              <text class="hist-row__time">{{ timeText(it.lastAt) }}</text>
            </view>
          </view>
          <text class="hist-row__add">{{ $t('history.add') }}</text>
        </view>
      </view>
      <view class="hist-empty" v-else>
        <text class="hist-empty__ico">🍱</text>
        <text class="hist-empty__text">{{ $t('history.emptyFrequent') }}</text>
        <button class="hist-empty__btn" @tap="goHome">{{ $t('history.goHome') }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getOrdersForChannel } from '../../api/queries/order';
import { fetchStoreList } from '../../api/queries/waimai';
import { readFootprint, clearFootprint, removeFootprint, type FootprintItem } from '../../utils/footprint';
import { useLocaleStore } from '../../stores/locale';
import VImage from '../../components/VImage.vue';

const locale = useLocaleStore();
const tab = ref<'footprint' | 'frequent'>('footprint');
const footprint = ref<FootprintItem[]>(readFootprint());
const frequent = ref<any[]>([]);
const loadingFrequent = ref(false);
const frequentLoaded = ref(false);

onShow(() => {
    footprint.value = readFootprint();
    if (tab.value === 'frequent' && !frequentLoaded.value) void loadFrequent();
});

function switchTab(t: 'footprint' | 'frequent') {
    tab.value = t;
    if (t === 'frequent' && !frequentLoaded.value) void loadFrequent();
}

function yuan(fen: any): string {
    return (Number(fen || 0) / 100).toFixed(2);
}

function timeText(at: number): string {
    if (!at) return '';
    const d = new Date(at);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (sameDay) return locale.t('history.today').replace('{t}', hm);
    return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${hm}`;
}

function clearAll() {
    uni.showModal({
        title: locale.t('history.clearTitle'),
        content: locale.t('history.clearConfirm'),
        success: (res) => {
            if (!res.confirm) return;
            clearFootprint();
            footprint.value = [];
            uni.showToast({ title: locale.t('history.cleared'), icon: 'none' });
        },
    });
}

// —— 足迹视图：按时间平铺 / 按店铺聚合（组头带条数，组间按最新浏览时间排序） ——
const fpMode = ref<'time' | 'store'>('time');

function toggleFpMode() {
    fpMode.value = fpMode.value === 'time' ? 'store' : 'time';
}

const fpDisplay = computed<{ key: string; name: string; items: FootprintItem[] }[]>(() => {
    if (fpMode.value === 'time') return [{ key: '__all__', name: '', items: footprint.value }];
    const map = new Map<string, { key: string; name: string; items: FootprintItem[] }>();
    for (const it of footprint.value) {
        const key = it.channelToken || it.storeName || '__other__';
        if (!map.has(key)) map.set(key, { key, name: it.storeName || locale.t('history.unknownStore'), items: [] });
        map.get(key)!.items.push(it);
    }
    return Array.from(map.values()).sort((a, b) => (b.items[0]?.at || 0) - (a.items[0]?.at || 0));
});

/** 单条删除足迹（按 productId+variantId 精确移除） */
function removeOne(it: FootprintItem) {
    removeFootprint(it.productId, it.variantId);
    footprint.value = readFootprint();
    uni.showToast({ title: locale.t('history.removed'), icon: 'none' });
}

function menuUrl(token: string, name: string, routes: string, cid?: string, extra = ''): string {
    const c = cid ? `&cid=${cid}` : '';
    return `/pages/shop/menu?token=${encodeURIComponent(token)}&name=${encodeURIComponent(name)}&routes=${encodeURIComponent(routes || '')}${c}${extra}`;
}

function openFootprint(it: FootprintItem) {
    if (!it.channelToken) {
        uni.showToast({ title: locale.t('history.noStore'), icon: 'none' });
        return;
    }
    uni.navigateTo({ url: menuUrl(it.channelToken, it.storeName || '', it.routes || '', it.channelId, `&q=${encodeURIComponent(it.name)}`) });
}

function addFrequent(it: any) {
    if (!it.channelToken || !it.variantId) {
        uni.showToast({ title: locale.t('history.noStore'), icon: 'none' });
        return;
    }
    uni.navigateTo({ url: menuUrl(it.channelToken, it.storeName || '', it.routes || '', it.channelId, `&add=${encodeURIComponent(it.variantId)}`) });
}

/**
 * 常买清单：逐渠道拉取历史订单，按 variantId 聚合购买次数。
 * 平台渠道 + 各店铺渠道并行查询；已取消订单不计入。
 */
async function loadFrequent(force = false) {
    if (loadingFrequent.value) return;
    if (frequentLoaded.value && !force) return;
    loadingFrequent.value = true;
    try {
        const stores = await fetchStoreList().catch(() => [] as any[]);
        const platformToken = (import.meta.env.VITE_CHANNEL_TOKEN as string) || '__default_channel__';
        const channels = new Map<string, { name: string; store: any | null }>();
        channels.set(platformToken, { name: locale.t('orders.platform'), store: null });
        for (const s of stores) {
            if (!s?.channelToken) continue;
            channels.set(String(s.channelToken), { name: s.name || '', store: s });
        }
        const results = await Promise.all(Array.from(channels.entries()).map(async ([token, meta]) => {
            const res: any = await getOrdersForChannel(token, { take: 20, skip: 0, sort: { createdAt: 'DESC' } }).catch(() => null);
            return { token, meta, items: res?.myOrders?.items || [] };
        }));

        const agg = new Map<string, any>();
        const seenOrders = new Set<string>();
        for (const r of results) {
            for (const o of r.items) {
                if (!o?.id || seenOrders.has(String(o.id))) continue;
                seenOrders.add(String(o.id));
                if (String(o.state) === 'Cancelled') continue;
                for (const line of o.lines || []) {
                    const v = line?.productVariant;
                    if (!v?.id) continue;
                    const key = String(v.id);
                    const prev = agg.get(key);
                    const count = Number(line.quantity) || 1;
                    const at = new Date(o.createdAt || 0).getTime() || 0;
                    if (prev) {
                        prev.count += count;
                        if (at > prev.lastAt) prev.lastAt = at;
                        continue;
                    }
                    agg.set(key, {
                        variantId: key,
                        productId: v.productId ? String(v.productId) : '',
                        name: v.name || '',
                        image: line.featuredAsset?.preview || '',
                        price: Number(line.unitPriceWithTax ?? line.proratedLinePrice ?? 0),
                        storeName: r.meta.store?.name || r.meta.name || '',
                        channelToken: r.token,
                        channelId: r.meta.store?.channelId != null ? String(r.meta.store.channelId) : '',
                        routes: (r.meta.store?.routesEnabled || []).join(','),
                        count,
                        lastAt: at,
                    });
                }
            }
        }
        frequent.value = Array.from(agg.values())
            .sort((a, b) => (b.count - a.count) || (b.lastAt - a.lastAt))
            .slice(0, 20);
        frequentLoaded.value = true;
    } finally {
        loadingFrequent.value = false;
    }
}

function goHome() {
    uni.switchTab({ url: '/pages/home/index' });
}
</script>

<style scoped lang="scss">
.hist-page { min-height: 100vh; background: $bg-color; padding: 20rpx 20rpx 40rpx; box-sizing: border-box; }
.hist-tabs { display: flex; gap: 12rpx; margin-bottom: 16rpx; }
.hist-tab { flex: 1; text-align: center; padding: 18rpx 0; font-size: 26rpx; border-radius: $radius-md; background: $surface; color: $text-color-secondary; border: 1rpx solid transparent;
  &.on { color: $brand-color; border-color: $brand-color; background: $brand-color-light; font-weight: 600; }
  &__n { font-size: 22rpx; color: inherit; margin-left: 6rpx; } }
.hist-top { display: flex; align-items: center; justify-content: space-between; padding: 6rpx 8rpx 14rpx;
  &__hint { font-size: 22rpx; color: $text-color-placeholder; }
  &__ops { display: flex; align-items: center; gap: 12rpx; }
  &__mode { font-size: 22rpx; color: $brand-color; padding: 6rpx 18rpx; border: 1rpx solid $brand-color; border-radius: 999rpx; }
  &__clear { font-size: 22rpx; color: $text-color-placeholder; padding: 6rpx 18rpx; border: 1rpx solid $border-color; border-radius: 999rpx; } }
.hist-group { display: flex; flex-direction: column; gap: 12rpx;
  &__head { display: flex; align-items: center; gap: 10rpx; padding: 4rpx 8rpx; }
  &__name { font-size: 26rpx; font-weight: 600; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__n { font-size: 20rpx; color: $brand-color; background: $brand-color-light; border-radius: 999rpx; padding: 2rpx 14rpx; flex-shrink: 0; } }
.hist-loading { padding: 100rpx 0; text-align: center; font-size: 26rpx; color: $text-color-placeholder; }
.hist-list { display: flex; flex-direction: column; gap: 16rpx; }
.hist-row { display: flex; align-items: center; gap: 18rpx; background: $surface; border-radius: $radius-md; padding: 20rpx;
  &__img { border-radius: $radius-sm; flex-shrink: 0; background: $bg-color; }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
  &__title { display: flex; align-items: center; gap: 10rpx; }
  &__name { font-size: 28rpx; color: $text-color; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__count { flex-shrink: 0; font-size: 20rpx; color: #b45309; background: #fff4e6; border-radius: 999rpx; padding: 2rpx 12rpx; }
  &__store { font-size: 22rpx; color: $text-color-secondary; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__foot { display: flex; align-items: center; gap: 16rpx; }
  &__price { font-size: 28rpx; color: $price-color; font-weight: 600; }
  &__time { font-size: 20rpx; color: $text-color-placeholder; }
  &__del { width: 48rpx; height: 48rpx; line-height: 44rpx; text-align: center; font-size: 32rpx; color: $text-color-placeholder; border: 1rpx solid $border-color; border-radius: 50%; flex-shrink: 0; }
  &__arrow { font-size: 32rpx; color: $text-color-placeholder; }
  &__add { flex-shrink: 0; font-size: 22rpx; color: $brand-color; border: 1rpx solid $brand-color; border-radius: 999rpx; padding: 8rpx 20rpx; } }
.hist-empty { padding: 120rpx 0; display: flex; flex-direction: column; align-items: center; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; }
  &__btn { margin-top: 12rpx; background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; padding: 0 56rpx; height: 80rpx; line-height: 80rpx; } }
</style>
