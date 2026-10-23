<template>
  <view class="mp-page">
    <view class="mp-hero">
      <text class="mp-hero__ico">📅</text>
      <text class="mp-hero__title">{{ $t('mealPlan.title') }}</text>
      <text class="mp-hero__sub">{{ $t('mealPlan.sub') }}</text>
    </view>

    <!-- 到点提醒条 -->
    <view v-if="imminent" class="mp-imminent" @tap="addImminent">
      <text class="mp-imminent__ico">⏰</text>
      <view class="mp-imminent__body">
        <text class="mp-imminent__title">{{ imminentTitle }}</text>
        <text class="mp-imminent__sub">{{ $t('mealPlan.imminentHint') }}</text>
      </view>
      <text class="mp-imminent__go" @tap.stop="addImminent">{{ $t('mealPlan.bannerGo') }}</text>
    </view>

    <!-- 周条 -->
    <view class="mp-week">
      <view
        v-for="(d, i) in weekDays"
        :key="i"
        class="mp-wd"
        :class="{ 'mp-wd--on': i === selIdx }"
        @tap="selIdx = i"
      >
        <text class="mp-wd__d">{{ dowLabel(i + 1) }}</text>
        <text class="mp-wd__n">{{ d.num }}</text>
        <view v-if="d.hasPlan" class="mp-wd__dot"></view>
      </view>
    </view>

    <!-- 当日标题 -->
    <view class="mp-dayhead">
      <text class="mp-dayhead__t">{{ dayTitle }}</text>
      <text class="mp-dayhead__chip">{{ $t('mealPlan.weekCount').replace('{n}', String(weekCount)) }}</text>
    </view>

    <!-- 按餐段分组的计划卡 -->
    <template v-for="slot in SLOT_KEYS" :key="slot">
      <template v-if="slotPlans(slot).length">
        <text class="mp-glabel">{{ slotLabel(slot) }}</text>
        <view
          v-for="p in slotPlans(slot)"
          :key="p.id"
          class="mp-card"
          :class="{ 'mp-card--off': !p.enabled }"
          @longpress="delPlan(p)"
        >
          <view class="mp-card__row">
            <text class="mp-card__store">{{ p.storeName }}</text>
            <switch
              class="mp-card__sw"
              :checked="p.enabled"
              color="#ff6600"
              style="transform: scale(0.72)"
              @change="togglePlan(p)"
            />
          </view>
          <view class="mp-card__chips">
            <text v-for="l in p.lines" :key="l.variantId" class="mp-chip">{{ l.name }} ×{{ l.qty }}</text>
          </view>
          <view class="mp-card__meta">
            <text class="mp-tag">{{ repeatText(p) }}</text>
            <text>{{ $t('mealPlan.arrive') }} {{ p.time }}</text>
            <text v-if="sumFen(p) > 0">¥{{ fenText(sumFen(p)) }}</text>
          </view>
          <view class="mp-card__ops">
            <text class="mp-card__op" @tap.stop="openEdit(p)">{{ $t('mealPlan.edit') }}</text>
            <text class="mp-card__op mp-card__op--buy" @tap.stop="addPlan(p)">{{ $t('mealPlan.bannerGo') }}</text>
          </view>
        </view>
      </template>
    </template>

    <!-- 空态 -->
    <view v-if="!dayPlans.length" class="mp-empty">
      <text class="mp-empty__ico">🗒️</text>
      <text class="mp-empty__text">{{ plans.length ? $t('mealPlan.emptyDay') : $t('mealPlan.emptyAll') }}</text>
    </view>

    <view class="mp-tip">⏰ {{ $t('mealPlan.tip') }}</view>
    <button class="mp-cta" @tap="openCreate">＋ {{ $t('mealPlan.cta') }}</button>

    <!-- 新建/编辑弹层 -->
    <view v-if="sheetOpen" class="mp-mask" @tap="closeSheet">
      <view class="mp-sheet" @tap.stop>
        <view class="mp-sheet__head">
          <text class="mp-sheet__title">{{ editingId ? $t('mealPlan.edit') : $t('mealPlan.cta') }}</text>
          <text class="mp-sheet__close" @tap="closeSheet">✕</text>
        </view>

        <text class="mp-flabel">{{ $t('mealPlan.slotLabel') }}</text>
        <view class="mp-fchips">
          <text
            v-for="s in SLOT_KEYS"
            :key="s"
            class="mp-fchip"
            :class="{ on: editor.slot === s }"
            @tap="pickSlot(s)"
          >{{ slotLabel(s) }} {{ editor.time }}</text>
          <picker mode="time" :value="editor.time" @change="onTimeChange">
            <text class="mp-fchip">{{ $t('mealPlan.pickTime') }}</text>
          </picker>
        </view>

        <text class="mp-flabel">{{ $t('mealPlan.daysLabel') }}</text>
        <view class="mp-fchips">
          <text
            v-for="n in [1, 2, 3, 4, 5, 6, 7]"
            :key="'d' + n"
            class="mp-fchip"
            :class="{ on: editor.days.includes(n) }"
            @tap="toggleDay(n)"
          >{{ dowLabel(n) }}</text>
        </view>
        <view class="mp-fchips">
          <text class="mp-fchip mp-fchip--q" @tap="setDays([1, 2, 3, 4, 5, 6, 7])">{{ $t('mealPlan.everyDay') }}</text>
          <text class="mp-fchip mp-fchip--q" @tap="setDays([1, 2, 3, 4, 5])">{{ $t('mealPlan.workday') }}</text>
        </view>

        <text class="mp-flabel">{{ $t('mealPlan.storeLabel') }}</text>
        <scroll-view scroll-x class="mp-storebar" :show-scrollbar="false">
          <view class="mp-fchips mp-fchips--row">
            <text
              v-for="s in storePool"
              :key="s.token"
              class="mp-fchip"
              :class="{ on: editor.storeToken === s.token }"
              @tap="pickStore(s)"
            >{{ s.name }}</text>
          </view>
        </scroll-view>
        <text v-if="!storePool.length" class="mp-fhint">
          {{ $t('mealPlan.noStore') }}
          <text class="mp-fhint__go" @tap="goFavorites">{{ $t('mealPlan.goFav') }}</text>
        </text>

        <template v-if="editor.storeToken">
          <text class="mp-flabel">{{ $t('mealPlan.goodsLabel') }}</text>
          <view v-if="!productPool.length" class="mp-fhint">{{ $t('mealPlan.noGoods') }}</view>
          <view v-for="c in productPool" :key="c.variantId" class="mp-goods">
            <view class="mp-goods__body">
              <text class="mp-goods__name">{{ c.name }}</text>
              <text v-if="c.price" class="mp-goods__price">¥{{ fenText(c.price) }}</text>
            </view>
            <view class="mp-step">
              <text class="mp-step__btn" :class="{ off: !qtyOf(c.variantId) }" @tap="stepLine(c, -1)">−</text>
              <text class="mp-step__n">{{ qtyOf(c.variantId) }}</text>
              <text class="mp-step__btn" @tap="stepLine(c, 1)">＋</text>
            </view>
          </view>
        </template>

        <button class="mp-sheet__save" :disabled="busy" @tap="savePlan">{{ $t('mealPlan.save') }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useFavoritesStore } from '../../stores/favorites';
