import { describe, it, expect } from 'vitest';
import { routeText, routeDetail, deliveryTag } from '../src/utils/store-display';

describe('routeText（配送路线主文案）', () => {
    it('默认配置 R1,R3,R4,R5：主路线 R1 + 等4种方式', () => {
        expect(routeText(['R1', 'R3', 'R4', 'R5'])).toBe('商家自送 · 传信者接力 等4种方式');
    });

    it('仅 R3：档口直送', () => {
        expect(routeText(['R3'])).toBe('档口直送 · 传信者上楼');
    });

    it('仅 R2：快递到校 · 接力代取（不被误归档口直送）', () => {
        expect(routeText(['R2'])).toBe('快递到校 · 接力代取');
    });

    it('R2+R3：主路线按优先级取 R3，计 2 种', () => {
        expect(routeText(['R2', 'R3'])).toBe('档口直送 · 传信者上楼 等2种方式');
    });

    it('R1+R2：主路线 R1，计 2 种', () => {
        expect(routeText(['R1', 'R2'])).toBe('商家自送 · 传信者接力 等2种方式');
    });

    it('空/未配置：暂未开通配送', () => {
        expect(routeText([])).toBe('暂未开通配送');
        expect(routeText(undefined)).toBe('暂未开通配送');
    });

    it('未知路线编号：不虚构文案', () => {
        expect(routeText(['R9'])).toBe('暂未开通配送');
    });

    it('null 输入：等同未配置', () => {
        expect(routeText(null)).toBe('暂未开通配送');
    });

    it('数组含空字符串：忽略，不影响识别（模拟 split(',') 尾逗号）', () => {
        expect(routeText(['R1', ''])).toBe('商家自送 · 传信者接力');
    });

    it('重复编号：按去重计数，不虚报种数', () => {
        expect(routeText(['R1', 'R1', 'R3', 'R3'])).toBe('商家自送 · 传信者接力 等2种方式');
    });

    it('小写编号不识别（后端约定大写，不做宽容匹配）', () => {
        expect(routeText(['r1', 'r3'])).toBe('暂未开通配送');
    });

    it('五条路线全配置：等5种方式', () => {
        expect(routeText(['R1', 'R2', 'R3', 'R4', 'R5'])).toBe('商家自送 · 传信者接力 等5种方式');
    });

    it('R3+R4：主路线取优先级更高的 R3', () => {
        expect(routeText(['R3', 'R4'])).toBe('档口直送 · 传信者上楼 等2种方式');
    });

    it('R4+R2：主路线取优先级更高的 R2（快递代取 > 到店自取）', () => {
        expect(routeText(['R4', 'R2'])).toBe('快递到校 · 接力代取 等2种方式');
    });

    it('R5+R4：主路线取优先级更高的 R4（到店自取 > 跑腿代取）', () => {
        expect(routeText(['R5', 'R4'])).toBe('到店自取 等2种方式');
    });
});

describe('routeDetail（商家页全量路线文案）', () => {
    it('按优先级排序输出，乱序输入不影响', () => {
        expect(routeDetail(['R5', 'R1', 'R3'])).toEqual([
            '商家自送 · 传信者接力',
            '档口直送 · 传信者上楼',
            '跑腿代取',
        ]);
    });

    it('过滤未知编号', () => {
        expect(routeDetail(['R2', 'R9'])).toEqual(['快递到校 · 接力代取']);
    });

    it('空输入返回空数组', () => {
        expect(routeDetail([])).toEqual([]);
    });

    it('仅未知编号返回空数组', () => {
        expect(routeDetail(['R9', 'R10'])).toEqual([]);
    });

    it('五条路线全配置：按优先级输出全部 5 项', () => {
        expect(routeDetail(['R5', 'R4', 'R3', 'R2', 'R1'])).toEqual([
            '商家自送 · 传信者接力',
            '档口直送 · 传信者上楼',
            '快递到校 · 接力代取',
            '到店自取',
            '跑腿代取',
        ]);
    });

    it('与 routeText 主路线一致（routeDetail 首项 = routeText 主文案，单条时）', () => {
        const routes = ['R5', 'R2'];
        expect(routeDetail(routes)[0]).toBe('快递到校 · 接力代取');
        expect(routeText(routes)).toBe('快递到校 · 接力代取 等2种方式');
    });

    it('重复编号输出去重后的文案', () => {
        expect(routeDetail(['R3', 'R3'])).toEqual(['档口直送 · 传信者上楼']);
    });
});

describe('deliveryTag（首页配送 tag：时长前缀）', () => {
    it('deliveryMinutes 有值：前缀「N分钟 ·」', () => {
        expect(deliveryTag({ deliveryMinutes: 35, routesEnabled: ['R1', 'R3'] }))
            .toBe('35分钟 · 商家自送 · 传信者接力 等2种方式');
    });
    it('deliveryMinutes 为 null/undefined/0：不加前缀', () => {
        expect(deliveryTag({ deliveryMinutes: null, routesEnabled: ['R1'] })).toBe('商家自送 · 传信者接力');
        expect(deliveryTag({ routesEnabled: ['R1'] })).toBe('商家自送 · 传信者接力');
        expect(deliveryTag({ deliveryMinutes: 0, routesEnabled: ['R1'] })).toBe('商家自送 · 传信者接力');
    });
    it('无可用路线返回 null（调用方回退 routeText 展示「暂未开通配送」）', () => {
        expect(deliveryTag({ deliveryMinutes: 35, routesEnabled: [] })).toBeNull();
        expect(deliveryTag({ deliveryMinutes: 35, routesEnabled: null })).toBeNull();
        expect(deliveryTag({ deliveryMinutes: 35, routesEnabled: ['R9'] })).toBeNull();
    });
});
