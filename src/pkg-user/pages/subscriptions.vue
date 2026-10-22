<template>
  <view class="sb-page">
    <view class="sb-hero">
      <text class="sb-hero__ico">🔁</text>
      <text class="sb-hero__title">{{ $t('subscription.title') }}</text>
      <text class="sb-hero__sub">{{ $t('subscription.sub') }}</text>
    </view>

    <view v-if="!logged" class="sb-empty">
      <text class="sb-empty__ico">🔒</text>
      <text class="sb-empty__text">{{ $t('subscription.needLogin') }}</text>
      <button class="sb-login" @tap="goLogin">{{ $t('subscription.login') }}</button>
    </view>

    <template v-else>
      <!-- 我的订阅 -->
      <view class="sb-sec">
        <text class="sb-sec__title">{{ $t('subscription.mineTitle') }}</text>
      </view>
      <view v-if="loading" class="sb-tip">{{ $t('subscription.loading') }}</view>
      <view v-else-if="!subs.length" class="sb-empty sb-empty--sm">
        <text class="sb-empty__text">{{ $t('subscription.mineEmpty') }}</text>
      </view>
      <view v-for="s in subs" :key="s.id" class="sb-sub">
        <view class="sb-sub__head">
          <text class="sb-sub__code">{{ s.code }}</text>
          <text class="sb-sub__st" :class="'sb-sub__st--' + s.status">{{ statusLabel(s.status) }}</text>
        </view>
        <view class="sb-sub__grid">
          <view class="sb-sub__cell">
            <text class="sb-sub__lbl">{{ $t('subscription.nextDate') }}</text>
            <text class="sb-sub__val">{{ nextDate(s) }}</text>
          </view>
          <view class="sb-sub__cell">
            <text class="sb-sub__lbl">{{ $t('subscription.periods') }}</text>
            <text class="sb-sub__val">{{ s.scheduleJson?.length || 0 }}</text>
          </view>
          <view class="sb-sub__cell">
            <text class="sb-sub__lbl">{{ $t('subscription.prepaid') }}</text>
            <text class="sb-sub__val sb-sub__val--hot">¥{{ money(s.prepaidBalance) }}</text>
          </view>
        </view>
        <text class="sb-sub__range">{{ rangeText(s) }}</text>
        <view class="sb-sub__actions">
          <button class="sb-sub__btn" :disabled="busy" @tap="toggleOcc(s)">{{ expandedId === s.id ? $t('subscription.hidePeriods') : $t('subscription.viewPeriods') }}</button>
          <button v-if="s.status === 'renewalPending'" class="sb-sub__btn sb-sub__btn--pay" :disabled="busy" @tap="doRenew(s)">{{ $t('subscription.renewBtn') }}</button>
        </view>
        <view v-if="expandedId === s.id" class="sb-occ">
          <text v-if="occLoading" class="sb-occ__tip">{{ $t('subscription.loading') }}</text>
          <text v-else-if="!occurrences.length" class="sb-occ__tip">{{ $t('subscription.occEmpty') }}</text>
          <view v-for="o in occurrences" :key="o.id" class="sb-occ__row">
            <text class="sb-occ__no">{{ $t('subscription.periodNo').replace('{n}', String(o.periodNo)) }}</text>
            <text class="sb-occ__date">{{ fmtDate(o.scheduledDate) }}</text>
            <text class="sb-occ__st" :class="'sb-occ__st--' + o.status">{{ occStatusLabel(o.status) }}</text>
          </view>
        </view>
      </view>

      <!-- 订阅套餐 -->
      <view class="sb-sec">
        <text class="sb-sec__title">{{ $t('subscription.plansTitle') }}</text>
        <text class="sb-sec__hint">{{ $t('subscription.plansHint') }}</text>
      </view>
      <view v-if="!plans.length" class="sb-tip">{{ $t('subscription.plansEmpty') }}</view>
      <view v-for="p in plans" :key="p.id" class="sb-plan">
        <view class="sb-plan__head">
          <text class="sb-plan__title">{{ p.title }}</text>
          <text class="sb-plan__price">¥{{ money(p.periodPrice) }}<text class="sb-plan__unit">/{{ $t('subscription.perPeriod') }}</text></text>
        </view>
        <text v-if="p.description" class="sb-plan__desc">{{ p.description }}</text>
        <view class="sb-plan__meta">
          <text>{{ $t('subscription.periodsCount').replace('{n}', String(p.periods)) }}</text>
          <text class="sb-plan__total">{{ $t('subscription.totalLabel').replace('{y}', money(p.periods * p.periodPrice)) }}</text>
        </view>
        <button class="sb-plan__btn" :disabled="busy" @tap="openSubscribe(p)">{{ $t('subscription.subscribe') }}</button>
      </view>

      <view class="sb-note">{{ $t('subscription.note') }}</view>
    </template>

    <!-- 开通弹层：选起始日期 -->
    <view class="sb-mask" v-if="planTarget" @tap="closeSheet">
      <view class="sb-sheet" @tap.stop>
        <text class="sb-sheet__title">{{ $t('subscription.sheetTitle') }}</text>
        <text class="sb-sheet__name">{{ planTarget.title }}</text>
        <view class="sb-sheet__line">
          <text>{{ $t('subscription.periodsCount').replace('{n}', String(planTarget.periods)) }}</text>
          <text>{{ $t('subscription.totalLabel').replace('{y}', money(planTarget.periods * planTarget.periodPrice)) }}</text>
        </view>
        <view class="sb-sheet__field">
          <text class="sb-sheet__lbl">{{ $t('subscription.startDate') }}</text>
          <picker mode="date" :value="startDate" :start="minDate" @change="onDateChange">
            <view class="sb-sheet__date">{{ startDate }}</view>
          </picker>
        </view>
        <text class="sb-sheet__hint">{{ $t('subscription.buyoutHint') }}</text>
        <button class="sb-sheet__btn" :disabled="busy" @tap="submitSubscribe">{{ $t('subscription.confirm') }}</button>
        <view class="sb-sheet__cancel" @tap="closeSheet">{{ $t('subscription.cancel') }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  getAvailablePlans,
  getMySubscriptions,
  getMySubscriptionOccurrences,
  createSubscription,
  confirmRenewal,
} from '../../api/queries/subscription';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();

