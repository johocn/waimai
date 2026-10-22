import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
    getMyMessages,
    getMyUnreadMessageCount,
    markMessageRead,
    type MyMessage,
} from '../api/queries/message';
import { useAuthStore } from './auth';
import { getSessionToken } from '../api/client';

/**
 * 消息中心：读取后端 message-plugin 的 myMessages / myUnreadMessageCount，
 * 已读回写 markMessageRead（服务端持久化，跨设备同步）。
 */
export const useMessagesStore = defineStore('messages', () => {
    const auth = useAuthStore();
    const items = ref<MyMessage[]>([]);
    const loading = ref(false);
    const loaded = ref(false);
    const unreadCount = ref(0);

    const hasUnread = computed(() => unreadCount.value > 0);

    function clear() {
        items.value = [];
        unreadCount.value = 0;
        loaded.value = false;
    }

    function loggedIn(): boolean {
        return Boolean(auth.isLoggedIn || getSessionToken());
    }

    async function load() {
        if (!loggedIn()) {
            clear();
            return;
        }
        loading.value = true;
        try {
            const [list, unread] = await Promise.allSettled([
                getMyMessages({ take: 50 }),
                getMyUnreadMessageCount(),
            ]);
            items.value = list.status === 'fulfilled' ? (list.value.items || []) : [];
            if (unread.status === 'fulfilled') {
                unreadCount.value = unread.value;
            } else {
                unreadCount.value = items.value.filter(m => !m.readAt).length;
            }
            loaded.value = true;
        } finally {
            loading.value = false;
        }
    }

    async function markRead(id: string) {
        const target = items.value.find(m => m.id === id);
        if (!target || target.readAt) return;
        try {
            await markMessageRead(id);
            target.readAt = new Date().toISOString();
            unreadCount.value = Math.max(0, unreadCount.value - 1);
        } catch (e) {
            console.warn('[messages] markRead failed', e);
        }
    }

    async function markAllRead() {
        const unread = items.value.filter(m => !m.readAt);
        if (!unread.length) return;
        await Promise.allSettled(unread.map(m => markMessageRead(m.id)));
        const now = new Date().toISOString();
        unread.forEach(m => { m.readAt = now; });
        unreadCount.value = 0;
    }

    return { items, loading, loaded, unreadCount, hasUnread, load, markRead, markAllRead, clear };
});
