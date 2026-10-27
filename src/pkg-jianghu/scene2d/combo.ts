/**
 * 物件组合 / NPC 策略（纯逻辑）
 *
 * - 员工卡开管理台抽屉：抽屉状态切换，露出内置物；
 * - 磁铁吸桌底：把手持纸件粘到翻面桌底（简化调用 tables.ts 的 stickUnder）；
 * - 故事角引开馆员：制造一段安全窗口（倒计时），窗口内警觉衰减、巡逻被引走。
 * 全部前端状态，不改后端契约。
 */
import type { TableView } from './types';

/** 管理台抽屉开合（toggle），返回开合后的状态 */
export function toggleDrawer(state: { drawerOpen: boolean }): boolean {
    state.drawerOpen = !state.drawerOpen;
    return state.drawerOpen;
}

/** 磁铁吸桌底：把手持纸件粘到翻面桌底 */
export function magnetStick(table: TableView, item: string): boolean {
    if (table.state !== 'flipped') return false;
    if (table.underItems.indexOf(item) >= 0) return false;
    table.underItems.push(item);
    return true;
}

/** 故事角引开：返回安全窗口时长（ms） */
export const DISTRACT_WINDOW_MS = 7000;
export function startDistract(now: number): { until: number } {
    return { until: now + DISTRACT_WINDOW_MS };
}

/** 判断是否处于安全窗口 */
export function inSafeWindow(until: number, now: number): boolean {
    return now < until;
}
