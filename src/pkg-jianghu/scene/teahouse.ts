/**
 * 茶馆接头场景的对象模型（渲染无关）
 *
 * 复用 SceneWorld 骨架：对象清单 / 状态机 / 修复规则完全由数据描述，
 * 与「北山老树·死信箱」共用同一套引擎，零改动。
 *
 * 玩法（暗号茶阵）：
 * - 预先与接头人约定「安全暗号」= 灯笼亮 + 窗开；
 * - 用「灯」拨亮灯笼、「帘」推开窗户布下暗号；
 * - 用「人」召唤接头人：暗号对 → 落座交付密信；错两次 → 巡街察觉，灯笼被击碎（不可修复）。
 * - 灯笼 broken 为终态（repairable=false），与死信箱「凉亭焚毁」同一机制。
 */
import { SceneWorld } from './world';

export function createTeahouseWorld(now = 0): SceneWorld {
    return new SceneWorld(
        [
            { id: 'lantern', type: 'lantern', state: 'out', recoverTo: 'out', repairable: false, data: {} },
            { id: 'window', type: 'window', state: 'closed', recoverTo: 'closed', repairable: false, data: {} },
            { id: 'table', type: 'table', state: 'set', recoverTo: 'set', data: { gxf: 2, gyf: 2 } },
            { id: 'seat-1', type: 'seat', state: 'ok', recoverTo: 'ok', data: { gxf: 2, gyf: 1 } },
            { id: 'seat-2', type: 'seat', state: 'ok', recoverTo: 'ok', data: { gxf: 1, gyf: 2 } },
            { id: 'seat-3', type: 'seat', state: 'ok', recoverTo: 'ok', data: { gxf: 3, gyf: 2 } },
            { id: 'cup', type: 'cup', state: 'placed', recoverTo: 'placed', data: { gxf: 2.5, gyf: 2.5, message: true } },
            { id: 'contact', type: 'contact', state: 'away', recoverTo: 'away', repairable: false, data: { gxf: 0, gyf: 4 } }
        ],
        now
    );
}

export const lanternOf = (w: SceneWorld) => w.get('lantern');
export const windowOf = (w: SceneWorld) => w.get('window');
export const tableOf = (w: SceneWorld) => w.get('table');
export const cupOf = (w: SceneWorld) => w.get('cup');
export const contactOf = (w: SceneWorld) => w.get('contact');
export const seatsOf = (w: SceneWorld) => w.list('seat');

/** 约定的安全暗号：灯笼亮 + 窗开 */
export const isSafeSignal = (w: SceneWorld): boolean => lanternOf(w).state === 'lit' && windowOf(w).state === 'open';

export function toggleLantern(w: SceneWorld, now = w.now): boolean {
    const l = lanternOf(w);
    if (l.state === 'broken') return false;
    w.setState('lantern', l.state === 'lit' ? 'out' : 'lit', now);
    return true;
}

export function toggleWindow(w: SceneWorld, now = w.now): void {
    const s = windowOf(w);
    w.setState('window', s.state === 'open' ? 'closed' : 'open', now);
}

/** 接头失败：灯笼被击碎（终态，不可自动修复，呼应凉亭焚毁） */
export function compromise(w: SceneWorld, now = w.now): void {
    const l = lanternOf(w);
    l.repairable = false;
    l.recoverMs = 0;
    w.setState('lantern', 'broken', now);
}

/** 接头成功：接头人落座，密信藏于茶杯下 */
export function arriveContact(w: SceneWorld, now = w.now): void {
    w.setState('contact', 'arrived', now);
    cupOf(w).data.message = true;
}

export function moveProp(w: SceneWorld, id: string, gxf: number, gyf: number): void {
    const o = w.get(id);
    if (o) {
        o.data.gxf = gxf;
        o.data.gyf = gyf;
    }
}

/** 整场复位 */
export function resetTeahouse(w: SceneWorld, now = 0): void {
    w.reset(now);
    moveProp(w, 'seat-1', 2, 1);
    moveProp(w, 'seat-2', 1, 2);
    moveProp(w, 'seat-3', 3, 2);
    moveProp(w, 'cup', 2.5, 2.5);
    cupOf(w).data.message = true;
}
