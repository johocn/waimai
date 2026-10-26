<template>
  <view class="chat-page">
    <!-- 顶部会话信息条：订单号 + 状态 + 结束会话 -->
    <view class="chat-head" v-if="conversation">
      <view class="chat-head__info">
        <text class="chat-head__title">{{ headTitle }}</text>
        <text class="chat-head__sub">{{ conversation.status === 'closed' ? $t('chat.closedHint') : $t('chat.replyHint') }}</text>
      </view>
      <text v-if="conversation.status === 'open'" class="chat-head__close" @tap="onClose">{{ $t('chat.closeBtn') }}</text>
      <text v-else class="chat-head__close" @tap="restart">{{ $t('chat.restartBtn') }}</text>
    </view>

    <!-- 消息流 -->
    <scroll-view
      class="chat-body" scroll-y :scroll-into-view="anchor" :scroll-with-animation="true"
    >
      <view v-if="!messages.length && !loading" class="chat-empty">
        <text class="chat-empty__title">{{ $t('chat.emptyTitle') }}</text>
        <text class="chat-empty__hint">{{ $t('chat.emptyHint') }}</text>
      </view>
      <view
        v-for="m in messages" :key="m.id" :id="'msg-' + m.id"
        class="msg" :class="m.senderType === 'customer' ? 'msg--mine' : 'msg--admin'"
      >
        <view class="bubble">
          <text v-if="m.content" class="bubble__text">{{ m.content }}</text>
          <view v-if="m.images?.length" class="bubble__imgs">
            <VImage
              v-for="(img, i) in m.images" :key="i" :src="img" width="180rpx" height="180rpx"
              @tap="preview(m.images, i)"
            />
          </view>
        </view>
        <text class="time">{{ formatTime(m.createdAt) }}</text>
      </view>
      <view id="msg-bottom" class="chat-bottom" />
    </scroll-view>

    <!-- 输入区 -->
    <view class="chat-input" v-if="conversation && conversation.status === 'open'">
      <view class="chat-input__tools">
        <text class="chat-input__tool" @tap="pickImages">{{ $t('chat.imageBtn') }}</text>
        <text class="chat-input__count" v-if="draft.length">{{ draft.length }}/{{ MAX_LEN }}</text>
      </view>
      <view v-if="pendingImages.length" class="chat-input__imgs">
        <view v-for="(img, i) in pendingImages" :key="i" class="chat-input__img">
          <VImage :src="img" width="120rpx" height="120rpx" />
          <text class="chat-input__del" @tap="removeImage(i)">×</text>
        </view>
      </view>
      <view class="chat-input__row">
        <input
          class="chat-input__field" v-model="draft" :maxlength="MAX_LEN"
          :placeholder="$t('chat.placeholder')" confirm-type="send"
          @confirm="send" :disabled="sending"
        />
        <button class="chat-input__send" :class="{ off: !canSend }" :disabled="!canSend || sending" @tap="send">
          {{ sending ? $t('chat.sending') : $t('chat.sendBtn') }}
        </button>
      </view>
    </view>
    <view class="chat-input chat-input--closed" v-else-if="conversation">
      <text class="chat-input__closedText">{{ $t('chat.sessionClosed') }}</text>
      <button class="chat-input__send" @tap="restart">{{ $t('chat.restartBtn') }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../stores/locale';
import {
  startChat, fetchChatMessages, sendChatMessage, markChatRead, closeChat,
} from '../../api/queries/chat';
import { uploadCustomerAsset } from '../../api/mutations/upload';
import VImage from '../../components/VImage.vue';

const MAX_LEN = 500;
const POLL_MS = 5000;

const locale = useLocaleStore();
const conversation = ref<any>(null);
const messages = ref<any[]>([]);
const draft = ref('');
const pendingImages = ref<string[]>([]);
const loading = ref(true);
const sending = ref(false);
const anchor = ref('');

let timer: any = null;
let lastId: string | null = null;
let orderCode: string | null = null;

const headTitle = computed(() => {
  if (!conversation.value) return locale.t('chat.title');
  return conversation.value.orderCode
    ? locale.t('chat.orderTitle').replace('{code}', conversation.value.orderCode)
    : locale.t('chat.generalTitle');
});
const canSend = computed(() => !!draft.value.trim() || pendingImages.value.length > 0);

onLoad(async (query: any) => {
  orderCode = query?.orderCode ? String(query.orderCode) : null;
  const id = query?.conversationId ? String(query.conversationId) : '';
  try {
    if (id) {
      conversation.value = { id, status: 'open', orderCode };
    } else {
      conversation.value = await startChat(orderCode ?? undefined, query?.subject ? String(query.subject) : undefined);
    }
    await loadLatest();
    markRead();
    startPolling();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('chat.loadFail'), icon: 'none' });
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => stopPolling());

/** 首屏：拉最近一页并定位到底部 */
async function loadLatest() {
  if (!conversation.value?.id) return;
  const rows: any[] = await fetchChatMessages(conversation.value.id, null, 30);
  messages.value = rows;
  lastId = rows.length ? String(rows[rows.length - 1].id) : null;
  scrollToBottom();
}

/** 增量拉取（5s）：只追加新消息，避免整页重绘 */
async function poll() {
  if (!conversation.value?.id) return;
  try {
    const rows: any[] = lastId
      ? await fetchChatMessages(conversation.value.id, lastId, 30)
      : await fetchChatMessages(conversation.value.id, null, 30);
    if (!rows.length) return;
    const known = new Set(messages.value.map(m => String(m.id)));
    const fresh = rows.filter(r => !known.has(String(r.id)));
    if (!fresh.length) return;
    messages.value = [...messages.value, ...fresh];
    lastId = String(fresh[fresh.length - 1].id);
    scrollToBottom();
    markRead();
  } catch {
    // 轮询失败静默：网络抖动不打断会话
  }
}

function startPolling() {
  stopPolling();
  timer = setInterval(poll, POLL_MS);
}
function stopPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function scrollToBottom() {
  anchor.value = '';
  setTimeout(() => { anchor.value = 'msg-bottom'; }, 30);
}

async function markRead() {
  const unread = Number(conversation.value?.unreadForCustomer ?? 0);
  if (!conversation.value?.id || (!unread && messages.value.length === 0)) return;
  try {
    const res = await markChatRead(conversation.value.id);
    if (res) conversation.value = res;
  } catch {
    // 已读失败不影响对话
  }
}

async function send() {
  if (!canSend.value || sending.value || !conversation.value?.id) return;
  const text = draft.value.trim();
  sending.value = true;
  try {
    const row = await sendChatMessage(
      conversation.value.id,
      text || undefined,
      pendingImages.value.length ? [...pendingImages.value] : undefined,
    );
    if (row) {
      messages.value = [...messages.value, row];
      lastId = String(row.id);
      scrollToBottom();
    }
    draft.value = '';
    pendingImages.value = [];
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('chat.sendFail'), icon: 'none' });
  } finally {
    sending.value = false;
  }
}

