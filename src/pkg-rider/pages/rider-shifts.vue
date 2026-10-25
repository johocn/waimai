<template>
  <view class="sh-page">
    <view v-if="!logged" class="sh-empty">
      <text class="sh-empty__ico">🗓</text>
      <text class="sh-empty__text">{{ $t('riderShifts.loginTip') }}</text>
      <button class="sh-empty__btn" @tap="goLogin">{{ $t('member.loginBtn') }}</button>
    </view>

    <template v-else>
      <view class="sh-tip">{{ $t('riderShifts.tip') }}</view>
      <view v-if="loading" class="sh-hint">{{ $t('riderShifts.loading') }}</view>
      <view v-else-if="!items.length" class="sh-hint">{{ $t('riderShifts.empty') }}</view>
      <view v-else class="sh-card">
        <view v-for="s in items" :key="s.id" class="sh-row">
          <view class="sh-row__date">
            <text class="sh-row__day">{{ dayText(s.shiftDate) }}</text>
            <text class="sh-row__week">{{ weekText(s.shiftDate) }}</text>
          </view>
          <view class="sh-row__body">
            <text class="sh-row__time">{{ s.startTime }} – {{ s.endTime }}</text>
            <text class="sh-row__dur">{{ $t('riderShifts.hours').replace('{n}', durText(s)) }}</text>
            <text class="sh-row__note" v-if="s.note">{{ s.note }}</text>
          </view>
        </view>
      </view>
      <view class="sh-foot">{{ $t('riderShifts.foot') }}</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { fetchMyShifts } from '../../api/queries/support';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();
const logged = computed(() => !!auth.token);

const items = ref<any[]>([]);
const loading = ref(true);

/** 本地日期 YYYY-MM-DD（避免 toISOString 的 UTC 偏移） */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

onShow(() => {
  if (!logged.value) {
    loading.value = false;
    return;
  }
  void load();
});

async function load() {
  loading.value = !items.value.length;
  try {
    const today = new Date();
    const to = new Date(today.getTime() + 13 * 86400_000);
    const list = await fetchMyShifts(ymd(today), ymd(to)).catch(() => []);
    items.value = list.slice().sort(
      (a: any, b: any) => (a.shiftDate + a.startTime).localeCompare(b.shiftDate + b.startTime),
    );
  } finally {
    loading.value = false;
  }
}

function dayText(date: string): string {
  return (date || '').slice(5).replace('-', '/');
}
function weekText(date: string): string {
  const d = new Date(`${date}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return '';
  const keys = ['riderShifts.week0', 'riderShifts.week1', 'riderShifts.week2',
    'riderShifts.week3', 'riderShifts.week4', 'riderShifts.week5', 'riderShifts.week6'];
  return locale.t(keys[d.getDay()]);
}
/** 班次小时数（保留 1 位小数） */
function durText(s: any): string {
  const toMin = (hm: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm ?? ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  };
  const mins = Math.max(0, toMin(s.endTime) - toMin(s.startTime));
  return (mins / 60).toFixed(1);
}

function goLogin() {
  auth.requireLogin();
}
</script>

<style lang="scss" scoped>
.sh-page { min-height: 100vh; background: $bg-color; padding: 20rpx; box-sizing: border-box; }
.sh-empty {
  min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20rpx;
  &__ico { font-size: 80rpx; }
  &__text { font-size: 28rpx; color: $text-color-placeholder; }
  &__btn { margin-top: 20rpx; background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 28rpx; padding: 0 60rpx; height: 76rpx; line-height: 76rpx; }
}
.sh-tip {
  background: #eef6ff; color: #1d4ed8; font-size: 23rpx; line-height: 1.5;
  border-radius: $radius-md; padding: 18rpx 22rpx; margin-bottom: 20rpx;
}
.sh-hint { padding: 80rpx 0; text-align: center; font-size: 25rpx; color: $text-color-placeholder; }
.sh-card { background: $surface; border-radius: $radius-md; padding: 8rpx 28rpx; }
.sh-row {
  display: flex; gap: 24rpx; padding: 24rpx 0; border-bottom: 1rpx solid $border-color;
  &:last-child { border-bottom: none; }
  &__date { width: 110rpx; flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  &__day { font-size: 30rpx; font-weight: 700; color: $text-color; }
  &__week { font-size: 21rpx; color: $text-color-placeholder; margin-top: 4rpx; }
  &__body { flex: 1; min-width: 0; }
  &__time { display: block; font-size: 28rpx; color: $text-color; font-weight: 600; }
  &__dur { display: block; font-size: 22rpx; color: $text-color-placeholder; margin-top: 4rpx; }
  &__note { display: block; font-size: 23rpx; color: #4e5560; margin-top: 8rpx; }
}
.sh-foot { padding: 28rpx 0; text-align: center; font-size: 22rpx; color: $text-color-placeholder; }
</style>
