/**
 * 券估算纯函数 —— 口径镜像 coupon-plugin/src/coupon-promotion-condition.ts（唯一权威，勿自造）。
 * 金额一律分（fen）。PERCENT 的 discountValue 是折数（8.5折=85）。
 */
export interface CouponTemplateLike {
    type: string;
    discountValue: number;
    minSpend: number;
}

/** 估算一张券在当前小计/配送费下的优惠额（分）；门槛未过 → 0 */
export function estimateDiscountFen(tpl: CouponTemplateLike, subtotalFen: number, shippingFeeFen: number | null): number {
    if (!tpl || (tpl.minSpend ?? 0) > subtotalFen) return 0;
    switch (tpl.type) {
        case 'PERCENT':
            return Math.round(subtotalFen * ((100 - tpl.discountValue) / 100));
        case 'FREE_SHIPPING':
            return shippingFeeFen ?? 0;
        case 'FIXED':
        case 'FULL':
            return Math.max(0, Math.min(tpl.discountValue, subtotalFen));
        default:
            return Math.max(0, Math.min(tpl.discountValue, subtotalFen)); // 未知类型兜底（spec §5）
    }
}

/** 从候选中选估算最优；并列取先；全不可用返回 null */
export function pickBestCoupon<T extends CouponTemplateLike & { id: string }>(
    tpls: T[], subtotalFen: number, shippingFeeFen: number | null,
): T | null {
    let best: T | null = null;
    let bestVal = 0;
    for (const t of tpls) {
        const v = estimateDiscountFen(t, subtotalFen, shippingFeeFen);
        if (v > bestVal) { best = t; bestVal = v; }
    }
    return best;
}

/** 门槛未过时的人话原因（如「未满 ¥30」）；可用返回 null */
export function couponUnavailableReason(tpl: CouponTemplateLike, subtotalFen: number): string | null {
    if ((tpl.minSpend ?? 0) <= subtotalFen) return null;
    const yuan = tpl.minSpend / 100;
    const text = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
    return `未满 ¥${text}`;
}
