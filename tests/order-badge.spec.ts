import { describe, it, expect } from 'vitest';
import { fulfillmentBadge } from '../src/utils/order-badge';

/** 订单卡履约徽标：校园配送单（R1/R3）按 deliveryStatus 映射，其余回退订单 state 文案 */
describe('fulfillmentBadge', () => {
    it('R3 in_progress → 配送中', () => {
        expect(fulfillmentBadge('R3', 'in_progress')).toBe('配送中');
    });
    it('R3 delivered → 已送达', () => {
        expect(fulfillmentBadge('R3', 'delivered')).toBe('已送达');
    });
    it('R3 assigned → 待取货', () => {
        expect(fulfillmentBadge('R3', 'assigned')).toBe('待取货');
    });
    it('R1 in_progress → 配送中', () => {
        expect(fulfillmentBadge('R1', 'in_progress')).toBe('配送中');
    });
    it('校园单尚未派单（deliveryStatus 空）→ 无徽标，回退 state 文案', () => {
        expect(fulfillmentBadge('R3', null)).toBe('');
        expect(fulfillmentBadge('R3', '')).toBe('');
    });
    it('非校园路线（R5/空）→ 无徽标', () => {
        expect(fulfillmentBadge('R5', 'in_progress')).toBe('');
        expect(fulfillmentBadge(null, 'delivered')).toBe('');
    });
    it('大小写容错', () => {
        expect(fulfillmentBadge('r3', 'IN_PROGRESS')).toBe('配送中');
        expect(fulfillmentBadge('r1', 'Delivered')).toBe('已送达');
    });
});
