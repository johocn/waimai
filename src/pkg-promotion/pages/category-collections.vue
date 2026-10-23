<template>
  <view class="cc-page">
    <view class="cc-hero">
      <view class="cc-hero__row">
        <text class="cc-hero__ico">🗂️</text>
        <text class="cc-hero__title">{{ $t('categoryCollections.title') }}</text>
      </view>
      <text class="cc-hero__sub">{{ heroSub }}</text>
    </view>

    <scroll-view v-if="cats.length > 1" scroll-x class="cc-cats">
      <view class="cc-cats__row">
        <text class="cc-cat" :class="{ on: !activeCat }" @tap="selectCat('')">{{ $t('categoryCollections.all') }}</text>
        <text v-for="c in cats" :key="c" class="cc-cat" :class="{ on: c === activeCat }" @tap="selectCat(c)">{{ c }}</text>
      </view>
    </scroll-view>

    <view v-if="loading" class="cc-tip">{{ $t('categoryCollections.loading') }}</view>
    <view v-else-if="!entries.length" class="cc-empty">
      <text class="cc-empty__ico">🗂️</text>
      <text class="cc-empty__text">{{ $t('categoryCollections.empty') }}</text>
      <text class="cc-empty__hint">{{ $t('categoryCollections.emptyHint') }}</text>
    </view>

    <!-- 全部：按品类分组的横滑货架 -->
    <template v-else-if="!activeCat">
      <view v-for="s in sections" :key="s.key" class="cc-sec">
        <view class="cc-sec__head">
          <view class="cc-sec__l">
            <view class="cc-sec__dot"></view>
            <text class="cc-sec__nm">{{ s.name }}</text>
            <text class="cc-sec__meta">{{ itemCount(s.count) }} · {{ storeUnit(s.storeCount) }}</text>
          </view>
          <text class="cc-sec__more" @tap="selectCat(s.key)">{{ $t('categoryCollections.more') }} ›</text>
        </view>
        <scroll-view scroll-x class="cc-row">
          <view class="cc-row__inner">
            <view v-for="d in s.items" :key="d.storeToken + '-' + d.id" class="cc-card" @tap="goStore(d)">
              <image v-if="d.image" class="cc-card__img" :src="d.image" mode="aspectFill" />
              <view v-else class="cc-card__img cc-card__img--ph"><text>{{ (d.name || '?').slice(0, 1) }}</text></view>
              <view class="cc-card__info">
                <text class="cc-card__nm">{{ d.name }}</text>
                <text class="cc-card__store">{{ d.storeName }}</text>
                <view class="cc-card__foot">
                  <text class="cc-card__price">{{ fmtPrice(d.priceFen) }}</text>
                  <view class="cc-card__add" @tap.stop="addOne(d)">+</view>
                </view>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>
      <view class="cc-note">{{ $t('categoryCollections.note') }}</view>
    </template>

    <!-- 选中品类：该品类全量双列 -->
    <template v-else>
      <view class="cc-sec__head cc-sec__head--single">
        <view class="cc-sec__l">
          <view class="cc-sec__dot"></view>
          <text class="cc-sec__nm">{{ activeCat }}</text>
          <text class="cc-sec__meta">{{ itemCount(filtered.length) }} · {{ storeUnit(filteredStoreCount) }}</text>
        </view>
        <text class="cc-sec__more" @tap="selectCat('')">{{ $t('categoryCollections.all') }} ›</text>
      </view>
      <view class="cc-grid">
        <view v-for="d in filtered" :key="d.storeToken + '-' + d.id" class="cc-card cc-card--grid" @tap="goStore(d)">
          <image v-if="d.image" class="cc-card__img" :src="d.image" mode="aspectFill" />
          <view v-else class="cc-card__img cc-card__img--ph"><text>{{ (d.name || '?').slice(0, 1) }}</text></view>
          <view class="cc-card__info">
            <text class="cc-card__nm">{{ d.name }}</text>
            <text class="cc-card__store">{{ d.storeName }}<text v-if="d.sales > 0"> · {{ $t('categoryCollections.sales').replace('{n}', String(d.sales)) }}</text></text>
            <view class="cc-card__foot">
              <text class="cc-card__price">{{ fmtPrice(d.priceFen) }}</text>
              <view class="cc-card__add" @tap.stop="addOne(d)">+</view>
            </view>
          </view>
        </view>
      </view>
      <view class="cc-note">{{ $t('categoryCollections.note') }}</view>
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
    catAggregate, catCategories, catFilter, catGroups,
    type CatEntry, type CatStoreGroup,
} from '../../utils/category-collections';