import { useLocaleStore } from '../../stores/locale';
import { fetchStoreList } from '../../api/queries/waimai';
import { readFootprint } from '../../utils/footprint';
import { addPlanToCart } from '../../utils/meal-plan-order';
import {
  SLOT_DEFAULT,
  SLOT_KEYS,
  fenText,
  isoWeekday,
  imminentPlans,
  planHits,
  planTimeOn,
  readMealPlans,
  removePlanById,
  repeatLabel,
  setPlanEnabled,
  upsertPlan,
  weekPlanCount,
  type MealPlanItem,
  type MealSlot,
} from '../../utils/meal-plan';

const locale = useLocaleStore();
const favs = useFavoritesStore();

const plans = ref<MealPlanItem[]>(readMealPlans());
const nowTick = ref(Date.now());
const busy = ref(false);

function t(k: string): string {
  return locale.t(k);
}

// —— 周条：本周一 起 7 天 ——
const weekDays = computed(() => {
  const n = new Date(nowTick.value);
  const mon = new Date(n.getFullYear(), n.getMonth(), n.getDate() - (isoWeekday(n) - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
    return {
      date: d,
      num: d.getDate(),
      isToday: d.toDateString() === n.toDateString(),
      hasPlan: plans.value.some(p => planHits(p, d)),
    };
  });
});
const selIdx = ref(0);

