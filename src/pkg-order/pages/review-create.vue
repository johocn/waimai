<template>
  <view class="review-create">
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

    <view class="section">
      <view v-if="!isFollowUp" class="tags">
        <text
          v-for="t in TAGS" :key="t"
          class="tag" :class="{ on: picked.includes(t) }"
          @tap="toggleTag(t)"
        >{{ t }}</text>
      </view>
      <textarea
        v-model="content"
        class="content"
        :maxlength="300"
        :placeholder="isFollowUp ? '补充说说使用/食用后的感受吧～' : '这次的用餐体验如何～'"
        placeholder-class="content-ph"
      />
      <view class="imgs">
        <VImageUpload v-model="images" :maxCount="3" />
      </view>
      <view v-if="!isFollowUp" class="meta">
        <text>匿名评价</text>
        <switch :checked="anonymous" color="#16a34a" style="transform: scale(0.7)" @change="(e: any) => (anonymous = e.detail.value)" />
      </view>
    </view>

    <button class="submit" :disabled="submitting" @tap="submit">
      {{ submitting ? '发布中…' : isFollowUp ? '发布追评' : '发布评价' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { createReview, createFollowUpReview } from '../../api/queries/review';
import VImage from '../../components/VImage.vue';
import VImageUpload from '../../components/ImageUpload.vue';

const TAGS = ['口味赞', '分量足', '配送快', '包装好', '性价比高'];
const LABELS: Record<number, string> = { 5: '5.0 极赞', 4: '4.0 推荐', 3: '3.0 一般', 2: '2.0 不佳', 1: '1.0 很差' };

const productId = ref('');
const orderLineId = ref('');
const variantId = ref('');
const name = ref('');
const thumb = ref('');
const followUpReviewId = ref('');

const isFollowUp = computed(() => !!followUpReviewId.value);

const rating = ref(5);
const picked = ref<string[]>([]);
const content = ref('');
const images = ref<string[]>([]);
const anonymous = ref(false);
const submitting = ref(false);

const ratingLabel = computed(() => LABELS[rating.value] || '');

onLoad((q: any) => {
  productId.value = q.productId || '';
  orderLineId.value = q.lineId || '';
  variantId.value = q.variantId || '';
  name.value = decodeURIComponent(q.name || '');
  thumb.value = decodeURIComponent(q.thumb || '');
  // 追评模式：query 带 followUp=1&reviewId= → 隐藏星级/标签/匿名，提交走 createFollowUpReview
  if (q.followUp === '1' && q.reviewId) {
    followUpReviewId.value = q.reviewId;
  }
});

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

async function submit() {
  if (!content.value.trim()) {
    uni.showToast({ title: '写点什么再发布吧', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    if (isFollowUp.value) {
      await createFollowUpReview(followUpReviewId.value, {
        content: content.value.trim(),
        images: images.value.length ? images.value : undefined,
      });
      uni.showToast({ title: '追评已提交，审核通过后展示', icon: 'none' });
    } else {
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
      uni.showToast({ title: '评价已提交，审核通过后展示', icon: 'none' });
    }
    setTimeout(() => uni.navigateBack(), 1200);
  } catch (err: any) {
    uni.showToast({ title: err?.message || '发布失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<style lang="scss" scoped>
.review-create { padding: 24rpx; }
.section {
  background: $surface; border-radius: 16rpx; padding: 24rpx; margin-bottom: 24rpx;
}
.goods { display: flex; align-items: center; gap: 16rpx; }
.goods__name { font-size: 28rpx; color: #1f2329; flex: 1; min-width: 0; }
.stars {
  display: flex; justify-content: center; gap: 10rpx; padding: 28rpx 0 8rpx;
  .star { font-size: 56rpx; color: #f59e0b; &.off { color: #e3e6ea; } }
}
.stars__label { display: block; text-align: center; font-size: 24rpx; color: #f59e0b; }
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
