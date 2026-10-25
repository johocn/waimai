<template>
  <view class="st-page">
    <view v-if="!logged" class="st-empty">
      <text class="st-empty__ico">🎧</text>
      <text class="st-empty__text">{{ $t('supportTicket.loginTip') }}</text>
      <button class="st-empty__btn" @tap="goLogin">{{ $t('member.loginBtn') }}</button>
    </view>

    <template v-else>
      <!-- 提交工单 -->
      <view class="st-card">
        <text class="st-card__title">{{ $t('supportTicket.formTitle') }}</text>
        <text class="st-card__tip">{{ $t('supportTicket.formTip') }}</text>

        <view class="st-types">
          <text
            v-for="c in CATEGORIES" :key="c"
            class="st-type" :class="{ on: category === c }"
            @tap="category = c"
          >{{ categoryLabel(c) }}</text>
        </view>

        <text class="st-label">{{ $t('supportTicket.orderCodeLabel') }}</text>
        <input
          class="st-input"
          v-model="orderCode"
          :maxlength="40"
          :placeholder="$t('supportTicket.orderCodePh')"
          placeholder-class="st-ph"
        />

        <text class="st-label">{{ $t('supportTicket.contentLabel') }}</text>
        <textarea
          class="st-textarea"
          v-model="content"
          :maxlength="500"
          :placeholder="$t('supportTicket.contentPh')"
          placeholder-class="st-ph"
        />

        <text class="st-label">{{ $t('supportTicket.imagesLabel') }}</text>
        <VImageUpload v-model="images" :maxCount="3" />

        <button class="st-submit" :disabled="submitting" @tap="submit">
          {{ submitting ? $t('supportTicket.submitting') : $t('supportTicket.submit') }}
        </button>
      </view>

      <!-- 我的工单 -->
      <view class="st-card">
        <view class="st-card__head">
          <text class="st-card__title">{{ $t('supportTicket.myTitle') }}</text>
        </view>
        <view v-if="loading" class="st-loading">{{ $t('supportTicket.loading') }}</view>
        <view v-else-if="!items.length" class="st-none">{{ $t('supportTicket.empty') }}</view>
        <view v-else class="st-item" v-for="t in items" :key="t.id">
          <view class="st-item__head">
            <text class="st-item__cat">{{ categoryLabel(t.category) }}</text>
            <text class="st-item__status" :class="'is-' + t.status">{{ statusLabel(t.status) }}</text>
          </view>
          <text class="st-item__meta">
            <template v-if="t.orderCode">#{{ t.orderCode }} · </template>{{ fmtTime(t.createdAt) }}
          </text>
          <text class="st-item__content">{{ t.content }}</text>
          <view class="st-item__imgs" v-if="t.images?.length">
            <image
              v-for="(u, i) in t.images" :key="i"
              class="st-item__img" :src="u" mode="aspectFill"
              @tap="preview(t.images, i)"
            />
          </view>
          <view class="st-item__reply" v-if="t.reply">
            <text class="st-item__reply-label">{{ $t('supportTicket.replyLabel') }}</text>
            <text class="st-item__reply-txt">{{ t.reply }}</text>
            <text class="st-item__reply-time" v-if="t.repliedAt">{{ fmtTime(t.repliedAt) }}</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { fetchMySupportTickets, createSupportTicket } from '../../api/queries/support';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';
import VImageUpload from '../../components/ImageUpload.vue';

const auth = useAuthStore();
const locale = useLocaleStore();
const logged = computed(() => auth.isLoggedIn);

/** 后端白名单：order / delivery / refund / invoice / other */
const CATEGORIES = ['order', 'delivery', 'refund', 'invoice', 'other'];
const category = ref('order');
const orderCode = ref('');
const content = ref('');
const images = ref<string[]>([]);
const submitting = ref(false);
const items = ref<any[]>([]);
const loading = ref(true);

function categoryLabel(c: string): string {
  return locale.t('supportTicket.cat_' + (CATEGORIES.includes(c) ? c : 'other'));
}
function statusLabel(s: string): string {
  if (s === 'replied') return locale.t('supportTicket.statusReplied');
  if (s === 'closed') return locale.t('supportTicket.statusClosed');
  return locale.t('supportTicket.statusOpen');
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
  void loadList();
});

