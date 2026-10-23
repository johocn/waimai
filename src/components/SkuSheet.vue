<template>
  <view v-if="visible" class="sku-mask" @click.self="close">
    <view class="sku-sheet">
      <view class="sku-sheet__head">
        <VImage :src="variantAsset" width="200rpx" height="200rpx" @tap="previewImage" />
        <view class="sku-sheet__head-info">
          <text class="sku-sheet__name">{{ product?.name }}</text>
          <view class="sku-sheet__meta" v-if="metaText">
            <text v-for="(m, i) in metaText.split(' · ')" :key="i" class="sku-sheet__meta-item">{{ m }}</text>
          </view>
          <PriceTag :price="currentVariant?.priceWithTax || 0" :large="true" />
          <text class="sku-sheet__stock">{{ stockText }}</text>
          <text class="sku-sheet__picked">{{ $t('comp.selected').replace('{s}', pickedText).replace('{n}', String(quantity)) }}</text>
        </view>
        <view class="sku-sheet__tools">
          <text class="sku-sheet__share" @click="emit('share', product)">↗</text>
          <text class="sku-sheet__close" @click="close">✕</text>
        </view>
      </view>

      <scroll-view scroll-y class="sku-sheet__body">
        <!-- 商品详情：纯文本描述（富文本标签已剥离） -->
        <view class="sku-detail" v-if="description">
          <text class="sku-detail__title">{{ $t('comp.productDetail') }}</text>
          <text class="sku-detail__text">{{ description }}</text>
        </view>
        <view v-for="group in optionGroups" :key="group.id" class="sku-group">
          <text class="sku-group__label">{{ group.name }} ({{ group.options.length }})</text>
          <view class="sku-group__options">
            <text
              v-for="opt in group.options"
              :key="opt.id"
              class="sku-option"
              :class="{ active: selected[group.id] === opt.id, disabled: !isOptionEnabled(group, opt) }"
              @click="pickOption(group, opt)"
            >{{ opt.name }}</text>
          </view>
        </view>

        <view class="sku-qty">
          <text class="sku-qty__label">{{ $t('comp.quantity') }}</text>
          <view class="qty-control">
            <text class="qty-btn" @click="changeQty(-1)">-</text>
            <text class="qty-num">{{ quantity }}</text>
            <text class="qty-btn" @click="changeQty(1)">+</text>
          </view>
        </view>
      </scroll-view>

      <view class="sku-sheet__bar">
        <button class="sku-sheet__btn sku-sheet__btn--cart" :disabled="!canBuy" @click="emitAction('cart')">{{ $t('comp.addToCart') }}</button>
        <button class="sku-sheet__btn sku-sheet__btn--buy" :disabled="!canBuy" @click="emitAction('buy')">{{ $t('comp.buyNow') }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import VImage from './VImage.vue';
import PriceTag from './PriceTag.vue';
import { useLocaleStore } from '../stores/locale';
import { plainDescription } from '../utils/store-display';

const locale = useLocaleStore();

const props = defineProps<{
    visible: boolean;
    product: any;
    /** 秒杀活动（用于详情页 applyFlashSale 联动） */
    activityId?: string;
    /** 上次选择的变体：可用时优先选中（规格记忆） */
    preferredVariantId?: string;
}>();
const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void;
    (e: 'action', payload: { action: 'cart' | 'buy'; variantId: string; quantity: number }): void;
    (e: 'share', product: any): void;
}>();

/** 商品详情：描述纯文本化，空描述不展示详情块 */
const description = computed(() => plainDescription(props.product?.description));

/** 头部标签：评分 · 评价数 · 月售（无数据不展示） */
const metaText = computed(() => {
    const cf = props.product?.customFields || {};
    const parts: string[] = [];
    const count = Number(cf.reviewCount) || 0;
    if (count > 0) {
        parts.push(`★ ${(Number(cf.reviewRating) || 0).toFixed(1)}`);
        parts.push(locale.t('comp.reviewCountShort').replace('{n}', String(count)));
    }
    const sold = Number(cf.waimaiMonthlySales) || 0;
    if (sold > 0) parts.push(locale.t('comp.monthlySales').replace('{n}', String(sold)));
    return parts.join(' · ');
});

const selected = ref<Record<string, string>>({});
const quantity = ref(1);

const optionGroups = computed(() => props.product?.optionGroups || []);

