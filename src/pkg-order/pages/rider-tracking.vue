<template>
    <view class="rt">
        <!-- 全屏地图（版式 B）：无任何坐标时不渲染，改展示占位卡 -->
        <map
            v-if="hasMapPoint"
            id="riderMap"
            class="rt__map"
            :latitude="mapCenter.lat"
            :longitude="mapCenter.lng"
            :scale="mapScaleView"
            :markers="markers"
            :polyline="polylines"
            :show-location="false"
            :enable-scroll="true"
            :enable-zoom="true"
            @regionchange="onRegionChange"
        />
        <view v-else class="rt__placeholder">
            <text class="rt__placeholder-title">{{ $t('riderTracking.noLocation') }}</text>
            <text class="rt__placeholder-sub">{{ $t('riderTracking.noLocationHint') }}</text>
        </view>

        <!-- 顶部悬浮：返回 / 订单号 / 跟随开关 -->
        <view class="rt__top">
            <view class="rt__back" @tap="goBack"><text>‹</text></view>
            <text class="rt__code">#{{ code }}</text>
            <view class="rt__follow" :class="{ 'rt__follow--on': follow }" @tap="toggleFollow">
                {{ follow ? $t('riderTracking.follow') : $t('riderTracking.free') }}
            </view>
        </view>

        <!-- 未配置腾讯地图 Key 时明确提示，避免静默白屏 -->
        <view class="rt__banner" v-if="!hasMapKey">{{ $t('riderTracking.keyMissing') }}</view>

        <!-- 底部抽屉：收起仅留摘要行 -->
        <view class="rt__sheet" :class="{ 'rt__sheet--collapsed': collapsed }">
            <view class="rt__handle" @tap="collapsed = !collapsed"><view class="rt__bar"></view></view>

            <view class="rt__rider" v-if="rider">
                <view class="rt__avatar"><text>{{ $t('riderTracking.rider') }}</text></view>
                <view class="rt__info">
                    <text class="rt__name">{{ rider.realName }}</text>
                    <text class="rt__sub">{{ $t('riderTracking.credit').replace('{n}', String(rider.credit ?? '—')) }}</text>
                </view>
                <text class="rt__contact" @tap="callStore">{{ $t('riderTracking.contactStore') }}</text>
            </view>
            <text class="rt__matching" v-else>{{ $t('riderTracking.matching') }}</text>

            <view class="rt__eta">
                <view class="rt__eta-main">
                    <text class="rt__eta-title">{{ $t('riderTracking.etaTitle') }}</text>
                    <text class="rt__eta-value">{{ etaText }}</text>
                </view>
                <view class="rt__eta-side">
                    <text class="rt__dist" v-if="distanceText">{{ distanceText }}</text>
                    <text class="rt__updated" v-if="updatedText" :class="{ 'rt__updated--fail': failed }">
                        {{ failed ? $t('riderTracking.refreshFailed') : updatedText }}
                    </text>
                </view>
            </view>

            <view class="rt__tl" v-if="!collapsed">
                <view
                    v-for="s in steps" :key="s.key"
                    class="rt__tl-item"
                    :class="{ 'rt__tl-item--done': s.done, 'rt__tl-item--active': s.active }"
                >
                    <view class="rt__tl-dot"><text v-if="s.done || s.active">✓</text></view>
                    <text class="rt__tl-label">{{ s.label }}</text>
                </view>
            </view>

            <view class="rt__actions" v-if="!collapsed">
                <text v-if="urged" class="rt__urged">{{ $t('riderTracking.urged') }}</text>
                <button v-else-if="canUrge" class="rt__urge-btn" @tap="onUrge">{{ $t('riderTracking.urge') }}</button>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow, onHide, onUnload } from '@dcloudio/uni-app';
import { getOrderByCode } from '../../api/queries/order';
import { fetchOrderRider, urgeOrder } from '../../api/mutations/campus';
import { fetchStoreList } from '../../api/queries/waimai';
import { isNoRiderFinal, isExceptionFinal } from '../../utils/timeline';
import { useLocaleStore } from '../../stores/locale';