function pickImages() {
  const left = 6 - pendingImages.value.length;
  if (left <= 0) {
    uni.showToast({ title: locale.t('chat.maxImages'), icon: 'none' });
    return;
  }
  uni.chooseImage({
    count: left,
    sizeType: ['compressed'],
    success: async (res: any) => {
      const paths: string[] = res?.tempFilePaths ?? [];
      for (const path of paths) {
        try {
          const asset = await uploadCustomerAsset(path);
          pendingImages.value = [...pendingImages.value, asset.source];
        } catch (e: any) {
          uni.showToast({ title: e?.message || locale.t('chat.uploadFail'), icon: 'none' });
        }
      }
    },
  });
}

function removeImage(i: number) {
  pendingImages.value = pendingImages.value.filter((_, idx) => idx !== i);
}

function preview(images: string[], index: number) {
  if (!images?.length) return;
  uni.previewImage({ urls: images, current: images[index] });
}

function onClose() {
  uni.showModal({
    title: locale.t('chat.closeTitle'),
    content: locale.t('chat.closeConfirm'),
    success: async (m) => {
      if (!m.confirm) return;
      try {
        const res = await closeChat(conversation.value.id);
        if (res) conversation.value = res;
        stopPolling();
        uni.showToast({ title: locale.t('chat.closed'), icon: 'none' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('chat.actionFail'), icon: 'none' });
      }
    },
  });
}

