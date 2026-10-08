<template>
    <view class="withdraw">
        <view class="amount-card">
            <text class="ac-label">{{ $t('riderWithdraw.amountLabel') }}</text>
            <view class="ac-input-row">
                <text class="ac-yen">¥</text>
                <input class="ac-input" type="digit" v-model="amountYuan" :placeholder="$t('riderWithdraw.amountPh')" placeholder-class="ac-ph" />
            </view>
            <text class="ac-avail">{{ $t('riderWithdraw.available').replace('{n}', fmt(wallet?.available ?? 0)) }}<text class="ac-all" @tap="fillAll">{{ $t('riderWithdraw.all') }}</text></text>
        </view>

        <view class="section">
            <text class="sec-title">{{ $t('riderWithdraw.channelTitle') }}</text>
            <view class="channels">
                <view v-for="c in channels" :key="c" class="channel" :class="{ on: channel === c }" @tap="channel = c">
                    <text>{{ channelLabel(c) }}</text>
                    <text class="check" v-if="channel === c">✓</text>
                </view>
            </view>
        </view>

        <view class="section">
            <text class="sec-title">{{ $t('riderWithdraw.accountTitle') }}</text>
            <input class="account" v-model="account" :placeholder="accountPh" placeholder-class="ac-ph" />
        </view>

        <button class="submit" :disabled="!canSubmit || submitting" @tap="submit">{{ submitting ? $t('riderWithdraw.submitting') : $t('riderWithdraw.submit') }}</button>
        <text class="note">{{ $t('riderWithdraw.note') }}</text>
    </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { myRiderWallet, riderWithdraw } from '../../api/queries/wallet';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();
const wallet = ref<any>(null);
const amountYuan = ref('');
const channel = ref('支付宝');
const account = ref('');
const submitting = ref(false);
// channels 是业务值（提交给后端 riderWithdraw.channel，管理端审核可见），保持中文常量；
// 展示文案与账号输入提示走 i18n（channelLabel/accountPh）
const channels = ['支付宝', '微信'];
const channelLabel = (c: string) => locale.t(c === '支付宝' ? 'riderWithdraw.channelAlipay' : 'riderWithdraw.channelWechat');
const accountPh = computed(() => locale.t(channel.value === '支付宝' ? 'riderWithdraw.accountAlipayPh' : 'riderWithdraw.accountWechatPh'));

const canSubmit = computed(() => {
    const fen = toFen(amountYuan.value);
    return fen >= 1000 && !!channel.value && !!account.value.trim();
});

// 金额元→分：字符串按小数位直接解析，避免浮点误差（如 26.9*100=floor 2689 丢 1 分）；
// 非法输入（非数字/超 2 位小数）返回 0 使 canSubmit 为 false
function toFen(v: string) {
    const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec((v || '').trim());
    if (!m) return 0;
    return parseInt(m[1], 10) * 100 + (m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0);
}
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
    if (fen < 1000) return uni.showToast({ title: locale.t('riderWithdraw.minAmount'), icon: 'none' });
    submitting.value = true;
    try {
        await riderWithdraw({ amount: fen, channel: channel.value, account: account.value.trim() });
        uni.showToast({ title: locale.t('riderWithdraw.submitted'), icon: 'success' });
        setTimeout(() => uni.navigateBack(), 800);
    } catch (e: any) {
        const msg: string = e?.response?.errors?.[0]?.message || e?.message || locale.t('riderWithdraw.submitFail');
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
.ac-input-row { display: flex; align-items: center; gap: 12rpx; margin-top: 16rpx; border-bottom: 2rpx solid $border-color; padding-bottom: 16rpx; }
.ac-yen { font-size: 48rpx; font-weight: 700; color: $text; }
.ac-input { flex: 1; font-size: 48rpx; font-weight: 700; }
.ac-ph { color: $text-color-placeholder; font-weight: 400; }
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
