/**
 * 收藏商品补货提醒（纯本地）：
 * - 订阅清单存本机（restock_watch），记录 variantId / 商品名 / 渠道，用于下次进入收藏页比对库存；
 * - 库存快照同样本地缓存（fav_stock_snapshot），网络未回来时先按上次快照展示「已售罄 / 已到货」。
 * shop-api 的 stockLevel 为枚举 IN_STOCK / LOW_STOCK / OUT_OF_STOCK / null（null=不跟踪库存，视为在售）。
 */

const WATCH_KEY = 'restock_watch';
const SNAPSHOT_KEY = 'fav_stock_snapshot';

export interface RestockWatchItem {
    variantId: string;
    name: string;
    channelToken: string;
    at: number;
}

function readJson<T>(key: string, fallback: T): T {
    try {
        const raw = uni.getStorageSync(key);
        const obj = typeof raw === 'string' ? JSON.parse(raw || '') : raw;
        return obj ?? fallback;
    } catch {
        return fallback;
    }
}

export function readRestockWatch(): RestockWatchItem[] {
    const list = readJson<any[]>(WATCH_KEY, []);
    return Array.isArray(list)
        ? list.filter((x) => x && x.variantId).map((x) => ({
            variantId: String(x.variantId),
            name: String(x.name ?? ''),
            channelToken: String(x.channelToken ?? ''),
            at: Number(x.at) || 0,
        }))
        : [];
}

export function isRestockWatched(variantId: string): boolean {
    return readRestockWatch().some((x) => x.variantId === String(variantId));
}

/** 订阅 / 取消订阅，返回订阅后的完整清单 */
export function toggleRestockWatch(item: { variantId: string; name?: string; channelToken?: string }): RestockWatchItem[] {
    const vid = String(item.variantId ?? '');
    if (!vid) return readRestockWatch();
    const list = readRestockWatch();
    const next = list.some((x) => x.variantId === vid)
        ? list.filter((x) => x.variantId !== vid)
        : [{ variantId: vid, name: String(item.name ?? ''), channelToken: String(item.channelToken ?? ''), at: Date.now() }, ...list];
    uni.setStorageSync(WATCH_KEY, JSON.stringify(next));
    return next;
}

export type StockState = 'ok' | 'out';

/** 变体是否在售：OUT_OF_STOCK 才是售罄，null 视为商家不跟踪库存 */
export function stockStateOf(variant: any): StockState {
    if (!variant || variant.enabled === false) return 'out';
    if (variant.stockLevel === 'OUT_OF_STOCK') return 'out';
    if (typeof variant.stockLevel === 'number' && variant.stockLevel <= 0) return 'out';
    return 'ok';
}

export function readStockSnapshot(): Record<string, StockState> {
    const obj = readJson<Record<string, StockState>>(SNAPSHOT_KEY, {});
    return obj && typeof obj === 'object' ? obj : {};
}

export function writeStockSnapshot(map: Record<string, StockState>): void {
    try {
        uni.setStorageSync(SNAPSHOT_KEY, JSON.stringify(map));
    } catch {
        /* 存储不可用时跳过，仅影响离线快照 */
    }
}
