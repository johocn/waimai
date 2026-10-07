<template>
  <view class="ae-page">
    <view class="ae-page__cell">
      <text class="ae-page__lbl">联系人</text>
      <input class="ae-page__input" v-model="form.fullName" placeholder="收餐人姓名" />
    </view>
    <view class="ae-page__cell">
      <text class="ae-page__lbl">电话</text>
      <input class="ae-page__input" v-model="form.phoneNumber" type="number" maxlength="11" placeholder="手机号" />
    </view>
    <picker mode="selector" :range="zoneNames" @change="onZoneChange">
      <view class="ae-page__cell">
        <text class="ae-page__lbl">分区</text>
        <text class="ae-page__val" :class="{ placeholder: !form.zoneId }">{{ zoneLabel }}</text>
        <text class="ae-page__arrow">></text>
      </view>
    </picker>
    <picker mode="selector" :range="buildingNames" @change="onBuildingChange" :disabled="!form.zoneId">
      <view class="ae-page__cell">
        <text class="ae-page__lbl">楼栋</text>
        <text class="ae-page__val" :class="{ placeholder: !form.buildingId }">{{ buildingLabel }}</text>
        <text class="ae-page__arrow">></text>
      </view>
    </picker>
    <view class="ae-page__cell">
      <text class="ae-page__lbl">房号</text>
      <input class="ae-page__input" v-model="form.room" placeholder="如 502（选填）" />
    </view>
    <view class="ae-page__cell" @click="form.defaultShipping = !form.defaultShipping">
      <text class="ae-page__lbl">设为默认地址</text>
      <switch :checked="form.defaultShipping" color="#ff6600" style="transform: scale(.8)" />
    </view>
    <button class="ae-page__save" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { fetchZones, fetchBuildings } from '../../api/mutations/campus';
import { createCustomerAddress, updateCustomerAddress } from '../../api/mutations/user';

const zones = ref<any[]>([]);
const buildings = ref<any[]>([]);
const saving = ref(false);
const addressId = ref('');
const form = ref({ fullName: '', phoneNumber: '', zoneId: '', buildingId: '', room: '', defaultShipping: false });

onMounted(async () => {
    zones.value = await fetchZones();
    const opt: any = uni.getStorageSync('address_edit_options');
    if (opt?.addressId) {
        addressId.value = opt.addressId;
        form.value = {
            fullName: opt.fullName || '', phoneNumber: opt.phoneNumber || '',
            zoneId: opt.zoneId || '', buildingId: opt.buildingId || '',
            room: opt.room || '', defaultShipping: !!opt.defaultShipping,
        };
        if (form.value.zoneId) buildings.value = await fetchBuildings(form.value.zoneId);
    }
    uni.removeStorageSync('address_edit_options');
});

const zoneNames = computed(() => zones.value.map((z) => z.name));
const zoneLabel = computed(() => zones.value.find((z) => String(z.id) === String(form.value.zoneId))?.name || '选择分区');
const buildingNames = computed(() => buildings.value.map((b) => b.name));
const buildingLabel = computed(() => buildings.value.find((b) => String(b.id) === String(form.value.buildingId))?.name || '选择楼栋');

async function onZoneChange(e: any) {
    const z = zones.value[Number(e.detail.value)];
    if (!z) return;
    form.value.zoneId = String(z.id);
    form.value.buildingId = '';
    buildings.value = await fetchBuildings(form.value.zoneId);
}
function onBuildingChange(e: any) {
    const b = buildings.value[Number(e.detail.value)];
    if (b) form.value.buildingId = String(b.id);
}

async function save() {
    if (!form.value.fullName.trim()) { uni.showToast({ title: '请填写联系人', icon: 'none' }); return; }
    if (!/^1\d{10}$/.test(form.value.phoneNumber)) { uni.showToast({ title: '手机号格式不正确', icon: 'none' }); return; }
    if (!form.value.zoneId || !form.value.buildingId) { uni.showToast({ title: '请选择分区与楼栋', icon: 'none' }); return; }
    const zone = zones.value.find((z) => String(z.id) === String(form.value.zoneId));
    const building = buildings.value.find((b) => String(b.id) === String(form.value.buildingId));
    const streetLine1 = `${zone?.name || ''}${building?.name || ''} ${form.value.room}`.trim();
    saving.value = true;
    try {
        const payload = {
            fullName: form.value.fullName.trim(), phoneNumber: form.value.phoneNumber,
            streetLine1, zoneId: form.value.zoneId, buildingId: form.value.buildingId,
            defaultShipping: form.value.defaultShipping,
        };
        const res: any = addressId.value
            ? await updateCustomerAddress({ id: addressId.value, ...payload })
            : await createCustomerAddress(payload);
        const body = addressId.value ? res?.updateCustomerAddress : res?.createCustomerAddress;
        if (body?.errorCode) throw new Error(body.message || '保存失败');
        uni.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => uni.navigateBack(), 600);
    } catch (e: any) {
        uni.showToast({ title: e?.message || '保存失败', icon: 'none' });
    }
    saving.value = false;
}
</script>

<style lang="scss" scoped>
.ae-page {
    min-height: 100vh; background: $bg-color; padding: 20rpx;
    &__cell { background: #fff; border-radius: $radius-md; display: flex; align-items: center; padding: 30rpx; margin-bottom: 20rpx; }
    &__lbl { width: 180rpx; font-size: 28rpx; }
    &__input { flex: 1; font-size: 28rpx; text-align: right; }
    &__val { flex: 1; font-size: 28rpx; text-align: right; &.placeholder { color: #bbb; } }
    &__arrow { color: #ccc; margin-left: 12rpx; }
    &__save { margin-top: 40rpx; background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; }
}
</style>
