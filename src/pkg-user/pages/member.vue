<template>
  <view class="mbr-page">
    <view v-if="!logged" class="mbr-empty">
      <text class="mbr-empty__ico">💳</text>
      <text class="mbr-empty__text">{{ $t('member.noLogin') }}</text>
      <button class="mbr-empty__btn" @tap="goLogin">{{ $t('member.loginBtn') }}</button>
    </view>

    <view v-else-if="loading" class="mbr-loading">{{ $t('member.loading') }}</view>

    <view v-else-if="!info" class="mbr-empty">
      <text class="mbr-empty__ico">⚠️</text>
      <text class="mbr-empty__text">{{ $t('member.loadFail') }}</text>
      <button class="mbr-empty__btn" @tap="loadAll">{{ $t('member.retry') }}</button>
    </view>

    <template v-else>
      <!-- 会员卡：等级 / 积分 / 成长值进度 -->
      <view class="mbr-hero">
        <view class="mbr-hero__top">
          <text class="mbr-hero__badge">{{ info.levelName }}</text>
          <text class="mbr-hero__lv">Lv.{{ info.level }}</text>
        </view>
        <view class="mbr-hero__points">
          <text class="mbr-hero__num">{{ info.points }}</text>
          <text class="mbr-hero__unit">{{ $t('member.pointsUnit') }}</text>
        </view>
        <view class="mbr-progress">
          <view class="mbr-progress__bar">
            <view class="mbr-progress__fill" :style="{ width: progressPct + '%' }"></view>
          </view>
          <view class="mbr-progress__row">
            <text>{{ $t('member.growth').replace('{v}', String(info.growthValue)) }}</text>
            <text v-if="info.nextLevelName">
              {{ $t('member.nextLevel').replace('{n}', info.nextLevelName).replace('{v}', String(nextGap)) }}
            </text>
            <text v-else>{{ $t('member.maxLevel') }}</text>
          </view>
        </view>
      </view>

      <!-- 每日签到：近 7 天节奏 + 连续奖励提示 -->
      <view class="mbr-card">
        <view class="mbr-card__head">
          <text class="mbr-card__title">{{ $t('member.checkinTitle') }}</text>
          <text class="mbr-card__sub">{{ $t('member.streak').replace('{n}', String(checkin?.streak || 0)) }}</text>
        </view>
        <view class="mbr-week">
          <view v-for="d in weekDays" :key="d.key" class="mbr-week__day" :class="{ on: d.on, today: d.today }">
            <text class="mbr-week__dot">{{ d.on ? '✓' : '·' }}</text>
            <text class="mbr-week__lbl">{{ d.label }}</text>
          </view>
        </view>
        <button class="mbr-checkin__btn" :disabled="checking || checkin?.checkedIn" @tap="onCheckin">
          {{ checkin?.checkedIn ? $t('member.checkedIn') : checking ? $t('member.checking') : $t('member.checkinBtn') }}
        </button>
      </view>

      <!-- 会员权益：倍率 / 抵现上限 / 专属折扣 -->
      <view class="mbr-card">
        <text class="mbr-card__title">{{ $t('member.rightsTitle') }}</text>
        <view class="mbr-right" v-for="r in rights" :key="r">
          <text class="mbr-right__ico">✓</text>
          <text class="mbr-right__txt">{{ r }}</text>
        </view>
      </view>

      <!-- 积分任务 -->
      <view class="mbr-card">
        <view class="mbr-card__head">
          <text class="mbr-card__title">{{ $t('member.taskTitle') }}</text>
          <text class="mbr-card__sub">{{ $t('member.taskSub') }}</text>
        </view>
        <view class="mbr-task" v-for="t in tasks" :key="t.taskCode">
          <view class="mbr-task__body">
            <text class="mbr-task__name">{{ taskLabel(t.taskCode) }}</text>
            <text class="mbr-task__meta">
              {{ $t('member.taskReward').replace('{p}', String(t.points)).replace('{g}', String(t.growth)) }}
            </text>
            <text class="mbr-task__hint" v-if="t.state === 'not_met'">{{ taskHint(t.taskCode) }}</text>
          </view>
          <button
            class="mbr-task__btn"
            :class="{ 'mbr-task__btn--done': t.state !== 'available' }"
            :disabled="t.state !== 'available' || claiming === t.taskCode"
            @tap="onClaim(t)"
          >
            {{ t.state === 'available' ? (claiming === t.taskCode ? $t('member.taskClaiming') : $t('member.taskClaim')) : t.state === 'claimed' ? $t('member.taskClaimed') : $t('member.taskNotMet') }}
          </button>
        </view>
      </view>

      <!-- 积分明细入口 -->
      <view class="mbr-card mbr-link" @tap="goPointsHistory">
        <text class="mbr-link__label">{{ $t('member.pointsDetail') }}</text>
        <view class="mbr-link__right">
          <text class="mbr-link__value">{{ $t('member.pointsBalance').replace('{n}', String(info.points)) }}</text>
          <text class="mbr-link__arrow">›</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  getMyMemberInfo, getCheckinToday, getMyGrowthTasks, doCheckin, claimGrowthTask,
} from '../../api/queries/member';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();
const logged = computed(() => auth.isLoggedIn);

