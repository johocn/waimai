<template>
  <view class="hr-page">
    <view class="hr-hero">
      <view class="hr-hero__row">
        <text class="hr-hero__ico">🔥</text>
        <text class="hr-hero__title">{{ $t('hotRank.title') }}</text>
      </view>
      <text class="hr-hero__sub">{{ heroSub }}</text>
    </view>

    <scroll-view v-if="cats.length > 1" scroll-x class="hr-cats">
      <view class="hr-cats__row">
        <text v-for="c in cats" :key="c.key" class="hr-cat" :class="{ on: c.key === activeCat }" @tap="activeCat = c.key">{{ c.label }}</text>
      </view>
    </scroll-view>

    <view v-if="loading" class="hr-tip">{{ $t('hotRank.loading') }}</view>
    <view v-else-if="!filtered.length" class="hr-empty">
      <text class="hr-empty__ico">🏆</text>
      <text class="hr-empty__text">{{ $t('hotRank.empty') }}</text>
    </view>

    <template v-else>
      <!-- Top3 奖牌区：跨店聚合总榜/品类榜前三 -->
      <view v-if="top3.length" class="hr-top3" :class="{ single: top3.length === 1, double: top3.length === 2 }">
        <view v-for="(d, i) in top3" :key="d.storeToken + '-' + d.id" class="hr-medal" :class="'hr-medal--' + (i + 1)" @tap="goStore(d)">
          <text class="hr-medal__badge">{{ medals[i] }}</text>
          <image v-if="d.image" class="hr-medal__img" :src="d.image" mode="aspectFill" />
          <view v-else class="hr-medal__img hr-medal__img--ph"><text>{{ (d.name || '?').slice(0, 1) }}</text></view>
          <text class="hr-medal__name">{{ d.name }}</text>
          <text class="hr-medal__store">{{ d.storeName }}</text>
          <view class="hr-medal__foot">
            <text class="hr-medal__price">{{ fmtPrice(d.priceFen) }}</text>
            <text class="hr-medal__sales">{{ $t('hotRank.sales').replace('{n}', String(d.sales)) }}</text>
          </view>
          <view class="hr-medal__add" @tap.stop="addOne(d)">+</view>
        </view>
      </view>

      <!-- 第 4 名起按店铺分组：组头进店，行内 ⊕ 跨店加购 -->
      <view v-for="g in groups" :key="g.token" class="hr-grp">
        <view class="hr-grp__head" @tap="goStoreToken(g.token, g.name)">
          <text class="hr-grp__name">{{ g.name }}</text>
          <text class="hr-grp__sub">{{ $t('hotRank.groupSales').replace('{n}', String(g.sales)) }}</text>
          <text class="hr-grp__go">{{ $t('hotRank.goStore') }} ›</text>
        </view>
        <view v-for="d in g.items" :key="d.id" class="hr-row" @tap="goStore(d)">
          <text class="hr-row__rk">{{ d.rank }}</text>
          <image v-if="d.image" class="hr-row__img" :src="d.image" mode="aspectFill" />
          <view v-else class="hr-row__img hr-row__img--ph"><text>{{ (d.name || '?').slice(0, 1) }}</text></view>
          <view class="hr-row__info">
            <text class="hr-row__nm">{{ d.name }}</text>
            <text class="hr-row__sub">{{ (d.category ? d.category + ' · ' : '') + $t('hotRank.sales').replace('{n}', String(d.sales)) }}</text>
          </view>
          <text class="hr-row__pr">{{ fmtPrice(d.priceFen) }}</text>
          <view class="hr-row__add" @tap.stop="addOne(d)">+</view>
        </view>
      </view>

      <view class="hr-note">{{ $t('hotRank.note') }}</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow, onLoad } from '@dcloudio/uni-app';
import { fetchStoreList, fetchProductListForChannel } from '../../api/queries/waimai';
import { addItemToOrderInChannel } from '../../api/mutations/cart';
import { useCartStore } from '../../stores/cart';
import { useLocaleStore } from '../../stores/locale';
import {
    rankAggregate, rankCategories, rankByCategory, rankGroups,
    type RankEntry, type RankStoreGroup,
} from '../../utils/hot-rank';

const locale = useLocaleStore();
const cart = useCartStore();

