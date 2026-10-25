import { describe, expect, it } from 'vitest';
import { buildTimeline, isNoRiderFinal, isExceptionFinal } from '../src/utils/timeline';

// 枚举校准（campus-delivery-plugin 实测）：
// hallStatus 小写 open / grabbed / no_rider_final；deliveryStatus assigned / in_progress / delivered
// 结构口径（83e1a4d / a6fae65）：R1/R2 恒两段（第一段到交接点 + 第二段传信者接力），R3 按 deliveryPlan 一段到底，
// R4/R5 回退单段；deliveryPlan 降级为 campus_rider 时 R1/R2 只渲染一段。
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
    it('R3 外部快递直送（deliveryPlan=external_courier）→ 四节点按第三方进度推进', () => {
        const tl = buildTimeline('R3', null, null, null, { deliveryPlan: 'external_courier', thirdPartyState: 'pickup' });
        expect(tl).toHaveLength(4);
        expect(tl.map(n => n.done)).toEqual([true, true, true, false]);
        expect(tl[1].label).toBe('外部快递接单');
        expect(tl[3].label).toBe('已送达');
    });
    it('R3 自营快递直送（deliveryPlan=owned）→ 自营接单节点完成', () => {
        const tl = buildTimeline('R3', 'grabbed', 'assigned', null, { deliveryPlan: 'owned' });
        expect(tl).toHaveLength(4);
        expect(tl.map(n => n.done)).toEqual([true, true, false, false]);
        expect(tl[1].label).toBe('自营快递接单');
    });
    it('R1 两段六节点：assigned（已抢未取餐）→ 首段到交接点 + 接力取货已完成', () => {
        const tl = buildTimeline('R1', 'grabbed', 'assigned');
        expect(tl).toHaveLength(6);
        expect(tl.map(n => n.done)).toEqual([true, true, true, true, false, false]);
        expect(tl.map(n => n.label)).toEqual([
            '商家接单',
            '商户接单配送',
            '商户已送达交接点',
            '传信者接力取货（拍照确认）',
            '第二程 · 配送上楼',
            '已送达',
        ]);
    });
    it('R1 in_progress（已取餐）→ 上楼配送中，送达未完成', () => {
        const tl = buildTimeline('R1', 'grabbed', 'in_progress');
        expect(tl.map(n => n.done)).toEqual([true, true, true, true, true, false]);
    });
    it('R1 delivered → 全部完成', () => {
        const tl = buildTimeline('R1', 'grabbed', 'delivered');
        expect(tl.map(n => n.done)).toEqual([true, true, true, true, true, true]);
    });
    it('R1 自营快递首段（deliveryPlan=owned）→ 首段节点文案切换', () => {
        const tl = buildTimeline('R1', 'grabbed', 'assigned', null, { deliveryPlan: 'owned' });
        expect(tl[1].label).toBe('自营快递接单');
        expect(tl[2].label).toBe('自营快递已送达交接点');
        expect(tl.map(n => n.done)).toEqual([true, true, true, true, false, false]);
    });
    it('R1 降级单（deliveryPlan=campus_rider）→ 只渲染一段四节点', () => {
        const tl = buildTimeline('R1', 'grabbed', 'assigned', null, { deliveryPlan: 'campus_rider' });
        expect(tl).toHaveLength(4);
        expect(tl.map(n => n.done)).toEqual([true, false, false, false]);
        expect(tl[1].label).toBe('传信者到店取餐');
    });
    it('R2 待快递接单（thirdPartyState=pending）→ 两段六节点，首段未完成', () => {
        const tl = buildTimeline('R2', null, null, null, { thirdPartyState: 'pending' });
        expect(tl).toHaveLength(6);
        expect(tl.map(n => n.done)).toEqual([true, false, false, false, false, false]);
        expect(tl[1].label).toBe('外部快递接单');
        expect(tl[2].label).toBe('外部快递已送达交接点');
    });
    it('R2 快递已接单（thirdPartyState=accepted）→ 接单节点完成，到交接点未完成', () => {
        const tl = buildTimeline('R2', null, null, null, { thirdPartyState: 'accepted' });
        expect(tl.map(n => n.done)).toEqual([true, true, false, false, false, false]);
    });
    it('R2 快递已到校（thirdPartyState=delivered / 已写 handoverAt）→ 仅第一段完成，接力段待推进', () => {
        const tl = buildTimeline('R2', null, null, null, { thirdPartyState: 'delivered' });
        expect(tl).toHaveLength(6);
        expect(tl.map(n => n.done)).toEqual([true, true, true, false, false, false]);
        const byHandover = buildTimeline('R2', null, 'assigned', null, { handoverAt: '2026-10-23T08:00:00Z' });
        expect(byHandover.map(n => n.done)).toEqual([true, false, true, false, false, false]);
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
    it('预约单（hallStatus=scheduled）→ 首节点为预约提示，商家接单未完成', () => {
        const tl = buildTimeline('R3', 'scheduled', null);
        expect(tl[0]).toEqual({ key: 'scheduled', label: '预约单 · 到点前30分钟自动进入调度', done: false });
        expect(tl[1].label).toBe('商家接单');
        expect(tl[1].done).toBe(false);
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

describe('isExceptionFinal（plan 3.4 异常处置终态）', () => {
    it('仅匹配 exception_final（大小写不敏感）', () => {
        expect(isExceptionFinal('exception_final')).toBe(true);
        expect(isExceptionFinal('EXCEPTION_FINAL')).toBe(true);
        expect(isExceptionFinal('exception')).toBe(false);
        expect(isExceptionFinal('open')).toBe(false);
        expect(isExceptionFinal(null)).toBe(false);
    });
});
