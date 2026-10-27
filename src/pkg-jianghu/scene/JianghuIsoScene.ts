/**
 * 江湖场景共享基类（渲染基建收口）
 *
 * 三套场景（死信箱 / 茶馆 / 密室）共用的 Phaser 场景骨架：
 * - 等距网格 iso（与 IsoGrid 一致，统一投影数学）
 * - 美术资产探测 / 加载 / 帧查询（preload / hasFrame）
 * - 工具读取（tool）、漂浮提示（flash）
 * - 烘焙地面（bakeFloor）、水墨小人（drawInkPerson）
 * - 生命周期骨架（create 建层 + 接线 + 每帧 tick + render 委托）
 *
 * 因 Phaser 是动态 import，基类也以工厂返回，供各页面在拿到 Phaser 后继承。
 *
 * 子类只需实现：bgColor / build() / render(time) / onPointer*。
 */
import { IsoGrid } from './iso';
import { loadArt, ATLAS_KEY } from './assets';

export function createJianghuIsoScene(Phaser: any) {
    abstract class JianghuIsoScene extends Phaser.Scene {
        iso = new IsoGrid();
        world: any = null;
        hooks: any = null;
        art = false;
        bg!: any;
        tilesG!: any;
        dyn!: any;
        flashText!: any;
        flashTimer = 0;
        t: string = 'hand';
        /** 本帧被世界时钟恢复的对象（供子类做反馈） */
        recovered: string[] = [];

        /** 相机背景色（子类必填） */
        abstract bgColor: string;
        /** 构建一次性内容（背景 / 地面 / 角色 / 物件 / 池） */
        abstract build(): void;
        /** 每帧绘制动态内容 */
        abstract render(time: number): void;
        // 指针交互（子类按需覆写）
        onPointerDown(_p: any): void {}
        onPointerMove(_p: any): void {}
        onPointerUp(_p: any): void {}

        /** 仅当探测到图集时才加载（缺失则完全不产生请求，静默回退） */
        preload() {
            if (this.registry.get('art')) loadArt(this);
        }
        /** 图集中是否有该帧 */
        hasFrame(f: string): boolean {
            if (!this.art) return false;
            try {
                return !!this.textures.get(ATLAS_KEY).has(f);
            } catch {
                return false;
            }
        }
        /** 当前工具（实时从 registry 读取） */
        tool(): string {
            return (this.registry.get('tool') as string) || 'hand';
        }
        /** 漂浮提示 */
        flash(msg: string) {
            this.flashText.setText(msg);
            this.flashTimer = this.time.now + 2400;
        }
        /** 一次性烘焙等距地面（两色棋盘 + 描边） */
        bakeFloor(colorA: number, colorB: number) {
            const g = this.tilesG;
            const N = this.iso.N;
            for (let gx = 0; gx < N; gx++) {
                for (let gy = 0; gy < N; gy++) {
                    const p = this.iso.isoPx(gx, gy);
                    g.fillStyle((gx + gy) % 2 ? colorA : colorB, 1);
                    g.fillPoints([{ x: p.x, y: p.y - 16 }, { x: p.x + 32, y: p.y }, { x: p.x, y: p.y + 16 }, { x: p.x - 32, y: p.y }], true);
                    g.lineStyle(1, 0x1a120c, 0.5);
                    g.strokePoints([{ x: p.x, y: p.y - 16 }, { x: p.x + 32, y: p.y }, { x: p.x, y: p.y + 16 }, { x: p.x - 32, y: p.y }], true, true);
                }
            }
        }
        /** 水墨小人（锚点：底部中心；三场景角色画法一致） */
        drawInkPerson(g: any, robe: number) {
            g.clear();
            g.fillStyle(0x000000, 0.3);
            g.fillEllipse(0, 2, 26, 10);
            g.lineStyle(4, 0x2b2b3a, 1);
            g.beginPath();
            g.moveTo(-5, -12);
            g.lineTo(-5, 0);
            g.moveTo(5, -12);
            g.lineTo(5, 0);
            g.strokePath();
            g.fillStyle(robe, 1);
            g.fillRoundedRect(-9, -34, 18, 24, 6);
            g.fillStyle(0xc8a24a, 1);
            g.fillRect(-9, -20, 18, 4);
            g.fillStyle(0xe8c9a0, 1);
            g.fillCircle(0, -40, 7);
            g.fillStyle(0x8a6b3a, 1);
            g.fillTriangle(-12, -44, 12, -44, 0, -54);
        }

        create() {
            this.world = this.registry.get('world');
            this.hooks = this.registry.get('hooks');
            this.art = this.textures.exists(ATLAS_KEY);
            this.cameras.main.setBackgroundColor(this.bgColor);

            this.bg = this.add.graphics().setDepth(0);
            this.tilesG = this.add.graphics().setDepth(1);
            this.dyn = this.add.graphics().setDepth(6);

            this.t = this.tool();
            this.build();

            // 统一用场景级指针事件做命中（规避 uniapp H5 下容器 setInteractive 失灵）
            this.input.on('pointerdown', (p: any) => this.onPointerDown(p));
            this.input.on('pointermove', (p: any) => this.onPointerMove(p));
            this.input.on('pointerup', (p: any) => this.onPointerUp(p));
            this.input.on('pointerupoutside', (p: any) => this.onPointerUp(p));

            this.flashText = this.add
                .text(this.iso.CX, this.iso.BASE_Y + 145, '', { fontFamily: 'sans-serif', fontSize: '13px', color: '#f3e9cf', align: 'center' })
                .setOrigin(0.5)
                .setDepth(20);
            this.flashTimer = 0;

            this.hooks.onSceneReady(this);
        }

        update(time: number) {
            (window as any).__frames = ((window as any).__frames || 0) + 1; // TEMP-DEBUG
            this.t = this.tool();
            this.recovered = this.world ? this.world.tick(time) : [];
            this.render(time);
            if (this.flashTimer && time > this.flashTimer) {
                this.flashText.setText('');
                this.flashTimer = 0;
            }
        }
    }
    return JianghuIsoScene as any;
}
