<template>
    <view class="withdraw">
        <view class="amount-card">
            <text class="ac-label">提现金额（元）</text>
            <view class="ac-input-row">
                <text class="ac-yen">¥</text>
                <input class="ac-input" type="digit" v-model="amountYuan" placeholder="最低 10.00" placeholder-class="ac-ph" />
            </view>
            <text class="ac-avail">可提现 ¥{{ fmt(wallet?.available ?? 0) }}<text class="ac-all" @tap="fillAll">全部提现</text></text>
        </view>

        <view class="section">
            <text class="sec-title">收款渠道</text>
            <view class="channels">
                <view v-for="c in channels" :key="c" class="channel" :class="{ on: channel === c }" @tap="channel = c">
                    <text>{{ c }}</text>
                    <text class="check" v-if="channel === c">✓</text>
                </view>
            </view>
        </view>

        <view class="section">
            <text class="sec-title">收款账号</text>
            <input class="account" v-model="account" :placeholder="channel === '支付宝' ? '支付宝账号 / 手机号' : '微信号 / 手机号'" placeholder-class="ac-ph" />
        </view>

        <button class="submit" :disabled="!canSubmit || submitting" @tap="submit">{{ submitting ? '提交中…' : '提交申请' }}</button>
        <text class="note">提交后余额即冻结，审核通过后打款；驳回自动退回余额</text>
    </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { myRiderWallet, riderWithdraw } from '../../api/queries/wallet';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const wallet = ref<any>(null);
const amountYuan = ref('');
const channel = ref('支付宝');
const account = ref('');
const submitting = ref(false);
const channels = ['支付宝', '微信'];

const canSubmit = computed(() => {
    const fen = toFen(amountYuan.value);
    return fen >= 1000 && !!channel.value && !!account.value.trim();
});

function toFen(v: string) { return Math.floor(parseFloat(v || '0') * 100) || 0; }
function fmt(fen: number) { return ((fen ?? 0) / 100).toFixed(2); }

function fillAll() {
    amountYuan.value = fmt(wallet.value?.available ?? 0);
}

onShow(async () => {
    if (!auth.token) {
        return uni.redirectTo({ url: '/pages/login/index?redirect=' + encodeURIComponent('/pkg-rider/pages/rider-withdraw') });
    }
    wallet.value = await myRiderWallet().catch(() => null);
});

async function submit() {
    const fen = toFen(amountYuan.value);
    if (fen < 1000) return uni.showToast({ title: '最低提现 ¥10', icon: 'none' });
    submitting.value = true;
    try {
        await riderWithdraw({ amount: fen, channel: channel.value, account: account.value.trim() });
        uni.showToast({ title: '申请已提交，等待审核', icon: 'success' });
        setTimeout(() => uni.navigateBack(), 800);
    } catch (e: any) {
        const msg: string = e?.response?.errors?.[0]?.message || e?.message || '提交失败，请重试';
        uni.showToast({ title: msg.slice(0, 40), icon: 'none' });
    } finally {
        submitting.value = false;
    }
}
</script>

<style scoped lang="scss">
.withdraw { padding: 24rpx; }
.amount-card { background: $surface; border-radius: $radius-card; padding: 32rpx; }
.ac-label { display: block; font-size: 26rpx; color: $text-muted; }
.ac-input-row { display: flex; align-items: center; gap: 12rpx; margin-top: 16rpx; border-bottom: 2rpx solid #eee; padding-bottom: 16rpx; }
.ac-yen { font-size: 48rpx; font-weight: 700; color: $text; }
.ac-input { flex: 1; font-size: 48rpx; font-weight: 700; }
.ac-ph { color: #ccc; font-weight: 400; }
.ac-avail { display: block; font-size: 24rpx; color: $text-muted; margin-top: 16rpx; }
.ac-all { color: $brand-color; margin-left: 16rpx; }
.section { margin-top: 32rpx; }
.sec-title { display: block; font-size: 26rpx; color: $text-muted; margin-bottom: 16rpx; }
.channels { display: flex; gap: 20rpx; }
.channel { flex: 1; display: flex; justify-content: space-between; align-items: center; background: $surface; border: 2rpx solid transparent; border-radius: $radius-card; padding: 28rpx 24rpx; font-size: 28rpx; }
.channel.on { border-color: $brand-color; color: $brand-color; font-weight: 600; }
.check { color: $brand-color; font-weight: 700; }
.account { background: $surface; border-radius: $radius-card; padding: 28rpx 24rpx; font-size: 28rpx; }
.submit { margin-top: 48rpx; background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 30rpx; font-weight: 600; }
.submit[disabled] { opacity: .5; }
.note { display: block; text-align: center; font-size: 22rpx; color: $text-muted; margin-top: 24rpx; }
</style>
