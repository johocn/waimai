/**
 * 收藏商品价格快照：收藏时记下当时价格，收藏页刷新当前价后对比得出降幅。
 * 仅本地记录；旧收藏首次刷新时以当前价建立基线，避免误报降价。
 */
const KEY = 'fav_price_snapshots';
const MAX_ENTRIES = 300;

type SnapshotMap = Record<string, number>;

function readAll(): SnapshotMap {
    try {
        const raw = uni.getStorageSync(KEY);
        const obj = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
        return obj && typeof obj === 'object' ? obj : {};
    } catch {
        return {};
    }
}

function writeAll(map: SnapshotMap) {
    try {
        uni.setStorageSync(KEY, JSON.stringify(map));
    } catch {
        /* 存储满/隐私模式失败时静默，不影响收藏 */
    }
}

/** 收藏时的价格快照（分）；无记录返回 null */
export function priceSnapshot(variantId: string | number | null | undefined): number | null {
    if (variantId == null || variantId === '') return null;
    const v = Number(readAll()[String(variantId)]);
    return Number.isFinite(v) && v > 0 ? v : null;
}

/** 记录收藏时价格（分）；价格无效时忽略 */
export function rememberFavPrice(variantId: string | number | null | undefined, price: number | null | undefined): void {
    if (variantId == null || variantId === '') return;
    const fen = Math.round(Number(price));
    if (!Number.isFinite(fen) || fen <= 0) return;
    const map = readAll();
    const key = String(variantId);
    delete map[key];
    map[key] = fen;
    const keys = Object.keys(map);
    if (keys.length > MAX_ENTRIES) {
        for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete map[k];
    }
    writeAll(map);
}

/** 取消收藏时清除快照 */
export function forgetFavPrice(variantId: string | number | null | undefined): void {
    if (variantId == null || variantId === '') return;
    const map = readAll();
    const key = String(variantId);
    if (!(key in map)) return;
    delete map[key];
    writeAll(map);
}

export interface PriceDrop {
    /** 收藏时原价（分） */
    original: number;
    /** 降幅（分） */
    diff: number;
}

/** 当前价低于快照价时返回降幅；无快照、无现价、未降价返回 null */
export function priceDrop(variantId: string | number | null | undefined, currentPrice: number | null | undefined): PriceDrop | null {
    const snap = priceSnapshot(variantId);
    const cur = Math.round(Number(currentPrice));
    if (snap == null || !Number.isFinite(cur) || cur <= 0 || cur >= snap) return null;
    return { original: snap, diff: snap - cur };
}
