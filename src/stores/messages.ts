import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchStoreList } from '../api/queries/waimai';
import { getOrdersForChannel } from '../api/queries/order';
import { getMyCoupons } from '../api/queries/coupon';
import { getMyReviews } from '../api/queries/review';
import { useAuthStore } from './auth';
import { getSessionToken } from '../api/client';

const READ_KEY = 'waimai_msg_read';
const EXPIRING_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 消息种类：直接映射到页面文案与跳转目标 */
export type MessageKind = 'waitPay' | 'delivering' | 'waitReview' | 'couponExpiring';

export interface WaimaiMessage {
    key: string;
    kind: MessageKind;
    /** 排序与展示用时间戳（ms） */
    at: number;
    /** 订单号（订单类消息） */
    code?: string;
    /** 券名称（券类消息） */
    couponName?: string;
    /** 剩余天数（券类消息） */
    daysLeft?: number;
    orderId?: string;
    couponId?: string;
}

function readReadSet(): Set<string> {
    try {
        const raw = uni.getStorageSync(READ_KEY);
        const arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
        return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch {
        return new Set();
    }
}

/**
 * 消息中心：由订单 / 优惠券现有接口本地聚合，不新增后端。
 * 已读状态存本地（key 集合），跨设备不同步。
 */
export const useMessagesStore = defineStore('messages', () => {
    const auth = useAuthStore();
    const items = ref<WaimaiMessage[]>([]);
    const loading = ref(false);
    const loaded = ref(false);
    const readKeys = ref<Set<string>>(readReadSet());

    const unreadCount = computed(() => items.value.filter(m => !readKeys.value.has(m.key)).length);

    function persistRead() {
        uni.setStorageSync(READ_KEY, JSON.stringify(Array.from(readKeys.value)));
    }

    function markRead(key: string) {
        if (!key) return;
        const next = new Set(readKeys.value);
        next.add(key);
        readKeys.value = next;
        persistRead();
    }

    function markAllRead() {
        const next = new Set(readKeys.value);
        items.value.forEach(m => next.add(m.key));
        readKeys.value = next;
        persistRead();
    }

    function clear() {
        items.value = [];
        loaded.value = false;
    }

    async function load() {
        if (!auth.isLoggedIn && !getSessionToken()) {
            clear();
            return;
        }
        loading.value = true;
        try {
            const [storesRes, couponsRes, reviewsRes] = await Promise.allSettled([
                fetchStoreList(),
                getMyCoupons('UNUSED'),
                getMyReviews(),
            ]);
            const stores = storesRes.status === 'fulfilled' ? (storesRes.value ?? []) : [];
            const out: WaimaiMessage[] = [];

            // 券临期：未使用券中 N 天内到期
            if (couponsRes.status === 'fulfilled') {
                const now = Date.now();
                for (const c of ((couponsRes.value as any)?.myCoupons ?? [])) {
                    const exp = c?.expiredAt ? new Date(c.expiredAt).getTime() : 0;
                    if (!exp || exp <= now) continue;
                    const daysLeft = Math.ceil((exp - now) / DAY_MS);
                    if (daysLeft > EXPIRING_DAYS) continue;
                    out.push({
                        key: `coupon-${c.id}`,
                        kind: 'couponExpiring',
                        at: exp,
                        couponId: String(c.id),
                        couponName: c?.template?.name || '',
                        daysLeft,
                    });
                }
            }

            // 订单类：逐渠道聚合（会话全局、channel 隔离），按订单 id 去重
            const reviewedLineIds = new Set<string>();
            if (reviewsRes.status === 'fulfilled') {
                for (const r of ((reviewsRes.value as any)?.myReviews ?? [])) {
                    if (r?.status === 'deleted' || !r?.orderLineId) continue;
                    reviewedLineIds.add(String(r.orderLineId));
                }
            }
            const tokens = Array.from(new Set(stores.map((s: any) => s?.channelToken).filter(Boolean) as string[]));
            const pages = await Promise.allSettled(tokens.map(t => getOrdersForChannel(t, { take: 20 })));
            const seen = new Set<string>();
            for (const page of pages) {
                if (page.status !== 'fulfilled') continue;
                for (const o of ((page.value as any)?.myOrders?.items ?? [])) {
                    if (!o?.id || seen.has(o.id)) continue;
                    seen.add(o.id);
                    const at = new Date(o.updatedAt || o.createdAt || 0).getTime() || Date.now();
                    const base = { key: `order-${o.id}-${o.state}`, at, code: o.code, orderId: String(o.id) };
                    if (o.state === 'ArrangingPayment') {
                        out.push({ ...base, kind: 'waitPay' });
                    } else if (o.state === 'PaymentAuthorized' || o.state === 'PaymentSettled') {
                        out.push({ ...base, kind: 'delivering' });
                    } else if (o.state === 'Delivered') {
                        const unreviewed = (o.lines ?? []).some((l: any) => !reviewedLineIds.has(String(l.id)));
                        if (unreviewed) out.push({ ...base, kind: 'waitReview' });
                    }
                }
            }

            items.value = out.sort((a, b) => b.at - a.at).slice(0, 50);
            loaded.value = true;
        } finally {
            loading.value = false;
        }
    }

    return { items, loading, loaded, unreadCount, readKeys, load, markRead, markAllRead, clear };
});
