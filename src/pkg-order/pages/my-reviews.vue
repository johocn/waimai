<template>
  <view class="my-reviews">
    <view v-if="loading" class="hint">加载中…</view>
    <view v-else-if="!list.length" class="hint">还没有评价，订单完成后可以去评价</view>
    <view v-for="r in list" :key="r.id" class="card">
      <view class="head">
        <text class="stars">{{ '★'.repeat(r.rating) }}<text class="off">{{ '★'.repeat(5 - r.rating) }}</text></text>
        <text class="status" :class="'st-' + r.status">{{ statusLabel(r.status) }}</text>
      </view>
      <text class="content">{{ r.content }}</text>
      <view v-if="r.images?.length" class="imgs">
        <VImage v-for="(img, i) in r.images" :key="i" :src="img" width="140rpx" height="140rpx" />
      </view>
      <view v-if="r.reply" class="reply"><text class="reply__who">商家回复</text>{{ r.reply }}</view>
      <view v-for="fu in r.followUps ?? []" :key="fu.id" class="reply">
        <text class="reply__who">追加评价</text>{{ fu.content }}
      </view>
      <view class="foot">
        <text class="date">{{ formatDate(r.createdAt) }}</text>
        <view class="acts">
          <text v-if="canFollowUp(r)" class="followup" @tap="goFollowUp(r)">追评</text>
          <text v-else-if="r.followUps?.length" class="followed">已追评</text>
          <text
            v-if="r.status !== 'deleted' && !r.parentId"
            class="del" @tap="del(r)"
          >删除</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getMyReviews, deleteReview } from '../../api/queries/review';
import VImage from '../../components/VImage.vue';

const list = ref<any[]>([]);
const loading = ref(true);

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
  return { pending: '审核中', approved: '已通过', rejected: '未通过', deleted: '已删除' }[s] || s;
}
function formatDate(d: string) {
  return d ? new Date(d).toLocaleDateString('zh-CN') : '';
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
    title: '删除评价',
    content: '删除后不可恢复，确定删除？',
    success: async (m) => {
      if (!m.confirm) return;
      try {
        await deleteReview(r.id);
        list.value = list.value.filter(x => x.id !== r.id);
        uni.showToast({ title: '已删除', icon: 'none' });
      } catch (err: any) {
        uni.showToast({ title: err?.message || '删除失败', icon: 'none' });
      }
    },
  });
}
</script>

<style lang="scss" scoped>
.my-reviews { padding: 24rpx; }
.hint { text-align: center; color: #8a919c; font-size: 26rpx; padding: 120rpx 0; }
.card {
  background: $surface; border-radius: 16rpx; padding: 24rpx; margin-bottom: 24rpx;
  display: flex; flex-direction: column; gap: 16rpx;
}
.head { display: flex; justify-content: space-between; align-items: center; }
.stars { color: #f59e0b; font-size: 28rpx; .off { color: #e3e6ea; } }
.status {
  font-size: 22rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
  &.st-pending { color: #b45309; background: #fdf3e0; }
  &.st-approved { color: #16a34a; background: #e6f5ec; }
  &.st-rejected, &.st-deleted { color: #8a919c; background: #f5f6f8; }
}
.content { font-size: 26rpx; color: #1f2329; line-height: 1.6; }
.imgs { display: flex; gap: 12rpx; flex-wrap: wrap; }
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
