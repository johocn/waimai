/**
 * 支付状态分类：结算页轮询与支付结果页的统一口径。
 * 只做纯映射，不做任何 IO，便于单测。
 */

/** 已支付（含后续履约）的订单状态 */
const PAID_STATES = ['PaymentSettled', 'Settled', 'Shipped', 'PartiallyDelivered', 'Delivered', 'Completed'];
/** 已拉起收银台、等待微信异步回调的状态 */
const PROCESSING_STATES = ['PaymentAuthorized'];

export type PayOutcome = 'success' | 'pending' | 'unpaid';

export function isPaidOrderState(state: string): boolean {
    return PAID_STATES.includes(String(state || ''));
}

export function isProcessingOrderState(state: string): boolean {
    return PROCESSING_STATES.includes(String(state || ''));
}

/**
 * 按订单真实状态归类：
 * - 全部已支付 → success
 * - 存在处理中（PaymentAuthorized）或部分已支付 → pending
 * - 其余（ArrangingPayment/Cancelled/未知/空） → unpaid
 */
export function classifyPayOutcome(states: string[]): PayOutcome {
    let allPaid = true;
    let anyPaid = false;
    let anyProcessing = false;
    for (const s of states) {
        if (isPaidOrderState(s)) anyPaid = true; else allPaid = false;
        if (isProcessingOrderState(s)) anyProcessing = true;
    }
    if (states.length > 0 && allPaid) return 'success';
    if (anyProcessing || anyPaid) return 'pending';
    return 'unpaid';
}
