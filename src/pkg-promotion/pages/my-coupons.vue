<template>
  <view class="mc-page">
    <!-- 券码兑换：输入活动/社群发放的券码，兑换后直接进当前店铺券包 -->
    <view class="mc-redeem" @tap="openRedeem">
      <text class="mc-redeem__ico">🎁</text>
      <text class="mc-redeem__txt">{{ $t('myCoupons.redeemEntry') }}</text>
      <text class="mc-redeem__arrow">›</text>
    </view>

    <view class="mc-tabs">
      <text v-for="k in TABS" :key="k.key" class="mc-tab" :class="{ on: tab === k.key }" @tap="switchTab(k.key)">
        {{ $t('myCoupons.' + k.label) }}<text class="mc-tab__n" v-if="counts[k.key]">{{ counts[k.key] }}</text>
      </text>
    </view>

    <!-- 临期提醒：未使用券中 3 天内到期的聚合提示，点击仍停留在可用券列表 -->
    <view class="mc-banner" v-if="expiringCount > 0 && tab === 'UNUSED'" @tap="tab = 'UNUSED'">
      <text class="mc-banner__ico">⏰</text>
      <text class="mc-banner__txt">{{ $t('myCoupons.expiringBanner').replace('{n}', String(expiringCount)) }}</text>
    </view>

    <scroll-view scroll-y class="mc-list">
      <view v-for="c in list" :key="c.id" class="ticket" :class="{ 'ticket--used': c.status !== 'UNUSED', 'ticket--soon': isExpiringSoon(c) }">
        <text class="ticket__soon" v-if="isExpiringSoon(c)">{{ $t('myCoupons.expiringSoon') }}</text>
        <view class="ticket__left">
          <view class="ticket__amount">
            <text class="ticket__symbol" v-if="c.template.type === 'FIXED' || c.template.type === 'FULL'">¥</text>
            <text class="ticket__num">{{ amountText(c.template) }}</text>
            <text class="ticket__unit" v-if="c.template.type === 'PERCENT'">{{ $t('myCoupons.unitPercent') }}</text>
          </view>
          <text class="ticket__cond">{{ condText(c.template) }}</text>
        </view>
        <view class="ticket__right">
          <text class="ticket__name">{{ c.template.name }}</text>
          <text class="ticket__expire" v-if="c.expiredAt">{{ $t('myCoupons.validUntil').replace('{n}', fmtDate(c.expiredAt)) }}</text>
          <text class="ticket__left-days" v-if="daysLeftText(c)">{{ daysLeftText(c) }}</text>
          <text class="ticket__state">{{ stateText(c.status) }}</text>
          <button v-if="c.status === 'UNUSED'" class="ticket__btn" @tap="useCoupon(c)">{{ $t('myCoupons.use') }}</button>
        </view>
      </view>
      <view class="empty-wrap" v-if="!loading && list.length === 0">
        <EmptyState :text="emptyText" />
      </view>

      <view class="mc-footer" v-if="tab === 'unused'" @tap="goCentre">
        <text>{{ $t('myCoupons.goCentre') }}</text>
      </view>
      <view class="scroll-pad"></view>
    </scroll-view>

    <!-- 兑换码弹层 -->
    <view class="mc-mask" v-if="redeemOpen" @tap="redeemOpen = false">
      <view class="mc-sheet" @tap.stop>
        <text class="mc-sheet__title">{{ $t('myCoupons.redeemTitle') }}</text>
        <text class="mc-sheet__hint">{{ $t('myCoupons.redeemHint') }}</text>
        <input
          class="mc-sheet__ipt"
          v-model="redeemCode"
          :placeholder="$t('myCoupons.redeemPlaceholder')"
          :maxlength="32"
          confirm-type="done"
          @confirm="doRedeem"
        />
        <text class="mc-sheet__err" v-if="redeemError">{{ redeemError }}</text>
        <view class="mc-sheet__actions">
          <view class="mc-sheet__cancel" @tap="redeemOpen = false">{{ $t('myCoupons.cancel') }}</view>
          <view class="mc-sheet__ok" :class="{ disabled: redeeming }" @tap="doRedeem">
            {{ redeeming ? $t('myCoupons.redeeming') : $t('myCoupons.redeemBtn') }}
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { getMyCoupons } from '../../api/queries/coupon';
import { redeemCouponByCode } from '../../api/mutations/coupon';
import EmptyState from '../../components/EmptyState.vue';
import { useLocaleStore } from '../../stores/locale';

