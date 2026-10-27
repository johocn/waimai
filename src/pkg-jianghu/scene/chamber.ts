/**
 * 总舵密室场景的对象模型（渲染无关）
 *
 * 复用 SceneWorld 骨架：与死信箱、茶馆共用同一套引擎，零改动。
 *
 * 玩法（机关锁）：
 * - 三具机关盘（dial）各可拨 0~5，须拨到与总舵约定的暗数 [2,4,1]；
 * - 用「拨盘」点机关盘使其 +1；用「灯」点亮壁炬（仪式感）；
 * - 用「开」尝试开启石门：暗数对 → 石门开、密令现世；
 *   错三次 → 机簧触发（trap sprung，终态不可修复，密室封锁），须重置。
 * - trap 终态沿用死信箱「凉亭焚毁」/ 茶馆「灯笼碎」同一机制（repairable=false）。
 */
import { SceneWorld } from './world';

export const DIAL_MAX = 6;
/** 与总舵约定的机关暗数（示例） */
export const SECRET_COMBO: [number, number, number] = [2, 4, 1];

export function createHQChamberWorld(now = 0): SceneWorld {
    return new SceneWorld(
        [
            { id: 'door', type: 'door', state: 'locked', recoverTo: 'locked', repairable: false, data: {} },
            { id: 'dial-1', type: 'dial', state: 'set', recoverTo: 'set', data: { value: 0, gxf: 1, gyf: 3 } },
            { id: 'dial-2', type: 'dial', state: 'set', recoverTo: 'set', data: { value: 0, gxf: 2, gyf: 3 } },
            { id: 'dial-3', type: 'dial', state: 'set', recoverTo: 'set', data: { value: 0, gxf: 3, gyf: 3 } },
            { id: 'torch-1', type: 'torch', state: 'out', recoverTo: 'out', repairable: false, data: {} },
            { id: 'torch-2', type: 'torch', state: 'out', recoverTo: 'out', repairable: false, data: {} },
            { id: 'block', type: 'block', state: 'ok', recoverTo: 'ok', data: { gxf: 3, gyf: 2 } },
            { id: 'trap', type: 'trap', state: 'armed', recoverTo: 'armed', repairable: false, data: {} },
            { id: 'secret', type: 'secret', state: 'hidden', recoverTo: 'hidden', data: {} }
        ],
        now
    );
}

export const doorOf = (w: SceneWorld) => w.get('door');
export const dialsOf = (w: SceneWorld) => w.list('dial');
export const trapOf = (w: SceneWorld) => w.get('trap');
export const secretOf = (w: SceneWorld) => w.get('secret');
export const blockOf = (w: SceneWorld) => w.get('block');

export const comboMatch = (w: SceneWorld): boolean =>
    dialsOf(w)
        .map((d) => d.data.value)
        .join(',') === SECRET_COMBO.join(',');

export function rotateDial(w: SceneWorld, id: string): void {
    const d = w.get(id);
    if (d) d.data.value = (d.data.value + 1) % DIAL_MAX;
}

export function toggleTorch(w: SceneWorld, id: string): void {
    const t = w.get(id);
    if (!t) return;
    w.setState(id, t.state === 'lit' ? 'out' : 'lit');
}

/** 连错三次：机簧触发（终态，不可自动修复） */
export function springTrap(w: SceneWorld, now = w.now): void {
    const t = trapOf(w);
    t.repairable = false;
    t.recoverMs = 0;
    w.setState('trap', 'sprung', now);
}

export function openChamber(w: SceneWorld, now = w.now): void {
    w.setState('door', 'open', now);
    w.setState('secret', 'revealed', now);
}

/** 整场复位 */
export function resetChamber(w: SceneWorld, now = 0): void {
    w.reset(now);
    dialsOf(w).forEach((d) => (d.data.value = 0));
}
