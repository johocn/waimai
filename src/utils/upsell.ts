/**
 * 结算页凑单（第 33 轮）：差价内一键加购推荐。
 * 差额口径与购物车页 recGap 一致：起送 > 满减下一档 > 免配送费。
 * 纯函数、无副作用，价格一律用分（Vendure priceWithTax 口径）。
 */

export type UpsellGapKind = 'min' | 'tier' | 'ship';

export interface UpsellGap {
    fen: number;            // 还差金额（分）
    kind: UpsellGapKind;
    thresholdFen: number;   // 该档门槛（分），进度条用
    discountFen?: number;   // tier 档：达标可减金额（分）
}

export interface UpsellGapOpts {
    minOrderFen?: number | null;
    tierGapFen?: number | null;
    tierDiscountFen?: number | null;
    freeShipFen?: number | null;
}

/** 差额门槛：起送差额 > 满减下一档差额 > 免配送费差额；全部无配置或已达标返回 null */
export function upsellGapFen(subTotalFen: number, opts: UpsellGapOpts): UpsellGap | null {
    const sub = Math.max(0, Number(subTotalFen) || 0);
    const min = opts.minOrderFen != null ? Number(opts.minOrderFen) : null;
    if (min != null && min > 0 && sub < min) return { fen: min - sub, kind: 'min', thresholdFen: min };
    const tg = opts.tierGapFen != null ? Number(opts.tierGapFen) : null;
    if (tg != null && tg > 0) return { fen: tg, kind: 'tier', thresholdFen: Math.max(0, sub + tg), discountFen: opts.tierDiscountFen != null ? Number(opts.tierDiscountFen) : undefined };
    const fs = opts.freeShipFen != null ? Number(opts.freeShipFen) : null;
    if (fs != null && fs > 0 && sub < fs) return { fen: fs - sub, kind: 'ship', thresholdFen: fs };
    return null;
}

/** 规格可售：上架、非售罄、价格有效（shop-api stockLevel 枚举，null=商家不跟踪库存；与 cart.vue 同口径） */
export function upsellSaleable(v: any): boolean {
    return !!v && v.enabled !== false && v.stockLevel !== 'OUT_OF_STOCK' && Number(v.priceWithTax) > 0;
}

export interface UpsellItem { p: any; vars: any[]; v: any; priceFen: number }

/**
 * 差价内凑单候选：每商品聚合为一项，取「未加购的最低价可售规格」。
 * - 优先取 price ≤ gapFen 的候选，价格降序（单件即补齐差额）
 * - 差价内无候选时回退全部候选价格升序（最便宜的先凑）
 */
export function upsellPick(products: any[], inCartVariantIds: Array<string | number>, gapFen: number, limit = 6): UpsellItem[] {
    const gap = Number(gapFen) || 0;
    if (gap <= 0 || !Array.isArray(products)) return [];
    const inCart = new Set((inCartVariantIds || []).map(String));
    const items: UpsellItem[] = [];
    for (const p of products) {
        const vars = (p?.variants ?? [])
            .filter(upsellSaleable)
            .sort((a: any, b: any) => Number(a.priceWithTax) - Number(b.priceWithTax));
        const avail = vars.filter((v: any) => !inCart.has(String(v.id)));
        if (!avail.length) continue;
        items.push({ p, vars, v: avail[0], priceFen: Number(avail[0].priceWithTax) || 0 });
    }
    const under = items.filter((it) => it.priceFen <= gap).sort((a, b) => b.priceFen - a.priceFen);
    if (under.length) return under.slice(0, limit);
    return items.sort((a, b) => a.priceFen - b.priceFen).slice(0, limit);
}

/** 进度条百分比（0-100） */
export function upsellPct(subTotalFen: number, thresholdFen: number): number {
    const t = Number(thresholdFen);
    if (!Number.isFinite(t) || t <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((Number(subTotalFen) / t) * 100)));
}