const loading = ref(true);
const info = ref<any>(null);
const checkin = ref<any>(null);
const tasks = ref<any[]>([]);
const checking = ref(false);
const claiming = ref('');

/** 成长值进度：nextLevelThreshold 为累计阈值，直接按 growthValue 占比收敛到 0-100 */
const progressPct = computed(() => {
  const threshold = Number(info.value?.nextLevelThreshold) || 0;
  const growth = Number(info.value?.growthValue) || 0;
  if (threshold <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((growth / threshold) * 100)));
});
const nextGap = computed(() => {
  const threshold = Number(info.value?.nextLevelThreshold) || 0;
  const growth = Number(info.value?.growthValue) || 0;
  return Math.max(0, threshold - growth);
});

/** 权益文案：倍率/抵现封顶为千分比，换算成展示口径 */
const rights = computed(() => {
  const i = info.value;
  if (!i) return [];
  const list: string[] = [];
  const multiplier = (Number(i.pointsMultiplier) || 1000) / 1000;
  list.push(locale.t('member.rightMultiplier').replace('{r}', multiplier.toFixed(1).replace(/\.0$/, '')));
  const cap = Math.round((Number(i.redeemCapRatio) || 0) / 10);
  if (cap > 0) list.push(locale.t('member.rightRedeemCap').replace('{p}', String(cap)));
  const special = Math.round((Number(i.specialDiscountRate) || 0) / 10);
  if (special > 0) list.push(locale.t('member.rightSpecial').replace('{p}', String(special)));
  list.push(locale.t('member.rightMore'));
  return list;
});

/** 近 7 天签到节奏：已签到含今天，未签到则连续段截止昨天 */
const weekDays = computed(() => {
  const streak = Number(checkin.value?.streak) || 0;
  const checkedIn = !!checkin.value?.checkedIn;
  const end = checkedIn ? 7 : 6;
  const start = end - streak;
  const days: Array<{ key: string; label: string; on: boolean; today: boolean }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const idx = 6 - i;
    days.push({
      key: d.toISOString().slice(0, 10),
      label: String(d.getDate()),
      on: idx >= start && idx < end,
      today: i === 0,
    });
  }
  return days;
});

const TASK_CODES = ['daily_share', 'daily_login', 'daily_profile', 'bind_phone', 'reach_level', 'first_order', 'order_count', 'order_amount'];
function taskLabel(code: string): string {
  return TASK_CODES.includes(code) ? locale.t('member.task_' + code) : code;
}
function taskHint(code: string): string {
  return TASK_CODES.includes(code) ? locale.t('member.hint_' + code) : '';
}

onShow(() => {
  if (!logged.value) {
    loading.value = false;
    info.value = null;
    return;
  }
  loadAll();
});

async function loadAll() {
  loading.value = true;
  try {
    const [m, c, t] = await Promise.all([getMyMemberInfo(), getCheckinToday(), getMyGrowthTasks()]);
    info.value = (m as any)?.myMemberInfo || null;
    checkin.value = (c as any)?.checkinToday || null;
    tasks.value = (t as any)?.myTasks || [];
  } catch {
    info.value = null;
  } finally {
    loading.value = false;
  }
}

/** 签到/领取后只刷新会员卡与签到状态，任务列表单独刷新领取态 */
async function refreshCard() {
  try {
    const [m, c] = await Promise.all([getMyMemberInfo(), getCheckinToday()]);
    info.value = (m as any)?.myMemberInfo || info.value;
    checkin.value = (c as any)?.checkinToday || checkin.value;
  } catch { /* 静默：保留旧数据 */ }
}

