<template>
  <view class="tp-page">
    <view class="tp-hero">
      <text class="tp-hero__ico">🌶️</text>
      <text class="tp-hero__title">{{ $t('taste.title') }}</text>
      <text class="tp-hero__sub">{{ $t('taste.subtitle') }}</text>
    </view>

    <!-- 辣度：单选 -->
    <view class="tp-card">
      <view class="tp-card__head">
        <text class="tp-card__label">{{ $t('taste.spicyLabel') }}</text>
        <text class="tp-card__hint">{{ $t('taste.spicyHint') }}</text>
      </view>
      <view class="tp-chips">
        <view
          v-for="k in SPICY_KEYS"
          :key="'sp-' + k"
          class="tp-chip"
          :class="{ on: profile.spicy === k }"
          @click="pickSpicy(k)"
        >{{ labels.spicy(k) }}</view>
      </view>
    </view>

    <!-- 忌口：多选 -->
    <view class="tp-card">
      <view class="tp-card__head">
        <text class="tp-card__label">{{ $t('taste.avoidLabel') }}</text>
        <text class="tp-card__hint">{{ $t('taste.avoidHint') }}</text>
      </view>
      <view class="tp-chips">
        <view
          v-for="k in AVOID_KEYS"
          :key="'av-' + k"
          class="tp-chip"
          :class="{ on: profile.avoid.includes(k) }"
          @click="toggleAvoid(k)"
        >{{ labels.avoid(k) }}</view>
      </view>
    </view>

    <!-- 过敏原：多选，进店对菜品红字提示 -->
    <view class="tp-card">
      <view class="tp-card__head">
        <text class="tp-card__label">{{ $t('taste.allergenLabel') }}</text>
        <text class="tp-card__hint">{{ $t('taste.allergenHint') }}</text>
      </view>
      <view class="tp-chips">
        <view
          v-for="k in ALLERGEN_KEYS"
          :key="'al-' + k"
          class="tp-chip tp-chip--warn"
          :class="{ on: profile.allergens.includes(k) }"
          @click="toggleAllergen(k)"
        >{{ labels.allergen(k) }}</view>
      </view>
    </view>

    <!-- 餐具份数 -->
    <view class="tp-card">
      <view class="tp-card__head">
        <text class="tp-card__label">{{ $t('taste.tablewareLabel') }}</text>
        <text class="tp-card__hint">{{ $t('taste.tablewareHint') }}</text>
      </view>
      <view class="tp-chips">
        <view
          v-for="n in TABLEWARE_OPTIONS"
          :key="'tw-' + n"
          class="tp-chip"
          :class="{ on: profile.tableware === n }"
          @click="pickTableware(n)"
        >{{ n === 0 ? labels.noTableware : String(n) }}</view>
      </view>
    </view>

    <!-- 带入效果预览 -->
    <view class="tp-preview">
      <text class="tp-preview__title">{{ $t('taste.previewTitle') }}</text>
      <text v-if="previewText" class="tp-preview__text">{{ previewText }}</text>
      <text v-else class="tp-preview__empty">{{ $t('taste.previewEmpty') }}</text>
    </view>

    <button class="tp-save" @click="save">{{ $t('taste.save') }}</button>
    <text class="tp-clear" @click="clearAll">{{ $t('taste.clear') }}</text>
    <text class="tp-tip">{{ $t('taste.tip') }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useLocaleStore } from '../../stores/locale';
import {
  SPICY_KEYS,
  AVOID_KEYS,
  ALLERGEN_KEYS,
  EMPTY_PROFILE,
  readTasteProfile,
  writeTasteProfile,
  clearTasteProfile,
  tasteNoteParts,
  tasteLabels,
  type TasteProfile,
  type SpicyKey,
  type AvoidKey,
  type AllergenKey,
} from '../../utils/taste-profile';

const locale = useLocaleStore();
const TABLEWARE_OPTIONS = [0, 1, 2, 3, 4, 5];

