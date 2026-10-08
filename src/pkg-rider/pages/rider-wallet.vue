<template>
    <view class="wallet">
        <view class="balance-card">
            <text class="bc-label">{{ $t('riderWallet.availableLabel') }}</text>
            <text class="bc-amount">¥{{ fmt(wallet?.available ?? 0) }}</text>
            <view class="bc-subs">
                <view class="bc-sub">
                    <text class="bc-sub-num">¥{{ fmt(wallet?.frozen ?? 0) }}</text>
                    <text class="bc-sub-label">{{ $t('riderWallet.frozen') }}</text>
                </view>
                <view class="bc-sub">
                    <text class="bc-sub-num">¥{{ fmt(wallet?.totalEarned ?? 0) }}</text>
                    <text class="bc-sub-label">{{ $t('riderWallet.totalEarned') }}</text>
                </view>
            </view>
            <button class="bc-btn" :disabled="wallet?.available < 1000" @tap="goWithdraw">{{ $t('riderWallet.withdraw') }}</button>
            <text class="bc-tip" v-if="(wallet?.available ?? 0) < 1000">{{ $t('riderWallet.minTip') }}</text>
        </view>

        <view class="tabs">
            <text class="tab" :class="{ on: tab === 'history' }" @tap="switchTab('history')">{{ $t('riderWallet.tabHistory') }}</text>
            <text class="tab" :class="{ on: tab === 'withdraw' }" @tap="switchTab('withdraw')">{{ $t('riderWallet.tabWithdraw') }}</text>
        </view>

        <template v-if="tab === 'history'">
            <EmptyState v-if="!history.length" :text="$t('riderWallet.emptyHistory')" />
            <view v-else class="list">
                <view v-for="r in history" :key="r.id" class="row">
                    <view class="row-main">
                        <text class="row-title">{{ typeLabel(r.type) }}</text>
                        <text class="row-time">{{ fmtTime(r.createdAt) }}</text>
                    </view>
                    <view class="row-side">
                        <text class="row-amount" :class="{ neg: r.amount < 0 }">{{ r.amount > 0 ? '+' : '' }}¥{{ fmt(r.amount) }}</text>
                        <text class="row-after">{{ $t('riderWallet.balance').replace('{n}', fmt(r.balanceAfter)) }}</text>
                    </view>
                </view>
            </view>
        </template>

        <template v-else>
            <EmptyState v-if="!withdraws.length" :text="$t('riderWallet.emptyWithdraw')" />
            <view v-else class="list">
                <view v-for="r in withdraws" :key="r.id" class="row">
                    <view class="row-main">
                        <text class="row-title">{{ $t('riderWallet.withdrawTo').replace('{c}', r.channel) }}</text>
                        <text class="row-time">{{ fmtTime(r.createdAt) }}<text v-if="r.reviewedAt"> · {{ $t('riderWallet.reviewed') }} {{ fmtTime(r.reviewedAt) }}</text></text>
                    </view>
                    <view class="row-side">
                        <text class="row-amount neg">-¥{{ fmt(r.amount) }}</text>
                        <text class="row-status" :class="'st-' + r.status?.toLowerCase()">{{ statusLabel(r.status) }}</text>
                        <text class="row-remark" v-if="r.status === 'REJECTED' && r.remark">{{ r.remark }}</text>
                    </view>
                </view>
            </view>
        </template>
    </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow, onReachBottom } from '@dcloudio/uni-app';
import { myRiderWallet, riderBalanceHistory, riderWithdrawRequests } from '../../api/queries/wallet';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';
import EmptyState from '../../components/EmptyState.vue';

const auth = useAuthStore();
const locale = useLocaleStore();
const wallet = ref<any>(null);
const tab = ref<'history' | 'withdraw'>('history');
const history = ref<any[]>([]);
const withdraws = ref<any[]>([]);
const historyDone = ref(false);
const withdrawDone = ref(false);
const PAGE = 20;

const TYPE_LABELS: Record<string, string> = {
    recharge: 'typeRecharge',
    consume: 'typeConsume',
    refund: 'typeRefund',
    freeze: 'typeFreeze',
    unfreeze: 'typeUnfreeze',
    adjust: 'typeAdjust',
};

