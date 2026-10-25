<template>
  <view class="ap-page">
    <view v-if="!logged" class="ap-empty">
      <text class="ap-empty__ico">📝</text>
      <text class="ap-empty__text">{{ $t('riderAppeal.loginTip') }}</text>
      <button class="ap-empty__btn" @tap="goLogin">{{ $t('member.loginBtn') }}</button>
    </view>

    <template v-else>
      <!-- 信用分概览 -->
      <view class="ap-card ap-credit">
        <text class="ap-credit__label">{{ $t('riderAppeal.creditLabel') }}</text>
        <text class="ap-credit__num">{{ profile?.riderCredit ?? '--' }}</text>
        <text class="ap-credit__tip">{{ $t('riderAppeal.creditTip') }}</text>
      </view>

      <!-- 提交申诉 -->
      <view class="ap-card">
        <text class="ap-card__title">{{ $t('riderAppeal.formTitle') }}</text>
        <text class="ap-card__tip">{{ $t('riderAppeal.formTip') }}</text>
        <textarea
          class="ap-textarea"
          v-model="reason"
          :maxlength="500"
          :placeholder="$t('riderAppeal.reasonPh')"
          placeholder-class="ap-ph"
        />
        <text class="ap-label">{{ $t('riderAppeal.imagesLabel') }}</text>
        <VImageUpload v-model="images" :maxCount="3" />
        <button class="ap-submit" :disabled="submitting" @tap="submit">
          {{ submitting ? $t('riderAppeal.submitting') : $t('riderAppeal.submit') }}
        </button>
      </view>

      <!-- 我的申诉 -->
      <view class="ap-card">
        <text class="ap-card__title">{{ $t('riderAppeal.myTitle') }}</text>
        <view v-if="loading" class="ap-loading">{{ $t('riderAppeal.loading') }}</view>
        <view v-else-if="!items.length" class="ap-none">{{ $t('riderAppeal.empty') }}</view>
        <view v-else class="ap-item" v-for="a in items" :key="a.id">
          <view class="ap-item__head">
            <text class="ap-item__status" :class="'is-' + a.status">{{ statusLabel(a.status) }}</text>
            <text class="ap-item__time">{{ fmtTime(a.createdAt) }}</text>
          </view>
          <text class="ap-item__reason">{{ a.reason }}</text>
          <view class="ap-item__imgs" v-if="a.images?.length">
            <image
              v-for="(u, i) in a.images" :key="i"
              class="ap-item__img" :src="u" mode="aspectFill"
              @tap="preview(a.images, i)"
            />
          </view>
          <view class="ap-item__note" v-if="a.status !== 'pending'">
            <text class="ap-item__note-label">
              {{ $t('riderAppeal.resultLabel') }}<template v-if="a.creditDelta"> +{{ a.creditDelta }}</template>
            </text>
            <text class="ap-item__note-txt">{{ a.reviewNote || '—' }}</text>
            <text class="ap-item__note-time" v-if="a.reviewedAt">{{ fmtTime(a.reviewedAt) }}</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { fetchMyRiderAppeals, createRiderAppeal } from '../../api/queries/support';
import { myRiderProfile } from '../../api/queries/rider';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';
import VImageUpload from '../../components/ImageUpload.vue';

const auth = useAuthStore();
const locale = useLocaleStore();
const logged = computed(() => !!auth.token);

const profile = ref<any>(null);
const reason = ref('');
const images = ref<string[]>([]);
const submitting = ref(false);
const items = ref<any[]>([]);
const loading = ref(true);

