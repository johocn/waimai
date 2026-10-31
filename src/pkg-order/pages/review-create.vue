<template>
  <view class="review-create">
    <view v-if="draftTip" class="draft-tip">
      <text class="draft-tip__txt">💾 {{ $t('reviewCreate.draftRestored') }}</text>
      <text class="draft-tip__clear" @tap="resetDraft">{{ $t('reviewCreate.draftClear') }}</text>
    </view>
    <!-- 信任签名卡：质量 → 服务 → 时间 固定顺序 -->
    <view v-if="!isFollowUp" class="trust">
      <view class="trust__head">
        <text class="trust__title">{{ $t('reviewCreate.trustTitle') }}</text>
        <text class="trust__badge">{{ $t('reviewCreate.trustReal') }}</text>
      </view>
      <view class="trust__row">
        <text class="trust__label">{{ $t('reviewCreate.trustQuality') }}</text>
        <text class="trust__text">{{ $t('reviewCreate.trustQualityText') }}</text>
      </view>
      <view class="trust__row">
        <text class="trust__label">{{ $t('reviewCreate.trustService') }}</text>
        <text class="trust__text">{{ $t('reviewCreate.trustServiceText') }}</text>
      </view>
      <view class="trust__row">
        <text class="trust__label">{{ $t('reviewCreate.trustTime') }}</text>
        <text class="trust__text">{{ $t('reviewCreate.trustTimeText') }}</text>
      </view>
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
      <!-- 仅 1-3 星显示改进项：只评「好」时不追问「哪些需要改进」 -->
      <view v-if="!isFollowUp && rating <= 3" class="improve">
        <text class="improve__title">{{ $t('reviewCreate.improveTitle') }}</text>
        <view class="tags">
          <text
            v-for="t in IMPROVE_TAGS" :key="t"
            class="tag tag--improve" :class="{ on: improvePicked.includes(t) }"
            @tap="toggleImprove(t)"
          >{{ improveLabel(t) }}</text>
        </view>
      </view>
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
      <!-- 好评标签：仅 4-5 星出现，与改进项互斥 -->
      <view v-if="!isFollowUp && rating >= 4" class="tags">
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

    <!-- 好评送礼：仅好评（4-5 星）出现，选项固定为 质量 / 服务 / 时间 三项 -->
    <view v-if="!isFollowUp && rating >= 4" class="gift">
      <text class="gift__title">{{ $t('reviewCreate.giftTitle') }}</text>
      <text class="gift__hint">{{ $t('reviewCreate.giftHint') }}</text>
      <view class="gift__opts">
        <text
          v-for="g in GIFT_OPTIONS" :key="g.value"
          class="gift__opt" :class="{ on: giftChoice === g.value }"
          @tap="giftChoice = g.value"
        >{{ $t(g.labelKey) }}</text>
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
import { track } from '../../utils/telemetry';
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

// ── 改进项（仅 1-3 星出现）与好评送礼（仅 4-5 星出现）──
// 改进项值为提交后端的业务 tag，展示走 i18n；好评送礼三项为纯前端展示，后端无对应字段
const IMPROVE_TAGS = ['口味一般', '分量不足', '配送慢', '包装破损', '性价比低'];
const IMPROVE_LABELS: Record<string, string> = {
  '口味一般': 'improveTaste',
  '分量不足': 'improvePortion',
  '配送慢': 'improveDelivery',
  '包装破损': 'improvePacking',
  '性价比低': 'improveValue',
};
function improveLabel(t: string): string { return locale.t(`reviewCreate.${IMPROVE_LABELS[t]}`); }
const GIFT_OPTIONS = [
  { value: '质量', labelKey: 'reviewCreate.giftQuality' },
  { value: '服务', labelKey: 'reviewCreate.giftService' },
  { value: '时间', labelKey: 'reviewCreate.giftTime' },
];
const improvePicked = ref<string[]>([]);
const giftChoice = ref('');

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
  improvePicked.value = [];
  giftChoice.value = '';
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

function toggleImprove(t: string) {
  const i = improvePicked.value.indexOf(t);
  if (i >= 0) improvePicked.value.splice(i, 1);
  else improvePicked.value.push(t);
}

/** 好评标签与改进项互斥：切换星级档位时清空另一组已选项 */
watch(rating, (r) => {
  if (r >= 4) improvePicked.value = [];
  else picked.value = [];
});

/** 提交用 tag：好评标签 + 改进项合并，空数组不上行 */
function submitTags(): string[] | undefined {
  const all = [...picked.value, ...improvePicked.value];
  return all.length ? all : undefined;
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
        tags: submitTags(),
        isAnonymous: anonymous.value,
      });
      // P4-4 评价提交埋点（评分分布 + 是否带图 + 是否匿名）
      track('review_submit', { productId: productId.value, rating: rating.value, images: images.value.length, anonymous: anonymous.value });
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
.trust {
  background: $surface; border-radius: 16rpx; padding: 20rpx 24rpx; margin-bottom: 24rpx;
  &__head { display: flex; align-items: center; gap: 12rpx; }
  &__title { font-size: 26rpx; font-weight: 600; color: #1f2329; }
  &__badge { margin-left: auto; font-size: 20rpx; color: #16a34a; background: #e6f5ec; border-radius: 999rpx; padding: 4rpx 14rpx; }
  &__row { display: flex; align-items: flex-start; gap: 12rpx; margin-top: 14rpx; }
  &__label { font-size: 22rpx; color: #16a34a; background: #e6f5ec; border-radius: 8rpx; padding: 2rpx 12rpx; flex-shrink: 0; }
  &__text { font-size: 22rpx; color: #8a919c; line-height: 1.5; }
}
.improve { margin-top: 16rpx;
  &__title { display: block; font-size: 24rpx; color: #8a919c; margin-bottom: 10rpx; }
}
.tag--improve.on { color: #dc2626; border-color: #dc2626; background: #fdecec; }
.gift {
  background: $surface; border-radius: 16rpx; padding: 20rpx 24rpx; margin-bottom: 24rpx;
  &__title { display: block; font-size: 26rpx; font-weight: 600; color: #1f2329; }
  &__hint { display: block; font-size: 22rpx; color: #8a919c; margin-top: 6rpx; }
  &__opts { display: flex; gap: 16rpx; margin-top: 14rpx; }
  &__opt { flex: 1; text-align: center; font-size: 24rpx; color: #16a34a; background: #e6f5ec; border: 1rpx solid transparent; border-radius: 10rpx; padding: 12rpx 0;
    &.on { border-color: #16a34a; background: #fff; font-weight: 600; }
  }
}
.submit {
  background: #16a34a; color: #fff; font-size: 30rpx; border-radius: 999rpx;
  &[disabled] { opacity: 0.6; }
}
</style>
