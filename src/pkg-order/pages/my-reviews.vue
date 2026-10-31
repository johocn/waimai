<template>
  <view class="my-reviews">
    <!-- 信任签名卡（只读）：我的评价页无统计口径，只带「真实评价」徽章 -->
    <TrustSignatureCard />
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
        <!-- 差评申诉留痕：待审核/已通过/已驳回（含平台审核说明） -->
        <view v-if="r.appealStatus" class="appeal" :class="'appeal--' + r.appealStatus">
          <text class="appeal__tag">{{ $t('myReviews.appealTag') }} {{ appealLabel(r.appealStatus) }}</text>
          <text v-if="r.appealReason" class="appeal__reason">{{ r.appealReason }}</text>
          <text v-if="r.appealResult" class="appeal__result">{{ $t('myReviews.appealNote') }}{{ r.appealResult }}</text>
        </view>
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
            <text v-if="canAppeal(r)" class="appeal-btn" @tap="openAppeal(r)">{{ $t('myReviews.appeal') }}</text>
            <text
              v-if="r.status !== 'deleted' && !r.parentId"
              class="del" @tap="del(r)"
            >{{ $t('myReviews.del') }}</text>
          </view>
        </view>
      </view>
    </template>

    <!-- 差评申诉弹层：理由必填、可选图片（最多 3 张） -->
    <view v-if="appealTarget" class="ap-mask" @tap.self="closeAppeal">
      <view class="ap-sheet">
        <text class="ap-sheet__title">{{ $t('myReviews.appealTitle') }}</text>
        <text class="ap-sheet__hint">{{ $t('myReviews.appealHint') }}</text>
        <textarea
          class="ap-sheet__area" v-model="appealReason" :maxlength="300"
          :placeholder="$t('myReviews.appealPh')"
        />
        <view class="ap-sheet__imgs">
          <view v-for="(img, i) in appealImages" :key="i" class="ap-sheet__img">
            <VImage :src="img" width="120rpx" height="120rpx" />
            <text class="ap-sheet__del" @tap="removeAppealImage(i)">×</text>
          </view>
          <view v-if="appealImages.length < 3" class="ap-sheet__add" @tap="pickAppealImages">＋</view>
        </view>
        <view class="ap-sheet__acts">
          <text class="ap-sheet__cancel" @tap="closeAppeal">{{ $t('myReviews.cancel') }}</text>
          <button class="ap-sheet__submit" :disabled="appealSubmitting" @tap="submitAppeal">
            {{ appealSubmitting ? $t('myReviews.appealSubmitting') : $t('myReviews.appealSubmit') }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getMyReviews, deleteReview, appealReview } from '../../api/queries/review';
import { uploadCustomerAsset } from '../../api/mutations/upload';
import { useLocaleStore } from '../../stores/locale';
import VImage from '../../components/VImage.vue';
import TrustSignatureCard from '../../components/TrustSignatureCard.vue';

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

/** 差评申诉弹层状态（理由必填，图片可选） */
const appealTarget = ref<any>(null);
const appealReason = ref('');
const appealImages = ref<string[]>([]);
const appealSubmitting = ref(false);
const MAX_APPEAL_IMAGES = 3;

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
  const keys: Record<string, string> = {
    pending: 'stPending', approved: 'stApproved', rejected: 'stRejected',
    deleted: 'stDeleted', hidden: 'stHidden',
  };
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

/* ---------------- 差评申诉 ---------------- */

