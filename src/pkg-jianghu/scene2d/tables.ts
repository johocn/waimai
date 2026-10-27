/**
 * 桌子状态机：normal / flipping / flipped
 *
 * 桌子可翻面——这是「粘到桌子底部」的前提：翻面后桌底成为可粘附面，
 * 信函 / 道具可粘上去，也可再取回。桌面有物品时禁止翻面（先清桌面）。
 * 桌翻着属于明显异常：由场景写入证据链，抬升暴露度与巡逻发现率。
 */
import type { TableView } from './types';
import { drawTableBottom, drawTableTop } from './props2d';

export function createTable(id: string, zone: string, gx: number, gy: number, x: number, y: number, view: any): TableView {
    return { id, zone, gx, gy, state: 'normal', topItems: [], underItems: [], x, y, view };
}

export function redrawTable(table: TableView): void {
    if (!table.view) return;
    const g = table.view.list ? table.view.list[0] : null;
    if (!g || !g.clear) return;
    if (table.state === 'flipped') drawTableBottom(g);
    else drawTableTop(g);
}

/** 能否翻面：桌面必须清空 */
export function canFlip(table: TableView): { ok: boolean; reason?: string } {
    if (table.state === 'flipping') return { ok: false, reason: '正在翻面' };
    if (table.state === 'flipped') return { ok: true };
    if (table.topItems.length) return { ok: false, reason: '桌面上还有东西：先把书和信函拿走' };
    return { ok: true };
}

/** 翻面 / 翻回（动画由场景播，这里只切状态） */
export function setFlipped(table: TableView, flipped: boolean): void {
    table.state = flipped ? 'flipped' : 'normal';
    redrawTable(table);
}

/** 桌底粘附物 */
export function stickUnder(table: TableView, item: string): boolean {
    if (table.state !== 'flipped') return false;
    if (table.underItems.indexOf(item) >= 0) return false;
    table.underItems.push(item);
    return true;
}

/** 从桌底取回 */
export function takeUnder(table: TableView, item?: string): string | null {
    if (!table.underItems.length) return null;
    const idx = item ? table.underItems.indexOf(item) : table.underItems.length - 1;
    if (idx < 0) return null;
    const [got] = table.underItems.splice(idx, 1);
    return got;
}

/** 桌面放物（书被放到桌上时登记，供翻面校验与 UI 提示） */
export function putOnTop(table: TableView, item: string): void {
    if (table.topItems.indexOf(item) < 0) table.topItems.push(item);
}

export function removeFromTop(table: TableView, item: string): void {
    const i = table.topItems.indexOf(item);
    if (i >= 0) table.topItems.splice(i, 1);
}