function typeLabel(t: string) { return TYPE_LABELS[t] ? locale.t(`riderWallet.${TYPE_LABELS[t]}`) : t; }
function statusLabel(s: string) {
    return s === 'PAID' ? locale.t('riderWallet.stPaid')
        : s === 'REJECTED' ? locale.t('riderWallet.stRejected')
        : locale.t('riderWallet.stPending');
}

function fmt(fen: number) { return ((fen ?? 0) / 100).toFixed(2); }

function fmtTime(v: any) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v ?? '') : d.toLocaleString('zh-CN', { hour12: false });
}

function switchTab(t: 'history' | 'withdraw') {
    tab.value = t;
    // 切到提现记录时首屏主动加载（该列表不随 onShow 初始化）
    if (t === 'withdraw' && !withdraws.value.length && !withdrawDone.value) void loadMore();
}

async function loadMore() {
    if (tab.value === 'history') {
        if (historyDone.value) return;
        const rows = await riderBalanceHistory(history.value.length, PAGE).catch(() => []);
        history.value.push(...rows);
        historyDone.value = rows.length < PAGE;
    } else {
        if (withdrawDone.value) return;
        const rows = await riderWithdrawRequests(withdraws.value.length, PAGE).catch(() => []);
        withdraws.value.push(...rows);
        withdrawDone.value = rows.length < PAGE;
    }
}

onShow(async () => {
    if (!auth.token) {
        return uni.redirectTo({ url: '/pages/login/index?redirect=' + encodeURIComponent('/pkg-rider/pages/rider-wallet') });
    }
    history.value = [];
    withdraws.value = [];
    historyDone.value = false;
    withdrawDone.value = false;
    wallet.value = await myRiderWallet().catch(() => null);
    await loadMore();
});

onReachBottom(loadMore);
</script>

<style scoped lang="scss">
.wallet { padding: 24rpx; }
.balance-card { background: $brand-color; border-radius: $radius-card; padding: 40rpx 32rpx; color: #fff; }
.bc-label { display: block; font-size: 24rpx; opacity: .85; }
.bc-amount { display: block; font-size: 64rpx; font-weight: 700; margin-top: 8rpx; }
.bc-subs { display: flex; margin-top: 24rpx; gap: 48rpx; }
.bc-sub-num { display: block; font-size: 30rpx; font-weight: 600; }
.bc-sub-label { display: block; font-size: 22rpx; opacity: .8; margin-top: 4rpx; }
.bc-btn { margin-top: 32rpx; background: $surface; color: $brand-color; font-weight: 600; border-radius: 999rpx; font-size: 30rpx; }
.bc-btn[disabled] { opacity: .6; }
.bc-tip { display: block; text-align: center; font-size: 22rpx; opacity: .8; margin-top: 8rpx; }
.tabs { display: flex; gap: 40rpx; margin: 32rpx 8rpx 20rpx; }
.tab { font-size: 28rpx; color: $text-muted; padding-bottom: 12rpx; }
.tab.on { color: $text; font-weight: 700; border-bottom: 4rpx solid $brand-color; }
.list { background: $surface; border-radius: $radius-card; }
.row { display: flex; justify-content: space-between; align-items: center; padding: 24rpx; border-bottom: 1rpx solid $border-color; }
.row:last-child { border-bottom: none; }
.row-title { display: block; font-size: 26rpx; color: $text; }
.row-time { display: block; font-size: 22rpx; color: $text-muted; margin-top: 4rpx; }
.row-side { text-align: right; }
.row-amount { display: block; font-size: 30rpx; font-weight: 600; color: #1dc981; }
.row-amount.neg { color: $text; }
.row-after { display: block; font-size: 22rpx; color: $text-muted; margin-top: 4rpx; }
.row-status { display: inline-block; font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 999rpx; margin-top: 6rpx; background: #fff7e8; color: #b26a00; }
.row-status.st-paid { background: #e8f9f0; color: #0a8f4c; }
.row-status.st-rejected { background: #ffece8; color: #e02020; }
.row-remark { display: block; font-size: 20rpx; color: $text-muted; margin-top: 4rpx; max-width: 240rpx; }
</style>
