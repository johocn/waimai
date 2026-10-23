<template>
  <view class="rp-page">
    <view class="rp-head">
      <text class="rp-title">{{ $t('randomPick.title') }}</text>
      <text class="rp-sub">{{ $t('randomPick.sub') }}</text>
    </view>

    <view class="rp-filter">
      <text class="rp-filter__label">{{ $t('randomPick.budget') }}</text>
      <view class="rp-chips">
        <view
          v-for="b in budgets"
          :key="'b-' + b.value"
          class="rp-chip"
          :class="{ on: budget === b.value }"
          @click="pickBudget(b.value)"
        >{{ b.label }}</view>
      </view>
    </view>
    <view class="rp-filter" v-if="categories.length > 1">
      <text class="rp-filter__label">{{ $t('randomPick.category') }}</text>
      <view class="rp-chips">
        <view class="rp-chip" :class="{ on: !category }" @click="pickCategory('')">{{ $t('randomPick.catAll') }}</view>
        <view
          v-for="c in categories"
          :key="'c-' + c"
          class="rp-chip"
          :class="{ on: category === c }"
          @click="pickCategory(c)"
        >{{ c }}</view>
      </view>
    </view>

    <view v-if="loading" class="rp-card rp-card--loading">
      <text class="rp-loading">🎲 {{ $t('randomPick.rolling') }}</text>
    </view>

    <template v-else-if="store">
      <view class="rp-store" @click="goShop">
        <image v-if="store.logo" class="rp-store__logo" :src="store.logo" mode="aspectFill" />
        <view v-else class="rp-store__logo rp-store__logo--txt">{{ (store.name || '?').slice(0, 1) }}</view>
        <view class="rp-store__body">
          <text class="rp-store__name">{{ store.name }}</text>
          <text class="rp-store__meta">{{ storeMeta }}</text>
        </view>
        <text class="rp-store__chev">›</text>
      </view>

      <view class="rp-items">
        <view v-for="(it, i) in combo" :key="'rp-' + it.v.id + '-' + i" class="rp-item">
          <VImage :src="it.p.featuredAsset?.preview" width="96rpx" height="96rpx" class="rp-item__img" />
          <view class="rp-item__body">
            <text class="rp-item__name">{{ it.p.name }}</text>
            <text class="rp-item__spec">{{ variantLabel(it.v) }}</text>
          </view>
          <text class="rp-item__price">¥{{ fen(it.v.priceWithTax) }}</text>
        </view>
        <view class="rp-sum" v-if="combo.length">
          <text>{{ $t('randomPick.comboCount').replace('{n}', String(combo.length)) }}</text>
          <text class="rp-sum__amt">¥{{ fen(comboTotal(combo)) }}</text>
        </view>
      </view>

      <view class="rp-note" v-if="budget != null && combo.length">
        {{ $t('randomPick.budgetLeft').replace('{d}', fen(Math.max(0, budget - comboTotal(combo)))) }}
      </view>

      <view class="rp-acts">
        <view class="rp-btn rp-btn--ghost" @click="shake">{{ $t('randomPick.again') }}</view>
        <view class="rp-btn rp-btn--ghost" @click="goShop">{{ $t('randomPick.enterShop') }}</view>
      </view>
      <view class="rp-btn rp-btn--primary" :class="{ busy: adding }" @click="addAll">
        {{ adding ? $t('randomPick.adding') : $t('randomPick.addAll') }}
      </view>
    </template>

    <view v-else class="rp-empty">
      <text class="rp-empty__ico">🍽️</text>
      <text class="rp-empty__txt">{{ emptyText }}</text>
      <view class="rp-btn rp-btn--primary" @click="shake">{{ $t('randomPick.again') }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchStoreList, fetchProductListForChannel } from '../../api/queries/waimai';
import { addItemToOrderInChannel } from '../../api/mutations/cart';
import { useTenantStore } from '../../stores/tenant';
import { useLocaleStore } from '../../stores/locale';
import { eligibleStores, pickStore, pickCombo, comboTotal, variantLabel, productCategory } from '../../utils/random-pick';
import { getStoreStatus } from '../../utils/store-status';
import VImage from '../../components/VImage.vue';

