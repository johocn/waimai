/**
 * 2D 横版场景共享类型（学校图书馆 · 密页传递）
 *
 * 与 scene/ 的等距框架并存：茶馆 / 密室继续用 iso，图书馆改用这套 2D 模型。
 * 设计原则：渲染无关的状态放在这里，Phaser 视图对象只做「画」。
 */

/** 层：0 墙 / 1 架 / 2 家具 / 3 地面；同层内按 y 排序，跨层用 layer 兜底 */
export type Layer = 0 | 1 | 2 | 3;

export type ObjKind =
    | 'bookshelf'
    | 'painting'
    | 'story'
    | 'table'
    | 'desk'
    | 'stool'
    | 'book'
    | 'block'
    | 'marker'
    | 'player'
    | 'librarian'
    | 'admin'
    | 'niche'
    | 'window';

/** 承载面类型：决定物体能否被放置，以及放置后是否算「异常摆放」 */
export type HostKind = 'shelf' | 'tableTop' | 'tableUnder' | 'ground' | 'held';

export interface HostSurface {
    id: string;
    kind: HostKind;
    /** 承载面中心 x 与「放置基线 y」（物体底部落在该线上） */
    x: number;
    y: number;
    w: number;
    h: number;
    /** 归属场景对象 id（桌上 / 桌底 / 架层） */
    owner?: string;
    /** 归属区域（bookshelf / reading / desk / story / painting） */
    zone?: string;
    /** 等距格坐标：藏点 / 便签沿用既有 gx,gy 契约，不因换投影而改 */
    gx: number;
    gy: number;
}

/* ── 书籍 ── */
export type BookState = 'onShelf' | 'held' | 'onTable' | 'onGround' | 'open';

export interface BookView {
    id: string;
    label: string;
    state: BookState;
    /** open 时的当前页 */
    page: number;
    pages: number;
    /** 夹层内藏入物：'envelope' 或 'prop:xxx' */
    stash: string[];
    /** 是否被撕过页（教学交互） */
    torn: boolean;
    /** 所在宿主承载面 id（架层 / 桌面 / 桌底 / 地面） */
    hostId: string;
    shelfId: string;
    row: number;
    x: number;
    y: number;
    view: any;
    /** 书脊色相（程序化绘制用） */
    hue: number;
}

/* ── 桌子 ── */
export type TableState = 'normal' | 'flipping' | 'flipped';

export interface TableView {
    id: string;
    zone: string;
    gx: number;
    gy: number;
    state: TableState;
    /** 桌面物品（非空则禁止翻面） */
    topItems: string[];
    /** 桌底粘附物：'envelope' 或 'prop:xxx' */
    underItems: string[];
    x: number;
    y: number;
    view: any;
}

/* ── 潜行 / 警觉 ── */
export interface StealthState {
    /** 朝向（弧度）；移动时按速度方向更新 */
    facing: number;
    /** 视线半角（弧度，整锥 = 2*fov） */
    fov: number;
    /** 视线半径（逻辑像素） */
    range: number;
    /** 警觉值 0..1（在视线内做高风险动作累积；离视线/换班空档衰减） */
    alert: number;
    /** 玩家当前是否处于视线内 */
    inSight: boolean;
    /** 是否处于「换班空档」（馆员被引开/背身，风险低） */
    shiftGap: boolean;
}

/* ── 解谜 / 机关 ── */
export interface PuzzleState {
    kind: 'decode' | 'riddle' | 'lock';
    /** mock 内预设答案（不区分大小写） */
    answer: string;
    solved: boolean;
    hint: string;
    /** 密钥所在书 id（decode 用） */
    fromBook?: string;
}

/* ── 环境（昼夜 / 紫外 / 可达性） ── */
export interface LampState {
    /** 台灯是否亮着（亮=昼，灭=夜） */
    on: boolean;
    /** 紫外显影模式 */
    uv: boolean;
}

/* ── 评分 / 成就 ── */
export interface ScoreState {
    /** 全程零察觉通关 → 幽灵 */
    ghost: boolean;
    /** 当前连击（优雅连续操作） */
    combo: number;
    comboMax: number;
    riskMax: number;
    spotted: boolean;
    startedAt: number;
    finished: boolean;
}

/* ── 抓取 ── */
/** 可被抓起的物体种类 */
export type GrabKind = 'book' | 'block' | 'stool' | 'envelope' | 'prop';
/** 手里正拿着的东西（从夹层 / 桌底取出的） */
export type HoldKind = 'envelope' | 'prop';

export interface GrabState {
    kind: GrabKind;
    id: string;
    view: any;
    offX: number;
    offY: number;
    /** 是否发生位移（位移超过阈值才算拖拽，否则视为短按查看） */
    moved: boolean;
    downX: number;
    downY: number;
}

/** 场景异常（写入证据链 → 抬升暴露度与巡逻发现率） */
export interface SceneAnomaly {
    kind: string;
    label: string;
    severity: number;
    zone: string;
}
