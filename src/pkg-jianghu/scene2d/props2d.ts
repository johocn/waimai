/**
 * 2D 程序化绘制：书本 / 桌子正反面 / 信函 / 便签 / 手持视觉
 *
 * 策略与 scene/assets.ts 一致：有图集帧用帧，缺失则静默回退这里的过程绘制，
 * 不会报错、不会白屏。书本 / 桌子正反面 / 手持视觉无现成帧，全部程序化。
 */
import type { BookView, TableView } from './types';

/** 水墨配色（与 $jh-* token 对齐） */
export const INK = 0x1f1b16;
export const INK_2 = 0x6b6257;
export const PAPER = 0xf6f1e7;
export const CINNABAR = 0xb23a2e;
export const GOLD = 0xc8a24a;
export const GOLD_L = 0xe3c877;
export const JADE = 0x1f6f5c;

/** 书脊色板（程序化书架用） */
export const BOOK_HUES = [0xb23a2e, 0x1f6f5c, 0xc8a24a, 0x466a96, 0x8a5a3a, 0x6b4f8a];

/** 生成可复用 canvas 贴图（运行期只做 setTexture，不重画） */
export function makeCanvasTexture(scene: any, key: string, w: number, h: number, draw: (ctx: any) => void): void {
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, w, h);
    if (!t) return;
    draw(t.getContext());
    t.refresh();
}

/* ── 书本 ── */

/** 闭合的书：书脊 + 封面 + 描金题签 */
export function drawBookClosed(g: any, hue: number, w = 22, h = 30): void {
    g.clear();
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(-w / 2 + 2, -h + 3, w, h, 2);
    g.fillStyle(hue, 1);
    g.fillRoundedRect(-w / 2, -h, w, h, 2);
    g.fillStyle(0xffffff, 0.16);
    g.fillRect(-w / 2 + 2, -h + 3, 3, h - 6);
    g.lineStyle(1, GOLD_L, 0.9);
    g.strokeRoundedRect(-w / 2 + 4, -h + 6, w - 8, 10, 1);
    g.lineStyle(1, GOLD_L, 0.5);
    g.strokeRoundedRect(-w / 2, -h, w, h, 2);
}

/** 摊开的书：左右两页 + 中缝 + 页间纹理 */
export function drawBookOpen(g: any, hue: number, page = 0): void {
    g.clear();
    const w = 56;
    const h = 40;
    g.fillStyle(0x000000, 0.28);
    g.fillRoundedRect(-w / 2 + 2, -h + 3, w, h, 2);
    // 两页纸
    g.fillStyle(PAPER, 1);
    g.fillRoundedRect(-w / 2, -h, w / 2 - 1, h, 2);
    g.fillRoundedRect(1, -h, w / 2 - 1, h, 2);
    // 封面底（露出边缘）
    g.fillStyle(hue, 1);
    g.fillRoundedRect(-w / 2 - 2, -h - 2, w + 4, h + 4, 3);
    g.fillStyle(PAPER, 1);
    g.fillRoundedRect(-w / 2, -h, w / 2 - 1, h, 2);
    g.fillRoundedRect(1, -h, w / 2 - 1, h, 2);
    // 中缝
    g.lineStyle(1, INK, 0.25);
    g.beginPath();
    g.moveTo(0, -h + 2);
    g.lineTo(0, -2);
    g.strokePath();
    // 文字行（按页数错位，形成「翻页」观感）
    g.lineStyle(INK_2, 0.45);
    for (let i = 0; i < 5; i++) {
        const y = -h + 7 + i * 7;
        const len = 14 + ((i + page) % 3) * 6;
        g.beginPath();
        g.moveTo(-w / 2 + 5, y);
        g.lineTo(-w / 2 + 5 + len, y);
        g.moveTo(5, y);
        g.lineTo(5 + len, y);
        g.strokePath();
    }
    g.lineStyle(1, GOLD, 0.55);
    g.strokeRoundedRect(-w / 2 - 2, -h - 2, w + 4, h + 4, 3);
}

/** 书本整体视图（闭合 / 摊开由 state 决定） */
export function drawBookView(g: any, book: BookView): void {
    if (book.state === 'open') drawBookOpen(g, book.hue, book.page);
    else drawBookClosed(g, book.hue);
}

/** 书堆（可拖拽的一小摞书，替代旧石墩） */
export function drawBookStack(g: any): void {
    g.clear();
    const layers: [number, number, number][] = [
        [0, 0, 0x466a96],
        [-3, -9, 0xb23a2e],
        [2, -18, 0x1f6f5c]
    ];
    layers.forEach(([dx, dy, hue]) => {
        g.fillStyle(0x000000, 0.22);
        g.fillRoundedRect(dx - 17 + 2, dy - 9 + 2, 34, 11, 2);
        g.fillStyle(hue, 1);
        g.fillRoundedRect(dx - 17, dy - 9, 34, 11, 2);
        g.fillStyle(0xffffff, 0.18);
        g.fillRect(dx - 15, dy - 8, 12, 2);
        g.lineStyle(1, GOLD_L, 0.5);
        g.strokeRoundedRect(dx - 17, dy - 9, 34, 11, 2);
    });
}

