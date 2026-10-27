/**
 * 书籍状态机：onShelf / held / onTable / onGround / open
 *
 * 书是本次重设计的核心交互载体：能拿起、能翻开、能翻页，页间夹层可藏入信函与道具，
 * 也可从夹层取出。撕页教学交互保留（15 秒自动修复由 world.tick 驱动）。
 */
import type { BookView, HostSurface } from './types';
import { drawBookView } from './props2d';

/** 新建一本书（默认在架上） */
export function createBook(id: string, shelfId: string, row: number, hue: number, x: number, y: number, view: any): BookView {
    return {
        id,
        label: id.indexOf('teach-book') === 0 ? '教学书（可撕页）' : '旧书',
        state: 'onShelf',
        page: 0,
        pages: 6,
        stash: [],
        torn: false,
        hostId: `${shelfId}:${row}`,
        shelfId,
        row,
        x,
        y,
        view,
        hue
    };
}

/** 重绘（状态变化后调用）。
 *  注意：书的 view 可能是 Graphics（直接就是绘制对象）或 Container（取第一个子对象），
 *  早期写成只取 `.list[0]` 会让 Graphics 分支永远画不出来。 */
export function redrawBook(book: BookView): void {
    const v: any = book.view;
    if (!v) return;
    const g: any = v.list && v.list[0] ? v.list[0] : v;
    if (g && g.clear) drawBookView(g, book);
}

/** 拿起：进入 held，由调用方负责把 view 挂到手持容器 */
export function pickUp(book: BookView): boolean {
    if (book.state === 'held') return false;
    book.state = 'held';
    redrawBook(book);
    return true;
}

/** 放回原承载面：按 hostId 还原状态（拿起后取消 / 短按查看时用） */
export function putBack(book: BookView): void {
    if (book.state !== 'held') return;
    if (book.hostId.indexOf('tableTop:') === 0) book.state = 'onTable';
    else if (book.hostId === 'ground') book.state = 'onGround';
    else book.state = 'onShelf';
    redrawBook(book);
}

/** 放下到某个承载面 */
export function dropBook(book: BookView, host: HostSurface): void {
    book.hostId = host.id;
    book.state = host.kind === 'shelf' ? 'onShelf' : host.kind === 'ground' ? 'onGround' : 'onTable';
    book.x = host.x;
    book.y = host.y;
    book.page = 0;
    redrawBook(book);
}

/** 翻开 / 合上 */
export function toggleOpen(book: BookView): boolean {
    if (book.state === 'held') return false; // 手里拿着时要先放下
    if (book.state === 'open') {
        book.state = book.hostId.indexOf('tableTop') === 0 ? 'onTable' : book.hostId === 'ground' ? 'onGround' : 'onShelf';
        book.page = 0;
    } else {
        book.state = 'open';
        book.page = 0;
    }
    redrawBook(book);
    return book.state === 'open';
}

/** 翻页（仅 open 态有效），返回新页码 */
export function flipPage(book: BookView, dir = 1): number {
    if (book.state !== 'open') return -1;
    book.page = (book.page + dir + book.pages) % book.pages;
    redrawBook(book);
    return book.page;
}

/** 夹层藏入物（信函 / 道具） */
export function stashInto(book: BookView, item: string): boolean {
    if (book.state !== 'open') return false;
    if (book.stash.indexOf(item) >= 0) return false;
    book.stash.push(item);
    redrawBook(book);
    return true;
}

/** 从夹层取出 */
export function takeFrom(book: BookView, item?: string): string | null {
    if (book.state !== 'open' || !book.stash.length) return null;
    const idx = item ? book.stash.indexOf(item) : book.stash.length - 1;
    if (idx < 0) return null;
    const [got] = book.stash.splice(idx, 1);
    redrawBook(book);
    return got;
}

/** 撕页（教学交互）：撕完置 torn，由 world 的 15 秒自动修复复原 */
export function tearPage(book: BookView): boolean {
    if (book.torn) return false;
    book.torn = true;
    redrawBook(book);
    return true;
}

/** 自动修复后复位（world.tick 回报 recovered 时调用） */
export function repairBook(book: BookView): void {
    book.torn = false;
    redrawBook(book);
}

/** 夹层是否有东西（供 UI 提示与桌面对比） */
export function hasStash(book: BookView): boolean {
    return book.stash.length > 0;
}
