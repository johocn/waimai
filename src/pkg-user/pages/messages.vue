<template>
  <view class="msg-page">
    <view class="msg-head">
      <view class="msg-head__left">
        <text class="msg-head__title">{{ tab === 'msg' ? $t('messages.inbox') : $t('messages.noticeTitle') }}</text>
        <text class="msg-head__sub">{{ tab === 'msg' ? $t('messages.unread').replace('{n}', String(messages.unreadCount)) : $t('messages.unread').replace('{n}', String(inboxUnread)) }}</text>
      </view>
      <view class="msg-head__action" v-if="(tab === 'msg' ? messages.unreadCount : inboxUnread) > 0" @click="markAll">
        {{ $t('messages.markAll') }}
      </view>
    </view>

    <view class="msg-tabs">
      <view class="msg-tab" :class="{ on: tab === 'msg' }" @click="switchTab('msg')">
        <text>{{ $t('messages.tabOrders') }}</text>
        <text v-if="messages.unreadCount > 0" class="msg-tab__badge">{{ messages.unreadCount > 99 ? '99+' : messages.unreadCount }}</text>
      </view>
      <view class="msg-tab" :class="{ on: tab === 'inbox' }" @click="switchTab('inbox')">
        <text>{{ $t('messages.tabNotice') }}</text>
        <text v-if="inboxUnread > 0" class="msg-tab__badge">{{ inboxUnread > 99 ? '99+' : inboxUnread }}</text>
      </view>
    </view>

    <view v-if="!logged" class="msg-empty">
      <text class="msg-empty__ico">🔔</text>
      <text class="msg-empty__text">{{ $t('messages.needLogin') }}</text>
      <button class="msg-empty__btn" @click="doLogin">{{ $t('messages.login') }}</button>
    </view>

    <template v-if="logged && tab === 'msg'">
    <view v-if="messages.loading && !messages.loaded" class="msg-tip">{{ $t('messages.loading') }}</view>

    <view v-else-if="!messages.items.length" class="msg-empty">
      <text class="msg-empty__ico">📭</text>
      <text class="msg-empty__text">{{ $t('messages.empty') }}</text>
    </view>

    <view class="msg-list" v-else>
      <view
        v-for="m in messages.items"
        :key="m.id"
        class="msg-card"
        :class="{ 'msg-card--unread': !m.readAt }"
        @tap="openMessage(m)"
      >
        <view class="msg-card__ico">{{ iconOf(m) }}</view>
        <view class="msg-card__body">
          <view class="msg-card__top">
            <text class="msg-card__title">{{ m.title }}</text>
            <text class="msg-card__time">{{ timeText(m.createdAt) }}</text>
          </view>
          <text class="msg-card__desc" :class="{ 'msg-card__desc--full': expandedId === m.id }">{{ m.body }}</text>
          <view class="msg-card__foot">
            <text class="msg-card__go">{{ expandedId === m.id ? $t('messages.collapse') : $t('messages.viewDetail') }} ›</text>
            <text v-if="!m.readAt" class="msg-card__dot"></text>
          </view>
        </view>
      </view>
    </view>
    </template>

    <template v-else-if="logged">
      <view v-if="inboxLoading && !inbox.length" class="msg-tip">{{ $t('messages.loading') }}</view>
      <view v-else-if="!inbox.length" class="msg-empty">
        <text class="msg-empty__ico">📬</text>
        <text class="msg-empty__text">{{ $t('messages.noticeEmpty') }}</text>
      </view>
      <view class="msg-list" v-else>
        <view
          v-for="m in inbox" :key="m.id" class="msg-card"
          :class="{ 'msg-card--unread': !m.isRead }" @tap="openNotice(m)"
        >
          <view class="msg-card__ico">{{ noticeIcon(m.scene) }}</view>
          <view class="msg-card__body">
            <view class="msg-card__top">
              <text class="msg-card__title">{{ m.title }}</text>
              <text class="msg-card__time">{{ timeText(m.createdAt) }}</text>
            </view>
            <text class="msg-card__desc" :class="{ 'msg-card__desc--full': expandedId === m.id }">{{ m.content }}</text>
            <view class="msg-card__foot">
              <text v-if="m.link" class="msg-card__go">{{ $t('messages.viewDetail') }} ›</text>
              <text v-else class="msg-card__go" @tap.stop="toggleNotice(m)">{{ expandedId === m.id ? $t('messages.collapse') : $t('messages.viewDetail') }} ›</text>
              <text v-if="!m.isRead" class="msg-card__dot"></text>
            </view>
          </view>
        </view>
      </view>
    </template>

    <view class="msg-note">{{ $t('messages.note') }}</view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useMessagesStore } from '../../stores/messages';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';