/* ── 桌子 ── */

/** 桌面（正常态）：桌面 + 桌腿 + 描金边 */
export function drawTableTop(g: any, w = 180, h = 74): void {
    g.clear();
    // 桌腿
    g.fillStyle(0x2b2018, 1);
    g.fillRect(-w / 2 + 12, -22, 10, 34);
    g.fillRect(w / 2 - 22, -22, 10, 34);
    // 桌面
    g.fillStyle(0x3a2a1c, 1);
    g.fillRoundedRect(-w / 2, -h, w, 22, 3);
    g.fillStyle(0x54381f, 1);
    g.fillRoundedRect(-w / 2 + 3, -h + 2, w - 6, 8, 2);
    g.lineStyle(1.5, GOLD, 0.45);
    g.strokeRoundedRect(-w / 2, -h, w, 22, 3);
}

/** 桌底（翻面态）：桌面板背面 + 可粘附区（虚线框 + 磁贴提示） */
export function drawTableBottom(g: any, w = 180, h = 74): void {
    g.clear();
    // 桌腿（朝上）
    g.fillStyle(0x2b2018, 1);
    g.fillRect(-w / 2 + 12, -h + 12, 10, 34);
    g.fillRect(w / 2 - 22, -h + 12, 10, 34);
    // 桌面背面
    g.fillStyle(0x2a1f16, 1);
    g.fillRoundedRect(-w / 2, -h + 34, w, 22, 3);
    g.fillStyle(0x1d150f, 1);
    g.fillRoundedRect(-w / 2 + 3, -h + 36, w - 6, 8, 2);
    // 可粘附区
    g.lineStyle(1.5, GOLD, 0.85);
    g.strokeRoundedRect(-w / 2 + 14, -h + 40, w - 28, 12, 2);
    g.fillStyle(GOLD, 0.5);
    for (let i = 0; i < 4; i++) g.fillCircle(-w / 2 + 24 + i * ((w - 48) / 3), -h + 46, 1.6);
}

/* ── 信函 / 便签 / 手持 ── */

/** 信函（暗点里的密页） */
export function drawEnvelope(g: any, w = 30, h = 22): void {
    g.clear();
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(-w / 2 + 2, -h + 3, w, h, 3);
    g.fillStyle(0xd8c9a3, 1);
    g.fillRoundedRect(-w / 2, -h, w, h, 3);
    g.lineStyle(1.5, 0x8a6b3a, 1);
    g.strokeRoundedRect(-w / 2, -h, w, h, 3);
    g.beginPath();
    g.moveTo(-w / 2, -h + 2);
    g.lineTo(0, -h + 12);
    g.lineTo(w / 2, -h + 2);
    g.strokePath();
    g.fillStyle(CINNABAR, 0.9);
    g.fillRect(-4, -h + 14, 8, 5);
}

/** 便签标记石 + 指向箭头 */
export function drawMarkerStone(g: any, ang: number): void {
    g.clear();
    g.fillStyle(0x8a8378, 1);
    g.fillEllipse(0, 0, 20, 13);
    g.lineStyle(1, 0xd8d2c2, 1);
    g.strokeEllipse(0, 0, 20, 13);
    const len = 26;
    const ex = Math.cos(ang) * len;
    const ey = Math.sin(ang) * len;
    g.lineStyle(3, GOLD_L, 1);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(ex, ey);
    g.strokePath();
    g.fillStyle(GOLD_L, 1);
    g.fillTriangle(ex, ey, ex - Math.cos(ang - 0.4) * 9, ey - Math.sin(ang - 0.4) * 9, ex - Math.cos(ang + 0.4) * 9, ey - Math.sin(ang + 0.4) * 9);
}

/** 手持视觉：小手 + 承托阴影（物体跟手时挂在手上） */
export function drawHand(g: any, holding: boolean): void {
    g.clear();
    if (!holding) return;
    g.fillStyle(0xe8c9a0, 1);
    g.fillRoundedRect(-11, -14, 22, 16, 6);
    g.fillStyle(0xd8b48a, 1);
    g.fillRoundedRect(-9, -20, 18, 8, 4);
    g.lineStyle(1.5, INK, 0.5);
    g.strokeRoundedRect(-11, -14, 22, 16, 6);
}

/** 梯凳（stool 道具视觉） */
export function drawStool(g: any): void {
    g.clear();
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(0, 2, 34, 10);
    g.fillStyle(0x54381f, 1);
    g.fillRoundedRect(-16, -26, 32, 8, 2);
    g.fillStyle(0x3a2a1c, 1);
    g.fillRect(-13, -18, 5, 20);
    g.fillRect(8, -18, 5, 20);
    g.lineStyle(1, GOLD, 0.35);
    g.strokeRoundedRect(-16, -26, 32, 8, 2);
}

