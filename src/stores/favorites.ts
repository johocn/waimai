import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchFavoriteStores, toggleFavoriteStore } from '../api/queries/favorite';
import { useAuthStore } from './auth';

const FAV_KEY = 'favorite_stores';
const RECENT_KEY = 'recent_stores';
const RECENT_MAX = 6;

export interface RecentStore {
    channelId?: string;
    channelToken: string;
    name: string;
    routes: string;
    at: number;
}

/** uni H5 存储可能返回字符串（旧数据）或对象（uni 序列化），统一兼容 */
function readJSON<T>(key: string, fallback: T): T {
    try {
        const raw = uni.getStorageSync(key);
        if (!raw) return fallback;
        return typeof raw === 'string' ? (JSON.parse(raw) as T) : (raw as T);
    } catch {
        return fallback;
    }
}

function validRecents(input: any): RecentStore[] {
    if (!Array.isArray(input)) return [];
    return input
        .filter((r: any) => r && r.channelToken && r.name)
        .map((r: any) => ({ channelId: r.channelId != null ? String(r.channelId) : undefined, channelToken: String(r.channelToken), name: String(r.name), routes: String(r.routes ?? ''), at: Number(r.at) || 0 }))
        .slice(0, RECENT_MAX);
}

/**
 * 商家收藏 + 常买店铺（本地优先，登录后云端同步）。
 * - 游客：只写本地 favorite_stores；
 * - 登录：toggle 走 campusToggleFavoriteStore，失败回滚；本地多出的收藏仅在云端为空时批量补写（迁移旧收藏）。
 * - 常买：本地 recent_stores，按进店记录，最多 6 条。
 */
export const useFavoritesStore = defineStore('favorites', () => {
    const auth = useAuthStore();
    const ids = ref<string[]>(readJSON<any[]>(FAV_KEY, []).map((v: any) => String(v)));
    const recents = ref<RecentStore[]>(validRecents(readJSON<any[]>(RECENT_KEY, [])));
    const syncing = ref(false);

    const idSet = computed(() => new Set(ids.value));

    function persist() {
        uni.setStorageSync(FAV_KEY, JSON.stringify(ids.value));
    }

    function persistRecents() {
        uni.setStorageSync(RECENT_KEY, JSON.stringify(recents.value));
    }

    function isFavorite(channelId?: string | number | null): boolean {
        return channelId != null && idSet.value.has(String(channelId));
    }

    /** 返回操作后的收藏状态（true=已收藏）；登录态远端失败会回滚并抛出 */
    async function toggle(channelId: string | number): Promise<boolean> {
        const id = channelId == null ? '' : String(channelId);
        if (!id) return false;
        const before = ids.value.slice();
        const willAdd = !idSet.value.has(id);
        ids.value = willAdd ? [...ids.value, id] : ids.value.filter(x => x !== id);
        persist();
        if (auth.isLoggedIn) {
            try {
                ids.value = (await toggleFavoriteStore(id)).map(String);
                persist();
            } catch (e) {
                ids.value = before;
                persist();
                throw e;
            }
        }
        return !willAdd;
    }

    /** 登录后拉取云端收藏；云端为空且本地有收藏时，先把本地补写上去（游客收藏迁移） */
    async function loadRemote() {
        if (!auth.isLoggedIn || syncing.value) return;
        syncing.value = true;
        try {
            let remote = await fetchFavoriteStores();
            if (!remote.length && ids.value.length) {
                for (const id of ids.value) {
                    try { await toggleFavoriteStore(id); } catch { /* 单个失败不阻断 */ }
                }
                remote = await fetchFavoriteStores().catch(() => remote);
            }
            ids.value = remote.map(String);
            persist();
        } catch {
            // 未登录/网络异常：保持本地镜像
        } finally {
            syncing.value = false;
        }
    }

    function touchRecent(store: { channelId?: string | number | null; channelToken: string; name: string; routes?: string }) {
        if (!store?.channelToken || !store?.name) return;
        const cid = store.channelId != null ? String(store.channelId) : '';
        const item: RecentStore = {
            channelId: cid || undefined,
            channelToken: String(store.channelToken),
            name: String(store.name),
            routes: String(store.routes ?? ''),
            at: Date.now(),
        };
        recents.value = [
            item,
            ...recents.value.filter(r => (cid ? r.channelId !== cid : r.channelToken !== item.channelToken)),
        ].slice(0, RECENT_MAX);
        persistRecents();
    }

    return { ids, recents, syncing, isFavorite, toggle, loadRemote, touchRecent };
});
