<template>
  <view class="cart-page">
    <view v-if="loading && !groups.length" class="cart-empty">
      <text class="cart-empty__ico">🛒</text>
      <text class="cart-empty__text">{{ $t('cart.loading') }}</text>
    </view>

    <view v-else-if="!groups.length" class="cart-empty">
      <text class="cart-empty__ico">🛒</text>
      <text class="cart-empty__text">{{ $t('cart.empty') }}</text>
      <button class="cart-empty__btn" @click="goHome">{{ $t('cart.goHome') }}</button>
    </view>

    <view v-else class="cart-list">
      <view class="cart-card" v-for="g in groups" :key="g.token">
        <view class="cart-card__head" @click="enterStore(g)">
          <view class="cart-card__store">
            <image v-if="g.logo" class="cart-card__logo" :src="g.logo" mode="aspectFill" />
            <view v-else class="cart-card__logo cart-card__logo--txt">{{ (g.name || '?').slice(0, 1) }}</view>
            <view class="cart-card__meta">
              <text class="cart-card__name">{{ g.name }}</text>
              <text class="cart-card__sub">{{ $t('cart.itemsCount').replace('{n}', String(g.order.totalQuantity || g.order.lines.length)) }}</text>
            </view>
          </view>
          <view class="cart-card__head-right">
            <text v-if="invalidCount(g) > 0" class="cart-card__clean" @click.stop="cleanInvalid(g)">{{ $t('cart.cleanInvalid').replace('{n}', String(invalidCount(g))) }}</text>
            <text v-if="closedText(g)" class="cart-card__closed">{{ closedTag(g) }}</text>
            <text class="cart-card__clear" @click.stop="clearGroup(g)">{{ $t('cart.clear') }}</text>
          </view>
        </view>

        <view class="cart-line" v-for="l in g.order.lines" :key="l.id" :class="{ 'cart-line--invalid': !!lineIssue(l, g) }">
          <VImage :src="l.featuredAsset?.preview" width="96rpx" height="96rpx" class="cart-line__img" />
          <view class="cart-line__body">
            <view class="cart-line__title">
              <text class="cart-line__name">{{ l.productVariant?.name }}</text>
              <text v-if="lineIssueText(l, g)" class="cart-line__badge">{{ lineIssueText(l, g) }}</text>
            </view>
            <text v-if="optionsText(l)" class="cart-line__opt">{{ optionsText(l) }}</text>
            <view class="cart-line__foot">
              <view class="cart-line__prices">
                <text class="cart-line__price">¥{{ fen(l.linePriceWithTax ?? l.unitPriceWithTax * l.quantity) }}</text>
                <text v-if="lineIssue(l, g) === 'priceChanged'" class="cart-line__old">{{ $t('cart.oldPrice').replace('{d}', fen(prevPriceOf(l, g) * l.quantity)) }}</text>
              </view>
              <view v-if="!lineIssue(l, g)" class="cart-line__ops">
                <text class="cart-line__step" :class="{ busy: busyKey === g.token + ':' + l.id }" @click.stop="decLine(g, l)">−</text>
                <text class="cart-line__qty">{{ l.quantity }}</text>
                <text class="cart-line__step" :class="{ busy: busyKey === g.token + ':' + l.id }" @click.stop="incLine(g, l)">＋</text>
                <text class="cart-line__rm" @click.stop="removeLine(g, l)">🗑</text>
              </view>
              <text v-else class="cart-line__qty">×{{ l.quantity }}</text>
            </view>
          </view>
        </view>

        <!-- 阶梯满减：全部档位 + 已达成/下一档差额 -->
        <view class="cart-tiers" v-if="tiersOf(g).length">
          <view v-for="t in tiersOf(g)" :key="'ct-' + t.thresholdFen" class="cart-tier" :class="{ hit: t.reached, next: t.next }">
            <text>{{ $t('menu.tierLabel').replace('{t}', tierYuan(t.thresholdFen)).replace('{d}', tierYuan(t.discountFen)) }}</text>
            <text v-if="t.next && t.gapFen > 0" class="cart-tier__gap">{{ $t('menu.tierGap').replace('{d}', tierYuan(t.gapFen)) }}</text>
          </view>
        </view>

        <!-- 凑单进度：仅免配送费门槛用进度条（起送差额已在下方金额行展示） -->
        <view class="cart-progress" v-if="progress(g) && !gapFen(g)">
          <view class="cart-progress__bar"><view class="cart-progress__fill" :style="{ width: progress(g).pct + '%' }"></view></view>
          <text class="cart-progress__txt" :class="{ ok: progress(g).ok }">{{ progress(g).text }}</text>
        </view>

        <!-- 智能凑单推荐：未达起送/满减/免运费门槛时，推荐店内低价商品一键加购 -->
        <view class="cart-recs" v-if="recState(g).items.length">
          <view class="cart-recs__head">
            <text class="cart-recs__title">{{ $t('cart.recTitle') }}</text>
            <text class="cart-recs__hint">{{ recState(g).hint }}</text>
          </view>
          <scroll-view scroll-x class="cart-recs__row">
            <view
              v-for="it in recState(g).items"
              :key="'rec-' + it.p.id"
              class="rec-item"
              @click.stop="onRecTap(g, it)"
            >
              <VImage :src="it.p.featuredAsset?.preview" width="112rpx" height="112rpx" class="rec-item__img" />
              <text class="rec-item__name">{{ it.p.name }}</text>
              <text v-if="recVariantCount(g, it) > 1" class="rec-item__badge">{{ $t('cart.recSpecBadge') }}</text>
              <view class="rec-item__foot">
                <text class="rec-item__price">¥{{ fen(it.price) }}</text>
                <text class="rec-item__add" :class="{ busy: recBusy === g.token + ':' + it.v.id }">+</text>
              </view>
            </view>
          </scroll-view>
        </view>

        <!-- 加价购好券：券费随单支付，挂到本店 activeOrder 上 -->
        <view class="cart-addons" v-if="addonTemplates(g).length">
          <view class="cart-addons__head">
            <text class="cart-addons__title">{{ $t('cart.addonTitle') }}</text>
            <text class="cart-addons__tip">{{ $t('cart.addonTip') }}</text>
          </view>
          <view class="cart-addons__list">
            <view v-for="t in addonTemplates(g)" :key="'addon-' + t.id" class="addon-chip"
              :class="{ on: isAttached(g, t), busy: addonBusy === g.token + ':' + t.id }" @click.stop="toggleAddon(g, t)">
              <text class="addon-chip__amt">{{ addonAmount(t) }}</text>
              <text class="addon-chip__price">¥{{ fen(t.salePrice) }}</text>
              <text class="addon-chip__state" v-if="isAttached(g, t)">✓</text>
            </view>
          </view>
          <text v-if="attachedCount(g) > 0" class="cart-addons__sum">{{ $t('cart.addonAttached').replace('{n}', String(attachedCount(g))).replace('{d}', fen(attachedSum(g))) }}</text>
        </view>

        <view class="cart-card__foot">
          <view class="cart-card__sum">
            <text class="cart-card__total">¥{{ fen(g.order.subTotalWithTax) }}</text>
            <text class="cart-card__gap" v-if="gapFen(g) > 0">{{ $t('cart.minGap').replace('{d}', yuan(gapFen(g))) }}</text>
            <text class="cart-card__gap cart-card__gap--ok" v-else>{{ $t('cart.minReached') }}</text>
          </view>
          <view class="cart-card__btns">
            <view class="cart-btn cart-btn--ghost" @click="enterStore(g)">{{ gapFen(g) > 0 ? $t('cart.topUp') : $t('cart.addMore') }}</view>
            <view class="cart-btn cart-btn--primary" :class="{ disabled: !!closedText(g) || invalidCount(g) > 0 }" @click="goCheckout(g)">{{ closedText(g) ? $t('cart.closedBtn') : $t('cart.checkout') }}</view>
          </view>
        </view>
      </view>
    </view>

    <!-- 凑单推荐规格弹层：多规格商品先选规格再加购 -->
    <view class="rec-mask" v-if="recPick" @click="recPick = null">
      <view class="rec-sheet" @click.stop>
        <view class="rec-sheet__head">
          <text class="rec-sheet__title">{{ recPick.item.p.name }}</text>
          <text class="rec-sheet__close" @click="recPick = null">✕</text>
        </view>
        <text class="rec-sheet__hint">{{ recPick.hint }}</text>
        <view class="rec-sheet__list">
          <view
            v-for="v in recPick.options"
            :key="'rvo-' + v.id"
            class="rec-opt"
            :class="{ on: recPick.variantId === String(v.id) }"
            @click="recPick.variantId = String(v.id)"
          >
            <text class="rec-opt__name">{{ variantLabel(v) }}</text>
            <text class="rec-opt__stock">{{ $t('cart.recSpecStock').replace('{n}', String(v.stockLevel ?? '')) }}</text>
            <text class="rec-opt__price">¥{{ fen(v.priceWithTax) }}</text>
          </view>
        </view>
        <button class="rec-sheet__btn" :disabled="!!recBusy" @click="confirmRec">
          {{ recBusy ? $t('cart.recSpecAdding') : $t('cart.recSpecConfirm') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow, onUnload } from '@dcloudio/uni-app';
import { fetchStoreList, fetchProductListForChannel } from '../../api/queries/waimai';
import { getActiveOrderForChannel } from '../../api/queries/order';
import { adjustOrderLineForChannel, removeAllOrderLinesForChannel, removeOrderLineForChannel, addItemToOrderInChannel } from '../../api/mutations/cart';
import {
  getCouponSaleCatalogueInChannel,
  getMyCouponSaleOrdersInChannel,
  attachCouponToOrderInChannel,
  detachCouponFromOrderInChannel,
} from '../../api/queries/couponSale';
import { useTenantStore } from '../../stores/tenant';
import { useCartStore } from '../../stores/cart';
import { useAuthStore } from '../../stores/auth';
import { getSessionToken } from '../../api/client';
import { useLocaleStore } from '../../stores/locale';
import { getStoreStatus } from '../../utils/store-status';
import { promoTiers, yuan as promoYuan } from '../../utils/promo';
import { lineIssueOf, isRemovableIssue, linePriceFen, readLinePrices, writeLinePrices, type CartLineIssue, type PriceMap } from '../../utils/cart-inspect';
import VImage from '../../components/VImage.vue';

const tenant = useTenantStore();
const cart = useCartStore();
const authStore = useAuthStore();
const locale = useLocaleStore();

interface CartGroup {
  token: string;
  channelId?: string;
  name: string;
  logo?: string;
  routes: string;
  minOrder?: number | null;
  deliveryFee?: number | null;
  freeShipping?: number | null;
  businessHours?: string | null;
  promoText?: string;
  order: any;
}

const groups = ref<CartGroup[]>([]);
const loading = ref(false);
/** 推荐加载去重键：店铺集合变化才重新拉商品（避免每次加购都请求商品目录） */
let lastRecToken = '';
/** 上次打开购物车时的单价快照（token:variantId → 分），仅用于变价提示 */
const prevPrices = ref<PriceMap>({});

/** 每个店铺的加价购目录与已挂券单 */
interface GroupAddons {
  templates: any[];
  attached: any[];
}
const addons = ref<Record<string, GroupAddons>>({});
const addonBusy = ref('');

function addonTemplates(g: CartGroup): any[] {
  return addons.value[g.token]?.templates || [];
}

function isAttached(g: CartGroup, t: any): boolean {
  return (addons.value[g.token]?.attached || []).some((o: any) => String(o.templateId) === String(t.id));
}

function attachedCount(g: CartGroup): number {
  return (addons.value[g.token]?.attached || []).length;
}

function attachedSum(g: CartGroup): number {
  return (addons.value[g.token]?.attached || []).reduce((s: number, o: any) => s + Number(o.amount || 0), 0);
}

function addonAmount(t: any): string {
  if (t?.type === 'PERCENT') return (t.discountValue / 10).toFixed(1).replace(/\.0$/, '') + locale.t('cart.addonUnitPercent');
  if (t?.type === 'FREE_SHIPPING') return locale.t('cart.addonFree');
  const yuan = Number(t?.discountValue || 0) / 100;
  return '¥' + (Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2)) + locale.t('cart.addonCouponSuffix');
}

