<template>
  <view class="lt-page">
    <view class="lt-hero">
      <view class="lt-hero__row">
        <text class="lt-hero__ico">🎰</text>
        <view class="lt-hero__info">
          <text class="lt-hero__title">{{ $t('lottery.title') }}</text>
          <text class="lt-hero__sub">{{ $t('lottery.sub') }}</text>
        </view>
        <view class="lt-hero__points">
          <text class="lt-hero__pnum">{{ points }}</text>
          <text class="lt-hero__punit">{{ $t('lottery.pointsUnit') }}</text>
        </view>
      </view>
    </view>

    <view v-if="loading" class="lt-tip">{{ $t('lottery.loading') }}</view>
    <view v-else-if="!prizes.length" class="lt-empty">
      <text class="lt-empty__ico">🎁</text>
      <text class="lt-empty__text">{{ $t('lottery.empty') }}</text>
    </view>

    <template v-else>
      <view class="lt-grid">
        <view
          v-for="(p, idx) in prizes"
          :key="p.id"
          class="lt-prize"
          :class="{ 'lt-prize--on': rollingIndex === idx, 'lt-prize--win': resultIndex === idx }"
        >
          <image v-if="p.image" class="lt-prize__img" :src="p.image" mode="aspectFill" />
          <text v-else class="lt-prize__ico">🎁</text>
          <text class="lt-prize__name">{{ p.name }}</text>
          <text class="lt-prize__cost" v-if="cost.mode === 'perPrize' && p.consume > 0">{{ $t('lottery.costN').replace('{n}', String(p.consume)) }}</text>
        </view>
      </view>

      <view class="lt-action">
        <button class="lt-action__btn" :disabled="drawing" @tap="draw">
          {{ drawing ? $t('lottery.drawing') : $t('lottery.draw') }}
        </button>
        <text class="lt-action__hint">{{ costHint }}</text>
      </view>

      <view class="lt-records">
        <view class="lt-records__head">
          <text class="lt-records__title">{{ $t('lottery.myRecords') }}</text>
          <text class="lt-records__more" v-if="recordTotal > records.length" @tap="loadMoreRecords">{{ $t('lottery.more') }} ›</text>
        </view>
        <view v-if="!records.length" class="lt-records__empty">{{ $t('lottery.noRecords') }}</view>
        <view v-for="r in records" :key="r.id" class="lt-record">
          <image v-if="r.prizeImage" class="lt-record__img" :src="r.prizeImage" mode="aspectFill" />
          <text v-else class="lt-record__ico">🎁</text>
          <view class="lt-record__body">
            <text class="lt-record__name">{{ r.prizeName }}</text>
            <text class="lt-record__time">{{ formatTime(r.createdAt) }}</text>
          </view>
          <text class="lt-record__cost" v-if="r.consume > 0">-{{ r.consume }}</text>
        </view>
      </view>
    </template>

    <view class="lt-mask" v-if="result" @tap="closeResult">
      <view class="lt-modal" @tap.stop>
        <text class="lt-modal__ico">🎉</text>
        <text class="lt-modal__title">{{ $t('lottery.winTitle') }}</text>
        <image v-if="result.image" class="lt-modal__img" :src="result.image" mode="aspectFill" />
        <text class="lt-modal__name">{{ result.name }}</text>
        <text class="lt-modal__cost" v-if="result.consume > 0">{{ $t('lottery.spent').replace('{n}', String(result.consume)) }}</text>
        <button class="lt-modal__btn" @tap="closeResult">{{ $t('lottery.winOk') }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getLotteryOverview, getMyLotteryRecords, drawLottery } from '../../api/queries/activity';
import { getMyMemberInfo } from '../../api/queries/member';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();

const loading = ref(true);
const drawing = ref(false);
const prizes = ref<any[]>([]);
const cost = ref<{ mode: string; fixedCost: number }>({ mode: 'perPrize', fixedCost: 0 });
const points = ref(0);
const records = ref<any[]>([]);
const recordTotal = ref(0);
const rollingIndex = ref(-1);
const resultIndex = ref(-1);
const result = ref<any>(null);

const costHint = computed(() => {
  if (cost.value.mode === 'fixed') {
    return cost.value.fixedCost > 0
      ? locale.t('lottery.fixedCost').replace('{n}', String(cost.value.fixedCost))
      : locale.t('lottery.freeDraw');
  }
  return locale.t('lottery.perPrizeHint');
});

function formatTime(v: string) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function load() {
  loading.value = true;
  try {
    const [overview, member, rec] = await Promise.all([
      getLotteryOverview().catch(() => ({ prizes: [], cost: { mode: 'perPrize', fixedCost: 0 } })),
      auth.isLoggedIn ? getMyMemberInfo().catch(() => null) : Promise.resolve(null),
      auth.isLoggedIn ? getMyLotteryRecords({ take: 10 }).catch(() => ({ items: [], totalItems: 0 })) : Promise.resolve({ items: [], totalItems: 0 }),
    ]);
    prizes.value = overview.prizes || [];
    cost.value = overview.cost || { mode: 'perPrize', fixedCost: 0 };
    points.value = Number((member as any)?.myMemberInfo?.points) || 0;
    records.value = (rec as any)?.items || [];
    recordTotal.value = Number((rec as any)?.totalItems) || 0;
  } finally {
    loading.value = false;
  }
}

async function loadMoreRecords() {
  try {
    const rec: any = await getMyLotteryRecords({ take: 10, skip: records.value.length });
    records.value = [...records.value, ...(rec?.items || [])];
    recordTotal.value = Number(rec?.totalItems) || recordTotal.value;
  } catch {}
}

