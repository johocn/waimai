/**
 * 图书馆 2D 横版场景（学校图书馆 · 密页传递）
 *
 * 设计要点：
 * - 正面视角 2D 横版：世界宽 720 > 可视 480，横向滚动露出进深；四层分区（墙/架/家具/地面）
 * - 直接抓取：默认可拿起任何可互动物件（跟手 + 手持视觉），松手落到最近有效承载面；
 *   短按未拖动 = 查看（书翻开 / 桌出动作条 / 书堆提示）
 * - 书籍：拿起 / 翻开 / 翻页 / 页间夹层藏取；桌子：翻面 / 桌底粘附
 * - 物理上更合理的场景 → 翻译成风险模型上的异常增量（写证据链，抬升暴露度与巡逻发现率）
 *
 * 复用 iso 基类只为拿到注册表接线 / flash / hasFrame / drawInkPerson / world.tick，
 * 投影全部改用 scene2d/layout，茶馆与密室不受影响。
 */
import { createJianghuIsoScene } from '../scene/JianghuIsoScene';
import { ATLAS_KEY, FRAMES } from '../scene/assets';
import { PATROL_STATE_TEXT, patrolStep, witnessGain, type PatrolState } from '../scene/patrol';
import { contextualBoard } from '../scene/codebook';
import {
    addEvidence,
    blocksOf,
    markerCoveredByBlock,
    moveBlock,
    removeEvidenceByKind,
    resetLibraryWorld,
    seededPick,
    DISTRACT_MS,
    PATROL_BASE_SPEED,
    PATROL_ALERT_GAIN
} from '../scene/world';
import {
    GROUND_Y,
    LAYOUT,
    SHELF_COLS,
    SHELF_ROWS,
    VIEW_H,
    VIEW_W,
    WORLD_W,
    buildSurfaces,
    clampWorldX,
    gridToPos,
    nearestSurface,
    posToGrid,
    shelfRowY,
    type ObjLayout
} from './layout';
import { applyDepth, DEPTH_BASE, type DepthItem } from './depth';
import {
    BOOK_HUES,
    CINNABAR,
    GOLD,
    GOLD_L,
    drawAlertPip,
    drawBackWall,
    drawBookStack,
    drawBookView,
    drawDeskDrawer,
    drawDust,
    drawEnvelope,
    drawFloor,
    drawHand,
    drawMarkerStone,
    drawNiche2D,
    drawSightCone,
    drawStool,
    drawUVInk
} from './props2d';
import {
    createBook,
    flipPage,
    pickUp,
    putBack,
    redrawBook,
    stashInto,
    takeFrom,
    tearPage,
    toggleOpen
} from './books';
import type { BookView } from './types';
import { canFlip, createTable, putOnTop, removeFromTop, setFlipped, stickUnder, takeUnder } from './tables';
import type { TableView } from './types';
import { createStealth, updateStealth, updateFacing } from './stealth';
import { makeDecodePuzzle, makeRiddlePuzzle, makeLockPuzzle, checkPuzzle, puzzleClue } from './puzzles';
import { createLamp, reachOk, stoolNear, ambientColor, REACH_HIGH_Y } from './environment';
import { toggleDrawer, magnetStick, startDistract, inSafeWindow } from './combo';
import { sfx, resumeAudio } from './audio';
import { createScore, recordRisk, bumpCombo, breakCombo, summarize } from './score';
import type { GrabState, HostSurface, Layer } from './types';

const MARK_DIR: Record<string, [number, number]> = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
const PROP_OF_ZONE: Record<string, string> = {
    bookshelf: 'fake-spine',
    painting: 'decode-glass',
    reading: 'magnet',
    desk: 'staff-card',
    story: 'distraction'
};
const ZONE_OF: Record<string, string> = {
    desk: 'desk',
    painting: 'painting',
    'shelf-1': 'bookshelf',
    'shelf-2': 'bookshelf',
    'shelf-3': 'bookshelf',
    'teach-shelf': 'bookshelf',
    'reading-1': 'reading',
    story: 'story'
};

/** 书架内某列的 x 偏移（相对架体中心） */
function shelfColX(L: ObjLayout, col: number): number {
    const w = L.w ?? 150;
    return -w / 2 + 16 + (col * (w - 30)) / (SHELF_COLS - 1);
}
/** 由落点 x 反推书架列 */
function colFromX(L: ObjLayout, x: number): number {
    const w = L.w ?? 150;
    const t = (x - L.x + w / 2 - 16) / ((w - 30) / (SHELF_COLS - 1));
    return Math.max(0, Math.min(SHELF_COLS - 1, Math.round(t)));
}