interface LatLng { lat: number; lng: number }
interface TrackPoint { latitude: number; longitude: number }

const locale = useLocaleStore();
const code = ref('');
const orderId = ref('');
const order = ref<any>(null);
const rider = ref<any>(null);
const lastAt = ref(0);
const failed = ref(false);
const follow = ref(true);
const collapsed = ref(false);
const now = ref(Date.now());
const track = ref<TrackPoint[]>([]);

let timer: ReturnType<typeof setInterval> | null = null;
let tick: ReturnType<typeof setInterval> | null = null;
let loaded = false;

// H5 下由 main.ts 从 VITE_QQMAP_KEY 注入 __uniConfig.qqMapKey；未配置则底图不可用
let mapKeyReady = true;
// #ifdef H5
mapKeyReady = !!(window as any).__uniConfig?.qqMapKey;
// #endif
const hasMapKey = ref(mapKeyReady);

const t = (k: string) => locale.t(`riderTracking.${k}`);
const cf = computed(() => order.value?.customFields ?? {});
const location = computed<LatLng | null>(() => rider.value?.location ?? null);
const destination = computed<any>(() => rider.value?.destination ?? null);
const status = computed(() => rider.value?.deliveryStatus ?? cf.value.deliveryStatus ?? '');
const hasMapPoint = computed(() => !!(location.value || destination.value));

const terminal = computed(() => {
    if (order.value?.state === 'Cancelled') return 'Cancelled';
    if (status.value === 'delivered') return 'Delivered';
    if (status.value === 'exception') return isExceptionFinal(cf.value.hallStatus ?? null) ? 'ExceptionDone' : 'ExceptionPending';
    if (isNoRiderFinal(cf.value.hallStatus ?? null)) return 'NoRider';
    return '';
});

const terminalText = computed(() => {
    switch (terminal.value) {
        case 'Delivered': return t('terminalDelivered');
        case 'ExceptionPending':
        case 'ExceptionDone': return t('terminalException');
        case 'Cancelled': return t('terminalCancelled');
        default: return '';
    }
});

const mapScale = computed(() => {
    const d = rider.value?.distanceMeters;
    if (d == null) return 16;
    if (d < 400) return 17;
    if (d < 1200) return 16;
    if (d < 3000) return 14;
    return 12;
});

// 底部抽屉遮挡高度（px）：地图中心点需上移抽屉一半，保证两点都落在可视区
const SHEET_COVER_PX = 220;

// 同时有骑手与楼栋时取中点，并把中心向南偏移（视觉上整体上移），
// H5 的 includePoints 仅按整屏 fitBounds，不考虑抽屉遮挡
const center = computed<LatLng>(() => {
    const loc = location.value;
    const dest = destination.value;
    let mid: LatLng;
    if (loc && dest) mid = { lat: (loc.lat + dest.lat) / 2, lng: (loc.lng + dest.lng) / 2 };
    else mid = loc ?? dest ?? { lat: 0, lng: 0 };
    const mpp = (156543.03392 * Math.cos((mid.lat * Math.PI) / 180)) / 2 ** mapScale.value;
    const shiftLat = ((SHEET_COVER_PX / 2) * mpp) / 111320;
    return { lat: mid.lat - shiftLat, lng: mid.lng };
});

// 关闭跟随后锁定视野，避免每次轮询把用户拖动后的地图拽回
const locked = ref<{ center: LatLng; scale: number } | null>(null);
const mapCenter = computed<LatLng>(() => (locked.value ? locked.value.center : center.value));
const mapScaleView = computed(() => (locked.value ? locked.value.scale : mapScale.value));

const etaText = computed(() => {
    if (terminal.value) return terminalText.value || t('matching');
    const eta = rider.value?.etaMinutes;
    if (eta == null) return rider.value ? t('etaWaiting') : t('matching');
    return eta === 0 ? t('etaSoon') : t('etaMinutes').replace('{n}', String(eta));
});