async function loadAddons() {
  if (!authStore.isLoggedIn || !groups.value.length) {
    addons.value = {};
    return;
  }
  const entries = await Promise.all(
    groups.value.map(async (g) => {
      const state = await fetchAddonState(g);
      return [g.token, state] as const;
    }),
  );
  const next: Record<string, GroupAddons> = {};
  for (const [token, state] of entries) next[token] = state;
  addons.value = next;
}

async function fetchAddonState(g: CartGroup): Promise<GroupAddons> {
  const [catRes, orderRes] = await Promise.allSettled([
    getCouponSaleCatalogueInChannel(g.token),
    getMyCouponSaleOrdersInChannel(g.token),
  ]);
  const templates = catRes.status === 'fulfilled' ? (catRes.value?.templates || []) : (addons.value[g.token]?.templates || []);
  const saleOrders = orderRes.status === 'fulfilled' ? (orderRes.value || []) : [];
  const attached = saleOrders.filter(
    (o: any) => o?.payMode === 'ORDER_SURCHARGE' && o?.status === 'PENDING' && String(o.orderId) === String(g.order?.id),
  );
  return { templates, attached };
}

async function toggleAddon(g: CartGroup, t: any) {
  if (addonBusy.value) return;
  if (!authStore.requireLogin('/pkg-order/pages/cart')) return;
  const key = `${g.token}:${t.id}`;
  addonBusy.value = key;
  try {
    if (isAttached(g, t)) {
      await detachCouponFromOrderInChannel(g.token, g.order.id, String(t.id));
      uni.showToast({ title: locale.t('cart.addonDetachOk'), icon: 'none' });
    } else {
      await attachCouponToOrderInChannel(g.token, g.order.id, String(t.id));
      uni.showToast({ title: locale.t('cart.addonAttachOk'), icon: 'none' });
    }
    const fresh: any = await getActiveOrderForChannel(g.token);
    if (fresh?.activeOrder?.id) applyOrder(g, fresh.activeOrder);
    const state = await fetchAddonState(g);
    addons.value = { ...addons.value, [g.token]: state };
  } catch (e: any) {
    const msg = String(e?.response?.errors?.[0]?.message || e?.message || '');
    if (/already attached/i.test(msg)) {
      await loadAddons();
      uni.showToast({ title: locale.t('cart.addonAlready'), icon: 'none' });
    } else if (/not saleable|not available/i.test(msg)) {
      uni.showToast({ title: locale.t('cart.addonNotSaleable'), icon: 'none' });
    } else {
      uni.showToast({ title: locale.t('cart.addonFail'), icon: 'none' });
    }
  } finally {
    addonBusy.value = '';
  }
}