import type { MyMessage } from '../../api/queries/message';
import { getInboxUnreadCount, getMyInbox, markInboxRead, type InboxMessage } from '../../api/queries/inbox';

const messages = useMessagesStore();
const authStore = useAuthStore();
const locale = useLocaleStore();
const logged = computed(() => !!(authStore.token || authStore.isLoggedIn));
const expandedId = ref('');

const tab = ref<'msg' | 'inbox'>('msg');
const inbox = ref<InboxMessage[]>([]);
const inboxUnread = ref(0);
const inboxLoading = ref(false);
const inboxLoaded = ref(false);

onShow(() => {
  void messages.load();
  if (logged.value) {
    void loadInboxCount();
    if (tab.value === 'inbox') void loadInbox();
  }
});

async function loadInboxCount() {
  try {
    inboxUnread.value = await getInboxUnreadCount();
  } catch { /* 未登录/渠道无通知时静默 */ }
}

async function loadInbox() {
  if (inboxLoading.value) return;
  inboxLoading.value = true;
  try {
    const res = await getMyInbox();
    inbox.value = res.items || [];
    inboxUnread.value = inbox.value.filter(m => !m.isRead).length;
    inboxLoaded.value = true;
  } catch {
    inbox.value = [];
  } finally {
    inboxLoading.value = false;
  }
}

function switchTab(next: 'msg' | 'inbox') {
  if (tab.value === next) return;
  tab.value = next;
  if (next === 'inbox' && logged.value && !inboxLoaded.value) void loadInbox();
}

const NOTICE_ICONS: Array<[RegExp, string]> = [
  [/order/, '🧾'],
  [/pay|refund/, '💳'],
  [/coupon|promo|discount/, '🎫'],
  [/deliver|rider|shipping/, '🛵'],
  [/member|point|growth/, '⭐'],
];

function noticeIcon(scene: string): string {
  const key = String(scene || '').toLowerCase();
  const hit = NOTICE_ICONS.find(([re]) => re.test(key));
  return hit ? hit[1] : '📣';
}