/** 结束后重新开一条会话（沿用同一订单，后端置旧会话 closed 后新建） */
async function restart() {
  try {
    conversation.value = await startChat(orderCode ?? undefined);
    messages.value = [];
    lastId = null;
    await loadLatest();
    startPolling();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('chat.actionFail'), icon: 'none' });
  }
}

function formatTime(d: string) {
  if (!d) return '';
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
</script>

<style lang="scss" scoped>
.chat-page {
  display: flex; flex-direction: column; height: 100vh; background: $bg-color;
}
.chat-head {
  display: flex; align-items: center; justify-content: space-between; gap: 16rpx;
  padding: 20rpx 24rpx; background: $surface; border-bottom: 1rpx solid $border-color;
  &__info { display: flex; flex-direction: column; gap: 4rpx; flex: 1; min-width: 0; }
  &__title { font-size: 28rpx; font-weight: bold; color: #1f2329; }
  &__sub { font-size: 22rpx; color: $text-color-placeholder; }
  &__close { font-size: 24rpx; color: $brand-color; }
}
.chat-body { flex: 1; padding: 20rpx 24rpx; box-sizing: border-box; }
.chat-bottom { height: 20rpx; }
.chat-empty {
  display: flex; flex-direction: column; align-items: center; gap: 12rpx; padding: 120rpx 40rpx;
  &__title { font-size: 28rpx; font-weight: bold; color: $text-color-secondary; }
  &__hint { font-size: 24rpx; color: $text-color-placeholder; text-align: center; line-height: 1.6; }
}
.msg {
  display: flex; flex-direction: column; margin-bottom: 24rpx;
  &--mine { align-items: flex-end; }
  &--admin { align-items: flex-start; }
  .bubble {
    max-width: 78%; border-radius: 18rpx; padding: 18rpx 20rpx;
    display: flex; flex-direction: column; gap: 10rpx;
    &__text { font-size: 26rpx; line-height: 1.6; word-break: break-all; }
    &__imgs { display: flex; flex-wrap: wrap; gap: 10rpx; }
  }
  &--mine .bubble { background: $brand-color; .bubble__text { color: #fff; } }
  &--admin .bubble { background: $surface; .bubble__text { color: #1f2329; } }
  .time { font-size: 20rpx; color: $text-color-placeholder; margin-top: 6rpx; }
}
.chat-input {
  background: $surface; border-top: 1rpx solid $border-color; padding: 16rpx 24rpx 24rpx;
  &__tools { display: flex; align-items: center; justify-content: space-between; padding-bottom: 8rpx; }
  &__tool { font-size: 24rpx; color: $brand-color; }
  &__count { font-size: 20rpx; color: $text-color-placeholder; }
  &__imgs { display: flex; gap: 12rpx; padding-bottom: 12rpx; }
  &__img {
    position: relative; width: 120rpx; height: 120rpx; border-radius: 12rpx; overflow: hidden;
    background: $bg-color;
  }
  &__del {
    position: absolute; top: 0; right: 0; width: 34rpx; height: 34rpx; line-height: 32rpx;
    text-align: center; font-size: 26rpx; color: #fff; background: rgba(0, 0, 0, 0.5); border-bottom-left-radius: 12rpx;
  }
  &__row { display: flex; align-items: center; gap: 16rpx; }
  &__field {
    flex: 1; height: 76rpx; background: $bg-color; border-radius: 999rpx;
    padding: 0 26rpx; font-size: 26rpx;
  }
  &__send {
    height: 76rpx; line-height: 76rpx; padding: 0 36rpx; border-radius: 999rpx;
    background: $brand-color; color: #fff; font-size: 26rpx; font-weight: bold;
    &.off { background: #c9ced6; }
  }
  &--closed { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
  &__closedText { font-size: 24rpx; color: $text-color-placeholder; }
}
</style>
