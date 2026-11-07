<template>
    <view class="wallet">
        <view class="balance-card">
            <text class="bc-label">{{ $t('riderWallet.availableLabel') }}</text>
            <text class="bc-amount">{{ wallet ? '¥' + fmt(wallet.available) : '--' }}</text>
            <view class="bc-subs">
                <view class="bc-sub">
                    <text class="bc-sub-num">{{ wallet ? '¥' + fmt(wallet.frozen) : '--' }}</text>
                    <text class="bc-sub-label">{{ $t('riderWallet.frozen') }}</text>
                </view>
                <view class="bc-sub">
                    <text class="bc-sub-num">{{ wallet ? '¥' + fmt(wallet.totalEarned) : '--' }}</text>
                    <text class="bc-sub-label">{{ $t('riderWallet.totalEarned') }}</text>
                </view>
            </view>
            <button class="bc-btn" :disabled="!wallet || wallet.available < 1000" @tap="goWithdraw">{{ $t('riderWallet.withdraw') }}</button>
            <text class="bc-tip" v-if="wallet && wallet.available < 1000">{{ $t('riderWallet.minTip') }}</text>
        </view>

        <!-- 钱包加载失败：明确提示 + 重试，不把失败显示成余额 0 -->
        <view class="load-err" v-if="walletError">
            <text class="le-txt">{{ walletError }}</text>
            <text class="le-retry" @tap="retryAll">{{ $t('riderWallet.retry') }}</text>
        </view>

        <view class="tabs">
            <text class="tab" :class="{ on: tab === 'history' }" @tap="switchTab('history')">{{ $t('riderWallet.tabHistory') }}</text>
            <text class="tab" :class="{ on: tab === 'withdraw' }" @tap="switchTab('withdraw')">{{ $t('riderWallet.tabWithdraw') }}</text>
        </view>

        <!-- 列表加载失败：与“确实没有流水/申请”区分 -->
        <view class="load-err" v-if="listError">
            <text class="le-txt">{{ listError }}</text>
            <text class="le-retry" @tap="loadMore">{{ $t('riderWallet.retry') }}</text>
        </view>

        <template v-if="tab === 'history'">
            <EmptyState v-if="!history.length && !listError" :text="$t('riderWallet.emptyHistory')" />
            <view v-else-if="history.length" class="list">
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
            <EmptyState v-if="!withdraws.length && !listError" :text="$t('riderWallet.emptyWithdraw')" />
            <view v-else-if="withdraws.length" class="list">
                <view v-for="r in withdraws" :key="r.id" class="row">
                    <view class="row-main">
                        <text class="row-title">{{ $t('riderWallet.withdrawTo').replace('{c}', r.channel) }}</text>
                        <text class="row-time">{{ fmtTime(r.createdAt) }}<text v-if="r.reviewedAt"> · {{ $t('riderWallet.reviewed') }} {{ fmtTime(r.reviewedAt) }}</text></text>
                    </view>
                    <view class="row-side">
                        <text class="row-amount neg">-¥{{ fmt(r.amount) }}</text>
                        <text class="row-status" :class="'st-' + r.status?.toLowerCase()">{{ statusLabel(r.status) }}</text>
                        <text class="row-remark" v-if="r.status === 'REJECTED' && r.remark">{{ r.remark }}</text>
                        <text class="row-remark" v-if="r.status === 'PAID' && r.payoutRef">{{ $t('riderWallet.payoutRef').replace('{ref}', r.payoutRef) }}</text>
                    </view>
                </view>
            </view>
        </template>
    </view>
</template>

<script setup lang="ts">
import { fmtUser } from '../../utils/datetime';
import { ref } from 'vue';
import { onShow, onReachBottom } from '@dcloudio/uni-app';
import { myRiderWallet, riderBalanceHistory, riderWithdrawRequests } from '../../api/queries/wallet';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';
import EmptyState from '../../components/EmptyState.vue';

const auth = useAuthStore();
const locale = useLocaleStore();
const wallet = ref<any>(null);
const walletError = ref('');
const listError = ref('');
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
    return fmtUser(v, 'datetime');
}

function switchTab(t: 'history' | 'withdraw') {
    tab.value = t;
    // 切到提现记录时首屏主动加载（该列表不随 onShow 初始化）
    if (t === 'withdraw' && !withdraws.value.length && !withdrawDone.value) void loadMore();
}

async function loadMore() {
    if (tab.value === 'history') {
        if (historyDone.value) return;
        try {
            const rows = await riderBalanceHistory(history.value.length, PAGE);
            history.value.push(...rows);
            historyDone.value = rows.length < PAGE;
            listError.value = '';
        } catch {
            // 失败不能伪装成“没有更多流水”
            listError.value = locale.t('riderWallet.loadFail');
        }
    } else {
        if (withdrawDone.value) return;
        try {
            const rows = await riderWithdrawRequests(withdraws.value.length, PAGE);
            withdraws.value.push(...rows);
            withdrawDone.value = rows.length < PAGE;
            listError.value = '';
        } catch {
            listError.value = locale.t('riderWallet.loadFail');
        }
    }
}

async function loadWallet() {
    try {
        wallet.value = await myRiderWallet();
        walletError.value = '';
    } catch {
        // 失败时余额显示 -- 而不是 ¥0.00
        wallet.value = null;
        walletError.value = locale.t('riderWallet.loadFail');
    }
}

async function retryAll() {
    await loadWallet();
    listError.value = '';
    await loadMore();
}

onShow(async () => {
    if (!auth.token) {
        return uni.redirectTo({ url: '/pages/login/index?redirect=' + encodeURIComponent('/pkg-rider/pages/rider-wallet') });
    }
    history.value = [];
    withdraws.value = [];
    historyDone.value = false;
    withdrawDone.value = false;
    listError.value = '';
    await loadWallet();
    await loadMore();
});

onReachBottom(loadMore);
</script>

<style scoped lang="scss">
.wallet { padding: 24rpx; }
.load-err { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin-top: 20rpx; padding: 20rpx 24rpx; border-radius: $radius-card; background: #fdf3e0; }
.le-txt { flex: 1; font-size: 24rpx; color: #b45309; }
.le-retry { font-size: 24rpx; color: $brand-color; font-weight: 600; padding: 4rpx 8rpx; }
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