const distanceText = computed(() => {
    const d = rider.value?.distanceMeters;
    if (d == null) return '';
    const txt = d < 1000 ? `${d} m` : `${(d / 1000).toFixed(1)} km`;
    return t('distance').replace('{n}', txt);
});

const updatedText = computed(() => {
    if (!lastAt.value) return '';
    const sec = Math.max(0, Math.floor((now.value - lastAt.value) / 1000));
    return sec < 5 ? t('updatedJustNow') : t('updatedSecondsAgo').replace('{n}', String(sec));
});

const urged = computed(() => !!cf.value.urged);
const canUrge = computed(() => {
    if (terminal.value) return false;
    return ['assigned', 'in_progress'].includes(status.value);
});

const markers = computed(() => {
    const arr: any[] = [];
    if (location.value) {
        arr.push({
            id: 1,
            latitude: location.value.lat,
            longitude: location.value.lng,
            iconPath: '/static/map/rider.png',
            width: 28,
            height: 28,
            callout: {
                content: `${rider.value?.realName ?? ''} ${t('rider')}`,
                display: 'ALWAYS',
                fontSize: 12,
                borderRadius: 6,
                padding: 6,
            },
        });
    }
    if (destination.value) {
        arr.push({
            id: 2,
            latitude: destination.value.lat,
            longitude: destination.value.lng,
            iconPath: '/static/map/building.png',
            width: 26,
            height: 26,
            label: {
                content: `${destination.value.name}${cf.value.campusZone ? ` · ${cf.value.campusZone}` : ''}`,
                color: '#ffffff',
                bgColor: '#1a1a1a',
                fontSize: 11,
                padding: 4,
                borderRadius: 4,
                anchorX: 0,
                anchorY: -28,
            },
        });
    }
    return arr;
});

const polylines = computed(() => {
    const arr: any[] = [];
    if (track.value.length >= 2) {
        arr.push({ id: 1, points: track.value, color: '#FF6600', width: 6, arrowLine: false });
    }
    if (location.value && destination.value) {
        arr.push({
            id: 2,
            points: [
                { latitude: location.value.lat, longitude: location.value.lng },
                { latitude: destination.value.lat, longitude: destination.value.lng },
            ],
            color: '#FF6600AA',
            width: 4,
            dottedLine: true,
            arrowLine: false,
        });
    }
    return arr;
});

const steps = computed(() => {
    const s = status.value;
    const picked = s === 'in_progress' || s === 'delivered';
    const delivered = s === 'delivered';
    return [
        { key: 'assigned', label: t('timelineAssigned'), done: !!s, active: s === 'assigned' },
        { key: 'picked', label: t('timelinePicked'), done: picked, active: false },
        { key: 'delivering', label: t('timelineDelivering'), done: delivered, active: s === 'in_progress' },
        { key: 'delivered', label: t('timelineDelivered'), done: delivered, active: false },
    ];
});

/** 球面直线距离（米）：用于轨迹去抖（>8m 才记录）与跟随缩放阈值 */
function meters(a: LatLng, b: LatLng): number {
    const R = 6371000;
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function pushTrackPoint(loc: LatLng) {
    const last = track.value[track.value.length - 1];
    const p = { latitude: loc.lat, longitude: loc.lng };
    if (!last || meters({ lat: last.latitude, lng: last.longitude }, loc) > 8) {
        track.value.push(p);
        if (track.value.length > 60) track.value.shift();
    }
}

function applyRider(r: any) {
    rider.value = r;
    failed.value = false;
    lastAt.value = Date.now();
    const loc = r?.location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) pushTrackPoint(loc);
}

async function loadOrder() {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    code.value = page?.options?.code ?? '';
    if (!code.value) return;
    try {
        const res: any = await getOrderByCode(code.value);
        order.value = res?.orderByCode ?? null;
        orderId.value = order.value?.id ? String(order.value.id) : '';
    } catch (_e) { /* 失败保留空态，轮询重试 */ }
}

async function reloadOrder() {
    if (!code.value) return;
    try {
        const res: any = await getOrderByCode(code.value);
        if (res?.orderByCode) {
            order.value = res.orderByCode;
            orderId.value = String(order.value.id);
        }
    } catch (_e) { /* ignore */ }
}