export function makeLibrary2dScene(Phaser: any) {
    return class Library2dScene extends createJianghuIsoScene(Phaser) {
        bgColor = '#0c1118';

        /* ── 视图注册表 ── */
        objViews: Record<string, any> = {};
        books: BookView[] = [];
        tables: TableView[] = [];
        surfaces: HostSurface[] = buildSurfaces();
        depthItems: DepthItem[] = [];

        /* ── 抓取 / 手持 ── */
        grab: GrabState | null = null;
        handBox: any = null;
        handG: any = null;
        /** 从夹层 / 桌底取出的东西（点在身上即再次拿起） */
        carry: { item: string; view: any } | null = null;

        /* ── 角色与 NPC ── */
        player: any = null;
        pg: any = null;
        walking = false;
        faceDir = 1;
        librarianView: any = null;
        adminView: any = null;
        dropView: any = null;
        decoyView: any = null;

        /* ── 巡逻（沿用 scene/patrol.ts 纯逻辑） ── */
        patrolPts: { x: number; y: number }[] = [];
        patrolIdx = 0;
        patrolState: PatrolState = 'PATROL';
        patrolInspectMs = 0;
        patrolReturnMs = 0;
        witness = 0;
        patrolRisk = 0;
        seizeRolls = 0;
        adminPts: { x: number; y: number }[] = [];
        adminIdx = 0;
        adminCycleMs = 0;
        difficulty = 1;
        seizeTriggered = false;
        phase = 'IDLE';
        decoyCell: { gx: number; gy: number } | null = null;
        decoyActive = false;
        decoyUntil = 0;
        distractUntil = 0;
        lightUntil = 0;
        watchUntil = 0;

        /* ── 书面板 ── */
        /** 面板是否打开（平铺对象数组，不用 Container：容器会覆盖 scrollFactor） */
        panelOpen = false;
        panelParts: any[] = [];
        stashParts: any[] = [];
        panelTitle: any = null;
        panelBookG: any = null;
        /** @deprecated 旧面板容器字段，已由 panelOpen + panelParts 取代（保留以免外部引用报错） */
        bookPanel: any = null;
        openBook: BookView | null = null;

        /* ── 相机 ── */
        panStart: any = null;
        pinchDist = 0;
        pinchMid: any = null;
        readonly MIN_ZOOM = 0.7;
        readonly MAX_ZOOM = 1.6;

        /** 已生效的场景异常（kind → 证据），恢复时撤回，避免同一异常重复计分 */
        anomalies = new Set<string>();
        depthDirty = false;

        /* ── 本轮增强：潜行 / 解谜 / 环境 / 组合 / 评分 ── */
        stealth = createStealth();
        lamp = createLamp();
        score = createScore();
        /** 已解出谜题 kind → true */
        puzzles: Record<string, boolean> = {};
        /** 线索依赖图：当前已解锁的线索/道具节点（由 recomputeClues 推导） */
        clueSet = new Set<string>();
        /** 幽灵情报解锁音效只播一次 */
        ghostIntelSfx = false;
        /** 暗格/情报首次解锁的瞬时光环动画起点（performance.now()） */
        batteryBurst = 0;
        ghostBurst = 0;
        /** 管理台抽屉开合 */
        drawerOpen = false;
        deskDrawerG: any = null;
        /** 紫外显影墨迹标记（关灯 UV 模式才画） */
        uvMarks: { x: number; y: number }[] = [];
        /** 尘埃 / 屏幕色调覆盖层（scrollFactor 0） */
        dustG: any = null;
        overlayG: any = null;
        /** 线索解锁特效层（暗格电池辉光等，世界坐标） */
        clueG: any = null;
        /** 馆员上一帧位置（算朝向） */
        libPrev = { x: 0, y: 0 };
        lastT = 0;
        /** 测试钩子：强制「被注视」以验证警觉/被发现链路（正常玩法不触发） */
        forceSeen = false;

        constructor() {
            super('library2d');
        }

        /* ═══════════════ 构建 ═══════════════ */

        build() {
            this.buildBackdrop();
            this.buildShelves();
            this.buildFurniture();
            this.buildGround();
            this.createPlayer();
            this.buildNpc();
            this.buildPainting();
            this.makeClueBoard();
            this.buildHand();
            this.bindCamera();
            this.applyDepthAll();
            // 本轮增强：尘埃 / 屏幕色调覆盖层 / 紫外标记 / 评分计时
            this.dustG = this.add.graphics().setScrollFactor(0).setDepth(DEPTH_BASE + 50);
            this.overlayG = this.add.graphics().setScrollFactor(0).setDepth(DEPTH_BASE + 51);
            this.clueG = this.add.graphics().setDepth(DEPTH_BASE + 52);
            this.uvMarks = [
                { x: LAYOUT.painting.x, y: LAYOUT.painting.y - 38 },
                { x: 150, y: 250 },
                { x: 520, y: 300 },
                { x: 360, y: 470 }
            ];
            this.score.startedAt = performance.now();
            this.ghostIntelSfx = false;
            this.batteryBurst = 0;
            this.ghostBurst = 0;
            this.recomputeClues();
        }

        buildBackdrop() {
            drawBackWall(this.bg, WORLD_W);
            drawFloor(this.tilesG, WORLD_W, GROUND_Y, VIEW_H);
        }

        /** 架层：三面书架；每行若干本，行中间那本可拿起 / 可翻开 */
        buildShelves() {
            (['shelf-1', 'shelf-2', 'shelf-3'] as const).forEach((sid, si) => {
                const L = LAYOUT[sid];
                const c = this.add.container(L.x, L.y).setDepth(DEPTH_BASE + si);
                const g = this.add.graphics();
                c.add(g);
                const w = L.w ?? 150;
                g.fillStyle(0x2b2018, 1);
                g.fillRoundedRect(-w / 2, -170, w, 176, 3);
                g.fillStyle(0x3a2a1c, 1);
                for (let row = 0; row < SHELF_ROWS; row++) g.fillRect(-w / 2 + 5, shelfRowY(row) + 38, w - 10, 6);
                g.lineStyle(1.5, GOLD, 0.35);
                g.strokeRoundedRect(-w / 2, -170, w, 176, 3);

                for (let row = 0; row < SHELF_ROWS; row++) {
                    for (let col = 0; col < SHELF_COLS; col++) {
                        const lx = shelfColX(L, col);
                        const ly = shelfRowY(row) + 36;
                        const hue = BOOK_HUES[(si + row + col) % BOOK_HUES.length];
                        const interactive = col === 2;
                        const gv = this.add.graphics();
                        c.add(gv);
                        if (interactive) {
                            const book = createBook(`${sid}-b${row}`, sid, row, hue, L.x + lx, L.y + ly, gv);
                            this.books.push(book);
                            redrawBook(book);
                        } else {
                            gv.fillStyle(hue, 1);
                            gv.fillRoundedRect(lx - 7, ly - 26, 14, 26, 2);
                            gv.fillStyle(0xffffff, 0.14);
                            gv.fillRect(lx - 5, ly - 24, 10, 2);
                            gv.lineStyle(1, GOLD_L, 0.4);
                            gv.strokeRoundedRect(lx - 7, ly - 26, 14, 26, 2);
                        }
                    }
                }
                this.objViews[sid] = c;
                this.depthItems.push({ view: c, layer: 1, y: L.y });
            });

            // 闭架教学架位（sealShelf 演示）
            const ts = LAYOUT['teach-shelf'];
            const tc = this.add.container(ts.x, ts.y).setDepth(DEPTH_BASE + 3);
            const tg = this.add.graphics();
            tg.fillStyle(0x241a12, 1);
            tg.fillRoundedRect(-30, -170, 60, 176, 3);
            tg.fillStyle(CINNABAR, 0.5);
            tg.fillRect(-26, -120, 52, 60);
            tg.lineStyle(1.5, GOLD, 0.4);
            tg.strokeRoundedRect(-30, -170, 60, 176, 3);
            tc.add(tg);
            this.objViews['teach-shelf'] = tc;
            this.depthItems.push({ view: tc, layer: 1, y: ts.y });
        }

        /** 家具层：大阅览桌（可翻面）+ 管理台 + 梯凳 */
        buildFurniture() {
            const reading = LAYOUT['reading-1'];
            const rv = this.add.container(reading.x, reading.y).setDepth(DEPTH_BASE + 10);
            const rg = this.add.graphics();
            rv.add(rg);
            const readingTable = createTable('reading-1', 'reading', reading.gx ?? 0, reading.gy ?? 3, reading.x, reading.y, rv);
            this.tables.push(readingTable);
            this.objViews['reading-1'] = rv;
            this.depthItems.push({ view: rv, layer: 2, y: reading.y });

            // 教学书默认搁在阅览桌旁的地面（撕页演示；桌面保持空着才能翻面）
            const bookG = this.add.graphics();
            bookG.setPosition(reading.x + 68, reading.y + 28);
            const teach = createBook('teach-book', 'reading-1', 0, BOOK_HUES[1], reading.x + 68, reading.y + 28, bookG);
            teach.state = 'onGround';
            teach.hostId = 'ground';
            this.books.push(teach);
            redrawBook(teach);
            this.depthItems.push({ view: bookG, layer: 3, y: teach.y });

            const desk = LAYOUT['desk'];
            const dv = this.add.container(desk.x, desk.y).setDepth(DEPTH_BASE + 11);
            const dg = this.add.graphics();
            dv.add(dg);
            this.deskDrawerG = dg;
            this.drawDesk(dg);
            this.objViews['desk'] = dv;
            this.depthItems.push({ view: dv, layer: 2, y: desk.y });

            (['stool-1', 'stool-2'] as const).forEach((sid, i) => {
                const L = LAYOUT[sid];
                const c = this.add.container(L.x, L.y).setDepth(DEPTH_BASE + 12 + i);
                const g = this.add.graphics();
                c.add(g);
                drawStool(g);
                this.objViews[sid] = c;
                this.depthItems.push({ view: c, layer: 2, y: L.y });
            });
        }
        drawDesk(g: any) {
            g.clear();
            g.fillStyle(0x2b2018, 1);
            g.fillRect(-60, -18, 8, 36);
            g.fillRect(52, -18, 8, 36);
            g.fillStyle(0x3a2a1c, 1);
            g.fillRoundedRect(-68, -60, 136, 44, 3);
            g.fillStyle(0x54381f, 1);
            g.fillRoundedRect(-64, -58, 128, 14, 2);
            g.fillStyle(0x1d150f, 1);
            g.fillRoundedRect(-30, -54, 60, 10, 2);
            g.fillStyle(GOLD, 0.85);
            g.fillRect(-18, -40, 36, 10);
            g.lineStyle(1.5, GOLD, 0.4);
            g.strokeRoundedRect(-68, -60, 136, 44, 3);
        }

        /** 地面层：书堆（可拖拽，替代旧石墩）、暗点信函、诱饵 */
        buildGround() {
            blocksOf(this.world).forEach((b: any, i: number) => {
                const c = this.add.container(0, 0).setDepth(DEPTH_BASE + 20 + i);
                const g = this.add.graphics();
                c.add(g);
                drawBookStack(g);
                this.objViews[b.id] = c;
                this.syncBlockPos(b.id);
                this.depthItems.push({ view: c, layer: 3, y: c.y });
            });
            this.dropView = this.add.container(0, 0).setDepth(DEPTH_BASE + 22).setVisible(false);
            const eg = this.add.graphics();
            this.dropView.add(eg);
            drawEnvelope(eg);
            this.decoyView = this.add.container(0, 0).setDepth(DEPTH_BASE + 19).setVisible(false);
            const dg = this.add.graphics();
            this.decoyView.add(dg);
            drawEnvelope(dg);
        }

        createPlayer() {
            const start = gridToPos(0, 4);
            this.player = this.add.container(start.x, start.y).setDepth(DEPTH_BASE + 30);
            this.pg = this.add.graphics();
            this.player.add(this.pg);
            this.drawInkPerson(this.pg, 0x4a6fa5);
            if (this.hasFrame(FRAMES.player)) {
                this.player.add(this.add.image(0, 0, ATLAS_KEY, FRAMES.player).setOrigin(0.5, 1));
                this.pg.setVisible(false);
            }
            this.depthItems.push({ view: this.player, layer: 3, y: start.y });
        }

        buildNpc() {
            const lp = gridToPos(2, 2);
            this.librarianView = this.add.container(lp.x, lp.y).setDepth(DEPTH_BASE + 28);
            const lg = this.add.graphics();
            this.librarianView.add(lg);
            this.drawInkPerson(lg, 0xb23a2e);
            if (this.hasFrame(FRAMES.lib_librarian)) {
                this.librarianView.add(this.add.image(0, 0, ATLAS_KEY, FRAMES.lib_librarian).setOrigin(0.5, 1));
                lg.setVisible(false);
            }
            this.depthItems.push({ view: this.librarianView, layer: 3, y: lp.y });

            const ap = gridToPos(0, 2);
            this.adminView = this.add.container(ap.x, ap.y).setDepth(DEPTH_BASE + 27);
            const ag = this.add.graphics();
            this.adminView.add(ag);
            this.drawInkPerson(ag, 0x3a3f4a);
            const lamp = this.add.graphics();
            lamp.fillStyle(0xffe6a8, 0.9);
            lamp.fillCircle(10, -44, 3);
            this.adminView.add(lamp);
            this.depthItems.push({ view: this.adminView, layer: 3, y: ap.y });

            // 巡线：沿地面活动带一圈（管理台 → 阅览 → 书架区 → 故事角 → 回）
            this.patrolPts = [gridToPos(0, 1), gridToPos(1, 3), gridToPos(3, 2), gridToPos(4, 4), gridToPos(2, 0)];
            this.adminPts = [gridToPos(0, 0), gridToPos(0, 2), gridToPos(1, 1), gridToPos(0, 0)];
        }

        /** 背景画（挂在墙上，可取，画后有暗格） */
        buildPainting() {
            const L = LAYOUT['painting'];
            const c = this.add.container(L.x, L.y).setDepth(DEPTH_BASE + 2);
            const g = this.add.graphics();
            c.add(g);
            if (this.hasFrame(FRAMES.lib_painting)) {
                c.add(this.add.image(0, 0, ATLAS_KEY, FRAMES.lib_painting).setOrigin(0.5, 1));
            } else {
                g.fillStyle(0x3a2a1c, 1);
                g.fillRect(-52, -92, 104, 92);
                g.fillStyle(0xe1e8dc, 1);
                g.fillRect(-44, -84, 88, 76);
                g.fillStyle(0x9fb0a0, 1);
                g.fillEllipse(-18, -50, 34, 44);
                g.fillEllipse(16, -40, 26, 34);
                g.lineStyle(1.5, GOLD, 0.6);
                g.strokeRect(-52, -92, 104, 92);
            }
            this.objViews['painting'] = c;
            this.depthItems.push({ view: c, layer: 0, y: L.y });
            // 故事角
            const st = LAYOUT['story'];
            const sc = this.add.container(st.x, st.y).setDepth(DEPTH_BASE + 4);
            const sg = this.add.graphics();
            sc.add(sg);
            if (this.hasFrame(FRAMES.lib_story)) {
                sc.add(this.add.image(0, 0, ATLAS_KEY, FRAMES.lib_story).setOrigin(0.5, 1));
            } else {
                sg.fillStyle(0x1f3a28, 1);
                sg.fillEllipse(0, -10, 104, 40);
                sg.fillStyle(0x2c4a34, 1);
                sg.fillRect(-8, -10, 16, 26);
                sg.fillStyle(GOLD, 0.8);
                sg.fillCircle(0, -34, 6);
            }
            this.objViews['story'] = sc;
            this.depthItems.push({ view: sc, layer: 0, y: st.y });
        }

        /** 手持容器：跟手的物体挂在这里，附加小手视觉 */
        buildHand() {
            this.handBox = this.add.container(0, 0).setDepth(DEPTH_BASE + 44).setVisible(false);
            this.handG = this.add.graphics();
            this.handBox.add(this.handG);
            drawHand(this.handG, false);
        }

        makeClueBoard() {
            const seed = (this.world && this.world.seed) || '';
            const board = contextualBoard(seed);
            const lines = ['环境谜面 · 本局暗号源'];
            board.forEach((c) => lines.push(`· ${c.where}：${c.t}`));
            const txt = this.add
                .text(0, 0, lines.join('\n'), { fontFamily: 'sans-serif', fontSize: '12px', color: '#e8d9a0', lineSpacing: 4 })
                .setScrollFactor(0)
                .setDepth(50);
            const w = txt.width + 16;
            const h = txt.height + 14;
            const g = this.add.graphics().setScrollFactor(0).setDepth(50);
            g.fillStyle(0x0c1118, 0.74);
            g.fillRoundedRect(8, 8, w, h, 8);
            g.lineStyle(1, GOLD, 0.5);
            g.strokeRoundedRect(8, 8, w, h, 8);
            txt.setPosition(16, 15);
            if (this.flashText) this.flashText.setPosition(VIEW_W / 2, VIEW_H - 26);
        }

        applyDepthAll() {
            applyDepth(this.depthItems);
        }

        /* ═══════════════ 命中判定 ═══════════════ */

        /** 可抓取物体命中：书 / 书堆 / 梯凳 / 信函 / 手持物 */
        hitGrabbable(x: number, y: number): { kind: 'book' | 'block' | 'stool' | 'envelope' | 'carry'; id: string } | null {            if (this.carry && Math.hypot(x - this.handBox.x, y - this.handBox.y) < 46) {
                return { kind: 'carry', id: this.carry.item };
            }
            for (const b of this.books) {
                if (b.state === 'held' || b.state === 'open') continue;
                if (Math.abs(x - b.x) < 20 && Math.abs(y - b.y) < 26) return { kind: 'book', id: b.id };
            }
            for (const id of Object.keys(this.objViews)) {
                if (id.indexOf('block-') !== 0 && id.indexOf('stool-') !== 0) continue;
                const v = this.objViews[id];
                if (!v || !v.visible) continue;
                if (Math.abs(x - v.x) < 30 && Math.abs(y - (v.y - 10)) < 28) {
                    return { kind: id.indexOf('block-') === 0 ? 'block' : 'stool', id };
                }
            }
            if (this.dropView && this.dropView.visible && Math.abs(x - this.dropView.x) < 26 && Math.abs(y - this.dropView.y) < 22) {
                return { kind: 'envelope', id: 'drop' };
            }
            return null;
        }

        /** 桌子命中（短按弹出动作条：翻面 / 桌底） */
        hitTable(x: number, y: number): TableView | null {
            for (const t of this.tables) {
                if (Math.abs(x - t.x) < 110 && Math.abs(y - t.y) < 60) return t;
            }
            return null;
        }

        /** 「藏信」命中：场景对象优先，地面兜底（保留原有 zone/gx,gy 契约） */
        pickHideTarget(x: number, y: number): { zone: string; gx: number; gy: number } | null {
            let bestId = '';
            let bd = 1e9;
            for (const id in this.objViews) {
                const zone = ZONE_OF[id];
                const v = this.objViews[id];
                if (!zone || !v) continue;
                const d = Math.hypot(x - v.x, y - (v.y - 40));
                if (d < 80 && d < bd) {
                    bd = d;
                    bestId = id;
                }
            }
            if (bestId) {
                const L = LAYOUT[bestId];
                return { zone: ZONE_OF[bestId], gx: L.gx ?? 1, gy: L.gy ?? 1 };
            }
            if (y > GROUND_Y - 10) {
                const g = posToGrid(x, y);
                if (!this.cellCoveredByBlock(g.gx, g.gy)) return { zone: 'reading', gx: g.gx, gy: g.gy };
            }
            return null;
        }

        cellCoveredByBlock(gx: number, gy: number): boolean {
            for (const b of blocksOf(this.world)) {
                const p = gridToPos(b.data.gxf, b.data.gyf);
                const g = posToGrid(p.x, p.y);
                if (g.gx === gx && g.gy === gy) return true;
            }
            return false;
        }

        /* ═══════════════ 指针交互 ═══════════════ */

        onPointerDown(p: any) {
            this.pinchDist = 0;
            this.pinchMid = null;
            if (this.t === 'pan') {
                this.panStart = { x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY };
                return;
            }
            const wp = this.cameras.main.getWorldPoint(p.x, p.y);
            const x = wp.x;
            const y = wp.y;

            // 摊开的书面板：用场景级手动命中（Phaser 对象级 setInteractive 在 uniapp H5 下不可靠）
            if (this.panelOpen) {
                this.handlePanelClick(p.x, p.y);
                return;
            }

            // 玩法工具保持原有语义，不触发抓取
            if (this.t === 'use') {
                const hit = this.pickHideTarget(x, y);
                if (!hit) return this.flash('这里没有可用的物件');
                const prop = PROP_OF_ZONE[hit.zone];
                if (!prop) return this.flash('这处用不上道具');
                this.hooks.onUsePropAt(prop, hit.gx, hit.gy);
                return;
            }
            if (this.t === 'pick') {
                const g = posToGrid(x, y);
                this.hooks.onPickAt(g.gx, g.gy);
                return;
            }
            if (this.t === 'hide') {
                const hit = this.pickHideTarget(x, y);
                if (!hit) return this.flash('这里没有可藏的缝隙：试试书架 / 背景画 / 阅览桌 / 管理台');
                this.hooks.onObjectTap(hit.zone, hit.gx, hit.gy);
                return;
            }
            if (this.t === 'mark') {
                const g = posToGrid(x, y);
                this.hooks.onGroundTap(g.gx, g.gy);
                return;
            }
            if (this.t === 'person') {
                const st = this.objViews['story'];
                if (st && Math.hypot(x - st.x, y - (st.y - 30)) < 62) {
                    this.walkTo(st.x, st.y + 12);
                    if (this.hooks.onStoryTap) this.hooks.onStoryTap();
                    return;
                }
                const g = posToGrid(x, y);
                const pos = gridToPos(g.gx, g.gy);
                this.walkTo(pos.x, pos.y);
                return;
            }

            // 默认「手」：直接抓取（含从夹层/桌底取出的手持物）
            const hit = this.hitGrabbable(x, y);
            if (hit) {
                this.startGrab(hit.kind, hit.id, x, y);
                return;
            }
            // 桌子：记一次待确认的短按（松手时若没位移就弹动作条）
            const tb = this.hitTable(x, y);
            this.pendingTableTap = tb ? { id: tb.id, x, y } : null;
            // 空白处按下 = 平移视野（替代原「视野·拖」工具）
            this.panStart = { x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY };
        }

        /** 桌子短按待确认（按下记、松手校验位移） */
        pendingTableTap: { id: string; x: number; y: number } | null = null;

        startGrab(kind: 'book' | 'block' | 'stool' | 'envelope' | 'carry', id: string, x: number, y: number) {
            resumeAudio();
            sfx.pick();
            let view: any = null;
            if (kind === 'book') {
                const b = this.books.find((bk) => bk.id === id);
                if (!b) return;
                if (b.state === 'open') return this.flash('书正摊开着：先合上再拿');
                pickUp(b);
                view = b.view;
            } else if (kind === 'carry') {
                view = this.carry?.view ?? null;
                this.carry = null;
            } else if (kind === 'envelope') {
                view = this.dropView;
                if (this.dropView) this.dropView.setVisible(false);
            } else {
                view = this.objViews[id];
            }
            if (!view) return;

            const parent = view.parentContainer;
            const wx = view.x;
            const wy = view.y;
            const absX = parent ? parent.x + wx : wx;
            const absY = parent ? parent.y + wy : wy;
            if (parent && parent.remove) parent.remove(view, false);
            this.handBox.add(view);
            view.setPosition(0, -16).setScale(1);
            // 拾取手感：轻轻「啵」一下放大，Back 缓动带回弹
            this.tweens.add({ targets: view, scaleX: 1.06, scaleY: 1.06, duration: 130, ease: 'Back.easeOut' });
            this.handBox.setPosition(absX, absY).setVisible(true);
            drawHand(this.handG, true);
            this.grab = { kind: kind === 'carry' ? 'envelope' : kind, id, view, offX: 0, offY: 0, moved: false, downX: x, downY: y };
            this.markDepthDirty();
        }

        onPointerMove(p: any) {
            if (this.handlePinch()) return;
            if (this.panStart) {
                const z = this.cameras.main.zoom;
                this.cameras.main.scrollX = this.panStart.sx - (p.x - this.panStart.x) / z;
                this.cameras.main.scrollY = this.panStart.sy - (p.y - this.panStart.y) / z;
                this.clampCamera();
                return;
            }
            if (!this.grab) return;
            const wp = this.cameras.main.getWorldPoint(p.x, p.y);
            if (Math.hypot(wp.x - this.grab.downX, wp.y - this.grab.downY) > 6) this.grab.moved = true;
            // 热路径：只写坐标 + 位移，不做布局计算
            this.handBox.setPosition(clampWorldX(wp.x, 30), Math.max(GROUND_Y - 100, Math.min(VIEW_H - 30, wp.y - 18)));
            this.grab.view.setScale(this.grab.moved ? 1.06 : 1);
        }

        onPointerUp(_p: any) {
            this.panStart = null;
            // 桌子短按：按下与松手几乎同点 → 弹动作条
            if (this.pendingTableTap) {
                const wp = this.cameras.main.getWorldPoint(_p.x, _p.y);
                const tp = this.pendingTableTap;
                this.pendingTableTap = null;
                if (Math.hypot(wp.x - tp.x, wp.y - tp.y) < 8) {
                    const t = this.tables.find((tt) => tt.id === tp.id);
                    if (t && this.hooks.onTableTap) this.hooks.onTableTap(t.id, t.state === 'flipped');
                }
            }
            if (!this.grab) return;
            const g = this.grab;
            this.grab = null;
            drawHand(this.handG, false);
            const wp = this.cameras.main.getWorldPoint(_p.x, _p.y);
            if (!g.moved) {
                // 短按未拖动 = 查看 / 交互
                this.snapBack(g);
                this.onTapObject(g);
                return;
            }
            this.dropHeld(g, wp.x, wp.y);
        }

        /** 把手持物接回原父级（短按查看时） */
        snapBack(g: GrabState) {
            this.tweens.killTweensOf(g.view);
            if (g.kind === 'envelope' && g.id === 'drop') {
                if (this.handBox && this.handBox.remove) this.handBox.remove(g.view, false);
                this.handBox.setVisible(false);
                this.syncDropView();
                return;
            }
            if (g.kind === 'book') {
                const b = this.books.find((bk) => bk.id === g.id);
                if (b) this.snapBookHome(b);
                return;
            }
            if (g.kind === 'block') {
                this.syncBlockPos(g.id);
                if (this.handBox && this.handBox.remove) this.handBox.remove(g.view, false);
                this.handBox.setVisible(false);
                return;
            }
            if (g.kind === 'stool') {
                const L = LAYOUT[g.id];
                if (L) {
                    if (this.handBox && this.handBox.remove) this.handBox.remove(g.view, false);
                    g.view.setPosition(L.x, L.y).setScale(1);
                    this.handBox.setVisible(false);
                }
                return;
            }
            // 手持物（从夹层/桌底取出的）
            if (this.handBox && this.handBox.remove) this.handBox.remove(g.view, false);
            this.handBox.setVisible(false);
            this.carry = { item: g.id, view: g.view };
        }

        /** 松手放置 */
        dropHeld(g: GrabState, x: number, y: number) {
            this.tweens.killTweensOf(g.view);
            sfx.drop();
            // 只有「信函 / 手持物」能藏进书或粘桌底；书、书堆、梯凳是实体，落到承载面
            const isPaper = g.kind === 'envelope';
            const item = isPaper ? 'envelope' : 'prop:' + g.id;

            if (isPaper) {
                // 1) 摊开的书 → 存入夹层
                if (this.openBook && this.openBook.state === 'open') {
                    if (stashInto(this.openBook, 'envelope')) {
                        this.flash(`已藏进《${this.openBook.label}》夹层（第 ${this.openBook.page + 1} 页）`);
                        this.addAnomaly('scene:book-stash', `书里夹着东西（${this.openBook.label}）`, 1, 'bookshelf');
                        this.refreshBookPanel();
                    }
                    this.destroyHeld(g);
                    return;
                }
                // 2) 翻面的桌 → 粘到桌底
                const flipped = this.tables.find((t) => t.state === 'flipped');
                if (flipped && Math.abs(x - flipped.x) < 120 && Math.abs(y - flipped.y) < 76) {
                    stickUnder(flipped, 'envelope');
                    this.flash('已粘到桌底：磁贴吸住了（桌面干净，但翻着的桌很显眼）');
                    this.addAnomaly('scene:table-under', '阅览桌翻着，桌底粘着东西', 2, flipped.zone);
                    this.destroyHeld(g);
                    return;
                }
            }

            // 3) 书 → 最近承载面（架层 / 桌面 / 地面）
            if (g.kind === 'book') {
                const b = this.books.find((bk) => bk.id === g.id);
                if (b) {
                    const host = nearestSurface(this.surfaces, x, y, 95, (s) => s.kind !== 'tableUnder');
                    if (host) {
                        // 本轮增强：够不到高层书架（顶部行）→ 需踩梯凳/书堆垫高
                        if (host.kind === 'shelf' && host.y < REACH_HIGH_Y && !stoolNear(x, y, this.stoolProps())) {
                            this.flash('够不到高层书架：先踩梯凳或挪书堆垫高');
                            this.snapBookHome(b);
                            this.tweens.add({ targets: g.view, scaleX: 1.1, scaleY: 0.94, duration: 90, yoyo: true, ease: 'Back.easeOut' });
                            return;
                        }
                        if (b.hostId.indexOf('tableTop:') === 0) {
                            const t = this.tables.find((tt) => `tableTop:${tt.id}` === b.hostId);
                            if (t) removeFromTop(t, b.id);
                        }
                        if (host.kind === 'shelf') {
                            const L = LAYOUT[b.shelfId];
                            const col = colFromX(L, x);
                            b.state = 'onShelf';
                            b.hostId = host.id;
                            b.x = host.x + shelfColX(L, col);
                            b.y = host.y - 4;
                            this.flash('书已放回书架');
                        } else if (host.kind === 'tableTop') {
                            b.state = 'onTable';
                            b.hostId = host.id;
                            b.x = host.x;
                            b.y = host.y;
                            const t = this.tables.find((tt) => `tableTop:${tt.id}` === host.owner);
                            if (t) putOnTop(t, b.id);
                            this.flash('书放到了桌面上');
                        } else {
                            b.state = 'onGround';
                            b.hostId = 'ground';
                            b.x = clampWorldX(x, 20);
                            b.y = Math.max(GROUND_Y, Math.min(VIEW_H - 40, y));
                            this.flash('书放在了地上（更容易被发现）');
                            this.addAnomaly('scene:book-ground', '地上掉了本书', 1, 'reading');
                        }
                        this.reparentBook(b);
                        this.tweens.add({ targets: g.view, scaleX: 1.14, scaleY: 0.9, duration: 90, yoyo: true, ease: 'Back.easeOut' });
                        this.markDepthDirty();
                        return;
                    }
                    this.snapBookHome(b);
                    this.tweens.add({ targets: g.view, scaleX: 1.1, scaleY: 0.94, duration: 90, yoyo: true, ease: 'Back.easeOut' });
                    return;
                }
                this.destroyHeld(g);
                return;
            }

            // 4) 书堆 → 吸附到格
            if (g.kind === 'block') {
                const gpos = posToGrid(x, y);
                moveBlock(this.world, g.id, gpos.gx, gpos.gy);
                this.syncBlockPos(g.id);
                if (this.handBox && this.handBox.remove) this.handBox.remove(g.view, false);
                this.handBox.setVisible(false);
                this.tweens.add({ targets: g.view, scaleX: 1.18, scaleY: 0.82, duration: 90, yoyo: true, ease: 'Back.easeOut' });
                this.flash(markerCoveredByBlock(this.world) ? '书堆压住了便签：上线更难寻点，巡逻也看不见了' : '你挪开了书堆');
                return;
            }

            // 5) 梯凳 → 自由摆放
            if (g.kind === 'stool') {
                if (this.handBox && this.handBox.remove) this.handBox.remove(g.view, false);
                g.view.setPosition(clampWorldX(x, 24), Math.max(GROUND_Y - 40, Math.min(VIEW_H - 40, y))).setScale(1);
                this.handBox.setVisible(false);
                this.tweens.add({ targets: g.view, scaleX: 1.1, scaleY: 0.92, duration: 90, yoyo: true, ease: 'Back.easeOut' });
                this.markDepthDirty();
                return;
            }

            // 6) 信函无合适落点 → 提示并回暗点
            this.flash('信函不能丢在这儿：把它藏进摊开的书，或翻过来的桌底');
            this.snapBack(g);
        }

        /** 把书的视图接回宿主容器（书架 / 桌面 / 无父级） */
        reparentBook(b: BookView) {
            const parent =
                b.hostId.indexOf('shelf') === 0
                    ? this.objViews[b.shelfId]
                    : b.hostId.indexOf('tableTop:') === 0
                      ? this.objViews[b.hostId.slice('tableTop:'.length)]
                      : null;
            if (this.handBox && this.handBox.remove) this.handBox.remove(b.view, false);
            b.view.setScale(1);
            if (parent && parent.add) {
                const L = LAYOUT[parent === this.objViews[b.shelfId] ? b.shelfId : b.hostId.slice('tableTop:'.length)];
                parent.add(b.view);
                b.view.setPosition(b.x - L.x, b.y - L.y);
            }
            this.handBox.setVisible(false);
            redrawBook(b);
        }

        snapBookHome(b: BookView) {
            if (!b || !b.view) return;
            if (b.hostId.indexOf('tableTop:') === 0) {
                const owner = b.hostId.slice('tableTop:'.length);
                const L = LAYOUT[owner];
                const parent = this.objViews[owner];
                if (parent && parent.add) {
                    if (this.handBox && this.handBox.remove) this.handBox.remove(b.view, false);
                    parent.add(b.view);
                    b.view.setScale(1).setPosition(b.x - L.x, b.y - L.y);
                }
            } else if (b.hostId === 'ground') {
                if (this.handBox && this.handBox.remove) this.handBox.remove(b.view, false);
                b.view.setScale(1);
            } else {
                const L = LAYOUT[b.shelfId];
                const parent = this.objViews[b.shelfId];
                if (parent && parent.add) {
                    if (this.handBox && this.handBox.remove) this.handBox.remove(b.view, false);
                    parent.add(b.view);
                    b.view.setScale(1).setPosition(b.x - L.x, b.y - L.y);
                }
            }
            this.handBox.setVisible(false);
            putBack(b);
            redrawBook(b);
        }

        /** 藏进书 / 粘桌底后销毁视图（仅信函类一次性物） */
        destroyHeld(g: GrabState) {
            if (this.handBox && this.handBox.remove) this.handBox.remove(g.view, false);
            this.handBox.setVisible(false);
            if (g.view && g.view.destroy) g.view.destroy();
        }

        /** 短按物体：按类型分发查看 / 翻页 / 翻面 */
        onTapObject(g: GrabState) {
            if (g.kind === 'book') {
                const b = this.books.find((bk) => bk.id === g.id);
                if (!b) return;
                const opened = toggleOpen(b);
                if (opened) {
                    this.openBook = b;
                    this.openBookPanel(b);
                    sfx.flip();
                    bumpCombo(this.score);
                    this.addAnomaly('scene:book-open', `一本摊开的书（${b.label}）`, 1, 'bookshelf');
                } else {
                    this.closeBookPanel();
                    this.removeAnomaly('scene:book-open');
                }
                return;
            }
            if (g.kind === 'block') {
                this.flash('一摞旧书：按住可以挪动它（压住便签能藏痕，也能当垫脚）');
                return;
            }
            if (g.kind === 'stool') {
                this.flash('梯凳：按住可挪到高处架子下（攀高用）');
                return;
            }
            if (g.kind === 'envelope') {
                const p = this.dropView ? { x: this.dropView.x, y: this.dropView.y } : { x: 0, y: 0 };
                const gpos = posToGrid(p.x, p.y);
                this.hooks.onPickAt(gpos.gx, gpos.gy);
                return;
            }
            // 手持物：点自己 = 放回手里（不做事）
            this.flash('拿着呢：松手就能把它藏进摊开的书或翻过来的桌底');
        }

        /* ═══════════════ 书面板 ═══════════════ */

        openBookPanel(book: BookView) {
            // 只销毁旧面板；openBook 在这里赋值，不能被 closeBookPanel 清掉
            this.destroyPanelParts();
            if (this.openBook && this.openBook !== book && this.openBook.state === 'open') toggleOpen(this.openBook);
            this.openBook = book;
            const W = 248;
            const H = 218;
            const px = (VIEW_W - W) / 2;
            const py = (VIEW_H - H) / 2 - 8;
            // 注意：不能用 Container 装面板——容器会覆盖子对象的 scrollFactor(0)，
            // 导致面板跟着相机跑。这里全部平铺为场景子对象并各自 setScrollFactor(0)。
            const g = this.add.graphics().setScrollFactor(0).setDepth(60);
            g.fillStyle(0x0c1118, 0.93);
            g.fillRoundedRect(px, py, W, H, 10);
            g.lineStyle(1.5, GOLD, 0.7);
            g.strokeRoundedRect(px, py, W, H, 10);
            this.panelParts.push(g);

            const title = this.add
                .text(px + 14, py + 12, this.bookTitle(book), { fontFamily: 'sans-serif', fontSize: '13px', color: '#f3e9cf' })
                .setScrollFactor(0)
                .setDepth(60);
            this.panelParts.push(title);
            this.panelTitle = title;

            const bg = this.add.graphics().setScrollFactor(0).setDepth(60);
            drawBookView(bg, book);
            bg.setPosition(px + W / 2, py + 100);
            this.panelParts.push(bg);
            this.panelBookG = bg;

            const mk = (t: string, x: number, color: string) => {
                const el = this.add.text(x, py + H - 36, t, { fontFamily: 'sans-serif', fontSize: '13px', color })
                    .setScrollFactor(0)
                    .setDepth(60)
                    .setInteractive({ useHandCursor: true });
                this.panelParts.push(el);
                return el;
            };
            mk('‹ 上一页', px + 14, '#c8a24a').on('pointerdown', () => {
                flipPage(book, -1);
                this.refreshBookPanel();
            });
            mk('合上', px + W / 2 - 20, '#e3c877').on('pointerdown', () => {
                this.closeBookPanel();
                this.removeAnomaly('scene:book-open');
            });
            mk('下一页 ›', px + W - 78, '#c8a24a').on('pointerdown', () => {
                flipPage(book, 1);
                this.refreshBookPanel();
            });

            if (book.id.indexOf('teach-book') === 0 && !book.torn) {
                const tear = this.add
                    .text(px + 14, py + H - 60, '撕下这页（教学·15 秒复原）', { fontFamily: 'sans-serif', fontSize: '12px', color: '#ff8f8f' })
                    .setScrollFactor(0)
                    .setDepth(60)
                    .setInteractive({ useHandCursor: true });
                tear.on('pointerdown', () => {
                    if (tearPage(book)) {
                        const o = this.world.get('teach-book');
                        if (o) {
                            o.state = 'torn';
                            o.repairable = true;
                            o.recoverMs = 15000;
                            o.recoverTo = 'ok';
                            o.stateAt = this.world.now;
                        }
                        this.addAnomaly('scene:book-torn', '一本被撕了页的书', 2, 'bookshelf');
                        this.flash('书页被撕下（教学道具·可修复，15 秒复原）');
                        this.closeBookPanel();
                    }
                });
                this.panelParts.push(tear);
            }

            this.renderStashSlots(book, px, py, W);
            this.panelOpen = true;
        }
        bookTitle(book: BookView): string {
            return `《${book.label}》 第 ${book.page + 1}/${book.pages} 页`;
        }

        /** 夹层槽位（同样平铺，不用容器） */
        renderStashSlots(book: BookView, px: number, py: number, _W: number) {
            this.destroyStashParts();
            const label = this.add
                .text(px + 14, py + 156, `夹层（${book.stash.length}）`, { fontFamily: 'sans-serif', fontSize: '12px', color: '#9c8c74' })
                .setScrollFactor(0)
                .setDepth(61);
            this.stashParts.push(label);
            book.stash.forEach((item: string, i: number) => {
                const icon = this.add.graphics().setScrollFactor(0).setDepth(61);
                if (item === 'envelope') drawEnvelope(icon);
                else {
                    icon.fillStyle(GOLD, 1);
                    icon.fillRoundedRect(-9, -9, 18, 18, 3);
                    icon.fillStyle(0x0c1118, 1);
                    icon.fillRect(-4, -4, 8, 8);
                }
                icon.setPosition(px + 34 + i * 54, py + 186).setInteractive({ useHandCursor: true });
                icon.on('pointerdown', () => {
                    const got = takeFrom(book, item);
                    if (got) {
                        this.flash(got === 'envelope' ? '从夹层取出信函（现在拿在手上）' : '从夹层取出道具（现在拿在手上）');
                        this.holdItem(got);
                        if (!book.stash.length) this.removeAnomaly('scene:book-stash');
                        this.refreshBookPanel();
                    }
                });
                this.stashParts.push(icon);
            });
            if (!book.stash.length) {
                this.stashParts.push(
                    this.add.text(px + 14, py + 180, '夹层是空的：拿着信函松手到这里即可藏入', {
                        fontFamily: 'sans-serif',
                        fontSize: '11px',
                        color: '#6b6257'
                    })
                        .setScrollFactor(0)
                        .setDepth(61)
                );
            }
        }
        destroyStashParts() {
            this.stashParts.forEach((p: any) => p && p.destroy && p.destroy(true));
            this.stashParts = [];
        }
        destroyPanelParts() {
            this.destroyStashParts();
            this.panelParts.forEach((p: any) => p && p.destroy && p.destroy(true));
            this.panelParts = [];
            this.panelTitle = null;
            this.panelBookG = null;
        }

        refreshBookPanel() {
            if (!this.openBook || !this.panelOpen) return;
            const book = this.openBook;
            if (this.panelBookG) drawBookView(this.panelBookG, book);
            if (this.panelTitle && this.panelTitle.setText) this.panelTitle.setText(this.bookTitle(book));
            const px = (VIEW_W - 248) / 2;
            const py = (VIEW_H - 218) / 2 - 8;
            this.renderStashSlots(book, px, py, 248);
        }

        closeBookPanel() {
            this.destroyPanelParts();
            this.panelOpen = false;
            if (this.openBook && this.openBook.state === 'open') toggleOpen(this.openBook);
            this.openBook = null;
        }

        /** 书面板点击命中（屏幕坐标：面板 scrollFactor=0，直接用指针坐标） */
        handlePanelClick(px: number, py: number) {
            const W = 248;
            const H = 218;
            const ox = (VIEW_W - W) / 2;
            const oy = (VIEW_H - H) / 2 - 8;
            const inRect = (rx: number, ry: number, rw: number, rh: number) => px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
            const book = this.openBook;
            if (!book) {
                this.closeBookPanel();
                return;
            }
            // 撕页（教学书）
            if (book.id.indexOf('teach-book') === 0 && !book.torn && inRect(ox + 12, oy + H - 66, 170, 26)) {
                if (tearPage(book)) {
                    const o = this.world.get('teach-book');
                    if (o) {
                        o.state = 'torn';
                        o.repairable = true;
                        o.recoverMs = 15000;
                        o.recoverTo = 'ok';
                        o.stateAt = this.world.now;
                    }
                    this.addAnomaly('scene:book-torn', '一本被撕了页的书', 2, 'bookshelf');
                    this.flash('书页被撕下（教学道具·可修复，15 秒复原）');
                    this.closeBookPanel();
                }
                return;
            }
            // 翻页 / 合上（热区适度放宽，便于手指点击）
            if (inRect(ox + 10, oy + H - 44, 70, 32)) {
                flipPage(book, -1);
                sfx.flip();
                bumpCombo(this.score);
                this.refreshBookPanel();
                return;
            }
            if (inRect(ox + W / 2 - 32, oy + H - 44, 64, 32)) {
                this.closeBookPanel();
                this.removeAnomaly('scene:book-open');
                return;
            }
            if (inRect(ox + W - 96, oy + H - 44, 76, 32)) {
                flipPage(book, 1);
                sfx.flip();
                bumpCombo(this.score);
                this.refreshBookPanel();
                return;
            }
            // 夹层槽位
            for (let i = 0; i < book.stash.length; i++) {
                if (inRect(ox + 34 + i * 54 - 20, oy + 186 - 20, 40, 40)) {
                    const got = takeFrom(book, book.stash[i]);
                    if (got) {
                        this.flash(got === 'envelope' ? '从夹层取出信函（现在拿在手上）' : '从夹层取出道具（现在拿在手上）');
                        this.holdItem(got);
                        if (!book.stash.length) this.removeAnomaly('scene:book-stash');
                        this.refreshBookPanel();
                    }
                    return;
                }
            }
            // 点面板外 → 合上
            if (!inRect(ox, oy, W, H)) {
                this.closeBookPanel();
                this.removeAnomaly('scene:book-open');
            }
        }

        /** 从夹层 / 桌底取出的东西回到手上（点它即可再次拿起安放） */
        holdItem(item: string) {
            if (this.carry && this.carry.view && this.carry.view.destroy) this.carry.view.destroy();
            const v = this.add.graphics();
            if (item === 'envelope') drawEnvelope(v);
            else {
                v.fillStyle(GOLD, 1);
                v.fillRoundedRect(-10, -10, 20, 20, 3);
                v.fillStyle(0x0c1118, 1);
                v.fillRect(-4, -4, 8, 8);
            }
            this.handBox.add(v);
            v.setPosition(0, -16).setScale(1);
            this.handBox.setVisible(true);
            drawHand(this.handG, true);
            this.carry = { item, view: v };
        }

        /* ═══════════════ 桌子翻面 ═══════════════ */

        flipTable(id: string): boolean {
            const t = this.tables.find((tt) => tt.id === id);
            if (!t) return false;
            const chk = canFlip(t);
            if (!chk.ok) {
                this.flash(chk.reason || '现在不能翻');
                return false;
            }
            const toFlipped = t.state !== 'flipped';
            t.state = 'flipping';
            this.tweens.add({
                targets: t.view,
                scaleX: 0.12,
                duration: 160,
                yoyo: true,
                ease: 'Quad.easeInOut',
                onYoyo: () => setFlipped(t, toFlipped),
                onComplete: () => {
                    t.state = toFlipped ? 'flipped' : 'normal';
                    if (t.view) t.view.setScale(1);
                    if (toFlipped) {
                        this.addAnomaly('scene:table-flipped', '阅览桌被翻了过来', 2, t.zone);
                        this.flash('桌子翻过来了：桌底可以粘东西（但翻着的桌很招摇）');
                    } else {
                        this.removeAnomaly('scene:table-flipped');
                        this.flash('桌子翻回去了');
                    }
                    // 通知页面刷新动作条（翻面是补间动画，页面不能在调用瞬间读状态）
                    if (this.hooks.onTableChanged) this.hooks.onTableChanged(t.id, t.state === 'flipped');
                }
            });
            return true;
        }

        takeFromTableUnder(id: string): string | null {
            const t = this.tables.find((tt) => tt.id === id);
            if (!t || t.state !== 'flipped') return null;
            const got = takeUnder(t);
            if (got) {
                this.flash(got === 'envelope' ? '从桌底取回信函（现在拿在手上）' : '从桌底取回道具（现在拿在手上）');
                this.holdItem(got);
                if (!t.underItems.length) this.removeAnomaly('scene:table-under');
            }
            return got;
        }

        /** 桌子当前状态（页面动作条用） */
        tableInfo(id: string): { state: string; top: string[]; under: string[] } | null {
            const t = this.tables.find((tt) => tt.id === id);
            if (!t) return null;
            return { state: t.state, top: t.topItems.slice(), under: t.underItems.slice() };
        }

        /* ═══════════════ 本轮增强：公共 API（页面浮层 / 测试断言用） ═══════════════ */

        /** 当前垫脚物（梯凳 + 书堆）位置，供可达性判定 */
        stoolProps(): { x: number; y: number; kind: string }[] {
            const out: { x: number; y: number; kind: string }[] = [];
            (['stool-1', 'stool-2'] as const).forEach((sid) => {
                const v = this.objViews[sid];
                if (v) out.push({ x: v.x, y: v.y, kind: 'stool' });
            });
            blocksOf(this.world).forEach((b: any) => {
                const v = this.objViews[b.id];
                if (v) out.push({ x: v.x, y: v.y, kind: 'block' });
            });
            return out;
        }

        /* ── 线索依赖图：解谜/道具相互解锁 ──
         * 节点派生：lock-solved → lamp-battery → uv
         *          drawer-open → drawer-loot
         *          decode-solved && riddle-solved && drawer-loot → ghost-intel
         * 全部由已解谜题 + 抽屉状态推导，单一口径，便于扩边。
         */
        recomputeClues() {
            const s = new Set<string>();
            if (this.puzzles.lock) s.add('lock-solved');
            if (this.puzzles.decode) s.add('decode-solved');
            if (this.puzzles.riddle) s.add('riddle-solved');
            if (this.drawerOpen) s.add('drawer-open');
            // 派生解锁
            if (s.has('lock-solved')) s.add('lamp-battery'); // 暗格密码锁 → 台灯电池
            if (s.has('lamp-battery')) s.add('uv'); // 电池 → 紫外可开
            if (s.has('drawer-open')) s.add('drawer-loot'); // 抽屉 → 内部读者证
            if (s.has('decode-solved') && s.has('riddle-solved') && s.has('drawer-loot')) s.add('ghost-intel');
            this.clueSet = s;
        }

        /** 线索链里程碑定义（UI / 测试单一口径；id 与 recomputeClues 推导出的节点一致） */
        static CLUE_CHAIN_NODES = [
            { id: 'lamp-battery', label: '台灯电池', hint: '解出「暗格密码锁」（本地端口后四位）后，暗格里露出' },
            { id: 'uv', label: '紫外显影', hint: '需先拿到台灯电池才能点亮紫外灯' },
            { id: 'drawer-loot', label: '抽屉隔层读者证', hint: '用员工卡打开管理台抽屉取得' },
            { id: 'ghost-intel', label: '幽灵情报', hint: '密码本解码 + 书中谜题 + 抽屉隔层 三者齐备才成形' }
        ] as const;

        /** 线索链快照（供 UI 实时展示「相互解锁」进度） */
        getClueChain(): { id: string; label: string; unlocked: boolean; hint: string }[] {
            return Library2dScene.CLUE_CHAIN_NODES.map((n) => ({
                id: n.id,
                label: n.label,
                unlocked: this.clueSet.has(n.id),
                hint: n.hint
            }));
        }

        /** 台灯开关（昼/夜） */
        setLamp(on: boolean) {
            this.lamp.on = on;
            if (on) this.lamp.uv = false;
            this.flash(on ? '台灯亮起，馆内一览无余' : '台灯熄灭，暗处更容易藏东西');
        }
        /** 紫外显影开关（关灯时显影隐藏墨迹）；依赖线索图：需先解出暗格密码锁拿到台灯电池 */
        toggleUV(): boolean {
            if (!this.clueSet.has('lamp-battery')) {
                this.flash('先找到台灯电池：解出「暗格密码锁」（本地端口后四位）才能开紫外');
                return false;
            }
            if (this.lamp.on) this.lamp.on = false;
            this.lamp.uv = !this.lamp.uv;
            this.flash(this.lamp.uv ? '紫外灯亮：浮现隐藏墨迹提示' : '紫外灯灭');
            return true;
        }
        /** 管理台抽屉开合（员工卡）；开抽屉会解锁内部读者证（drawer-loot） */
        openDeskDrawer(): boolean {
            const opened = toggleDrawer(this);
            this.drawerOpen = opened;
            if (this.deskDrawerG) {
                this.deskDrawerG.clear();
                drawDeskDrawer(this.deskDrawerG, opened);
            }
            const hadGhost = this.clueSet.has('ghost-intel');
            this.recomputeClues();
            if (!hadGhost && this.clueSet.has('ghost-intel')) this.ghostBurst = performance.now();
            if (opened) {
                this.addAnomaly('scene:desk-open', '管理台抽屉敞着（露出内部）', 1, 'desk');
                if (!this.anomalies.has('scene:drawer-loot')) {
                    this.addAnomaly('scene:drawer-loot', '抽屉隔层里有一枚未登记的读者证', 1, 'desk');
                }
                sfx.clunk();
                this.flash('员工卡打开了管理台抽屉，里面有个隔层');
            } else {
                this.removeAnomaly('scene:desk-open');
                sfx.clunk();
                this.flash('抽屉合上了');
            }
            return opened;
        }
        /** 故事角引开馆员（安全窗口） */
        doDistract(): boolean {
            if (this.world.inventory && this.world.inventory.indexOf('distraction') < 0) {
                this.flash('没有可用来引开馆员的东西（故事角线索）');
                return false;
            }
            const w = startDistract(performance.now());
            this.distractUntil = w.until;
            bumpCombo(this.score);
            this.flash('故事角吸引馆员离开，出现一段空档');
            return true;
        }
        /** 解谜：直接校验并产出线索（页面弹窗也走这里） */
        solvePuzzle(kind: 'decode' | 'riddle' | 'lock', answer?: string): boolean {
            if (this.puzzles[kind]) return true;
            const p =
                kind === 'decode'
                    ? makeDecodePuzzle(this.books[0]?.id || 'shelf-1-b0')
                    : kind === 'riddle'
                      ? makeRiddlePuzzle()
                      : makeLockPuzzle();
            const ok = answer != null ? checkPuzzle(p, answer) : true;
            if (!ok) {
                this.flash('答案不对，再想想');
                return false;
            }
            const hadBattery = this.clueSet.has('lamp-battery');
            const hadGhost = this.clueSet.has('ghost-intel');
            this.puzzles[kind] = true;
            bumpCombo(this.score);
            sfx.decode();
            this.addAnomaly('scene:puzzle-' + kind, puzzleClue(p), 1, 'custom');
            this.flash(puzzleClue(p));
            // 线索依赖图：解谜推进后重新推导解锁节点
            this.recomputeClues();
            if (kind === 'lock' && !this.anomalies.has('scene:lamp-battery')) {
                this.addAnomaly('scene:lamp-battery', '暗格里藏着一节台灯电池（可点亮紫外灯）', 1, 'custom');
                sfx.unlock();
            }
            if (this.clueSet.has('ghost-intel') && !this.anomalies.has('scene:ghost-intel')) {
                this.addAnomaly('scene:ghost-intel', '密码本 + 书中谜 + 抽屉隔层，幽灵情报成形', 2, 'custom');
            }
            if (this.clueSet.has('ghost-intel') && !this.ghostIntelSfx) {
                this.ghostIntelSfx = true;
                sfx.unlock();
            }
            if (!hadBattery && this.clueSet.has('lamp-battery')) this.batteryBurst = performance.now();
            if (!hadGhost && this.clueSet.has('ghost-intel')) this.ghostBurst = performance.now();
            return true;
        }
        /** 书中谜题线索：紫外显影后才看得清（扩展依赖边 uv → riddle） */
        getRiddleHint(): string {
            if (this.lamp.uv) {
                return '紫外显影下书页浮出暗记：「白纸黑字，藏于乌有；落笔成痕，洗之不去」——打一字';
            }
            return '书页某处藏有暗记，需先开紫外显影（解出暗格密码锁拿到台灯电池）才看得清';
        }
        /** 通关评分汇总 */
        getScoreSummary() {
            this.score.finished = true;
            return { ...summarize(this.score), complete: this.clueSet.has('ghost-intel') };
        }

        /* ── 测试断言用 getter ── */
        get stealthAlert(): number { return this.stealth.alert; }
        get inSight(): boolean { return this.stealth.inSight; }
        get lampOn(): boolean { return this.lamp.on; }
        get uvMode(): boolean { return this.lamp.uv; }
        get uvUnlocked(): boolean { return this.clueSet.has('uv'); }
        get finalIntel(): boolean { return this.clueSet.has('ghost-intel'); }
        get spotted(): boolean { return this.anomalies.has('scene:spotted'); }
        get clueState(): Record<string, boolean> {
            const o: Record<string, boolean> = {};
            this.clueSet.forEach((id) => (o[id] = true));
            return o;
        }
        get deskDrawerOpen(): boolean { return this.drawerOpen; }
        get distractActive(): boolean { return inSafeWindow(this.distractUntil, performance.now()); }
        get puzzleSolved(): Record<string, boolean> { return { ...this.puzzles }; }
        get distractUntilMs(): number { return this.distractUntil; }
        get scoreSummary(): any { return { ...summarize(this.score), complete: this.clueSet.has('ghost-intel') }; }
        /** 测试钩子：强制「被注视」以驱动警觉上升（正常玩法不调用） */
        simulateSeenForTest(on = true) {
            this.forceSeen = on;
            if (!on) this.stealth.alert = 0;
        }
        /** 磁铁：把手持信函/道具吸到翻面桌底（物·用 磁铁触发） */
        magnetStickHeld(): boolean {
            const t = this.tables.find((tt) => tt.state === 'flipped');
            if (!t) {
                this.flash('先把桌子翻过来，才能用磁铁把信函吸到桌底');
                return false;
            }
            let item: string | null = null;
            if (this.grab && this.grab.kind === 'envelope') item = 'envelope';
            else if (this.carry) item = this.carry.item;
            else if (this.grab) item = 'prop:' + this.grab.id;
            if (!item) {
                this.flash('手头没有可吸附的信函/道具（先拿起再吸）');
                return false;
            }
            if (magnetStick(t, item)) {
                if (this.grab && this.grab.kind === 'envelope') {
                    this.destroyHeld(this.grab);
                    this.grab = null;
                } else if (this.carry) {
                    this.destroyHeld({ view: this.carry.view, kind: 'carry', id: this.carry.item });
                    this.carry = null;
                } else if (this.grab) {
                    this.destroyHeld(this.grab);
                    this.grab = null;
                }
                this.flash('磁铁把' + (item === 'envelope' ? '信函' : '道具') + '吸到了桌底');
                this.addAnomaly('scene:table-under', '阅览桌翻着，桌底粘着东西', 2, t.zone);
                return true;
            }
            return false;
        }
        /** 纯逻辑可达性判定（测试用） */
        reachOkAt(targetY: number, stoolNear: boolean): boolean {
            return reachOk(targetY, stoolNear);
        }

        /* ═══════════════ 异常 → 证据链 ═══════════════ */

        addAnomaly(kind: string, label: string, severity: number, zone: string) {
            if (this.anomalies.has(kind)) return;
            this.anomalies.add(kind);
            try {
                addEvidence(this.world, zone || 'custom', kind, severity);
            } catch {
                /* 证据链不可用时不阻断玩法 */
            }
            this.flash(label + '（暴露度上升）');
            if (this.hooks.onAnomaly) this.hooks.onAnomaly(kind, label, severity);
        }
        removeAnomaly(kind: string) {
            if (!this.anomalies.has(kind)) return;
            this.anomalies.delete(kind);
            try {
                removeEvidenceByKind(this.world, kind);
            } catch {
                /* ignore */
            }
        }

        /* ═══════════════ 教学道具演示（保留原交互） ═══════════════ */

        revealPainting() {
            const o = this.world.get('painting');
            if (!o) return;
            if (o.state === 'hung') {
                o.state = 'taken';
                o.data.cavity = 'behind';
                this.flash('你取下背景画，露出墙后的密页暗格（演示藏点）');
            } else {
                o.state = 'hung';
                o.data.cavity = 'none';
                this.flash('背景画已挂回');
            }
            this.syncPainting();
        }
        syncPainting() {
            const o = this.world.get('painting');
            const v = this.objViews['painting'];
            if (v) v.setVisible(!o || o.state === 'hung');
        }
        tearBook() {
            const o = this.world.get('teach-book');
            if (!o) return;
            o.state = 'torn';
            o.repairable = true;
            o.recoverMs = 15000;
            o.recoverTo = 'ok';
            o.stateAt = this.world.now;
            const b = this.books.find((bk) => bk.id === 'teach-book');
            if (b) tearPage(b);
            this.flash('书页被撕下（教学道具·可修复，15 秒复原）');
        }
        sealShelf() {
            const o = this.world.get('teach-shelf');
            if (!o) return;
            o.state = 'sealed';
            const v = this.objViews['teach-shelf'];
            if (v) v.setAlpha(0.75);
            this.flash('架位被封闭（教学道具·不可修复，只能重开）');
        }
        resetScene() {
            resetLibraryWorld(this.world, this.time.now);
            this.closeBookPanel();
            this.anomalies.clear();
            this.seizeTriggered = false;
            this.patrolState = 'PATROL';
            this.witness = 0;
            this.syncPainting();
            this.syncBlockAll();
            const ts = this.objViews['teach-shelf'];
            if (ts) ts.setAlpha(1);
            this.flash('场景已重置');
        }
        syncBlockPos(id: string) {
            const b = this.world.get(id);
            const v = this.objViews[id];
            if (!b || !v) return;
            const p = gridToPos(b.data.gxf, b.data.gyf);
            v.setPosition(p.x, p.y);
            this.markDepthDirty();
        }
        syncBlockAll() {
            blocksOf(this.world).forEach((b: any) => this.syncBlockPos(b.id));
        }

        /* ═══════════════ 阶段 / 难度 / 道具效果 ═══════════════ */

        setPhase(p: string) {
            if (this.phase !== p) {
                this.patrolState = 'PATROL';
                this.patrolInspectMs = 0;
                this.patrolReturnMs = 0;
                this.witness = 0;
                this.seizeRolls = 0;
                this.seizeTriggered = false;
            }
            this.phase = p;
            this.syncDropView();
        }
        setDifficulty(d: number) {
            this.difficulty = Math.max(1, Math.min(3, d || 1));
        }
        setLightUntil(t: number) {
            this.lightUntil = t;
        }
        setWatchUntil(t: number) {
            this.watchUntil = t;
        }
        propFx(_kind: string) {
            if (!this.player) return;
            this.tweens.add({ targets: this.player, scaleX: 1.14, scaleY: 0.92, duration: 110, yoyo: true, ease: 'Back.easeOut' });
        }
        useDistraction() {
            if ((this.world.inventory || []).indexOf('distraction') < 0) {
                this.flash('尚无干扰物，去「人物故事会」领取');
                return;
            }
            this.distractUntil = this.time.now + DISTRACT_MS;
            this.flash('抛出干扰物，巡逻被引开 ' + DISTRACT_MS / 1000 + ' 秒');
        }
        setDecoy(gx: number, gy: number) {
            this.decoyCell = { gx, gy };
            this.decoyActive = true;
            const p = gridToPos(gx, gy);
            if (this.decoyView) this.decoyView.setPosition(p.x, p.y).setVisible(true);
            this.flash('诱饵信封已放在 (' + gx + ',' + gy + ')：巡逻多半会扑空');
        }
        chalkMark(gx: number, gy: number) {
            this.decoyCell = { gx, gy };
            this.decoyUntil = this.time.now + 6000;
            this.flash('墙面画了误导记号：巡逻被引向错误区域');
        }

        /* ═══════════════ 相机 ═══════════════ */

        bindCamera() {
            this.input.addPointer(2);
            this.cameras.main.setZoom(1);
            this.clampCamera();
            this.input.on('wheel', (p: any, _o: any, _dx: any, _dy: any, dz: number) => {
                this.zoomAt(p.x, p.y, dz > 0 ? 0.9 : 1.1);
            });
        }
        clampCamera() {
            const cam = this.cameras.main;
            cam.setZoom(Phaser.Math.Clamp(cam.zoom, this.MIN_ZOOM, this.MAX_ZOOM));
            const halfW = cam.width / 2 / cam.zoom;
            const halfH = cam.height / 2 / cam.zoom;
            let cx = cam.scrollX + halfW;
            cx = WORLD_W <= halfW * 2 ? WORLD_W / 2 : Phaser.Math.Clamp(cx, halfW, WORLD_W - halfW);
            let cy = cam.scrollY + halfH;
            cy = VIEW_H <= halfH * 2 ? VIEW_H / 2 : Phaser.Math.Clamp(cy, halfH, VIEW_H - halfH);
            cam.scrollX = cx - halfW;
            cam.scrollY = cy - halfH;
        }
        zoomAt(sx: number, sy: number, factor: number) {
            const cam = this.cameras.main;
            const before = cam.getWorldPoint(sx, sy);
            cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, this.MIN_ZOOM, this.MAX_ZOOM));
            const after = cam.getWorldPoint(sx, sy);
            cam.scrollX += before.x - after.x;
            cam.scrollY += before.y - after.y;
            this.clampCamera();
        }
        zoomBy(factor: number) {
            this.zoomAt(this.cameras.main.width / 2, this.cameras.main.height / 2, factor);
            this.flash('视野缩放 ' + this.cameras.main.zoom.toFixed(2) + '×');
        }
        resetCamera() {
            const cam = this.cameras.main;
            cam.setZoom(1);
            cam.centerOn(WORLD_W / 2, VIEW_H / 2);
            this.clampCamera();
            this.flash('视野已复位');
        }
        handlePinch(): boolean {
            const p1 = this.input.pointer1;
            const p2 = this.input.pointer2;
            if (!p1 || !p2 || !p1.isDown || !p2.isDown) {
                this.pinchDist = 0;
                this.pinchMid = null;
                return false;
            }
            const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            if (this.pinchDist > 0 && d > 0) this.zoomAt(mx, my, d / this.pinchDist);
            if (this.pinchMid) {
                this.cameras.main.scrollX -= (mx - this.pinchMid.x) / this.cameras.main.zoom;
                this.cameras.main.scrollY -= (my - this.pinchMid.y) / this.cameras.main.zoom;
            }
            this.pinchDist = d;
            this.pinchMid = { x: mx, y: my };
            this.clampCamera();
            return true;
        }

        /* ═══════════════ 角色移动 ═══════════════ */

        playerNearCell(gx: number, gy: number, r = 1): boolean {
            if (!this.player) return false;
            const p = gridToPos(gx, gy);
            return Math.hypot(this.player.x - p.x, this.player.y - p.y) < 60 * (r + 0.5);
        }
        walkToCell(gx: number, gy: number): Promise<boolean> {
            const pos = gridToPos(gx, gy);
            return this.walkTo(pos.x, pos.y).then(() => true);
        }
        walkTo(x: number, y: number): Promise<void> {
            return new Promise((resolve) => {
                if (!this.player) return resolve();
                const dx = x - this.player.x;
                const dy = y - this.player.y;
                if (Math.hypot(dx, dy) < 2) {
                    resolve();
                    return;
                }
                this.walking = true;
                this.faceDir = dx < 0 ? -1 : 1;
                this.tweens.add({
                    targets: this.player,
                    x,
                    y,
                    duration: Math.min(1400, Math.hypot(dx, dy) * 4.5),
                    ease: 'Sine.InOut',
                    onComplete: () => {
                        this.walking = false;
                        this.markDepthDirty();
                        resolve();
                    }
                });
            });
        }

        /* ═══════════════ 巡逻 / 管理员 ═══════════════ */

        alertLevel(): number {
            if (this.time.now < this.distractUntil) return 0;
            const ev = this.world.evidence.reduce((s: number, e: any) => s + e.severity, 0);
            let v = ev * 0.12;
            const mk = this.world.get('marker');
            if (mk && mk.state === 'placed' && !markerCoveredByBlock(this.world)) v += 0.2;
            if (this.time.now < this.watchUntil) v *= 0.5;
            return Math.max(0, Math.min(1, v));
        }
        patrolDistance(): number {
            const d = this.hooks.getDrop ? this.hooks.getDrop() : null;
            if (!d || d.phase !== 'PICKABLE' || d.gx == null) return 99;
            const p = gridToPos(d.gx, d.gy);
            return Math.hypot(this.librarianView.x - p.x, this.librarianView.y - p.y) / 58;
        }
        playerDistance(): number {
            if (!this.player || !this.librarianView) return 99;
            return Math.hypot(this.player.x - this.librarianView.x, this.player.y - this.librarianView.y) / 58;
        }
        moveToward(view: any, tgt: { x: number; y: number }, speed: number): boolean {
            const dx = tgt.x - view.x;
            const dy = tgt.y - view.y;
            const d = Math.hypot(dx, dy);
            if (d < 4) return true;
            const m = Math.min(d, speed);
            view.x += (dx / d) * m;
            view.y += (dy / d) * m;
            return false;
        }
        patrolUpdate() {
            if (!this.librarianView) return;
            const dt = (this.game && this.game.loop && this.game.loop.delta) || 16;
            const distracted = this.time.now < this.distractUntil;
            const d = this.hooks.getDrop ? this.hooks.getDrop() : null;
            const drop = d && d.phase === 'PICKABLE' ? d : null;
            this.witness = witnessGain(this.witness, this.playerDistance());
            const verdict = patrolStep({
                zoneSeverity: this.world.evidence.reduce((s: number, e: any) => s + e.severity, 0),
                distance: drop ? this.patrolDistance() : 99,
                conceal: drop && drop.conceal != null ? drop.conceal : 2,
                witness: this.witness,
                distracted,
                watched: this.time.now < this.watchUntil,
                state: this.patrolState,
                inspectMs: this.patrolInspectMs,
                returnMs: this.patrolReturnMs,
                roll: seededPick(this.world.seed || 'lib', 'seize' + this.seizeRolls, 1000) / 1000
            });
            this.patrolRisk = verdict.risk;
            if (this.patrolState !== verdict.state) {
                this.patrolInspectMs = 0;
                this.patrolReturnMs = 0;
                if (verdict.state === 'INSPECT') this.seizeRolls += 1;
                if (this.hooks.onPatrolState) this.hooks.onPatrolState(PATROL_STATE_TEXT[verdict.state], Math.round(verdict.risk * 100));
            } else if (verdict.state === 'INSPECT') this.patrolInspectMs += dt;
            else if (verdict.state === 'RETURN_PATROL') this.patrolReturnMs += dt;
            this.patrolState = verdict.state;
            if (verdict.seize) {
                this.patrolSeize();
                return;
            }
            const speed = (PATROL_BASE_SPEED + this.alertLevel() * PATROL_ALERT_GAIN) * this.difficulty;
            const chalked = this.time.now < this.decoyUntil && this.decoyCell;
            if (verdict.state === 'PATROL' || verdict.state === 'SUSPICIOUS') {
                if (this.patrolPts.length && this.moveToward(this.librarianView, this.patrolPts[this.patrolIdx], speed)) {
                    this.patrolIdx = (this.patrolIdx + 1) % this.patrolPts.length;
                }
            } else if (verdict.state === 'INSPECT' && drop && drop.gx != null) {
                const tgtCell = this.decoyActive && this.decoyCell ? this.decoyCell : { gx: drop.gx, gy: drop.gy };
                const p = gridToPos(tgtCell.gx, tgtCell.gy);
                this.moveToward(this.librarianView, p, speed * 1.15);
                if (Math.hypot(this.librarianView.x - p.x, this.librarianView.y - p.y) < 12) {
                    if (this.decoyActive && this.decoyCell) {
                        this.decoyActive = false;
                        if (this.decoyView) this.decoyView.setVisible(false);
                        this.patrolState = 'CLEAR';
                        this.flash('巡逻员拆开诱饵信封——扑空！');
                    } else {
                        this.patrolSeize();
                    }
                }
            } else if (chalked && this.decoyCell) {
                this.moveToward(this.librarianView, gridToPos(this.decoyCell.gx, this.decoyCell.gy), speed);
            }
        }
        adminUpdate() {
            if (!this.adminView || !this.adminPts.length) return;
            this.adminCycleMs += (this.game && this.game.loop && this.game.loop.delta) || 16;
            if (this.adminCycleMs % 480000 >= Math.min(90000 * this.difficulty, 384000)) return;
            const d = this.hooks.getDrop ? this.hooks.getDrop() : null;
            const drop = d && d.phase === 'PICKABLE' ? d : null;
            if (this.moveToward(this.adminView, this.adminPts[this.adminIdx], 0.55)) {
                this.adminIdx = (this.adminIdx + 1) % this.adminPts.length;
            }
            if (drop && drop.zone === 'desk' && drop.gx != null) {
                const p = gridToPos(drop.gx, drop.gy);
                if (Math.hypot(this.adminView.x - p.x, this.adminView.y - p.y) < 46 && this.hooks.onAdminSeize) {
                    this.hooks.onAdminSeize();
                }
            }
        }
        patrolSeize(reason?: string) {
            if (this.seizeTriggered) return;
            this.seizeTriggered = true;
            const d = this.hooks.getDrop ? this.hooks.getDrop() : null;
            const tgt = d && d.gx != null ? gridToPos(d.gx, d.gy) : gridToPos(2, 2);
            this.tweens.add({
                targets: this.librarianView,
                x: tgt.x,
                y: tgt.y,
                duration: 900,
                ease: 'Sine.In',
                onComplete: () => {
                    this.flash(reason || '巡逻员识破暗点，取走密页');
                    if (this.hooks.onPatrolSeize) this.hooks.onPatrolSeize(reason);
                }
            });
        }

        /* ═══════════════ 每帧 ═══════════════ */

        /** 线索解锁特效：暗格电池辉光（解出密码锁后持续呼吸闪烁） + 首次解锁光环 */
        drawClueFx(time: number) {
            if (!this.clueG) return;
            this.clueG.clear();
            const now = performance.now();
            // 暗格电池辉光（解出密码锁后持续呼吸闪烁）
            if (this.clueSet.has('lamp-battery')) {
                const p = LAYOUT.painting;
                const x = p.x;
                const y = p.y;
                const pulse = 0.5 + 0.5 * Math.sin(time / 220);
                this.clueG.fillStyle(0xffd166, 0.1 + 0.1 * pulse);
                this.clueG.fillCircle(x, y - 4, 28 + 6 * pulse);
                this.clueG.fillStyle(0xffe3a3, 0.92);
                this.clueG.fillRoundedRect(x - 9, y - 16, 18, 30, 4);
                this.clueG.fillStyle(0xc8a24a, 1);
                this.clueG.fillRect(x - 4, y - 21, 8, 5);
                this.clueG.fillStyle(0x8a5a2b, 1);
                this.clueG.fillRect(x - 6, y - 9, 12, 3);
                // 首次解锁：暗格「开启动画」——炸开一圈扩散光环
                if (this.batteryBurst && now - this.batteryBurst < 700) {
                    const k = (now - this.batteryBurst) / 700;
                    this.clueG.lineStyle(3 * (1 - k), 0xffe3a3, 0.85 * (1 - k));
                    this.clueG.strokeCircle(x, y - 4, 18 + 52 * k);
                }
            }
            // 幽灵情报成形辉光（青白幽光，跟随角色）
            if (this.clueSet.has('ghost-intel') && this.player) {
                const x = this.player.x;
                const y = this.player.y - 26;
                const g = 0.45 + 0.25 * Math.sin(time / 260);
                this.clueG.fillStyle(0x9fe8ff, 0.1 * g);
                this.clueG.fillCircle(x, y, 32);
                this.clueG.fillStyle(0x9fe8ff, 0.55 * g);
                this.clueG.fillCircle(x, y, 11);
                // 首次成形：青白光环扩散
                if (this.ghostBurst && now - this.ghostBurst < 700) {
                    const k = (now - this.ghostBurst) / 700;
                    this.clueG.lineStyle(3 * (1 - k), 0x9fe8ff, 0.85 * (1 - k));
                    this.clueG.strokeCircle(x, y, 14 + 40 * k);
                }
            }
        }

        render(time: number) {
            if (this.recovered.indexOf('teach-book') >= 0) {
                this.flash('撕下的书页已自行修复（可修复对象）');
                const b = this.books.find((bk) => bk.id === 'teach-book');
                if (b && b.torn) {
                    b.torn = false;
                    redrawBook(b);
                    this.removeAnomaly('scene:book-torn');
                }
            }
            this.dyn.clear();
            const painting = this.world.get('painting');
            if (painting && painting.data.cavity && painting.data.cavity !== 'none') {
                const L = LAYOUT['painting'];
                drawNiche2D(this.dyn, L.x, L.y, 0.4 + 0.4 * Math.sin(time / 240));
            }
            this.drawMarker(time);
            this.syncDropView();
            this.updatePlayer(time);
            this.patrolUpdate();
            this.adminUpdate();
            this.updateStealthVisual(time);

            if (time < this.lightUntil && this.player) {
                this.dyn.fillStyle(0xffd07a, 0.14);
                this.dyn.fillEllipse(this.player.x, this.player.y - 24, 170, 124);
                this.dyn.lineStyle(2, 0xffd07a, 0.3 + 0.2 * Math.sin(time / 150));
                this.dyn.strokeEllipse(this.player.x, this.player.y - 24, 170, 124);
            }
            if (this.librarianView) {
                const p = this.librarianView;
                if (this.time.now < this.distractUntil) {
                    this.dyn.lineStyle(3, 0x1f6f5c, 0.5 + 0.4 * Math.sin(time / 160));
                    this.dyn.strokeCircle(p.x, p.y - 22, 20 + 3 * Math.sin(time / 160));
                } else if (this.patrolState === 'INSPECT') {
                    this.dyn.lineStyle(3, 0xff8c1a, 0.5 + 0.4 * Math.sin(time / 110));
                    this.dyn.strokeCircle(p.x, p.y - 22, 22 + 4 * Math.sin(time / 110));
                } else if (this.patrolState === 'SUSPICIOUS' || this.patrolRisk > 0.5) {
                    this.dyn.lineStyle(3, 0xffd166, 0.4 + 0.4 * Math.sin(time / 140));
                    this.dyn.strokeCircle(p.x, p.y - 22, 20 + 3 * Math.sin(time / 140));
                }
            }
            if (this.adminView && this.adminCycleMs % 480000 < 90000) {
                const a = this.adminView;
                this.dyn.lineStyle(2, 0x9fb6ff, 0.35 + 0.3 * Math.sin(time / 200));
                this.dyn.strokeCircle(a.x, a.y - 44, 12);
            }
            // 异常态：画面边缘朱砂呼吸边
            if (this.anomalies.size) {
                const cam = this.cameras.main;
                const w = cam.width / cam.zoom;
                const h = cam.height / cam.zoom;
                this.dyn.lineStyle(4, CINNABAR, 0.22 + 0.18 * Math.sin(time / 320));
                this.dyn.strokeRect(cam.scrollX + 2, cam.scrollY + 2, w - 4, h - 4);
            }
            this.drawAmbient(time);
            this.drawClueFx(time);
            if (this.depthDirty) {
                this.depthDirty = false;
                this.applyDepthAll();
            }
        }

        updatePlayer(time: number) {
            if (!this.player) return;
            if (this.pg) this.pg.y = this.walking ? Math.sin(time / 70) * 2 : 0;
            this.player.scaleX = this.faceDir;
        }

        /* ── 本轮增强：潜行/警觉每帧可视化 ── */
        updateStealthVisual(time: number) {
            const dt = Math.min(60, Math.max(8, (time - this.lastT) || 16));
            this.lastT = time;
            if (!this.librarianView || !this.player) return;
            const lib = this.librarianView;
            updateFacing(this.stealth, this.libPrev, { x: lib.x, y: lib.y }, dt);
            this.libPrev = { x: lib.x, y: lib.y };
            const shiftGap = performance.now() < this.distractUntil;
            const risky =
                !!this.grab ||
                !!this.carry ||
                this.tables.some((t) => t.state === 'flipped') ||
                (!!this.openBook && this.openBook.stash.length > 0);
            let triggered: boolean;
            if (this.forceSeen) {
                // 测试钩子：强制「被注视 + 高风险」，快速爬升警觉
                this.stealth.inSight = true;
                this.stealth.shiftGap = false;
                this.stealth.alert = Math.min(1, this.stealth.alert + 0.9 * (dt / 1000));
                triggered = this.stealth.alert >= 0.85;
            } else {
                triggered = updateStealth(
                    this.stealth,
                    { x: lib.x, y: lib.y },
                    { player: { x: this.player.x, y: this.player.y }, risky, shiftGap, dt }
                );
            }
            // 评分：记录风险峰值；被察觉清零连击 + 触发 scene:spotted 回灌既有证据模型
            recordRisk(this.score, this.stealth.alert);
            if (triggered && !this.anomalies.has('scene:spotted')) {
                this.addAnomaly('scene:spotted', '被馆员当场发现', 3, 'reading-1');
                breakCombo(this.score);
                sfx.alarm();
            } else if (!triggered && this.anomalies.has('scene:spotted') && this.stealth.alert < 0.3) {
                this.removeAnomaly('scene:spotted');
            }
            // 视线锥 + 头顶警觉点（画进 this.dyn 世界层）
            drawSightCone(this.dyn, lib.x, lib.y - 30, this.stealth.facing, this.stealth.fov, this.stealth.range, this.stealth.alert);
            drawAlertPip(this.dyn, lib.x, lib.y - 54, this.stealth.alert);
        }

        /* ── 本轮增强：昼夜/紫外 屏幕色调 + 尘埃视差 ── */
        drawAmbient(time: number) {
            const dust = this.dustG;
            if (dust) {
                dust.clear();
                if (this.lamp.on) drawDust(dust, VIEW_W, time);
            }
            const ov = this.overlayG;
            if (!ov) return;
            ov.clear();
            if (!this.lamp.on) {
                ov.fillStyle(ambientColor(this.lamp), this.lamp.uv ? 0.55 : 0.62);
                ov.fillRect(0, 0, VIEW_W, VIEW_H);
                if (this.lamp.uv) {
                    const pulse = 0.5 + 0.5 * Math.sin(time / 300);
                    this.uvMarks.forEach((m) => drawUVInk(ov, m.x, m.y, pulse));
                }
            }
        }

        /** 便签标记（Graphics 无 translate，用 save/translateCanvas/restore 平移到目标点） */
        drawMarker(time: number) {
            const m = this.world.get('marker');
            if (!m || m.state !== 'placed') return;
            const p = gridToPos(m.data.gx, m.data.gy);
            const dir = MARK_DIR[m.data.orient] || MARK_DIR.E;
            const a = gridToPos(0, 0);
            const b = gridToPos(dir[0], dir[1]);
            const ang = Math.atan2(b.y - a.y, b.x - a.x);
            this.dyn.save();
            this.dyn.translateCanvas(p.x, p.y);
            drawMarkerStone(this.dyn, ang);
            this.dyn.restore();
            // 被书堆压住时给个微弱提示
            if (markerCoveredByBlock(this.world) && Math.sin(time / 300) > 0) {
                this.dyn.lineStyle(1.5, GOLD, 0.25);
                this.dyn.strokeCircle(p.x, p.y - 4, 16);
            }
        }

        /** 暗点信函位置同步（阶段驱动） */
        syncDropView() {
            const d = this.hooks.getDrop ? this.hooks.getDrop() : null;
            if (!this.dropView) return;
            const show = d && (d.phase === 'PLACED' || d.phase === 'PICKABLE' || d.phase === 'PICKED') && d.gx != null;
            if (show) {
                const p = gridToPos(d.gx, d.gy);
                this.dropView.setPosition(p.x, p.y).setVisible(true);
            } else {
                this.dropView.setVisible(false);
            }
        }

        markDepthDirty() {
            this.depthDirty = true;
        }
    };
}
