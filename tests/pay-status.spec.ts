import { describe, it, expect } from 'vitest';
import { classifyPayOutcome, isPaidOrderState, isProcessingOrderState } from '../src/utils/pay-status';

/** 支付结果归类：结算页轮询超时 / 结果页刷新共用同一口径 */
describe('pay-status', () => {
    it('已结算 → success', () => {
        expect(classifyPayOutcome(['PaymentSettled'])).toBe('success');
    });
    it('已履约（Shipped/Delivered）仍视为已支付 → success', () => {
        expect(classifyPayOutcome(['Shipped'])).toBe('success');
        expect(classifyPayOutcome(['Delivered'])).toBe('success');
    });
    it('已授权等待回调 → pending（处理中）', () => {
        expect(classifyPayOutcome(['PaymentAuthorized'])).toBe('pending');
    });
    it('未支付状态 → unpaid（可重新支付）', () => {
        expect(classifyPayOutcome(['ArrangingPayment'])).toBe('unpaid');
        expect(classifyPayOutcome(['Cancelled'])).toBe('unpaid');
        expect(classifyPayOutcome([''])).toBe('unpaid');
    });
    it('多单全部已支付 → success；部分支付/处理中 → pending', () => {
        expect(classifyPayOutcome(['PaymentSettled', 'Delivered'])).toBe('success');
        expect(classifyPayOutcome(['PaymentSettled', 'ArrangingPayment'])).toBe('pending');
    });
    it('状态判断', () => {
        expect(isPaidOrderState('PaymentSettled')).toBe(true);
        expect(isPaidOrderState('ArrangingPayment')).toBe(false);
        expect(isProcessingOrderState('PaymentAuthorized')).toBe(true);
        expect(isProcessingOrderState('PaymentSettled')).toBe(false);
    });
});
