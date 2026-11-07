import { describe, it, expect } from 'vitest';
import { checkWithdrawAmount, parseYuanToFen, WITHDRAW_MIN_FEN } from '../src/utils/withdraw-guard';

describe('parseYuanToFen', () => {
    it('按小数位直接解析，无浮点误差', () => {
        expect(parseYuanToFen('26.9')).toBe(2690);
        expect(parseYuanToFen('0.01')).toBe(1);
        expect(parseYuanToFen('10')).toBe(1000);
    });
    it('非法输入归 0', () => {
        expect(parseYuanToFen('')).toBe(0);
        expect(parseYuanToFen('1.234')).toBe(0);
        expect(parseYuanToFen('-1')).toBe(0);
        expect(parseYuanToFen('abc')).toBe(0);
    });
});

describe('checkWithdrawAmount（提现前置拦截）', () => {
    it('低于最低额 → min（与后端 1000 分门槛一致）', () => {
        const r = checkWithdrawAmount('9.99', 100000);
        expect(r.ok).toBe(false);
        expect(!r.ok && r.reason).toBe('min');
        expect(WITHDRAW_MIN_FEN).toBe(1000);
    });
    it('超过可用余额 → exceed，并带出上限', () => {
        const r = checkWithdrawAmount('100.01', 10000);
        expect(r.ok).toBe(false);
        expect(!r.ok && r.reason).toBe('exceed');
        expect(!r.ok && r.maxFen).toBe(10000);
    });
    it('等于可用余额 → 放行（后端允许全额提现）', () => {
        const r = checkWithdrawAmount('100', 10000);
        expect(r.ok).toBe(true);
        expect(r.ok && r.fen).toBe(10000);
    });
    it('余额未知（null）→ 只校验下限，由服务端兜底', () => {
        const r = checkWithdrawAmount('9999', null);
        expect(r.ok).toBe(true);
        expect(r.ok && r.fen).toBe(999900);
    });
    it('余额为 0 → 任何达标金额都被拦截', () => {
        const r = checkWithdrawAmount('10', 0);
        expect(!r.ok && r.reason).toBe('exceed');
    });
});
