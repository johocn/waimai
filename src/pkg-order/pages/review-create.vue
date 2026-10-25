<template>
  <view class="review-create">
    <view v-if="draftTip" class="draft-tip">
      <text class="draft-tip__txt">💾 {{ $t('reviewCreate.draftRestored') }}</text>
      <text class="draft-tip__clear" @tap="resetDraft">{{ $t('reviewCreate.draftClear') }}</text>
    </view>
    <view class="section">
      <view class="goods">
        <VImage :src="thumb" width="120rpx" height="120rpx" />
        <text class="goods__name">{{ name }}</text>
      </view>
      <view v-if="!isFollowUp" class="stars" @tap="onStarTap">
        <text v-for="i in 5" :key="i" class="star" :class="{ off: i > rating }">★</text>
      </view>
      <text v-if="!isFollowUp" class="stars__label">{{ ratingLabel }}</text>
    </view>

    <!-- 骑手评分（同单一次，提交后按 orderId 幂等更新） -->
    <view v-if="!isFollowUp && orderId" class="section">
      <text class="rider-title">{{ $t('reviewCreate.riderTitle') }}</text>
      <text class="rider-hint">{{ $t('reviewCreate.riderHint') }}</text>
      <view class="stars stars--rider" @tap="onRiderStarTap">
        <text v-for="i in 5" :key="'r' + i" class="star" :class="{ off: i > riderRating }">★</text>
      </view>
      <text class="stars__label">{{ riderRatingLabel }}</text>
      <view class="tags">
        <text
          v-for="t in RIDER_TAGS" :key="t"
          class="tag" :class="{ on: riderPicked.includes(t) }"
          @tap="toggleRiderTag(t)"
        >{{ riderTagLabel(t) }}</text>
      </view>
    </view>

    <view class="section">
      <view v-if="!isFollowUp" class="tags">
        <text
          v-for="t in TAGS" :key="t"
          class="tag" :class="{ on: picked.includes(t) }"
          @tap="toggleTag(t)"
        >{{ tagLabel(t) }}</text>
      </view>
      <textarea
        v-model="content"
        class="content"
        :maxlength="300"
        :placeholder="isFollowUp ? $t('reviewCreate.phFollowUp') : $t('reviewCreate.phDefault')"
        placeholder-class="content-ph"
      />
      <view class="imgs">
        <VImageUpload v-model="images" :maxCount="3" />
      </view>
      <view v-if="!isFollowUp" class="meta">
        <text>{{ $t('reviewCreate.anonymousLabel') }}</text>
        <switch :checked="anonymous" color="#16a34a" style="transform: scale(0.7)" @change="(e: any) => (anonymous = e.detail.value)" />
      </view>
    </view>

    <button class="submit" :disabled="submitting" @tap="submit">
      {{ submitting ? $t('reviewCreate.publishing') : isFollowUp ? $t('reviewCreate.publishFollowUp') : $t('reviewCreate.publish') }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { createReview, createFollowUpReview } from '../../api/queries/review';
import { rateRider } from '../../api/queries/support';
import { useLocaleStore } from '../../stores/locale';
import VImage from '../../components/VImage.vue';
import VImageUpload from '../../components/ImageUpload.vue';

const locale = useLocaleStore();
// TAGS 值为提交后端的业务 tag，保持中文；展示时经 labelKey 映射转 i18n
const TAGS = ['口味赞', '分量足', '配送快', '包装好', '性价比高'];
const TAG_LABELS: Record<string, string> = { '口味赞': 'tagTaste', '分量足': 'tagPortion', '配送快': 'tagSpeed', '包装好': 'tagPacking', '性价比高': 'tagValue' };
function tagLabel(t: string): string { return locale.t(`reviewCreate.${TAG_LABELS[t]}`); }
// 星级文案 labelKey 映射（键存档位枚举）
const LABELS: Record<number, string> = { 5: 'r5', 4: 'r4', 3: 'r3', 2: 'r2', 1: 'r1' };

const productId = ref('');
const orderLineId = ref('');
const variantId = ref('');
const name = ref('');
const thumb = ref('');
const orderId = ref('');
const followUpReviewId = ref('');

const isFollowUp = computed(() => !!followUpReviewId.value);

const rating = ref(5);
const picked = ref<string[]>([]);
const content = ref('');
const images = ref<string[]>([]);
const anonymous = ref(false);
const submitting = ref(false);

const ratingLabel = computed(() => LABELS[rating.value] ? locale.t(`reviewCreate.${LABELS[rating.value]}`) : '');

// ── 骑手评分（可选）：用户不点星则不提交，避免无骑手订单报错 ──
const RIDER_TAGS = ['准时送达', '态度友好', '沟通顺畅', '骑行平稳'];
const RIDER_TAG_LABELS: Record<string, string> = {
  '准时送达': 'riderTagOnTime',
  '态度友好': 'riderTagFriendly',
  '沟通顺畅': 'riderTagComm',
  '骑行平稳': 'riderTagSmooth',
};
function riderTagLabel(t: string): string { return locale.t(`reviewCreate.${RIDER_TAG_LABELS[t]}`); }
const riderRating = ref(0);
const riderPicked = ref<string[]>([]);
/** 用户是否点过骑手星级（点过才提交，未点视为不需要评价骑手） */
const riderTouched = ref(false);
const riderRatingLabel = computed(() =>
  riderTouched.value ? (LABELS[riderRating.value] ? locale.t(`reviewCreate.${LABELS[riderRating.value]}`) : '') : '',
);

onLoad((q: any) => {
  productId.value = q.productId || '';
  orderLineId.value = q.lineId || '';
  variantId.value = q.variantId || '';
  orderId.value = q.orderId || '';
  name.value = decodeURIComponent(q.name || '');
  thumb.value = decodeURIComponent(q.thumb || '');
  // 追评模式：query 带 followUp=1&reviewId= → 隐藏星级/标签/匿名，提交走 createFollowUpReview
  if (q.followUp === '1' && q.reviewId) {
    followUpReviewId.value = q.reviewId;
  }
  restoreDraft();
});

// ── 评价草稿：输入即本地暂存（按订单行 + 评价类型分键），退出不丢失，提交后清除 ──
const DRAFT_PREFIX = 'review_draft:';
const draftKey = computed(
  () => DRAFT_PREFIX + (orderLineId.value || productId.value || 'unknown') + ':' + (followUpReviewId.value || 'main'),
);
const draftTip = ref(false);
/** 提交成功后置位，避免返回时 onUnload 重新落草稿 */
const submitted = ref(false);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function clearDraft() {
  try { uni.removeStorageSync(draftKey.value); } catch { /* 忽略存储异常 */ }
}

/** 本次编辑是否为空（全默认则无需留草稿） */
function draftEmpty(): boolean {
  return !content.value.trim() && !picked.value.length && rating.value === 5 && !anonymous.value;
}

function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (submitted.value) return;
  try {
    if (draftEmpty()) { clearDraft(); return; }
    uni.setStorageSync(draftKey.value, JSON.stringify({
      rating: rating.value,
      picked: picked.value,
      content: content.value,
      anonymous: anonymous.value,
    }));
  } catch { /* 忽略存储异常 */ }
}

