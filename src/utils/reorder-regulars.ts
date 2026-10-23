/** 常点清单：跨订单聚合「点过几次」的商品，按店铺分组，供一键再来一单（第 36 轮） */

export interface RoStoreOrders {
    /** 店铺渠道 token */
    token: string;
    /** 店铺展示名 */
    name: string;
    /** 该渠道的历史订单（myOrders） */
    orders: any[];
}

export interface RoItem {
    /** 聚合键：店铺 token + 规格 id */
    key: string;
    variantId: string;
    productId: string;
    storeToken: string;
    storeName: string;
    name: string;
    image?: string;
    /** 下过几次（按订单去重计数） */
    times: number;
    /** 最近一次下单时间（ISO） */
    lastAt: string;
    /** 最近一次下单数量（默认加购数量） */
    quantity: number;
    /** 最近一次单价（分） */
    unitPriceFen: number;
}

export interface RoSection {
    token: string;
    name: string;
    /** 该店常点商品合计次数（店铺排序用） */
    times: number;
    items: RoItem[];
}

export interface RoStockInfo {
    name: string;
    image?: string;
    priceFen: number;
    available: boolean;
}

export interface RoItemWithStock extends RoItem {
    available: boolean;
}

const CANCELLED = 'Cancelled';

function safeTime(v: any): number {
    const t = Date.parse(String(v ?? ''));
    return Number.isFinite(t) ? t : 0;
}

/** 聚合键：店铺 + 规格，跨订单同一商品归并为一条 */
export function roKey(token: string, variantId: string): string {
    return `${token}:${variantId}`;
}

/**
 * 跨店跨订单聚合常点商品：同一规格只保留一条，times = 下过几次订单，
 * quantity / unitPriceFen / name / lastAt 取最近一单；已取消订单不计入。
 */
export function roExtract(groups: RoStoreOrders[] | null | undefined, maxOrdersPerStore = 20): RoItem[] {
    const map = new Map<string, RoItem>();
    (groups ?? []).forEach((g: any) => {
        const token = String(g?.token ?? '');
        if (!token) return;
        const storeName = String(g?.name ?? '');
        const orders = [...(g?.orders ?? [])]
            .filter((o: any) => o && String(o.state ?? '') !== CANCELLED)
            .sort((a: any, b: any) => safeTime(b.createdAt) - safeTime(a.createdAt))
            .slice(0, Math.max(0, maxOrdersPerStore));
        orders.forEach((o: any) => {
            const seen = new Set<string>();
            (o?.lines ?? []).forEach((l: any) => {
                const variantId = String(l?.productVariant?.id ?? '');
                if (!variantId || seen.has(variantId)) return;
                seen.add(variantId);
                const key = roKey(token, variantId);
                const at = String(o?.createdAt ?? '');
                const qty = Math.max(1, Number(l?.quantity) || 1);
                const price = Number(l?.unitPriceWithTax) || 0;
                const prev = map.get(key);
                if (prev) {
                    prev.times += 1;
                    // orders 已按时间降序，首次写入即为最近一单，不再覆盖
                    return;
                }
                map.set(key, {
                    key,
                    variantId,
                    productId: String(l?.productVariant?.productId ?? ''),
                    storeToken: token,
                    storeName,
                    name: String(l?.productVariant?.name ?? ''),
                    image: l?.featuredAsset?.preview || undefined,
                    times: 1,
                    lastAt: at,
                    quantity: qty,
                    unitPriceFen: price,
                });
            });
        });
    });
    return roSort(map);
}

function roSort(map: Map<string, RoItem>): RoItem[] {
    return [...map.values()].sort((a, b) => {
        if (b.times !== a.times) return b.times - a.times;
        const diff = safeTime(b.lastAt) - safeTime(a.lastAt);
        if (diff) return diff;
        return a.key.localeCompare(b.key);
    });
}

/** 按店铺分组：店铺按常点次数降序，组内按常点次数/最近时间排序 */
export function roGroups(items: RoItem[] | null | undefined): RoSection[] {
    const map = new Map<string, RoSection>();
    (items ?? []).forEach((it) => {
        let s = map.get(it.storeToken);
        if (!s) {
            s = { token: it.storeToken, name: it.storeName, times: 0, items: [] };
            map.set(it.storeToken, s);
        }
        s.times += it.times;
        s.items.push(it);
    });
    return [...map.values()]
        .map((s) => ({ ...s, items: roSortItems(s.items) }))
        .sort((a, b) => {
            if (b.times !== a.times) return b.times - a.times;
            return a.token.localeCompare(b.token);
        });
}

/** 组内排序：常点次数降序 → 最近下单降序 */
export function roSortItems(items: RoItem[]): RoItem[] {
    return [...(items ?? [])].sort((a, b) => {
        if (b.times !== a.times) return b.times - a.times;
        const diff = safeTime(b.lastAt) - safeTime(a.lastAt);
        if (diff) return diff;
        return a.key.localeCompare(b.key);
    });
}

/** 汇总：常点款数 + 店铺数 */
export function roTotals(items: RoItem[] | null | undefined): { count: number; stores: number } {
    const list = items ?? [];
    return { count: list.length, stores: new Set(list.map((i) => i.storeToken)).size };
}

/** 距离最近一次下单的天数（0=今天）；无效时间返回 null */
export function roDaysAgo(iso: any, now: number = Date.now()): number | null {
    const t = safeTime(iso);
    if (!t) return null;
    const base = typeof now === 'number' ? now : safeTime(now);
    const diff = base - t;
    if (diff < 0) return 0;
    return Math.floor(diff / 86400000);
}

/** 商品目录 → 规格可售信息（名称/图片/单价/是否有货） */
export function roStockMap(products: any[] | null | undefined): Map<string, RoStockInfo> {
    const map = new Map<string, RoStockInfo>();
    (products ?? []).forEach((p: any) => {
        (p?.variants ?? []).forEach((v: any) => {
            const id = String(v?.id ?? '');
            if (!id) return;
            const stock = v?.stockLevel;
            const available = v?.enabled !== false && (stock == null || stock === 'IN_STOCK' || stock === 'LOW_STOCK');
            map.set(id, {
                name: String(p?.name ?? ''),
                image: p?.featuredAsset?.preview || undefined,
                priceFen: Number(v?.priceWithTax) || 0,
                available,
            });
        });
    });
    return map;
}

/** 用当前店铺商品目录刷新常点项：补商品名/图片/现价，并标记是否可售 */
export function roApplyStock(items: RoItem[] | null | undefined, stock: Map<string, RoStockInfo> | null | undefined): RoItemWithStock[] {
    return (items ?? []).map((it) => {
        const s = stock?.get(it.variantId);
        return {
            ...it,
            name: s?.name || it.name,
            image: s?.image || it.image,
            unitPriceFen: s && s.priceFen > 0 ? s.priceFen : it.unitPriceFen,
            available: !!s?.available,
        };
    });
}
