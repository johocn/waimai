<template>
  <view class="rc-page">
    <view v-if="loading" class="rc-loading">{{ $t('receipt.loading') }}</view>
    <view v-else-if="!order" class="rc-loading">{{ $t('receipt.notFound') }}</view>

    <template v-else>
      <view class="rc-paper">
        <text class="rc-brand">{{ shopName }}</text>
        <text class="rc-title">{{ $t('receipt.title') }}</text>
        <text class="rc-sub">{{ $t('receipt.subTitle') }}</text>

        <view class="rc-dash"></view>

        <view class="rc-row"><text>{{ $t('receipt.orderNo') }}</text><text>{{ order.code }}</text></view>
        <view class="rc-row"><text>{{ $t('receipt.orderTime') }}</text><text>{{ fmtTime(order.createdAt) }}</text></view>
        <view class="rc-row"><text>{{ $t('receipt.status') }}</text><text>{{ stateLabel }}</text></view>
        <view class="rc-row" v-if="order.customFields?.deliverySlotText"><text>{{ $t('receipt.slot') }}</text><text>{{ order.customFields.deliverySlotText }}</text></view>
        <view class="rc-row" v-if="payMethod"><text>{{ $t('receipt.payMethod') }}</text><text>{{ payMethod }}</text></view>

        <view class="rc-dash"></view>

        <view class="rc-row rc-row--head">
          <text class="rc-goods">{{ $t('receipt.goods') }}</text>
          <text class="rc-qty">{{ $t('receipt.qty') }}</text>
          <text class="rc-amount">{{ $t('receipt.amount') }}</text>
        </view>
        <view class="rc-line" v-for="l in order.lines" :key="l.id">
          <view class="rc-line__name">
            <text>{{ l.productVariant?.name }}</text>
            <text class="rc-line__spec" v-if="l.productVariant?.options?.length">{{ l.productVariant.options.map((o: any) => o.name).join(' ') }}</text>
          </view>
          <text class="rc-line__qty">×{{ l.quantity }}</text>
          <text class="rc-line__amount">¥{{ money(l.linePriceWithTax) }}</text>
        </view>

        <view class="rc-dash"></view>

        <view class="rc-row"><text>{{ $t('receipt.goodsTotal') }}</text><text>¥{{ money(order.subTotalWithTax) }}</text></view>
        <view class="rc-row"><text>{{ $t('receipt.shipping') }}</text><text>{{ order.shippingWithTax > 0 ? '¥' + money(order.shippingWithTax) : $t('receipt.freeShipping') }}</text></view>
        <view class="rc-row rc-row--disc" v-for="d in (order.discounts ?? [])" :key="d.id">
          <text>{{ d.description || $t('receipt.discount') }}</text><text>−¥{{ money(d.amountWithTax) }}</text>
        </view>
        <view class="rc-row rc-row--total"><text>{{ $t('receipt.paid') }}</text><text class="rc-total">¥{{ money(order.totalWithTax) }}</text></view>

        <view class="rc-dash" v-if="order.shippingAddress"></view>
        <view class="rc-addr" v-if="order.shippingAddress">
          <text>{{ order.shippingAddress.fullName }} {{ order.shippingAddress.phoneNumber }}</text>
          <text class="rc-addr__detail">{{ fullAddress }}</text>
        </view>

        <view class="rc-dash"></view>
        <text class="rc-thanks">{{ $t('receipt.thanks') }}</text>
        <text class="rc-foot">{{ $t('receipt.footNote') }}</text>
      </view>

      <view class="rc-ops">
        <button class="rc-btn" @tap="copyReceipt">{{ $t('receipt.copy') }}</button>
        <button class="rc-btn rc-btn--main" @tap="goBack">{{ $t('receipt.back') }}</button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getOrderByCode } from '../../api/queries/order';
import { fetchStoreList } from '../../api/queries/waimai';
import { useTenantStore } from '../../stores/tenant';
import { useLocaleStore } from '../../stores/locale';

const tenant = useTenantStore();
const locale = useLocaleStore();
const order = ref<any>(null);
const shopName = ref('');
const loading = ref(true);

onLoad(async (options: any) => {
  const code = options?.code;
  if (!code) { loading.value = false; return; }
  try {
    const [res, stores] = await Promise.all([getOrderByCode(code), fetchStoreList().catch(() => [])]);
    order.value = (res as any)?.orderByCode || null;
    const hit = (stores || []).find((s: any) => String(s.channelToken) === String(tenant.token));
    shopName.value = hit?.name || (stores && stores[0]?.name) || locale.t('receipt.defaultShop');
  } catch {
    order.value = null;
  } finally {
    loading.value = false;
  }
});

const payMethod = computed(() => {
  const method = order.value?.payments?.[0]?.method;
  if (!method) return '';
  const key = 'receipt.pay_' + String(method);
  const text = locale.t(key);
  return text === key ? String(method) : text;
});

const stateLabel = computed(() => {
  const map: Record<string, string> = {
    ArrangingPayment: 'orders.stAwaitPay',
    PaymentAuthorized: 'orders.stAwaitShip',
    PaymentSettled: 'orders.stAwaitShip',
    Shipped: 'orders.stAwaitReceive',
    Delivered: 'receipt.stDone',
    Cancelled: 'orders.stCancelled',
  };
  return locale.t(map[order.value?.state] || 'receipt.stDone');
});