const selDate = computed(() => weekDays.value[selIdx.value]?.date ?? new Date(nowTick.value));
const dayPlans = computed(() =>
  plans.value
    .filter(p => planHits(p, selDate.value))
    .sort((a, b) => (a.slot === b.slot ? a.time.localeCompare(b.time) : a.slot === 'lunch' ? -1 : 1)),
);

const weekCount = computed(() => weekPlanCount(plans.value, weekDays.value[0]?.date ?? new Date(nowTick.value)));

const dayTitle = computed(() => {
  const d = selDate.value;
  const n = new Date(nowTick.value);
  const prefix = d.toDateString() === n.toDateString() ? t('mealPlan.today') : '';
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return `${prefix ? prefix + ' · ' : ''}${md} ${dowLabel(isoWeekday(d))}`;
});

function dowLabel(n: number): string {
  return t(`mealPlan.dow${n}`);
}
function slotLabel(s: MealSlot): string {
  return t(s === 'lunch' ? 'mealPlan.slotLunch' : 'mealPlan.slotDinner');
}
function plansOf(slot: MealSlot): MealPlanItem[] {
  return dayPlans.value.filter(p => p.slot === slot);
}
function slotPlans(slot: MealSlot): MealPlanItem[] {
  return slot === 'lunch' ? plansOf('lunch') : plansOf('dinner');
}
function repeatText(p: MealPlanItem): string {
  return repeatLabel(p.days, {
    everyDay: t('mealPlan.everyDay'),
    workday: t('mealPlan.workday'),
    dayNames: [1, 2, 3, 4, 5, 6, 7].map(i => dowLabel(i)),
  });
}
function sumFen(p: MealPlanItem): number {
  return p.lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0);
}

// —— 到点提醒 ——
const imminent = computed(() => imminentPlans(plans.value, new Date(nowTick.value))[0] ?? null);
const imminentTitle = computed(() => {
  const it = imminent.value;
  if (!it) return '';
  return `${it.plan.time} ${slotLabel(it.plan.slot)} · ${it.plan.storeName}`;
});

// —— 启停 / 删除 ——
function togglePlan(p: MealPlanItem) {
  plans.value = setPlanEnabled(p.id, !p.enabled);
  uni.showToast({ title: t(p.enabled ? 'mealPlan.paused' : 'mealPlan.resumed'), icon: 'none' });
}
function delPlan(p: MealPlanItem) {
  uni.showModal({
    title: t('mealPlan.delTitle'),
    content: t('mealPlan.delMsg'),
    success: (r: any) => {
      if (!r?.confirm) return;
      plans.value = removePlanById(p.id);
      uni.showToast({ title: t('mealPlan.deleted'), icon: 'none' });
    },
  });
}

// —— 一键带入购物车 ——
async function addPlan(p: MealPlanItem) {
  if (busy.value) return;
  busy.value = true;
  const ok = await addPlanToCart(p, t);
  busy.value = false;
  if (ok) setTimeout(() => uni.navigateTo({ url: '/pkg-order/pages/cart' }), 500);
}
function addImminent() {
  if (imminent.value) void addPlan(imminent.value.plan);
}

// —— 新建 / 编辑弹层 ——
const sheetOpen = ref(false);
const editingId = ref('');
const editor = ref({
  slot: 'lunch' as MealSlot,
  time: '11:00',
  days: [] as number[],
  storeToken: '',
  storeName: '',
  routes: '' as string | undefined,
});
const qtyMap = ref<Record<string, number>>({});

interface StoreCandidate { token: string; name: string; routes?: string; channelId?: string }
interface LineCandidate { variantId: string; name: string; price?: number; image?: string }

const storePool = ref<StoreCandidate[]>([]);