// label 存 i18n 键，不存中文
const TABS = [
    { key: 'UNUSED', label: 'tabUnused' },
    { key: 'USED', label: 'tabUsed' },
    { key: 'EXPIRED', label: 'tabExpired' },
] as const;

const auth = useAuthStore();
const locale = useLocaleStore();
const tab = ref<string>('UNUSED');
const data = ref<Record<string, any[]>>({ UNUSED: [], USED: [], EXPIRED: [] });
const loading = ref(false);

// —— 券码兑换 ——
const redeemOpen = ref(false);
const redeemCode = ref('');
const redeemError = ref('');
const redeeming = ref(false);

function openRedeem() {
    redeemError.value = '';
    redeemOpen.value = true;
}

/** 后端错误原文映射为本地化提示（无法识别时沿用原文） */
function redeemErrorText(raw: string): string {
    const msg = String(raw || '');
    if (/Invalid claim code/i.test(msg)) return locale.t('myCoupons.redeemInvalid');
    if (/not available in this shop/i.test(msg)) return locale.t('myCoupons.redeemWrongShop');
    if (/already|Coupon redeemed|limit reached/i.test(msg)) return locale.t('myCoupons.redeemUsed');
    if (/sold out/i.test(msg)) return locale.t('myCoupons.redeemSoldOut');
    if (/expired/i.test(msg)) return locale.t('myCoupons.redeemExpired');
    if (/not yet started/i.test(msg)) return locale.t('myCoupons.redeemNotStarted');
    if (/disabled|not claimable/i.test(msg)) return locale.t('myCoupons.redeemDisabled');
    return msg || locale.t('myCoupons.redeemFail');
}

async function doRedeem() {
    if (redeeming.value) return;
    const code = redeemCode.value.trim().toUpperCase();
    if (!code) {
        redeemError.value = locale.t('myCoupons.redeemEmpty');
        return;
    }
    redeeming.value = true;
    redeemError.value = '';
    try {
        const res: any = await redeemCouponByCode(code);
        const coupon = res?.redeemCouponByCode;
        if (!coupon?.id) throw new Error(locale.t('myCoupons.redeemFail'));
        redeemOpen.value = false;
        redeemCode.value = '';
        // 重新拉可用券，保证新兑换的券立刻出现
        data.value.UNUSED = [];
        tab.value = 'UNUSED';
        await load('UNUSED');
        uni.showToast({ title: locale.t('myCoupons.redeemOk'), icon: 'success' });
    } catch (e: any) {
        redeemError.value = redeemErrorText(e?.response?.errors?.[0]?.message || e?.message || '');
    } finally {
        redeeming.value = false;
    }
}

const EXPIRING_WINDOW_MS = 3 * 86400000;

/** tab 计数：已加载的 tab 显示数量（未加载不显示，切过去后补齐） */
const counts = computed<Record<string, number>>(() => ({
    UNUSED: data.value.UNUSED?.length ?? 0,
    USED: data.value.USED?.length ?? 0,
    EXPIRED: data.value.EXPIRED?.length ?? 0,
}));

function expireTime(c: any): number {
    if (!c?.expiredAt) return Infinity;
    const t = new Date(c.expiredAt).getTime();
    return Number.isNaN(t) ? Infinity : t;
}

/** 未使用券 3 天内到期数量（横幅用，基于已加载的 UNUSED 列表） */
const expiringCount = computed(() => (data.value.UNUSED || []).filter((c: any) => isExpiringSoon(c)).length);