const locale = useLocaleStore();
const cart = useCartStore();

const loading = ref(true);
const entries = ref<CatEntry[]>([]);
const activeCat = ref('');
/** 有货店铺数（hero 副标题） */
const shopCount = ref(0);

/** 店铺原始信息（进店需 routesEnabled/channelId，纯函数层不携带） */
const storesMap = ref(new Map<string, any>());

const cats = computed(() => catCategories(entries.value, 8));
const sections = computed(() => catGroups(entries.value, 10));
const filtered = computed(() => catFilter(entries.value, activeCat.value));
const filteredStoreCount = computed(() => new Set(filtered.value.map((e) => e.storeToken)).size);

const heroSub = computed(() =>
    locale.t('categoryCollections.sub')
        .replace('{c}', String(cats.value.length))
        .replace('{s}', String(shopCount.value))
        .replace('{m}', String(entries.value.length)));

const itemCount = (n: number) => locale.t('categoryCollections.itemCount').replace('{n}', String(n));
const storeUnit = (n: number) => locale.t('categoryCollections.storeCount').replace('{n}', String(n));

function fmtPrice(fen: number): string {
    const y = (Number(fen) || 0) / 100;
    return '¥' + (Number.isInteger(y) ? String(y) : y.toFixed(2));
}

function selectCat(cat: string) {
    activeCat.value = cat;
}

async function load() {
    loading.value = true;
    try {
        const stores = (await fetchStoreList()).filter((s: any) => !s.paused && s.channelToken);
        const groups = await Promise.all(
            stores.map(async (s: any): Promise<CatStoreGroup | null> => {
                try {
                    const products = await fetchProductListForChannel(s.channelToken);
                    storesMap.value.set(s.channelToken, s);
                    return { token: s.channelToken, name: s.name || '', products: products ?? [] };
                } catch (e) {
                    console.warn('[category-collections] load store failed', s.channelToken, e);
                    return null;
                }
            }),
        );
        const ok = groups.filter((g): g is CatStoreGroup => !!g);
        const list = catAggregate(ok);
        shopCount.value = new Set(list.map((e) => e.storeToken)).size;
        entries.value = list;
        // 选中品类在刷新后可能已无商品 → 回到全部，避免空白
        if (activeCat.value && !catFilter(list, activeCat.value).length) activeCat.value = '';
    } finally {
        loading.value = false;
    }
}

/** 跨店加购：独立客户端固定 vendure-token 指向商品所属店铺渠道（与热销榜同机制） */
async function addOne(d: CatEntry) {
    if (!d.variantId) return uni.showToast({ title: locale.t('categoryCollections.soldOut'), icon: 'none' });
    const res: any = await addItemToOrderInChannel(d.storeToken, d.variantId, 1);
    if (res?.addItemToOrder?.errorCode) {
        uni.showToast({ title: res.addItemToOrder.message || locale.t('categoryCollections.addFail'), icon: 'none' });
        return;
    }
    cart.setOrder(res.addItemToOrder);
    uni.showToast({ title: locale.t('categoryCollections.added'), icon: 'none' });
}

function goStore(d: CatEntry) {
    goStoreToken(d.storeToken, d.storeName);
}