async function loadStores() {
  const map = new Map<string, StoreCandidate>();
  const put = (token: string, name: string, routes?: string, channelId?: string) => {
    const tk = String(token ?? '');
    if (!tk || !name || map.has(tk)) return;
    map.set(tk, { token: tk, name: String(name), routes: routes ? String(routes) : undefined, channelId: channelId != null ? String(channelId) : undefined });
  };
  for (const r of favs.recents) put(r.channelToken, r.name, r.routes, r.channelId);
  for (const f of readFootprint()) put(f.channelToken, f.storeName ?? '', f.routes, f.channelId);
  try {
    // 收藏店铺（云端）：与本地候选合并，失败静默
    const ids = new Set(favs.ids.map(String));
    const stores: any[] = await fetchStoreList();
    for (const s of stores) {
      if (s?.channelToken && ids.has(String(s.channelId))) put(s.channelToken, s.name, (s.routesEnabled ?? []).join(','), s.channelId);
    }
  } catch {
    /* 离线/未登录：仅用本地候选 */
  }
  storePool.value = Array.from(map.values());
}

const productPool = computed<LineCandidate[]>(() => {
  const tk = editor.value.storeToken;
  if (!tk) return [];
  const map = new Map<string, LineCandidate>();
  const put = (c: any) => {
    const vid = String(c?.variantId ?? '');
    if (!vid || !c?.name || map.has(vid)) return;
    map.set(vid, {
      variantId: vid,
      name: String(c.name),
      price: Number.isFinite(Number(c.price)) && Number(c.price) > 0 ? Number(c.price) : undefined,
      image: c.image ? String(c.image) : undefined,
    });
  };
  for (const v of favs.variantItems) if (v.channelToken === tk) put(v);
  for (const r of favs.recentItems) if (r.channelToken === tk) put(r);
  for (const f of readFootprint()) if (f.channelToken === tk) put(f);
  return Array.from(map.values());
});

function qtyOf(variantId: string): number {
  return qtyMap.value[variantId] ?? 0;
}

function openCreate() {
  editingId.value = '';
  const slot: MealSlot = 'lunch';
  editor.value = { slot, time: SLOT_DEFAULT[slot], days: [], storeToken: '', storeName: '', routes: '' };
  qtyMap.value = {};
  sheetOpen.value = true;
  void loadStores();
}

function openEdit(p: MealPlanItem) {
  editingId.value = p.id;
  editor.value = { slot: p.slot, time: p.time, days: p.days.slice(), storeToken: p.storeToken, storeName: p.storeName, routes: p.routes };
  qtyMap.value = {};
  for (const l of p.lines) qtyMap.value[l.variantId] = l.qty;
  sheetOpen.value = true;
  void loadStores();
}

function closeSheet() {
  sheetOpen.value = false;
}

function pickSlot(s: MealSlot) {
  const old = editor.value.slot;
  editor.value.slot = s;
  if (editor.value.time === SLOT_DEFAULT[old]) editor.value.time = SLOT_DEFAULT[s];
}
function onTimeChange(e: any) {
  const v = String(e?.detail?.value ?? '');
  if (/^\d{2}:\d{2}$/.test(v)) editor.value.time = v;
}
function toggleDay(n: number) {
  const set = new Set(editor.value.days);
  if (set.has(n)) set.delete(n);
  else set.add(n);
  editor.value.days = Array.from(set).sort();
}
function setDays(days: number[]) {
  editor.value.days = days.slice();
}
function pickStore(s: StoreCandidate) {
  if (editor.value.storeToken === s.token) return;
  editor.value.storeToken = s.token;
  editor.value.storeName = s.name;
  editor.value.routes = s.routes;
  qtyMap.value = {};
}
function stepLine(c: LineCandidate, delta: number) {
  const cur = qtyOf(c.variantId);
  const next = Math.max(0, Math.min(20, cur + delta));
  if (next === cur) return;
  if (next === 0) delete qtyMap.value[c.variantId];
  else qtyMap.value[c.variantId] = next;
  // 触发响应式更新
  qtyMap.value = { ...qtyMap.value };
}

function goFavorites() {
  closeSheet();
  uni.navigateTo({ url: '/pkg-user/pages/favorites' });
}

