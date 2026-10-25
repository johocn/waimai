import { describe, it, expect } from 'vitest';
import { routeText, routeDetail, deliveryTag } from '../src/utils/store-display';

// 文案口径（2026-10-23 配送术语调整，d7674a8）：
// R1 商户/自营快递 + 传信者接力；R2 外部快递 + 传信者接力；R3 传信者/自营/外部快递直送；R4 到店自取；R5 校内跑腿
// 优先级：R1 > R3 > R2 > R4 > R5
describe('routeText（配送路线主文案）', () => {
    it('默认配置 R1,R3,R4,R5：主路线 R1 + 等4种方式', () => {
        expect(routeText(['R1', 'R3', 'R4', 'R5'])).toBe('商户/自营快递 + 传信者接力 等4种方式');
    });

    it('仅 R3：直送', () => {
        expect(routeText(['R3'])).toBe('传信者/自营/外部快递直送');
    });

    it('仅 R2：外部快递+传信者接力（不被误归档口直送）', () => {
        expect(routeText(['R2'])).toBe('外部快递 + 传信者接力');
    });

    it('R2+R3：主路线按优先级取 R3，计 2 种', () => {
        expect(routeText(['R2', 'R3'])).toBe('传信者/自营/外部快递直送 等2种方式');
    });

    it('R1+R2：主路线 R1，计 2 种', () => {
        expect(routeText(['R1', 'R2'])).toBe('商户/自营快递 + 传信者接力 等2种方式');
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

    it('数组含空字符串：忽略，不影响识别（模拟 split(\',\') 尾逗号）', () => {
        expect(routeText(['R1', ''])).toBe('商户/自营快递 + 传信者接力');
    });

    it('重复编号：按去重计数，不虚报种数', () => {
        expect(routeText(['R1', 'R1', 'R3', 'R3'])).toBe('商户/自营快递 + 传信者接力 等2种方式');
    });

    it('小写编号不识别（后端约定大写，不做宽容匹配）', () => {
        expect(routeText(['r1', 'r3'])).toBe('暂未开通配送');
    });

    it('五条路线全配置：等5种方式', () => {
        expect(routeText(['R1', 'R2', 'R3', 'R4', 'R5'])).toBe('商户/自营快递 + 传信者接力 等5种方式');
    });

    it('R3+R4：主路线取优先级更高的 R3', () => {
        expect(routeText(['R3', 'R4'])).toBe('传信者/自营/外部快递直送 等2种方式');
    });

    it('R4+R2：主路线取优先级更高的 R2（外部快递 > 到店自取）', () => {
        expect(routeText(['R4', 'R2'])).toBe('外部快递 + 传信者接力 等2种方式');
    });

    it('R5+R4：主路线取优先级更高的 R4（到店自取 > 校内跑腿）', () => {
        expect(routeText(['R5', 'R4'])).toBe('到店自取 等2种方式');
    });
});

describe('routeDetail（商家页全量路线文案）', () => {
    it('按优先级排序输出，乱序输入不影响', () => {
        expect(routeDetail(['R5', 'R1', 'R3'])).toEqual([
            '商户/自营快递 + 传信者接力',
            '传信者/自营/外部快递直送',
            '校内跑腿',
        ]);
    });

    it('过滤未知编号', () => {
        expect(routeDetail(['R2', 'R9'])).toEqual(['外部快递 + 传信者接力']);
    });

    it('空输入返回空数组', () => {
        expect(routeDetail([])).toEqual([]);
    });

    it('仅未知编号返回空数组', () => {
        expect(routeDetail(['R9', 'R10'])).toEqual([]);
    });

    it('五条路线全配置：按优先级输出全部 5 项', () => {
        expect(routeDetail(['R5', 'R4', 'R3', 'R2', 'R1'])).toEqual([
            '商户/自营快递 + 传信者接力',
            '传信者/自营/外部快递直送',
            '外部快递 + 传信者接力',
            '到店自取',
            '校内跑腿',
        ]);
    });

    it('与 routeText 主路线一致（routeDetail 首项 = routeText 主文案，单条时）', () => {
        const routes = ['R5', 'R2'];
        expect(routeDetail(routes)[0]).toBe('外部快递 + 传信者接力');
        expect(routeText(routes)).toBe('外部快递 + 传信者接力 等2种方式');
    });

    it('重复编号输出去重后的文案', () => {
        expect(routeDetail(['R3', 'R3'])).toEqual(['传信者/自营/外部快递直送']);
    });
});

describe('deliveryTag（首页配送 tag：时长前缀）', () => {
    it('deliveryMinutes 有值：前缀「N分钟 ·」', () => {
        expect(deliveryTag({ deliveryMinutes: 35, routesEnabled: ['R1', 'R3'] }))
            .toBe('35分钟 · 商户/自营快递 + 传信者接力 等2种方式');
    });
    it('deliveryMinutes 为 null/undefined/0：不加前缀', () => {
        expect(deliveryTag({ deliveryMinutes: null, routesEnabled: ['R1'] })).toBe('商户/自营快递 + 传信者接力');
        expect(deliveryTag({ routesEnabled: ['R1'] })).toBe('商户/自营快递 + 传信者接力');
        expect(deliveryTag({ deliveryMinutes: 0, routesEnabled: ['R1'] })).toBe('商户/自营快递 + 传信者接力');
    });
    it('无可用路线返回 null（调用方回退 routeText 展示「暂未开通配送」）', () => {
        expect(deliveryTag({ deliveryMinutes: 35, routesEnabled: [] })).toBeNull();
        expect(deliveryTag({ deliveryMinutes: 35, routesEnabled: null })).toBeNull();
        expect(deliveryTag({ deliveryMinutes: 35, routesEnabled: ['R9'] })).toBeNull();
    });
});
