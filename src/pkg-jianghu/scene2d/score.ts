/**
 * 评价 / 成就（纯逻辑）
 *
 * - 幽灵评级：全程零察觉（spotted=false 且 风险峰值低）通关；
 * - 优雅连击：连续优雅操作（放置/翻面/解谜不触发警觉）累加，被察觉清零；
 * - 通关回顾：风险峰值、最大连击、是否零察觉。
 * 全部前端状态，不改后端契约。
 */
import type { ScoreState } from './types';

export function createScore(): ScoreState {
    return { ghost: true, combo: 0, comboMax: 0, riskMax: 0, spotted: false, startedAt: 0, finished: false };
}

/** 记录每帧风险峰值；超过阈值标记为「被察觉」 */
export function recordRisk(s: ScoreState, alert: number): void {
    if (alert > s.riskMax) s.riskMax = alert;
    if (alert >= 0.85) s.spotted = true;
}

/** 优雅操作连击 +1 */
export function bumpCombo(s: ScoreState): void {
    s.combo += 1;
    if (s.combo > s.comboMax) s.comboMax = s.combo;
}

/** 被察觉 → 连击清零且取消幽灵资格 */
export function breakCombo(s: ScoreState): void {
    s.combo = 0;
    s.spotted = true;
}

/** 评级 */
export function ratingOf(s: ScoreState): string {
    if (s.spotted) return '暴露';
    if (s.riskMax < 0.4 && s.comboMax >= 3) return '幽灵';
    if (s.riskMax < 0.65) return '稳健';
    return '惊险';
}

export interface ScoreSummary {
    rating: string;
    ghost: boolean;
    comboMax: number;
    riskMaxPct: number;
    spotted: boolean;
}

export function summarize(s: ScoreState): ScoreSummary {
    return {
        rating: ratingOf(s),
        ghost: s.ghost && !s.spotted,
        comboMax: s.comboMax,
        riskMaxPct: Math.round(s.riskMax * 100),
        spotted: s.spotted
    };
}
