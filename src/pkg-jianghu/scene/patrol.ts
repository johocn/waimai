/**
 * 巡逻 / 检查人员 AI（纯逻辑，渲染无关，便于单测）
 *
 * 状态机：
 *   PATROL ──risk↑──> SUSPICIOUS ──risk↑──> INSPECT ──roll 命中──> SEIZE
 *      ↑                    │                   │
 *      │                 risk↓              超时未发现
 *      └──── RETURN_PATROL <── CLEAR <─────────┘
 *   DIVERTED：被干扰物引开（暂停移动与检查）
 *
 * 判定（集中调参）：
 *   zoneAlert   = clamp(分区证据严重度 / 6, 0, 1)
 *   approach    = clamp(1 - 距离 / 6, 0, 1)
 *   witness     ：玩家在巡逻员附近同向移动累积 0..1
 *   discoveryRisk = 0.35*zoneAlert + 0.3*approach + 0.2*witness + 0.15*(1 - conceal/3)
 *                   - 0.25* distracted - 0.15* watched
 *   INSPECT 中发现概率 = 0.5 + 0.3*(1 - conceal/3) - 0.2*distracted
 * 随机用调用方注入的确定性 roll（seededPick），保证可回放、可测试。
 */

/** 巡逻员状态 */
export type PatrolState = 'PATROL' | 'SUSPICIOUS' | 'INSPECT' | 'SEIZE' | 'CLEAR' | 'RETURN_PATROL' | 'DIVERTED';

/** 一步判定所需输入 */
export interface PatrolInput {
    /** 分区证据严重度合计（越大越可疑） */
    zoneSeverity: number;
    /** 巡逻员与暗点格的等距距离（格） */
    distance: number;
    /** 暗点隐蔽度 1..3 */
    conceal: number;
    /** 目击值 0..1（玩家在巡逻员附近移动累积） */
    witness: number;
    /** 被干扰物引开 */
    distracted: boolean;
    /** 被怀表预判（警觉减半） */
    watched: boolean;
    /** 当前状态 */
    state: PatrolState;
    /** 已进入 INSPECT 的时长（毫秒） */
    inspectMs: number;
    /** 已进入 RETURN_PATROL 的时长（毫秒） */
    returnMs: number;
    /** 确定性随机 0..1 */
    roll: number;
}

/** 一步判定结果 */
export interface PatrolVerdict {
    state: PatrolState;
    /** 本步是否截获 */
    seize: boolean;
    /** 本步的发现风险（UI 警示用） */
    risk: number;
}

/** 调参集中处 */
export const PATROL_PARAMS = {
    /** 进入 SUSPICIOUS / INSPECT 的风险阈值 */
    riskThreshold: 0.6,
    /** 风险回落到阈值 * riskRelax 以下则回到 PATROL */
    riskRelax: 0.6,
    /** INSPECT 超此时长未发现 → CLEAR */
    inspectLimitMs: 1800,
    /** RETURN_PATROL 冷却时长 */
    returnCooldownMs: 2500,
    /** 发现概率参数 */
    findBase: 0.5,
    findConceal: 0.3,
    findDistract: 0.2,
    /** 风险权重 */
    wZone: 0.35,
    wApproach: 0.3,
    wWitness: 0.2,
    wConceal: 0.15,
    /** 减免 */
    divertReduction: 0.25,
    watchReduction: 0.15,
    /** 归一化尺度 */
    zoneScale: 6,
    distScale: 6
} as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 分区证据 → 可疑度 0..1 */
export function zoneAlert(zoneSeverity: number): number {
    return clamp01(zoneSeverity / PATROL_PARAMS.zoneScale);
}

/** 距离 → 逼近度 0..1 */
export function approach(distance: number): number {
    return clamp01(1 - distance / PATROL_PARAMS.distScale);
}

/** 发现风险 0..1（含道具减免） */
export function discoveryRisk(i: PatrolInput): number {
    const p = PATROL_PARAMS;
    let v = p.wZone * zoneAlert(i.zoneSeverity) + p.wApproach * approach(i.distance) + p.wWitness * clamp01(i.witness) + p.wConceal * (1 - clamp01(i.conceal / 3));
    if (i.distracted) v -= p.divertReduction;
    if (i.watched) v -= p.watchReduction;
    return clamp01(v);
}

/** INSPECT 中发现概率 */
export function findChance(conceal: number, distracted: boolean): number {
    const p = PATROL_PARAMS;
    return clamp01(p.findBase + p.findConceal * (1 - clamp01(conceal / 3)) - (distracted ? p.findDistract : 0));
}

/** 状态机一步：只依赖输入与确定性 roll，无副作用 */
export function patrolStep(i: PatrolInput): PatrolVerdict {
    const p = PATROL_PARAMS;
    const risk = discoveryRisk(i);
    if (i.distracted) return { state: 'DIVERTED', seize: false, risk };
    switch (i.state) {
        case 'PATROL':
            return risk > p.riskThreshold ? { state: 'SUSPICIOUS', seize: false, risk } : { state: 'PATROL', seize: false, risk };
        case 'SUSPICIOUS':
            if (risk > p.riskThreshold) return { state: 'INSPECT', seize: false, risk };
            return risk < p.riskThreshold * p.riskRelax ? { state: 'PATROL', seize: false, risk } : { state: 'SUSPICIOUS', seize: false, risk };
        case 'INSPECT':
            if (i.roll < findChance(i.conceal, i.distracted)) return { state: 'SEIZE', seize: true, risk };
            return i.inspectMs >= p.inspectLimitMs ? { state: 'CLEAR', seize: false, risk } : { state: 'INSPECT', seize: false, risk };
        case 'CLEAR':
            return { state: 'RETURN_PATROL', seize: false, risk };
        case 'RETURN_PATROL':
            return i.returnMs >= p.returnCooldownMs ? { state: 'PATROL', seize: false, risk } : { state: 'RETURN_PATROL', seize: false, risk };
        case 'SEIZE':
            return { state: 'SEIZE', seize: true, risk };
        case 'DIVERTED':
        default:
            return { state: i.distracted ? 'DIVERTED' : 'PATROL', seize: false, risk };
    }
}

/** 目击累积：距离 ≤2 格时每 tick +gain，封顶 1 */
export function witnessGain(current: number, distance: number, gain = 0.05): number {
    if (distance > 2) return Math.max(0, current - gain);
    return clamp01(current + gain);
}

/** 状态 → 场景表现提示文案（供 flash / HUD） */
export const PATROL_STATE_TEXT: Record<PatrolState, string> = {
    PATROL: '例行巡逻',
    SUSPICIOUS: '巡逻员起了疑心',
    INSPECT: '巡逻员正在检查',
    SEIZE: '暗点被识破',
    CLEAR: '扑空了',
    RETURN_PATROL: '回到巡线',
    DIVERTED: '被引开'
};
