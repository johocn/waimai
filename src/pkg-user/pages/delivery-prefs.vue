<template>
  <view class="dp-page">
    <view class="dp-hero">
      <text class="dp-hero__ico">🛵</text>
      <text class="dp-hero__title">{{ $t('deliveryPrefs.title') }}</text>
      <text class="dp-hero__sub">{{ $t('deliveryPrefs.subtitle') }}</text>
    </view>

    <view class="dp-card">
      <text class="dp-card__label">{{ $t('deliveryPrefs.pickLabel') }}</text>
      <view class="dp-options">
        <view
          v-for="o in options"
          :key="o.key || 'none'"
          class="dp-option"
          :class="{ on: pref === o.key }"
          @click="pick(o.key)"
        >
          <text class="dp-option__ico">{{ o.ico }}</text>
          <view class="dp-option__col">
            <text class="dp-option__name">{{ o.name }}</text>
            <text class="dp-option__desc">{{ o.desc }}</text>
          </view>
          <text class="dp-option__check" v-if="pref === o.key">✓</text>
        </view>
      </view>
    </view>

    <view class="dp-card">
      <view class="dp-card__head">
        <text class="dp-card__label">{{ $t('deliveryPrefs.noteLabel') }}</text>
        <text class="dp-card__count">{{ note.length }}/{{ NOTE_MAX }}</text>
      </view>
      <input
        class="dp-input"
        v-model="note"
        :maxlength="NOTE_MAX"
        :placeholder="$t('deliveryPrefs.notePh')"
      />
      <text class="dp-hint">{{ $t('deliveryPrefs.noteHint') }}</text>
    </view>

    <button class="dp-save" @click="save">{{ $t('deliveryPrefs.save') }}</button>
    <text class="dp-tip">{{ $t('deliveryPrefs.tip') }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useLocaleStore } from '../../stores/locale';
import {
  DELIVERY_PREF_NOTE_MAX,
  readDeliveryPref,
  readDeliveryPrefNote,
  writeDeliveryPref,
  writeDeliveryPrefNote,
  type DeliveryPrefKey,
} from '../../utils/delivery-prefs';

const locale = useLocaleStore();
const NOTE_MAX = DELIVERY_PREF_NOTE_MAX;
const pref = ref<DeliveryPrefKey | ''>(readDeliveryPref());
const note = ref(readDeliveryPrefNote());

const options = computed(() => [
  { key: '' as const, ico: '🚪', name: locale.t('deliveryPrefs.optDefault'), desc: locale.t('deliveryPrefs.optDefaultDesc') },
  { key: 'door' as const, ico: '🚪', name: locale.t('deliveryPrefs.optDoor'), desc: locale.t('deliveryPrefs.optDoorDesc') },
  { key: 'reception' as const, ico: '🏢', name: locale.t('deliveryPrefs.optReception'), desc: locale.t('deliveryPrefs.optReceptionDesc') },
  { key: 'call' as const, ico: '📞', name: locale.t('deliveryPrefs.optCall'), desc: locale.t('deliveryPrefs.optCallDesc') },
]);

function pick(key: DeliveryPrefKey | '') {
  pref.value = pref.value === key ? '' : key;
}

function save() {
  writeDeliveryPref(pref.value);
  writeDeliveryPrefNote(note.value);
  uni.showToast({ title: locale.t('deliveryPrefs.saved'), icon: 'success' });
  setTimeout(() => uni.navigateBack(), 600);
}
</script>

<style lang="scss" scoped>
.dp-page { min-height: 100vh; background: $bg-color; padding: 24rpx 24rpx 60rpx; box-sizing: border-box; }
.dp-hero {
  display: flex; flex-direction: column; align-items: center; gap: 10rpx;
  background: linear-gradient(135deg, #ff8a3d, #ff6600); border-radius: $radius-md;
  padding: 44rpx 30rpx; margin-bottom: 20rpx;
  &__ico { font-size: 52rpx; }
  &__title { font-size: 34rpx; font-weight: 700; color: #fff; }
  &__sub { font-size: 23rpx; color: rgba(255, 255, 255, 0.88); text-align: center; }
}
.dp-card {
  background: $surface; border-radius: $radius-md; padding: 26rpx; margin-bottom: 20rpx;
  display: flex; flex-direction: column; gap: 18rpx;
  &__label { font-size: 27rpx; font-weight: 600; color: $text-color; }
  &__head { display: flex; align-items: center; justify-content: space-between; }
  &__count { font-size: 22rpx; color: $text-color-placeholder; }
}
.dp-options { display: flex; flex-direction: column; gap: 14rpx; }
.dp-option {
  display: flex; align-items: center; gap: 18rpx; padding: 20rpx;
  background: $bg-color; border-radius: $radius-md; border: 2rpx solid transparent;
  &__ico { font-size: 34rpx; width: 44rpx; text-align: center; }
  &__col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
  &__name { font-size: 26rpx; color: $text-color; }
  &__desc { font-size: 22rpx; color: $text-color-placeholder; }
  &__check { font-size: 28rpx; color: $brand-color; }
  &.on { border-color: $brand-color; background: $brand-color-light; }
}
.dp-input {
  height: 82rpx; padding: 0 22rpx; background: $bg-color; border-radius: $radius-md;
  font-size: 26rpx; color: $text-color;
}
.dp-hint { font-size: 21rpx; color: $text-color-placeholder; line-height: 1.5; }
.dp-save {
  height: 88rpx; line-height: 88rpx; border-radius: 44rpx; background: $brand-color;
  color: #fff; font-size: 30rpx; font-weight: 600; border: none;
}
.dp-save::after { border: none; }
.dp-tip { display: block; margin-top: 18rpx; font-size: 22rpx; color: $text-color-placeholder; line-height: 1.6; text-align: center; }
</style>
