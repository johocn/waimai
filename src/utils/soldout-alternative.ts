/** 售罄智能替代：同店找可售的同类/同价位商品，供菜单页与常点清单一键替换（第 37 轮） */
import { hotHasStock, hotMinPriceFen, hotSales } from './hot-sale';
import { rankCategory } from './hot-rank';

export interface SaItem {
    product: any;
    /** 可售最低价（分） */
    priceFen: number;
    /** 一级品类名（空串 = 未分类） */
    category: string;
    /** 与目标商品同品类 */
    sameCategory: boolean;
    /** 好评分（无评分按 0） */
    rating: number;
    /** 月售 */
    sales: number;
    /** 与目标价差比例（0.2 = 相差 20%） */
    priceGap: number;
}

export interface SaOptions {
    /** 最多返回几款，默认 3 */
    max?: number;
    /** 价格带下限（相对目标价），默认 0.6 */
    low?: number;
    /** 价格带上限（相对目标价），默认 1.8 */
    high?: number;
}

export type SaReason = 'sameCat' | 'nearPrice' | 'hot';

const DEFAULT_MAX = 3;
const DEFAULT_LOW = 0.6;
const DEFAULT_HIGH = 1.8;

/** 商品一级品类：与热销榜/品类合集同口径 */
export function saCategory(product: any): string {
    return rankCategory(product);
}

function ratingOf(p: any): number {
    const n = Number(p?.customFields?.reviewRating);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function idCompare(a: any, b: any): number {
    const ia = Number(a?.id);
    const ib = Number(b?.id);
    if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
}

/**
 * 为售罄商品找替代：同店、在售、非自身，价格带内；
 * 同品类优先 → 好评高 → 月售高 → 价差小 → id 稳定。
 */
export function saAlternatives(products: any[] | null | undefined, target: any, options: SaOptions = {}): SaItem[] {
    const max = Math.max(0, Number(options.max ?? DEFAULT_MAX) || 0);
    if (!target || !max) return [];
    const targetId = String(target?.id ?? '');
    const targetPrice = hotMinPriceFen(target);
    const targetCat = saCategory(target);
    const low = Number.isFinite(Number(options.low)) ? Number(options.low) : DEFAULT_LOW;
    const high = Number.isFinite(Number(options.high)) ? Number(options.high) : DEFAULT_HIGH;

    const list: SaItem[] = [];
    (products ?? []).forEach((p: any) => {
        if (!p || String(p?.id ?? '') === targetId) return;
        if (!hotHasStock(p)) return;
        const priceFen = hotMinPriceFen(p);
        if (!(priceFen > 0)) return;
        if (targetPrice > 0) {
            const ratio = priceFen / targetPrice;
            if (ratio < low || ratio > high) return;
        }
        const category = saCategory(p);
        list.push({
            product: p,
            priceFen,
            category,
            sameCategory: !!targetCat && category === targetCat,
            rating: ratingOf(p),
            sales: hotSales(p),
            priceGap: targetPrice > 0 ? Math.abs(priceFen - targetPrice) / targetPrice : 0,
        });
    });

    list.sort((a, b) => {
        if (a.sameCategory !== b.sameCategory) return a.sameCategory ? -1 : 1;
        if (b.rating !== a.rating) return b.rating - a.rating;
        if (b.sales !== a.sales) return b.sales - a.sales;
        if (a.priceGap !== b.priceGap) return a.priceGap - b.priceGap;
        return idCompare(a.product, b.product);
    });
    return list.slice(0, max);
}

/** 替代理由标签：同品类 > 价位相近 > 本店热销 */
export function saReason(item: SaItem | null | undefined): SaReason {
    if (!item) return 'nearPrice';
    if (item.sameCategory) return 'sameCat';
    if (item.priceGap <= 0.35) return 'nearPrice';
    return item.sales > 0 ? 'hot' : 'nearPrice';
}

/** 替代商品的首个可售规格 id（无可售返回空串） */
export function saVariantId(product: any): string {
    const v = (product?.variants ?? []).find((x: any) => !!x && x.enabled !== false && x.stockLevel !== 'OUT_OF_STOCK');
    return String(v?.id ?? '');
}

/** 替代商品可售规格数（>1 表示需打开规格选择） */
export function saAvailableVariants(product: any): number {
    return (product?.variants ?? []).filter((x: any) => !!x && x.enabled !== false && x.stockLevel !== 'OUT_OF_STOCK').length;
}