function statusLabel(s: string): string {
  if (s === 'approved') return locale.t('riderAppeal.statusApproved');
  if (s === 'rejected') return locale.t('riderAppeal.statusRejected');
  return locale.t('riderAppeal.statusPending');
}
function fmtTime(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function preview(urls: string[], idx: number) {
  if (urls?.length) uni.previewImage({ current: idx, urls });
}

onShow(() => {
  if (!logged.value) {
    loading.value = false;
    return;
  }
  void loadAll();
});

async function loadAll() {
  loading.value = !items.value.length;
  try {
    const [p, list] = await Promise.all([
      myRiderProfile().catch(() => null),
      fetchMyRiderAppeals(0, 50).catch(() => []),
    ]);
    profile.value = p;
    items.value = list;
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!reason.value.trim()) {
    uni.showToast({ title: locale.t('riderAppeal.requiredReason'), icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    await createRiderAppeal({
      reason: reason.value.trim(),
      images: images.value.length ? images.value : undefined,
    });
    uni.showToast({ title: locale.t('riderAppeal.success'), icon: 'none' });
    reason.value = '';
    images.value = [];
    await loadAll();
  } catch (e: any) {
    uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('riderAppeal.fail'), icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

function goLogin() {
  auth.requireLogin();
}
</script>

<style lang="scss" scoped>
.ap-page { min-height: 100vh; background: $bg-color; padding: 20rpx; box-sizing: border-box; }
.ap-empty {
  min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20rpx;
  &__ico { font-size: 80rpx; }
  &__text { font-size: 28rpx; color: $text-color-placeholder; }
  &__btn { margin-top: 20rpx; background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 28rpx; padding: 0 60rpx; height: 76rpx; line-height: 76rpx; }
}
.ap-card {
  background: $surface; border-radius: $radius-md; padding: 28rpx; margin-bottom: 20rpx;
  &__title { font-size: 30rpx; font-weight: bold; color: $text-color; }
  &__tip { display: block; font-size: 23rpx; color: $text-color-placeholder; margin: 10rpx 0 20rpx; line-height: 1.5; }
}
.ap-credit { display: flex; align-items: baseline; gap: 16rpx; flex-wrap: wrap;
  &__label { font-size: 25rpx; color: $text-color; }
  &__num { font-size: 40rpx; font-weight: 700; color: #f59e0b; }
  &__tip { flex-basis: 100%; font-size: 22rpx; color: $text-color-placeholder; }
}
.ap-label { display: block; font-size: 25rpx; color: $text-color; margin: 20rpx 0 12rpx; }
.ap-textarea {
  width: 100%; min-height: 200rpx; padding: 18rpx 20rpx; box-sizing: border-box;
  background: #f5f6f8; border-radius: 12rpx; font-size: 26rpx; color: $text-color;
}
.ap-ph { color: #a6acb5; }
.ap-submit {
  margin-top: 30rpx; background: $brand-color; color: #fff; border-radius: 999rpx;
  height: 84rpx; line-height: 84rpx; font-size: 29rpx;
  &[disabled] { opacity: .6; }
}
.ap-loading, .ap-none { padding: 40rpx 0; text-align: center; font-size: 25rpx; color: $text-color-placeholder; }
.ap-item {
  padding: 22rpx 0; border-bottom: 1rpx solid $border-color;
  &:last-child { border-bottom: none; padding-bottom: 0; }
  &__head { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
  &__status {
    font-size: 21rpx; border-radius: 999rpx; padding: 2rpx 16rpx;
    background: #fff7e6; color: #b45309;
    &.is-approved { background: #e6f5ec; color: #15803d; }
    &.is-rejected { background: #fdecec; color: #b91c1c; }
  }
  &__time { font-size: 21rpx; color: $text-color-placeholder; }
  &__reason { display: block; font-size: 25rpx; color: #4e5560; line-height: 1.55; margin-top: 10rpx; }
  &__imgs { display: flex; gap: 12rpx; margin-top: 12rpx; }
  &__img { width: 140rpx; height: 140rpx; border-radius: 12rpx; }
  &__note { margin-top: 14rpx; padding: 16rpx; border-radius: 12rpx; background: #f7f8fa; }
  &__note-label { font-size: 22rpx; color: $brand-color; margin-right: 12rpx; }
  &__note-txt { font-size: 24rpx; color: #4e5560; line-height: 1.5; }
  &__note-time { display: block; font-size: 20rpx; color: $text-color-placeholder; margin-top: 8rpx; }
}
</style>
