<template>
  <view class="fb-page">
    <view v-if="!logged" class="fb-empty">
      <text class="fb-empty__ico">💬</text>
      <text class="fb-empty__text">{{ $t('feedback.loginTip') }}</text>
      <button class="fb-empty__btn" @tap="goLogin">{{ $t('member.loginBtn') }}</button>
    </view>

    <template v-else>
      <!-- 提交反馈 -->
      <view class="fb-card">
        <text class="fb-card__title">{{ $t('feedback.formTitle') }}</text>
        <text class="fb-card__tip">{{ $t('feedback.formTip') }}</text>

        <view class="fb-types">
          <text
            v-for="t in TYPES" :key="t"
            class="fb-type" :class="{ on: type === t }"
            @tap="type = t"
          >{{ typeLabel(t) }}</text>
        </view>

        <text class="fb-label">{{ $t('feedback.titleLabel') }}</text>
        <input
          class="fb-input"
          v-model="title"
          :maxlength="20"
          :placeholder="$t('feedback.titlePh')"
          placeholder-class="fb-ph"
        />

        <text class="fb-label">{{ $t('feedback.contentLabel') }}</text>
        <textarea
          class="fb-textarea"
          v-model="content"
          :maxlength="500"
          :placeholder="$t('feedback.contentPh')"
          placeholder-class="fb-ph"
        />

        <text class="fb-label">{{ $t('feedback.imagesLabel') }}</text>
        <VImageUpload v-model="images" :maxCount="3" />

        <text class="fb-label">{{ $t('feedback.contactLabel') }}</text>
        <input
          class="fb-input"
          v-model="contactWay"
          :maxlength="30"
          :placeholder="$t('feedback.contactPh')"
          placeholder-class="fb-ph"
        />

        <button class="fb-submit" :disabled="submitting" @tap="submit">
          {{ submitting ? $t('feedback.submitting') : $t('feedback.submit') }}
        </button>
      </view>

      <!-- 我的反馈 -->
      <view class="fb-card">
        <view class="fb-card__head">
          <text class="fb-card__title">{{ $t('feedback.myTitle') }}</text>
          <text class="fb-card__sub">{{ $t('feedback.myCount').replace('{n}', String(total)) }}</text>
        </view>
        <view v-if="loading" class="fb-loading">{{ $t('feedback.loading') }}</view>
        <view v-else-if="!items.length" class="fb-none">{{ $t('feedback.empty') }}</view>
        <view v-else class="fb-item" v-for="f in items" :key="f.id">
          <view class="fb-item__head">
            <text class="fb-item__title">{{ f.title }}</text>
            <text class="fb-item__status" :class="'is-' + f.status">{{ statusLabel(f.status) }}</text>
          </view>
          <text class="fb-item__meta">{{ typeLabel(f.type) }} · {{ fmtTime(f.createdAt) }}</text>
          <text class="fb-item__content">{{ f.content }}</text>
          <view class="fb-item__imgs" v-if="imgsOf(f).length">
            <image
              v-for="(u, i) in imgsOf(f)" :key="i"
              class="fb-item__img" :src="u" mode="aspectFill"
              @tap="preview(f, i)"
            />
          </view>
          <view class="fb-item__reply" v-if="f.reply">
            <text class="fb-item__reply-label">{{ $t('feedback.replyLabel') }}</text>
            <text class="fb-item__reply-txt">{{ f.reply }}</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { createFeedback, getMyFeedbacks, markFeedbacksRead } from '../../api/queries/feedback';
import { getActiveCustomer } from '../../api/queries/user';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';
import VImageUpload from '../../components/ImageUpload.vue';

const auth = useAuthStore();
const locale = useLocaleStore();
const logged = computed(() => auth.isLoggedIn);

/** 后端类型白名单：bug / experience / other */
const TYPES = ['experience', 'bug', 'other'];
const type = ref('experience');
const title = ref('');
const content = ref('');
const images = ref<string[]>([]);
const contactWay = ref('');
const submitting = ref(false);
const items = ref<any[]>([]);
const total = ref(0);
const loading = ref(true);

