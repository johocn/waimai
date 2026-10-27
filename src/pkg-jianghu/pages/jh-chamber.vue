<template>
    <view class="page">
        <view class="topbar">
            <view class="seal">舵</view>
            <text class="title">总舵密室 · 机关锁</text>
            <text class="sub">拨暗数 · 点壁炬 · 错三次即机簧封室</text>
        </view>

        <div ref="gameContainer" class="stage"></div>

        <!-- 当前机关状态 -->
        <view class="signal">
            <text class="s-item">机关盘：{{ comboText }}</text>
            <text class="s-item" :class="{ on: allLit }">壁炬：{{ litText }}</text>
            <text class="s-item" :class="{ on: matched }">暗数：{{ matched ? '已对上' : '未齐' }}</text>
        </view>

        <!-- 工具 -->
        <view class="tools">
            <view class="tool" :class="{ on: tool === 'hand' }" @tap="setTool('hand')"><text>手</text><text class="tl">挪石墩</text></view>
            <view class="tool" :class="{ on: tool === 'dial' }" @tap="setTool('dial')"><text>拨</text><text class="tl">转机关盘</text></view>
            <view class="tool" :class="{ on: tool === 'torch' }" @tap="setTool('torch')"><text>炬</text><text class="tl">点壁炬</text></view>
            <view class="tool" :class="{ on: tool === 'open' }" @tap="setTool('open')"><text>开</text><text class="tl">启石门</text></view>
        </view>
        <text class="hint">{{ toolHint }}</text>

        <!-- 信息面板 -->
        <view class="panel" v-if="phase === 'idle'">
            <text class="info-t">与总舵约定的机关暗数：东二 · 南四 · 西一（盘序从左到右）。</text>
            <text class="info-r">用「拨」点机关盘使其 +1（0~5 循环），拨到暗数后用「开」启石门取密令。</text>
            <text class="info-r">错三次 → 机簧触发，密室封锁，须重置。</text>
        </view>
        <view class="panel ok" v-else-if="phase === 'revealed'">
            <text class="info-t good">石门开启 · 密令现世</text>
            <text class="info-r">机关咬合无误，密匣弹开：总舵令已取。声望 +20。</text>
            <button class="btn ghost" @tap="doReset">再探一次</button>
        </view>
        <view class="panel seized" v-else-if="phase === 'sprung'">
            <text class="info-t bad">机簧触发 · 密室封锁</text>
            <text class="info-r">连错三次，暗簧射出，密室被锁死。总舵警戒提升。</text>
            <button class="btn ghost" @tap="doReset">重置密室再探</button>
        </view>

        <view class="foot">规则：机关暗数 + 错时开室 + 错三次即被机簧封锁</view>
    </view>
</template>