/** 剩余天数：今天到期 / 还剩 N 天；仅在未使用且有到期时间时展示 */
function daysLeftText(c: any): string {
    if (c?.status !== 'UNUSED') return '';
    const t = expireTime(c);
    if (t === Infinity || t < Date.now()) return '';
    const days = Math.ceil((t - Date.now()) / 86400000);
    return days <= 0
        ? locale.t('myCoupons.todayExpire')
        : locale.t('myCoupons.daysLeft').replace('{n}', String(days));
}

/** 未使用券按 expiredAt 升序（临期在前，无过期时间排最后）；其余 tab 保持服务端顺序 */
const list = computed(() => {
    const arr = data.value[tab.value] ?? [];
    if (tab.value !== 'UNUSED') return arr;
    return [...arr].sort((a: any, b: any) => {
        const ta = expireTime(a);
        const tb = expireTime(b);
        if (ta === tb) return 0;
        return ta < tb ? -1 : 1;
    });
});

/** 未使用且 expiredAt 在 3 天内（含当天，已过期当天仍标记） */
function isExpiringSoon(c: any): boolean {
    if (tab.value !== 'UNUSED' || c?.status !== 'UNUSED') return false;
    const t = expireTime(c);
    if (t === Infinity) return false;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return t >= startOfToday.getTime() && t - Date.now() <= EXPIRING_WINDOW_MS;
}

const emptyText = computed(() => (tab.value === 'UNUSED' ? locale.t('myCoupons.emptyUnused') : tab.value === 'USED' ? locale.t('myCoupons.emptyUsed') : locale.t('myCoupons.emptyExpired')));

