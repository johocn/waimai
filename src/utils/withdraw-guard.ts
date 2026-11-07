/** 提现最小金额（分）：与后端 riderWithdraw 的 `amount < 1000` 校验一致 */
export const WITHDRAW_MIN_FEN = 1000;

/**
 * 元字符串→分：按小数位直接解析，避免浮点误差（如 26.9*100 丢 1 分）；
 * 非法输入（非数字 / 超过 2 位小数 / 负数）返回 0。
 */
export function parseYuanToFen(v: string): number {
    const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec((v || '').trim());
    if (!m) return 0;
    return parseInt(m[1], 10) * 100 + (m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0);
}

export type WithdrawAmountCheck =
    | { ok: true; fen: number }
    | { ok: false; fen: number; reason: 'invalid' | 'min' | 'exceed'; maxFen: number };

/**
 * 提现金额前置校验（仅前端拦截，服务端仍会重算余额兜底）：
 * - maxFen 为 null/undefined 表示余额尚未加载成功，只校验下限；
 * - maxFen 有效时，超过可用余额立即拦截，避免把注定失败的申请发出去。
 */
export function checkWithdrawAmount(input: string, maxFen: number | null | undefined): WithdrawAmountCheck {
    const fen = parseYuanToFen(input);
    const max = maxFen == null ? null : Math.max(0, Math.floor(Number(maxFen) || 0));
    if (fen <= 0) return { ok: false, fen: 0, reason: 'invalid', maxFen: max ?? 0 };
    if (fen < WITHDRAW_MIN_FEN) return { ok: false, fen, reason: 'min', maxFen: max ?? 0 };
    if (max != null && fen > max) return { ok: false, fen, reason: 'exceed', maxFen: max };
    return { ok: true, fen };
}
