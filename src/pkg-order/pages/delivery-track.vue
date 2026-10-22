<template>
    <view class="dt-page">
        <view v-if="loading" class="dt-tip">{{ $t('deliveryTrack.loading') }}</view>

        <view v-else-if="!packages.length && !tracks.length" class="dt-empty">
            <text class="dt-empty__ico">🛵</text>
            <text class="dt-empty__txt">{{ $t('deliveryTrack.empty') }}</text>
            <text class="dt-empty__hint">{{ $t('deliveryTrack.emptyHint') }}</text>
        </view>

        <template v-else>
            <view v-for="p in packages" :key="p.code" class="dt-card">
                <view class="dt-card__head">
                    <view class="dt-card__left">
                        <text class="dt-card__code">{{ $t('deliveryTrack.pkgNo') }} {{ p.code }}</text>
                        <text class="dt-card__mode">{{ modeText(p.deliveryMode) }}</text>
                    </view>
                    <text class="dt-chip" :class="'st-' + p.status">{{ pkgStatusText(p.status) }}</text>
                </view>

                <view class="dt-courier" v-if="p.courierName || p.courierPhone">
                    <view class="dt-courier__avatar">{{ (p.courierName || '骑').slice(0, 1) }}</view>
                    <view class="dt-courier__info">
                        <text class="dt-courier__name">{{ p.courierName || $t('deliveryTrack.courier') }}</text>
                        <text class="dt-courier__meta" v-if="p.carrierName">{{ p.carrierName }}</text>
                    </view>
                    <view class="dt-courier__call" v-if="p.courierPhone" @tap="call(p.courierPhone)">
                        📞 {{ $t('deliveryTrack.call') }}
                    </view>
                </view>

                <view class="dt-row" v-if="p.etaMinutes != null">
                    <text class="dt-row__label">{{ $t('deliveryTrack.eta') }}</text>
                    <text class="dt-row__val dt-row__val--strong">{{ $t('deliveryTrack.etaMin').replace('{n}', String(p.etaMinutes)) }}</text>
                </view>
                <view class="dt-row" v-if="p.trackingNo">
                    <text class="dt-row__label">{{ $t('deliveryTrack.trackingNo') }}</text>
                    <text class="dt-row__val" @tap="copy(p.trackingNo)">{{ p.trackingNo }} · {{ $t('deliveryTrack.copy') }}</text>
                </view>
                <view class="dt-row" v-if="p.shippingFee">
                    <text class="dt-row__label">{{ $t('deliveryTrack.shippingFee') }}</text>
                    <text class="dt-row__val">¥{{ money(p.shippingFee) }}</text>
                </view>
                <view class="dt-row" v-if="p.shippedAt">
                    <text class="dt-row__label">{{ $t('deliveryTrack.shippedAt') }}</text>
                    <text class="dt-row__val">{{ timeText(p.shippedAt) }}</text>
                </view>
                <view class="dt-row" v-if="p.deliveredAt">
                    <text class="dt-row__label">{{ $t('deliveryTrack.deliveredAt') }}</text>
                    <text class="dt-row__val">{{ timeText(p.deliveredAt) }}</text>
                </view>

                <view class="dt-lines" v-if="p.lines && p.lines.length">
                    <view class="dt-line" v-for="l in p.lines" :key="l.orderLineId + l.productName">
                        <text class="dt-line__name">{{ l.productName }}</text>
                        <text class="dt-line__qty">×{{ l.quantity }}</text>
                    </view>
                </view>
            </view>

            <view class="dt-card dt-card--timeline" v-if="nodes.length">
                <text class="dt-card__title">{{ $t('deliveryTrack.timeline') }}</text>
                <view class="dt-node" v-for="(n, i) in nodes" :key="i" :class="{ 'dt-node--first': i === 0 }">
                    <view class="dt-node__rail">
                        <view class="dt-node__dot"></view>
                        <view class="dt-node__line" v-if="i < nodes.length - 1"></view>
                    </view>
                    <view class="dt-node__body">
                        <text class="dt-node__desc" :class="{ 'dt-node__desc--strong': i === 0 }">{{ n.desc }}</text>
                        <text class="dt-node__time" v-if="n.time">{{ n.time }}</text>
                    </view>
                </view>
            </view>
        </template>

        <view class="dt-note">{{ $t('deliveryTrack.note') }}</view>
    </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getOrderPackages, getOrderTracks, type LogisticsTrack, type OrderPackage } from '../../api/queries/package';