async function loadList() {
  loading.value = !items.value.length;
  try {
    items.value = await fetchMySupportTickets(0, 50);
  } catch {
    if (!items.value.length) items.value = [];
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!content.value.trim()) {
    uni.showToast({ title: locale.t('supportTicket.requiredContent'), icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    await createSupportTicket({
      category: category.value,
      content: content.value.trim(),
      images: images.value.length ? images.value : undefined,
      orderCode: orderCode.value.trim() || undefined,
    });
    uni.showToast({ title: locale.t('supportTicket.success'), icon: 'none' });
    content.value = '';
    images.value = [];
    await loadList();
  } catch (e: any) {
    uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('supportTicket.fail'), icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

function goLogin() {
  auth.requireLogin();
}
</script>

<style lang="scss" scoped>
.st-page { min-height: 100vh; background: $bg-color; padding: 20rpx; box-sizing: border-box; }
.st-empty {
  min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20rpx;
  &__ico { font-size: 80rpx; }
  &__text { font-size: 28rpx; color: $text-color-placeholder; }
  &__btn { margin-top: 20rpx; background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 28rpx; padding: 0 60rpx; height: 76rpx; line-height: 76rpx; }
}
.st-card {
  background: $surface; border-radius: $radius-md; padding: 28rpx; margin-bottom: 20rpx;
  &__head { display: flex; align-items: baseline; justify-content: space-between; gap: 16rpx; }
  &__title { font-size: 30rpx; font-weight: bold; color: $text-color; }
  &__tip { display: block; font-size: 23rpx; color: $text-color-placeholder; margin: 10rpx 0 20rpx; line-height: 1.5; }
}
.st-types { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 20rpx; }
.st-type {
  font-size: 24rpx; color: #4e5560; background: #f5f6f8; border: 1rpx solid $border-color;
  border-radius: 999rpx; padding: 8rpx 24rpx;
  &.on { color: $brand-color; border-color: $brand-color; background: $brand-soft; }
}
.st-label { display: block; font-size: 25rpx; color: $text-color; margin: 20rpx 0 12rpx; }
.st-input {
  height: 76rpx; padding: 0 20rpx; background: #f5f6f8; border-radius: 12rpx;
  font-size: 26rpx; color: $text-color;
}
.st-textarea {
  width: 100%; min-height: 180rpx; padding: 18rpx 20rpx; box-sizing: border-box;
  background: #f5f6f8; border-radius: 12rpx; font-size: 26rpx; color: $text-color;
}
.st-ph { color: #a6acb5; }
.st-submit {
  margin-top: 30rpx; background: $brand-color; color: #fff; border-radius: 999rpx;
  height: 84rpx; line-height: 84rpx; font-size: 29rpx;
  &[disabled] { opacity: .6; }
}
.st-loading, .st-none { padding: 40rpx 0; text-align: center; font-size: 25rpx; color: $text-color-placeholder; }
.st-item {
  padding: 22rpx 0; border-bottom: 1rpx solid $border-color;
  &:last-child { border-bottom: none; padding-bottom: 0; }
  &__head { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
  &__cat { flex: 1; min-width: 0; font-size: 27rpx; color: $text-color; }
  &__status {
    flex: none; font-size: 21rpx; border-radius: 999rpx; padding: 2rpx 16rpx;
    background: #fff7e6; color: #b45309;
    &.is-replied { background: #e8f1ff; color: #1d4ed8; }
    &.is-closed { background: #e6f5ec; color: #15803d; }
  }
  &__meta { display: block; font-size: 21rpx; color: $text-color-placeholder; margin: 8rpx 0; }
  &__content { font-size: 25rpx; color: #4e5560; line-height: 1.55; }
  &__imgs { display: flex; gap: 12rpx; margin-top: 12rpx; }
  &__img { width: 140rpx; height: 140rpx; border-radius: 12rpx; }
  &__reply { margin-top: 14rpx; padding: 16rpx; border-radius: 12rpx; background: #f7f8fa; }
  &__reply-label { font-size: 22rpx; color: $brand-color; margin-right: 12rpx; }
  &__reply-txt { font-size: 24rpx; color: #4e5560; line-height: 1.5; }
  &__reply-time { display: block; font-size: 20rpx; color: $text-color-placeholder; margin-top: 8rpx; }
}
</style>