const currentVariant = computed(() => {
    const variants = props.product?.variants || [];
    if (!variants.length) return null;
    const chosen = Object.values(selected.value);
    if (!chosen.length) return variants[0];
    return variants.find((v: any) => (v.options || []).every((o: any) => chosen.includes(o.id))) || null;
});

const variantAsset = computed(() => currentVariant.value?.featuredAsset?.preview || props.product?.featuredAsset?.preview || '');

/** 头部商品图点击放大（第 39 轮）：多规格切换后展示当前变体图 */
function previewImage() {
    const url = variantAsset.value;
    if (!url) return;
    uni.previewImage({ urls: [url], current: url });
}

/** shop-api 库存：枚举 IN_STOCK / LOW_STOCK / OUT_OF_STOCK / null，兼容旧数字库存 */
type StockState = 'out' | 'low' | 'in' | 'unknown';
function stockOf(v: any): StockState {
    const raw = v?.stockLevel;
    if (raw === 'OUT_OF_STOCK') return 'out';
    if (raw === 'LOW_STOCK') return 'low';
    if (raw === 'IN_STOCK') return 'in';
    if (raw == null) return 'unknown';
    const n = Number(raw);
    if (!Number.isFinite(n)) return 'unknown';
    return n <= 0 ? 'out' : 'in';
}

const stockText = computed(() => {
    const v = currentVariant.value;
    if (!v) return locale.t('comp.noStock');
    const state = stockOf(v);
    if (state === 'out') return locale.t('comp.noStock');
    if (state === 'low') return locale.t('comp.lowStock');
    if (state === 'in') {
        const n = Number(v.stockLevel);
        // 仅旧数字库存显示「库存 n」；枚举 IN_STOCK 不显示数字
        if (Number.isFinite(n)) return locale.t('comp.stock').replace('{n}', String(n));
    }
    return '';
});

const canBuy = computed(() => {
    const v = currentVariant.value;
    return !!v && v.enabled !== false && stockOf(v) !== 'out';
});

const pickedText = computed(() => {
    const names: string[] = [];
    for (const g of optionGroups.value) {
        const id = selected.value[g.id];
        const opt = (g.options || []).find((o: any) => o.id === id);
        if (opt) names.push(opt.name);
    }
    if (names.length) return names.join(' / ');
    // 单规格商品（无规格组）没有「未选」状态：直接显示当前变体名，不出现「请选择规格」
    if (!optionGroups.value.length) return currentVariant.value?.name || locale.t('comp.pickSpec');
    return locale.t('comp.pickSpec');
});

/** 某选项是否可点：把它代入当前已选后，必须能命中一个存在的变体（库存为 0 也算命中但置灰不可选） */
function isOptionEnabled(group: any, opt: any): boolean {
    const trial = { ...selected.value, [group.id]: opt.id };
    const full = optionGroups.value.every((g: any) => !!trial[g.id]);
    if (!full) return true;
    const hit = (props.product?.variants || []).find((v: any) =>
        (v.options || []).every((o: any) => Object.values(trial).includes(o.id)),
    );
    if (!hit) return false;
    if (hit.enabled === false) return false;
    return stockOf(hit) !== 'out';
}

function pickOption(group: any, opt: any) {
    if (!isOptionEnabled(group, opt)) return;
    selected.value = { ...selected.value, [group.id]: opt.id };
}

function changeQty(delta: number) {
    const next = quantity.value + delta;
    if (next < 1) return;
    const raw = currentVariant.value?.stockLevel;
    // 枚举库存（IN_STOCK / LOW_STOCK）不做数量上限，仅旧数字库存保留上限逻辑
    const isEnumStock = raw === 'IN_STOCK' || raw === 'LOW_STOCK' || raw === 'OUT_OF_STOCK';
    const stock = Number(raw);
    if (!isEnumStock && Number.isFinite(stock) && stock > 0 && next > stock) return;
    quantity.value = next;
}

function close() {
    emit('update:visible', false);
}

function emitAction(action: 'cart' | 'buy') {
    if (!canBuy.value || !currentVariant.value) return;
    emit('action', { action, variantId: currentVariant.value.id, quantity: quantity.value });
}

