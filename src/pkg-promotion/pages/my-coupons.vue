<template>
  <view class="mc-page">
    <view class="mc-tabs">
      <text v-for="k in TABS" :key="k.key" class="mc-tab" :class="{ on: tab === k.key }" @tap="switchTab(k.key)">{{ k.label }}</text>
    </view>

    <scroll-view scroll-y class="mc-list">
      <view v-for="c in list" :key="c.id" class="ticket" :class="{ 'ticket--used': c.status !== 'UNUSED' }">
        <view class="ticket__left">
          <view class="ticket__amount">
            <text class="ticket__symbol" v-if="c.template.type === 'FIXED' || c.template.type === 'FULL'">¥</text>
            <text class="ticket__num">{{ amountText(c.template) }}</text>
            <text class="ticket__unit" v-if="c.template.type === 'PERCENT'">折</text>
          </view>
          <text class="ticket__cond">{{ condText(c.template) }}</text>
        </view>
        <view class="ticket__right">
          <text class="ticket__name">{{ c.template.name }}</text>
          <text class="ticket__expire" v-if="c.expiredAt">有效期至 {{ fmtDate(c.expiredAt) }}</text>
          <text class="ticket__state">{{ stateText(c.status) }}</text>
          <button v-if="c.status === 'UNUSED'" class="ticket__btn" @tap="useCoupon(c)">去使用</button>
        </view>
      </view>
      <view class="empty-wrap" v-if="!loading && list.length === 0">
        <EmptyState :text="emptyText" />
      </view>

      <view class="mc-footer" v-if="tab === 'unused'" @tap="goCentre">
        <text>去领券中心逛逛 →</text>
      </view>
      <view class="scroll-pad"></view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { getMyCoupons } from '../../api/queries/coupon';
import EmptyState from '../../components/EmptyState.vue';

const TABS = [
    { key: 'UNUSED', label: '未使用' },
    { key: 'USED', label: '已使用' },
    { key: 'EXPIRED', label: '已过期' },
] as const;

const auth = useAuthStore();
const tab = ref<string>('UNUSED');
const data = ref<Record<string, any[]>>({ UNUSED: [], USED: [], EXPIRED: [] });
const loading = ref(false);

const list = computed(() => data.value[tab.value] ?? []);
const emptyText = computed(() => (tab.value === 'UNUSED' ? '暂无可用优惠券' : tab.value === 'USED' ? '暂无已使用记录' : '暂无已过期优惠券'));

function amountText(t: any): string {
    if (t.type === 'PERCENT') return (t.discountValue / 10).toFixed(1).replace(/\.0$/, '');
    if (t.type === 'FREE_SHIPPING') return '免';
    const yuan = t.discountValue / 100;
    return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

function condText(t: any): string {
    if (t.type === 'FULL') {
        const yuan = t.minSpend / 100;
        const y = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
        return `满 ${y} 可用`;
    }
    if (t.type === 'PERCENT') return '折扣券';
    if (t.type === 'FREE_SHIPPING') return '免配送费';
    return '无门槛';
}

function stateText(s: string): string {
    return s === 'USED' ? '已使用' : s === 'EXPIRED' ? '已过期' : '';
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
.mc-tabs { display: flex; background: #fff; padding: 0 32rpx; }
.mc-tab { flex: 1; text-align: center; padding: 24rpx 0; font-size: 30rpx; color: #666; &.on { color: #ff6600; font-weight: bold; border-bottom: 4rpx solid #ff6600; } }
.mc-list { flex: 1; height: 0; padding: 24rpx; box-sizing: border-box; }
.ticket { display: flex; background: #fff; border-radius: 16rpx; margin-bottom: 24rpx; overflow: hidden; }
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