onShow(() => {
  prevPrices.value = readLinePrices();
  void load();
});
onUnload(() => { void tenant.backToDefault(); });

// ── 智能凑单推荐：按差额门槛（起送 > 满减下一档 > 免运费）推荐店内低价商品 ──
/** 推荐项按「商品」聚合：vars 为该商品全部可售规格（价格升序），v/price 为其中未加购的最低价规格 */
interface RecItem { p: any; vars: any[]; v: any; price: number }
interface RecState { items: RecItem[]; hint: string }
interface RecPick { token: string; hint: string; item: RecItem; options: any[]; variantId: string }
const recs = ref<Record<string, RecState>>({});
const recBusy = ref('');
const recPick = ref<RecPick | null>(null);
function recState(g: CartGroup): RecState {
  return recs.value[g.token] || { items: [], hint: '' };
}
/** 该商品还有多少规格未在购物车中（>1 时先弹规格选择） */
function recVariantCount(g: CartGroup, it: RecItem): number {
  const inCart = new Set((g.order?.lines ?? []).map((l: any) => String(l?.productVariant?.id ?? '')));
  return it.vars.filter((v: any) => !inCart.has(String(v.id))).length;
}
function variantLabel(v: any): string {
  const opts = (v?.options ?? []).map((o: any) => o?.name).filter(Boolean);
  return opts.length ? opts.join(' / ') : String(v?.name ?? '');
}
/** 判断规格可售：上架、有库存、价格有效 */
function saleableVariant(v: any): boolean {
  return v?.enabled !== false && Number(v?.stockLevel) > 0 && Number(v?.priceWithTax) > 0;
}
function recGap(g: CartGroup): { fen: number; kind: 'min' | 'tier' | 'ship'; tier?: any } | null {
  const minFen = gapFen(g);
  if (minFen > 0) return { fen: minFen, kind: 'min' };
  const next = tiersOf(g).find((t: any) => t.next && Number(t.gapFen) > 0);
  if (next) return { fen: Number(next.gapFen), kind: 'tier', tier: next };
  const free = Number(g.freeShipping);
  if (Number.isFinite(free) && free > 0) {
    const d = Math.max(0, Math.round(free) - Number(g.order?.subTotalWithTax || 0));
    if (d > 0) return { fen: d, kind: 'ship' };
  }
  return null;
}
function recHint(g: CartGroup, gap: { fen: number; kind: string; tier?: any }): string {
  if (gap.kind === 'min') return locale.t('cart.recHintMin').replace('{d}', yuan(gap.fen));
  if (gap.kind === 'tier') return locale.t('cart.recHintTier').replace('{t}', tierYuan(gap.tier.thresholdFen)).replace('{d}', yuan(gap.fen));
  return locale.t('cart.recHintShip').replace('{d}', yuan(gap.fen));
}
async function loadRecs() {
  if (!groups.value.length) { recs.value = {}; return; }
  const entries = await Promise.all(groups.value.map(async (g) => {
    const gap = recGap(g);
    if (!gap) return [g.token, { items: [], hint: '' }] as const;
    try {
      const products = await fetchProductListForChannel(g.token);
      const inCart = new Set((g.order?.lines ?? []).map((l: any) => String(l?.productVariant?.id ?? '')));
      const items = products
        .map((p: any) => {
          const vars = (p.variants ?? [])
            .filter(saleableVariant)
            .sort((a: any, b: any) => Number(a.priceWithTax) - Number(b.priceWithTax));
          const avail = vars.filter((v: any) => !inCart.has(String(v.id)));
          if (!avail.length) return null;
          return { p, vars, v: avail[0], price: Number(avail[0].priceWithTax) || 0 } as RecItem;
        })
        .filter((it: any) => it)
        .sort((a: any, b: any) => a.price - b.price)
        .slice(0, 6);
      return [g.token, { items, hint: recHint(g, gap) }] as const;
    } catch {
      return [g.token, { items: [], hint: '' }] as const;
    }
  }));
  recs.value = Object.fromEntries(entries);
}
/** 加购成功后同步推荐：剔除已加购规格并重算该商品最低价，门槛已达成则清空 */
function refreshRecs(g: CartGroup) {
  const st = recs.value[g.token];
  if (!st) return;
  const gap = recGap(g);
  const inCart = new Set((g.order?.lines ?? []).map((l: any) => String(l?.productVariant?.id ?? '')));
  const items = st.items
    .map((it: RecItem) => {
      const avail = it.vars.filter((v: any) => !inCart.has(String(v.id)));
      if (!avail.length) return null;
      return { ...it, v: avail[0], price: Number(avail[0].priceWithTax) || 0 };
    })
    .filter((it): it is RecItem => !!it)
    .sort((a, b) => a.price - b.price);
  recs.value = {
    ...recs.value,
    [g.token]: gap ? { items, hint: recHint(g, gap) } : { items: [], hint: '' },
  };
}
function groupOf(token: string): CartGroup | undefined {
  return groups.value.find((x) => x.token === token);
}
/** 点击推荐项：仅 1 个可选规格直接加购，多规格先弹规格选择 */
function onRecTap(g: CartGroup, it: RecItem) {
  if (recBusy.value) return;
  const inCart = new Set((g.order?.lines ?? []).map((l: any) => String(l?.productVariant?.id ?? '')));
  const options = it.vars.filter((v: any) => !inCart.has(String(v.id)));
  if (!options.length) { refreshRecs(g); return; }
  if (options.length === 1) { void addRec(g.token, String(options[0].id)); return; }
  recPick.value = {
    token: g.token,
    hint: recState(g).hint,
    item: it,
    options,
    variantId: String(options[0].id),
  };
}
async function confirmRec() {
  const pick = recPick.value;
  if (!pick || recBusy.value) return;
  const ok = await addRec(pick.token, pick.variantId);
  if (ok) recPick.value = null;
}
async function addRec(token: string, variantId: string): Promise<boolean> {
  if (recBusy.value) return false;
  const g = groupOf(token);
  if (!g || !variantId) return false;
  recBusy.value = `${token}:${variantId}`;
  try {
    const res: any = await addItemToOrderInChannel(token, variantId, 1);
    const order = res?.addItemToOrder;
    if (!order?.id) throw new Error(order?.message || '');
    applyOrder(g, order);
    refreshRecs(g);
    uni.showToast({ title: locale.t('cart.recAdded'), icon: 'none' });
    return true;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('cart.recAddFail'), icon: 'none' });
    return false;
  } finally {
    recBusy.value = '';
  }
}

