<template>
  <view class="ck-page">
    <view class="ck-hero">
      <text class="ck-hero__ico">📅</text>
      <text class="ck-hero__title">{{ $t('checkin.title') }}</text>
      <text class="ck-hero__sub">{{ $t('checkin.sub') }}</text>
      <view class="ck-hero__stat">
        <text class="ck-hero__num">{{ today.streak }}</text>
        <text class="ck-hero__lbl">{{ $t('checkin.streakDays') }}</text>
      </view>
    </view>

    <view v-if="!logged" class="ck-empty">
      <text class="ck-empty__ico">🔒</text>
      <text class="ck-empty__text">{{ $t('checkin.needLogin') }}</text>
      <button class="ck-login" @tap="goLogin">{{ $t('checkin.login') }}</button>
    </view>

    <template v-else>
      <!-- 连签进度：7 天为一循环 -->
      <view class="ck-card">
        <view class="ck-week">
          <view v-for="d in weekDays" :key="d" class="ck-day" :class="{ on: d <= cycleDone, extra: d === 7 }">
            <text class="ck-day__ico">{{ d === 7 ? '🎁' : '✓' }}</text>
            <text class="ck-day__lbl">{{ $t('checkin.day').replace('{n}', String(d)) }}</text>
          </view>
        </view>
        <text class="ck-cycle">{{ $t('checkin.cycleHint').replace('{n}', String(cycleCount)) }}</text>
        <button class="ck-btn" :disabled="busy || !today.canCheckin" @tap="submitCheckin">
          {{ today.checkedIn || !today.canCheckin ? $t('checkin.checked') : $t('checkin.checkinBtn') }}
        </button>
        <text class="ck-tips">{{ $t('checkin.ruleHint') }}</text>
      </view>

      <!-- 任务列表 -->
      <view class="ck-sec">
        <text class="ck-sec__title">{{ $t('checkin.tasksTitle') }}</text>
        <text class="ck-sec__hint">{{ $t('checkin.tasksHint') }}</text>
      </view>
      <view v-if="loading" class="ck-tip">{{ $t('checkin.loading') }}</view>
      <view v-else-if="!tasks.length" class="ck-tip">{{ $t('checkin.tasksEmpty') }}</view>
      <view v-for="t in tasks" :key="t.taskCode" class="ck-task">
        <view class="ck-task__body">
          <text class="ck-task__name">{{ taskLabel(t.taskCode) }}</text>
          <text class="ck-task__reward">{{ $t('checkin.reward').replace('{p}', String(t.points || 0)).replace('{g}', String(t.growth || 0)) }}</text>
        </view>
        <text v-if="t.state === 'claimed'" class="ck-task__st ck-task__st--done">{{ $t('checkin.stClaimed') }}</text>
        <text v-else-if="t.state === 'not_met'" class="ck-task__st">{{ $t('checkin.stNotMet') }}</text>
        <button v-else class="ck-task__btn" :disabled="busy" @tap="claim(t)">{{ $t('checkin.claim') }}</button>
      </view>

      <view class="ck-note">{{ $t('checkin.note') }}</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getCheckinToday, getMyTaskSummaries, doCheckin, claimTask } from '../../api/queries/checkin';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();

const loading = ref(true);
const busy = ref(false);
const today = ref<any>({ checkedIn: false, streak: 0, canCheckin: false });
const tasks = ref<any[]>([]);
const weekDays = [1, 2, 3, 4, 5, 6, 7];

const logged = computed(() => auth.isLoggedIn);
// 连签循环：每 7 天为一轮，第 7 天（含）以上本轮满格
const cycleDone = computed(() => {
  const s = Number(today.value?.streak || 0);
  if (s <= 0) return 0;
  const m = s % 7;
  return m === 0 ? 7 : m;
});
const cycleCount = computed(() => Math.floor(Number(today.value?.streak || 0) / 7));

const taskLabels: Record<string, string> = {
  daily_share: 'taskShare',
  daily_login: 'taskLogin',
  daily_profile: 'taskProfile',
  bind_phone: 'taskBindPhone',
};
function taskLabel(code: string) {
  const k = taskLabels[code];
  return k ? locale.t(`checkin.${k}`) : code;
}

async function load() {
  if (!auth.isLoggedIn) {
    loading.value = false;
    tasks.value = [];
    return;
  }
  loading.value = true;
  try {
    const [t, list] = await Promise.all([getCheckinToday(), getMyTaskSummaries()]);
    today.value = t || today.value;
    tasks.value = list || [];
  } catch (e) {
    console.warn('[checkin] load failed', e);
    tasks.value = [];
  } finally {
    loading.value = false;
  }
}

function goLogin() { auth.requireLogin(); }

