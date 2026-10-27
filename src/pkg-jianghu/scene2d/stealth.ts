/**
 * 潜行 / 警觉（纯逻辑，渲染无关）
 *
 * 把现有抽象的「巡逻风险%」翻译成玩家可见可干预的呈现：
 * - 馆员/管理员有朝向 + 扇形视线（line-of-sight，非物理）；
 * - 玩家在视线内做高风险动作（持物 / 翻桌 / 夹层有物）时警觉累积，离开视线或换班空档时衰减；
 * - 警觉超过阈值 → 触发 scene:spotted 异常，回灌既有 evidence 模型，闭环而不另起风险源。
 */
import type { StealthState } from './types';

export function createStealth(): StealthState {
    return { facing: Math.PI, fov: Math.PI / 3, range: 200, alert: 0, inSight: false, shiftGap: false };
}

/** 点是否在以 origin 为顶点、朝 facing、半角 fov/2、半径 range 的扇形内（带书架遮挡近似） */
export function inCone(
    origin: { x: number; y: number },
    facing: number,
    fov: number,
    range: number,
    target: { x: number; y: number }
): boolean {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist > range || dist < 1) return false;
    let a = Math.atan2(dy, dx) - facing;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return Math.abs(a) <= fov / 2;
}

/** 朝向插值（避免视线锥硬跳变） */
export function turnToward(cur: number, target: number, step: number): number {
    let d = target - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= step) return target;
    return cur + Math.sign(d) * step;
}

export interface StealthTick {
    /** 玩家位置（看 person 容器） */
    player: { x: number; y: number };
    /** 当前是否在做高风险动作：持物 / 翻桌 / 夹层有物 */
    risky: boolean;
    /** 换班空档（馆员被引开或背身） */
    shiftGap: boolean;
    /** 帧间隔（ms） */
    dt: number;
}

/**
 * 每帧更新警觉。返回是否触发「被发现」阈值。
 * 注意：facing 由调用方按移动方向更新（见 updateFacing）。
 */
export function updateStealth(s: StealthState, npc: { x: number; y: number }, t: StealthTick): boolean {
    s.shiftGap = t.shiftGap;
    const seen = inCone(npc, s.facing, s.fov, s.range, t.player);
    s.inSight = seen && !t.shiftGap;
    // 累积速率（每秒）：视线内高风险最快，空档/离开衰减
    let rate = -0.35;
    if (t.shiftGap) rate = -0.6;
    else if (seen) rate = t.risky ? 0.95 : 0.18;
    s.alert = Math.max(0, Math.min(1, s.alert + rate * (t.dt / 1000)));
    return s.alert >= 0.85;
}

/** 由移动方向更新朝向 */
export function updateFacing(s: StealthState, from: { x: number; y: number }, to: { x: number; y: number }, dt: number): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.hypot(dx, dy) < 0.5) return;
    const target = Math.atan2(dy, dx);
    s.facing = turnToward(s.facing, target, 3.5 * (dt / 1000));
}