async function load() {
  if (!authStore.isLoggedIn && !getSessionToken()) {
    groups.value = [];
    addons.value = {};
    return;
  }
  loading.value = true;
  try {
    const stores = await fetchStoreList().catch(() => [] as any[]);
    const results = await Promise.allSettled(
      stores.map(async (s: any) => {
        const res: any = await getActiveOrderForChannel(s.channelToken);
        const order = res?.activeOrder;
        if (!order || !(order.lines ?? []).length) return null;
        return {
          token: s.channelToken,
          channelId: s.channelId != null ? String(s.channelId) : undefined,
          name: s.name,
          logo: s.logo,
          routes: (s.routesEnabled || []).join(','),
          minOrder: s.minOrderAmount,
          deliveryFee: s.deliveryFee,
          freeShipping: s.freeShippingThreshold,
          businessHours: s.businessHours,
          promoText: s.promoText,
          order,
        } as CartGroup;
      }),
    );
    groups.value = results
      .filter((r): r is PromiseFulfilledResult<CartGroup | null> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter((g): g is CartGroup => !!g);
    // 刷新单价快照，供下次打开比对变价（本次比对用的是打开前读到的旧快照）
    const snap: PriceMap = {};
    for (const g of groups.value) {
      for (const l of g.order?.lines ?? []) {
        const vid = l?.productVariant?.id;
        if (vid != null) snap[`${g.token}:${vid}`] = linePriceFen(l);
      }
    }
    writeLinePrices(snap);
  } finally {
    loading.value = false;
  }
  void loadAddons();
  const recToken = groups.value.map((g) => g.token).join('|');
  if (recToken !== lastRecToken) {
    lastRecToken = recToken;
    void loadRecs();
  }
}

function fen(v: any): string {
  return (Number(v || 0) / 100).toFixed(2);
}
function yuan(v: any): string {
  return (Math.round(Number(v || 0)) / 100).toFixed(2);
}
function gapFen(g: CartGroup): number {
  const min = Number(g.minOrder);
  if (!Number.isFinite(min) || min <= 0) return 0;
  return Math.max(0, Math.round(min) - Number(g.order?.subTotalWithTax || 0));
}
function optionsText(l: any): string {
  const opts = (l?.productVariant?.options ?? []).map((o: any) => o?.name).filter(Boolean);
  return opts.join(' / ');
}

/** 单行失效状态：下架/售罄/变价 */
function lineIssue(l: any, g: CartGroup): CartLineIssue {
  return lineIssueOf(l, g.token, prevPrices.value);
}
function lineIssueText(l: any, g: CartGroup): string {
  const issue = lineIssue(l, g);
  if (issue === 'removed') return locale.t('cart.lineRemoved');
  if (issue === 'soldOut') return locale.t('cart.lineSoldOut');
  if (issue === 'priceChanged') return locale.t('cart.linePriceChanged');
  return '';
}
function prevPriceOf(l: any, g: CartGroup): number {
  return Number(prevPrices.value[`${g.token}:${l?.productVariant?.id}`] || 0);
}
/** 需清理的行数（下架/售罄；变价仅提示不移除） */
function invalidCount(g: CartGroup): number {
  return (g.order?.lines ?? []).filter((l: any) => isRemovableIssue(lineIssue(l, g))).length;
}
function tiersOf(g: CartGroup) {
  return promoTiers(g.promoText, Number(g.order?.subTotalWithTax || 0));
}
/** 满减金额用整数优先格式：满30减5（与店铺页一致） */
function tierYuan(v: number): string {
  return promoYuan(Number(v) || 0);
}

/** 一键清理失效行：仅移除下架/售罄，保留变价行 */
async function cleanInvalid(g: CartGroup) {
  const lines = (g.order?.lines ?? []).filter((l: any) => isRemovableIssue(lineIssue(l, g)));
  if (!lines.length) return;
  const ok = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: locale.t('cart.cleanTitle'),
      content: locale.t('cart.cleanConfirm').replace('{n}', String(lines.length)),
      success: (r) => resolve(!!r.confirm),
      fail: () => resolve(false),
    });
  });
  if (!ok) return;
  try {
    for (const l of lines) await removeOrderLineForChannel(g.token, l.id);
    if (tenant.token === g.token) cart.clearCart();
    uni.showToast({ title: locale.t('cart.cleanDone'), icon: 'none' });
  } catch {
    uni.showToast({ title: locale.t('cart.cleanFail'), icon: 'none' });
  }
  void load();
}

