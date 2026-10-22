/** 浏览足迹：本地记录最近看过的商品（跨店、去重、最新在前），供「我的足迹」页展示 */

const KEY = 'browse_footprint';
export const FOOTPRINT_MAX = 40;

export interface FootprintItem {
    productId: string;
    variantId?: string;
    name: string;
    image?: string;
    price?: number;
    storeName?: string;
    channelToken?: string;
    channelId?: string;
    routes?: string;
    at: number;
}

export function readFootprint(): FootprintItem[] {
    try {
        const raw = uni.getStorageSync(KEY);
        const list = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
        if (!Array.isArray(list)) return [];
        return list
            .filter((it: any) => it && it.productId && it.name)
            .map((it: any) => ({ ...it, at: Number(it.at) || 0 }))
            .sort((a: FootprintItem, b: FootprintItem) => b.at - a.at)
            .slice(0, FOOTPRINT_MAX);
    } catch {
        return [];
    }
}

/** 记录一次浏览：同一商品（productId + variantId）只保留最新一条并置顶 */
export function recordFootprint(item: Omit<FootprintItem, 'at'>): FootprintItem[] {
    if (!item?.productId || !item?.name) return readFootprint();
    const list = readFootprint().filter(
        it => !(String(it.productId) === String(item.productId) && String(it.variantId ?? '') === String(item.variantId ?? '')),
    );
    const next = [{ ...item, at: Date.now() }, ...list].slice(0, FOOTPRINT_MAX);
    uni.setStorageSync(KEY, JSON.stringify(next));
    return next;
}

/** 删除单条足迹（productId + variantId 定位，未命中返回 false 不落盘） */
export function removeFootprint(productId: string, variantId?: string): boolean {
    const list = readFootprint();
    const next = list.filter(
        it => !(String(it.productId) === String(productId) && String(it.variantId ?? '') === String(variantId ?? '')),
    );
    if (next.length === list.length) return false;
    uni.setStorageSync(KEY, JSON.stringify(next));
    return true;
}

export function clearFootprint(): void {
    uni.removeStorageSync(KEY);
}
