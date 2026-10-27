<template>
    <view class="page">
        <view class="topbar">
            <view class="seal">茶</view>
            <text class="title">听雨茶馆 · 暗号茶阵</text>
            <text class="sub">布下暗号 · 错时接头 · 错两次即暴露</text>
        </view>

        <div ref="gameContainer" class="stage"></div>

        <!-- 当前暗号状态 -->
        <view class="signal">
            <text class="s-item" :class="{ on: lanternState === 'lit' }">灯笼：{{ lanternText }}</text>
            <text class="s-item" :class="{ on: windowState === 'open' }">窗：{{ windowText }}</text>
            <text class="s-item" :class="{ on: safe }">安全暗号：{{ safe ? '已布下' : '未齐' }}</text>
        </view>

        <!-- 工具 -->
        <view class="tools">
            <view class="tool" :class="{ on: tool === 'hand' }" @tap="setTool('hand')"><text>手</text><text class="tl">挪茶具</text></view>
            <view class="tool" :class="{ on: tool === 'lamp' }" @tap="setTool('lamp')"><text>灯</text><text class="tl">拨灯笼</text></view>
            <view class="tool" :class="{ on: tool === 'shutter' }" @tap="setTool('shutter')"><text>帘</text><text class="tl">推窗</text></view>
            <view class="tool" :class="{ on: tool === 'person' }" @tap="setTool('person')"><text>人</text><text class="tl">召唤接头人</text></view>
        </view>
        <text class="hint">{{ toolHint }}</text>

        <!-- 信息面板 -->
        <view class="panel" v-if="phase === 'idle'">
            <text class="info-t">与接头人约好的安全暗号：灯笼亮 + 窗开。</text>
            <text class="info-r">用「灯」拨亮灯笼、「帘」推开窗户，再「人」召唤接头人落座交付密信。</text>
            <text class="info-r">暗号错两次 → 巡街察觉，灯笼被击碎，接头失败。</text>
        </view>
        <view class="panel ok" v-else-if="phase === 'arrived'">
            <text class="info-t good">接头人落座，密信已藏于茶杯之下</text>
            <text class="info-r">任务成功：情报已转交。茶杯下的字条即上线口信。</text>
            <button class="btn ghost" @tap="doReset">再来一局</button>
        </view>
        <view class="panel seized" v-else-if="phase === 'broken'">
            <text class="info-t bad">灯笼被击碎 · 接头暴露 · 任务失败</text>
            <text class="info-r">暗号连错两次，巡街破门。安全值下降，茶馆被盯上。</text>
            <button class="btn ghost" @tap="doReset">重置茶馆再试</button>
        </view>

        <view class="foot">规则：暗号茶阵（灯笼+窗）+ 错时接头 + 错两次即被巡街截获</view>
    </view>
</template>

<script setup lang="ts">
import { ref, reactive, computed, shallowRef, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useJianghuStore } from '../../stores/jianghu';
import type { SceneWorld } from '../scene/world';
import { createTeahouseWorld, isSafeSignal, lanternOf, windowOf, contactOf, cupOf, seatsOf, toggleLantern, toggleWindow, compromise, arriveContact, resetTeahouse } from '../scene/teahouse';
import { probeArt } from '../scene/assets';
import { ObjectPool } from '../scene/pool';
import { createJianghuIsoScene } from '../scene/JianghuIsoScene';

const jh = useJianghuStore();

/* ── 工具 ── */
type Tool = 'hand' | 'lamp' | 'shutter' | 'person';
const tool = ref<Tool>('hand');
function setTool(t: Tool) {
    tool.value = t;
    game?.registry?.set('tool', t);
}
const toolHint = computed(
    () =>
        ({
            hand: '拖拽茶具 / 凳子重排茶阵；把茶杯挪到桌心可藏/露字条。',
            lamp: '点击灯笼：灭 ↔ 亮。这是暗号的一半。',
            shutter: '点击窗户：关 ↔ 开。窗开是暗号的另一半。',
            person: '召唤接头人。暗号齐则落座交信；错两次即暴露。'
        }[tool.value])
);

