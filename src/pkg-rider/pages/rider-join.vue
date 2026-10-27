<template>
    <view class="join">
        <view class="status-card" v-if="profile && profile.riderStatus === 'approved'">
            <text class="status-title">{{ $t('riderJoin.approvedTitle') }}</text>
            <text class="status-desc">{{ $t('riderJoin.approvedDesc') }}</text>
            <!-- P2-5 合规：健康证 / 保险 / 背景调查（由后台登记，此处只读展示） -->
            <view class="comp" v-if="profile.compliance">
                <view class="comp-head">
                    <text class="comp-title">{{ $t('riderJoin.compTitle') }}</text>
                    <text class="comp-pill" :class="'cp-' + compLevel">{{ $t('riderJoin.compLevel_' + compLevel) }}</text>
                </view>
                <view v-for="it in profile.compliance.items" :key="it.key" class="comp-row">
                    <text class="comp-key">{{ $t('riderJoin.comp_' + it.key) }}</text>
                    <text class="comp-val" :class="'cs-' + it.status">{{ $t('riderJoin.compStatus_' + it.status) }}</text>
                    <text class="comp-exp" v-if="it.expiry">{{ dateText(it.expiry) }}</text>
                </view>
                <text class="comp-tip" v-if="profile.compliance.blocked">{{ $t('riderJoin.compBlockedTip') }}</text>
            </view>
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
            <view class="field">
                <text class="label">{{ $t('riderJoin.labelHealthImg') }}</text>
                <image v-if="form.healthCertImg" :src="form.healthCertImg" class="id-img" mode="aspectFill" @tap="chooseHealthImg" />
                <view v-else class="id-upload" @tap="chooseHealthImg">{{ $t('riderJoin.upload') }}</view>
                <text class="field-hint">{{ $t('riderJoin.healthImgHint') }}</text>
            </view>
            <button class="submit" :disabled="submitting" @tap="submit">{{ submitting ? $t('riderJoin.submitting') : $t('riderJoin.submit') }}</button>
            <text class="tips">{{ $t('riderJoin.tips') }}</text>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { applyRider, myRiderProfile } from '../../api/queries/rider';
import { uploadCustomerAsset } from '../../api/mutations/upload';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();
const profile = ref<any>(null);
const submitting = ref(false);
const form = reactive({ realName: '', studentNo: '', campus: '', idImg: '', healthCertImg: '' });

/** 合规等级：blocked（禁止接单）> pending（未完善）> expiring（30 天内到期）> ok */
const compLevel = computed(() => {
    const c = profile.value?.compliance;
    if (!c) return 'ok';
    if (c.blocked) return 'blocked';
    if (c.pending) return 'pending';
    if ((c.items || []).some((i: any) => i.status === 'expiring')) return 'expiring';
    return 'ok';
});

function dateText(v?: string | null): string {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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

/** P2-5 健康证照片：随入驻申请一起提交，后台登记编号与到期日后生效 */
async function chooseHealthImg() {
    try {
        const res: any = await uni.chooseImage({ count: 1 });
        const path = res?.tempFilePaths?.[0];
        if (!path) return;
        const asset = await uploadCustomerAsset(path);
        form.healthCertImg = asset.source;
    } catch { /* 用户取消选择 */ }
}

async function submit() {
    if (!form.realName || !form.studentNo || !form.campus) {
        return uni.showToast({ title: locale.t('riderJoin.formIncomplete'), icon: 'none' });
    }
    submitting.value = true;
    try {
        await applyRider({
            realName: form.realName,
            studentNo: form.studentNo,
            campus: form.campus,
            idImg: form.idImg || undefined,
            healthCertImg: form.healthCertImg || undefined,
        });
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
.field-hint { display: block; font-size: 22rpx; color: $text-muted; margin-top: 8rpx; }
/* P2-5 合规只读展示 */
.comp { margin: 28rpx 0 8rpx; padding: 20rpx; border-radius: $radius; background: $bg; text-align: left; }
.comp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
.comp-title { font-size: 26rpx; font-weight: 600; color: $text; }
.comp-pill { font-size: 22rpx; border-radius: 999rpx; padding: 2rpx 14rpx; }
.cp-ok { color: #16a34a; background: #e6f5ec; }
.cp-expiring { color: #b45309; background: #fdf3e0; }
.cp-pending { color: #8a919c; background: #f0f1f4; }
.cp-blocked { color: #b91c1c; background: #fdeaea; }
.comp-row { display: flex; align-items: center; gap: 12rpx; font-size: 24rpx; margin-top: 6rpx; }
.comp-key { color: $text-muted; min-width: 150rpx; }
.comp-val { font-weight: 600; }
.cs-ok { color: #16a34a; }
.cs-expiring, .cs-pending { color: #b45309; }
.cs-expired, .cs-failed { color: #b91c1c; }
.cs-missing { color: #8a919c; }
.comp-exp { font-size: 22rpx; color: $text-muted; }
.comp-tip { display: block; font-size: 22rpx; color: #b91c1c; margin-top: 12rpx; line-height: 1.6; }
.submit { background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 30rpx; margin-top: 16rpx; }
.tips { display: block; text-align: center; font-size: 22rpx; color: $text-muted; margin-top: 20rpx; }
</style>