/** 正在调整的行（token:lineId），防连点重复请求 */
const busyKey = ref('');

/** 调整单行数量：成功后原地替换该店购物车，金额/满减档位/凑单进度实时联动 */
async function changeQty(g: CartGroup, l: any, qty: number) {
    const key = `${g.token}:${l.id}`;
    if (busyKey.value) return;
    busyKey.value = key;
    try {
        const res: any = await adjustOrderLineForChannel(g.token, l.id, qty);
        const order = res?.adjustOrderLine;
        if (!order?.id) throw new Error(order?.message || '');
        applyOrder(g, order);
    } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('cart.qtyFail'), icon: 'none' });
    } finally {
        busyKey.value = '';
    }
}

function incLine(g: CartGroup, l: any) {
    void changeQty(g, l, Number(l.quantity) + 1);
}

/** 数量减到 0 视为删除该行（与店内减号一致） */
function decLine(g: CartGroup, l: any) {
    if (Number(l.quantity) <= 1) { void removeLine(g, l); return; }
    void changeQty(g, l, Number(l.quantity) - 1);
}

/** 删除单行：成功后替换购物车；该店最后一行删完则整卡移除 */
async function removeLine(g: CartGroup, l: any) {
    if (busyKey.value) return;
    busyKey.value = `${g.token}:${l.id}`;
    try {
        const res: any = await removeOrderLineForChannel(g.token, l.id);
        const order = res?.removeOrderLine;
        if (!order?.id) throw new Error(order?.message || '');
        applyOrder(g, order);
        uni.showToast({ title: locale.t('cart.lineDeleted'), icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('cart.removeFail'), icon: 'none' });
    } finally {
        busyKey.value = '';
    }
}

