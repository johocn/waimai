<template>
  <view class="go-page">
    <!-- ① 我的拼单列表 -->
    <template v-if="mode === 'list'">
      <view v-if="!sessions.length" class="go-empty">
        <text class="go-empty__ico">🧩</text>
        <text class="go-empty__txt">{{ $t('groupOrder.empty') }}</text>
        <text class="go-empty__hint">{{ $t('groupOrder.emptyHint') }}</text>
        <button class="go-empty__btn" @click="goHome">{{ $t('groupOrder.goHome') }}</button>
      </view>
      <view v-else class="go-list">
        <view v-for="s in sessions" :key="s.id" class="go-card" :class="{ closed: s.closed }">
          <view class="go-card__head">
            <text class="go-card__shop">{{ s.shop }}</text>
            <text class="go-card__badge" v-if="!s.closed">{{ $t('groupOrder.open') }}</text>
            <text class="go-card__badge go-card__badge--closed" v-else>{{ $t('groupOrder.finished') }}</text>
          </view>
          <text class="go-card__meta">{{ $t('groupOrder.meta').replace('{h}', s.host).replace('{n}', String(qtyOf(s.items))).replace('{d}', fen(totalOf(s.items))) }}</text>
          <view class="go-card__items">
            <text v-for="(it, i) in s.items.slice(0, 3)" :key="'it-' + i" class="go-card__item">{{ it.name }}×{{ it.qty }}</text>
            <text v-if="s.items.length > 3" class="go-card__item">…</text>
          </view>
          <view class="go-card__acts">
            <view class="go-btn go-btn--ghost" @click="copyInvite(s)">{{ $t('groupOrder.copyInvite') }}</view>
            <view class="go-btn go-btn--ghost" @click="openInvite(s)">{{ $t('groupOrder.viewList') }}</view>
            <view class="go-btn go-btn--danger" @click="finishSession(s)">{{ $t('groupOrder.finish') }}</view>
          </view>
        </view>
      </view>
    </template>

    <!-- ② 受邀视图（邀请链接） -->
    <template v-else-if="mode === 'guest' && invite">
      <view class="go-hero">
        <text class="go-hero__ico">🧩</text>
        <view class="go-hero__body">
          <text class="go-hero__title">{{ $t('groupOrder.invitedTitle').replace('{h}', invite.host) }}</text>
          <text class="go-hero__sub">{{ invite.shop }}</text>
        </view>
      </view>

      <view class="go-sec">
        <text class="go-sec__title">{{ $t('groupOrder.currentItems') }}</text>
        <view v-if="!invite.items.length" class="go-sec__empty">{{ $t('groupOrder.noItems') }}</view>
        <view v-else class="go-items">
          <view v-for="(it, i) in invite.items" :key="'gi-' + i" class="go-item">
            <VImage v-if="it.image" :src="it.image" width="80rpx" height="80rpx" class="go-item__img" />
            <view v-else class="go-item__img go-item__img--txt">{{ (it.name || '?').slice(0, 1) }}</view>
            <view class="go-item__body">
              <text class="go-item__name">{{ it.name }}</text>
              <text class="go-item__from">{{ it.from }}</text>
            </view>
            <text class="go-item__qty">×{{ it.qty }}</text>
            <text class="go-item__price">¥{{ fen(it.price * it.qty) }}</text>
          </view>
          <view class="go-items__sum">
            <text>{{ $t('groupOrder.total').replace('{n}', String(qtyOf(invite.items))) }}</text>
            <text class="go-items__amt">¥{{ fen(totalOf(invite.items)) }}</text>
          </view>
        </view>
      </view>

      <view class="go-sec">
        <text class="go-sec__title">{{ $t('groupOrder.howTo') }}</text>
        <text class="go-sec__hint">{{ $t('groupOrder.howToHint') }}</text>
      </view>

      <view class="go-foot">
        <view class="go-btn go-btn--ghost go-btn--lg" @click="goShop">{{ $t('groupOrder.goShop') }}</view>
        <!-- 自己发起的拼单：这里只负责把邀请发出去；受邀方才有「提交我的选择」 -->
        <view v-if="isHost" class="go-btn go-btn--primary go-btn--lg" @click="shareInvite">{{ $t('groupOrder.copyInvite') }}</view>
        <view v-else class="go-btn go-btn--primary go-btn--lg" :class="{ busy: submitting }" @click="submitPick">
          {{ submitting ? $t('groupOrder.submitting') : $t('groupOrder.submitMine') }}
        </view>
      </view>

      <!-- 回传链接：复制发给发起人 -->
      <view v-if="pickLink" class="go-link">
        <text class="go-link__label">{{ $t('groupOrder.pickLinkLabel') }}</text>
        <text class="go-link__url" selectable>{{ pickLink }}</text>
        <view class="go-btn go-btn--ghost" @click="copyPickLink">{{ $t('groupOrder.copy') }}</view>
      </view>
    </template>

    <!-- ③ 发起方接收好友清单 -->
    <template v-else-if="mode === 'pick' && pick">
      <view class="go-hero">
        <text class="go-hero__ico">📥</text>
        <view class="go-hero__body">
          <text class="go-hero__title">{{ $t('groupOrder.pickTitle').replace('{h}', pick.from) }}</text>
          <text class="go-hero__sub">{{ pick.shop }}</text>
        </view>
      </view>

      <view class="go-sec">
        <text class="go-sec__title">{{ $t('groupOrder.pickItems') }}</text>
        <view class="go-items">
          <view v-for="(it, i) in pick.items" :key="'pi-' + i" class="go-item" :class="{ off: !checked[i] }" @click="toggleCheck(i)">
            <text class="go-item__check">{{ checked[i] ? '☑' : '☐' }}</text>
            <view class="go-item__body">
              <text class="go-item__name">{{ it.name }}</text>
              <text class="go-item__from">{{ it.from }}</text>
            </view>
            <text class="go-item__qty">×{{ it.qty }}</text>
            <text class="go-item__price">¥{{ fen(it.price * it.qty) }}</text>
          </view>
          <view class="go-items__sum">
            <text>{{ $t('groupOrder.pickSum').replace('{n}', String(checkedQty)) }}</text>
            <text class="go-items__amt">¥{{ fen(checkedFen) }}</text>
          </view>
        </view>
      </view>

      <view class="go-foot">
        <view class="go-btn go-btn--primary go-btn--lg" :class="{ busy: merging }" @click="mergePick">
          {{ merging ? $t('groupOrder.merging') : $t('groupOrder.merge') }}
        </view>
      </view>
    </template>

    <view v-else class="go-empty">
      <text class="go-empty__ico">🔗</text>
      <text class="go-empty__txt">{{ $t('groupOrder.badLink') }}</text>
      <button class="go-empty__btn" @click="goHome">{{ $t('groupOrder.goHome') }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { getActiveOrderForChannel } from '../../api/queries/order';
import { addItemToOrderInChannel } from '../../api/mutations/cart';
import { useTenantStore } from '../../stores/tenant';
import { useLocaleStore } from '../../stores/locale';
import {
  readSessions,
  upsertSession,
  removeSession,
  sessionOf,
  createSession,
  mergeItems,
  itemsFromLines,
  participantsOf,
  totalFen,
  totalQty,
  encodeInvite,
  decodeInvite,
  encodePickShort,
  decodePick,
  invitePath,
  pickPath,
  type GroupSession,
  type GroupInvite,
  type GroupPick,
} from '../../utils/group-order';
import { sharePage } from '../../utils/share';
import VImage from '../../components/VImage.vue';

const locale = useLocaleStore();
const tenant = useTenantStore();

type Mode = 'list' | 'guest' | 'pick';
const mode = ref<Mode>('list');
const sessions = ref<GroupSession[]>([]);
const invite = ref<GroupInvite | null>(null);
const pick = ref<GroupPick | null>(null);
const checked = ref<boolean[]>([]);
const submitting = ref(false);
const merging = ref(false);
const pickLink = ref('');

const nickname = (() => {
  try {
    const n: any = uni.getStorageSync('user_nickname');
    return typeof n === 'string' && n ? n : locale.t('groupOrder.me');
  } catch {
    return locale.t('groupOrder.me');
  }
})();

function fen(v: any): string {
  return (Number(v || 0) / 100).toFixed(2);
}
function qtyOf(items: any[]): number {
  return totalQty(items || []);
}
function totalOf(items: any[]): number {
  return totalFen(items || []);
}
const checkedQty = computed(() => (pick.value?.items || []).reduce((s, it, i) => s + (checked.value[i] ? it.qty : 0), 0));
const checkedFen = computed(() => (pick.value?.items || []).reduce((s, it, i) => s + (checked.value[i] ? it.qty * it.price : 0), 0));

function refreshList() {
  sessions.value = readSessions();
}

onShow(() => {
  if (mode.value === 'list') refreshList();
});

onLoad((q: any) => {
  const g = String(q?.g || '');
  const p = String(q?.pick || '');
  if (p) {
    const decoded = decodePick(p);
    if (!decoded) return;
    pick.value = decoded;
    checked.value = decoded.items.map(() => true);
    mode.value = 'pick';
    uni.setNavigationBarTitle({ title: locale.t('groupOrder.title') });
    return;
  }
  if (g) {
    const decoded = decodeInvite(g);
    if (!decoded) return;
    invite.value = decoded;
    mode.value = 'guest';
    uni.setNavigationBarTitle({ title: locale.t('groupOrder.title') });
    // 自己发起的拼单（从购物车进来）：直接给出邀请链接，省一步
    if (decoded.host === nickname) setTimeout(() => { void shareInvite(); }, 600);
    return;
  }
  refreshList();
});

const isHost = computed(() => !!invite.value && invite.value.host === nickname);

/** 把当前邀请视为会话再编码（字段一一对应） */
function currentInvitePath(): string {
  const inv = invite.value;
  if (!inv) return '';
  const session: GroupSession = {
    id: inv.id,
    host: inv.host,
    token: inv.token,
    channelId: inv.cid,
    shop: inv.shop,
    routes: inv.routes,
    items: inv.items,
    participants: participantsOf(inv.items),
    createdAt: inv.ts || Date.now(),
  };
  return invitePath(encodeInvite(session));
}

async function shareInvite() {
  const inv = invite.value;
  if (!inv) return;
  const res = await sharePage({
    title: locale.t('groupOrder.shareTitle').replace('{h}', inv.host),
    desc: locale.t('groupOrder.shareDesc').replace('{s}', inv.shop),
    path: currentInvitePath(),
  });
  uni.showToast({ title: res === 'wechat' ? locale.t('groupOrder.shareWx') : locale.t('groupOrder.copied'), icon: 'none' });
}

function goHome() {
  uni.switchTab({ url: '/pages/home/index' });
}

function openInvite(s: GroupSession) {
  uni.navigateTo({ url: invitePath(encodeInvite(s)) });
}

async function copyInvite(s: GroupSession) {
  const encoded = encodeInvite(s);
  const res = await sharePage({
    title: locale.t('groupOrder.shareTitle').replace('{h}', s.host),
    desc: locale.t('groupOrder.shareDesc').replace('{s}', s.shop),
    path: invitePath(encoded),
  });
  uni.showToast({ title: res === 'wechat' ? locale.t('groupOrder.shareWx') : locale.t('groupOrder.copied'), icon: 'none' });
}

function finishSession(s: GroupSession) {
  uni.showModal({
    title: locale.t('groupOrder.finishTitle'),
    content: locale.t('groupOrder.finishConfirm'),
    success: (r) => {
      if (!r.confirm) return;
      removeSession(s.id);
      refreshList();
      uni.showToast({ title: locale.t('groupOrder.finishedToast'), icon: 'none' });
    },
  });
}

function goShop() {
  const inv = invite.value;
  if (!inv) return;
  const cid = inv.cid ? `&cid=${inv.cid}` : '';
  uni.navigateTo({
    url: `/pages/shop/menu?token=${encodeURIComponent(inv.token)}&name=${encodeURIComponent(inv.shop)}&routes=${encodeURIComponent(inv.routes)}${cid}`,
  });
}

/** 受邀方：取本店购物车（不切 tenant），生成本人回传链接 */
async function submitPick() {
  const inv = invite.value;
  if (!inv || submitting.value) return;
  submitting.value = true;
  try {
    const res: any = await getActiveOrderForChannel(inv.token);
    const lines = res?.activeOrder?.lines ?? [];
    const items = itemsFromLines(lines, nickname);
    if (!items.length) {
      uni.showToast({ title: locale.t('groupOrder.noCart'), icon: 'none' });
      return;
    }
    const payload: GroupPick = {
      gid: inv.id,
      from: nickname,
      token: inv.token,
      shop: inv.shop,
      items,
    };
    const encoded = encodePickShort(payload);
    pickLink.value = buildLink(encoded);
    const shared = await sharePage({
      title: locale.t('groupOrder.pickShareTitle').replace('{h}', nickname),
      desc: locale.t('groupOrder.pickShareDesc'),
      path: pickPath(encoded),
    });
    uni.showToast({
      title: shared === 'wechat' ? locale.t('groupOrder.pickShared') : locale.t('groupOrder.pickCopied'),
      icon: 'none',
    });
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('groupOrder.pickFail'), icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

function buildLink(encoded: string): string {
  if (typeof location === 'undefined') return pickPath(encoded);
  const base = location.origin + location.pathname.replace(/index\.html?$/i, '');
  return `${base}#${pickPath(encoded)}`;
}

function copyPickLink() {
  if (!pickLink.value) return;
  uni.setClipboardData({
    data: pickLink.value,
    success: () => uni.showToast({ title: locale.t('groupOrder.copied'), icon: 'none' }),
  });
}

function toggleCheck(i: number) {
  const next = checked.value.slice();
  next[i] = !next[i];
  checked.value = next;
}

/** 发起方：把好友清单合并加购到本店购物车，并记入本机拼单会话 */
async function mergePick() {
  const p = pick.value;
  if (!p || merging.value) return;
  const chosen = p.items.filter((_, i) => checked.value[i]);
  if (!chosen.length) {
    uni.showToast({ title: locale.t('groupOrder.noneChecked'), icon: 'none' });
    return;
  }
  merging.value = true;
  try {
    await tenant.switchTenant(p.token);
    let okCount = 0;
    for (const it of chosen) {
      try {
        const res: any = await addItemToOrderInChannel(p.token, it.variantId, it.qty);
        if (res?.addItemToOrder?.errorCode) continue;
        okCount++;
      } catch {
        /* 单项失败跳过，最后汇总提示 */
      }
    }
    // 合并清单：优先用链接里的会话 id，其次同店进行中会话
    let session = sessionOf(p.gid) || readSessions().find((s) => s.token === p.token && !s.closed);
    if (!session) {
      session = createSession({
        token: p.token,
        shop: p.shop,
        routes: '',
      });
    }
    session.items = mergeItems(session.items, chosen);
    session.participants = participantsOf(session.items);
    upsertSession(session);

    if (!okCount) throw new Error(locale.t('groupOrder.mergeFail'));
    uni.showToast({ title: locale.t('groupOrder.mergeDone').replace('{n}', String(okCount)), icon: 'none' });
    setTimeout(() => uni.redirectTo({ url: '/pkg-order/pages/cart' }), 500);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('groupOrder.mergeFail'), icon: 'none' });
  } finally {
    merging.value = false;
  }
}
</script>

<style scoped lang="scss">
.go-page { min-height: 100vh; background: $bg-color; padding: 20rpx 20rpx 60rpx; box-sizing: border-box; }
.go-empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx;
  &__ico { font-size: 72rpx; }
  &__txt { margin-top: 20rpx; font-size: 30rpx; color: $text-color; }
  &__hint { margin-top: 12rpx; font-size: 24rpx; color: $text-color-secondary; text-align: center; line-height: 1.6; }
  &__btn { margin-top: 32rpx; height: 76rpx; line-height: 76rpx; padding: 0 48rpx; border-radius: 38rpx;
    background: $brand-color; color: #fff; font-size: 28rpx; border: none; }
}
.go-list { display: flex; flex-direction: column; gap: 20rpx; }
.go-card { background: $surface; border-radius: $radius-md; padding: 24rpx;
  &.closed { opacity: .6; }
  &__head { display: flex; align-items: center; gap: 12rpx; }
  &__shop { font-size: 30rpx; font-weight: 600; color: $text-color; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__badge { font-size: 20rpx; color: $brand-color; background: $brand-color-light; border-radius: 6rpx; padding: 2rpx 10rpx; }
  &__badge--closed { color: $text-color-secondary; background: $bg-color; }
  &__meta { display: block; margin-top: 10rpx; font-size: 23rpx; color: $text-color-secondary; }
  &__items { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 12rpx; }
  &__item { font-size: 21rpx; color: $text-color-secondary; background: $bg-color; border-radius: 6rpx; padding: 4rpx 10rpx; }
  &__acts { display: flex; gap: 12rpx; margin-top: 18rpx; }
}
.go-btn { flex: 1; text-align: center; font-size: 25rpx; border-radius: 999rpx; padding: 14rpx 0;
  &--ghost { color: $brand-color; border: 1rpx solid $brand-color; background: $surface; }
  &--primary { color: #fff; background: $brand-color; }
  &--danger { color: $text-color-secondary; border: 1rpx solid $border-color; background: $surface; }
  &--lg { padding: 22rpx 0; font-size: 28rpx; font-weight: 600; }
  &.busy { opacity: .6; }
}
.go-hero { display: flex; align-items: center; gap: 18rpx; background: $surface; border-radius: $radius-md; padding: 24rpx;
  &__ico { font-size: 52rpx; }
  &__body { flex: 1; min-width: 0; }
  &__title { display: block; font-size: 30rpx; font-weight: 600; color: $text-color; }
  &__sub { display: block; margin-top: 6rpx; font-size: 24rpx; color: $text-color-secondary; }
}
.go-sec { background: $surface; border-radius: $radius-md; padding: 24rpx; margin-top: 20rpx;
  &__title { font-size: 26rpx; font-weight: 600; color: $text-color; }
  &__empty { margin-top: 16rpx; font-size: 24rpx; color: $text-color-placeholder; }
  &__hint { display: block; margin-top: 12rpx; font-size: 23rpx; color: $text-color-secondary; line-height: 1.7; }
}
.go-items { margin-top: 16rpx;
  &__sum { display: flex; align-items: center; justify-content: space-between; margin-top: 16rpx; padding-top: 16rpx;
    border-top: 1rpx solid $border-color; font-size: 24rpx; color: $text-color-secondary; }
  &__amt { font-size: 30rpx; font-weight: 600; color: $price-color; }
}
.go-item { display: flex; align-items: center; gap: 14rpx; padding: 14rpx 0; border-bottom: 1rpx solid $border-color;
  &.off { opacity: .45; }
  &__check { font-size: 32rpx; color: $brand-color; }
  &__img { border-radius: $radius-sm; flex-shrink: 0;
    &--txt { width: 80rpx; height: 80rpx; display: flex; align-items: center; justify-content: center;
      background: $brand-color-light; color: $brand-color; font-size: 30rpx; border-radius: $radius-sm; } }
  &__body { flex: 1; min-width: 0; }
  &__name { display: block; font-size: 26rpx; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__from { display: block; margin-top: 4rpx; font-size: 20rpx; color: $text-color-placeholder; }
  &__qty { font-size: 24rpx; color: $text-color-secondary; }
  &__price { font-size: 26rpx; color: $price-color; min-width: 120rpx; text-align: right; }
}
.go-foot { display: flex; gap: 16rpx; margin-top: 28rpx; }
.go-link { margin-top: 20rpx; background: $surface; border-radius: $radius-md; padding: 20rpx;
  &__label { display: block; font-size: 23rpx; color: $text-color-secondary; }
  &__url { display: block; margin: 12rpx 0; font-size: 20rpx; color: $brand-color; word-break: break-all; line-height: 1.5; }
}
</style>
