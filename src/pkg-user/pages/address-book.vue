<template>
  <view class="ab-page">
    <view class="ab-page__item" v-for="a in items" :key="a.id" :class="{ disabled: a._invalid }">
      <view class="ab-page__main" @click="onItemClick(a)">
        <view class="ab-page__badges">
          <text class="ab-page__name">{{ a.fullName }}</text>
          <text class="ab-page__default" v-if="a.defaultShippingAddress">{{ $t('addressBook.defaultTag') }}</text>
          <text class="ab-page__invalid" v-if="a._invalid">{{ $t('addressBook.invalidTag') }}</text>
        </view>
        <text class="ab-page__phone">{{ a.phoneNumber }}</text>
        <text class="ab-page__addr">{{ a._addrText }}</text>
      </view>
      <view class="ab-page__ops">
        <text class="ab-page__op" v-if="!a.defaultShippingAddress && !a._invalid" @click="setDefault(a)">{{ $t('addressBook.setDefault') }}</text>
        <text class="ab-page__op ab-page__op--danger" @click="del(a)">{{ $t('addressBook.del') }}</text>
      </view>
    </view>
    <view class="ab-page__empty" v-if="!items.length">
      <text>{{ $t('addressBook.empty') }}</text>
    </view>
    <view class="ab-page__footer">
      <button class="ab-page__add" @click="goEdit(null)">{{ $t('addressBook.add') }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getActiveCustomer } from '../../api/queries/user';
import { updateCustomerAddress, deleteCustomerAddress } from '../../api/mutations/user';
import { fetchZones, fetchBuildings } from '../../api/mutations/campus';
import { useLocaleStore } from '../../stores/locale';

const locale = useLocaleStore();
const items = ref<any[]>([]);
let zones: any[] = [];

onShow(refresh);

async function refresh() {
    try {
        const [cust, zs] = await Promise.all([getActiveCustomer(), fetchZones()]);
        zones = zs;
        const addresses = cust?.activeCustomer?.addresses || [];
        // 校验楼栋需按 zone 拉取：收集地址出现的 zoneId 去重后并发拉楼栋
        const zoneIds = Array.from(new Set(addresses.map((a: any) => a?.customFields?.zoneId).filter(Boolean)));
        const buildingLists = await Promise.all(zoneIds.map((z) => fetchBuildings(z as string).catch(() => [])));
        const allBuildings = buildingLists.flat();
        items.value = addresses.map((a: any) => {
            const cf = a.customFields || {};
            const zone = zones.find((z) => String(z.id) === String(cf.zoneId));
            const building = allBuildings.find((b) => String(b.id) === String(cf.buildingId));
            const invalid = !zone || !building;
            return { ...a, _invalid: invalid, _addrText: invalid ? locale.t('addressBook.invalidAddr') : `${zone.name} ${building.name} ${a.streetLine1 || ''}`.trim() };
        });
    } catch (e) { console.error(e); }
}

function onItemClick(a: any) {
    const opt = {
        addressId: a.id, fullName: a.fullName, phoneNumber: a.phoneNumber,
        zoneId: a.customFields?.zoneId, buildingId: a.customFields?.buildingId,
        room: a.streetLine1 || '', defaultShipping: a.defaultShippingAddress,
    };
    uni.setStorageSync('address_edit_options', opt);
    uni.navigateTo({ url: '/pkg-user/pages/address-edit' });
}

function goEdit(_none: null) { uni.navigateTo({ url: '/pkg-user/pages/address-edit' }); }

async function setDefault(a: any) {
    try {
        await updateCustomerAddress({
            id: a.id, fullName: a.fullName, phoneNumber: a.phoneNumber || '', streetLine1: a.streetLine1 || '',
            zoneId: a.customFields?.zoneId || '', buildingId: a.customFields?.buildingId || '', defaultShipping: true,
        });
        uni.showToast({ title: locale.t('addressBook.setDefaultDone'), icon: 'success' });
        refresh();
    } catch (e: any) { uni.showToast({ title: e?.message || locale.t('addressBook.opFail'), icon: 'none' }); }
}

function del(a: any) {
    uni.showModal({
        title: locale.t('addressBook.delTitle'),
        content: locale.t('addressBook.delConfirm').replace('{n}', a.fullName),
        success: async (res: any) => {
            if (!res.confirm) return;
            try {
                await deleteCustomerAddress(a.id);
                uni.showToast({ title: locale.t('addressBook.deleted'), icon: 'success' });
                refresh();
            } catch (e: any) { uni.showToast({ title: e?.message || locale.t('addressBook.delFail'), icon: 'none' }); }
        },
    });
}
</script>

<style lang="scss" scoped>
.ab-page {
    min-height: 100vh; background: $bg-color; padding: 20rpx 20rpx 160rpx;
    &__item { background: $surface; border-radius: $radius-md; padding: 30rpx; margin-bottom: 20rpx; display: flex; align-items: center; }
    &__main { flex: 1; min-width: 0; }
    &__badges { display: flex; align-items: center; gap: 12rpx; }
    &__name { font-size: 30rpx; font-weight: bold; }
    &__default { font-size: 20rpx; color: $brand-color; border: 1rpx solid $brand-color; border-radius: 6rpx; padding: 2rpx 10rpx; }
    &__invalid { font-size: 20rpx; color: #e8a23a; border: 1rpx solid #e8a23a; border-radius: 6rpx; padding: 2rpx 10rpx; }
    &__phone { display: block; font-size: 26rpx; color: $text-color-secondary; margin-top: 8rpx; }
    &__addr { display: block; font-size: 26rpx; color: $text-color-secondary; margin-top: 4rpx; }
    &__ops { display: flex; flex-direction: column; gap: 20rpx; margin-left: 20rpx; }
    &__op { font-size: 24rpx; color: $text-color-secondary; &--danger { color: #e8463a; } }
    &__item.disabled { opacity: .6; }
    &__empty { text-align: center; color: $text-color-placeholder; font-size: 26rpx; padding: 120rpx 0; }
    &__footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx; background: $bg-color; }
    &__add { background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; }
}
</style>