/* ── 场景世界（复用 SceneWorld 骨架，换一套对象清单） ── */
const world = reactive(createTeahouseWorld(0)) as SceneWorld;
const lanternState = computed(() => lanternOf(world).state);
const windowState = computed(() => windowOf(world).state);
const contactState = computed(() => contactOf(world).state);
const safe = computed(() => isSafeSignal(world));
const lanternText = computed(() => ({ out: '灭', lit: '亮', broken: '碎' }[lanternState.value] as string));
const windowText = computed(() => (windowState.value === 'open' ? '开' : '关'));
const phase = computed(() => (lanternState.value === 'broken' ? 'broken' : contactState.value === 'arrived' ? 'arrived' : 'idle'));

/* ── Phaser 场景 ── */
const gameContainer = ref<HTMLElement | null>(null);
const sceneRef = shallowRef<any>(null);
let game: any = null;

function makeTeahouseScene(Phaser: any) {
    return class TeahouseScene extends createJianghuIsoScene(Phaser) {
        bgColor = '#140d0a';
        world: any;
        hooks: any;
        dragging: any = null;
        walking = false;
        faceDir = 1;
        busy = false;
        summonTries = 0;
        player: any = null;
        pg: any = null;
        contact: any = null;
        cg: any = null;
        draggables: { id: string; c: any }[] = [];
        pool: any = null;

        constructor() {
            super('th');
        }
        build() {
            this.drawBg();
            this.bakeFloor(0x4a3a2c, 0x42342a);
            this.makePersons();
            this.makeProps();
        }

        /* 背景：后墙 + 悬灯绳 */
        drawBg() {
            const g = this.bg;
            g.fillStyle(0x1c1310, 1);
            g.fillRect(0, 0, 360, 360);
            g.fillStyle(0x241813, 1);
            g.fillRect(0, 0, 360, 60);
            g.lineStyle(2, 0x3a2a20, 1);
            for (let i = 0; i < 360; i += 40) g.lineBetween(i, 0, i, 360);
            // 悬灯绳
            g.lineStyle(2, 0x4a3a2a, 1);
            g.lineBetween(180, 0, 180, 56);
        }
        /* 角色：玩家 + 接头人（复用基类水墨小人画法） */
        makePersons() {
            const mk = (robe: number, gx: number, gy: number) => {
                const c = this.add.container(0, 0).setDepth(7);
                const g = this.add.graphics();
                c.add(g);
                this.drawPerson(g, robe);
                const p = this.iso.isoPx(gx, gy);
                c.setPosition(p.x, p.y);
                return { c, g };
            };
            const pl = mk(0x4a6fa5, 4, 4);
            this.player = pl.c;
            this.pg = pl.g;
            const ct = mk(0x3f8f7a, 0, 4);
            this.contact = ct.c;
            this.cg = ct.g;
        }
        drawPerson(g: any, robe: number) {
            this.drawInkPerson(g, robe);
        }
        updatePerson(c: any, time: number) {
            if (!c) return;
            const bob = this.walking ? Math.sin(time / 70) * 2 : 0;
            c.list[0].y = bob;
            c.scaleX = this.faceDir;
        }

        makeProps() {
            this.pool = new ObjectPool<any>(
                () => {
                    const c = this.add.container(0, 0).setDepth(6);
                    const g = this.add.graphics();
                    c.add(g);
                    return c;
                },
                (c: any) => c.setVisible(false)
            );
            this.syncProps();
        }
        syncProps() {
            if (!this.pool) return;
            this.draggables = [];
            this.pool.releaseAll();
            const items: { id: string; gxf: number; gyf: number; kind: string }[] = [
                ...seatsOf(this.world).map((s: any) => ({ id: s.id, gxf: s.data.gxf, gyf: s.data.gyf, kind: 'seat' })),
                { id: 'cup', gxf: cupOf(this.world).data.gxf, gyf: cupOf(this.world).data.gyf, kind: 'cup' }
            ];
            items.forEach((it) => {
                const c = this.pool.acquire();
                const p = this.iso.isoPx(it.gxf, it.gyf);
                c.setPosition(p.x, p.y).setVisible(true);
                this.drawProp(c.list[0], it.kind);
                this.draggables.push({ id: it.id, c });
            });
        }
        drawProp(g: any, kind: string) {
            g.clear();
            if (kind === 'seat') {
                g.fillStyle(0x000000, 0.2);
                g.fillEllipse(0, 6, 22, 9);
                g.fillStyle(0x6b4a32, 1);
                g.fillPoints([{ x: -16, y: 0 }, { x: 0, y: 8 }, { x: 16, y: 0 }, { x: 0, y: -8 }], true);
                g.fillStyle(0x8a6240, 1);
                g.fillCircle(0, -2, 9);
            } else {
                // 茶杯
                g.fillStyle(0x000000, 0.2);
                g.fillEllipse(0, 5, 16, 7);
                g.fillStyle(0xe9e2d2, 1);
                g.fillPoints([{ x: -9, y: -8 }, { x: 9, y: -8 }, { x: 7, y: 4 }, { x: -7, y: 4 }], true);
                g.fillStyle(0xb9b09c, 1);
                g.fillEllipse(0, -8, 18, 6);
                g.fillStyle(0x6b4a2a, 1);
                g.fillRect(8, -3, 6, 2);
            }
        }

        onPointerDown(p: any) {
            const x = p.x;
            const y = p.y;
            const t = this.tool();
            if (t === 'hand') {
                let hit: any = null;
                for (const d of this.draggables) {
                    if (Math.hypot(x - d.c.x, y - d.c.y) < 30) {
                        hit = d;
                        break;
                    }
                }
                if (hit) this.dragging = { id: hit.id, c: hit.c, offX: x - hit.c.x, offY: y - hit.c.y };
                else this.flash('切到「手」才能挪动茶具');
                return;
            }
            if (t === 'lamp') this.hooks.onToggleLantern();
            else if (t === 'shutter') this.hooks.onToggleWindow();
            else if (t === 'person') this.hooks.onSummon();
        }
        onPointerMove(p: any) {
            if (!this.dragging) return;
            const x = p.x - this.dragging.offX;
            const y = p.y - this.dragging.offY;
            const g = this.iso.isoInvert(x, y);
            const gxf = Math.max(0.3, Math.min(this.iso.N - 1.3, g.gx));
            const gyf = Math.max(0.3, Math.min(this.iso.N - 1.3, g.gy));
            const o = this.world.get(this.dragging.id);
            if (o) {
                o.data.gxf = gxf;
                o.data.gyf = gyf;
            }
            const pos = this.iso.isoPx(gxf, gyf);
            this.dragging.c.x = pos.x;
            this.dragging.c.y = pos.y;
        }
        onPointerUp(_p: any) {
            if (!this.dragging) return;
            const id = this.dragging.id;
            const o = this.world.get(id);
            if (o) {
                const snap = id.indexOf('seat') === 0 ? Math.round : (v: number) => Math.round(v * 2) / 2;
                const gxf = Math.max(0, Math.min(this.iso.N - 1, snap(o.data.gxf)));
                const gyf = Math.max(0, Math.min(this.iso.N - 1, snap(o.data.gyf)));
                o.data.gxf = gxf;
                o.data.gyf = gyf;
                const pos = this.iso.isoPx(gxf, gyf);
                this.dragging.c.x = pos.x;
                this.dragging.c.y = pos.y;
            }
            this.tweens.add({ targets: this.dragging.c, scaleX: 1.15, scaleY: 0.82, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
            this.dragging = null;
        }

        /* 召唤接头人：暗号对 → 落座交信；错两次 → 灯笼碎 */
        summonContact() {
            const w = this.world;
            if (w.get('contact').state === 'arrived') {
                this.flash('接头人已落座');
                return;
            }
            if (w.get('lantern').state === 'broken') {
                this.flash('灯笼已碎，无法接头');
                return;
            }
            if (isSafeSignal(w)) {
                const seat = this.iso.isoPx(2, 1);
                this.walkTo(this.contact, seat.x, seat.y);
                arriveContact(w);
                this.flash('接头人见暗号无误，落座交付密信');
            } else {
                this.summonTries++;
                if (this.summonTries >= 2) {
                    compromise(w);
                    this.flash('暗号连错两次，巡街破门——灯笼被击碎！');
                } else {
                    this.flash(`暗号未对上，接头人未现身（再错 1 次将暴露）`);
                }
            }
        }

        walkTo(c: any, x: number, y: number): Promise<void> {
            return new Promise((resolve) => {
                const dx = x - c.x;
                const dy = y - c.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 2) {
                    resolve();
                    return;
                }
                this.walking = true;
                this.faceDir = dx < 0 ? -1 : 1;
                const dur = Math.min(1400, dist * 4.5);
                this.tweens.add({ targets: c, x, y, duration: dur, ease: 'Sine.easeInOut', onComplete: () => { this.walking = false; resolve(); } });
            });
        }

        resetScene() {
            resetTeahouse(this.world, this.time.now);
            this.summonTries = 0;
            this.draggables = [];
            this.syncProps();
            const door = this.iso.isoPx(0, 4);
            this.contact.setPosition(door.x, door.y);
            this.flash('茶馆已重置');
        }

        render(time: number) {
            this.dyn.clear();
            this.drawWindow();
            this.drawLantern();
            this.drawTable();
            this.updatePerson(this.player, time);
            this.updatePerson(this.contact, time);
        }

        drawWindow() {
            const g = this.dyn;
            // 后墙窗洞
            g.fillStyle(0x0b1622, 1);
            g.fillRect(110, 90, 140, 110);
            g.lineStyle(6, 0x3a2a20, 1);
            g.strokeRect(110, 90, 140, 110);
            if (windowOf(this.world).state === 'open') {
                // 夜街微光
                g.fillStyle(0x16314a, 1);
                g.fillRect(116, 96, 128, 98);
                g.fillStyle(0xf0d68a, 0.5);
                g.fillCircle(150, 150, 4);
                g.fillCircle(210, 140, 3);
            } else {
                // 窗棂
                g.lineStyle(3, 0x6b4a32, 1);
                g.lineBetween(180, 90, 180, 200);
                g.lineBetween(110, 145, 250, 145);
            }
        }
        drawLantern() {
            const g = this.dyn;
            const st = lanternOf(this.world).state;
            if (st === 'lit') {
                g.fillStyle(0xff8a3d, 0.22);
                g.fillCircle(180, 110, 46);
            }
            g.fillStyle(st === 'broken' ? 0x5a5048 : st === 'lit' ? 0xd8472f : 0x7a6a55, 1);
            g.fillEllipse(180, 110, 30, 38);
            g.fillStyle(0x2a1c14, 1);
            g.fillRect(176, 86, 8, 6);
            g.fillRect(176, 128, 8, 6);
            if (st === 'broken') {
                g.lineStyle(2, 0x1a120c, 1);
                g.lineBetween(168, 96, 192, 124);
                g.lineBetween(192, 96, 168, 124);
            } else if (st === 'lit') {
                g.fillStyle(0xffe6a0, 0.9);
                g.fillEllipse(180, 110, 14, 20);
            }
        }
        drawTable() {
            const g = this.dyn;
            const p = this.iso.isoPx(2, 2);
            g.fillStyle(0x000000, 0.25);
            g.fillEllipse(p.x, p.y + 6, 60, 24);
            g.fillStyle(0x7a5230, 1);
            g.fillPoints([{ x: p.x - 34, y: p.y }, { x: p.x, y: p.y - 17 }, { x: p.x + 34, y: p.y }, { x: p.x, y: p.y + 17 }], true);
            g.fillStyle(0x9a6a40, 1);
            g.fillPoints([{ x: p.x - 30, y: p.y - 4 }, { x: p.x, y: p.y - 19 }, { x: p.x + 30, y: p.y - 4 }, { x: p.x, y: p.y + 11 }], true);
        }
    };
}

/* ── 页面逻辑 ── */
const hooks = {
    onSceneReady(scene: any) {
        sceneRef.value = scene;
    },
    onToggleLantern() {
        toggleLantern(world);
    },
    onToggleWindow() {
        toggleWindow(world);
    },
    onSummon() {
        sceneRef.value?.summonContact();
    }
};

async function bootGame() {
    if (game) return;
    const el = (gameContainer.value as any)?.$el ?? gameContainer.value ?? document.querySelector('.stage');
    if (!el) return;
    const Phaser = (await import('phaser')).default;
    const hasArt = await probeArt();
    const TeahouseScene = makeTeahouseScene(Phaser);
    game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: el,
        width: 360,
        height: 600,
        backgroundColor: '#140d0a',
        scene: [TeahouseScene],
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true },
        preBoot: (g: any) => {
            g.registry.set('world', world);
            g.registry.set('hooks', hooks);
            g.registry.set('tool', tool.value);
            g.registry.set('art', hasArt);
        }
    });
}

