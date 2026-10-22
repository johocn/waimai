<template>
  <view class="lr-page">
    <!-- 播放区：直播中播放 playUrl，回放播放 replayUrl，预告仅显示封面 -->
    <view class="lr-player">
      <video
        v-if="videoSrc"
        class="lr-video"
        :src="videoSrc"
        :poster="room?.coverUrl || ''"
        :autoplay="true"
        :controls="true"
        :show-center-play-btn="true"
        object-fit="contain"
      />
      <view v-else class="lr-ph">
        <image v-if="room?.coverUrl" class="lr-ph__img" :src="room.coverUrl" mode="aspectFill" />
        <view class="lr-ph__mask">
          <text class="lr-ph__ico">📺</text>
          <text class="lr-ph__txt">{{ phText }}</text>
        </view>
      </view>
      <view class="lr-livebar">
        <text class="lr-livebar__tag" :class="'lr-livebar__tag--' + (room?.status || 'ended')">{{ statusLabel }}</text>
        <text class="lr-livebar__meta">{{ $t('live.viewLike').replace('{v}', String(room?.viewCount || 0)).replace('{l}', String(room?.likeCount || 0)) }}</text>
      </view>
    </view>

    <view v-if="!room" class="lr-tip">{{ $t('live.roomLoading') }}</view>

    <template v-else>
      <!-- 房间信息 -->
      <view class="lr-info">
        <text class="lr-info__name">{{ room.name }}</text>
        <view class="lr-info__row">
          <text class="lr-info__streamer">{{ $t('live.streamer').replace('{n}', room.streamerName || $t('live.storeHost')) }}</text>
          <text v-if="room.status === 'live' && startedText" class="lr-info__time">{{ $t('live.startedAt').replace('{t}', startedText) }}</text>
          <text v-else-if="room.status === 'scheduled' && room.scheduledStartAt" class="lr-info__time">{{ $t('live.startAt').replace('{t}', fmtDate(room.scheduledStartAt)) }}</text>
        </view>
        <text v-if="room.description" class="lr-info__desc">{{ room.description }}</text>
        <!-- 外部平台同播入口（后端按渠道过滤） -->
        <view v-if="room.platforms?.length" class="lr-plats">
          <text v-for="p in room.platforms" :key="p.id" class="lr-plat" @tap="openPlatform(p)">{{ p.platform }} ›</text>
        </view>
      </view>

      <!-- 商品墙：直播/回放可加购；预告只展示 -->
      <view class="lr-sec">
        <text class="lr-sec__title">{{ $t('live.wallTitle') }}<text class="lr-sec__count">{{ products.length ? ' · ' + products.length : '' }}</text></text>
      </view>
      <view v-if="!products.length" class="lr-empty">{{ $t('live.wallEmpty') }}</view>
      <view v-for="p in products" :key="p.id" class="lr-good">
        <image v-if="p.imageUrl" class="lr-good__img" :src="p.imageUrl" mode="aspectFill" />
        <view v-else class="lr-good__img lr-good__img--ph"><text>{{ (p.name || '?').slice(0, 1) }}</text></view>
        <view class="lr-good__body">
          <text class="lr-good__name">{{ p.name }}</text>
          <text class="lr-good__price">¥{{ money(p.price) }}</text>
        </view>
        <button class="lr-good__btn" :disabled="busy || room.status !== 'live'" @tap="addToCart(p)">
          {{ room.status === 'live' ? $t('live.addCart') : $t('live.notOnSale') }}
        </button>
      </view>

      <view class="lr-note">{{ $t('live.roomNote') }}</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import {
  getLiveRoomInChannel,
  getLiveRoomProductsInChannel,
  enterLiveRoomInChannel,
  setOrderLiveRoomInChannel,
} from '../../api/queries/live';
import { addItemToOrderInChannel } from '../../api/mutations/cart';
import { getActiveOrderForChannel } from '../../api/queries/order';
import { getSessionToken } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const cart = useCartStore();
const locale = useLocaleStore();

const room = ref<any>(null);
const products = ref<any[]>([]);
const token = ref('');
const roomId = ref('');
const busy = ref(false);
const entered = ref<any>(null);

const statusLabels: Record<string, string> = { live: 'statusLive', scheduled: 'statusScheduled', ended: 'statusEnded' };
const statusLabel = computed(() => {
  const k = statusLabels[room.value?.status];
  return k ? locale.t(`live.${k}`) : room.value?.status || '';
});

// 优先使用 enterLiveRoom 下发的播放地址（仅 live 房间返回），否则回放地址
const videoSrc = computed(() => {
  if (room.value?.status === 'live' && entered.value?.playUrl) return entered.value.playUrl;
  if (room.value?.status === 'ended') return room.value?.replayUrl || '';
  return '';
});
const phText = computed(() => {
  if (room.value?.status === 'scheduled') return locale.t('live.phScheduled');
  if (room.value?.status === 'ended') return locale.t('live.phNoReplay');
  return locale.t('live.phConnecting');
});
const startedText = computed(() => (room.value?.startedAt ? fmtDate(room.value.startedAt) : ''));

