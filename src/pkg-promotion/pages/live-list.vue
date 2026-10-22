<template>
  <view class="ll-page">
    <view class="ll-hero">
      <view class="ll-hero__row">
        <text class="ll-hero__ico">📺</text>
        <text class="ll-hero__title">{{ $t('live.title') }}</text>
      </view>
      <text class="ll-hero__sub">{{ $t('live.sub') }}</text>
    </view>

    <view class="ll-tabs">
      <text class="ll-tab" :class="{ on: tab === 'live' }" @tap="switchTab('live')">{{ $t('live.tabLive') }}</text>
      <text class="ll-tab" :class="{ on: tab === 'upcoming' }" @tap="switchTab('upcoming')">{{ $t('live.tabUpcoming') }}</text>
      <text class="ll-tab" :class="{ on: tab === 'replay' }" @tap="switchTab('replay')">{{ $t('live.tabReplay') }}</text>
    </view>

    <view v-if="loading" class="ll-tip">{{ $t('live.loading') }}</view>
    <view v-else-if="!rooms.length" class="ll-empty">
      <text class="ll-empty__ico">📺</text>
      <text class="ll-empty__text">{{ emptyText }}</text>
    </view>

    <view v-for="r in rooms" :key="r.key" class="ll-card" @tap="enter(r)">
      <view class="ll-card__media">
        <image v-if="r.coverUrl" class="ll-card__img" :src="r.coverUrl" mode="aspectFill" />
        <view v-else class="ll-card__img ll-card__img--ph"><text>{{ (r.name || '?').slice(0, 1) }}</text></view>
        <text class="ll-card__badge" :class="'ll-card__badge--' + r.status">{{ statusLabel(r.status) }}</text>
        <text v-if="r.status === 'ended'" class="ll-card__replay">{{ $t('live.replayTag') }}</text>
      </view>
      <view class="ll-card__body">
        <text class="ll-card__shop">{{ r.storeName }}</text>
        <text class="ll-card__name">{{ r.name }}</text>
        <text v-if="r.description" class="ll-card__desc">{{ r.description }}</text>
        <view class="ll-card__foot">
          <text class="ll-card__meta">
            {{ r.status === 'scheduled'
              ? $t('live.startAt').replace('{t}', fmtDate(r.scheduledStartAt))
              : $t('live.viewLike').replace('{v}', String(r.viewCount)).replace('{l}', String(r.likeCount)) }}
          </text>
          <text class="ll-card__go" :class="{ off: r.status === 'scheduled' }">
            {{ r.status === 'live' ? $t('live.watchNow') : r.status === 'scheduled' ? $t('live.bookmark') : $t('live.watchReplay') }}
          </text>
        </view>
      </view>
    </view>

    <view class="ll-note">{{ $t('live.note') }}</view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow, onLoad } from '@dcloudio/uni-app';
import { fetchStoreList } from '../../api/queries/waimai';
import { getLiveRoomsInChannel } from '../../api/queries/live';
import { useLocaleStore } from '../../stores/locale';

const locale = useLocaleStore();

const loading = ref(true);
const tab = ref<'live' | 'upcoming' | 'replay'>('live');
const rooms = ref<any[]>([]);

const emptyText = computed(() => {
  if (tab.value === 'live') return locale.t('live.emptyLive');
  if (tab.value === 'upcoming') return locale.t('live.emptyUpcoming');
  return locale.t('live.emptyReplay');
});

const statusLabels: Record<string, string> = {
  live: 'statusLive',
  scheduled: 'statusScheduled',
  ended: 'statusEnded',
};
function statusLabel(s: string) {
  const k = statusLabels[s];
  return k ? locale.t(`live.${k}`) : s || '';
}
function fmtDate(v: string) {
  if (!v) return locale.t('live.toBeConfirmed');
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return locale.t('live.toBeConfirmed');
  const p = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function load() {
  loading.value = true;
  try {
    const stores = (await fetchStoreList()).filter((s: any) => !s.paused && s.channelToken);
    const groups = await Promise.all(
      stores.map(async (s: any) => {
        try {
          const rows = await getLiveRoomsInChannel(s.channelToken, tab.value);
          return rows.map((r: any) => ({
            ...r,
            key: `${s.channelToken}-${r.id}`,
            token: s.channelToken,
            storeName: s.name || '',
          }));
        } catch (e) {
          console.warn('[live-list] load store failed', s.channelToken, e);
          return [];
        }
      }),
    );
    rooms.value = groups.flat();
  } finally {
    loading.value = false;
  }
}

function switchTab(t: 'live' | 'upcoming' | 'replay') {
  if (tab.value === t) return;
  tab.value = t;
  void load();
}

function enter(r: any) {
  uni.navigateTo({
    url: `/pkg-promotion/pages/live-room?token=${encodeURIComponent(r.token)}&id=${r.id}`,
  });
}

onLoad(() => { void load(); });
onShow(() => { if (!loading.value) void load(); });
</script>

<style scoped lang="scss">
.ll-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.ll-hero { background: linear-gradient(135deg, #e0397a, #f0634c); color: #fff; padding: 40rpx 30rpx 34rpx;
  &__row { display: flex; align-items: center; gap: 12rpx; }
  &__ico { font-size: 44rpx; }
  &__title { font-size: 40rpx; font-weight: bold; }
  &__sub { display: block; margin-top: 10rpx; font-size: 24rpx; opacity: .9; }
}
.ll-tabs { display: flex; background: $surface; padding: 0 20rpx; }
.ll-tab { flex: 1; text-align: center; padding: 24rpx 0; font-size: 28rpx; color: $text-color-secondary; position: relative;
  &.on { color: #e0397a; font-weight: 600;
    &::after { content: ''; position: absolute; left: 50%; bottom: 8rpx; transform: translateX(-50%); width: 48rpx; height: 6rpx; border-radius: 999rpx; background: #e0397a; }
  }
}
.ll-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 80rpx 0; }
.ll-empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; text-align: center; }
}
.ll-card { display: flex; gap: 20rpx; background: $surface; margin: 20rpx; padding: 20rpx; border-radius: $radius-md;
  &__media { position: relative; flex-shrink: 0; }
  &__img { width: 240rpx; height: 168rpx; border-radius: $radius-sm; background: $bg-color; display: block;
    &--ph { display: flex; align-items: center; justify-content: center; font-size: 48rpx; color: #e0397a; background: #fdeef4; }
  }
  &__badge { position: absolute; left: 0; top: 0; font-size: 20rpx; color: #fff; padding: 4rpx 12rpx; border-radius: $radius-sm 0 $radius-sm 0; background: #999;
    &--live { background: #e0397a; }
    &--scheduled { background: #f0a020; }
    &--ended { background: #8a8a8a; }
  }
  &__replay { position: absolute; right: 8rpx; bottom: 8rpx; font-size: 20rpx; color: #fff; background: rgba(0,0,0,.45); padding: 2rpx 10rpx; border-radius: 999rpx; }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
  &__shop { font-size: 20rpx; color: $text-color-placeholder; }
  &__name { font-size: 30rpx; font-weight: 600; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__desc { font-size: 22rpx; color: $text-color-secondary; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; }
  &__meta { font-size: 20rpx; color: $text-color-placeholder; }
  &__go { font-size: 24rpx; color: #e0397a; font-weight: 600;
    &.off { color: #f0a020; }
  }
}
.ll-note { padding: 24rpx 30rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; line-height: 1.6; }
</style>