async function draw() {
  if (drawing.value) return;
  if (!auth.isLoggedIn) {
    uni.navigateTo({ url: '/pages/login/index' });
    return;
  }
  if (!prizes.value.length) return;
  drawing.value = true;
  result.value = null;
  resultIndex.value = -1;
  let n = 0;
  const roll = setInterval(() => {
    rollingIndex.value = n % prizes.value.length;
    n++;
  }, 90);

  const minDelay = new Promise((r) => setTimeout(r, 900));
  try {
    const [res] = await Promise.all([drawLottery(), minDelay]);
    clearInterval(roll);
    rollingIndex.value = -1;
    const prize = (res as any)?.prize;
    const idx = Number((res as any)?.prizeIndex ?? -1);
    resultIndex.value = Number.isFinite(idx) ? idx : -1;
    result.value = prize || null;
    if (prize) {
      points.value = Math.max(0, points.value - Number(prize.consume || 0));
      records.value = [{ id: 'tmp-' + Date.now(), prizeName: prize.name, prizeImage: prize.image, consume: prize.consume, createdAt: new Date().toISOString() }, ...records.value];
      recordTotal.value += 1;
    }
  } catch (e: any) {
    clearInterval(roll);
    rollingIndex.value = -1;
    const msg = String(e?.message || '');
    let key = 'lottery.fail';
    if (/points|insufficient/i.test(msg)) key = 'lottery.noPoints';
    else if (/not configured/i.test(msg)) key = 'lottery.empty';
    else if (/authenticated|authorized/i.test(msg)) { uni.navigateTo({ url: '/pages/login/index' }); return; }
    uni.showToast({ title: locale.t(key), icon: 'none' });
  } finally {
    drawing.value = false;
  }
}

function closeResult() {
  result.value = null;
  resultIndex.value = -1;
  void load();
}

onShow(() => { void load(); });
</script>

<style scoped lang="scss">
.lt-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.lt-hero { background: linear-gradient(135deg, #ffb300, #ff7a00); color: #fff; padding: 36rpx 30rpx;
  &__row { display: flex; align-items: center; gap: 18rpx; }
  &__ico { font-size: 48rpx; }
  &__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
  &__title { font-size: 38rpx; font-weight: bold; }
  &__sub { font-size: 22rpx; opacity: .9; }
  &__points { text-align: right; }
  &__pnum { display: block; font-size: 40rpx; font-weight: bold; }
  &__punit { font-size: 20rpx; opacity: .9; }
}
.lt-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 80rpx 0; }
.lt-empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
}
.lt-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16rpx; padding: 24rpx 20rpx 8rpx; }
.lt-prize { background: $surface; border-radius: $radius-md; padding: 18rpx 10rpx; display: flex; flex-direction: column; align-items: center; gap: 8rpx; border: 3rpx solid transparent; transition: all .12s;
  &--on { border-color: #ffb300; background: #fff8e6; transform: scale(1.03); }
  &--win { border-color: #ff7a00; background: #fff1dc; }
  &__img { width: 88rpx; height: 88rpx; border-radius: $radius-sm; background: $bg-color; }
  &__ico { width: 88rpx; height: 88rpx; line-height: 88rpx; text-align: center; font-size: 48rpx; }
  &__name { font-size: 24rpx; color: $text-color; text-align: center; line-height: 1.3; }
  &__cost { font-size: 20rpx; color: #b45309; }
}
.lt-action { display: flex; flex-direction: column; align-items: center; gap: 10rpx; padding: 20rpx 30rpx 10rpx;
  &__btn { width: 440rpx; height: 88rpx; line-height: 88rpx; background: linear-gradient(135deg, #ffb300, #ff7a00); color: #fff; font-size: 32rpx; font-weight: bold; border-radius: 999rpx;
    &[disabled] { opacity: .6; } }
  &__hint { font-size: 22rpx; color: $text-color-placeholder; }
}
.lt-records { background: $surface; margin: 20rpx; border-radius: $radius-md; padding: 24rpx;
  &__head { display: flex; align-items: center; justify-content: space-between; }
  &__title { font-size: 28rpx; font-weight: bold; color: $text-color; }
  &__more { font-size: 24rpx; color: $brand-color; }
  &__empty { padding: 30rpx 0; text-align: center; font-size: 24rpx; color: $text-color-placeholder; }
}
.lt-record { display: flex; align-items: center; gap: 16rpx; padding: 18rpx 0; border-bottom: 1rpx solid $border-color;
  &__img { width: 72rpx; height: 72rpx; border-radius: $radius-sm; background: $bg-color; }
  &__ico { width: 72rpx; height: 72rpx; line-height: 72rpx; text-align: center; font-size: 36rpx; background: #fff8e6; border-radius: $radius-sm; }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
  &__name { font-size: 26rpx; color: $text-color; }
  &__time { font-size: 22rpx; color: $text-color-placeholder; }
  &__cost { font-size: 24rpx; color: #b45309; }
}
.lt-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); display: flex; align-items: center; justify-content: center; z-index: 99; }
.lt-modal { width: 520rpx; background: $surface; border-radius: $radius-lg; padding: 40rpx 30rpx 30rpx; display: flex; flex-direction: column; align-items: center; gap: 12rpx;
  &__ico { font-size: 64rpx; }
  &__title { font-size: 30rpx; font-weight: bold; color: $text-color; }
  &__img { width: 180rpx; height: 180rpx; border-radius: $radius-md; background: $bg-color; }
  &__name { font-size: 32rpx; font-weight: 600; color: #ff7a00; text-align: center; }
  &__cost { font-size: 22rpx; color: $text-color-secondary; }
  &__btn { margin-top: 10rpx; width: 300rpx; height: 72rpx; line-height: 72rpx; background: linear-gradient(135deg, #ffb300, #ff7a00); color: #fff; font-size: 28rpx; border-radius: 999rpx; }
}
</style>
