/**
 * 2D 横版布局：世界尺寸 / 四层分区 / 承载面 / 格坐标换算
 *
 * 版式延续图书馆既有策略：逻辑分辨率固定、桌面与手机像素级一致；
 * 世界宽于可视区（WORLD_W > VIEW_W），靠相机横向滚动露出图书馆进深。
 *
 * 从左到右 = 从墙到人，层号即深度：
 *   layer 0 墙层   背墙剪影、背景画（画后暗格）、故事角、门窗暖光
 *   layer 1 架层   三面书架 + 闭架区，架层即承载面
 *   layer 2 家具层 大阅览桌（可翻面）、管理台、梯凳
 *   layer 3 地面层 玩家活动区、便签标记、暗点投放区
 */
import type { HostSurface, Layer } from './types';

/** 可视区（逻辑像素） */
export const VIEW_W = 480;
export const VIEW_H = 640;
/** 世界宽：比可视区宽，横向滚动看进深 */
export const WORLD_W = 720;

/** 各层基线 y */
export const WALL_TOP = 96;
export const SHELF_Y = 344;
export const TABLE_Y = 436;
export const GROUND_Y = 476;
/** 每格纵深像素（gy 越大越靠前） */
export const GRID_DY = 15;

/** 等距格 → 2D 地面坐标（page 侧 gx/gy 契约不变） */
export function gridToPos(gx: number, gy: number): { x: number; y: number } {
    return { x: 92 + gx * 118, y: GROUND_Y + gy * GRID_DY };
}
/** 2D 坐标 → 等距格（便签 / 藏点落格用） */
export function posToGrid(x: number, y: number): { gx: number; gy: number } {
    return {
        gx: Math.max(0, Math.min(4, Math.round((x - 92) / 118))),
        gy: Math.max(0, Math.min(4, Math.round((y - GROUND_Y) / GRID_DY)))
    };
}
/** 世界坐标约束（不飞出左右边界） */
export function clampWorldX(x: number, halfW = 40): number {
    return Math.max(halfW, Math.min(WORLD_W - halfW, x));
}

export interface ObjLayout {
    x: number;
    y: number;
    layer: Layer;
    zone?: string;
    gx?: number;
    gy?: number;
    /** 视觉宽高（命中判定用） */
    w?: number;
    h?: number;
}

/** 场景对象布局表（id → 位置 / 层 / 归属区域） */
export const LAYOUT: Record<string, ObjLayout> = {
    // layer 0 墙层
    painting: { x: 566, y: 250, layer: 0, zone: 'painting', gx: 2, gy: 0, w: 120, h: 100 },
    story: { x: 140, y: 318, layer: 0, zone: 'story', gx: 4, gy: 4, w: 110, h: 90 },
    window: { x: 300, y: 170, layer: 0, w: 150, h: 96 },
    // layer 1 架层
    'shelf-1': { x: 132, y: SHELF_Y, layer: 1, zone: 'bookshelf', gx: 1, gy: 1, w: 150, h: 190 },
    'shelf-2': { x: 340, y: SHELF_Y, layer: 1, zone: 'bookshelf', gx: 3, gy: 1, w: 150, h: 190 },
    'shelf-3': { x: 604, y: SHELF_Y, layer: 1, zone: 'bookshelf', gx: 4, gy: 3, w: 150, h: 190 },
    'teach-shelf': { x: 690, y: SHELF_Y, layer: 1, zone: 'bookshelf', gx: 1, gy: 4, w: 60, h: 190 },
    // layer 2 家具层
    'reading-1': { x: 340, y: TABLE_Y, layer: 2, zone: 'reading', gx: 0, gy: 3, w: 190, h: 76 },
    desk: { x: 636, y: TABLE_Y + 6, layer: 2, zone: 'desk', gx: 0, gy: 0, w: 140, h: 70 },
    'stool-1': { x: 226, y: TABLE_Y + 44, layer: 2, w: 40, h: 44 },
    'stool-2': { x: 452, y: TABLE_Y + 44, layer: 2, w: 40, h: 44 },
    // layer 3 地面层
    player: { x: 92, y: GROUND_Y + 4 * GRID_DY, layer: 3, gx: 0, gy: 4, w: 40, h: 60 },
    librarian: { x: 300, y: GROUND_Y + 2 * GRID_DY, layer: 3, gx: 2, gy: 2, w: 40, h: 62 },
    admin: { x: 636, y: GROUND_Y + 2 * GRID_DY, layer: 3, gx: 0, gy: 2, w: 40, h: 62 }
};

/** 每层书架的可放书行数（自上而下） */
export const SHELF_ROWS = 3;
/** 每层书架的可见列数 */
export const SHELF_COLS = 5;

/** 书架 row 的 y 偏移（相对书架基线，向上为正） */
export function shelfRowY(row: number): number {
    return -150 + row * 46;
}

/** 构建全部承载面：架层 / 桌面 / 桌底（桌底仅翻面后可用，由场景按需启用） */
export function buildSurfaces(): HostSurface[] {
    const list: HostSurface[] = [];
    const shelves = ['shelf-1', 'shelf-2', 'shelf-3'];
    shelves.forEach((sid) => {
        const L = LAYOUT[sid];
        for (let row = 0; row < SHELF_ROWS; row++) {
            list.push({
                id: `${sid}:${row}`,
                kind: 'shelf',
                x: L.x,
                y: L.y + shelfRowY(row) + 40,
                w: L.w ?? 150,
                h: 40,
                owner: sid,
                zone: 'bookshelf',
                gx: L.gx ?? 1,
                gy: L.gy ?? 1
            });
        }
    });
    // 桌面（大阅览桌 + 管理台）
    (['reading-1', 'desk'] as const).forEach((tid) => {
        const L = LAYOUT[tid];
        list.push({
            id: `tableTop:${tid}`,
            kind: 'tableTop',
            x: L.x,
            y: L.y - 34,
            w: L.w ?? 150,
            h: 30,
            owner: tid,
            zone: L.zone,
            gx: L.gx ?? 0,
            gy: L.gy ?? 0
        });
    });
    // 地面（整条活动带）
    list.push({
        id: 'ground',
        kind: 'ground',
        x: WORLD_W / 2,
        y: GROUND_Y + 26,
        w: WORLD_W,
        h: 60,
        zone: 'reading',
        gx: 3,
        gy: 3
    });
    return list;
}

/** 桌底承载面（桌子翻面后才出现） */
export function underSurface(tableId: string, zone: string, gx: number, gy: number, x: number, y: number): HostSurface {
    return {
        id: `tableUnder:${tableId}`,
        kind: 'tableUnder',
        x,
        y: y + 6,
        w: 170,
        h: 40,
        owner: tableId,
        zone,
        gx,
        gy
    };
}

/**
 * 取最近的有效承载面。
 * @param allowUnder 是否允许桌底（仅持有物可粘、且桌子已翻面）
 */
export function nearestSurface(
    surfaces: HostSurface[],
    x: number,
    y: number,
    tolerance = 90,
    predicate?: (s: HostSurface) => boolean
): HostSurface | null {
    let best: HostSurface | null = null;
    let bd = Infinity;
    for (const s of surfaces) {
        if (predicate && !predicate(s)) continue;
        const dx = Math.abs(x - s.x);
        const dy = Math.abs(y - s.y);
        if (dx > s.w / 2 + tolerance || dy > s.h / 2 + tolerance) continue;
        const d = dx * 0.6 + dy;
        if (d < bd) {
            bd = d;
            best = s;
        }
    }
    return best;
}
