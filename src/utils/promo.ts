/** 满减活动文本解析（promoText 为店铺自由文本，如「满30减5」「满 30 元减 5 元」） */

export interface PromoRule {
    thresholdFen: number;
    discountFen: number;
}

export interface PromoHint {
    thresholdFen: number;
    discountFen: number;
    gapFen: number;
    reached: boolean;
}

const RULE_RE = /满\s*(\d+(?:\.\d+)?)\s*元?\s*减\s*(\d+(?:\.\d+)?)\s*元?/g;

function toFen(yuan: string): number {
    return Math.round(Number(yuan) * 100);
}

/** 解析出全部满减档位（按门槛升序）；无匹配返回空数组 */
export function parsePromoRules(text?: string | null): PromoRule[] {
    if (!text) return [];
    const rules: PromoRule[] = [];
    const seen = new Set<number>();
    RULE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RULE_RE.exec(text))) {
        const thresholdFen = toFen(m[1]);
        const discountFen = toFen(m[2]);
        if (!Number.isFinite(thresholdFen) || !Number.isFinite(discountFen) || thresholdFen <= 0 || discountFen <= 0) continue;
        if (seen.has(thresholdFen)) continue;
        seen.add(thresholdFen);
        rules.push({ thresholdFen, discountFen });
    }
    return rules.sort((a, b) => a.thresholdFen - b.thresholdFen);
}

/**
 * 凑单提示：
 * - 已过门槛 → reached=true，返回已达成的最高门槛优惠
 * - 未过门槛 → 返回最近一档，gapFen 为还差金额
 * - 无规则 → null
 */
export function nextPromoHint(text: string | null | undefined, goodsFen: number): PromoHint | null {
    const rules = parsePromoRules(text);
    if (!rules.length) return null;
    const amount = Number.isFinite(goodsFen) ? Math.max(0, goodsFen) : 0;
    const reached = rules.filter(r => amount >= r.thresholdFen).pop();
    if (reached) {
        return { ...reached, gapFen: 0, reached: true };
    }
    const next = rules.find(r => amount < r.thresholdFen)!;
    return { ...next, gapFen: next.thresholdFen - amount, reached: false };
}

/** 金额（分）→ 元字符串，整数不带小数 */
export function yuan(fen: number): string {
    const v = Math.max(0, Math.round(fen)) / 100;
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
