import { getStoreStatus } from './store-status';

export interface StoreLike {
    name: string;
    tags: string[];
    channelId?: string | number;
    paused?: boolean;
    businessHours?: string | null;
    deliveryMinutes?: number | null;
    minOrderAmount?: number | null;
    deliveryFee?: number | null;
    promoText?: string;
}

export type StoreSort = 'default' | 'fastest' | 'minOrder' | 'freeDelivery';

export interface StoreFilterOptions {
    /** 仅营业中 */
    openOnly?: boolean;
    /** 免配送费（deliveryFee === 0；null 视为未配置，不算免费） */
    freeDelivery?: boolean;
    /** 起送价上限（元） */
    minOrderMax?: number | null;
    /** 有优惠（promoText 非空） */
    hasPromo?: boolean;
}

/** spec §12.2：搜索（店名包含、不分大小写）优先于分类 pills；未配置 tag 的店铺归入「全部」 */
export function filterStores(list: StoreLike[], keyword: string, tag: string): StoreLike[] {
    let out = list;
    const kw = keyword.trim().toLowerCase();
    if (kw) {
        out = out.filter(s => s.name.toLowerCase().includes(kw));
        return out;
    }
    if (tag && tag !== '全部') {
        out = out.filter(s => s.tags.includes(tag));
    }
    return out;
}

export function applyStoreFilters(list: StoreLike[], opts: StoreFilterOptions = {}): StoreLike[] {
    let out = list;
    if (opts.openOnly) out = out.filter(s => !s.paused && getStoreStatus(s.businessHours).state !== 'closed');
    if (opts.freeDelivery) out = out.filter(s => Number(s.deliveryFee) === 0);
    if (opts.hasPromo) out = out.filter(s => !!s.promoText);
    if (opts.minOrderMax != null) {
        const cap = opts.minOrderMax * 100;
        out = out.filter(s => s.minOrderAmount != null && s.minOrderAmount <= cap);
    }
    return out;
}

/** 排序：收藏店恒置前（default 也生效）；空值（未配置）排最后 */
export function sortStores(list: StoreLike[], sort: StoreSort, favoriteIds: string[] = []): StoreLike[] {
    const favSet = new Set((favoriteIds ?? []).map(String));
    const favFirst = (a: StoreLike, b: StoreLike) =>
        Number(favSet.has(String(b.channelId))) - Number(favSet.has(String(a.channelId)));
    const out = [...list];
    if (sort === 'fastest') {
        return out.sort((a, b) => favFirst(a, b) || (a.deliveryMinutes ?? Infinity) - (b.deliveryMinutes ?? Infinity));
    }
    if (sort === 'minOrder') {
        return out.sort((a, b) => favFirst(a, b) || (a.minOrderAmount ?? Infinity) - (b.minOrderAmount ?? Infinity));
    }
    if (sort === 'freeDelivery') {
        return out.sort((a, b) => favFirst(a, b) || (a.deliveryFee ?? Infinity) - (b.deliveryFee ?? Infinity));
    }
    return favSet.size ? out.sort(favFirst) : out;
}
