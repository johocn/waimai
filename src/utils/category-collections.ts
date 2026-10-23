/** 品类合集（跨店按品类逛）：把各店商品按一级品类聚合，页面按品类分组展示 */
import { hotHasStock, hotMinPriceFen, hotSales } from './hot-sale';
import { rankCategory, rankVariantId } from './hot-rank';

export interface CatEntry {
    id: string;
    name: string;
    image?: string;
    /** 可售规格最低价（分） */
    priceFen: number;
    /** 月售 */
    sales: number;
    /** 一级品类名，聚合时剔除空值 */
    category: string;
    storeToken: string;
    storeName: string;
    variantId: string;
}

export interface CatStoreGroup {
    token: string;
    name: string;
    products: any[];
}

export interface CatSection {
    /** 品类名（分组键） */
    key: string;
    name: string;
    /** 组内商品款数 */
    count: number;
    /** 组内涉及店铺数 */
    storeCount: number;
    items: CatEntry[];
}

/** 未分类商品的兜底分组键（生产商品可能未配品类，不能直接丢弃） */
export const CAT_OTHER = '__other__';

/** 商品所属一级品类：与热销榜同口径（__root_collection__ 子级，缺失返回空串） */
export function catCategory(g: any): string {
    return rankCategory(g);
}

/** 组内排序：月售降序，并列按 id 数值升序稳定排序 */
export function catSort(list: CatEntry[]): CatEntry[] {
    return [...(list ?? [])].sort((a: CatEntry, b: CatEntry) => {
        const diff = (b.sales || 0) - (a.sales || 0);
        if (diff) return diff;
        const ia = Number(a.id);
        const ib = Number(b.id);
        if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
        return String(a.id ?? '').localeCompare(String(b.id ?? ''));
    });
}

/**
 * 跨店聚合：收「在售」商品；空 token 组跳过，单店失败传空 products。
 * 无一级品类的商品不丢弃，category 记空串，由 catGroups 归入「其他好物」兜底分组。
 */
export function catAggregate(groups: CatStoreGroup[] | null | undefined): CatEntry[] {
    const list: CatEntry[] = [];
    (groups ?? []).forEach((g: any) => {
        if (!g || !g.token) return;
        const storeToken = String(g.token);
        const storeName = String(g.name ?? '');
        (g.products ?? []).forEach((p: any) => {
            if (!hotHasStock(p)) return;
            const category = catCategory(p);
            list.push({
                id: String(p?.id ?? ''),
                name: String(p?.name ?? ''),
                image: p?.featuredAsset?.preview || undefined,
                priceFen: hotMinPriceFen(p),
                sales: hotSales(p),
                category,
                storeToken,
                storeName,
                variantId: rankVariantId(p),
            });
        });
    });
    return catSort(list);
}

/** 品类 Tab（不含「全部」）：款数降序，并列按首次出现顺序，最多 max 个 */
export function catCategories(list: CatEntry[], max = 8): string[] {
    const order: string[] = [];
    const count = new Map<string, number>();
    (list ?? []).forEach((e) => {
        if (!e.category) return;
        if (!count.has(e.category)) order.push(e.category);
        count.set(e.category, (count.get(e.category) || 0) + 1);
    });
    return order.sort((a, b) => (count.get(b) || 0) - (count.get(a) || 0)).slice(0, Math.max(0, max));
}

/** 按品类分组：组序按款数降序（并列按首次出现顺序），组内按 catSort；无品类归入 CAT_OTHER */
export function catGroups(list: CatEntry[], maxPerSection = 10): CatSection[] {
    const order: string[] = [];
    const map = new Map<string, { key: string; name: string; items: CatEntry[] }>();
    (list ?? []).forEach((e) => {
        const key = e.category || CAT_OTHER;
        let g = map.get(key);
        if (!g) {
            g = { key, name: key, items: [] };
            map.set(key, g);
            order.push(key);
        }
        g.items.push(e);
    });
    return order
        .map((k) => map.get(k)!)
        .map((g) => {
            const items = catSort(g.items).slice(0, Math.max(0, maxPerSection));
            return {
                key: g.key,
                name: g.name,
                count: g.items.length,
                storeCount: new Set(g.items.map((i) => i.storeToken)).size,
                items,
            };
        })
        .sort((a, b) => b.count - a.count);
}

/** 按品类过滤（cat 为空 = 全部；CAT_OTHER = 未分类商品） */
export function catFilter(list: CatEntry[], cat: string): CatEntry[] {
    const c = String(cat ?? '');
    if (!c) return [...(list ?? [])];
    if (c === CAT_OTHER) return (list ?? []).filter((e) => !e.category);
    return (list ?? []).filter((e) => e.category === c);
}
