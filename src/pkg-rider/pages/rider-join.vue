<template>
    <view class="join">
        <view class="status-card" v-if="profile && profile.riderStatus === 'approved'">
            <text class="status-title">{{ $t('riderJoin.approvedTitle') }}</text>
            <text class="status-desc">{{ $t('riderJoin.approvedDesc') }}</text>
            <button class="submit" @tap="goHall">{{ $t('riderJoin.goHall') }}</button>
        </view>
        <view class="status-card" v-else-if="profile && profile.riderStatus === 'pending'">
            <text class="status-title">{{ $t('riderJoin.pendingTitle') }}</text>
            <text class="status-desc">{{ $t('riderJoin.pendingDesc') }}</text>
        </view>
        <view v-else class="form">
            <view class="field"><text class="label">{{ $t('riderJoin.labelName') }}</text><input v-model="form.realName" :placeholder="$t('riderJoin.phName')" /></view>
            <view class="field"><text class="label">{{ $t('riderJoin.labelStudentNo') }}</text><input v-model="form.studentNo" :placeholder="$t('riderJoin.phStudentNo')" /></view>
            <view class="field"><text class="label">{{ $t('riderJoin.labelCampus') }}</text><input v-model="form.campus" :placeholder="$t('riderJoin.phCampus')" /></view>
            <view class="field">
                <text class="label">{{ $t('riderJoin.labelIdImg') }}</text>
                <image v-if="form.idImg" :src="form.idImg" class="id-img" mode="aspectFill" @tap="chooseImg" />
                <view v-else class="id-upload" @tap="chooseImg">{{ $t('riderJoin.upload') }}</view>
            </view>
            <button class="submit" :disabled="submitting" @tap="submit">{{ submitting ? $t('riderJoin.submitting') : $t('riderJoin.submit') }}</button>
            <text class="tips">{{ $t('riderJoin.tips') }}</text>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { applyRider, myRiderProfile } from '../../api/queries/rider';
import { uploadCustomerAsset } from '../../api/mutations/upload';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();
const profile = ref<any>(null);
const submitting = ref(false);
const form = reactive({ realName: '', studentNo: '', campus: '', idImg: '' });

onLoad(async () => {
    if (!auth.requireLogin('/pkg-rider/pages/rider-join')) return;
    try { profile.value = await myRiderProfile(); } catch { /* 未授权时保持表单态 */ }
});

function goHall() {
    uni.redirectTo({ url: '/pkg-rider/pages/rider-home' });
}

async function chooseImg() {
    try {
        const res: any = await uni.chooseImage({ count: 1 });
        const path = res?.tempFilePaths?.[0];
        if (!path) return;
        const asset = await uploadCustomerAsset(path);
        form.idImg = asset.source;
    } catch { /* 用户取消选择 */ }
}

async function submit() {
    if (!form.realName || !form.studentNo || !form.campus) {
        return uni.showToast({ title: locale.t('riderJoin.formIncomplete'), icon: 'none' });
    }
    submitting.value = true;
    try {
        await applyRider({ ...form, idImg: form.idImg || undefined });
        uni.showToast({ title: locale.t('riderJoin.submitted'), icon: 'success' });
        profile.value = await myRiderProfile();
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('riderJoin.submitFail'), icon: 'none' });
    } finally { submitting.value = false; }
}
</script>

<style scoped lang="scss">
.join { padding: 24rpx; }
.status-card { background: $surface; border-radius: $radius-card; padding: 48rpx 32rpx; text-align: center; }
.status-title { display: block; font-size: 34rpx; font-weight: 600; color: $text; margin-bottom: 16rpx; }
.status-desc { font-size: 26rpx; color: $text-muted; }
.form { background: $surface; border-radius: $radius-card; padding: 32rpx; }
.field { margin-bottom: 28rpx; }
.label { display: block; font-size: 26rpx; color: $text-muted; margin-bottom: 12rpx; }
input { background: $bg; border-radius: $radius; padding: 16rpx 20rpx; font-size: 28rpx; }
.id-upload { width: 240rpx; height: 160rpx; border: 2rpx dashed $brand-color; border-radius: $radius; color: $brand-color; text-align: center; line-height: 160rpx; }
.id-img { width: 240rpx; height: 160rpx; border-radius: $radius; }
.submit { background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 30rpx; margin-top: 16rpx; }
.tips { display: block; text-align: center; font-size: 22rpx; color: $text-muted; margin-top: 20rpx; }
</style>