function openLink(link: string) {
  const raw = String(link || '').trim();
  if (!raw) return;
  if (/^https?:\/\//.test(raw)) {
    uni.navigateTo({ url: '/pages/webview/index?url=' + encodeURIComponent(raw) });
    return;
  }
  let path = raw.replace(/^#/, '');
  if (!path.startsWith('/')) path = '/' + path;
  uni.navigateTo({ url: path, fail: () => uni.switchTab({ url: path }) });
}

async function openNotice(m: InboxMessage) {
  if (!m.isRead) {
    m.isRead = true;
    inboxUnread.value = Math.max(0, inboxUnread.value - 1);
    try { await markInboxRead(m.id); } catch { /* 标记失败不阻塞阅读 */ }
  }
  if (m.link) {
    openLink(m.link);
    return;
  }
  expandedId.value = expandedId.value === m.id ? '' : m.id;
}

function toggleNotice(m: InboxMessage) {
  expandedId.value = expandedId.value === m.id ? '' : m.id;
}

const ORDER_WORDS = ['订单', 'order', '支付', 'payment', '配送', 'delivery'];
const COUPON_WORDS = ['券', 'coupon', '优惠', 'discount'];

function iconOf(m: MyMessage): string {
  const text = `${m.title || ''} ${m.body || ''}`.toLowerCase();
  if (ORDER_WORDS.some(w => text.includes(w.toLowerCase()))) return '🧾';
  if (COUPON_WORDS.some(w => text.includes(w.toLowerCase()))) return '🎫';
  return '📣';
}

function timeText(at?: string | null): string {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function openMessage(m: MyMessage) {
  expandedId.value = expandedId.value === m.id ? '' : m.id;
  if (!m.readAt) await messages.markRead(m.id);
}

async function markAll() {
  uni.showLoading({ title: locale.t('messages.marking') });
  if (tab.value === 'msg') {
    await messages.markAllRead();
  } else {
    const unread = inbox.value.filter(m => !m.isRead);
    await Promise.all(unread.map(async (m) => {
      try {
        await markInboxRead(m.id);
        m.isRead = true;
      } catch { /* 单条失败忽略 */ }
    }));
    inboxUnread.value = 0;
  }
  uni.hideLoading();
}

function doLogin() {
  authStore.requireLogin();
}
</script>

<style scoped lang="scss">
.msg-page { min-height: 100vh; background: $bg-color; padding: 20rpx 24rpx 40rpx; box-sizing: border-box; }
.msg-head { display: flex; align-items: center; justify-content: space-between; padding: 8rpx 4rpx 20rpx;
  &__left { display: flex; align-items: baseline; gap: 16rpx; }
  &__title { font-size: 34rpx; font-weight: 600; color: $text-color; }
  &__sub { font-size: 24rpx; color: $text-color-secondary; }
  &__action { font-size: 24rpx; color: $brand-color; padding: 8rpx 12rpx; }
}
.msg-tip { text-align: center; color: $text-color-secondary; font-size: 26rpx; padding: 80rpx 0; }
.msg-tabs { display: flex; gap: 12rpx; padding: 0 4rpx 20rpx; }
.msg-tab {
  flex: 1; height: 68rpx; border-radius: 34rpx; background: $surface;
  display: flex; align-items: center; justify-content: center; gap: 8rpx;
  font-size: 26rpx; color: $text-color-secondary;
  &.on { background: $brand-color; color: #fff; font-weight: 600; }
  &__badge {
    min-width: 30rpx; height: 30rpx; line-height: 30rpx; padding: 0 8rpx; border-radius: 15rpx;
    background: #ff4d4f; color: #fff; font-size: 20rpx; text-align: center;
  }
  &.on .msg-tab__badge { background: #fff; color: $brand-color; }
}
.msg-list { display: flex; flex-direction: column; gap: 16rpx; }
.msg-card { display: flex; gap: 16rpx; background: $surface; border-radius: $radius-md; padding: 24rpx; position: relative;
  &--unread { box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06); }
  &__ico { width: 64rpx; height: 64rpx; border-radius: 999rpx; background: $brand-color-light; display: flex; align-items: center; justify-content: center; font-size: 30rpx; flex-shrink: 0; }
  &__body { flex: 1; min-width: 0; }
  &__top { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
  &__title { font-size: 28rpx; font-weight: 600; color: $text-color; }
  &__time { font-size: 22rpx; color: $text-color-placeholder; flex-shrink: 0; }
  &__desc { display: block; font-size: 24rpx; color: $text-color-secondary; margin-top: 8rpx; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    &--full { -webkit-line-clamp: unset; display: block; white-space: pre-wrap; }
  }
  &__foot { display: flex; align-items: center; justify-content: space-between; margin-top: 10rpx; }
  &__go { font-size: 24rpx; color: $brand-color; }
  &__dot { width: 14rpx; height: 14rpx; border-radius: 999rpx; background: $brand-color; }
}
.msg-empty { padding: 120rpx 0; display: flex; flex-direction: column; align-items: center; gap: 16rpx;
  &__ico { font-size: 72rpx; }
  &__text { font-size: 26rpx; color: $text-color-secondary; }
  &__btn { margin-top: 12rpx; background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; padding: 0 48rpx; height: 76rpx; line-height: 76rpx; }
}
.msg-note { padding: 24rpx 8rpx; text-align: center; font-size: 22rpx; color: $text-color-placeholder; }
</style>