function scheduleSave() {
  if (submitting.value) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

function restoreDraft() {
  try {
    const raw = uni.getStorageSync(draftKey.value);
    if (!raw) return;
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!d) return;
    if (Number(d.rating) >= 1 && Number(d.rating) <= 5) rating.value = Number(d.rating);
    if (Array.isArray(d.picked)) picked.value = d.picked.filter((t: string) => TAGS.includes(t));
    if (typeof d.content === 'string') content.value = d.content;
    if (typeof d.anonymous === 'boolean') anonymous.value = d.anonymous;
    draftTip.value = !draftEmpty();
  } catch { /* 坏草稿直接忽略 */ }
}

/** 清除草稿并还原表单默认值 */
function resetDraft() {
  rating.value = 5;
  picked.value = [];
  content.value = '';
  anonymous.value = false;
  draftTip.value = false;
  clearDraft();
}

watch([rating, picked, content, anonymous], scheduleSave, { deep: true });
onUnload(saveNow);

function onStarTap(e: any) {
  // 星星等宽排布，按触点视口横坐标折算档位
  const x = e.changedTouches?.[0]?.clientX ?? e.detail?.x;
  const query = uni.createSelectorQuery();
  query.select('.stars').boundingClientRect((rect: any) => {
    if (!rect?.width || x == null) return;
    rating.value = Math.max(1, Math.min(5, Math.ceil((x - rect.left) / (rect.width / 5))));
  }).exec();
}

function toggleTag(t: string) {
  const i = picked.value.indexOf(t);
  if (i >= 0) picked.value.splice(i, 1);
  else picked.value.push(t);
}

