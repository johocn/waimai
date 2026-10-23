/** 全站热销榜（全校都在点）：跨店铺聚合各店商品月售的纯函数层，Top3 奖牌区与店铺分组区共用 */
import { hotSales, hotHasStock, hotMinPriceFen } from './hot-sale';

export interface RankEntry {
    id: string;
    /** 名次（总榜或品类内），1 起 */
    rank: number;
    name: string;
    image?: string;
    /** 可售规格最低价（分） */
    priceFen: number;
    /** 月售 */
    sales: number;
    /** 一级品类名（「全部」不算品类，可为空串） */
    category: string;
    /** 商品所属店铺渠道 token */
    storeToken: string;
    storeName: string;
    /** 默认加购规格（可售中价格最低）id，无可售规格为空串 */
    variantId: string;
}

export interface RankStoreGroup {
    token: string;
    name: string;
    products: any[];
}

/** 一级品类名：取 __root_collection__ 子级，退 collections[0]；缺失或「全部」返回空串 */
export function rankCategory(g: any): string {
    const name = g?.collections?.find((c: any) => c.parent?.name === '__root_collection__')?.name
        ?? g?.collections?.[0]?.name
        ?? '';
    const s = String(name ?? '').trim();
    return !s || s === '全部' ? '' : s;
}

/** 可售规格中价格最低的规格 id（确定性默认加购），无可售规格返回空串 */
export function rankVariantId(g: any): string {
    let best: any = null;
    for (const v of g?.variants ?? []) {
        if (!v || v.enabled === false || v.stockLevel === 'OUT_OF_STOCK') continue;
        if (!best || (Number(v.priceWithTax) || 0) < (Number(best.priceWithTax) || 0)) best = v;
    }
    return best ? String(best.id ?? '') : '';
}

/**
 * 跨店聚合：仅收「在售 + 月售 > 0」商品映射为榜单条目；
 * 单店加载失败由调用方传空 products，token 缺失的组跳过。
 * 排序：月售降序，并列按 id 数值升序稳定排序，rank 从 1 连续。
 */
export function rankAggregate(groups: RankStoreGroup[] | null | undefined): RankEntry[] {
    const list: RankEntry[] = [];
    (groups ?? []).forEach((g: any) => {
        if (!g || !g.token) return;
        const storeToken = String(g.token);
        const storeName = String(g.name ?? '');
        (g.products ?? []).forEach((p: any) => {
            if (!hotHasStock(p) || hotSales(p) <= 0) return;
            list.push({
                id: String(p?.id ?? ''),
                rank: 0,
                name: String(p?.name ?? ''),
                image: p?.featuredAsset?.preview || undefined,
                priceFen: hotMinPriceFen(p),
                sales: hotSales(p),
                category: rankCategory(p),
                storeToken,
                storeName,
                variantId: rankVariantId(p),
            });
        });
    });
    return rankSort(list);
}

/** 名次排序：月售降序 + id 稳定，重赋 rank 1..n（品类过滤后重排名次也走这里） */
export function rankSort(list: RankEntry[]): RankEntry[] {
    return [...(list ?? [])]
        .sort((a: RankEntry, b: RankEntry) => {
            const diff = (b.sales || 0) - (a.sales || 0);
            if (diff) return diff;
            const ia = Number(a.id);
            const ib = Number(b.id);
            if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
            return String(a.id ?? '').localeCompare(String(b.id ?? ''));
        })
        .map((e, i) => ({ ...e, rank: i + 1 }));
}

/** 品类 Tab（不含「全部」）：出现次数降序，并列按首次出现顺序，最多 max 个 */
export function rankCategories(list: RankEntry[], max = 6): string[] {
    const order: string[] = [];
    const count = new Map<string, number>();
    (list ?? []).forEach((e) => {
        if (!e.category) return;
        if (!count.has(e.category)) order.push(e.category);
        count.set(e.category, (count.get(e.category) || 0) + 1);
    });
    return order.sort((a, b) => (count.get(b) || 0) - (count.get(a) || 0)).slice(0, Math.max(0, max));
}

/** 按品类过滤并重排名次（cat 为空 = 总榜，名次不变） */
export function rankByCategory(list: RankEntry[], cat: string): RankEntry[] {
    const filtered = cat ? (list ?? []).filter((e) => e.category === cat) : [...(list ?? [])];
    return rankSort(filtered);
}

/**
 * 店铺分组（Top3 之外的条目）：组序按组内最佳名次升序，组内按名次升序；
 * sales 为组内月售合计，供组头展示。
 */
export function rankGroups(list: RankEntry[]): { token: string; name: string; sales: number; items: RankEntry[] }[] {
    const order: string[] = [];
    const map = new Map<string, { token: string; name: string; sales: number; items: RankEntry[] }>();
    (list ?? []).forEach((e) => {
        let g = map.get(e.storeToken);
        if (!g) {
            g = { token: e.storeToken, name: e.storeName, sales: 0, items: [] };
            map.set(e.storeToken, g);
            order.push(e.storeToken);
        }
        g.items.push(e);
        g.sales += e.sales || 0;
    });
    return order
        .map((t) => map.get(t)!)
        .map((g) => ({ ...g, items: [...g.items].sort((a, b) => a.rank - b.rank) }))
        .sort((a, b) => (a.items[0]?.rank ?? 0) - (b.items[0]?.rank ?? 0));
}
