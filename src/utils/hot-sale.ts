/** 店内热销榜（大家都在点）：按 customFields.waimaiMonthlySales 排序的纯函数，横滑区与行内 TOP 角标共用 */

export interface HotDish {
    id: string;
    /** 名次，1 起 */
    rank: number;
    name: string;
    image?: string;
    /** 可售规格最低价（分） */
    priceFen: number;
    /** 月售 */
    sales: number;
}

/** 单品月售（字段缺失/非法/负数按 0） */
export function hotSales(g: any): number {
    const n = Number(g?.customFields?.waimaiMonthlySales);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 是否有可售规格（enabled !== false 且非 OUT_OF_STOCK） */
export function hotHasStock(g: any): boolean {
    return (g?.variants ?? []).some((v: any) => !!v && v.enabled !== false && v.stockLevel !== 'OUT_OF_STOCK');
}

/** 可售规格最低价（分）；全部不可售时退回首规格价格 */
export function hotMinPriceFen(g: any): number {
    const prices = (g?.variants ?? [])
        .filter((v: any) => !!v && v.enabled !== false && v.stockLevel !== 'OUT_OF_STOCK')
        .map((v: any) => Number(v?.priceWithTax) || 0);
    if (prices.length) return Math.min(...prices);
    return Number(g?.variants?.[0]?.priceWithTax) || 0;
}

/**
 * 热销榜 Top N：仅收「在售 + 月售 > 0」的商品；
 * 月售降序，并列按 id 数值升序稳定排序（同销量名次不抖动）。
 */
export function topDishes(items: any[], n: number): HotDish[] {
    const list = (items ?? [])
        .filter((g: any) => hotHasStock(g) && hotSales(g) > 0)
        .sort((a: any, b: any) => {
            const diff = hotSales(b) - hotSales(a);
            if (diff) return diff;
            const ia = Number(a?.id);
            const ib = Number(b?.id);
            if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
            return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
        })
        .slice(0, Math.max(0, n));
    return list.map((g: any, i: number) => ({
        id: String(g?.id ?? ''),
        rank: i + 1,
        name: String(g?.name ?? ''),
        image: g?.featuredAsset?.preview || undefined,
        priceFen: hotMinPriceFen(g),
        sales: hotSales(g),
    }));
}

/** 横滑区可见性：在售热销条目 ≥ 4 才展示（≤3 个或全 0 月售隐藏） */
export function hotVisible(top: HotDish[]): boolean {
    return top.length >= 4;
}

/** 行内角标名次：榜内前三返回 1..3，否则 0 */
export function hotRankOf(id: string, top: HotDish[]): number {
    const idx = top.findIndex(d => d.id === String(id));
    return idx >= 0 && idx < 3 ? idx + 1 : 0;
}