async function poll() {
    if (!orderId.value) return;
    try {
        applyRider(await fetchOrderRider(orderId.value));
    } catch (_e) {
        failed.value = true;   // 保留上一次数据，仅标记更新失败
    }
    if (terminal.value) stopPolling();
}

function startPolling() {
    stopPolling();
    if (!orderId.value) return;
    poll();
    timer = setInterval(poll, 10000);
    tick = setInterval(() => { now.value = Date.now(); }, 1000);
}

function stopPolling() {
    if (timer) { clearInterval(timer); timer = null; }
    if (tick) { clearInterval(tick); tick = null; }
}

function toggleFollow() {
    if (follow.value) {
        locked.value = { center: { ...center.value }, scale: mapScale.value };
        follow.value = false;
    } else {
        follow.value = true;
        locked.value = null;
    }
}

function onRegionChange(e: any) {
    // 用户手动拖动后退出跟随，避免每次轮询把地图拽回去
    const by = e?.detail?.causedBy ?? e?.causedBy ?? '';
    if (e?.type === 'end' && by === 'drag' && follow.value) {
        locked.value = { center: { ...center.value }, scale: mapScale.value };
        follow.value = false;
    }
}

function goBack() {
    uni.navigateBack({
        fail: () => uni.redirectTo({ url: `/pkg-order/pages/order-detail?code=${code.value}` }),
    });
}

function onUrge() {
    uni.showModal({
        title: t('urge'),
        content: locale.t('orderDetail.urgeConfirm'),
        success: async (r: any) => {
            if (!r.confirm) return;
            try {
                await urgeOrder(orderId.value);
                uni.showToast({ title: t('urged'), icon: 'success' });
                await reloadOrder();
            } catch (e: any) {
                uni.showToast({ title: e?.response?.errors?.[0]?.message || t('urgeFail'), icon: 'none' });
            }
        },
    });
}

/** 拨门店电话：与订单页一致，按 channelToken 精确匹配店铺，否则回退第一家 */
async function callStore() {
    try {
        const list: any[] = await fetchStoreList();
        const token = order.value?.channelToken;
        const store = (token && list.find(s => s.channelToken === token)) || list[0];
        const phone = store?.storePhone;
        if (!phone) return uni.showToast({ title: locale.t('orderDetail.noPhone'), icon: 'none' });
        uni.makePhoneCall({ phoneNumber: phone });
    } catch {
        uni.showToast({ title: locale.t('orderDetail.phoneFail'), icon: 'none' });
    }
}

onShow(async () => {
    if (!loaded) {
        loaded = true;
        await loadOrder();
    } else {
        await reloadOrder();
    }
    startPolling();
});
onHide(stopPolling);
onUnload(stopPolling);
</script>