function typeLabel(t: string): string {
  return locale.t('feedback.type_' + (TYPES.includes(t) ? t : 'other'));
}
function statusLabel(s: string): string {
  if (s === 'resolved') return locale.t('feedback.statusResolved');
  if (s === 'processing') return locale.t('feedback.statusProcessing');
  return locale.t('feedback.statusPending');
}
function imgsOf(f: any): string[] {
  if (!f?.imgs) return [];
  try {
    const arr = JSON.parse(f.imgs);
    return Array.isArray(arr) ? arr.filter((u: any) => typeof u === 'string' && u) : [];
  } catch {
    return [];
  }
}
function fmtTime(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function preview(f: any, idx: number) {
  const urls = imgsOf(f);
  if (urls.length) uni.previewImage({ current: idx, urls });
}

onShow(() => {
  if (!logged.value) {
    loading.value = false;
    return;
  }
  loadList();
  void prefillContact();
});

async function loadList() {
  loading.value = !items.value.length;
  try {
    const res: any = await getMyFeedbacks({ take: 20 });
    items.value = res?.myFeedbacks?.items || [];
    total.value = Number(res?.myFeedbacks?.totalItems) || 0;
    if (items.value.some((f: any) => !f.readAt && f.status !== 'pending')) {
      void markFeedbacksRead().catch(() => {});
    }
  } catch {
    if (!items.value.length) total.value = 0;
  } finally {
    loading.value = false;
  }
}

/** 联系方式默认带出账号手机号或邮箱，用户可改 */
async function prefillContact() {
  if (contactWay.value) return;
  try {
    const res: any = await getActiveCustomer();
    const c = res?.activeCustomer;
    contactWay.value = c?.phoneNumber || c?.emailAddress || '';
  } catch { /* 静默 */ }
}

async function submit() {
  if (!title.value.trim()) {
    uni.showToast({ title: locale.t('feedback.requiredTitle'), icon: 'none' });
    return;
  }
  if (!content.value.trim()) {
    uni.showToast({ title: locale.t('feedback.requiredContent'), icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    await createFeedback({
      type: type.value,
      title: title.value.trim(),
      content: content.value.trim(),
      imgs: images.value.length ? images.value : undefined,
      contactWay: contactWay.value.trim() || undefined,
    });
    uni.showToast({ title: locale.t('feedback.success'), icon: 'none' });
    title.value = '';
    content.value = '';
    images.value = [];
    await loadList();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('feedback.fail'), icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

function goLogin() {
  auth.requireLogin();
}
</script>

<style lang="scss" scoped>
.fb-page { min-height: 100vh; background: $bg-color; padding: 20rpx; box-sizing: border-box; }
.fb-empty {
  min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20rpx;
  &__ico { font-size: 80rpx; }
  &__text { font-size: 28rpx; color: $text-color-placeholder; }
  &__btn { margin-top: 20rpx; background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 28rpx; padding: 0 60rpx; height: 76rpx; line-height: 76rpx; }
}
.fb-card {
  background: $surface; border-radius: $radius-md; padding: 28rpx; margin-bottom: 20rpx;
  &__head { display: flex; align-items: baseline; justify-content: space-between; gap: 16rpx; }
  &__title { font-size: 30rpx; font-weight: bold; color: $text-color; }
  &__tip { display: block; font-size: 23rpx; color: $text-color-placeholder; margin: 10rpx 0 20rpx; line-height: 1.5; }
  &__sub { font-size: 23rpx; color: $text-color-placeholder; }
}
.fb-types { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 20rpx; }
.fb-type {
  font-size: 24rpx; color: #4e5560; background: #f5f6f8; border: 1rpx solid $border-color;
  border-radius: 999rpx; padding: 8rpx 24rpx;
  &.on { color: $brand-color; border-color: $brand-color; background: $brand-soft; }
}
.fb-label { display: block; font-size: 25rpx; color: $text-color; margin: 20rpx 0 12rpx; }
.fb-input {
  height: 76rpx; padding: 0 20rpx; background: #f5f6f8; border-radius: 12rpx;
  font-size: 26rpx; color: $text-color;
}
.fb-textarea {
  width: 100%; min-height: 180rpx; padding: 18rpx 20rpx; box-sizing: border-box;
  background: #f5f6f8; border-radius: 12rpx; font-size: 26rpx; color: $text-color;
}
.fb-ph { color: #a6acb5; }
.fb-submit {
  margin-top: 30rpx; background: $brand-color; color: #fff; border-radius: 999rpx;
  height: 84rpx; line-height: 84rpx; font-size: 29rpx;
  &[disabled] { opacity: .6; }
}
.fb-loading, .fb-none { padding: 40rpx 0; text-align: center; font-size: 25rpx; color: $text-color-placeholder; }
.fb-item {
  padding: 22rpx 0; border-bottom: 1rpx solid $border-color;
  &:last-child { border-bottom: none; padding-bottom: 0; }
  &__head { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
  &__title { flex: 1; min-width: 0; font-size: 27rpx; color: $text-color; }
  &__status {
    flex: none; font-size: 21rpx; border-radius: 999rpx; padding: 2rpx 16rpx;
    background: #fff7e6; color: #b45309;
    &.is-processing { background: #e8f1ff; color: #1d4ed8; }
    &.is-resolved { background: #e6f5ec; color: #15803d; }
  }
  &__meta { display: block; font-size: 21rpx; color: $text-color-placeholder; margin: 8rpx 0; }
  &__content { font-size: 25rpx; color: #4e5560; line-height: 1.55; }
  &__imgs { display: flex; gap: 12rpx; margin-top: 12rpx; }
  &__img { width: 140rpx; height: 140rpx; border-radius: 12rpx; }
  &__reply {
    margin-top: 14rpx; padding: 16rpx; border-radius: 12rpx; background: #f7f8fa;
  }
  &__reply-label { font-size: 22rpx; color: $brand-color; margin-right: 12rpx; }
  &__reply-txt { font-size: 24rpx; color: #4e5560; line-height: 1.5; }
}
</style>