const loading = ref(true);
const entries = ref<RankEntry[]>([]);
const storeCount = ref(0);
const activeCat = ref('');
const medals = ['🥇', '🥈', '🥉'];

/** 店铺原始信息（进店需 routesEnabled/channelId，纯函数层不携带） */
const storesMap = ref(new Map<string, any>());

const totalSales = computed(() => entries.value.reduce((s, e) => s + (e.sales || 0), 0));
const heroSub = computed(() =>
    locale.t('hotRank.sub').replace('{s}', String(storeCount.value)).replace('{m}', String(totalSales.value)));

const cats = computed(() => [
    { key: '', label: locale.t('hotRank.tabAll') },
    ...rankCategories(entries.value, 6).map((c) => ({ key: c, label: c })),
]);

/** 品类过滤后重排名次：品类 Tab 下奖牌区显示该品类前三 */
const filtered = computed(() => rankByCategory(entries.value, activeCat.value));
const top3 = computed(() => filtered.value.slice(0, 3));
const groups = computed(() => rankGroups(filtered.value.slice(3)));

function fmtPrice(fen: number): string {
    const y = (Number(fen) || 0) / 100;
    return '¥' + (Number.isInteger(y) ? String(y) : y.toFixed(2));
}

async function load() {
    loading.value = true;
    try {
        const stores = (await fetchStoreList()).filter((s: any) => !s.paused && s.channelToken);
        const groups = await Promise.all(
            stores.map(async (s: any): Promise<RankStoreGroup | null> => {
                try {
                    const products = await fetchProductListForChannel(s.channelToken);
                    storesMap.value.set(s.channelToken, s);
                    return { token: s.channelToken, name: s.name || '', products: products ?? [] };
                } catch (e) {
                    console.warn('[hot-rank] load store failed', s.channelToken, e);
                    return null;
                }
            }),
        );
        const ok = groups.filter((g): g is RankStoreGroup => !!g);
        storeCount.value = ok.length;
        entries.value = rankAggregate(ok);
    } finally {
        loading.value = false;
    }
}

/** 跨店加购：独立客户端固定 vendure-token 指向商品所属店铺渠道 */
async function addOne(d: RankEntry) {
    if (!d.variantId) return uni.showToast({ title: locale.t('hotRank.soldOut'), icon: 'none' });
    const res: any = await addItemToOrderInChannel(d.storeToken, d.variantId, 1);
    if (res?.addItemToOrder?.errorCode) {
        uni.showToast({ title: res.addItemToOrder.message || locale.t('hotRank.addFail'), icon: 'none' });
        return;
    }
    cart.setOrder(res.addItemToOrder);
    uni.showToast({ title: locale.t('hotRank.added'), icon: 'none' });
}

function goStore(d: RankEntry) {
    goStoreToken(d.storeToken, d.storeName);
}

function goStoreToken(token: string, name: string) {
    const s = storesMap.value.get(token);
    if (s?.paused) return uni.showToast({ title: locale.t('hotRank.storePaused'), icon: 'none' });
    const routes = (s?.routesEnabled || []).join(',');
    const cid = s?.channelId != null ? `&cid=${s.channelId}` : '';
    uni.navigateTo({ url: `/pages/shop/menu?token=${encodeURIComponent(token)}&name=${encodeURIComponent(name || '')}&routes=${encodeURIComponent(routes)}${cid}` });
}

onLoad(() => { void load(); });
onShow(() => { if (!loading.value) void load(); });
</script>

