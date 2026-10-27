/**
 * 等距（2.5D）网格投影（纯函数，渲染无关）
 *
 * 同一套网格参数可被任意江湖场景复用：北山老树、茶馆、总舵密室……
 * 场景只需 new IsoGrid() 并调用 isoPx / isoInvert。
 */
export class IsoGrid {
    TILE_W = 64;
    TILE_H = 32;
    N = 5;
    CX = 180;
    BASE_Y = 380;

    /** 网格坐标 → 屏幕像素（菱形投影） */
    isoPx(gx: number, gy: number): { x: number; y: number } {
        return {
            x: this.CX + (gx - gy) * (this.TILE_W / 2),
            y: this.BASE_Y + (gx + gy) * (this.TILE_H / 2)
        };
    }

    /** 屏幕像素 → 网格坐标（用于点击命中等逆运算） */
    isoInvert(px: number, py: number): { gx: number; gy: number } {
        const dx = px - this.CX;
        const dy = py - this.BASE_Y;
        return {
            gx: (dx / (this.TILE_W / 2) + dy / (this.TILE_H / 2)) / 2,
            gy: (dy / (this.TILE_H / 2) - dx / (this.TILE_W / 2)) / 2
        };
    }
}
