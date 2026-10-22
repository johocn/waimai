import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchFavoriteStores, toggleFavoriteStore, fetchFavoriteVariants, toggleFavoriteVariant } from '../api/queries/favorite';
import { fetchProductListForChannel } from '../api/queries/waimai';
import { priceSnapshot, rememberFavPrice, forgetFavPrice } from '../utils/fav-price';
import { useAuthStore } from './auth';

const FAV_KEY = 'favorite_stores';
const RECENT_KEY = 'recent_stores';
const RECENT_MAX = 6;
const VARIANT_KEY = 'favorite_variants';
const ITEM_KEY = 'recent_items';
const ITEM_MAX = 8;

export interface RecentStore {
    channelId?: string;
    channelToken: string;
    name: string;
    routes: string;
    at: number;
}

/** 商品收藏：远端只存 variantId/channelId，本地另存展示元数据（名称/图/价/店名） */
export interface VariantFavorite {
    variantId: string;
    channelId?: string;
    channelToken?: string;
    productId?: string;
    name?: string;
    image?: string;
    price?: number;
    storeName?: string;
    at?: number;
}

/** 常买商品：下单成功后写入，首页横排「一键加购」 */
export interface RecentItem {
    channelId?: string;
    channelToken: string;
    variantId: string;
    productId?: string;
    name: string;
    price: number;
    image?: string;
    storeName?: string;
    routes?: string;
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

function validVariantItems(input: any): VariantFavorite[] {
    if (!Array.isArray(input)) return [];
    return input
        .filter((v: any) => v && v.variantId)
        .map((v: any) => ({
            variantId: String(v.variantId),
            channelId: v.channelId != null ? String(v.channelId) : undefined,
            channelToken: v.channelToken ? String(v.channelToken) : undefined,
            productId: v.productId != null ? String(v.productId) : undefined,
            name: v.name ? String(v.name) : undefined,
            image: v.image ? String(v.image) : undefined,
            price: v.price != null ? Number(v.price) : undefined,
            storeName: v.storeName ? String(v.storeName) : undefined,
            at: Number(v.at) || 0,
        }));
}

function validRecentItems(input: any): RecentItem[] {
    if (!Array.isArray(input)) return [];
    return input
        .filter((r: any) => r && r.variantId && r.name)
        .map((r: any) => ({
            channelId: r.channelId != null ? String(r.channelId) : undefined,
            channelToken: String(r.channelToken ?? ''),
            variantId: String(r.variantId),
            productId: r.productId != null ? String(r.productId) : undefined,
            name: String(r.name),
            price: Number(r.price) || 0,
            image: r.image ? String(r.image) : undefined,
            storeName: r.storeName ? String(r.storeName) : undefined,
            routes: r.routes ? String(r.routes) : undefined,
            at: Number(r.at) || 0,
        }))
        .slice(0, ITEM_MAX);
}

// 商品收藏元数据补齐：同一渠道只尝试一次（失败不无限重试）
const attemptedMetaTokens = new Set<string>();

/**
 * 商家收藏 + 常买店铺 + 商品收藏 + 常买商品（本地优先，登录后云端同步）。
 * - 商家/商品收藏：游客只写本地；登录后远端为准，失败回滚。
 * - 常买店铺/常买商品：纯本地记录。
 */
export const useFavoritesStore = defineStore('favorites', () => {
    const auth = useAuthStore();
    const ids = ref<string[]>(readJSON<any[]>(FAV_KEY, []).map((v: any) => String(v)));
    const recents = ref<RecentStore[]>(validRecents(readJSON<any[]>(RECENT_KEY, [])));
    const variantItems = ref<VariantFavorite[]>(validVariantItems(readJSON<any[]>(VARIANT_KEY, [])));
    const recentItems = ref<RecentItem[]>(validRecentItems(readJSON<any[]>(ITEM_KEY, [])));
    const syncing = ref(false);

    const idSet = computed(() => new Set(ids.value));
    const variantIdSet = computed(() => new Set(variantItems.value.map(v => v.variantId)));

    function persist() {
        uni.setStorageSync(FAV_KEY, JSON.stringify(ids.value));
    }

    function persistRecents() {
        uni.setStorageSync(RECENT_KEY, JSON.stringify(recents.value));
    }

    function persistVariants() {
        uni.setStorageSync(VARIANT_KEY, JSON.stringify(variantItems.value));
    }

    function persistItems() {
        uni.setStorageSync(ITEM_KEY, JSON.stringify(recentItems.value));
    }

    function isFavorite(channelId?: string | number | null): boolean {
        return channelId != null && idSet.value.has(String(channelId));
    }

    function isVariantFavorite(variantId?: string | number | null): boolean {
        return variantId != null && variantIdSet.value.has(String(variantId));
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

    /** 商品收藏 toggle；record 携带展示元数据，远端只同步 id */
    async function toggleVariant(record: VariantFavorite): Promise<boolean> {
        const id = record?.variantId == null ? '' : String(record.variantId);
        if (!id) return false;
        const before = variantItems.value.slice();
        const willAdd = !variantIdSet.value.has(id);
        const snapBefore = priceSnapshot(id);
        variantItems.value = willAdd
            ? [...variantItems.value, { ...record, variantId: id, at: Date.now() }]
            : variantItems.value.filter(v => v.variantId !== id);
        persistVariants();
        // 收藏时记价格快照，取消收藏时清除（用于价格下降提醒）
        if (willAdd) rememberFavPrice(id, record.price ?? null);
        else forgetFavPrice(id);
        if (auth.isLoggedIn) {
            try {
                const remote = await toggleFavoriteVariant(id, String(record.channelId ?? ''));
                variantItems.value = mergeRemoteVariants(remote);
                persistVariants();
            } catch (e) {
                variantItems.value = before;
                persistVariants();
                // 远端失败回滚：快照同步回滚，避免误报降价
                if (willAdd) forgetFavPrice(id);
                else if (snapBefore != null) rememberFavPrice(id, snapBefore);
                throw e;
            }
        }
        return !willAdd;
    }

    /** 远端列表为准，本地已有元数据（名称/图/价）保留 */
    function mergeRemoteVariants(remote: Array<{ variantId: string; channelId: string }>): VariantFavorite[] {
        const local = new Map(variantItems.value.map(v => [v.variantId, v]));
        return remote.map(r => {
            const hit = local.get(r.variantId);
            return hit ? { ...hit, channelId: r.channelId } : { variantId: r.variantId, channelId: r.channelId };
        });
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
        }
        try {
            let remoteVariants = await fetchFavoriteVariants();
            if (!remoteVariants.length && variantItems.value.length) {
                for (const v of variantItems.value) {
                    if (!v.channelId) continue;
                    try { await toggleFavoriteVariant(v.variantId, v.channelId); } catch { /* 单个失败不阻断 */ }
                }
                remoteVariants = await fetchFavoriteVariants().catch(() => remoteVariants);
            }
            variantItems.value = mergeRemoteVariants(remoteVariants);
            persistVariants();
        } catch {
            // 保持本地镜像
        } finally {
            syncing.value = false;
        }
    }

    /**
     * 回填远端收藏的展示元数据：按渠道并发拉商品，variantId 命中后补 name/image/price/storeName。
     * 每渠道只尝试一次；失败静默，不阻塞首页渲染。
     */
    async function hydrateVariantMeta(stores: any[]) {
        const tokenOf = (v: VariantFavorite): string => {
            if (v.channelToken) return v.channelToken;
            const hit = stores.find((s: any) => String(s.channelId) === String(v.channelId));
            return hit?.channelToken ?? '';
        };
        const tokens = new Set<string>();
        for (const v of variantItems.value) {
            if (v.name) continue;
            const t = tokenOf(v);
            if (t && !attemptedMetaTokens.has(t)) tokens.add(t);
        }
        if (!tokens.size) return;
        const loaded = await Promise.all(Array.from(tokens).map(async (token) => {
            attemptedMetaTokens.add(token);
            const list = await fetchProductListForChannel(token).catch(() => [] as any[]);
            return [token, list] as const;
        }));
        const variantMap = new Map<string, { product: any; variant: any }>();
        for (const [token, list] of loaded) {
            for (const p of list) {
                for (const variant of p.variants ?? []) {
                    variantMap.set(`${token}:${variant.id}`, { product: p, variant });
                }
            }
        }
        let changed = false;
        const next = variantItems.value.map((v) => {
            if (v.name) return v;
            const token = tokenOf(v);
            const hit = variantMap.get(`${token}:${v.variantId}`);
            if (!hit) return v;
            changed = true;
            // 老收藏首次回填时以当前价建立快照基线，避免打开收藏页即误报降价
            if (priceSnapshot(v.variantId) == null) rememberFavPrice(v.variantId, hit.variant.priceWithTax);
            return {
                ...v,
                channelToken: token,
                productId: String(hit.product.id),
                name: hit.product.name,
                image: hit.product.featuredAsset?.preview,
                price: hit.variant.priceWithTax,
                storeName: v.storeName || stores.find((s: any) => s.channelToken === token)?.name,
            };
        });
        if (changed) {
            variantItems.value = next;
            persistVariants();
        }
    }

    /**
     * 刷新收藏商品当前价（收藏页打开时调用）。
     * 缺失快照的旧收藏以当前价建立基线；仅价格变化时落盘。
     */
    function refreshVariantPrices(prices: Map<string, number>) {
        if (!prices?.size) return;
        let changed = false;
        const next = variantItems.value.map((v) => {
            const cur = Math.round(Number(prices.get(String(v.variantId))));
            if (!Number.isFinite(cur) || cur <= 0) return v;
            if (priceSnapshot(v.variantId) == null) rememberFavPrice(v.variantId, cur);
            if (Number(v.price) === cur) return v;
            changed = true;
            return { ...v, price: cur };
        });
        if (changed) {
            variantItems.value = next;
            persistVariants();
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

    /** 常买商品：下单成功后记录，最多 8 条，同 variant 去重前置 */
    function touchRecentItem(item: Omit<RecentItem, 'at'> & { at?: number }) {
        if (!item?.variantId || !item?.name) return;
        const entry: RecentItem = {
            channelId: item.channelId != null ? String(item.channelId) : undefined,
            channelToken: String(item.channelToken ?? ''),
            variantId: String(item.variantId),
            productId: item.productId != null ? String(item.productId) : undefined,
            name: String(item.name),
            price: Number(item.price) || 0,
            image: item.image ? String(item.image) : undefined,
            storeName: item.storeName ? String(item.storeName) : undefined,
            routes: item.routes ? String(item.routes) : undefined,
            at: Date.now(),
        };
        recentItems.value = [
            entry,
            ...recentItems.value.filter(x => x.variantId !== entry.variantId),
        ].slice(0, ITEM_MAX);
        persistItems();
    }

    return {
        ids, recents, variantItems, recentItems, syncing,
        isFavorite, isVariantFavorite, toggle, toggleVariant,
        loadRemote, hydrateVariantMeta, refreshVariantPrices, touchRecent, touchRecentItem,
    };
});