function doReset() {
    sceneRef.value?.resetScene();
}

onMounted(async () => {
    await nextTick();
    await bootGame();
});
onBeforeUnmount(() => {
    game?.destroy(true);
    game = null;
});
onShow(() => {
    jh.restoreCache();
});
</script>

<style scoped lang="scss">
.page {
    min-height: 100vh;
    background: linear-gradient(180deg, #1a120e 0%, #0e0a08 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20rpx 24rpx 40rpx;
    box-sizing: border-box;
}
.topbar {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 12rpx;
}
.seal {
    width: 64rpx;
    height: 64rpx;
    border-radius: 12rpx;
    background: #9e2b25;
    color: #f3e9cf;
    font-size: 36rpx;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.4);
}
.title {
    color: #f3e9cf;
    font-size: 32rpx;
    font-weight: 800;
    margin-top: 10rpx;
}
.sub {
    color: #b9a98f;
    font-size: 22rpx;
    margin-top: 4rpx;
}
.stage {
    width: 360px;
    height: 600px;
    max-width: 92vw;
    border-radius: 16rpx;
    overflow: hidden;
    box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.5);
    background: #140d0a;
}
.signal {
    display: flex;
    gap: 12rpx;
    margin: 14rpx 0 6rpx;
    flex-wrap: wrap;
    justify-content: center;
}
.s-item {
    font-size: 22rpx;
    color: #8c7d68;
    background: rgba(255, 255, 255, 0.04);
    border: 1rpx solid rgba(255, 255, 255, 0.1);
    padding: 6rpx 14rpx;
    border-radius: 999rpx;
}
.s-item.on {
    color: #0e0a08;
    background: #e8c9a0;
    border-color: #e8c9a0;
    font-weight: 700;
}
.tools {
    display: flex;
    gap: 16rpx;
    margin-top: 8rpx;
}
.tool {
    width: 96rpx;
    height: 96rpx;
    border-radius: 16rpx;
    background: rgba(255, 255, 255, 0.05);
    border: 1rpx solid rgba(255, 255, 255, 0.12);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #d9c8a8;
    font-size: 34rpx;
}
.tool .tl {
    font-size: 18rpx;
    color: #9c8c74;
    margin-top: 4rpx;
}
.tool.on {
    background: #9e2b25;
    border-color: #9e2b25;
    color: #ffeccf;
}
.hint {
    color: #b9a98f;
    font-size: 22rpx;
    margin: 10rpx 0;
    text-align: center;
    max-width: 92vw;
}
.panel {
    margin-top: 10rpx;
    width: 92vw;
    background: rgba(20, 14, 10, 0.7);
    border: 1rpx solid rgba(255, 255, 255, 0.1);
    border-radius: 16rpx;
    padding: 18rpx 20rpx;
}
.panel.ok {
    border-color: rgba(63, 143, 122, 0.5);
}
.panel.seized {
    border-color: rgba(158, 43, 37, 0.6);
}
.info-t {
    display: block;
    color: #f3e9cf;
    font-size: 26rpx;
    font-weight: 700;
    margin-bottom: 8rpx;
}
.info-t.good {
    color: #7fe0c0;
}
.info-t.bad {
    color: #ff9a8f;
}
.info-r {
    display: block;
    color: #c8b89c;
    font-size: 22rpx;
    margin-top: 4rpx;
}
.btn {
    margin-top: 14rpx;
    border-radius: 12rpx;
    font-size: 24rpx;
    padding: 14rpx 0;
}
.btn.ghost {
    background: transparent;
    border: 1rpx solid rgba(232, 201, 160, 0.5);
    color: #e8c9a0;
}
.foot {
    margin-top: 16rpx;
    color: #7a6e5a;
    font-size: 20rpx;
    text-align: center;
}
</style>