<style scoped lang="scss">
.hr-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.hr-hero { background: linear-gradient(135deg, #ff6600, #ff9500); color: #fff; padding: 40rpx 30rpx 34rpx;
  &__row { display: flex; align-items: center; gap: 12rpx; }
  &__ico { font-size: 44rpx; }
  &__title { font-size: 40rpx; font-weight: bold; }
  &__sub { display: block; margin-top: 10rpx; font-size: 24rpx; opacity: .92; }
}
.hr-cats { background: $surface; padding: 0 20rpx; white-space: nowrap;
  &__row { display: inline-flex; gap: 16rpx; padding: 16rpx 4rpx; }
}
.hr-cat { display: inline-block; font-size: 26rpx; line-height: 1; color: $text-color-secondary; background: $bg-color; border-radius: 999rpx; padding: 12rpx 26rpx;
  &.on { color: #fff; font-weight: 600; background: linear-gradient(90deg, #ff6600, #ff9500); }
}
.hr-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 80rpx 0; }
.hr-empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
}
.hr-top3 { display: grid; grid-template-columns: 1.15fr 1fr 1fr; gap: 16rpx; padding: 28rpx 24rpx 8rpx;
  &.double { grid-template-columns: 1fr 1fr; }
  &.single { grid-template-columns: 1fr; }
}
.hr-medal { position: relative; background: $surface; border: 1rpx solid transparent; border-radius: $radius-md; padding: 28rpx 12rpx 16rpx; text-align: center;
  &--1 { border-color: #e8a200; box-shadow: 0 6rpx 20rpx rgba(232, 162, 0, .18); }
  &__badge { position: absolute; top: -16rpx; left: 50%; transform: translateX(-50%); font-size: 30rpx; line-height: 1; background: $surface; border: 1rpx solid $border-color; border-radius: 999rpx; padding: 4rpx 10rpx; }
  &--1 &__badge { border-color: #e8a200; }
  &__img { width: 88rpx; height: 88rpx; border-radius: $radius-sm; background: $bg-color; display: block; margin: 0 auto 10rpx;
    &--ph { display: flex; align-items: center; justify-content: center; font-size: 40rpx; color: #ff6600; background: #fff1e6; }
  }
  &__name { display: block; font-size: 26rpx; font-weight: 600; color: var(--w-text, #333); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__store { display: block; font-size: 20rpx; color: $text-color-placeholder; margin-top: 4rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__foot { display: flex; align-items: baseline; justify-content: center; gap: 10rpx; margin-top: 8rpx; }
  &__price { font-size: 28rpx; font-weight: 700; color: var(--w-brand-text, #ff6600); }
  &__sales { font-size: 20rpx; color: $text-color-placeholder; }
  &__add { position: absolute; right: 12rpx; top: 12rpx; width: 44rpx; height: 44rpx; border-radius: 999rpx; background: linear-gradient(135deg, #ff6600, #ff9500); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 32rpx; font-weight: 600; }
}
.hr-grp { margin: 20rpx 24rpx 0; background: $surface; border-radius: $radius-md; padding: 4rpx 20rpx 8rpx; }
.hr-grp__head { display: flex; align-items: center; gap: 12rpx; padding: 20rpx 0 12rpx; border-bottom: 1rpx solid $border-color; }
.hr-grp__name { font-size: 28rpx; font-weight: 600; color: var(--w-text, #333); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hr-grp__sub { font-size: 20rpx; color: $text-color-placeholder; flex-shrink: 0; }
.hr-grp__go { margin-left: auto; font-size: 24rpx; font-weight: 600; color: var(--w-brand-text, #ff6600); flex-shrink: 0; }
.hr-row { display: flex; align-items: center; gap: 16rpx; padding: 18rpx 0; border-bottom: 1rpx solid $border-color;
  &:last-child { border-bottom: none; }
  &__rk { width: 40rpx; text-align: center; font-size: 26rpx; font-weight: 700; color: $text-color-placeholder; flex-shrink: 0; }
  &__img { width: 72rpx; height: 72rpx; border-radius: $radius-sm; background: $bg-color; flex-shrink: 0;
    &--ph { display: flex; align-items: center; justify-content: center; font-size: 32rpx; color: #ff6600; background: #fff1e6; }
  }
  &__info { flex: 1; min-width: 0; }
  &__nm { display: block; font-size: 28rpx; font-weight: 600; color: var(--w-text, #333); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__sub { display: block; font-size: 20rpx; color: $text-color-placeholder; margin-top: 4rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__pr { font-size: 28rpx; font-weight: 700; color: var(--w-brand-text, #ff6600); flex-shrink: 0; }
  &__add { width: 44rpx; height: 44rpx; border-radius: 999rpx; background: linear-gradient(135deg, #ff6600, #ff9500); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 32rpx; font-weight: 600; flex-shrink: 0; }
}
.hr-note { padding: 24rpx 30rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; line-height: 1.6; }
</style>
