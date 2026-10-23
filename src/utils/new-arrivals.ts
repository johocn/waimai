/**
 * 新品尝鲜（第 34 轮）：跨店聚合近期上架商品的纯函数层。
 * 上架时间取 Vendure Product.createdAt；无 createdAt 的商品不参与（避免把老商品误当新品）。
 */
import { hotHasStock, hotMinPriceFen, hotSales } from './hot-sale';
import { rankVariantId } from './hot-rank';

/** 新品窗口（天）：聚合页固定只看近 30 天，页面 Tab 再在结果内收窄 */
export const NEW_WINDOW_DAYS = 30;
const DAY_MS = 86400000;

export interface NewEntry {
    id: string;
    name: string;
    image?: string;
    /** 可售规格最低价（分） */
    priceFen: number;
    /** 月售（无则 0） */
    sales: number;
    /** ISO 上架时间 */
    createdAt: string;
    /** 上架天数（整数，未来时间按 0 处理） */
    ageDays: number;
    storeToken: string;
    storeName: string;
    /** 默认加购规格 id（可售中最低价），无可售规格为空串 */
    variantId: string;
}

export interface NewStoreGroup {
    token: string;
    name: string;
    products: any[];
}

/** 上架天数：向下取整；未来时间归 0；无效时间返回 null */
export function naAgeDays(createdAt: any, now: number | Date): number | null {
    const t = new Date(createdAt).getTime();
    const n = now instanceof Date ? now.getTime() : Number(now);
    if (!Number.isFinite(t) || !Number.isFinite(n)) return null;
    return Math.max(0, Math.floor((n - t) / DAY_MS));
}

/** 新鲜度分档：0 = 今日；≤3 = 三天内；≤7 = 本周；其余 = 近期 */
export function naFreshKey(ageDays: number | null): 'today' | 'd3' | 'week' | 'recent' | 'unknown' {
    if (ageDays == null || !Number.isFinite(ageDays)) return 'unknown';
    if (ageDays <= 0) return 'today';
    if (ageDays <= 3) return 'd3';
    if (ageDays <= 7) return 'week';
    return 'recent';
}

/**
 * 跨店聚合：仅收「在售 + createdAt 有效 + 上架天数 ≤ windowDays」的商品；
 * 排序：上架时间降序（新在前），同日按 id 数值升序稳定排序。
 */
export function naAggregate(
    groups: NewStoreGroup[] | null | undefined,
    now: number | Date,
    windowDays = NEW_WINDOW_DAYS,
): NewEntry[] {
    const list: NewEntry[] = [];
    (groups ?? []).forEach((g: any) => {
        if (!g || !g.token) return;
        const storeToken = String(g.token);
        const storeName = String(g.name ?? '');
        (g.products ?? []).forEach((p: any) => {
            if (!hotHasStock(p)) return;
            const ageDays = naAgeDays(p?.createdAt, now);
            if (ageDays == null || ageDays > windowDays) return;
            list.push({
                id: String(p?.id ?? ''),
                name: String(p?.name ?? ''),
                image: p?.featuredAsset?.preview || undefined,
                priceFen: hotMinPriceFen(p),
                sales: hotSales(p),
                createdAt: String(p?.createdAt ?? ''),
                ageDays,
                storeToken,
                storeName,
                variantId: rankVariantId(p),
            });
        });
    });
    return naSort(list);
}

/** 时间降序 + id 稳定排序（Tab 收窄窗口后无需重排，但保持同一份排序语义） */
export function naSort(list: NewEntry[]): NewEntry[] {
    return [...(list ?? [])].sort((a, b) => {
        const diff = (a.ageDays || 0) - (b.ageDays || 0);
        if (diff) return diff;
        const ia = Number(a.id);
        const ib = Number(b.id);
        if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
        return String(a.id ?? '').localeCompare(String(b.id ?? ''));
    });
}

/** 时间窗口收窄：days ≤ 0 或 ≥ 30 视为「全部」（聚合层已限 30 天） */
export function naFilterWindow(list: NewEntry[], days: number): NewEntry[] {
    const d = Number(days);
    if (!Number.isFinite(d) || d <= 0 || d >= NEW_WINDOW_DAYS) return [...(list ?? [])];
    return (list ?? []).filter((e) => (e.ageDays || 0) <= d);
}

/** 新鲜度角标文案参数：today 无参，其余带天数 */
export function naFreshDays(e: NewEntry): number {
    return Math.max(0, Number(e?.ageDays) || 0);
}
