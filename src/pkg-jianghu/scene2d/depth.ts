/**
 * 深度排序：layer 兜底 + 同层按 y 排序。
 *
 * 只在对象 layer / y 变化时重排（dirty 触发），不在每帧全量 sortChildren，避免移动端掉帧。
 */
import type { Layer } from './types';

export interface DepthItem {
    view: any;
    layer: Layer;
    y: number;
}

/** 基础深度：0 背景 / 1 地面烘焙 / 2 起为对象，20 起为 HUD */
export const DEPTH_BASE = 10;

export function applyDepth(items: DepthItem[], base = DEPTH_BASE): void {
    const sorted = items.slice().sort((a, b) => a.layer - b.layer || a.y - b.y);
    sorted.forEach((it, i) => it.view.setDepth(base + i));
}

/** 单对象深度查询（供新建对象插入时使用） */
export function depthOf(items: DepthItem[], target: DepthItem, base = DEPTH_BASE): number {
    const sorted = items.slice().sort((a, b) => a.layer - b.layer || a.y - b.y);
    const idx = sorted.indexOf(target);
    return base + (idx < 0 ? sorted.length : idx);
}