function savePlan() {
  if (!editor.value.storeToken) { uni.showToast({ title: t('mealPlan.pickStore'), icon: 'none' }); return; }
  if (!editor.value.days.length) { uni.showToast({ title: t('mealPlan.pickDay'), icon: 'none' }); return; }
  const lines = productPool.value
    .filter(c => qtyOf(c.variantId) > 0)
    .map(c => ({ variantId: c.variantId, name: c.name, qty: qtyOf(c.variantId), price: c.price, image: c.image }));
  if (!lines.length) { uni.showToast({ title: t('mealPlan.pickGoods'), icon: 'none' }); return; }
  const existed = editingId.value ? plans.value.find(p => p.id === editingId.value) : null;
  upsertPlan({
    id: editingId.value,
    enabled: existed ? existed.enabled : true,
    slot: editor.value.slot,
    time: editor.value.time,
    days: editor.value.days,
    storeToken: editor.value.storeToken,
    storeName: editor.value.storeName,
    routes: editor.value.routes,
    lines,
    createdAt: existed?.createdAt ?? 0,
  });
  plans.value = readMealPlans();
  closeSheet();
  uni.showToast({ title: t('mealPlan.saved'), icon: 'success' });
}

onShow(() => {
  nowTick.value = Date.now();
  plans.value = readMealPlans();
  // 默认选中今天（仅首次进入）
  if (!selTouched) {
    const idx = weekDays.value.findIndex(d => d.isToday);
    selIdx.value = idx >= 0 ? idx : 0;
    selTouched = true;
  }
  void loadStores();
});
let selTouched = false;
</script>