function amountText(t: any): string {
    if (t.type === 'PERCENT') return (t.discountValue / 10).toFixed(1).replace(/\.0$/, '');
    if (t.type === 'FREE_SHIPPING') return locale.t('myCoupons.freeShort');
    const yuan = t.discountValue / 100;
    return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

function condText(t: any): string {
    if (t.type === 'FULL') {
        const yuan = t.minSpend / 100;
        const y = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
        return locale.t('myCoupons.condFull').replace('{n}', y);
    }
    if (t.type === 'PERCENT') return locale.t('myCoupons.condPercent');
    if (t.type === 'FREE_SHIPPING') return locale.t('myCoupons.condFreeShip');
    return locale.t('myCoupons.condNone');
}

function stateText(s: string): string {
    return s === 'USED' ? locale.t('myCoupons.stUsed') : s === 'EXPIRED' ? locale.t('myCoupons.stExpired') : '';
}

function fmtDate(s: string | null): string {
    if (!s) return '';
    const d = new Date(s);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

async function load(status: string) {
    if (data.value[status]?.length) return; // 已加载过不重复拉
    loading.value = true;
    try {
        const res = await getMyCoupons(status);
        data.value[status] = res?.myCoupons ?? [];
    } catch {
        data.value[status] = [];
    } finally {
        loading.value = false;
    }
}

function switchTab(k: string) {
    tab.value = k;
    load(k);
}

function goCentre() {
    uni.navigateTo({ url: '/pkg-promotion/pages/coupon-centre' });
}

function useCoupon(c: any) {
    // 有进行中购物车 → 预挂此券（checkout onLoad 消费预挂券）；无购物车 → 回首页
    const hasCart = !useCartStore().isEmpty;
    if (hasCart) {
        uni.setStorageSync('checkout_prefill_coupon', c.code);
    }
    uni.switchTab({ url: '/pages/home/index' });
}

onMounted(() => load('UNUSED'));
onShow(() => { data.value = { UNUSED: [], USED: [], EXPIRED: [] }; load(tab.value); }); // 每次进入刷新（领取/用券后回来状态要新）
</script>

<style lang="scss" scoped>
.mc-page { min-height: 100vh; background: #f5f5f5; display: flex; flex-direction: column; }
.mc-redeem { display: flex; align-items: center; gap: 10rpx; margin: 20rpx 24rpx 0; padding: 18rpx 24rpx; border-radius: $radius-md; background: $surface; border: 1rpx dashed #ffb37a; }
.mc-redeem__ico { font-size: 26rpx; }
.mc-redeem__txt { flex: 1; font-size: 26rpx; color: #b45309; }
.mc-redeem__arrow { font-size: 30rpx; color: #b45309; }
.mc-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); z-index: 90; display: flex; align-items: center; justify-content: center; padding: 0 48rpx; }
.mc-sheet { width: 100%; background: #fff; border-radius: 24rpx; padding: 32rpx; box-sizing: border-box; }
.mc-sheet__title { display: block; font-size: 30rpx; font-weight: bold; color: #333; }
.mc-sheet__hint { display: block; margin-top: 8rpx; font-size: 22rpx; color: #999; }
.mc-sheet__ipt { margin-top: 24rpx; height: 88rpx; padding: 0 24rpx; border-radius: 12rpx; background: #f5f5f5; font-size: 28rpx; letter-spacing: 2rpx; }
.mc-sheet__err { display: block; margin-top: 12rpx; font-size: 24rpx; color: #e02020; }
.mc-sheet__actions { display: flex; gap: 20rpx; margin-top: 28rpx; }
.mc-sheet__cancel, .mc-sheet__ok { flex: 1; text-align: center; height: 80rpx; line-height: 80rpx; border-radius: 12rpx; font-size: 28rpx; }
.mc-sheet__cancel { background: #f5f5f5; color: #666; }
.mc-sheet__ok { background: #ff6600; color: #fff; }
.mc-sheet__ok.disabled { opacity: .6; }
.mc-tabs { display: flex; background: #fff; padding: 0 32rpx; }
.mc-tab { flex: 1; text-align: center; padding: 24rpx 0; font-size: 30rpx; color: #666; &.on { color: #ff6600; font-weight: bold; border-bottom: 4rpx solid #ff6600; } }
.mc-tab__n { font-size: 22rpx; margin-left: 6rpx; color: inherit; }
.mc-banner { display: flex; align-items: center; gap: 10rpx; margin: 20rpx 24rpx 0; padding: 16rpx 24rpx; border-radius: 999rpx; background: #fff4e6; border: 1rpx solid #ffc48a; }
.mc-banner__ico { font-size: 24rpx; }
.mc-banner__txt { font-size: 24rpx; color: #b45309; }
.ticket__left-days { font-size: 22rpx; color: #ff6600; margin-top: 6rpx; }
.mc-list { flex: 1; height: 0; padding: 24rpx; box-sizing: border-box; }
.ticket { position: relative; display: flex; background: #fff; border-radius: 16rpx; margin-bottom: 24rpx; overflow: hidden; }
.ticket__soon { position: absolute; top: 12rpx; right: 12rpx; height: 32rpx; line-height: 32rpx; padding: 0 12rpx; border-radius: 16rpx; background: #ff9500; color: #fff; font-size: 20rpx; white-space: nowrap; z-index: 1; }
.ticket--soon .ticket__name { padding-right: 180rpx; }
.ticket__left { width: 220rpx; background: #ff6600; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 28rpx 0; }
.ticket--used .ticket__left { background: #ccc; }
.ticket__amount { display: flex; align-items: baseline; }
.ticket__symbol { font-size: 28rpx; }
.ticket__num { font-size: 52rpx; font-weight: bold; }
.ticket__unit { font-size: 24rpx; margin-left: 4rpx; }
.ticket__cond { font-size: 22rpx; margin-top: 8rpx; opacity: 0.9; }
.ticket__right { flex: 1; padding: 24rpx; display: flex; flex-direction: column; }
.ticket__name { font-size: 28rpx; color: #333; font-weight: bold; }
.ticket__expire { font-size: 22rpx; color: #999; margin-top: 6rpx; }
.ticket__state { font-size: 22rpx; color: #999; margin-top: 6rpx; }
.ticket__btn { margin-top: 12rpx; align-self: flex-end; background: #ff6600; color: #fff; font-size: 24rpx; padding: 0 28rpx; height: 56rpx; line-height: 56rpx; border-radius: 28rpx; }
.mc-footer { text-align: center; padding: 32rpx 0; font-size: 26rpx; color: #999; }
.empty-wrap { padding-top: 120rpx; }
.scroll-pad { height: 40rpx; }
</style>