/** 打开时优先恢复上次选择，否则自动选第一个可用的规格组合 */
watch(
    () => props.visible,
    (v) => {
        if (!v) return;
        const init: Record<string, string> = {};
        const pref = String(props.preferredVariantId || '');
        const prefVariant = pref
            ? (props.product?.variants || []).find((x: any) => String(x.id) === pref && x.enabled !== false && stockOf(x) !== 'out')
            : null;
        if (prefVariant) {
            for (const o of prefVariant.options || []) {
                for (const g of optionGroups.value) {
                    if ((g.options || []).some((x: any) => x.id === o.id)) init[g.id] = o.id;
                }
            }
        } else {
            for (const g of optionGroups.value) {
                const firstOk = (g.options || []).find((o: any) => isOptionEnabled(g, o));
                if (firstOk) init[g.id] = firstOk.id;
            }
        }
        selected.value = init;
        quantity.value = 1;
    },
);
</script>

<style lang="scss" scoped>
.sku-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 200; display: flex; align-items: flex-end; }
.sku-sheet { width: 100%; background: var(--w-surface, #fff); border-top-left-radius: 24rpx; border-top-right-radius: 24rpx; max-height: 80vh; display: flex; flex-direction: column;
    &__head { display: flex; gap: 20rpx; padding: 24rpx; border-bottom: 1rpx solid var(--w-border, #eee); position: relative; }
    &__head-info { flex: 1; display: flex; flex-direction: column; gap: 8rpx; min-width: 0; }
    &__name { font-size: 30rpx; font-weight: 600; color: var(--w-text, #333); }
    &__meta { display: flex; flex-wrap: wrap; gap: 8rpx; }
    &__meta-item { font-size: 22rpx; color: var(--w-text-muted, #999); background: var(--w-surface-muted, #f5f5f5); border-radius: 6rpx; padding: 2rpx 10rpx; }
    &__stock { font-size: 24rpx; color: var(--w-text-muted, #999); }
    &__picked { font-size: 24rpx; color: var(--w-text, #666); }
    &__tools { position: absolute; right: 20rpx; top: 12rpx; display: flex; align-items: center; gap: 20rpx; }
    &__share { font-size: 34rpx; color: var(--w-text-muted, #999); padding: 4rpx; }
    &__close { font-size: 32rpx; color: var(--w-text-muted, #ccc); padding: 4rpx; }
    &__body { flex: 1; padding: 0 24rpx; box-sizing: border-box; }
    &__bar { display: flex; gap: 16rpx; padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid var(--w-border, #eee); }
    &__btn { flex: 1; height: 80rpx; font-size: 28rpx; border-radius: $radius-md; border: none;
        &--cart { background: $brand-color-light; color: var(--w-brand-text, #ff6600); }
        &--buy { background: $brand-color; color: #fff; }
    }
}
.sku-detail { padding: 20rpx 0 4rpx; border-bottom: 1rpx solid var(--w-border, #eee);
    &__title { font-size: 26rpx; font-weight: 600; color: var(--w-text, #333); display: block; margin-bottom: 10rpx; }
    &__text { font-size: 24rpx; line-height: 1.6; color: var(--w-text, #666); display: block; }
}
.sku-group { padding: 20rpx 0;
    &__label { font-size: 26rpx; color: var(--w-text, #333); }
    &__options { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 12rpx; }
}
.sku-option { padding: 10rpx 28rpx; font-size: 24rpx; border: 1rpx solid var(--w-border, #eee); border-radius: $radius-sm; color: var(--w-text, #333);
    &.active { border-color: $brand-color; color: var(--w-brand-text, #ff6600); background: $brand-color-light; }
    &.disabled { color: var(--w-text-muted, #ccc); background: var(--w-surface-muted, #f7f7f7); border-color: var(--w-border, #eee); }
}
.sku-qty { display: flex; align-items: center; justify-content: space-between; padding: 20rpx 8rpx 30rpx 0; box-sizing: border-box;
    &__label { font-size: 26rpx; color: var(--w-text, #333); }
}
.qty-control { display: flex; align-items: center; border: 1rpx solid var(--w-border, #eee); border-radius: $radius-sm; flex-shrink: 0; }
.qty-btn { width: 56rpx; height: 48rpx; text-align: center; line-height: 48rpx; font-size: 28rpx; background: var(--w-surface-muted, #f5f5f5); color: var(--w-text, #333); }
.qty-num { width: 64rpx; height: 48rpx; text-align: center; line-height: 48rpx; font-size: 26rpx; border-left: 1rpx solid var(--w-border, #eee); border-right: 1rpx solid var(--w-border, #eee); color: var(--w-text, #333); }
</style>