import { useLocaleStore } from '../../stores/locale';

const locale = useLocaleStore();
const loading = ref(true);
const packages = ref<OrderPackage[]>([]);
const tracks = ref<LogisticsTrack[]>([]);

const PKG_STATUS: Record<string, string> = {
    pending: 'deliveryTrack.stPending',
    packed: 'deliveryTrack.stPacked',
    shipped: 'deliveryTrack.stShipped',
    delivering: 'deliveryTrack.stDelivering',
    delivered: 'deliveryTrack.stDelivered',
    cancelled: 'deliveryTrack.stCancelled',
    returned: 'deliveryTrack.stReturned',
};

function pkgStatusText(status: string) {
    const key = PKG_STATUS[String(status || '').toLowerCase()];
    return key ? locale.t(key) : (status || '');
}

function modeText(mode: string) {
    const k = String(mode || '').toLowerCase();
    if (k === 'pickup') return locale.t('deliveryTrack.modePickup');
    if (k === 'express') return locale.t('deliveryTrack.modeExpress');
    if (k === 'delivery') return locale.t('deliveryTrack.modeDelivery');
    return mode || locale.t('deliveryTrack.modeDelivery');
}

function money(fen: number) {
    return (Number(fen || 0) / 100).toFixed(2);
}

function timeText(at?: string | null) {
    if (!at) return '';
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => (n < 10 ? '0' + n : String(n));
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Node = { desc: string; time: string };

function parseTrackNodes(t: LogisticsTrack): Node[] {
    const raw = t.trackInfo || '';
    if (!raw) return [];
    let arr: any = null;
    try { arr = JSON.parse(raw); } catch { arr = null; }
    if (Array.isArray(arr)) {
        return arr.map((x: any) => ({
            desc: String(x.desc || x.context || x.status || x.remark || ''),
            time: String(x.time || x.acceptTime || x.ftime || x.datetime || ''),
        })).filter(n => n.desc);
    }
    return [{ desc: raw, time: '' }];
}

const nodes = computed<Node[]>(() => {
    const out: Node[] = [];
    for (const t of tracks.value) {
        const parsed = parseTrackNodes(t);
        if (parsed.length) out.push(...parsed);
        else out.push({
            desc: `${t.carrierName || ''} ${t.status || ''}`.trim() || locale.t('deliveryTrack.synced'),
            time: timeText(t.signedAt || t.lastSyncedAt),
        });
    }
    return out;
});

function call(phone: string) {
    uni.makePhoneCall({ phoneNumber: phone, fail: () => {} });
}

function copy(text: string) {
    uni.setClipboardData({
        data: text,
        success: () => uni.showToast({ title: locale.t('deliveryTrack.copied'), icon: 'none' }),
    });
}

onLoad((query: any) => {
    const orderId = String(query?.orderId || '');
    if (!orderId) {
        loading.value = false;
        return;
    }
    void (async () => {
        const [pkgs, trks] = await Promise.allSettled([
            getOrderPackages(orderId),
            getOrderTracks(orderId),
        ]);
        packages.value = pkgs.status === 'fulfilled' ? pkgs.value : [];
        tracks.value = trks.status === 'fulfilled' ? trks.value : [];
        loading.value = false;
    })();
});
</script>

<style lang="scss" scoped>
.dt-page { min-height: 100vh; background: $bg-color; padding: 24rpx 24rpx 60rpx; box-sizing: border-box; }
.dt-tip { text-align: center; padding: 100rpx 0; font-size: 26rpx; color: $text-color-placeholder; }
.dt-empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; }
.dt-empty__ico { font-size: 84rpx; }
.dt-empty__txt { margin-top: 24rpx; font-size: 28rpx; color: $text-color-secondary; }
.dt-empty__hint { margin-top: 12rpx; font-size: 24rpx; color: $text-color-placeholder; text-align: center; }