function goStoreToken(token: string, name: string) {
    const s = storesMap.value.get(token);
    if (s?.paused) return uni.showToast({ title: locale.t('categoryCollections.storePaused'), icon: 'none' });
    const routes = (s?.routesEnabled || []).join(',');
    const cid = s?.channelId != null ? `&cid=${s.channelId}` : '';
    uni.navigateTo({ url: `/pages/shop/menu?token=${encodeURIComponent(token)}&name=${encodeURIComponent(name || '')}&routes=${encodeURIComponent(routes)}${cid}` });
}

onLoad((q: any) => {
    if (q?.cat) activeCat.value = decodeURIComponent(String(q.cat));
    void load();
});
onShow(() => { if (!loading.value) void load(); });
</script>

<style scoped lang="scss">
.cc-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.cc-hero { background: linear-gradient(135deg, #ff6600, #ff9500); color: #fff; padding: 40rpx 30rpx 34rpx;
  &__row { display: flex; align-items: center; gap: 12rpx; }
  &__ico { font-size: 44rpx; }
  &__title { font-size: 40rpx; font-weight: bold; }
  &__sub { display: block; margin-top: 10rpx; font-size: 24rpx; opacity: .92; }
}
.cc-cats { background: $surface; white-space: nowrap;
  &__row { display: inline-flex; gap: 16rpx; padding: 16rpx 24rpx; }
}
.cc-cat { display: inline-block; font-size: 26rpx; line-height: 1; color: $text-color-secondary; background: $bg-color; border-radius: 999rpx; padding: 12rpx 26rpx;
  &.on { color: #fff; font-weight: 600; background: linear-gradient(90deg, #ff6600, #ff9500); }
}
.cc-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 80rpx 0; }
.cc-empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
  &__hint { font-size: 22rpx; color: $text-color-placeholder; text-align: center; }
}
.cc-sec { margin-top: 24rpx;
  &__head { display: flex; align-items: center; justify-content: space-between; padding: 0 24rpx 14rpx;
    &--single { padding-top: 24rpx; }
  }
  &__l { display: flex; align-items: center; gap: 12rpx; min-width: 0; }
  &__dot { width: 8rpx; height: 28rpx; border-radius: 4rpx; background: linear-gradient(180deg, #ff6600, #ff9500); }
  &__nm { font-size: 30rpx; font-weight: bold; color: var(--w-text, #333); }
  &__meta { font-size: 22rpx; color: $text-color-placeholder; }
  &__more { font-size: 22rpx; color: #ff6600; flex-shrink: 0; }
}
.cc-row { white-space: nowrap;
  &__inner { display: inline-flex; gap: 16rpx; padding: 0 24rpx 4rpx; }
}
.cc-card { width: 208rpx; flex: 0 0 auto; background: $surface; border-radius: $radius-md; overflow: hidden;
  &--grid { width: auto; }
  &__img { width: 100%; height: 150rpx; display: block; background: #fff1e6;
    &--ph { display: flex; align-items: center; justify-content: center; font-size: 44rpx; color: #ff6600; }
  }
  &__info { padding: 12rpx 14rpx 14rpx; }
  &__nm { display: block; font-size: 26rpx; font-weight: 600; color: var(--w-text, #333); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__store { display: block; margin-top: 4rpx; font-size: 21rpx; color: $text-color-placeholder; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__foot { display: flex; align-items: center; justify-content: space-between; margin-top: 8rpx; }
  &__price { font-size: 27rpx; font-weight: bold; color: #ff6600; }
  &__add { width: 40rpx; height: 40rpx; border-radius: 999rpx; background: linear-gradient(135deg, #ff6600, #ff9500); color: #fff; font-size: 28rpx; line-height: 1; display: flex; align-items: center; justify-content: center; }
}
.cc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16rpx; padding: 0 24rpx;
  .cc-card__img { height: 200rpx; }
}
.cc-note { font-size: 21rpx; color: $text-color-placeholder; text-align: center; padding: 24rpx 30rpx 10rpx; }
</style>
