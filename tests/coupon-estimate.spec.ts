import { describe, it, expect } from 'vitest';
import { estimateDiscountFen, pickBestCoupon, couponUnavailableReason } from '../src/utils/coupon-estimate';

/** 估算口径镜像 coupon-plugin/src/coupon-promotion-condition.ts（唯一权威） */
describe('estimateDiscountFen', () => {
    it('FIXED：直减，不超过小计', () => {
        expect(estimateDiscountFen({ type: 'FIXED', discountValue: 2000, minSpend: 0 }, 10000, 500)).toBe(2000);
        expect(estimateDiscountFen({ type: 'FIXED', discountValue: 20000, minSpend: 0 }, 10000, 500)).toBe(10000);
    });
    it('FULL：直减但需过门槛', () => {
        expect(estimateDiscountFen({ type: 'FULL', discountValue: 1500, minSpend: 5000 }, 10000, 500)).toBe(1500);
        expect(estimateDiscountFen({ type: 'FULL', discountValue: 1500, minSpend: 20000 }, 10000, 500)).toBe(0);
    });
    it('PERCENT：discountValue 为折数（8.5折=85），优惠=小计×(100-85)%', () => {
        expect(estimateDiscountFen({ type: 'PERCENT', discountValue: 85, minSpend: 0 }, 20000, 500)).toBe(3000);
        expect(estimateDiscountFen({ type: 'PERCENT', discountValue: 80, minSpend: 0 }, 13333, 500)).toBe(2667); // 四舍五入
    });
    it('FREE_SHIPPING：优惠=当前配送费；无配送费为 0', () => {
        expect(estimateDiscountFen({ type: 'FREE_SHIPPING', discountValue: 0, minSpend: 0 }, 10000, 500)).toBe(500);
        expect(estimateDiscountFen({ type: 'FREE_SHIPPING', discountValue: 0, minSpend: 0 }, 10000, null)).toBe(0);
    });
    it('未知类型兜底：按 discountValue 原值直减', () => {
        expect(estimateDiscountFen({ type: 'WEIRD', discountValue: 800, minSpend: 0 }, 10000, 500)).toBe(800);
    });
});

describe('pickBestCoupon', () => {
    const fixed = { id: '1', type: 'FIXED', discountValue: 2000, minSpend: 0 };
    const pct = { id: '2', type: 'PERCENT', discountValue: 80, minSpend: 0 };
    const full = { id: '3', type: 'FULL', discountValue: 5000, minSpend: 60000 };
    const ship = { id: '4', type: 'FREE_SHIPPING', discountValue: 0, minSpend: 0 };
    it('取估算最大者', () => {
        expect(pickBestCoupon([fixed, pct], 20000, 500)?.id).toBe('2'); // 20%off=4000 > 2000
        expect(pickBestCoupon([fixed, pct], 5000, 500)?.id).toBe('1');  // 1000 < 2000
        expect(pickBestCoupon([full, ship], 5000, 800)?.id).toBe('4');  // full 门槛未过=0
    });
    it('空列表/全不可用 → null', () => {
        expect(pickBestCoupon([], 10000, 500)).toBeNull();
        expect(pickBestCoupon([full], 5000, 500)).toBeNull();
    });
    it('并列取先（稳定）', () => {
        const a = { id: 'a', type: 'FIXED', discountValue: 1000, minSpend: 0 };
        const b = { id: 'b', type: 'FIXED', discountValue: 1000, minSpend: 0 };
        expect(pickBestCoupon([a, b], 10000, 500)?.id).toBe('a');
    });
});

describe('couponUnavailableReason', () => {
    it('门槛未过 → 未满文案', () => {
        expect(couponUnavailableReason({ type: 'FULL', discountValue: 500, minSpend: 3000 }, 2000)).toBe('未满 ¥30');
        expect(couponUnavailableReason({ type: 'FULL', discountValue: 500, minSpend: 3333 }, 2000)).toBe('未满 ¥33.33');
    });
    it('门槛已过/无门槛 → null', () => {
        expect(couponUnavailableReason({ type: 'FIXED', discountValue: 500, minSpend: 0 }, 100)).toBeNull();
        expect(couponUnavailableReason({ type: 'FIXED', discountValue: 500, minSpend: 1000 }, 1000)).toBeNull();
    });
});
