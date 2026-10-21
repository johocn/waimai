<template>
  <view class="my-reviews">
    <view v-if="loading" class="hint">{{ $t('myReviews.loading') }}</view>
    <view v-else-if="!list.length" class="hint">{{ $t('myReviews.empty') }}</view>
    <template v-else>
      <!-- 状态筛选（带计数）：全部 / 审核中 / 已通过 / 未通过 -->
      <view class="filters">
        <view class="filter" v-for="f in FILTERS" :key="f.key" :class="{ on: tab === f.key }" @click="tab = f.key">
          <text>{{ $t('myReviews.' + f.labelKey) }}</text>
          <text class="filter__n" v-if="counts[f.key]">{{ counts[f.key] }}</text>
        </view>
      </view>
      <view v-if="!filtered.length" class="hint">{{ $t('myReviews.emptyFiltered') }}</view>
      <view v-for="r in filtered" :key="r.id" class="card">
        <view class="head">
          <view class="head__left">
            <text class="stars">{{ '★'.repeat(r.rating) }}<text class="off">{{ '★'.repeat(5 - r.rating) }}</text></text>
            <text class="anon" v-if="r.isAnonymous">{{ $t('myReviews.anonymous') }}</text>
          </view>
          <text class="status" :class="'st-' + r.status">{{ statusLabel(r.status) }}</text>
        </view>
        <text class="content">{{ r.content }}</text>
        <view v-if="r.tags?.length" class="tags">
          <text class="tag" v-for="t in r.tags" :key="t">{{ t }}</text>
        </view>
        <view v-if="r.images?.length" class="imgs">
          <VImage
            v-for="(img, i) in r.images.slice(0, 3)" :key="i" :src="img" width="140rpx" height="140rpx"
            @tap="preview(r.images, i)"
          />
          <text class="imgs__more" v-if="r.images.length > 3">{{ $t('myReviews.moreImages').replace('{n}', String(r.images.length - 3)) }}</text>
        </view>
        <view v-if="r.reply" class="reply"><text class="reply__who">{{ $t('myReviews.merchantReply') }}</text>{{ r.reply }}</view>
        <view v-for="fu in r.followUps ?? []" :key="fu.id" class="reply">
          <text class="reply__who">{{ $t('myReviews.followUpTag') }}</text>{{ fu.content }}
          <view v-if="fu.images?.length" class="imgs imgs--fu">
            <VImage
              v-for="(img, i) in fu.images" :key="i" :src="img" width="120rpx" height="120rpx"
              @tap="preview(fu.images, i)"
            />
          </view>
        </view>
        <view class="foot">
          <text class="date">{{ formatDate(r.createdAt) }}</text>
          <view class="acts">
            <text v-if="canFollowUp(r)" class="followup" @tap="goFollowUp(r)">{{ $t('myReviews.followUp') }}</text>
            <text v-else-if="r.followUps?.length" class="followed">{{ $t('myReviews.followed') }}</text>
            <text
              v-if="r.status !== 'deleted' && !r.parentId"
              class="del" @tap="del(r)"
            >{{ $t('myReviews.del') }}</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getMyReviews, deleteReview } from '../../api/queries/review';
import { useLocaleStore } from '../../stores/locale';
import VImage from '../../components/VImage.vue';

const FILTERS = [
  { key: 'all', labelKey: 'filterAll' },
  { key: 'pending', labelKey: 'filterPending' },
  { key: 'approved', labelKey: 'filterApproved' },
  { key: 'rejected', labelKey: 'filterRejected' },
];

const locale = useLocaleStore();
const list = ref<any[]>([]);
const loading = ref(true);
const tab = ref('all');

const counts = computed<Record<string, number>>(() => {
  const base: Record<string, number> = { all: list.value.length, pending: 0, approved: 0, rejected: 0 };
  list.value.forEach((r: any) => {
    if (r.status in base && r.status !== 'all') base[r.status] += 1;
  });
  return base;
});
const filtered = computed(() =>
  tab.value === 'all' ? list.value : list.value.filter((r: any) => r.status === tab.value),
);

onShow(async () => {
  loading.value = true;
  try {
    const res: any = await getMyReviews();
    // 后端全量返回（含追评/软删），列表只展示主评且剔除已删
    list.value = (res?.myReviews ?? []).filter((r: any) => !r.parentId && r.status !== 'deleted');
  } catch {
    list.value = [];
  } finally {
    loading.value = false;
  }
});

