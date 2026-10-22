<template>
  <view class="sv-page">
    <!-- 未登录：引导登录 -->
    <view v-if="!auth.isLoggedIn" class="sv-guest">
      <text class="sv-guest__ico">🎓</text>
      <text class="sv-guest__title">{{ $t('student.loginTitle') }}</text>
      <text class="sv-guest__sub">{{ $t('student.loginSub') }}</text>
      <button class="sv-submit" @click="goLogin">{{ $t('student.goLogin') }}</button>
    </view>

    <template v-else>
      <view class="sv-hero" :class="statusClass">
        <text class="sv-hero__badge">🎓</text>
        <text class="sv-hero__title">{{ statusTitle }}</text>
        <text class="sv-hero__desc">{{ statusDesc }}</text>
      </view>

      <view v-if="loading" class="sv-loading">{{ $t('student.loading') }}</view>

      <view v-else class="sv-card">
        <view v-if="status === 'approved'" class="sv-approved">
          <view class="sv-row"><text class="sv-row__label">{{ $t('student.school') }}</text><text class="sv-row__value">{{ school || '—' }}</text></view>
          <view class="sv-row"><text class="sv-row__label">{{ $t('student.studentNo') }}</text><text class="sv-row__value">{{ studentNo || '—' }}</text></view>
          <view v-if="reviewedAt" class="sv-row"><text class="sv-row__label">{{ $t('student.reviewedAt') }}</text><text class="sv-row__value">{{ fmtTime(reviewedAt) }}</text></view>
          <text class="sv-done-tip">{{ $t('student.approvedTip') }}</text>
        </view>

        <template v-else>
          <view class="sv-field">
            <text class="sv-field__label">{{ $t('student.school') }}</text>
            <input class="sv-field__input" v-model="school" :placeholder="$t('student.schoolPh')" />
          </view>
          <view class="sv-field">
            <text class="sv-field__label">{{ $t('student.studentNo') }}</text>
            <input class="sv-field__input" v-model="studentNo" :placeholder="$t('student.studentNoPh')" />
          </view>
          <view class="sv-field sv-field--col">
            <text class="sv-field__label">{{ $t('student.idImg') }}</text>
            <text class="sv-field__hint">{{ $t('student.idImgHint') }}</text>
            <ImageUpload v-model="idImgs" :max-count="1" />
          </view>
          <text v-if="status === 'rejected'" class="sv-reject">{{ $t('student.rejectedTip') }}</text>
          <view v-if="status === 'pending'" class="sv-pending-tip">{{ $t('student.pendingTip') }}</view>
          <button class="sv-submit" :disabled="!canSubmit" @click="submit">
            {{ submitting ? $t('student.submitting') : status === 'pending' ? $t('student.resubmit') : $t('student.submit') }}
          </button>
        </template>
      </view>

      <view class="sv-tips">
        <text class="sv-tips__title">{{ $t('student.rulesTitle') }}</text>
        <text class="sv-tips__item">· {{ $t('student.rule1') }}</text>
        <text class="sv-tips__item">· {{ $t('student.rule2') }}</text>
        <text class="sv-tips__item">· {{ $t('student.rule3') }}</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { fetchMyStudentVerification, applyStudentVerification } from '../../api/queries/student';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';
import ImageUpload from '../../components/ImageUpload.vue';

const locale = useLocaleStore();
const auth = useAuthStore();

const loading = ref(true);
const submitting = ref(false);
const status = ref('none');
const school = ref('');
const studentNo = ref('');
const idImgs = ref<string[]>([]);
const reviewedAt = ref('');

const statusClass = computed(() => {
    if (status.value === 'approved') return 'ok';
    if (status.value === 'rejected') return 'bad';
    if (status.value === 'pending') return 'wait';
    return '';
});

const statusTitle = computed(() => {
    const map: Record<string, string> = {
        none: 'student.stNone',
        pending: 'student.stPending',
        approved: 'student.stApproved',
        rejected: 'student.stRejected',
    };
    return locale.t(map[status.value] || 'student.stNone');
});

const statusDesc = computed(() => {
    const map: Record<string, string> = {
        none: 'student.descNone',
        pending: 'student.descPending',
        approved: 'student.descApproved',
        rejected: 'student.descRejected',
    };
    return locale.t(map[status.value] || 'student.descNone');
});

const canSubmit = computed(() =>
    !submitting.value && status.value !== 'approved' && !!school.value.trim() && !!studentNo.value.trim());

onShow(() => {
    if (!auth.isLoggedIn) { loading.value = false; return; }
    void load();
});