/** 申诉入口：本人 1-3 星主评、未删除/未隐藏、且无待审或已通过的申诉；权威校验在服务端 */
function canAppeal(r: any) {
  if (r.parentId || r.status === 'deleted' || r.status === 'hidden') return false;
  if (Number(r.rating) > 3) return false;
  return r.appealStatus !== 'pending' && r.appealStatus !== 'approved';
}
function appealLabel(s: string) {
  const keys: Record<string, string> = { pending: 'appealPending', approved: 'appealApproved', rejected: 'appealRejected' };
  const k = keys[s];
  return k ? locale.t(`myReviews.${k}`) : s;
}
function openAppeal(r: any) {
  appealTarget.value = r;
  appealReason.value = '';
  appealImages.value = [];
}
function closeAppeal() {
  if (appealSubmitting.value) return;
  appealTarget.value = null;
  appealReason.value = '';
  appealImages.value = [];
}
/** 选择申诉凭证图：逐张上传换正式 URL（最多 3 张） */
function pickAppealImages() {
  const left = MAX_APPEAL_IMAGES - appealImages.value.length;
  if (left <= 0) {
    uni.showToast({ title: locale.t('chat.maxImages'), icon: 'none' });
    return;
  }
  uni.chooseImage({
    count: left,
    sizeType: ['compressed'],
    success: async (res: any) => {
      const paths: string[] = res?.tempFilePaths ?? [];
      for (const path of paths) {
        try {
          const asset = await uploadCustomerAsset(path);
          appealImages.value = [...appealImages.value, asset.source];
        } catch (e: any) {
          uni.showToast({ title: e?.message || locale.t('chat.uploadFail'), icon: 'none' });
        }
      }
    },
  });
}
function removeAppealImage(i: number) {
  appealImages.value = appealImages.value.filter((_, idx) => idx !== i);
}
async function submitAppeal() {
  const target = appealTarget.value;
  if (!target || appealSubmitting.value) return;
  const reason = appealReason.value.trim();
  if (!reason) {
    uni.showToast({ title: locale.t('myReviews.appealPh'), icon: 'none' });
    return;
  }
  appealSubmitting.value = true;
  try {
    const res: any = await appealReview(target.id, reason, appealImages.value);
    const row = res?.appealReview;
    list.value = list.value.map((x: any) => (x.id === target.id ? { ...x, ...(row || {}) } : x));
    appealSubmitting.value = false;
    closeAppeal();
    uni.showToast({ title: locale.t('myReviews.appealDone'), icon: 'none' });
  } catch (err: any) {
    appealSubmitting.value = false;
    uni.showToast({ title: err?.message || locale.t('myReviews.appealFail'), icon: 'none' });
  }
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
  &.st-hidden { color: #8a919c; background: #f5f6f8; }
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

/* 申诉留痕与入口 */
.appeal {
  display: flex; flex-direction: column; gap: 6rpx;
  background: #f5f6f8; border-radius: 12rpx; padding: 16rpx;
  font-size: 22rpx; color: #8a919c;
  &__tag { color: #b45309; }
  &__reason { font-size: 24rpx; color: #1f2329; line-height: 1.5; }
  &__result { line-height: 1.5; }
  &--approved { background: #e6f5ec; .appeal__tag { color: #16a34a; } }
  &--rejected { background: #f5f6f8; }
}
.appeal-btn { font-size: 24rpx; color: #b45309; }

/* 申诉弹层 */
.ap-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 99;
  background: rgba(0, 0, 0, .45); display: flex; align-items: flex-end;
}
.ap-sheet {
  width: 100%; background: #fff; border-radius: 24rpx 24rpx 0 0;
  padding: 32rpx 28rpx 40rpx; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 16rpx;
  &__title { font-size: 32rpx; font-weight: bold; color: #1f2329; text-align: center; }
  &__hint { font-size: 22rpx; color: #8a919c; line-height: 1.5; }
  &__area {
    width: 100%; height: 200rpx; background: #f5f6f8; border-radius: 12rpx;
    padding: 20rpx; font-size: 26rpx; box-sizing: border-box;
  }
  &__imgs { display: flex; flex-wrap: wrap; gap: 12rpx; align-items: center; }
  &__img { position: relative; }
  &__del {
    position: absolute; top: -10rpx; right: -10rpx; width: 36rpx; height: 36rpx;
    border-radius: 50%; background: rgba(0, 0, 0, .6); color: #fff; font-size: 24rpx;
    display: flex; align-items: center; justify-content: center;
  }
  &__add {
    width: 120rpx; height: 120rpx; border-radius: 12rpx; border: 2rpx dashed $border-color;
    display: flex; align-items: center; justify-content: center;
    font-size: 40rpx; color: $text-color-placeholder;
  }
  &__acts { display: flex; gap: 20rpx; margin-top: 8rpx; }
  &__cancel {
    flex: 1; height: 84rpx; line-height: 84rpx; text-align: center; border-radius: 12rpx;
    background: #f5f6f8; color: #606770; font-size: 28rpx;
  }
  &__submit {
    flex: 2; height: 84rpx; line-height: 84rpx; padding: 0; border-radius: 12rpx;
    background: $brand-color; color: #fff; font-size: 28rpx;
    &[disabled] { opacity: .6; }
  }
}
</style>
