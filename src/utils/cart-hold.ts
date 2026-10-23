/**
 * 稍后再买（购物车暂存）：把商品从服务端购物车移到本机暂存清单，
 * 恢复时按当前价格重新加购，避免下架/变价行残留。按店铺 token 隔离。
 */
const KEY = 'cart_hold_buckets';
/** 单店暂存上限，避免本地清单无限增长 */
export const HOLD_MAX = 30;

export interface HoldItem {
    variantId: string;
    name: string;
    image?: string;
    /** 分 */
    price: number;
    qty: number;
    /** 规格文案（如「大份 / 微辣」） */
    options?: string;
}

export interface HoldBucket {
    token: string;
    shop: string;
    channelId?: string;
    routes: string;
    items: HoldItem[];
    updatedAt: number;
    /** 写入序号：同一毫秒内多次写入时保证「最近的在先」稳定 */
    seq?: number;
}

export interface HoldShopMeta {
    token: string;
    shop: string;
    channelId?: string;
    routes: string;
}

type BucketMap = Record<string, HoldBucket>;

function readAll(): BucketMap {
    try {
        const raw: any = uni.getStorageSync(KEY);
        if (!raw) return {};
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!obj || typeof obj !== 'object') return {};
        const out: BucketMap = {};
        for (const [token, b] of Object.entries(obj)) {
            const bucket = b as HoldBucket;
            if (!bucket || !Array.isArray(bucket.items)) continue;
            out[token] = { ...bucket, token, items: bucket.items.filter((i) => i && i.variantId) };
        }
        return out;
    } catch {
        return {};
    }
}

function writeAll(map: BucketMap): void {
    try {
        uni.setStorageSync(KEY, JSON.stringify(map));
    } catch {
        /* 忽略 */
    }
}

/** 全局递增写入序号：跨店铺也保持「最近操作的在最前」 */
function nextSeq(map: BucketMap): number {
    let max = 0;
    for (const b of Object.values(map)) max = Math.max(max, Number(b.seq) || 0);
    return max + 1;
}

/** 同规格累加数量，否则追加 */
export function mergeHoldItems(base: HoldItem[], add: HoldItem[]): HoldItem[] {
    const out = base.map((x) => ({ ...x }));
    for (const it of add) {
        if (!it || !it.variantId) continue;
        const qty = Math.max(1, Number(it.qty) || 1);
        const hit = out.find((x) => String(x.variantId) === String(it.variantId));
        if (hit) hit.qty += qty;
        else out.push({ ...it, qty });
    }
    return out.slice(0, HOLD_MAX);
}

export function readHold(token: string): HoldItem[] {
    if (!token) return [];
    return [...(readAll()[token]?.items ?? [])];
}

export function holdTotalQty(items: HoldItem[]): number {
    return items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
}

/** 把订单行移入暂存（同规格合并），返回暂存后的清单 */
export function holdLines(token: string, meta: HoldShopMeta, lines: any[]): HoldItem[] {
    if (!token) return [];
    const add: HoldItem[] = (lines ?? []).map((l: any) => {
        const v = l?.productVariant ?? {};
        const opts = (v?.options ?? []).map((o: any) => o?.name).filter(Boolean);
        const unit = Number(l?.unitPriceWithTax ?? v?.priceWithTax ?? 0);
        return {
            variantId: String(v.id ?? ''),
            name: String(v.name || ''),
            image: v.featuredAsset?.preview || l?.featuredAsset?.preview,
            price: Math.round(Number.isFinite(unit) ? unit : Number(l?.linePriceWithTax || 0) / Math.max(1, Number(l?.quantity) || 1)),
            qty: Math.max(1, Number(l?.quantity) || 1),
            options: opts.length ? opts.join(' / ') : undefined,
        };
    }).filter((x) => !!x.variantId);
    const all = readAll();
    const bucket = all[token];
    const items = mergeHoldItems(bucket?.items ?? [], add);
    all[token] = {
        token,
        shop: meta.shop || bucket?.shop || '',
        channelId: meta.channelId ?? bucket?.channelId,
        routes: meta.routes || bucket?.routes || '',
        items,
        updatedAt: Date.now(),
        seq: nextSeq(all),
    };
    writeAll(all);
    return [...items];
}

/** 改数量：qty <= 0 视为移除 */
export function setHeldQty(token: string, variantId: string, qty: number): HoldItem[] {
    const all = readAll();
    const bucket = all[token];
    if (!bucket) return [];
    const n = Math.round(Number(qty) || 0);
    const items = n <= 0
        ? bucket.items.filter((i) => String(i.variantId) !== String(variantId))
        : bucket.items.map((i) => (String(i.variantId) === String(variantId) ? { ...i, qty: n } : i));
    all[token] = { ...bucket, items, updatedAt: Date.now(), seq: nextSeq(all) };
    writeAll(all);
    return [...items];
}

export function removeHeld(token: string, variantId: string): HoldItem[] {
    return setHeldQty(token, variantId, 0);
}

export function clearHold(token: string): void {
    const all = readAll();
    if (all[token]) {
        delete all[token];
        writeAll(all);
    }
}

export function readBucket(token: string): HoldBucket | null {
    return readAll()[token] ?? null;
}

/** 全部暂存桶（最近更新的在前；同毫秒用写入序号兜底，保证顺序稳定） */
export function readAllBuckets(): HoldBucket[] {
    return Object.values(readAll())
        .filter((b) => Array.isArray(b.items) && b.items.length > 0)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || (b.seq || 0) - (a.seq || 0));
}

/** 桶内单件数量增减（保持 >= 1，减到 0 请用 removeHeld） */
export function bumpHeld(token: string, variantId: string, delta: number): HoldItem[] {
    const cur = readHold(token).find((i) => String(i.variantId) === String(variantId));
    const next = Math.max(1, (Number(cur?.qty) || 1) + delta);
    return setHeldQty(token, variantId, next);
}
