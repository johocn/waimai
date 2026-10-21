/**
 * 购物车失效巡查：
 * - 下架（variant.enabled=false）/ 售罄（stockLevel=OUT_OF_STOCK）→ 不可结算，应清理；
 * - 变价：与上次打开购物车时的单价快照比对，仅提示不自动移除。
 * 快照存本地（key: token:variantId），每次打开购物车后刷新为当前价。
 */
export type CartLineIssue = '' | 'removed' | 'soldOut' | 'priceChanged';

const PRICE_KEY = 'cart_line_prices';

export type PriceMap = Record<string, number>;

export function readLinePrices(): PriceMap {
    try {
        const raw = uni.getStorageSync(PRICE_KEY);
        const obj = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
        return obj && typeof obj === 'object' ? obj : {};
    } catch {
        return {};
    }
}

export function writeLinePrices(map: PriceMap): void {
    try {
        uni.setStorageSync(PRICE_KEY, JSON.stringify(map));
    } catch {
        /* 存储不可用时跳过，仅影响变价提示 */
    }
}

export function linePriceFen(line: any): number {
    const unit = Number(line?.unitPriceWithTax);
    if (Number.isFinite(unit) && unit > 0) return unit;
    const qty = Math.max(1, Number(line?.quantity) || 1);
    return Math.round(Number(line?.linePriceWithTax || 0) / qty);
}

function variantOf(line: any): any {
    return line?.productVariant || {};
}

/** 每行失效类型；priceChanged 仅在存在旧价快照且差额 ≥ 1 分时返回 */
export function lineIssueOf(line: any, channelToken: string, prevPrices: PriceMap): CartLineIssue {
    const v = variantOf(line);
    if (v.enabled === false) return 'removed';
    if (v.stockLevel === 'OUT_OF_STOCK') return 'soldOut';
    if (typeof v.stockLevel === 'number' && v.stockLevel <= 0) return 'soldOut';
    const key = `${channelToken}:${v.id}`;
    const prev = prevPrices[key];
    const now = linePriceFen(line);
    if (Number.isFinite(prev) && Number(prev) > 0 && now > 0 && Math.abs(now - Number(prev)) >= 1) return 'priceChanged';
    return '';
}

/** 可为空：下架/售罄行才需要清理，变价行保留 */
export function isRemovableIssue(issue: CartLineIssue): boolean {
    return issue === 'removed' || issue === 'soldOut';
}