const loading = ref(true);
const busy = ref(false);
const subs = ref<any[]>([]);
const plans = ref<any[]>([]);
const expandedId = ref('');
const occurrences = ref<any[]>([]);
const occLoading = ref(false);
const planTarget = ref<any>(null);
const startDate = ref('');
const minDate = ref('');

const logged = computed(() => auth.isLoggedIn);

const subStatusLabels: Record<string, string> = {
  active: 'stActive',
  renewalPending: 'stRenewalPending',
  expired: 'stExpired',
  cancelled: 'stCancelled',
};
const occStatusLabels: Record<string, string> = {
  pending: 'occPending',
  skipped: 'occSkipped',
  orderCreated: 'occCreated',
  cancelled: 'occCancelled',
};

function statusLabel(s: string) {
  const k = subStatusLabels[s];
  return k ? locale.t(`subscription.${k}`) : s;
}
function occStatusLabel(s: string) {
  const k = occStatusLabels[s];
  return k ? locale.t(`subscription.${k}`) : s;
}
function money(fen: number) {
  return (Number(fen || 0) / 100).toFixed(2);
}
function fmtDate(v: string) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** 下一次配送日：排期里第一个未过期且已生成订单之外仍是最近的日期 */
function nextDate(s: any) {
  const list: string[] = s.scheduleJson || [];
  const now = Date.now();
  const next = list.find(d => new Date(d).getTime() >= now);
  return fmtDate(next || list[list.length - 1] || '') || '—';
}
function rangeText(s: any) {
  const start = fmtDate(s.startDate);
  const end = fmtDate(s.endDate);
  if (!start && !end) return '';
  return locale.t('subscription.range').replace('{a}', start || '—').replace('{b}', end || '—');
}

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function load() {
  if (!auth.isLoggedIn) { subs.value = []; plans.value = []; loading.value = false; return; }
  loading.value = true;
  try {
    const [s, p] = await Promise.all([
      getMySubscriptions().catch(() => []),
      getAvailablePlans().catch(() => []),
    ]);
    subs.value = s || [];
    plans.value = (p || []).filter((x: any) => x.enabled !== false);
  } finally {
    loading.value = false;
  }
}