const locale = useLocaleStore();
const tenant = useTenantStore();

const budgets = computed(() => [
  { label: '¥20', value: 2000 },
  { label: '¥30', value: 3000 },
  { label: '¥50', value: 5000 },
  { label: locale.t('randomPick.budgetAny'), value: null as number | null },
]);

const budget = ref<number | null>(3000);
const category = ref('');
const loading = ref(false);
const adding = ref(false);
const stores = ref<any[]>([]);
const store = ref<any>(null);
const products = ref<any[]>([]);
const combo = ref<any[]>([]);
const emptyText = ref('');

const categories = computed(() => {
  const set = new Set<string>();
  for (const p of products.value) {
    const c = productCategory(p);
    if (c) set.add(c);
  }
  return Array.from(set).slice(0, 8);
});

const storeMeta = computed(() => {
  const s = store.value;
  if (!s) return '';
  const st = getStoreStatus(s.businessHours);
  const status = st.state === 'closed'
    ? locale.t('randomPick.closed').replace('{t}', st.nextOpenHM)
    : st.state === 'closing'
      ? locale.t('randomPick.closing')
      : locale.t('randomPick.open');
  const min = Number(s.minOrderAmount);
  const minText = min > 0 ? locale.t('randomPick.minOrder').replace('{d}', (min / 100).toFixed(0)) : '';
  return [status, minText, Number(s.deliveryFee) > 0 ? locale.t('randomPick.fee').replace('{d}', (Number(s.deliveryFee) / 100).toFixed(2)) : locale.t('randomPick.feeFree')]
    .filter(Boolean)
    .join(' · ');
});

function fen(v: any): string {
  return (Number(v || 0) / 100).toFixed(2);
}

function pickBudget(v: number | null) {
  budget.value = v;
  void shake();
}

function pickCategory(c: string) {
  category.value = c;
  void shake();
}

async function shake() {
  if (loading.value) return;
  loading.value = true;
  emptyText.value = '';
  try {
    if (!stores.value.length) stores.value = await fetchStoreList();
    const pool = eligibleStores(stores.value, budget.value);
    if (!pool.length) {
      store.value = null;
      combo.value = [];
      emptyText.value = locale.t('randomPick.emptyBudget');
      return;
    }
    const s = pickStore(pool, Math.random);
    if (!s) {
      store.value = null;
      combo.value = [];
      emptyText.value = locale.t('randomPick.emptyBudget');
      return;
    }
    products.value = await fetchProductListForChannel(s.channelToken);
    // 分类换了店铺可能不存在：回退全部
    if (category.value && !categories.value.includes(category.value)) category.value = '';
    let items = pickCombo(products.value, budget.value, Math.random, 3, category.value);
    if (!items.length && category.value) {
      category.value = '';
      items = pickCombo(products.value, budget.value, Math.random, 3, '');
    }
    store.value = s;
    combo.value = items;
    if (!items.length) emptyText.value = locale.t('randomPick.emptyDishes');
  } catch (e: any) {
    store.value = null;
    combo.value = [];
    emptyText.value = e?.message || locale.t('randomPick.fail');
  } finally {
    loading.value = false;
  }
}

function goShop() {
  const s = store.value;
  if (!s) return;
  const routes = (s.routesEnabled || []).join(',');
  const cid = s.channelId != null ? `&cid=${s.channelId}` : '';
  uni.navigateTo({
    url: `/pages/shop/menu?token=${encodeURIComponent(s.channelToken)}&name=${encodeURIComponent(s.name)}&routes=${encodeURIComponent(routes)}${cid}`,
  });
}

async function addAll() {
  const s = store.value;
  if (!s || !combo.value.length || adding.value) return;
  adding.value = true;
  try {
    await tenant.switchTenant(s.channelToken);
    let ok = 0;
    for (const it of combo.value) {
      try {
        const res: any = await addItemToOrderInChannel(s.channelToken, String(it.v.id), 1);
        if (res?.addItemToOrder?.errorCode) continue;
        ok++;
      } catch {
        /* 单件失败跳过 */
      }
    }
    if (!ok) throw new Error(locale.t('randomPick.addFail'));
    uni.showToast({ title: locale.t('randomPick.added').replace('{n}', String(ok)), icon: 'none' });
    setTimeout(goShop, 500);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('randomPick.addFail'), icon: 'none' });
  } finally {
    adding.value = false;
  }
}