async function submitCheckin() {
  if (busy.value || !today.value.canCheckin) return;
  busy.value = true;
  uni.showLoading({ title: locale.t('checkin.checking'), mask: true });
  try {
    const r: any = await doCheckin();
    uni.hideLoading();
    if (r?.success) {
      const parts = [locale.t('checkin.ok'), `+${r.points || 0}${locale.t('checkin.pointsUnit')}`];
      if (r.growth) parts.push(`+${r.growth}${locale.t('checkin.growthUnit')}`);
      uni.showModal({
        title: locale.t('checkin.okTitle'),
        content: locale.t('checkin.okBody')
          .replace('{p}', String(r.points || 0))
          .replace('{g}', String(r.growth || 0))
          .replace('{s}', String(r.streak || 0)),
        showCancel: false,
        confirmText: locale.t('checkin.okConfirm'),
      });
      today.value = { checkedIn: true, streak: Number(r.streak || today.value.streak), canCheckin: false };
      void refreshTasks();
    } else {
      const key = r?.reason === 'already' ? 'checkin.already' : 'checkin.fail';
      uni.showToast({ title: locale.t(key), icon: 'none' });
      void load();
    }
  } catch (e: any) {
    uni.hideLoading();
    uni.showToast({ title: e?.message || locale.t('checkin.fail'), icon: 'none' });
    void load();
  } finally {
    busy.value = false;
  }
}

async function refreshTasks() {
  try { tasks.value = (await getMyTaskSummaries()) || []; } catch {}
}

async function claim(t: any) {
  if (busy.value) return;
  busy.value = true;
  try {
    const r: any = await claimTask(t.taskCode);
    if (r?.success) {
      uni.showToast({
        title: locale.t('checkin.claimOk').replace('{p}', String(r.points || 0)),
        icon: 'none',
      });
      await refreshTasks();
    } else {
      uni.showToast({ title: locale.t('checkin.claimFail'), icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('checkin.claimFail'), icon: 'none' });
  } finally {
    busy.value = false;
  }
}

onShow(() => { void load(); });
</script>

<style scoped lang="scss">
.ck-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.ck-hero { background: linear-gradient(135deg, #f0883a, #f5b544); color: #fff; padding: 40rpx 30rpx 34rpx;
  &__ico { font-size: 44rpx; }
  &__title { display: block; margin-top: 6rpx; font-size: 40rpx; font-weight: bold; }
  &__sub { display: block; margin-top: 10rpx; font-size: 24rpx; opacity: .92; }
  &__stat { display: flex; align-items: baseline; gap: 8rpx; margin-top: 22rpx; }
  &__num { font-size: 56rpx; font-weight: bold; }
  &__lbl { font-size: 24rpx; opacity: .9; }
}
.ck-card { margin: 20rpx; padding: 26rpx; background: $surface; border-radius: $radius-md; }
.ck-week { display: flex; gap: 8rpx; }
.ck-day { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6rpx; padding: 14rpx 0; border-radius: $radius-sm; background: $bg-color;
  &__ico { font-size: 26rpx; color: #d0d0d0; }
  &__lbl { font-size: 20rpx; color: $text-color-placeholder; }
  &.on { background: #fff4e5;
    .ck-day__ico { color: #f0883a; }
    .ck-day__lbl { color: #c96a1b; font-weight: 600; }
  }
  &.extra { background: #fff0f0;
    .ck-day__ico { color: #e54d42; }
  }
}
.ck-cycle { display: block; margin-top: 14rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; }
.ck-btn { margin-top: 20rpx; height: 84rpx; line-height: 84rpx; font-size: 32rpx; color: #fff; background: linear-gradient(135deg, #f0883a, #f5b544); border-radius: 999rpx;
  &[disabled] { background: #e6e6e6; color: #fff; }
}
.ck-tips { display: block; margin-top: 14rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; line-height: 1.5; }
.ck-sec { padding: 24rpx 30rpx 10rpx;
  &__title { font-size: 28rpx; font-weight: 600; color: $text-color; }
  &__hint { display: block; margin-top: 6rpx; font-size: 22rpx; color: $text-color-placeholder; }
}
.ck-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 50rpx 0; }
.ck-empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; }
}
.ck-login { margin-top: 16rpx; height: 80rpx; line-height: 80rpx; padding: 0 60rpx; font-size: 28rpx; color: #fff; background: linear-gradient(135deg, #f0883a, #f5b544); border-radius: 999rpx; }
.ck-task { display: flex; align-items: center; gap: 16rpx; margin: 0 20rpx 16rpx; padding: 22rpx; background: $surface; border-radius: $radius-md;
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
  &__name { font-size: 28rpx; color: $text-color; }
  &__reward { font-size: 22rpx; color: #f0883a; }
  &__st { font-size: 22rpx; color: $text-color-placeholder;
    &--done { color: #2f9e44; }
  }
  &__btn { margin: 0; height: 60rpx; line-height: 60rpx; padding: 0 28rpx; font-size: 24rpx; color: #fff; background: linear-gradient(135deg, #f0883a, #f5b544); border-radius: 999rpx; }
}
.ck-note { padding: 24rpx 30rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; line-height: 1.6; }
</style>
