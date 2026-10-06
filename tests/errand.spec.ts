import { describe, expect, it } from 'vitest';
import { buildErrandPayload, filterCampusRoutes, parseRelayPrefill, relayStatusLabel, TIP_STEPS } from '../src/utils/errand';

describe('relayStatusLabel（R2 接力子卡文案）', () => {
    it('无接力单 → 空串', () => {
        expect(relayStatusLabel(null)).toBe('');
    });
    it('T4 退款终态 / Cancelled → 引导重选取件方式', () => {
        expect(relayStatusLabel({ hallStatus: 'no_rider_final' } as any)).toContain('退款');
        expect(relayStatusLabel({ state: 'Cancelled' } as any)).toContain('退款');
    });
    it('已送达 / 配送中 / 已接单 / 平台调度中', () => {
        expect(relayStatusLabel({ deliveryStatus: 'delivered' } as any)).toContain('已送达');
        expect(relayStatusLabel({ deliveryStatus: 'delivering', hallStatus: 'grabbed' } as any)).toContain('配送中');
        expect(relayStatusLabel({ hallStatus: 'grabbed' } as any)).toContain('已接单');
        expect(relayStatusLabel({ hallStatus: 'open' } as any)).toContain('平台调度中');
    });
});

describe('buildErrandPayload（发单表单校验）', () => {
    it('必填缺失返回 null', () => {
        expect(buildErrandPayload({ kind: 'pickup_express', fromText: '', toText: '9栋', tip: 0 })).toBeNull();
        expect(buildErrandPayload({ kind: 'pickup_express', fromText: '菜鸟', toText: '', tip: 0 })).toBeNull();
    });
    it('小费负数/非法返回 null', () => {
        expect(buildErrandPayload({ kind: 'other', fromText: 'A', toText: 'B', tip: -1 })).toBeNull();
    });
    it('合法输入返回后端 CampusErrandInput', () => {
        expect(buildErrandPayload({
            kind: 'pickup_express', fromText: '菜鸟驿站', toText: '9栋501',
            tip: 100, note: '两个包裹', errandFrom: 'A100', buildingId: '3',
        })).toEqual({
            kind: 'pickup_express', fromText: '菜鸟驿站', toText: '9栋501',
            tip: 100, note: '两个包裹', errandFrom: 'A100', buildingId: '3',
        });
    });
    it('可选项缺省不带键', () => {
        const p = buildErrandPayload({ kind: 'bring_food', fromText: '档口', toText: '9栋', tip: 0 });
        expect(p).toEqual({ kind: 'bring_food', fromText: '档口', toText: '9栋', tip: 0 });
    });
    it('小费档位递增且含 0', () => {
        expect(TIP_STEPS[0]).toBe(0);
        expect([...TIP_STEPS].sort((a, b) => a - b)).toEqual(TIP_STEPS);
    });
});

describe('filterCampusRoutes（checkout 路线组动态化）', () => {
    it('仅保留 R1/R2/R3 且保序', () => {
        expect(filterCampusRoutes(['R3', 'R1', 'R2'])).toEqual(['R3', 'R1', 'R2']);
    });
    it('过滤 R4/R5 与未知码', () => {
        expect(filterCampusRoutes(['R4', 'R5', 'R2', 'R6'])).toEqual(['R2']);
    });
    it('空/空值兜底', () => {
        expect(filterCampusRoutes([])).toEqual([]);
        expect(filterCampusRoutes(null)).toEqual([]);
    });
});

describe('parseRelayPrefill（R2→R5 发单页预填）', () => {
    it('R2 接力：code/a/b/buildingId 解码预填，A 点缺省「校内代收点」', () => {
        expect(parseRelayPrefill({
            from: 'R2', code: 'A100',
            a: encodeURIComponent('校内代收点'), b: encodeURIComponent('9 栋'),
            buildingId: '3',
        })).toEqual({ relayFrom: 'A100', fromText: '校内代收点', toText: '9 栋', buildingId: '3' });
    });
    it('R2 但无 a 参数：A 点兜底「校内代收点」', () => {
        const r = parseRelayPrefill({ from: 'R2', code: 'A100' });
        expect(r.fromText).toBe('校内代收点');
        expect(r.relayFrom).toBe('A100');
    });
    it('非 R2（普通发单）：全部空', () => {
        expect(parseRelayPrefill({})).toEqual({ relayFrom: '', fromText: '', toText: '', buildingId: '' });
    });
});