.dt-card {
    background: $surface; border-radius: $radius-lg; padding: 26rpx; margin-bottom: 22rpx;
    box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.04);
}
.dt-card__head { display: flex; justify-content: space-between; align-items: center; gap: 16rpx; }
.dt-card__left { display: flex; flex-direction: column; gap: 6rpx; }
.dt-card__code { font-size: 24rpx; color: $text-color-secondary; }
.dt-card__mode { font-size: 22rpx; color: $text-color-placeholder; }
.dt-card__title { display: block; font-size: 28rpx; font-weight: 600; color: $text-color; margin-bottom: 20rpx; }
.dt-chip {
    font-size: 22rpx; padding: 6rpx 18rpx; border-radius: 24rpx;
    background: #fff3e6; color: #d46b08;
}
.dt-chip.st-delivered { background: #eaf7ee; color: #389e0d; }
.dt-chip.st-cancelled, .dt-chip.st-returned { background: #f5f5f5; color: #999; }

.dt-courier {
    display: flex; align-items: center; gap: 18rpx; margin-top: 20rpx;
    background: #f8f9fb; border-radius: $radius-md; padding: 18rpx;
}
.dt-courier__avatar {
    width: 72rpx; height: 72rpx; border-radius: 50%; background: #fff1ec; color: #ff4d4f;
    display: flex; align-items: center; justify-content: center; font-size: 30rpx; font-weight: 700;
}
.dt-courier__info { flex: 1; display: flex; flex-direction: column; gap: 4rpx; }
.dt-courier__name { font-size: 27rpx; font-weight: 600; color: $text-color; }
.dt-courier__meta { font-size: 22rpx; color: $text-color-placeholder; }
.dt-courier__call {
    font-size: 24rpx; color: #1677ff; border: 2rpx solid #1677ff;
    border-radius: 30rpx; padding: 8rpx 22rpx;
}

.dt-row { display: flex; justify-content: space-between; gap: 20rpx; padding: 12rpx 0; }
.dt-row__label { font-size: 24rpx; color: $text-color-placeholder; flex-shrink: 0; }
.dt-row__val { font-size: 24rpx; color: $text-color; text-align: right; word-break: break-all; }
.dt-row__val--strong { color: #fa541c; font-weight: 600; }

.dt-lines { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $border-color; }
.dt-line { display: flex; justify-content: space-between; gap: 20rpx; padding: 8rpx 0; }
.dt-line__name { font-size: 25rpx; color: $text-color-secondary; }
.dt-line__qty { font-size: 24rpx; color: $text-color-placeholder; }

.dt-node { display: flex; gap: 18rpx; }
.dt-node__rail { width: 32rpx; display: flex; flex-direction: column; align-items: center; }
.dt-node__dot {
    width: 18rpx; height: 18rpx; border-radius: 50%; background: #d9d9d9; margin-top: 8rpx;
}
.dt-node--first .dt-node__dot { background: #ff4d4f; box-shadow: 0 0 0 6rpx #ffe7e6; }
.dt-node__line { width: 3rpx; flex: 1; background: #eee; margin: 4rpx 0; min-height: 28rpx; }
.dt-node__body { flex: 1; padding-bottom: 26rpx; }
.dt-node__desc { font-size: 25rpx; color: $text-color-secondary; line-height: 1.5; }
.dt-node__desc--strong { color: $text-color; font-weight: 600; }
.dt-node__time { display: block; margin-top: 6rpx; font-size: 21rpx; color: $text-color-placeholder; }

.dt-note { text-align: center; font-size: 22rpx; color: $text-color-placeholder; padding: 16rpx 0; }
</style>