const fullAddress = computed(() => {
  const a = order.value?.shippingAddress;
  if (!a) return '';
  return [a.province, a.city, a.streetLine1, a.streetLine2].filter(Boolean).join(' ');
});

function money(cents: number | string): string {
  return ((Number(cents) || 0) / 100).toFixed(2);
}

function fmtTime(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildText(): string {
  const o = order.value;
  if (!o) return '';
  const lines: string[] = [];
  const t = locale.t;
  lines.push(shopName.value);
  lines.push(t('receipt.title'));
  lines.push('--------------------------------');
  lines.push(`${t('receipt.orderNo')}: ${o.code}`);
  lines.push(`${t('receipt.orderTime')}: ${fmtTime(o.createdAt)}`);
  lines.push(`${t('receipt.status')}: ${stateLabel.value}`);
  if (o.customFields?.deliverySlotText) lines.push(`${t('receipt.slot')}: ${o.customFields.deliverySlotText}`);
  if (payMethod.value) lines.push(`${t('receipt.payMethod')}: ${payMethod.value}`);
  lines.push('--------------------------------');
  for (const l of o.lines || []) {
    const spec = l.productVariant?.options?.map((x: any) => x.name).join(' ') || '';
    lines.push(`${l.productVariant?.name || ''}${spec ? ' (' + spec + ')' : ''} ×${l.quantity}  ¥${money(l.linePriceWithTax)}`);
  }
  lines.push('--------------------------------');
  lines.push(`${t('receipt.goodsTotal')}: ¥${money(o.subTotalWithTax)}`);
  lines.push(`${t('receipt.shipping')}: ${o.shippingWithTax > 0 ? '¥' + money(o.shippingWithTax) : t('receipt.freeShipping')}`);
  for (const d of o.discounts || []) {
    lines.push(`${d.description || t('receipt.discount')}: −¥${money(d.amountWithTax)}`);
  }
  lines.push(`${t('receipt.paid')}: ¥${money(o.totalWithTax)}`);
  if (o.shippingAddress) {
    lines.push('--------------------------------');
    lines.push(`${o.shippingAddress.fullName} ${o.shippingAddress.phoneNumber || ''}`);
    lines.push(fullAddress.value);
  }
  lines.push('--------------------------------');
  lines.push(t('receipt.footNote'));
  return lines.join('\n');
}

function copyReceipt() {
  uni.setClipboardData({
    data: buildText(),
    success: () => uni.showToast({ title: locale.t('receipt.copyOk'), icon: 'none' }),
  });
}

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.redirectTo({ url: '/pages/orders/index' });
}
</script>

<style lang="scss" scoped>
.rc-page { min-height: 100vh; background: #f1eee7; padding: 24rpx 24rpx 40rpx; box-sizing: border-box; }
.rc-loading { padding: 160rpx 0; text-align: center; font-size: 26rpx; color: $text-color-placeholder; }
.rc-paper {
  background: #fffdf7; border-radius: 8rpx; padding: 44rpx 36rpx 36rpx; box-shadow: 0 8rpx 30rpx rgba(0,0,0,.06);
}
.rc-brand { display: block; text-align: center; font-size: 36rpx; font-weight: bold; letter-spacing: 2rpx; }
.rc-title { display: block; text-align: center; font-size: 26rpx; color: $text-color-secondary; margin-top: 12rpx; letter-spacing: 6rpx; }
.rc-sub { display: block; text-align: center; font-size: 20rpx; color: $text-color-placeholder; margin-top: 6rpx; }
.rc-dash { border-top: 2rpx dashed #d9d2c3; margin: 24rpx 0; }
.rc-row { display: flex; justify-content: space-between; gap: 20rpx; font-size: 24rpx; color: #5c5346; line-height: 1.9; }
.rc-row--head { font-size: 22rpx; color: #9a9080; }
.rc-goods { flex: 1; }
.rc-qty { width: 90rpx; text-align: center; }
.rc-amount { width: 130rpx; text-align: right; }
.rc-line { display: flex; align-items: flex-start; gap: 0; font-size: 24rpx; color: #3c352b; padding: 6rpx 0; }
.rc-line__name { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.rc-line__spec { font-size: 20rpx; color: #9a9080; }
.rc-line__qty { width: 90rpx; text-align: center; }
.rc-line__amount { width: 130rpx; text-align: right; }
.rc-row--disc { color: #b85c38; }
.rc-row--total { font-size: 28rpx; font-weight: bold; color: #2f2a22; }
.rc-total { font-size: 36rpx; }
.rc-strong { font-weight: bold; letter-spacing: 2rpx; }
.rc-addr { display: flex; flex-direction: column; gap: 6rpx; font-size: 24rpx; color: #3c352b; }
.rc-addr__detail { font-size: 22rpx; color: #7a7061; }
.rc-thanks { display: block; text-align: center; font-size: 26rpx; color: #5c5346; margin-top: 8rpx; }
.rc-foot { display: block; text-align: center; font-size: 20rpx; color: #9a9080; margin-top: 10rpx; }
.rc-ops { display: flex; gap: 20rpx; margin-top: 30rpx; }
.rc-btn {
  flex: 1; height: 84rpx; line-height: 84rpx; border-radius: 999rpx; font-size: 28rpx;
  background: #fff; color: #5c5346;
  &--main { background: $brand-color; color: #fff; }
}
</style>