<style lang="scss" scoped>
.rt {
    position: relative;
    width: 100vw;
    height: 100vh;
    background: $bg-color;
}
.rt__map { position: absolute; inset: 0; width: 100%; height: 100%; }
.rt__placeholder {
    position: absolute; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 12rpx; background: $bg-color;
    &-title { font-size: 30rpx; color: $text-color; font-weight: bold; }
    &-sub { font-size: 24rpx; color: $text-color-placeholder; }
}
.rt__top {
    position: absolute; left: 0; right: 0;
    padding: calc(var(--status-bar-height, 0px) + 16rpx) 24rpx 0;
    display: flex; align-items: center; gap: 16rpx;
}
.rt__back {
    width: 64rpx; height: 64rpx; border-radius: 50%; background: $surface;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, .12);
    text { font-size: 42rpx; line-height: 42rpx; color: $text-color; margin-top: -6rpx; }
}
.rt__code {
    flex: 0 0 auto; font-size: 24rpx; color: $text-color; background: $surface;
    border-radius: 999rpx; padding: 10rpx 24rpx; box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, .12);
}
.rt__follow {
    margin-left: auto; font-size: 24rpx; color: $text-color-secondary; background: $surface;
    border: 1rpx solid $border-color; border-radius: 999rpx; padding: 10rpx 24rpx;
    box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, .12);
    &--on { color: $brand-color; border-color: $brand-color; }
}
.rt__banner {
    position: absolute; left: 24rpx; right: 24rpx;
    top: calc(var(--status-bar-height, 0px) + 96rpx);
    background: #fff7e6; border: 1rpx solid #ffe1a8; color: #c47b00;
    font-size: 22rpx; border-radius: $radius-md; padding: 14rpx 20rpx;
}
.rt__sheet {
    position: absolute; left: 0; right: 0; bottom: 0;
    background: $surface; border-radius: 28rpx 28rpx 0 0;
    padding: 16rpx 30rpx calc(24rpx + env(safe-area-inset-bottom));
    box-shadow: 0 -6rpx 24rpx rgba(0, 0, 0, .10);
    &--collapsed { padding-bottom: calc(16rpx + env(safe-area-inset-bottom)); }
}
.rt__handle { display: flex; justify-content: center; padding: 8rpx 0 16rpx; }
.rt__bar { width: 72rpx; height: 8rpx; border-radius: 999rpx; background: $border-color; }
.rt__rider {
    display: flex; align-items: center; gap: 20rpx;
}
.rt__avatar {
    width: 80rpx; height: 80rpx; border-radius: 50%; background: $brand-color; color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 26rpx; flex-shrink: 0;
}
.rt__info { flex: 1; display: flex; flex-direction: column; gap: 6rpx; }
.rt__name { font-size: 30rpx; font-weight: bold; color: $text-color; }
.rt__sub { font-size: 24rpx; color: $text-color-secondary; }
.rt__contact {
    font-size: 24rpx; color: $brand-color; border: 1rpx solid $brand-color;
    border-radius: 999rpx; padding: 8rpx 20rpx; flex-shrink: 0;
}
.rt__matching { font-size: 28rpx; color: $brand-color; padding: 8rpx 0; }
.rt__eta {
    display: flex; align-items: flex-end; justify-content: space-between;
    padding: 20rpx 0 0; margin-top: 16rpx; border-top: 1rpx solid $border-color;
}
.rt__eta-main { display: flex; flex-direction: column; gap: 4rpx; }
.rt__eta-title { font-size: 22rpx; color: $text-color-placeholder; }
.rt__eta-value { font-size: 40rpx; font-weight: bold; color: $text-color; }
.rt__eta-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4rpx; }
.rt__dist { font-size: 24rpx; color: $text-color-secondary; }
.rt__updated { font-size: 22rpx; color: $text-color-placeholder; &--fail { color: #e02020; } }
.rt__tl { padding: 16rpx 0 8rpx; }
.rt__tl-item {
    display: flex; align-items: flex-start;
    &--done .rt__tl-dot { background: $brand-color; }
    &--done .rt__tl-label { color: $text-color; }
    &--active .rt__tl-dot { background: $brand-color; box-shadow: 0 0 0 8rpx rgba(255, 102, 0, .15); }
    &--active .rt__tl-label { color: $brand-color; font-weight: bold; }
}
.rt__tl-dot {
    width: 30rpx; height: 30rpx; border-radius: 50%; background: #eee; color: #fff;
    font-size: 18rpx; display: flex; align-items: center; justify-content: center;
    margin-right: 18rpx; flex-shrink: 0;
}
.rt__tl-label { font-size: 26rpx; color: $text-color-placeholder; padding: 2rpx 0 20rpx; }
.rt__tl-item:last-child .rt__tl-label { padding-bottom: 4rpx; }
.rt__actions { display: flex; justify-content: center; padding-bottom: 8rpx; }
.rt__urge-btn {
    width: 260rpx; height: 68rpx; line-height: 68rpx; font-size: 26rpx;
    border-radius: 999rpx; background: $surface; color: $brand-color;
    border: 1rpx solid $brand-color; padding: 0; margin: 0;
}
.rt__urged { font-size: 24rpx; color: #e02020; background: #fdeaea; border-radius: 999rpx; padding: 10rpx 26rpx; }
</style>
