import { describe, expect, it } from 'vitest';
import { buildTimeline, isNoRiderFinal } from '../src/utils/timeline';

// 枚举校准（campus-delivery-plugin 实测）：
// hallStatus 小写 open / grabbed / no_rider_final；deliveryStatus assigned / in_progress / delivered
describe('buildTimeline', () => {
    it('R3 四节点：assigned（已抢未取餐）→ 仅商家接单完成', () => {
        const tl = buildTimeline('R3', 'grabbed', 'assigned');
        expect(tl).toHaveLength(4);
        expect(tl.map(n => n.done)).toEqual([true, false, false, false]);
    });
    it('R3 in_progress（已取餐）→ 取餐完成，配送中为当前活跃节点', () => {
        const tl = buildTimeline('R3', 'grabbed', 'in_progress');
        expect(tl.map(n => n.done)).toEqual([true, true, false, false]);
    });
    it('R3 delivered → 全部完成', () => {
        const tl = buildTimeline('R3', 'grabbed', 'delivered');
        expect(tl.map(n => n.done)).toEqual([true, true, true, true]);
    });
    it('R1 五节点：assigned → 仅首节点完成', () => {
        const tl = buildTimeline('R1', 'grabbed', 'assigned');
        expect(tl).toHaveLength(5);
        expect(tl.map(n => n.done)).toEqual([true, false, false, false, false]);
    });
    it('R1 in_progress（接力取货完成）→ 交接点/取货两节点完成', () => {
        const tl = buildTimeline('R1', 'grabbed', 'in_progress');
        expect(tl.map(n => n.done)).toEqual([true, true, true, false, false]);
    });
    it('R1 delivered → 全部完成', () => {
        const tl = buildTimeline('R1', 'grabbed', 'delivered');
        expect(tl.map(n => n.done)).toEqual([true, true, true, true, true]);
    });
    it('大厅无骑手（deliveryStatus=null）→ 单段四节点仅首节点完成', () => {
        const tl = buildTimeline('R3', 'open', null);
        expect(tl.map(n => n.done)).toEqual([true, false, false, false]);
    });
    it('未知路线（R5 跑腿）回退单段四节点', () => {
        const tl = buildTimeline('R5', 'grabbed', 'assigned');
        expect(tl).toHaveLength(4);
        expect(tl[1].label).toBe('传信者取餐');
    });
    it('空入参兜底（下单未支付）', () => {
        const tl = buildTimeline(null, null, null);
        expect(tl.map(n => n.done)).toEqual([true, false, false, false]);
    });
});

describe('isNoRiderFinal', () => {
    it('仅匹配 no_rider_final（大小写不敏感）', () => {
        expect(isNoRiderFinal('no_rider_final')).toBe(true);
        expect(isNoRiderFinal('NO_RIDER_FINAL')).toBe(true);
        expect(isNoRiderFinal('open')).toBe(false);
        expect(isNoRiderFinal('grabbed')).toBe(false);
        expect(isNoRiderFinal(null)).toBe(false);
    });
});