function onRiderStarTap(e: any) {
  const x = e.changedTouches?.[0]?.clientX ?? e.detail?.x;
  const query = uni.createSelectorQuery();
  query.select('.stars--rider').boundingClientRect((rect: any) => {
    if (!rect?.width || x == null) return;
    riderRating.value = Math.max(1, Math.min(5, Math.ceil((x - rect.left) / (rect.width / 5))));
    riderTouched.value = true;
  }).exec();
}

function toggleRiderTag(t: string) {
  riderTouched.value = true;
  const i = riderPicked.value.indexOf(t);
  if (i >= 0) riderPicked.value.splice(i, 1);
  else riderPicked.value.push(t);
}

/** 骑手评分失败不阻断商品评价（无骑手/已评分均静默降级为提示） */
async function submitRiderRating() {
  if (!riderTouched.value || !orderId.value) return true;
  try {
    await rateRider({
      orderId: orderId.value,
      rating: riderRating.value,
      tags: riderPicked.value.length ? riderPicked.value : undefined,
    });
    return true;
  } catch (e: any) {
    uni.showToast({
      title: e?.response?.errors?.[0]?.message || locale.t('reviewCreate.riderRateFail'),
      icon: 'none',
    });
    return false;
  }
}

async function submit() {
  if (!content.value.trim()) {
    uni.showToast({ title: locale.t('reviewCreate.contentRequired'), icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    if (isFollowUp.value) {
      await createFollowUpReview(followUpReviewId.value, {
        content: content.value.trim(),
        images: images.value.length ? images.value : undefined,
      });
      uni.showToast({ title: locale.t('reviewCreate.followUpDone'), icon: 'none' });
    } else {
      await submitRiderRating();
      await createReview({
        productId: productId.value,
        orderLineId: orderLineId.value,
        variantId: variantId.value || undefined,
        rating: rating.value,
        content: content.value.trim(),
        images: images.value.length ? images.value : undefined,
        tags: picked.value.length ? picked.value : undefined,
        isAnonymous: anonymous.value,
      });
      uni.showToast({ title: locale.t('reviewCreate.reviewDone'), icon: 'none' });
    }
    setTimeout(() => uni.navigateBack(), 1200);
    submitted.value = true;
    clearDraft();
    draftTip.value = false;
  } catch (err: any) {
    uni.showToast({ title: err?.message || locale.t('reviewCreate.publishFail'), icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<style lang="scss" scoped>
.review-create { padding: 24rpx; }
.draft-tip {
  display: flex; align-items: center; justify-content: space-between; gap: 16rpx;
  margin-bottom: 20rpx; padding: 16rpx 20rpx; border-radius: 12rpx;
  background: #fffbeb; border: 1rpx solid #fde68a;
}
.draft-tip__txt { font-size: 24rpx; color: #92400e; }
.draft-tip__clear { font-size: 24rpx; color: #b45309; flex-shrink: 0; }
.section {
  background: $surface; border-radius: 16rpx; padding: 24rpx; margin-bottom: 24rpx;
}
.goods { display: flex; align-items: center; gap: 16rpx; }
.goods__name { font-size: 28rpx; color: #1f2329; flex: 1; min-width: 0; }
.stars {
  display: flex; justify-content: center; gap: 10rpx; padding: 28rpx 0 8rpx;
  .star { font-size: 56rpx; color: #f59e0b; &.off { color: #e3e6ea; } }
}
.stars__label { display: block; text-align: center; font-size: 24rpx; color: #f59e0b; min-height: 30rpx; }
.rider-title { display: block; font-size: 28rpx; font-weight: 600; color: #1f2329; }
.rider-hint { display: block; font-size: 22rpx; color: #8a919c; margin-top: 6rpx; }
.stars--rider { padding-top: 20rpx; }
.tags { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 20rpx; }
.tag {
  font-size: 24rpx; color: #4e5560; background: #f5f6f8; border: 1rpx solid #e3e6ea;
  border-radius: 999rpx; padding: 8rpx 24rpx;
  &.on { color: #16a34a; border-color: #16a34a; background: #e6f5ec; }
}
.content {
  width: 100%; min-height: 160rpx; font-size: 26rpx; color: #1f2329;
  background: #f5f6f8; border-radius: 12rpx; padding: 16rpx; box-sizing: border-box;
}
.content-ph { color: #8a919c; }
.imgs { margin-top: 20rpx; }
.meta {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 20rpx; font-size: 26rpx; color: #4e5560;
}
.submit {
  background: #16a34a; color: #fff; font-size: 30rpx; border-radius: 999rpx;
  &[disabled] { opacity: 0.6; }
}
</style>
