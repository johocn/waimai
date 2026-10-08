<template>
  <view class="pe-page">
    <view class="pe-page__cell" @click="chooseAvatar">
      <text class="pe-page__lbl">{{ $t('profileEdit.avatarLabel') }}</text>
      <view class="pe-page__right">
        <view class="pe-page__avatar">
          <image v-if="avatarUrl" :src="avatarUrl" mode="aspectFill" />
          <text v-else>{{ (form.firstName || $t('profileEdit.avatarFallback'))[0] }}</text>
        </view>
        <text class="pe-page__arrow">></text>
      </view>
    </view>
    <view class="pe-page__cell">
      <text class="pe-page__lbl">{{ $t('profileEdit.nicknameLabel') }}</text>
      <input class="pe-page__input" v-model="form.firstName" :placeholder="$t('profileEdit.phNickname')" />
    </view>
    <view class="pe-page__cell">
      <text class="pe-page__lbl">{{ $t('profileEdit.phoneLabel') }}</text>
      <input class="pe-page__input" v-model="form.phoneNumber" type="number" maxlength="11" :placeholder="$t('profileEdit.phPhone')" />
    </view>
    <button class="pe-page__save" :disabled="saving" @click="save">{{ saving ? $t('profileEdit.saving') : $t('profileEdit.save') }}</button>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getActiveCustomer } from '../../api/queries/user';
import { updateCustomerProfile } from '../../api/mutations/user';
import { uploadCustomerAsset } from '../../api/mutations/upload';
import { useLocaleStore } from '../../stores/locale';

const locale = useLocaleStore();

const form = ref<{ firstName: string; phoneNumber: string }>({ firstName: '', phoneNumber: '' });
const avatarUrl = ref('');
const saving = ref(false);

onMounted(async () => {
    try {
        const res: any = await getActiveCustomer();
        const c = res.activeCustomer || {};
        form.value.firstName = c.firstName || '';
        form.value.phoneNumber = c.phoneNumber || '';
        avatarUrl.value = c.customFields?.avatarUrl || '';
    } catch (e) {}
});

async function chooseAvatar() {
    const res: any = await uni.chooseImage({ count: 1 });
    const filePath = res?.tempFilePaths?.[0];
    if (!filePath) return;
    try {
        uni.showLoading({ title: locale.t('profileEdit.uploading') });
        const asset = await uploadCustomerAsset(filePath);
        avatarUrl.value = asset.source;
        uni.hideLoading();
    } catch (e: any) {
        uni.hideLoading();
        uni.showToast({ title: e?.message || locale.t('profileEdit.uploadFail'), icon: 'none' });
    }
}

async function save() {
    const phone = form.value.phoneNumber.trim();
    if (phone && !/^1\d{10}$/.test(phone)) { uni.showToast({ title: locale.t('profileEdit.phoneInvalid'), icon: 'none' }); return; }
    saving.value = true;
    try {
        const res: any = await updateCustomerProfile({
            firstName: form.value.firstName.trim(),
            phoneNumber: phone,
            avatarUrl: avatarUrl.value || '',
        });
        if (res?.updateCustomer?.errorCode) throw new Error(res.updateCustomer.message || locale.t('profileEdit.saveFail'));
        uni.showToast({ title: locale.t('profileEdit.saved'), icon: 'success' });
        setTimeout(() => uni.navigateBack(), 600);
    } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('profileEdit.saveFail'), icon: 'none' });
    }
    saving.value = false;
}
</script>

<style lang="scss" scoped>
.pe-page {
    min-height: 100vh; background: $bg-color; padding: 20rpx;
    &__cell { background: $surface; border-radius: $radius-md; display: flex; align-items: center; padding: 30rpx; margin-bottom: 20rpx; }
    &__lbl { width: 140rpx; font-size: 28rpx; }
    &__input { flex: 1; font-size: 28rpx; text-align: right; }
    &__right { display: flex; align-items: center; gap: 12rpx; margin-left: auto; }
    &__avatar {
        width: 88rpx; height: 88rpx; border-radius: 50%; background: $brand-soft; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        image { width: 100%; height: 100%; }
        text { color: $brand-color; font-size: 36rpx; }
    }
    &__arrow { color: $text-color-placeholder; }
    &__save { margin-top: 40rpx; background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; }
}
</style>