/** 用服务端返回的最新订单替换分组，并同步全局角标与单价快照（避免自家调量被误判变价） */
function applyOrder(g: CartGroup, order: any) {
    g.order = order;
    if (tenant.token === g.token) cart.setOrder(order);
    const snap: PriceMap = { ...readLinePrices() };
    for (const line of order?.lines ?? []) {
        const vid = line?.productVariant?.id;
        if (vid != null) snap[`${g.token}:${vid}`] = linePriceFen(line);
    }
    writeLinePrices(snap);
    prevPrices.value = snap;
    if (!(order?.lines ?? []).length) {
        groups.value = groups.value.filter(x => x.token !== g.token);
    }
}

/** 打烊提示：仅 closed 才拦截提交，closing 由店铺页提示 */
function closedText(g: CartGroup): string {
  const st = getStoreStatus(g.businessHours);
  if (st.state !== 'closed') return '';
  const key = st.nextOpenDayOffset === 1 ? 'menu.closedTomorrow' : 'menu.closedToday';
  return locale.t(key).replace('{t}', st.nextOpenHM);
}

/** 购物车头部窄条用的短文案，避免 300rpx 内被截断 */
function closedTag(g: CartGroup): string {
  const st = getStoreStatus(g.businessHours);
  if (st.state !== 'closed') return '';
  return locale.t('cart.closedTag').replace('{t}', st.nextOpenHM);
}

/** 凑单进度：未达起送价优先，其次免配送费门槛；都无配置返回 null 不占位 */
function progress(g: CartGroup): { pct: number; text: string; ok: boolean } | null {
  const sub = Number(g.order?.subTotalWithTax || 0);
  const min = Number(g.minOrder);
  if (Number.isFinite(min) && min > 0 && sub < min) {
    return { pct: Math.max(4, Math.round((sub / min) * 100)), text: locale.t('cart.minGap').replace('{d}', yuan(min - sub)), ok: false };
  }
  const free = Number(g.freeShipping);
  if (Number.isFinite(free) && free > 0 && Number(g.deliveryFee || 0) > 0) {
    if (sub < free) {
      return { pct: Math.max(4, Math.round((sub / free) * 100)), text: locale.t('cart.freeShipGap').replace('{d}', yuan(free - sub)), ok: false };
    }
    return { pct: 100, text: locale.t('cart.freeShipOk'), ok: true };
  }
  return null;
}

function enterStore(g: CartGroup) {
  const cid = g.channelId ? `&cid=${g.channelId}` : '';
  uni.navigateTo({
    url: `/pages/shop/menu?token=${encodeURIComponent(g.token)}&name=${encodeURIComponent(g.name)}&routes=${encodeURIComponent(g.routes)}${cid}`,
  });
}

async function clearGroup(g: CartGroup) {
  const done = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: locale.t('cart.clearTitle'),
      content: locale.t('cart.clearConfirm').replace('{s}', g.name),
      success: (r) => resolve(!!r.confirm),
      fail: () => resolve(false),
    });
  });
  if (!done) return;
  try {
    await removeAllOrderLinesForChannel(g.token);
    if (tenant.token === g.token) cart.clearCart();
    uni.showToast({ title: locale.t('cart.cleared'), icon: 'none' });
  } catch {
    uni.showToast({ title: locale.t('cart.clearFail'), icon: 'none' });
  }
  void load();
}