/** 背景墙：剪影书架 + 暖窗（2D 横版远景） */
export function drawBackWall(g: any, worldW: number): void {
    g.clear();
    // 背墙
    g.fillStyle(0x1a1410, 1);
    g.fillRect(0, 96, worldW, 250);
    // 剪影书架格
    g.fillStyle(0x241a12, 1);
    for (let x = 0; x < worldW; x += 44) g.fillRect(x, 108, 40, 230);
    // 横向腰线
    g.fillStyle(CINNABAR, 0.16);
    g.fillRect(0, 108, worldW, 12);
    // 暖窗（闭馆余光）
    g.fillStyle(0xffd07a, 0.42);
    g.fillRect(228, 130, 150, 96);
    g.fillStyle(0x1a1410, 0.55);
    g.fillRect(300, 130, 5, 96);
    g.fillRect(228, 174, 150, 5);
}

/** 地面（木地板 + 近景暖光） */
export function drawFloor(g: any, worldW: number, groundY: number, viewH: number): void {
    g.clear();
    g.fillStyle(0x2a2018, 1);
    g.fillRect(0, groundY - 6, worldW, viewH - groundY + 6);
    g.lineStyle(1, 0x1a120c, 0.5);
    for (let x = 0; x < worldW; x += 60) {
        g.beginPath();
        g.moveTo(x, groundY - 6);
        g.lineTo(x - 20, viewH);
        g.strokePath();
    }
    g.fillStyle(0x3a2b1d, 0.55);
    g.fillRect(0, groundY - 6, worldW, 8);
}

/** 画后暗格（取下背景画后露出） */
export function drawNiche2D(g: any, x: number, y: number, pulse: number): void {
    g.fillStyle(0x0a0705, 1);
    g.fillEllipse(x, y, 34, 46);
    g.lineStyle(2.5, 0xe8d9a0, pulse);
    g.strokeEllipse(x, y, 34, 46);
}

/* ── 本轮增强的绘制：视线锥 / 台灯 / 紫外墨迹 / 尘埃 / 警觉点 ── */

/** 馆员视线锥（每帧重绘；alert 高时染朱砂） */
export function drawSightCone(g: any, x: number, y: number, facing: number, fov: number, range: number, alert: number): void {
    const a0 = facing - fov / 2;
    const a1 = facing + fov / 2;
    const col = alert > 0.6 ? 0xff6a4a : alert > 0.3 ? 0xffd166 : 0x9fb6ff;
    const alpha = 0.1 + alert * 0.18;
    g.fillStyle(col, alpha);
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, range, a0, a1, false);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, col, 0.35 + alert * 0.4);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a0) * range, y + Math.sin(a0) * range);
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a1) * range, y + Math.sin(a1) * range);
    g.strokePath();
}

/** 管理台抽屉（开/合） */
export function drawDeskDrawer(g: any, open: boolean): void {
    g.clear();
    g.fillStyle(0x1d150f, 1);
    g.fillRoundedRect(-26, 18, 52, 16, 2);
    g.lineStyle(1, GOLD, 0.5);
    g.strokeRoundedRect(-26, 18, 52, 16, 2);
    if (open) {
        g.fillStyle(0x0a0705, 1);
        g.fillRoundedRect(-22, 6, 44, 14, 2);
        g.fillStyle(GOLD, 0.9);
        g.fillRect(-12, 10, 24, 6); // 露出的内置物（描金）
    }
}

/** 紫外显影的隐藏墨迹提示（关灯 UV 模式才显） */
export function drawUVInk(g: any, x: number, y: number, pulse: number): void {
    g.fillStyle(0x7af0ff, 0.5 + 0.3 * pulse);
    g.fillCircle(x, y, 3);
    g.lineStyle(1, 0x7af0ff, 0.4 + 0.3 * pulse);
    g.strokeCircle(x, y, 7 + 2 * Math.sin(pulse * 6));
}

/** 漂浮尘埃（视差感，低开销） */
export function drawDust(g: any, worldW: number, t: number): void {
    g.fillStyle(0xf6f1e7, 0.18);
    for (let i = 0; i < 18; i++) {
        const x = (i * 53 + (t / 60) * (i % 3 ? 1 : -1)) % worldW;
        const y = 120 + ((i * 71 + (t / 40)) % 360);
        g.fillCircle(Math.abs(x), y, i % 2 ? 1.4 : 0.9);
    }
}

/** 警觉指示点（馆员头顶小圆，颜色随 alert） */
export function drawAlertPip(g: any, x: number, y: number, alert: number): void {
    const col = alert > 0.6 ? 0xff4d4f : alert > 0.3 ? 0xffd166 : 0x9fb6ff;
    g.fillStyle(col, 0.9);
    g.fillCircle(x, y, 3 + alert * 2);
}