function money(fen: number) {
  return (Number(fen || 0) / 100).toFixed(2);
}
function fmtDate(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function load() {
  try {
    const [r, ps] = await Promise.all([
      getLiveRoomInChannel(token.value, roomId.value),
      getLiveRoomProductsInChannel(token.value, roomId.value).catch(() => []),
    ]);
    room.value = r;
    products.value = ps || [];
  } catch (e) {
    console.warn('[live-room] load failed', e);
    room.value = null;
  }
}

/** 进房：拿播放地址/ws 票据；失败不阻断浏览（回放/预告无需进房） */
async function enter() {
  if (entered.value || room.value?.status === 'scheduled') return;
  try {
    const res: any = await enterLiveRoomInChannel(token.value, roomId.value);
    if (res?.playUrl) entered.value = res;
  } catch (e) {
    console.warn('[live-room] enter failed', e);
  }
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}

async function addToCart(p: any) {
  if (busy.value) return;
  if (!auth.isLoggedIn && !getSessionToken()) { goLogin(); return; }
  busy.value = true;
  uni.showLoading({ title: locale.t('live.adding') });
  try {
    const added: any = await addItemToOrderInChannel(token.value, String(p.variantId), 1);
    const order = added?.addItemToOrder;
    if (!order?.id) throw new Error(order?.errorCode || order?.message || 'ADD_FAILED');
    // 标记来源直播间（直播佣金归因），失败不阻断加购
    try { await setOrderLiveRoomInChannel(token.value, roomId.value); } catch {}
    const fresh: any = await getActiveOrderForChannel(token.value);
    if (fresh?.activeOrder) cart.setOrder(fresh.activeOrder);
    uni.hideLoading();
    uni.showToast({ title: locale.t('live.added'), icon: 'none' });
  } catch (e: any) {
    uni.hideLoading();
    const msg = String(e?.message || '');
    let key = 'live.addFail';
    if (/not authenticated|authorized/i.test(msg)) { goLogin(); return; }
    else if (/stock|sold out/i.test(msg)) key = 'live.outOfStock';
    uni.showToast({ title: locale.t(key), icon: 'none' });
  } finally {
    busy.value = false;
  }
}

function openPlatform(p: any) {
  if (!p?.externalUrl) return;
  uni.navigateTo({ url: `/pages/webview/index?url=${encodeURIComponent(p.externalUrl)}` });
}

onLoad(async (options: any) => {
  token.value = decodeURIComponent(String(options?.token || ''));
  roomId.value = String(options?.id || '');
  if (!token.value || !roomId.value) return;
  await load();
  await enter();
});
onUnload(() => { entered.value = null; });
</script>

<style scoped lang="scss">
.lr-page { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }
.lr-player { position: relative; width: 100%; background: #000; }
.lr-video { width: 100%; height: 420rpx; }
.lr-ph { position: relative; width: 100%; height: 420rpx; overflow: hidden;
  &__img { width: 100%; height: 100%; }
  &__mask { position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0,0,0,.42); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12rpx; }
  &__ico { font-size: 64rpx; }
  &__txt { font-size: 24rpx; color: #fff; opacity: .92; }
}
.lr-livebar { position: absolute; left: 20rpx; top: 20rpx; right: 20rpx; display: flex; align-items: center; justify-content: space-between;
  &__tag { font-size: 22rpx; color: #fff; padding: 4rpx 16rpx; border-radius: 999rpx; background: #999;
    &--live { background: #e0397a; }
    &--scheduled { background: #f0a020; }
    &--ended { background: #8a8a8a; }
  }
  &__meta { font-size: 20rpx; color: #fff; background: rgba(0,0,0,.4); padding: 4rpx 14rpx; border-radius: 999rpx; }
}
.lr-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 60rpx 0; }
.lr-info { background: $surface; padding: 26rpx 30rpx;
  &__name { display: block; font-size: 34rpx; font-weight: bold; color: $text-color; }
  &__row { display: flex; align-items: center; justify-content: space-between; margin-top: 12rpx; }
  &__streamer { font-size: 24rpx; color: #e0397a; }
  &__time { font-size: 22rpx; color: $text-color-placeholder; }
  &__desc { display: block; margin-top: 12rpx; font-size: 24rpx; color: $text-color-secondary; line-height: 1.6; }
}
.lr-plats { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx; }
.lr-plat { font-size: 22rpx; color: #e0397a; background: #fdeef4; padding: 6rpx 18rpx; border-radius: 999rpx; }
.lr-sec { padding: 24rpx 30rpx 8rpx;
  &__title { font-size: 28rpx; font-weight: 600; color: $text-color; }
  &__count { font-size: 24rpx; color: $text-color-placeholder; font-weight: 400; }
}
.lr-empty { margin: 0 30rpx; padding: 60rpx 0; text-align: center; font-size: 24rpx; color: $text-color-placeholder; background: $surface; border-radius: $radius-md; }
.lr-good { display: flex; align-items: center; gap: 20rpx; background: $surface; margin: 0 30rpx 16rpx; padding: 20rpx; border-radius: $radius-md;
  &__img { width: 140rpx; height: 140rpx; border-radius: $radius-sm; background: $bg-color; display: block; flex-shrink: 0;
    &--ph { display: flex; align-items: center; justify-content: center; font-size: 40rpx; color: #e0397a; background: #fdeef4; }
  }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10rpx; }
  &__name { font-size: 28rpx; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__price { font-size: 32rpx; font-weight: bold; color: #e0397a; }
  &__btn { margin: 0; height: 60rpx; line-height: 60rpx; padding: 0 26rpx; font-size: 24rpx; color: #fff; background: linear-gradient(135deg, #e0397a, #f0634c); border-radius: 999rpx;
    &[disabled] { background: #c9c9c9; color: #fff; }
  }
}
.lr-note { padding: 24rpx 30rpx; font-size: 22rpx; color: $text-color-placeholder; text-align: center; line-height: 1.6; }
</style>