function statusLabel(s: string) {
  const keys: Record<string, string> = { pending: 'stPending', approved: 'stApproved', rejected: 'stRejected', deleted: 'stDeleted' };
  const k = keys[s];
  return k ? locale.t(`myReviews.${k}`) : s;
}
function formatDate(d: string) {
  return d ? new Date(d).toLocaleDateString('zh-CN') : '';
}

/** 图片点击大图预览：主评与追评共用（urls 为该组图片全集） */
function preview(images: string[], index: number) {
  if (!images?.length) return;
  uni.previewImage({ urls: images, current: images[index] });
}

/** 追评窗口与后端一致（默认审核后 7 天，reviewedAt 缺失回退 createdAt）；权威校验在服务端 */
const FOLLOW_UP_WINDOW_MS = 7 * 86400000;
function canFollowUp(r: any) {
  if (r.parentId || r.status !== 'approved' || r.followUps?.length) return false;
  const base = r.reviewedAt ?? r.createdAt;
  if (!base) return false;
  return Date.now() - new Date(base).getTime() <= FOLLOW_UP_WINDOW_MS;
}
function goFollowUp(r: any) {
  uni.navigateTo(
    '/pkg-order/pages/review-create?followUp=1&reviewId=' + r.id
    + '&name=' + encodeURIComponent('我的评价'),
  );
}

function del(r: any) {
  uni.showModal({
    title: locale.t('myReviews.delTitle'),
    content: locale.t('myReviews.delConfirm'),
    success: async (m) => {
      if (!m.confirm) return;
      try {
        await deleteReview(r.id);
        list.value = list.value.filter(x => x.id !== r.id);
        uni.showToast({ title: locale.t('myReviews.deleted'), icon: 'none' });
      } catch (err: any) {
        uni.showToast({ title: err?.message || locale.t('myReviews.delFail'), icon: 'none' });
      }
    },
  });
}
</script>

<style lang="scss" scoped>
.my-reviews { padding: 24rpx; }
.filters {
  display: flex; gap: 12rpx; margin-bottom: 20rpx;
  .filter {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 6rpx;
    padding: 14rpx 0; border-radius: 999rpx; background: $surface;
    font-size: 24rpx; color: $text-color-secondary; border: 2rpx solid $border-color;
    &.on { color: $brand-color; border-color: $brand-color; background: #fff7f2; font-weight: bold; }
    &__n { font-size: 20rpx; }
  }
}
.hint { text-align: center; color: #8a919c; font-size: 26rpx; padding: 120rpx 0; }
.card {
  background: $surface; border-radius: 16rpx; padding: 24rpx; margin-bottom: 24rpx;
  display: flex; flex-direction: column; gap: 16rpx;
}
.head { display: flex; justify-content: space-between; align-items: center; }
.head__left { display: flex; align-items: center; gap: 12rpx; }
.anon {
  font-size: 20rpx; color: $text-color-placeholder; background: $bg-color;
  border-radius: 6rpx; padding: 2rpx 10rpx;
}
.stars { color: #f59e0b; font-size: 28rpx; .off { color: #e3e6ea; } }
.status {
  font-size: 22rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
  &.st-pending { color: #b45309; background: #fdf3e0; }
  &.st-approved { color: #16a34a; background: #e6f5ec; }
  &.st-rejected, &.st-deleted { color: #8a919c; background: #f5f6f8; }
}
.content { font-size: 26rpx; color: #1f2329; line-height: 1.6; }
.tags { display: flex; flex-wrap: wrap; gap: 12rpx; }
.tag {
  font-size: 22rpx; color: $brand-color; background: #fff7f2;
  border-radius: 999rpx; padding: 4rpx 16rpx;
}
.imgs { display: flex; gap: 12rpx; flex-wrap: wrap; align-items: center; }
.imgs--fu { margin-top: 12rpx; }
.imgs__more { font-size: 22rpx; color: #8a919c; }
.reply {
  background: #f5f6f8; border-radius: 12rpx; padding: 16rpx;
  font-size: 24rpx; color: #8a919c;
  &__who { color: #16a34a; margin-right: 12rpx; }
}
.foot { display: flex; justify-content: space-between; align-items: center; }
.acts { display: flex; align-items: center; gap: 24rpx; }
.date { font-size: 22rpx; color: #8a919c; }
.followup { font-size: 24rpx; color: #16a34a; }
.followed { font-size: 24rpx; color: #8a919c; }
.del { font-size: 24rpx; color: #dc2626; }
</style>
