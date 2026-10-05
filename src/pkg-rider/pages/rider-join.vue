<template>
    <view class="join">
        <view class="status-card" v-if="profile && profile.riderStatus === 'approved'">
            <text class="status-title">已通过审核</text>
            <text class="status-desc">您已是认证骑手，可以开始接单啦</text>
            <button class="submit" @tap="goHall">进入接单大厅</button>
        </view>
        <view class="status-card" v-else-if="profile && profile.riderStatus === 'pending'">
            <text class="status-title">审核中</text>
            <text class="status-desc">资质提交成功，等待管理员审核（一般 1 个工作日内）</text>
        </view>
        <view v-else class="form">
            <view class="field"><text class="label">真实姓名</text><input v-model="form.realName" placeholder="与证件一致" /></view>
            <view class="field"><text class="label">学号</text><input v-model="form.studentNo" placeholder="请输入学号" /></view>
            <view class="field"><text class="label">校区</text><input v-model="form.campus" placeholder="如：东校区" /></view>
            <view class="field">
                <text class="label">学生证照片（选填）</text>
                <image v-if="form.idImg" :src="form.idImg" class="id-img" mode="aspectFill" @tap="chooseImg" />
                <view v-else class="id-upload" @tap="chooseImg">＋ 上传</view>
            </view>
            <button class="submit" :disabled="submitting" @tap="submit">{{ submitting ? '提交中…' : '提交申请' }}</button>
            <text class="tips">审核通过后即可在「我的-骑手中心」接单赚跑腿费</text>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { applyRider, myRiderProfile } from '../../api/queries/rider';
import { uploadCustomerAsset } from '../../api/mutations/upload';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
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
        return uni.showToast({ title: '请填写完整资料', icon: 'none' });
    }
    submitting.value = true;
    try {
        await applyRider({ ...form, idImg: form.idImg || undefined });
        uni.showToast({ title: '已提交', icon: 'success' });
        profile.value = await myRiderProfile();
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '提交失败', icon: 'none' });
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
