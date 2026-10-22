<template>
  <view class="ic-page">
    <view v-if="!logged" class="ic-empty">
      <text class="ic-empty__ico">🔒</text>
      <text class="ic-empty__text">{{ $t('invoiceCenter.loginTip') }}</text>
      <button class="ic-empty__btn" @tap="goLogin">{{ $t('member.loginBtn') }}</button>
    </view>

    <template v-else>
      <view class="ic-tabs">
        <text class="ic-tabs__item" :class="{ on: tab === 'records' }" @tap="tab = 'records'">{{ $t('invoiceCenter.tabRecords') }}</text>
        <text class="ic-tabs__item" :class="{ on: tab === 'apply' }" @tap="switchApply">{{ $t('invoiceCenter.tabApply') }}</text>
      </view>

      <view v-if="loading" class="ic-tip">{{ $t('invoiceCenter.loading') }}</view>

      <template v-else-if="tab === 'records'">
        <view v-if="!records.length" class="ic-empty_small">{{ $t('invoiceCenter.recordsEmpty') }}</view>
        <view class="ic-card" v-for="r in records" :key="r.key">
          <view class="ic-card__head">
            <text class="ic-card__title">{{ r.title }}</text>
            <text class="ic-card__state" :class="r.tone">{{ r.stateText }}</text>
          </view>
          <view class="ic-card__row"><text>{{ $t('invoiceCenter.amount') }}</text><text class="ic-card__val">¥{{ money(r.amount) }}</text></view>
          <view class="ic-card__row" v-if="r.code"><text>{{ $t('invoiceCenter.orderNo') }}</text><text class="ic-card__val">{{ r.code }}</text></view>
          <view class="ic-card__row" v-if="r.invoiceNo"><text>{{ $t('invoiceCenter.invoiceNo') }}</text><text class="ic-card__val">{{ r.invoiceNo }}</text></view>
          <view class="ic-card__row"><text>{{ $t('invoiceCenter.date') }}</text><text class="ic-card__val">{{ fmtTime(r.date) }}</text></view>
          <view class="ic-card__row" v-if="r.email"><text>{{ $t('invoiceCenter.email') }}</text><text class="ic-card__val">{{ r.email }}</text></view>
          <view class="ic-card__ops" v-if="r.canPdf">
            <button class="ic-btn ic-btn--main" :disabled="downloadingId === r.invoiceId" @tap="openPdf(r)">
              {{ downloadingId === r.invoiceId ? $t('invoiceCenter.fetching') : $t('invoiceCenter.download') }}
            </button>
          </view>
        </view>
      </template>

      <template v-else>
        <view v-if="!applicable.length" class="ic-empty_small">{{ $t('invoiceCenter.applyEmpty') }}</view>
        <view class="ic-card" v-for="o in applicable" :key="o.id">
          <view class="ic-card__head">
            <text class="ic-card__title">{{ o.code }}</text>
            <text class="ic-card__state wait">{{ $t('invoiceCenter.canApply') }}</text>
          </view>
          <view class="ic-card__row"><text>{{ $t('invoiceCenter.shop') }}</text><text class="ic-card__val">{{ o._shopName }}</text></view>
          <view class="ic-card__row"><text>{{ $t('invoiceCenter.amount') }}</text><text class="ic-card__val">¥{{ money(o.totalWithTax) }}</text></view>
          <view class="ic-card__row"><text>{{ $t('invoiceCenter.date') }}</text><text class="ic-card__val">{{ fmtTime(o.createdAt) }}</text></view>
          <view class="ic-card__ops">
            <button class="ic-btn ic-btn--main" @tap="openApply(o)">{{ $t('invoiceCenter.applyBtn') }}</button>
          </view>
        </view>
      </template>
    </template>

    <view class="ic-mask" v-if="applyOpen" @tap="applyOpen = false">
      <view class="ic-sheet" @tap.stop>
        <view class="ic-sheet__head">
          <text class="ic-sheet__title">{{ $t('invoiceCenter.applyTitle') }}</text>
          <text class="ic-sheet__close" @tap="applyOpen = false">✕</text>
        </view>
        <text class="ic-sheet__order">{{ applyingOrder?.code }} · ¥{{ money(applyingOrder?.totalWithTax || 0) }}</text>

        <view class="ic-titles" v-if="titles.length">
          <text class="ic-sheet__label">{{ $t('invoiceCenter.pickTitle') }}</text>
          <view class="ic-title-item" v-for="(t, i) in titles" :key="i" :class="{ on: titleIdx === i }" @tap="pickTitle(i)">
            <text>{{ t.name }}</text>
            <text class="ic-title-item__meta">{{ t.type === 'company' ? $t('invoiceCenter.titleCompany') : $t('invoiceCenter.titlePersonal') }}{{ t.taxNo ? ' · ' + t.taxNo : '' }}</text>
          </view>
          <text class="ic-sheet__manage" @tap="goTitles">{{ $t('invoiceCenter.manageTitles') }}</text>
        </view>

        <template v-if="manual">
          <view class="ic-types">
            <text class="ic-type" :class="{ on: form.type === 'personal' }" @tap="form.type = 'personal'">{{ $t('invoiceCenter.titlePersonal') }}</text>
            <text class="ic-type" :class="{ on: form.type === 'company' }" @tap="form.type = 'company'">{{ $t('invoiceCenter.titleCompany') }}</text>
          </view>
          <input class="ic-sheet__ipt" v-model="form.name" :placeholder="form.type === 'company' ? $t('invoiceCenter.phCompany') : $t('invoiceCenter.phName')" />
          <input class="ic-sheet__ipt" v-if="form.type === 'company'" v-model="form.taxNo" :placeholder="$t('invoiceCenter.phTaxNo')" />
          <input class="ic-sheet__ipt" v-model="form.email" type="text" :placeholder="$t('invoiceCenter.phEmail')" />
        </template>

        <text class="ic-sheet__hint">{{ $t('invoiceCenter.applyHint') }}</text>
        <button class="ic-sheet__btn" :disabled="submitting" @tap="submitApply">
          {{ submitting ? $t('invoiceCenter.submitting') : $t('invoiceCenter.submit') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { getMyInvoices, downloadInvoicePdf, applyOrderInvoice } from '../../api/queries/invoice';
import { getOrders, getOrdersForChannel } from '../../api/queries/order';
import { getActiveCustomer } from '../../api/queries/user';
import { fetchStoreList } from '../../api/queries/waimai';
import { parseInvoiceTitles, type InvoiceTitle } from '../../utils/profile-mapping';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();
const logged = computed(() => auth.isLoggedIn);

const ELIGIBLE = ['PaymentAuthorized', 'PaymentSettled', 'Shipped', 'Delivered'];
const INVOICE_STATUS: Record<string, { key: string; tone: string }> = {
  issued: { key: 'issued', tone: 'ok' },
  pending: { key: 'pending', tone: 'wait' },
  failed: { key: 'failed', tone: 'fail' },
  voided: { key: 'voided', tone: 'off' },
  reversed: { key: 'reversed', tone: 'off' },
  partially_reversed: { key: 'partial', tone: 'off' },
};

const tab = ref<'records' | 'apply'>('records');
const loading = ref(true);
const invoices = ref<any[]>([]);
const orders = ref<any[]>([]);
const titles = ref<InvoiceTitle[]>([]);

const applyOpen = ref(false);
const applyingOrder = ref<any>(null);
const titleIdx = ref(-1);
const manual = ref(true);
const submitting = ref(false);
const downloadingId = ref('');
const form = ref<InvoiceTitle>({ type: 'personal', name: '', email: '' });

type RecordRow = {
  key: string; title: string; stateText: string; tone: string;
  amount: number; code?: string; invoiceNo?: string; email?: string;
  date?: string; pdfUrl?: string; invoiceId?: string; canPdf: boolean;
};

/** 开票记录：发票实体（插件开票）+ 已申请订单（商家线下开具）合并 */
const records = computed<RecordRow[]>(() => {
  const rows: RecordRow[] = [];
  for (const inv of invoices.value) {
    const st = INVOICE_STATUS[String(inv.status)] || { key: 'pending', tone: 'wait' };
    rows.push({
      key: 'inv-' + inv.id,
      title: inv.title || locale.t('invoiceCenter.titlePersonal'),
      stateText: locale.t('invoiceCenter.state_' + st.key),
      tone: st.tone,
      amount: Number(inv.amount) || 0,
      invoiceNo: inv.invoiceNo || '',
      email: inv.email || '',
      date: inv.issuedAt || inv.createdAt,
      pdfUrl: inv.pdfUrl || '',
      invoiceId: String(inv.id),
      canPdf: !!inv.pdfUrl || (String(inv.status) === 'issued' && !!inv.id),
    });
  }
  for (const o of orders.value) {
    if (!o?.customFields?.invoiceApplied) continue;
    let info: any = null;
    try { info = JSON.parse(o.customFields.invoiceInfo || '{}'); } catch { info = null; }
    rows.push({
      key: 'ord-' + o.id,
      title: info?.titleName || o.code,
      stateText: locale.t('invoiceCenter.state_applied'),
      tone: 'wait',
      amount: Number(o.totalWithTax) || 0,
      code: o.code,
      email: info?.email || '',
      date: o.updatedAt || o.createdAt,
      canPdf: false,
    });
  }
  return rows.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
});

const applicable = computed(() =>
  orders.value
    .filter((o) => o && ELIGIBLE.includes(o.state) && !o.customFields?.invoiceApplied)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
);

function money(cents: number | string): string {
  return ((Number(cents) || 0) / 100).toFixed(2);
}

function fmtTime(raw?: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 从订单列表/详情带入的订单号：加载完成后自动打开该单开票弹层 */
const targetCode = ref('');
onLoad((q: any) => {
  targetCode.value = String(q?.order ?? q?.code ?? '');
});

onShow(async () => {
  if (!logged.value) { loading.value = false; return; }
  loading.value = true;
  try {
    await Promise.all([loadInvoices(), loadOrders(), loadTitles()]);
  } finally {
    loading.value = false;
  }
  openTargetOrder();
});

function openTargetOrder() {
  if (!targetCode.value) return;
  const hit = orders.value.find((o: any) => String(o?.code ?? '') === targetCode.value);
  targetCode.value = '';
  if (!hit) return;
  tab.value = 'apply';
  if (ELIGIBLE.includes(String(hit.state)) && !hit?.customFields?.invoiceApplied) openApply(hit);
}

async function loadInvoices() {
  try {
    const res: any = await getMyInvoices();
    invoices.value = res?.myInvoices || [];
  } catch { invoices.value = []; }
}

async function loadTitles() {
  try {
    const res: any = await getActiveCustomer();
    titles.value = parseInvoiceTitles(res?.activeCustomer?.customFields?.invoiceTitles);
  } catch { titles.value = []; }
}

/** 订单聚合：默认渠道 + 各店铺渠道，按 id 去重 */
async function loadOrders() {
  try {
    const stores = await fetchStoreList().catch(() => []);
    const tokenMap = new Map<string, string>();
    for (const s of stores || []) {
      if (s?.channelToken) tokenMap.set(String(s.channelToken), s.name || '');
    }
    const tokens = Array.from(tokenMap.keys());
    const results = await Promise.allSettled([
      getOrders({ take: 50 }),
      ...tokens.map((t) => getOrdersForChannel(t, { take: 50 })),
    ]);
    const seen = new Set<string>();
    const merged: any[] = [];
    results.forEach((r, idx) => {
      if (r.status !== 'fulfilled') return;
      const shopName = idx === 0 ? locale.t('invoiceCenter.defaultShop') : (tokenMap.get(tokens[idx - 1]) || locale.t('invoiceCenter.defaultShop'));
      for (const o of ((r.value as any)?.myOrders?.items || [])) {
        if (!o?.id || seen.has(o.id)) continue;
        seen.add(o.id);
        merged.push({ ...o, _shopName: shopName });
      }
    });
    orders.value = merged;
  } catch { orders.value = []; }
}

function switchApply() {
  tab.value = 'apply';
  if (!orders.value.length) void loadOrders();
}

/** 发票 PDF 统一外链打开（H5 直接新窗口，小程序走 webview 页） */
function openExternal(url: string) {
  // #ifdef H5
  window.open(url, '_blank');
  return;
  // #endif
  // #ifndef H5
  uni.navigateTo({ url: '/pages/webview/index?url=' + encodeURIComponent(url) });
  // #endif
}

function openPdf(r: RecordRow) {
  if (r.pdfUrl) {
    openExternal(r.pdfUrl);
    return;
  }
  if (!r.invoiceId || downloadingId.value) return;
  downloadingId.value = r.invoiceId;
  void (async () => {
    try {
      const res: any = await downloadInvoicePdf(r.invoiceId);
      const url = res?.downloadInvoicePdf?.pdfUrl;
      if (!url) throw new Error(locale.t('invoiceCenter.pdfFail'));
      openExternal(url);
      void loadInvoices();
    } catch (e: any) {
      uni.showToast({ title: e?.message || locale.t('invoiceCenter.pdfFail'), icon: 'none' });
    } finally {
      downloadingId.value = '';
    }
  })();
}

function openApply(o: any) {
  applyingOrder.value = o;
  form.value = { type: 'personal', name: '', email: '' };
  titleIdx.value = -1;
  manual.value = true;
  if (titles.value.length) {
    pickTitle(0);
  }
  applyOpen.value = true;
}

function pickTitle(i: number) {
  titleIdx.value = i;
  const t = titles.value[i];
  if (!t) return;
  manual.value = false;
  form.value = { ...t };
}

async function submitApply() {
  if (submitting.value || !applyingOrder.value) return;
  const f = form.value;
  if (!f.name.trim()) {
    uni.showToast({ title: locale.t('invoiceCenter.needName'), icon: 'none' });
    return;
  }
  if (f.type === 'company' && !f.taxNo?.trim()) {
    uni.showToast({ title: locale.t('invoiceCenter.needTaxNo'), icon: 'none' });
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email || '')) {
    uni.showToast({ title: locale.t('invoiceCenter.needEmail'), icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    const snapshot = {
      titleName: f.name.trim(),
      titleType: f.type,
      taxNo: f.taxNo?.trim() || '',
      email: f.email.trim(),
      appliedAt: new Date().toISOString(),
    };
    await applyOrderInvoice(String(applyingOrder.value.id), JSON.stringify(snapshot));
    uni.showToast({ title: locale.t('invoiceCenter.applyOk'), icon: 'success' });
    applyOpen.value = false;
    await loadOrders();
    tab.value = 'records';
  } catch (e: any) {
    const msg = String(e?.message || '');
    uni.showToast({
      title: msg.includes('ALREADY_APPLIED') ? locale.t('invoiceCenter.alreadyApplied') : (msg || locale.t('invoiceCenter.applyFail')),
      icon: 'none',
    });
  } finally {
    submitting.value = false;
  }
}

function goTitles() { uni.navigateTo({ url: '/pkg-user/pages/invoice-titles' }); }
function goLogin() { auth.requireLogin(); }
</script>

<style lang="scss" scoped>
.ic-page { min-height: 100vh; background: $bg-color; padding: 20rpx; box-sizing: border-box; }
.ic-empty {
  min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20rpx;
  &__ico { font-size: 80rpx; }
  &__text { font-size: 28rpx; color: $text-color-placeholder; }
  &__btn { margin-top: 20rpx; background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 28rpx; padding: 0 60rpx; height: 76rpx; line-height: 76rpx; }
}
.ic-empty_small { padding: 100rpx 0; text-align: center; font-size: 26rpx; color: $text-color-placeholder; }
.ic-tabs {
  display: flex; gap: 40rpx; padding: 10rpx 10rpx 20rpx;
  &__item { font-size: 30rpx; color: $text-color-secondary; padding-bottom: 10rpx; &.on { color: $text-color; font-weight: bold; border-bottom: 6rpx solid $brand-color; } }
}
.ic-tip { padding: 100rpx 0; text-align: center; font-size: 26rpx; color: $text-color-placeholder; }
.ic-card {
  background: $surface; border-radius: $radius-md; padding: 26rpx; margin-bottom: 18rpx;
  &__head { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; margin-bottom: 14rpx; }
  &__title { font-size: 28rpx; font-weight: bold; flex: 1; min-width: 0; }
  &__state { font-size: 24rpx; flex-shrink: 0; &.ok { color: #1f9d55; } &.wait { color: $brand-color; } &.fail { color: #e8463a; } &.off { color: $text-color-placeholder; } }
  &__row { display: flex; justify-content: space-between; gap: 20rpx; font-size: 24rpx; color: $text-color-secondary; padding: 6rpx 0; }
  &__val { color: $text-color; text-align: right; word-break: break-all; }
  &__ops { display: flex; justify-content: flex-end; margin-top: 16rpx; }
}
.ic-btn {
  height: 64rpx; line-height: 64rpx; padding: 0 36rpx; border-radius: 999rpx; font-size: 26rpx;
  &--main { background: $brand-color; color: #fff; }
  &[disabled] { opacity: .5; }
}
.ic-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: flex-end; z-index: 20; }
.ic-sheet {
  width: 100%; background: $surface; border-radius: 24rpx 24rpx 0 0; padding: 36rpx 30rpx calc(36rpx + env(safe-area-inset-bottom));
  max-height: 88vh; overflow-y: auto;
  &__head { display: flex; align-items: center; justify-content: space-between; }
  &__title { font-size: 32rpx; font-weight: bold; }
  &__close { font-size: 32rpx; color: $text-color-placeholder; padding: 0 10rpx; }
  &__order { display: block; font-size: 24rpx; color: $text-color-secondary; margin: 12rpx 0 20rpx; }
  &__label { display: block; font-size: 24rpx; color: $text-color-secondary; margin-bottom: 12rpx; }
  &__manage { display: block; font-size: 24rpx; color: #3b7ddd; margin: 14rpx 0 6rpx; }
  &__ipt { height: 88rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; margin-top: 8rpx; }
  &__hint { display: block; font-size: 22rpx; color: $text-color-placeholder; margin: 22rpx 0 26rpx; }
  &__btn { height: 88rpx; line-height: 88rpx; background: $brand-color; color: #fff; border-radius: $radius-md; font-size: 30rpx; &[disabled] { opacity: .5; } }
}
.ic-title-item {
  border: 2rpx solid $border-color; border-radius: $radius-md; padding: 18rpx 22rpx; margin-bottom: 14rpx; display: flex; flex-direction: column; gap: 6rpx;
  &.on { border-color: $brand-color; background: $brand-soft; }
  &__meta { font-size: 22rpx; color: $text-color-placeholder; }
}
.ic-types { display: flex; gap: 20rpx; margin: 6rpx 0 16rpx; }
.ic-type { font-size: 26rpx; padding: 10rpx 36rpx; border-radius: 999rpx; background: $bg-color; color: $text-color-secondary; &.on { background: $brand-soft; color: $brand-color; } }
</style>