function goLogin() { auth.requireLogin(); }

async function toggleOcc(s: any) {
  if (expandedId.value === s.id) { expandedId.value = ''; return; }
  expandedId.value = s.id;
  occurrences.value = [];
  occLoading.value = true;
  try {
    occurrences.value = (await getMySubscriptionOccurrences(String(s.id))) || [];
  } catch (e) {
    console.warn('[subscription] occurrences failed', e);
  } finally {
    occLoading.value = false;
  }
}

async function doRenew(s: any) {
  if (busy.value) return;
  busy.value = true;
  try {
    await confirmRenewal(String(s.id));
    uni.showToast({ title: locale.t('subscription.renewOk'), icon: 'none' });
    await load();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('subscription.renewFail'), icon: 'none' });
  } finally {
    busy.value = false;
  }
}

function openSubscribe(p: any) {
  planTarget.value = p;
  minDate.value = todayStr(1);
  startDate.value = todayStr(1);
}
function closeSheet() { if (!busy.value) planTarget.value = null; }
function onDateChange(e: any) { startDate.value = String(e?.detail?.value || startDate.value); }

async function submitSubscribe() {
  const p = planTarget.value;
  if (!p || busy.value) return;
  busy.value = true;
  uni.showLoading({ title: locale.t('subscription.submitting'), mask: true });
  try {
    // 后端按天 00:00 展开期次，前端传本地日期零点 ISO
    const iso = new Date(`${startDate.value}T00:00:00`).toISOString();
    await createSubscription(String(p.id), iso);
    uni.hideLoading();
    planTarget.value = null;
    uni.showToast({ title: locale.t('subscription.subOk'), icon: 'success' });
    await load();
  } catch (e: any) {
    uni.hideLoading();
    uni.showToast({ title: e?.message || locale.t('subscription.subFail'), icon: 'none' });
  } finally {
    busy.value = false;
  }
}

onShow(() => { void load(); });
</script>