<style lang="scss" scoped>
.mp-page { min-height: 100vh; background: $bg-color; padding: 24rpx 24rpx 60rpx; box-sizing: border-box; }
.mp-hero {
  display: flex; flex-direction: column; align-items: center; gap: 10rpx;
  background: linear-gradient(135deg, #ff8a3d, #ff6600); border-radius: $radius-md;
  padding: 40rpx 30rpx; margin-bottom: 20rpx;
  &__ico { font-size: 52rpx; }
  &__title { font-size: 34rpx; font-weight: 700; color: #fff; }
  &__sub { font-size: 24rpx; color: rgba(255, 255, 255, 0.88); }
}
.mp-imminent {
  display: flex; align-items: center; gap: 12rpx; margin-bottom: 20rpx; padding: 18rpx 22rpx;
  background: #fff3e6; border: 1rpx solid #ffd9b3; border-radius: 16rpx;
  &__ico { font-size: 30rpx; }
  &__body { flex: 1; min-width: 0; }
  &__title { display: block; font-size: 26rpx; font-weight: 600; color: #b34700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__sub { display: block; margin-top: 4rpx; font-size: 20rpx; color: #c97a3d; }
  &__go { flex-shrink: 0; font-size: 23rpx; color: #fff; background: #ff6600; border-radius: 999rpx; padding: 8rpx 20rpx; }
}
.mp-week { display: flex; gap: 10rpx; margin-bottom: 20rpx; }
.mp-wd {
  position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6rpx;
  background: #fff; border: 1rpx solid #ececec; border-radius: 12rpx; padding: 14rpx 0 18rpx;
  &__d { font-size: 20rpx; color: #999; }
  &__n { font-size: 26rpx; font-weight: 600; color: #1a1a1a; }
  &__dot { position: absolute; top: 8rpx; right: 8rpx; width: 8rpx; height: 8rpx; border-radius: 50%; background: #ff6600; }
  &--on { background: #ff6600; border-color: #ff6600; }
  &--on &__d, &--on &__n { color: #fff; }
  &--on &__dot { background: #fff; }
}
.mp-dayhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
.mp-dayhead__t { font-size: 28rpx; font-weight: 600; color: #1a1a1a; }
.mp-dayhead__chip { font-size: 20rpx; color: #999; background: #fff; border: 1rpx solid #ececec; border-radius: 999rpx; padding: 4rpx 18rpx; }
.mp-glabel { display: block; font-size: 22rpx; color: #999; margin: 8rpx 0 10rpx; }
.mp-card {
  background: #fff; border: 1rpx solid #ececec; border-radius: 16rpx; padding: 22rpx; margin-bottom: 16rpx;
  display: flex; flex-direction: column; gap: 12rpx;
  &--off { opacity: 0.66; }
  &__row { display: flex; align-items: center; justify-content: space-between; }
  &__store { font-size: 28rpx; font-weight: 600; color: #1a1a1a; }
  &__chips { display: flex; flex-wrap: wrap; gap: 10rpx; }
  &__meta { display: flex; align-items: center; flex-wrap: wrap; gap: 14rpx; font-size: 22rpx; color: #999; }
  &__ops { display: flex; align-items: center; justify-content: flex-end; gap: 28rpx; }
  &__op { font-size: 24rpx; color: #ff6600; padding: 4rpx 0; }
  &__op--buy { font-weight: 600; }
}
.mp-chip { font-size: 22rpx; color: #333; background: #f7f7f8; border: 1rpx solid #ececec; border-radius: 999rpx; padding: 4rpx 18rpx; }
.mp-tag { font-size: 20rpx; font-weight: 600; color: #b34700; background: #fff3e6; border-radius: 999rpx; padding: 4rpx 16rpx; }
.mp-empty { display: flex; flex-direction: column; align-items: center; gap: 12rpx; padding: 60rpx 0 30rpx; }
.mp-empty__ico { font-size: 64rpx; }
.mp-empty__text { font-size: 24rpx; color: #999; }
.mp-tip { font-size: 22rpx; color: #b34700; background: #fff3e6; border-radius: 12rpx; padding: 14rpx 20rpx; margin: 8rpx 0 20rpx; }
.mp-cta { height: 88rpx; line-height: 88rpx; text-align: center; border-radius: 999rpx; font-size: 30rpx; font-weight: 600; color: #fff; background: #ff6600; border: none; }
.mp-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 1000; display: flex; align-items: flex-end; }
.mp-sheet {
  width: 100%; box-sizing: border-box; max-height: 80vh; overflow-y: auto;
  background: #fff; border-radius: 28rpx 28rpx 0 0; padding: 28rpx 28rpx calc(28rpx + env(safe-area-inset-bottom));
  display: flex; flex-direction: column;
  &__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
  &__title { font-size: 32rpx; font-weight: 600; color: #1a1a1a; }
  &__close { font-size: 30rpx; color: #999; padding: 8rpx; }
  &__save { margin-top: 28rpx; height: 84rpx; line-height: 84rpx; text-align: center; border-radius: 999rpx; font-size: 28rpx; font-weight: 600; color: #fff; background: #ff6600; border: none; }
}
.mp-flabel { display: block; font-size: 24rpx; color: #999; margin: 22rpx 0 12rpx; }
.mp-fchips { display: flex; flex-wrap: wrap; gap: 14rpx; &--row { flex-wrap: nowrap; } }
.mp-fchip { padding: 12rpx 26rpx; border-radius: 999rpx; font-size: 24rpx; color: #1a1a1a; background: #f7f7f8; border: 1rpx solid #ececec; &.on { color: #ff6600; background: #fff3e6; border-color: #ff6600; } }
.mp-fchip--q { color: #999; }
.mp-fhint { display: block; font-size: 22rpx; color: #999; margin-top: 10rpx; &__go { color: #ff6600; margin-left: 8rpx; } }
.mp-storebar { width: 100%; white-space: nowrap; }
.mp-goods { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; padding: 14rpx 0; border-bottom: 1rpx solid #f2f2f2; }
.mp-goods__body { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 14rpx; }
.mp-goods__name { font-size: 26rpx; color: #1a1a1a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-goods__price { flex-shrink: 0; font-size: 22rpx; color: #ff6600; }
.mp-step { flex-shrink: 0; display: flex; align-items: center; gap: 16rpx; }
.mp-step__btn { width: 52rpx; height: 52rpx; line-height: 50rpx; text-align: center; border-radius: 50%; font-size: 30rpx; color: #ff6600; background: #fff3e6; border: 1rpx solid #ffd9b3; &.off { color: #bbb; background: #f7f7f8; border-color: #ececec; } }
.mp-step__n { min-width: 40rpx; text-align: center; font-size: 26rpx; color: #1a1a1a; }
</style>
