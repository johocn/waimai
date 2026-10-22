<template>
  <view class="ph-page">
    <view v-if="!logged" class="ph-empty">
      <text class="ph-empty__ico">🔒</text>
      <text class="ph-empty__text">{{ $t('pointsHistory.loginTip') }}</text>
      <button class="ph-empty__btn" @tap="goLogin">{{ $t('member.loginBtn') }}</button>
    </view>

    <view v-else-if="loading && !items.length" class="ph-loading">{{ $t('pointsHistory.loading') }}</view>

    <view v-else-if="!items.length" class="ph-empty">
      <text class="ph-empty__ico">🧾</text>
      <text class="ph-empty__text">{{ $t('pointsHistory.empty') }}</text>
    </view>

    <template v-else>
      <view class="ph-item" v-for="r in items" :key="r.id">
        <view class="ph-item__main">
          <text class="ph-item__title">{{ titleOf(r) }}</text>
          <text class="ph-item__time">{{ fmtTime(r.createdAt) }}</text>
        </view>
        <view class="ph-item__side">
          <text class="ph-item__amount" :class="{ plus: Number(r.amount) > 0 }">
            {{ Number(r.amount) > 0 ? '+' : '' }}{{ r.amount }}
          </text>
          <text class="ph-item__balance">{{ $t('pointsHistory.balance').replace('{n}', String(r.balanceAfter)) }}</text>
        </view>
      </view>
      <view class="ph-foot">
        <text v-if="loadingMore">{{ $t('pointsHistory.loadingMore') }}</text>
        <text v-else-if="!hasMore">{{ $t('pointsHistory.noMore') }}</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow, onReachBottom } from '@dcloudio/uni-app';
import { getMyPointsHistory } from '../../api/queries/member';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const PAGE_SIZE = 20;
const auth = useAuthStore();
const locale = useLocaleStore();
const logged = computed(() => auth.isLoggedIn);

const items = ref<any[]>([]);
const total = ref(0);
const loading = ref(true);
const loadingMore = ref(false);
const hasMore = computed(() => items.value.length < total.value);

const TASK_CODES = ['daily_share', 'daily_login', 'daily_profile', 'bind_phone', 'reach_level', 'first_order', 'order_count', 'order_amount'];

/** 类型兜底：earn/spend/adjust/expire；未知类型按「调整」展示 */
function titleOf(row: any): string {
  const remark = String(row?.remark || '');
  if (remark.startsWith('checkin')) return locale.t('pointsHistory.checkinReward');
  if (remark.startsWith('task') || TASK_CODES.some((c) => remark.includes(c))) return locale.t('pointsHistory.taskReward');
  if (remark === 'order_delivered') return locale.t('pointsHistory.orderReward');
  const key = ['earn', 'spend', 'adjust', 'expire'].includes(row?.type) ? row.type : 'adjust';
  return locale.t('pointsHistory.' + key);
}

function fmtTime(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

onShow(() => {
  if (!logged.value) {
    loading.value = false;
    return;
  }
  load(true);
});

async function load(reset: boolean) {
  if (reset) {
    loading.value = true;
    items.value = [];
    total.value = 0;
  } else {
    if (loadingMore.value || !hasMore.value) return;
    loadingMore.value = true;
  }
  try {
    const res: any = await getMyPointsHistory({
      take: PAGE_SIZE,
      skip: reset ? 0 : items.value.length,
    });
    const list = res?.myPointsHistory?.items || [];
    total.value = Number(res?.myPointsHistory?.totalItems) || 0;
    items.value = reset ? list : [...items.value, ...list];
  } catch {
    if (reset) total.value = 0;
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

onReachBottom(() => load(false));

function goLogin() {
  auth.requireLogin();
}
</script>

<style lang="scss" scoped>
.ph-page { min-height: 100vh; background: $bg-color; padding: 20rpx; box-sizing: border-box; }
.ph-loading { padding: 80rpx 0; text-align: center; font-size: 26rpx; color: $text-color-placeholder; }
.ph-empty {
  min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20rpx;
  &__ico { font-size: 80rpx; }
  &__text { font-size: 28rpx; color: $text-color-placeholder; }
  &__btn { margin-top: 20rpx; background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 28rpx; padding: 0 60rpx; height: 76rpx; line-height: 76rpx; }
}
.ph-item {
  display: flex; align-items: flex-start; gap: 20rpx; background: $surface;
  border-radius: $radius-md; padding: 26rpx; margin-bottom: 16rpx;
  &__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8rpx; }
  &__title { font-size: 28rpx; color: $text-color; }
  &__time { font-size: 22rpx; color: $text-color-placeholder; }
  &__side { display: flex; flex-direction: column; align-items: flex-end; gap: 8rpx; }
  &__amount { font-size: 30rpx; font-weight: bold; color: $text-color; &.plus { color: $brand-color; } }
  &__balance { font-size: 22rpx; color: $text-color-placeholder; }
}
.ph-foot { padding: 24rpx 0 40rpx; text-align: center; font-size: 24rpx; color: $text-color-placeholder; }
</style>