onLoad(() => { void shake(); });
</script>

<style scoped lang="scss">
.rp-page { min-height: 100vh; background: $bg-color; padding: 24rpx 20rpx 60rpx; box-sizing: border-box; }
.rp-title { font-size: 38rpx; font-weight: 700; color: $text-color; }
.rp-sub { display: block; margin-top: 8rpx; font-size: 24rpx; color: $text-color-secondary; }
.rp-filter { margin-top: 24rpx;
  &__label { display: block; font-size: 22rpx; color: $text-color-secondary; margin-bottom: 10rpx; }
}
.rp-chips { display: flex; flex-wrap: wrap; gap: 12rpx; }
.rp-chip { padding: 10rpx 22rpx; border-radius: 999rpx; font-size: 24rpx; color: $text-color-secondary;
  background: $surface; border: 1rpx solid $border-color;
  &.on { color: $brand-color; border-color: $brand-color; background: $brand-color-light; font-weight: 600; } }
.rp-card--loading { margin-top: 32rpx; background: $surface; border-radius: $radius-md; padding: 80rpx 0; text-align: center; }
.rp-loading { font-size: 28rpx; color: $text-color-secondary; }
.rp-store { display: flex; align-items: center; gap: 18rpx; margin-top: 28rpx; background: $surface;
  border-radius: $radius-md; padding: 24rpx;
  &__logo { width: 96rpx; height: 96rpx; border-radius: $radius-sm; flex-shrink: 0; background: $brand-color-light;
    &--txt { display: flex; align-items: center; justify-content: center; color: $brand-color; font-size: 38rpx; } }
  &__body { flex: 1; min-width: 0; }
  &__name { display: block; font-size: 30rpx; font-weight: 600; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__meta { display: block; margin-top: 6rpx; font-size: 22rpx; color: $text-color-secondary; }
  &__chev { font-size: 34rpx; color: $text-color-placeholder; }
}
.rp-items { margin-top: 20rpx; background: $surface; border-radius: $radius-md; padding: 8rpx 24rpx; }
.rp-item { display: flex; align-items: center; gap: 16rpx; padding: 18rpx 0; border-bottom: 1rpx solid $border-color;
  &__img { border-radius: $radius-sm; flex-shrink: 0; }
  &__body { flex: 1; min-width: 0; }
  &__name { display: block; font-size: 26rpx; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__spec { display: block; margin-top: 4rpx; font-size: 21rpx; color: $text-color-placeholder; }
  &__price { font-size: 26rpx; color: $price-color; }
}
.rp-sum { display: flex; align-items: center; justify-content: space-between; padding: 20rpx 0;
  font-size: 24rpx; color: $text-color-secondary;
  &__amt { font-size: 32rpx; font-weight: 600; color: $price-color; }
}
.rp-note { margin-top: 12rpx; font-size: 22rpx; color: $brand-color; text-align: center; }
.rp-acts { display: flex; gap: 16rpx; margin-top: 28rpx; }
.rp-btn { flex: 1; text-align: center; padding: 18rpx 0; border-radius: 999rpx; font-size: 26rpx;
  &--ghost { color: $brand-color; border: 1rpx solid $brand-color; background: $surface; }
  &--primary { margin-top: 16rpx; color: #fff; background: $brand-color; font-size: 28rpx; font-weight: 600; padding: 24rpx 0; }
  &.busy { opacity: .6; } }
.rp-empty { display: flex; flex-direction: column; align-items: center; padding: 100rpx 40rpx; text-align: center;
  &__ico { font-size: 64rpx; }
  &__txt { margin-top: 20rpx; font-size: 26rpx; color: $text-color-secondary; line-height: 1.6; }
}
</style>