const profile = ref<TasteProfile>(readTasteProfile());
const labels = computed(() => tasteLabels((k: string) => locale.t(k)));
const previewText = computed(() => tasteNoteParts(profile.value, labels.value).join('；'));

function pickSpicy(k: SpicyKey) {
  profile.value = { ...profile.value, spicy: profile.value.spicy === k ? '' : k };
}

function toggleAvoid(k: AvoidKey) {
  const on = profile.value.avoid.includes(k);
  profile.value = {
    ...profile.value,
    avoid: on ? profile.value.avoid.filter((x) => x !== k) : [...profile.value.avoid, k],
  };
}

function toggleAllergen(k: AllergenKey) {
  const on = profile.value.allergens.includes(k);
  profile.value = {
    ...profile.value,
    allergens: on ? profile.value.allergens.filter((x) => x !== k) : [...profile.value.allergens, k],
  };
}

function pickTableware(n: number) {
  profile.value = { ...profile.value, tableware: n };
}

function save() {
  writeTasteProfile(profile.value);
  uni.showToast({ title: locale.t('taste.saved'), icon: 'success' });
  setTimeout(() => uni.navigateBack(), 600);
}

function clearAll() {
  clearTasteProfile();
  profile.value = { ...EMPTY_PROFILE, avoid: [], allergens: [] };
  uni.showToast({ title: locale.t('taste.cleared'), icon: 'none' });
}
</script>

<style lang="scss" scoped>
.tp-page { min-height: 100vh; background: $bg-color; padding: 24rpx 24rpx 60rpx; box-sizing: border-box; }
.tp-hero {
  display: flex; flex-direction: column; align-items: center; gap: 10rpx;
  background: linear-gradient(135deg, #ff8a3d, #ff6600); border-radius: $radius-md;
  padding: 40rpx 30rpx; margin-bottom: 20rpx;
  &__ico { font-size: 52rpx; }
  &__title { font-size: 34rpx; font-weight: 700; color: #fff; }
  &__sub { font-size: 23rpx; color: rgba(255, 255, 255, 0.88); text-align: center; line-height: 1.5; }
}
.tp-card {
  background: $surface; border-radius: $radius-md; padding: 26rpx; margin-bottom: 20rpx;
  display: flex; flex-direction: column; gap: 18rpx;
  &__head { display: flex; align-items: baseline; justify-content: space-between; gap: 12rpx; }
  &__label { font-size: 27rpx; font-weight: 600; color: $text-color; }
  &__hint { font-size: 21rpx; color: $text-color-placeholder; }
}
.tp-chips { display: flex; flex-wrap: wrap; gap: 14rpx; }
.tp-chip {
  padding: 14rpx 28rpx; border-radius: 999rpx; font-size: 25rpx;
  color: $text-color-secondary; background: $bg-color; border: 2rpx solid transparent;
  &.on { color: $brand-color; background: $brand-color-light; border-color: $brand-color; font-weight: 600; }
  &--warn.on { color: #b42318; background: #fff2f0; border-color: #f3b6b0; }
}
.tp-preview {
  background: $surface; border: 2rpx dashed $brand-color; border-radius: $radius-md;
  padding: 24rpx; margin-bottom: 24rpx;
  &__title { display: block; font-size: 22rpx; color: $brand-color; font-weight: 600; }
  &__text { display: block; margin-top: 10rpx; font-size: 26rpx; color: $text-color; line-height: 1.6; }
  &__empty { display: block; margin-top: 10rpx; font-size: 24rpx; color: $text-color-placeholder; }
}
.tp-save {
  height: 88rpx; line-height: 88rpx; border-radius: 44rpx; background: $brand-color;
  color: #fff; font-size: 30rpx; font-weight: 600; border: none;
}
.tp-save::after { border: none; }
.tp-clear { display: block; margin-top: 20rpx; text-align: center; font-size: 24rpx; color: $text-color-secondary; }
.tp-tip { display: block; margin-top: 18rpx; font-size: 22rpx; color: $text-color-placeholder; line-height: 1.6; text-align: center; }
</style>
