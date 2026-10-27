/**
 * 环境互动 / 可达性（纯逻辑）
 *
 * - 昼夜：台灯开关切全局色调（渲染层重绘 tint）；
 * - 紫外：关灯时显影隐藏墨迹提示；
 * - 可达性：高处书架需踩梯凳/书堆垫高，放置时做 reach 校验。
 * 全部前端状态，不改后端契约。
 */
import type { LampState } from './types';

export function createLamp(): LampState {
    return { on: true, uv: false };
}

/** 高于此 y（屏幕上方=高处书架）需要垫脚才能放 */
export const REACH_HIGH_Y = 232;

/** 目标是否够得着：够低直接够；够高则必须附近有梯凳/书堆 */
export function reachOk(targetY: number, stoolNear: boolean): boolean {
    return targetY >= REACH_HIGH_Y || stoolNear;
}

/** 由落点反推「附近是否有垫脚物」：给调用方一个判据 */
export function stoolNear(x: number, y: number, props: { x: number; y: number; kind: string }[]): boolean {
    return props.some((p) => (p.kind === 'stool' || p.kind === 'block') && Math.hypot(p.x - x, p.y - y) < 90);
}

/** 全局色调（昼=暖白、夜=冷暗、紫外=偏紫），渲染层据此 tint 背墙/地板 */
export function ambientColor(lamp: LampState): number {
    if (!lamp.on) return lamp.uv ? 0x3a2a5a : 0x141019;
    return 0x1a1410;
}