<style scoped lang="scss">
.sb-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.sb-hero { background: linear-gradient(135deg, #3b6fd4, #5aa8ef); color: #fff; padding: 40rpx 30rpx 34rpx;
  &__ico { font-size: 44rpx; }
  &__title { display: block; margin-top: 6rpx; font-size: 40rpx; font-weight: bold; }
  &__sub { display: block; margin-top: 10rpx; font-size: 24rpx; opacity: .92; }
}
.sb-sec { padding: 24rpx 30rpx 10rpx;
  &__title { font-size: 28rpx; font-weight: 600; color: $text-color; }
  &__hint { display: block; margin-top: 6rpx; font-size: 22rpx; color: $text-color-placeholder; }
}
.sb-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 50rpx 0; }
.sb-empty { display: flex; flex-direction: column; align-items: center; padding: 110rpx 40rpx; gap: 16rpx;
  &--sm { padding: 40rpx; }
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
}
.sb-login { margin-top: 16rpx; height: 80rpx; line-height: 80rpx; padding: 0 60rpx; font-size: 28rpx; color: #fff; background: linear-gradient(135deg, #3b6fd4, #5aa8ef); border-radius: 999rpx; }
.sb-sub { margin: 0 20rpx 16rpx; padding: 24rpx; background: $surface; border-radius: $radius-md;
  &__head { display: flex; align-items: center; justify-content: space-between; }
  &__code { font-size: 24rpx; color: $text-color-placeholder; font-family: monospace; }
  &__st { font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 999rpx; background: #f0f0f0; color: #999;
    &--active { background: #e8f6f2; color: #2f9e44; }
    &--renewalPending { background: #fff3e8; color: #d98300; }
    &--expired, &--cancelled { background: #f0f0f0; color: #999; }
  }
  &__grid { display: flex; margin-top: 16rpx; }
  &__cell { flex: 1; }
  &__lbl { display: block; font-size: 22rpx; color: $text-color-placeholder; }
  &__val { display: block; margin-top: 4rpx; font-size: 28rpx; font-weight: 600; color: $text-color;
    &--hot { color: #3b6fd4; }
  }
  &__range { display: block; margin-top: 12rpx; font-size: 22rpx; color: $text-color-secondary; }
  &__actions { display: flex; gap: 16rpx; margin-top: 18rpx; }
  &__btn { flex: 1; margin: 0; height: 68rpx; line-height: 68rpx; font-size: 26rpx; color: #3b6fd4; background: #eef4fd; border-radius: 999rpx;
    &--pay { color: #fff; background: linear-gradient(135deg, #3b6fd4, #5aa8ef); }
  }
}
.sb-occ { margin-top: 16rpx; padding-top: 14rpx; border-top: 1rpx solid #f0f0f0;
  &__tip { display: block; font-size: 22rpx; color: $text-color-placeholder; padding: 12rpx 0; text-align: center; }
  &__row { display: flex; align-items: center; gap: 12rpx; padding: 10rpx 0; font-size: 22rpx; color: $text-color-secondary; }
  &__no { width: 120rpx; color: $text-color; }
  &__date { flex: 1; }
  &__st { font-size: 20rpx; padding: 2rpx 10rpx; border-radius: 6rpx; background: #f0f0f0; color: #999;
    &--orderCreated { background: #eef4fd; color: #3b6fd4; }
    &--skipped, &--cancelled { background: #f0f0f0; color: #999; }
  }
}
.sb-plan { margin: 0 20rpx 16rpx; padding: 26rpx; background: $surface; border-radius: $radius-md;
  &__head { display: flex; align-items: baseline; justify-content: space-between; }
  &__title { font-size: 30rpx; font-weight: 600; color: $text-color; }
  &__price { font-size: 30rpx; font-weight: bold; color: #3b6fd4; }
  &__unit { font-size: 20rpx; font-weight: 400; color: $text-color-placeholder; }
  &__desc { display: block; margin-top: 8rpx; font-size: 24rpx; color: $text-color-secondary; line-height: 1.5; }
  &__meta { display: flex; justify-content: space-between; margin-top: 12rpx; font-size: 22rpx; color: $text-color-secondary; }
  &__total { color: #3b6fd4; }
  &__btn { margin-top: 18rpx; height: 76rpx; line-height: 76rpx; font-size: 28rpx; color: #fff; background: linear-gradient(135deg, #3b6fd4, #5aa8ef); border-radius: 999rpx; }
}
.sb-note { padding: 24rpx 30rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; line-height: 1.6; }
.sb-mask { position: fixed; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0,0,0,.5); display: flex; align-items: flex-end; z-index: 50; }
.sb-sheet { width: 100%; background: #fff; border-radius: 28rpx 28rpx 0 0; padding: 36rpx 30rpx calc(30rpx + env(safe-area-inset-bottom));
  &__title { display: block; font-size: 32rpx; font-weight: bold; text-align: center; color: $text-color; }
  &__name { display: block; margin-top: 14rpx; font-size: 28rpx; text-align: center; color: #3b6fd4; font-weight: 600; }
  &__line { display: flex; justify-content: space-between; margin-top: 16rpx; padding: 18rpx 20rpx; background: $bg-color; border-radius: $radius-sm; font-size: 24rpx; color: $text-color-secondary; }
  &__field { margin-top: 18rpx; }
  &__lbl { display: block; font-size: 24rpx; color: $text-color-secondary; margin-bottom: 8rpx; }
  &__date { height: 76rpx; line-height: 76rpx; padding: 0 20rpx; background: $bg-color; border-radius: $radius-sm; font-size: 28rpx; color: $text-color; }
  &__hint { display: block; margin-top: 14rpx; font-size: 22rpx; color: $text-color-placeholder; line-height: 1.5; }
  &__btn { margin-top: 20rpx; height: 84rpx; line-height: 84rpx; font-size: 30rpx; color: #fff; background: linear-gradient(135deg, #3b6fd4, #5aa8ef); border-radius: 999rpx; }
  &__cancel { margin-top: 14rpx; text-align: center; font-size: 28rpx; color: $text-color-secondary; padding: 10rpx 0; }
}
</style>
