<template>
  <view class="ab-page">
    <view class="ab-page__item" v-for="a in items" :key="a.id" :class="{ disabled: a._invalid }">
      <view class="ab-page__main" @click="onItemClick(a)">
        <view class="ab-page__badges">
          <text class="ab-page__name">{{ a.fullName }}</text>
          <text class="ab-page__default" v-if="a.defaultShippingAddress">默认</text>
          <text class="ab-page__invalid" v-if="a._invalid">待更新</text>
        </view>
        <text class="ab-page__phone">{{ a.phoneNumber }}</text>
        <text class="ab-page__addr">{{ a._addrText }}</text>
      </view>
      <view class="ab-page__ops">
        <text class="ab-page__op" v-if="!a.defaultShippingAddress && !a._invalid" @click="setDefault(a)">设默认</text>
        <text class="ab-page__op ab-page__op--danger" @click="del(a)">删除</text>
      </view>
    </view>
    <view class="ab-page__empty" v-if="!items.length">
      <text>还没有常用地址，添加后下单自动带出</text>
    </view>
    <view class="ab-page__footer">
      <button class="ab-page__add" @click="goEdit(null)">新增地址</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getActiveCustomer } from '../../api/queries/user';
import { updateCustomerAddress, deleteCustomerAddress } from '../../api/mutations/user';
import { fetchZones, fetchBuildings } from '../../api/mutations/campus';

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
            return { ...a, _invalid: invalid, _addrText: invalid ? '分区/楼栋已变更，请重新选择' : `${zone.name} ${building.name} ${a.streetLine1 || ''}`.trim() };
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
        uni.showToast({ title: '已设为默认', icon: 'success' });
        refresh();
    } catch (e: any) { uni.showToast({ title: e?.message || '操作失败', icon: 'none' }); }
}

function del(a: any) {
    uni.showModal({
        title: '删除地址',
        content: `确定删除「${a.fullName}」的地址吗？`,
        success: async (res: any) => {
            if (!res.confirm) return;
            try {
                await deleteCustomerAddress(a.id);
                uni.showToast({ title: '已删除', icon: 'success' });
                refresh();
            } catch (e: any) { uni.showToast({ title: e?.message || '删除失败', icon: 'none' }); }
        },
    });
}
</script>

<style lang="scss" scoped>
.ab-page {
    min-height: 100vh; background: $bg-color; padding: 20rpx 20rpx 160rpx;
    &__item { background: #fff; border-radius: $radius-md; padding: 30rpx; margin-bottom: 20rpx; display: flex; align-items: center; }
    &__main { flex: 1; min-width: 0; }
    &__badges { display: flex; align-items: center; gap: 12rpx; }
    &__name { font-size: 30rpx; font-weight: bold; }
    &__default { font-size: 20rpx; color: $brand-color; border: 1rpx solid $brand-color; border-radius: 6rpx; padding: 2rpx 10rpx; }
    &__invalid { font-size: 20rpx; color: #e8a23a; border: 1rpx solid #e8a23a; border-radius: 6rpx; padding: 2rpx 10rpx; }
    &__phone { display: block; font-size: 26rpx; color: #666; margin-top: 8rpx; }
    &__addr { display: block; font-size: 26rpx; color: #666; margin-top: 4rpx; }
    &__ops { display: flex; flex-direction: column; gap: 20rpx; margin-left: 20rpx; }
    &__op { font-size: 24rpx; color: #666; &--danger { color: #e8463a; } }
    &__item.disabled { opacity: .6; }
    &__empty { text-align: center; color: #999; font-size: 26rpx; padding: 120rpx 0; }
    &__footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx; background: $bg-color; }
    &__add { background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; }
}
</style>