<script setup lang="ts">
import { ref, reactive, computed, shallowRef, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { onShow as uniOnShow } from '@dcloudio/uni-app';
import { useJianghuStore } from '../../stores/jianghu';
import type { SceneWorld } from '../scene/world';
import { moveBlock } from '../scene/world';
import {
    createHQChamberWorld,
    doorOf,
    dialsOf,
    trapOf,
    secretOf,
    comboMatch,
    rotateDial,
    toggleTorch,
    springTrap,
    openChamber,
    resetChamber,
    DIAL_MAX,
    SECRET_COMBO
} from '../scene/chamber';
import { probeArt } from '../scene/assets';
import { ObjectPool } from '../scene/pool';
import { createJianghuIsoScene } from '../scene/JianghuIsoScene';

const jh = useJianghuStore();
void uniOnShow;

/* ── 工具 ── */
type Tool = 'hand' | 'dial' | 'torch' | 'open';
const tool = ref<Tool>('hand');
function setTool(t: Tool) {
    tool.value = t;
    game?.registry?.set('tool', t);
}
const toolHint = computed(
    () =>
        ({
            hand: '拖拽石墩压住地面机括（演示交互；挪开则回弹）。',
            dial: '点击机关盘：顺时针 +1（0~5 循环）。',
            torch: '点击壁炬：灭 ↔ 亮。点亮双炬是开室的仪式。',
            open: '机关暗数对上后，点此启石门；错三次即机簧封室。'
        }[tool.value])
);

/* ── 场景世界 ── */
const world = reactive(createHQChamberWorld(0)) as SceneWorld;
const doorState = computed(() => doorOf(world).state);
const trapState = computed(() => trapOf(world).state);
const secretState = computed(() => secretOf(world).state);
const dialValues = computed(() => dialsOf(world).map((d: any) => d.data.value));
const comboText = computed(() => dialValues.value.map((v: number) => '甲乙丙丁戊己'.charAt(v) || v).join(' · '));
const allLit = computed(() => world.objects['torch-1'].state === 'lit' && world.objects['torch-2'].state === 'lit');
const litText = computed(() => (allLit.value ? '双炬齐明' : '未齐'));
const matched = computed(() => comboMatch(world));
const phase = computed(() => (secretState.value === 'revealed' ? 'revealed' : trapState.value === 'sprung' ? 'sprung' : 'idle'));

/* ── Phaser 场景 ── */
const gameContainer = ref<HTMLElement | null>(null);
const sceneRef = shallowRef<any>(null);
let game: any = null;

function makeChamberScene(Phaser: any) {
    return class ChamberScene extends createJianghuIsoScene(Phaser) {
        bgColor = '#0a0a0e';
        world: any;
        hooks: any;
        dragging: any = null;
        walking = false;
        faceDir = 1;
        attempts = 0;
        player: any = null;
        pg: any = null;
        blockC: any = null;
        dialPos: { x: number; y: number }[] = [];
        torches: { id: string; x: number; y: number }[] = [
            { id: 'torch-1', x: 56, y: 100 },
            { id: 'torch-2', x: 304, y: 100 }
        ];
        doorX = 180;
        doorY = 150;

        constructor() {
            super('ch');
        }

        build() {
            this.drawBg();
            this.bakeFloor(0x2b2f38, 0x252932);
            this.dialPos = dialsOf(this.world).map((d: any) => this.iso.isoPx(d.data.gxf, d.data.gyf));
            this.makePlayer();
            this.makeBlock();
        }

        /* 背景：石壁 */
        drawBg() {
            const g = this.bg;
            g.fillStyle(0x171a22, 1);
            g.fillRect(0, 0, 360, 360);
            g.fillStyle(0x20242e, 1);
            g.fillRect(0, 0, 360, 70);
            g.lineStyle(2, 0x2c313d, 1);
            for (let i = 0; i < 360; i += 48) g.lineBetween(i, 0, i, 360);
            for (let j = 0; j < 360; j += 60) g.lineBetween(0, j, 360, j);
        }
        makePlayer() {
            const c = this.add.container(0, 0).setDepth(7);
            const g = this.add.graphics();
            c.add(g);
            this.drawPerson(g, 0x4a6fa5);
            const p = this.iso.isoPx(4, 4);
            c.setPosition(p.x, p.y);
            this.player = c;
            this.pg = g;
        }
        drawPerson(g: any, robe: number) {
            this.drawInkPerson(g, robe);
        }
        makeBlock() {
            const c = this.add.container(0, 0).setDepth(6);
            const g = this.add.graphics();
            c.add(g);
            this.drawBlock(g);
            const b = blockOf(this.world);
            const p = this.iso.isoPx(b.data.gxf, b.data.gyf);
            c.setPosition(p.x, p.y);
            this.blockC = c;
        }
        drawBlock(g: any) {
            g.clear();
            g.fillStyle(0x000000, 0.25);
            g.fillEllipse(0, 6, 28, 12);
            g.fillStyle(0x54504a, 1);
            g.fillPoints([{ x: -24, y: 0 }, { x: 0, y: 14 }, { x: 0, y: 40 }, { x: -24, y: 26 }], true);
            g.fillStyle(0x67625a, 1);
            g.fillPoints([{ x: 24, y: 0 }, { x: 0, y: 14 }, { x: 0, y: 40 }, { x: 24, y: 26 }], true);
            g.fillStyle(0x8a857c, 1);
            g.fillPoints([{ x: 0, y: -14 }, { x: 24, y: 0 }, { x: 0, y: 14 }, { x: -24, y: 0 }], true);
        }

        onPointerDown(p: any) {
            const x = p.x;
            const y = p.y;
            const t = this.tool();
            if (t === 'hand') {
                if (Math.hypot(x - this.blockC.x, y - this.blockC.y) < 34) {
                    this.dragging = { offX: x - this.blockC.x, offY: y - this.blockC.y };
                } else this.flash('切到「手」才能挪动石墩');
                return;
            }
            if (t === 'dial') {
                for (let i = 0; i < this.dialPos.length; i++) {
                    if (Math.hypot(x - this.dialPos[i].x, y - this.dialPos[i].y) < 30) {
                        this.hooks.onRotateDial('dial-' + (i + 1));
                        return;
                    }
                }
                this.flash('点中机关盘才能拨动');
                return;
            }
            if (t === 'torch') {
                for (const to of this.torches) {
                    if (Math.hypot(x - to.x, y - to.y) < 28) {
                        this.hooks.onToggleTorch(to.id);
                        return;
                    }
                }
                this.flash('点中壁炬才能点亮');
                return;
            }
            if (t === 'open') this.hooks.onAttemptOpen();
        }
        onPointerMove(p: any) {
            if (!this.dragging) return;
            const x = p.x - this.dragging.offX;
            const y = p.y - this.dragging.offY;
            const g = this.iso.isoInvert(x, y);
            const gxf = Math.max(0.4, Math.min(this.iso.N - 1.4, g.gx));
            const gyf = Math.max(0.4, Math.min(this.iso.N - 1.4, g.gy));
            moveBlock(this.world, 'block', gxf, gyf);
            const pos = this.iso.isoPx(gxf, gyf);
            this.blockC.x = pos.x;
            this.blockC.y = pos.y;
        }
        onPointerUp(_p: any) {
            if (!this.dragging) return;
            const b = blockOf(this.world);
            const gxf = Math.max(0, Math.min(this.iso.N - 1, Math.round(b.data.gxf)));
            const gyf = Math.max(0, Math.min(this.iso.N - 1, Math.round(b.data.gyf)));
            moveBlock(this.world, 'block', gxf, gyf);
            const pos = this.iso.isoPx(gxf, gyf);
            this.blockC.x = pos.x;
            this.blockC.y = pos.y;
            this.tweens.add({ targets: this.blockC, scaleX: 1.18, scaleY: 0.8, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
            this.dragging = null;
        }

        attemptOpen() {
            const w = this.world;
            if (doorOf(w).state === 'open') {
                this.flash('石门已开');
                return;
            }
            if (trapOf(w).state === 'sprung') {
                this.flash('机簧已触发，密室封锁');
                return;
            }
            if (comboMatch(w)) {
                openChamber(w);
                this.flash('机关咬合，石门隆隆开启——密令现世');
            } else {
                this.attempts++;
                if (this.attempts >= 3) {
                    springTrap(w);
                    this.flash('连错三次，机簧触发——密室封锁！');
                } else {
                    this.flash(`机关不认，石门纹丝不动（再错 ${3 - this.attempts} 次将触发机簧）`);
                }
            }
        }

        resetScene() {
            resetChamber(this.world, this.time.now);
            this.attempts = 0;
            const b = blockOf(this.world);
            const p = this.iso.isoPx(b.data.gxf, b.data.gyf);
            this.blockC.setPosition(p.x, p.y);
            this.flash('密室已重置');
        }

        render(time: number) {
            const bob = this.walking ? Math.sin(time / 70) * 2 : 0;
            this.pg.y = bob;
            this.player.scaleX = this.faceDir;
            this.dyn.clear();
            this.drawDoor();
            this.drawDials();
            this.drawTorches();
            this.drawSecret();
        }

        drawDoor() {
            const g = this.dyn;
            const x = this.doorX;
            const y = this.doorY;
            if (doorOf(this.world).state === 'open') {
                g.fillStyle(0x05060a, 1);
                g.fillRect(x - 44, y - 60, 88, 120);
                g.fillStyle(0x3a2f22, 1);
                g.fillRect(x - 50, y - 66, 100, 8);
            } else {
                g.fillStyle(0x3b3f4a, 1);
                g.fillRect(x - 44, y - 60, 88, 120);
                g.fillStyle(0x4a4f5c, 1);
                g.fillRect(x - 38, y - 54, 76, 108);
                g.lineStyle(3, 0x2a2e38, 1);
                g.strokeRect(x - 38, y - 54, 76, 108);
                g.lineStyle(2, 0x2a2e38, 1);
                g.lineBetween(x, y - 54, x, y + 54);
                g.fillStyle(0xc8a24a, 1);
                g.fillCircle(x, y + 20, 5);
            }
        }
        drawDials() {
            const g = this.dyn;
            dialsOf(this.world).forEach((d: any, i: number) => {
                const p = this.dialPos[i];
                g.fillStyle(0x000000, 0.3);
                g.fillEllipse(p.x, p.y + 4, 30, 12);
                g.fillStyle(0x6b5236, 1);
                g.fillEllipse(p.x, p.y, 26, 13);
                g.fillStyle(0x2c2620, 1);
                g.fillCircle(p.x, p.y - 6, 18);
                g.fillStyle(0x4a4036, 1);
                g.fillCircle(p.x, p.y - 6, 15);
                // 指针
                const ang = (d.data.value / DIAL_MAX) * Math.PI * 2 - Math.PI / 2;
                g.lineStyle(3, 0xe8c9a0, 1);
                g.lineBetween(p.x, p.y - 6, p.x + Math.cos(ang) * 12, p.y - 6 + Math.sin(ang) * 12);
            });
        }
        drawTorches() {
            const g = this.dyn;
            this.torches.forEach((to) => {
                const lit = this.world.get(to.id).state === 'lit';
                g.fillStyle(0x3a2a1c, 1);
                g.fillRect(to.x - 3, to.y, 6, 26);
                if (lit) {
                    g.fillStyle(0xff8a3d, 0.25);
                    g.fillCircle(to.x, to.y - 6, 24);
                    g.fillStyle(0xffb24a, 1);
                    g.fillTriangle(to.x - 6, to.y, to.x + 6, to.y, to.x, to.y - 20);
                    g.fillStyle(0xffe6a0, 1);
                    g.fillTriangle(to.x - 3, to.y, to.x + 3, to.y, to.x, to.y - 12);
                } else {
                    g.fillStyle(0x55504a, 1);
                    g.fillCircle(to.x, to.y - 4, 5);
                }
            });
        }
        drawSecret() {
            if (secretOf(this.world).state !== 'revealed') return;
            const g = this.dyn;
            const x = this.doorX;
            const y = this.doorY + 70;
            g.fillStyle(0xffe6a0, 0.3);
            g.fillCircle(x, y, 26);
            g.fillStyle(0x9e2b25, 1);
            g.fillRect(x - 18, y - 12, 36, 24);
            g.fillStyle(0xe8c9a0, 1);
            g.fillRect(x - 14, y - 8, 28, 16);
            g.fillStyle(0xc8a24a, 1);
            g.fillCircle(x, y, 4);
        }
    };
}

/* ── 页面逻辑 ── */
const hooks = {
    onSceneReady(scene: any) {
        sceneRef.value = scene;
    },
    onRotateDial(id: string) {
        rotateDial(world, id);
    },
    onToggleTorch(id: string) {
        toggleTorch(world, id);
    },
    onAttemptOpen() {
        sceneRef.value?.attemptOpen();
    }
};

async function bootGame() {
    if (game) return;
    const el = (gameContainer.value as any)?.$el ?? gameContainer.value ?? document.querySelector('.stage');
    if (!el) return;
    const Phaser = (await import('phaser')).default;
    const hasArt = await probeArt();
    const ChamberScene = makeChamberScene(Phaser);
    game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: el,
        width: 360,
        height: 600,
        backgroundColor: '#0a0a0e',
        scene: [ChamberScene],
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
uniOnShow(() => {
    jh.restoreCache();
});
</script>

<style scoped lang="scss">
.page {
    min-height: 100vh;
    background: linear-gradient(180deg, #14141a 0%, #0a0a0e 100%);
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
    background: #4a3b6b;
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
    background: #0a0a0e;
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
    background: #4a3b6b;
    border-color: #4a3b6b;
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
