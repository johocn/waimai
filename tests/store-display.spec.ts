import { describe, it, expect } from 'vitest';
import { routeText, routeDetail } from '../src/utils/store-display';

describe('routeText（配送路线主文案）', () => {
    it('默认配置 R1,R3,R4,R5：主路线 R1 + 等4种方式', () => {
        expect(routeText(['R1', 'R3', 'R4', 'R5'])).toBe('商家自送 + 校内骑手接力 等4种方式');
    });

    it('仅 R3：档口直送', () => {
        expect(routeText(['R3'])).toBe('档口直送 · 校内骑手上楼');
    });

    it('仅 R2：快递到校代取（不被误归档口直送）', () => {
        expect(routeText(['R2'])).toBe('快递到校代取');
    });

    it('R2+R3：主路线按优先级取 R3，计 2 种', () => {
        expect(routeText(['R2', 'R3'])).toBe('档口直送 · 校内骑手上楼 等2种方式');
    });

    it('R1+R2：主路线 R1，计 2 种', () => {
        expect(routeText(['R1', 'R2'])).toBe('商家自送 + 校内骑手接力 等2种方式');
    });

    it('空/未配置：暂未开通配送', () => {
        expect(routeText([])).toBe('暂未开通配送');
        expect(routeText(undefined)).toBe('暂未开通配送');
    });

    it('未知路线编号：不虚构文案', () => {
        expect(routeText(['R9'])).toBe('暂未开通配送');
    });
});

describe('routeDetail（商家页全量路线文案）', () => {
    it('按优先级排序输出，乱序输入不影响', () => {
        expect(routeDetail(['R5', 'R1', 'R3'])).toEqual([
            '商家自送 + 校内骑手接力',
            '档口直送 · 校内骑手上楼',
            '跑腿代取',
        ]);
    });

    it('过滤未知编号', () => {
        expect(routeDetail(['R2', 'R9'])).toEqual(['快递到校代取']);
    });

    it('空输入返回空数组', () => {
        expect(routeDetail([])).toEqual([]);
    });
});