async function load() {
    loading.value = true;
    try {
        const res: any = await fetchMyStudentVerification();
        status.value = String(res?.status ?? 'none');
        school.value = res?.school ?? '';
        studentNo.value = res?.studentNo ?? '';
        idImgs.value = res?.idImg ? [res.idImg] : [];
        reviewedAt.value = res?.reviewedAt ?? '';
    } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('student.loadFail'), icon: 'none' });
        status.value = 'none';
    } finally {
        loading.value = false;
    }
}

async function submit() {
    if (!canSubmit.value) return;
    if (/^\d{4,}$/.test(school.value.trim())) {
        uni.showToast({ title: locale.t('student.schoolInvalid'), icon: 'none' });
        return;
    }
    submitting.value = true;
    try {
        const res: any = await applyStudentVerification(school.value, studentNo.value, idImgs.value[0]);
        status.value = String(res?.status ?? 'pending');
        uni.showToast({ title: locale.t('student.submitted'), icon: 'success' });
    } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('student.submitFail'), icon: 'none' });
    } finally {
        submitting.value = false;
    }
}

function goLogin() {
    auth.requireLogin('/pkg-user/pages/student-verify');
}

function fmtTime(raw: string): string {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
</script>

<style lang="scss" scoped>
.sv-page { min-height: 100vh; background: $bg-color; padding: 24rpx 24rpx 60rpx; box-sizing: border-box; }
.sv-guest {
  display: flex; flex-direction: column; align-items: center; gap: 14rpx;
  background: $surface; border-radius: $radius-md; padding: 80rpx 40rpx; margin-top: 80rpx;
  &__ico { font-size: 72rpx; }
  &__title { font-size: 32rpx; font-weight: 600; color: $text-color; }
  &__sub { font-size: 24rpx; color: $text-color-secondary; text-align: center; line-height: 1.6; }
}
.sv-hero {
  display: flex; flex-direction: column; align-items: center; gap: 10rpx;
  border-radius: $radius-md; padding: 44rpx 30rpx; margin-bottom: 20rpx; background: $brand-color-light;
  &__badge { font-size: 52rpx; }
  &__title { font-size: 34rpx; font-weight: 700; color: $brand-color; }
  &__desc { font-size: 24rpx; color: $text-color-secondary; text-align: center; line-height: 1.5; }
  &.ok { background: #e8f7ee; .sv-hero__title { color: #1f8a4c; } }
  &.bad { background: #fdecec; .sv-hero__title { color: $error-color; } }
  &.wait { background: #fff7e6; .sv-hero__title { color: $warning-color; } }
}
.sv-loading { text-align: center; font-size: 26rpx; color: $text-color-placeholder; padding: 60rpx 0; }
.sv-card {
  background: $surface; border-radius: $radius-md; padding: 28rpx;
  display: flex; flex-direction: column; gap: 22rpx;
}
.sv-field {
  display: flex; flex-direction: column; gap: 10rpx;
  &--col { gap: 14rpx; }
  &__label { font-size: 24rpx; color: $text-color-secondary; }
  &__hint { font-size: 22rpx; color: $text-color-placeholder; }
  &__input { height: 84rpx; padding: 0 24rpx; background: $bg-color; border-radius: $radius-md; font-size: 28rpx; color: $text-color; }
}
.sv-row {
  display: flex; justify-content: space-between; gap: 16rpx; font-size: 26rpx;
  &__label { color: $text-color-secondary; }
  &__value { color: $text-color; font-weight: 500; }
}
.sv-approved { display: flex; flex-direction: column; gap: 18rpx; }
.sv-done-tip { font-size: 24rpx; color: #1f8a4c; line-height: 1.6; }
.sv-reject { font-size: 24rpx; color: $error-color; line-height: 1.5; }
.sv-pending-tip { font-size: 22rpx; color: $warning-color; background: #fff7e6; border-radius: $radius-md; padding: 16rpx 20rpx; line-height: 1.5; }
.sv-submit {
  height: 88rpx; line-height: 88rpx; border-radius: 44rpx; background: $brand-color; color: #fff;
  font-size: 30rpx; font-weight: 600; border: none; margin-top: 8rpx;
  &[disabled] { background: #ccc; color: #fff; }
}
.sv-submit::after { border: none; }
.sv-tips {
  margin-top: 20rpx; background: $surface; border-radius: $radius-md; padding: 24rpx;
  display: flex; flex-direction: column; gap: 10rpx;
  &__title { font-size: 26rpx; font-weight: 600; color: $text-color; }
  &__item { font-size: 22rpx; color: $text-color-placeholder; line-height: 1.6; }
}
</style>