async function goCheckout(g: CartGroup) {
  const closed = closedText(g);
  if (closed) {
    uni.showToast({ title: closed, icon: 'none' });
    return;
  }
  if (invalidCount(g) > 0) {
    uni.showToast({ title: locale.t('cart.cleanFirst'), icon: 'none' });
    return;
  }
  if (gapFen(g) > 0) {
    uni.showToast({ title: locale.t('cart.minGap').replace('{d}', yuan(gapFen(g))), icon: 'none' });
    return;
  }
  await tenant.switchTenant(g.token);
  cart.setOrder(g.order);
  const cid = g.channelId ? `&cid=${g.channelId}` : '';
  const mo = g.minOrder ?? '';
  const fee = g.deliveryFee ?? '';
  uni.navigateTo({
    url: `/pkg-order/pages/checkout?routes=${encodeURIComponent(g.routes)}&minOrder=${mo}&dfee=${fee}${cid}&shop=${encodeURIComponent(g.name)}&token=${encodeURIComponent(g.token)}`,
  });
}

function goHome() {
  uni.switchTab({ url: '/pages/home/index' });
}
</script>

<style scoped lang="scss">
.cart-page { min-height: 100vh; background: $bg-color; padding: 20rpx 20rpx 40rpx; box-sizing: border-box; }
.cart-list { display: flex; flex-direction: column; gap: 20rpx; }
.cart-card { background: $surface; border-radius: $radius-md; padding: 24rpx;
  &__head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16rpx; border-bottom: 1rpx solid $border-color; }
  &__store { display: flex; align-items: center; gap: 16rpx; min-width: 0; }
  &__logo { width: 72rpx; height: 72rpx; border-radius: $radius-sm; background: $brand-color-light; flex-shrink: 0;
    &--txt { display: flex; align-items: center; justify-content: center; color: $brand-color; font-size: 32rpx; } }
  &__meta { display: flex; flex-direction: column; gap: 4rpx; min-width: 0; }
  &__name { font-size: 28rpx; font-weight: 600; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__sub { font-size: 22rpx; color: $text-color-secondary; }
  &__clear { font-size: 24rpx; color: $text-color-placeholder; padding: 8rpx; flex-shrink: 0; }
  &__head-right { display: flex; align-items: center; gap: 12rpx; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; max-width: 56%; }
  &__closed { font-size: 20rpx; color: #b42318; background: #fff2f0; border: 1rpx solid #f3b6b0; border-radius: 6rpx; padding: 2rpx 8rpx; max-width: 300rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__foot { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin-top: 20rpx; padding-top: 20rpx; border-top: 1rpx solid $border-color; }
  &__sum { display: flex; flex-direction: column; gap: 4rpx; }
  &__total { font-size: 32rpx; font-weight: 600; color: $price-color; }
  &__gap { font-size: 22rpx; color: $brand-color;
    &--ok { color: $text-color-secondary; } }
  &__btns { display: flex; gap: 12rpx; }
}
/* 凑单进度条 */
.cart-progress { display: flex; align-items: center; gap: 16rpx; margin-top: 16rpx;
  &__bar { flex: 1; height: 10rpx; border-radius: 999rpx; background: $brand-color-light; overflow: hidden; }
  &__fill { height: 100%; border-radius: 999rpx; background: $brand-color; transition: width 0.2s; }
  &__txt { font-size: 22rpx; color: $brand-color; flex-shrink: 0; }
  &__txt.ok { color: #2e7d32; }
}
.cart-line { display: flex; gap: 16rpx; padding: 18rpx 0; border-bottom: 1rpx solid $border-color;
  &__img { border-radius: $radius-sm; background: $bg-color; flex-shrink: 0; }
  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
  &__title { display: flex; align-items: center; gap: 10rpx; min-width: 0; }
  &__name { font-size: 26rpx; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__badge { font-size: 18rpx; color: #b42318; background: #fff2f0; border: 1rpx solid #f3b6b0; border-radius: 6rpx; padding: 2rpx 8rpx; flex-shrink: 0; }
  &__opt { font-size: 22rpx; color: $text-color-secondary; }
  &__foot { display: flex; align-items: center; justify-content: space-between; }
  &__prices { display: flex; align-items: baseline; gap: 10rpx; }
  &__price { font-size: 26rpx; color: $price-color; }
  &__old { font-size: 20rpx; color: $text-color-placeholder; text-decoration: line-through; }
  &__qty { font-size: 24rpx; color: $text-color-secondary; }
  &__ops { display: flex; align-items: center; gap: 8rpx; }
  &__step { width: 44rpx; height: 44rpx; line-height: 42rpx; text-align: center; font-size: 30rpx; color: $brand-color; border: 1rpx solid $brand-color; border-radius: 50%; box-sizing: border-box;
    &.busy { opacity: 0.4; } }
  &__rm { font-size: 26rpx; color: $text-color-placeholder; padding: 4rpx 8rpx; }
  &--invalid { opacity: 0.55;
    & .cart-line__price { text-decoration: line-through; color: $text-color-secondary; } }
}
/* 失效巡查入口 */
.cart-card__clean { font-size: 20rpx; color: #b42318; background: #fff2f0; border: 1rpx solid #f3b6b0; border-radius: 6rpx; padding: 2rpx 10rpx; }
/* 阶梯满减 chips */
.cart-tiers { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 12rpx; }
.cart-tier { display: flex; align-items: center; gap: 8rpx; font-size: 20rpx; padding: 4rpx 12rpx; border-radius: 8rpx; border: 1rpx solid $border-color; color: $text-color-secondary; background: $surface;
  &__gap { font-size: 18rpx; color: #b45309; }
  &.hit { border-color: $brand-color; background: $brand-color-light; color: $brand-color; }
  &.next { border-style: dashed; border-color: #ffb27a; color: #b45309; }
}
/* 智能凑单推荐 */
.cart-recs { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx dashed $border-color;
  &__head { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
  &__title { font-size: 23rpx; font-weight: 600; color: $text-color; }
  &__hint { font-size: 19rpx; color: $brand-color; }
  &__row { white-space: nowrap; margin-top: 12rpx; }
}
.rec-item { display: inline-flex; flex-direction: column; width: 150rpx; margin-right: 14rpx; vertical-align: top;
  &__img { border-radius: $radius-sm; }
  &__name { display: block; margin-top: 6rpx; font-size: 20rpx; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__badge { align-self: flex-start; margin-top: 3rpx; padding: 0 6rpx; font-size: 17rpx; line-height: 26rpx;
    color: $brand-color; border: 1rpx solid $brand-color; border-radius: 4rpx; }
  &__foot { display: flex; align-items: center; justify-content: space-between; margin-top: 4rpx; }
  &__price { font-size: 21rpx; font-weight: 600; color: $price-color; }
  &__add { width: 34rpx; height: 34rpx; line-height: 32rpx; text-align: center; font-size: 24rpx; color: #fff;
    background: $brand-color; border-radius: 50%; &.busy { opacity: .5; } }
}
/* 凑单规格弹层 */
.rec-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 900; background: rgba(0, 0, 0, .45);
  display: flex; align-items: flex-end; }
.rec-sheet { width: 100%; background: $surface; border-radius: 24rpx 24rpx 0 0;
  padding: 28rpx 28rpx calc(28rpx + env(safe-area-inset-bottom));
  &__head { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
  &__title { flex: 1; font-size: 30rpx; font-weight: 600; color: $text-color; }
  &__close { font-size: 28rpx; color: $text-color-placeholder; padding: 4rpx 8rpx; }
  &__hint { display: block; margin-top: 8rpx; font-size: 22rpx; color: $brand-color; }
  &__list { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 18rpx; max-height: 46vh; overflow-y: auto; }
  &__btn { margin-top: 24rpx; height: 84rpx; line-height: 84rpx; border-radius: 42rpx; background: $brand-color;
    color: #fff; font-size: 28rpx; font-weight: 600; border: none;
    &::after { border: none; }
    &[disabled] { opacity: .6; }
  }
}
.rec-opt { display: flex; flex-direction: column; gap: 4rpx; min-width: 30%; padding: 12rpx 18rpx;
  border: 1rpx solid $border-color; border-radius: $radius-md; background: $bg-color;
  &__name { font-size: 24rpx; color: $text-color; }
  &__stock { font-size: 18rpx; color: $text-color-placeholder; }
  &__price { font-size: 24rpx; font-weight: 600; color: $price-color; }
  &.on { border-color: $brand-color; background: $brand-color-light; }
}
.cart-addons { margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx dashed $border-color;
  &__head { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
  &__title { font-size: 22rpx; font-weight: 600; color: #b45309; }
  &__tip { font-size: 18rpx; color: $text-color-placeholder; }
  &__list { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 10rpx; }
  &__sum { display: block; margin-top: 8rpx; font-size: 18rpx; color: #b45309; }
}
.addon-chip { display: flex; align-items: center; gap: 6rpx; padding: 5rpx 12rpx; border-radius: 8rpx; border: 1rpx solid #ffd2a8; background: #fffaf5;
  &__amt { font-size: 20rpx; color: #b45309; font-weight: 600; }
  &__price { font-size: 20rpx; color: #ff4d4f; }
  &__state { font-size: 18rpx; color: $brand-color; }
  &.on { border-color: $brand-color; background: $brand-color-light; }
  &.busy { opacity: .5; }
}
.cart-btn { height: 72rpx; line-height: 72rpx; padding: 0 32rpx; border-radius: 999rpx; font-size: 26rpx; text-align: center;
  &--ghost { background: $bg-color; color: $text-color-secondary; border: 1rpx solid $border-color; }
  &--primary { background: $brand-color; color: #fff; }
  &--primary.disabled { background: $text-color-placeholder; opacity: 0.7; }
}
.cart-empty { min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16rpx;
  &__ico { font-size: 84rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; }
  &__btn { margin-top: 12rpx; background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; padding: 0 56rpx; height: 80rpx; line-height: 80rpx; }
}
</style>