async function onCheckin() {
  if (checking.value || checkin.value?.checkedIn) return;
  checking.value = true;
  try {
    const res: any = await doCheckin();
    if (res?.checkin?.success) {
      uni.showToast({ title: locale.t('member.checkinDone').replace('{p}', String(res.checkin.points || 0)), icon: 'none' });
      await refreshCard();
    } else {
      uni.showToast({ title: locale.t('member.checkinFail'), icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('member.checkinFail'), icon: 'none' });
  } finally {
    checking.value = false;
  }
}

async function onClaim(task: any) {
  if (task.state !== 'available' || claiming.value) return;
  claiming.value = task.taskCode;
  try {
    const res: any = await claimGrowthTask(task.taskCode);
    if (res?.claimTask?.success) {
      task.state = 'claimed';
      uni.showToast({ title: locale.t('member.taskDone').replace('{p}', String(res.claimTask.points || 0)), icon: 'none' });
      await refreshCard();
    } else {
      uni.showToast({ title: locale.t('member.taskFail'), icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('member.taskFail'), icon: 'none' });
  } finally {
    claiming.value = '';
  }
}

function goPointsHistory() {
  uni.navigateTo({ url: '/pkg-user/pages/points-history' });
}
function goLogin() {
  auth.requireLogin();
}
</script>

<style lang="scss" scoped>
.mbr-page { min-height: 100vh; background: $bg-color; padding: 20rpx 20rpx 40rpx; box-sizing: border-box; }
.mbr-loading { padding: 80rpx 0; text-align: center; font-size: 26rpx; color: $text-color-placeholder; }
.mbr-empty {
  min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20rpx;
  &__ico { font-size: 80rpx; }
  &__text { font-size: 28rpx; color: $text-color-placeholder; }
  &__btn { margin-top: 20rpx; background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 28rpx; padding: 0 60rpx; height: 76rpx; line-height: 76rpx; }
}

/* 会员卡：品牌色渐变，白字 */
.mbr-hero {
  background: linear-gradient(135deg, $brand-color 0%, #ff944d 100%);
  color: #fff; border-radius: $radius-md; padding: 32rpx; margin-bottom: 20rpx;
  &__top { display: flex; align-items: center; justify-content: space-between; }
  &__badge { font-size: 24rpx; border: 1rpx solid rgba(255,255,255,.8); border-radius: 999rpx; padding: 4rpx 20rpx; }
  &__lv { font-size: 24rpx; opacity: .9; }
  &__points { display: flex; align-items: baseline; gap: 8rpx; margin: 24rpx 0 20rpx; }
  &__num { font-size: 64rpx; font-weight: bold; line-height: 1; }
  &__unit { font-size: 24rpx; opacity: .9; }
}
.mbr-progress {
  &__bar { height: 10rpx; border-radius: 5rpx; background: rgba(255,255,255,.35); overflow: hidden; }
  &__fill { height: 100%; border-radius: 5rpx; background: #fff; transition: width .3s; }
  &__row { display: flex; justify-content: space-between; gap: 20rpx; margin-top: 12rpx; font-size: 22rpx; opacity: .92; }
}

.mbr-card {
  background: $surface; border-radius: $radius-md; padding: 26rpx; margin-bottom: 20rpx;
  &__head { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin-bottom: 16rpx; }
  &__title { font-size: 30rpx; font-weight: bold; color: $text-color; }
  &__sub { font-size: 24rpx; color: $text-color-placeholder; }
}
.mbr-week { display: flex; justify-content: space-between; margin: 20rpx 0 24rpx;
  &__day { display: flex; flex-direction: column; align-items: center; gap: 8rpx; flex: 1; }
  &__dot { width: 56rpx; height: 56rpx; line-height: 56rpx; text-align: center; border-radius: 50%; background: #f3f4f6; color: #c8ccd2; font-size: 26rpx; }
  &__lbl { font-size: 22rpx; color: $text-color-placeholder; }
  &__day.on &__dot { background: $brand-soft; color: $brand-color; }
  &__day.today &__lbl { color: $brand-color; }
}
.mbr-checkin__btn {
  background: $brand-color; color: #fff; border-radius: 999rpx; height: 80rpx; line-height: 80rpx;
  font-size: 28rpx; &[disabled] { background: #f0f1f3; color: $text-color-placeholder; }
}
.mbr-right {
  display: flex; align-items: center; gap: 12rpx; padding: 10rpx 0;
  &__ico { color: $brand-color; font-size: 24rpx; }
  &__txt { font-size: 26rpx; color: $text-color; }
}
.mbr-task {
  display: flex; align-items: center; gap: 20rpx; padding: 20rpx 0; border-bottom: 1rpx solid $border-color;
  &:last-child { border-bottom: none; padding-bottom: 0; }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
  &__name { font-size: 27rpx; color: $text-color; }
  &__meta { font-size: 22rpx; color: $brand-color; }
  &__hint { font-size: 22rpx; color: $text-color-placeholder; }
  &__btn {
    flex: none; min-width: 130rpx; height: 60rpx; line-height: 60rpx; padding: 0 22rpx;
    border-radius: 999rpx; font-size: 24rpx; background: $brand-color; color: #fff;
    &--done { background: #f0f1f3; color: $text-color-placeholder; }
  }
}
.mbr-link {
  display: flex; align-items: center; justify-content: space-between;
  &__label { font-size: 28rpx; color: $text-color; }
  &__right { display: flex; align-items: center; gap: 8rpx; }
  &__value { font-size: 24rpx; color: $text-color-placeholder; }
  &__arrow { color: $text-color-placeholder; font-size: 30rpx; }
}
</style>
