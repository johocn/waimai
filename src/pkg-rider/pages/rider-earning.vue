<template>
    <view class="earning">
        <view class="kpi">
            <view class="kpi-item">
                <text class="kpi-num">¥{{ fmt(todayTotal) }}</text>
                <text class="kpi-label">今日</text>
            </view>
            <view class="kpi-item">
                <text class="kpi-num">¥{{ fmt(weekTotal) }}</text>
                <text class="kpi-label">本周</text>
            </view>
            <view class="kpi-item">
                <text class="kpi-num">{{ profile?.riderCredit ?? '--' }}</text>
                <text class="kpi-label">信用分</text>
            </view>
        </view>
        <EmptyState v-if="!rows.length" text="暂无分成流水" />
        <view v-else class="list">
            <view v-for="r in rows" :key="r.id" class="row">
                <view class="row-main">
                    <text class="row-title">订单 #{{ r.orderId }}{{ r.tip ? ' · 含小费' : '' }}</text>
                    <text class="row-time">{{ fmtTime(r.createdAt) }}</text>
                </view>
                <text class="row-amount">+¥{{ fmt((r.amount ?? 0) + (r.tip ?? 0)) }}</text>
            </view>
        </view>
        <text class="note">提现能力二期开放；分成随送达实时入账（status=credited）</text>
    </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { myRiderProfile } from '../../api/queries/rider';
import { fetchMyEarnings } from '../../api/queries/earnings';
import { useAuthStore } from '../../stores/auth';
import EmptyState from '../../components/EmptyState.vue';

const auth = useAuthStore();
const profile = ref<any>(null);
const rows = ref<any[]>([]);

const todayTotal = computed(() => sumOf(rows.value, 0));
const weekTotal = computed(() => sumOf(rows.value, 7));

function fmt(fen: number) { return (fen / 100).toFixed(2); }

function fmtTime(v: any) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v ?? '') : d.toLocaleString('zh-CN', { hour12: false });
}

function sumOf(list: any[], days: number) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - days);
    return list
        .filter(r => new Date(r.createdAt) >= start && r.status === 'credited')
        .reduce((s, r) => s + (r.amount ?? 0) + (r.tip ?? 0), 0);
}

onShow(async () => {
    if (!auth.token) {
        return uni.redirectTo({ url: '/pages/login/index?redirect=' + encodeURIComponent('/pkg-rider/pages/rider-earning') });
    }
    profile.value = await myRiderProfile().catch(() => null);
    rows.value = await fetchMyEarnings(0, 50).catch(() => []);
});
</script>

<style scoped lang="scss">
.earning { padding: 24rpx; }
.kpi { display: flex; background: $brand-color; border-radius: $radius-card; padding: 32rpx 16rpx; margin-bottom: 24rpx; }
.kpi-item { flex: 1; text-align: center; }
.kpi-num { display: block; color: #fff; font-size: 34rpx; font-weight: 700; }
.kpi-label { display: block; color: rgba(255, 255, 255, .8); font-size: 22rpx; margin-top: 6rpx; }
.list { background: $surface; border-radius: $radius-card; }
.row { display: flex; justify-content: space-between; align-items: center; padding: 24rpx; border-bottom: 1rpx solid #f0f0f0; }
.row:last-child { border-bottom: none; }
.row-title { display: block; font-size: 26rpx; color: $text; }
.row-time { display: block; font-size: 22rpx; color: $text-muted; margin-top: 4rpx; }
.row-amount { font-size: 30rpx; font-weight: 600; color: #1dc981; }
.note { display: block; text-align: center; font-size: 22rpx; color: $text-muted; margin-top: 24rpx; }
</style>
