<template>
    <view class="dd">
        <view class="topbar">
            <text class="title">北山老树 · 死信箱</text>
            <text class="sub">Phaser 互动场景 · 直接点/拖场景里的实物（树/石墩/标记石/凉亭）</text>
        </view>

        <view class="scene-wrap">
            <div ref="gameContainer" class="stage"></div>
        </view>

        <!-- 工具盘 -->
        <view class="tools">
            <view class="tool" :class="{ on: tool === 'hand' }" @tap="setTool('hand')">
                <text class="t-ic">✋</text><text class="t-tx">手·挪动</text>
            </view>
            <view class="tool" :class="{ on: tool === 'knife' }" @tap="setTool('knife')">
                <text class="t-ic">🔪</text><text class="t-tx">刀·剥皮</text>
            </view>
            <view class="tool" :class="{ on: tool === 'envelope' }" @tap="setTool('envelope')">
                <text class="t-ic">✉️</text><text class="t-tx">信封·藏信</text>
            </view>
            <view class="tool" :class="{ on: tool === 'stone' }" @tap="setTool('stone')">
                <text class="t-ic">🪨</text><text class="t-tx">石子·标记</text>
            </view>
            <view class="tool" :class="{ on: tool === 'person' }" @tap="setTool('person')">
                <text class="t-ic">🚶</text><text class="t-tx">人·走动</text>
            </view>
        </view>
        <view class="tool-hint">{{ toolHint }}</view>

        <!-- 背包 -->
        <view class="bag">
            <view class="bag-btn" @tap="bagOpen = !bagOpen">🎒 背包</view>
            <view class="bag-panel" v-if="bagOpen">
                <view class="bag-item" @tap="callScene('useKnifeFromPack')">🔪 刀（剥树皮）</view>
                <view class="bag-item" @tap="callScene('useTwigFromPack')">🌿 枝条（藏情报）</view>
                <text class="bag-n">角色会自动走到树前执行：先取刀剥皮，再取枝条藏入树洞。</text>
            </view>
        </view>

        <!-- 场景对象演示（实例化 + 可修复/不可修复） -->
        <view class="demo">
            <text class="demo-t">场景对象演示</text>
            <view class="demo-btns">
                <view class="dbtn" @tap="callScene('fellTree')">砍倒大树</view>
                <view class="dbtn" @tap="callScene('burnPavilion')">焚毁凉亭</view>
                <view class="dbtn" @tap="callScene('rebuildPavilion')">重建凉亭</view>
                <view class="dbtn ghost" @tap="callScene('resetScene')">重置场景</view>
            </view>
            <text class="demo-n">砍倒的大树 15 秒后自动复原（可修复）；凉亭焚毁后不可自动修复，只能手动重建。</text>
        </view>

        <view class="ribbon">
            <text class="r-l">当前身份：{{ roleText }}</text>
            <text class="r-r" v-if="p">江湖声望 {{ p.rep }}</text>
        </view>

        <!-- IDLE -->
        <view class="panel" v-if="phase === 'IDLE'">
            <text class="p-t">石缝空空。选「信封」工具点树身裂缝/树洞藏情报；或用「刀」先剥开树皮露出树洞再藏（藏得更深）。两人全程不必同时在线。</text>
            <button class="btn primary" @tap="openForm('crack')">填写情报并投放</button>
            <text class="hint">提示：也可直接拿「信封」工具点击画面里的树身。</text>
        </view>

        <!-- PLACED -->
        <view class="panel" v-else-if="phase === 'PLACED'">
            <view class="info">
                <text class="info-t">情报已入暗点 · 你已离场（明文不可回看）</text>
                <text class="info-r">藏处：{{ cavityText }}</text>
                <text class="info-r">标记：{{ drop?.markerText }}（按标记定位石缝）</text>
                <text class="info-r">距可取窗口还有 {{ toPick }}</text>
            </view>
            <button class="btn" @tap="ff(3)">快进到可取窗口（演示）</button>
            <button class="btn ghost" @tap="doReset">重置暗点</button>
        </view>

        <!-- PICKABLE -->
        <view class="panel" v-else-if="phase === 'PICKABLE'">
            <view class="info">
                <text class="info-t">可取窗口已开启 · 上线「云中君」可来取件</text>
                <text class="info-r">标记：{{ drop?.markerText }}（按标记定位石缝）</text>
                <text class="info-r">窗口剩余 {{ winLeft }}</text>
            </view>
            <button class="btn primary" :disabled="acting" @tap="doPickup">以「上线」身份取出密文</button>
            <button class="btn ghost" @tap="ff(31)">模拟超时（演示巡查截获）</button>
        </view>

        <!-- PICKED -->
        <view class="panel" v-else-if="phase === 'PICKED'">
            <view class="info">
                <text class="info-t">情报已被取走 · 取件人 {{ drop?.pickedBy }}</text>
            </view>
            <view class="cipher" v-if="pickedPlain">
                <text class="c-h">解密后的情报原文</text>
                <text class="c-b">{{ pickedPlain }}</text>
            </view>
            <button class="btn primary" :disabled="acting" @tap="doDeliver">流转至交通站 → 总舵核验</button>
        </view>

        <!-- SEIZED -->
        <view class="panel seized" v-else-if="phase === 'SEIZED'">
            <text class="info-t bad">情报被巡逻人员取走 · 任务失败</text>
            <text class="info-r">投放人安全值下降，任务暂时锁定。</text>
            <button class="btn ghost" @tap="doReset">重置暗点再试</button>
        </view>

        <!-- 投放表单 -->
        <view class="sheet" v-if="showForm" @tap.self="showForm = false">
            <view class="sheet-card">
                <text class="s-t">投放情报</text>
                <input class="inp" v-model="form.topic" placeholder="情报主题（如：城商行理财收益）" />
                <textarea class="area" v-model="form.plainText" placeholder="录入情报原文，落库即加密，前端只持密文" />
                <text class="s-l">留下标记（上线按此定位石缝）</text>
                <view class="marks">
                    <view v-for="m in markList" :key="m.k" class="mark" :class="{ on: form.marker === m.k }" @tap="form.marker = m.k">
                        <text>{{ m.t }}</text>
                    </view>
                </view>
                <text class="s-l">藏匿位置：{{ form.cavity === 'hollow' ? '树洞（更深，难被发现）' : '树身裂缝' }}</text>
                <view class="sheet-btns">
                    <button class="btn ghost" @tap="showForm = false">取消</button>
                    <button class="btn primary" :disabled="acting" @tap="doPlace">确认投放</button>
                </view>
            </view>
        </view>

        <view class="foot">规则：时间锁 + 投放后不可回看 + 标记错置无法识别 + 超时被巡查截获</view>
    </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import { useJianghuStore } from '../../stores/jianghu';
import type { DeadDropMarker } from '../../types/jianghu';

const jh = useJianghuStore();
const p = computed(() => jh.profile);
const drop = computed(() => jh.deadDrop);
const phase = computed(() => jh.deadDrop?.phase ?? 'IDLE');

const showForm = ref(false);
const acting = ref(false);
const pickedPlain = ref('');
const form = ref<{ topic: string; plainText: string; marker: DeadDropMarker; cavity: 'crack' | 'hollow' }>({
    topic: '',
    plainText: '',
    marker: 'E',
    cavity: 'crack'
});

const markList = [
    { k: 'E' as DeadDropMarker, t: '石子朝东' },
    { k: 'W' as DeadDropMarker, t: '石子朝西' },
    { k: 'S' as DeadDropMarker, t: '石子朝南' },
    { k: 'N' as DeadDropMarker, t: '石子朝北' }
];

const phaseLabel = computed(
    () =>
        ({
            IDLE: '空信箱',
            PLACED: '已投放',
            PICKABLE: '可取窗',
            PICKED: '已取走',
            SEIZED: '已截获'
        }[phase.value])
);

const roleText = computed(() => {
    switch (phase.value) {
        case 'IDLE':
        case 'PLACED':
            return '投递人（你）';
        case 'PICKABLE':
        case 'PICKED':
            return '上线 · 云中君';
        default:
            return '—';
    }
});
const cavityText = computed(() => (form.value.cavity === 'hollow' ? '树洞（已剥皮露出）' : '树身裂缝'));

function fmtMin(diffMs: number): string {
    const m = Math.max(0, Math.ceil(diffMs / 60000));
    return m + ' 分钟';
}
const toPick = computed(() => (drop.value ? fmtMin(new Date(drop.value.pickableFrom).getTime() - new Date(jh.ddNowIso).getTime()) : ''));
const winLeft = computed(() => (drop.value ? fmtMin(new Date(drop.value.pickableTo).getTime() - new Date(jh.ddNowIso).getTime()) : ''));

/* ── 动作 ── */
function openForm(cavity: 'crack' | 'hollow') {
    form.value.cavity = cavity;
    showForm.value = true;
}
async function doPlace() {
    if (!form.value.topic.trim() || !form.value.plainText.trim()) {
        return uni.showToast({ title: '请填写主题与情报原文', icon: 'none' });
    }
    acting.value = true;
    try {
        await jh.placeDeadDrop({ topic: form.value.topic, plainText: form.value.plainText, marker: form.value.marker });
        S.topic = form.value.topic;
        S.letterCavity = form.value.cavity;
        if (!S.marker) S.marker = { gx: 3, gy: 3, orient: form.value.marker };
        else S.marker.orient = form.value.marker;
        showForm.value = false;
        form.value = { topic: '', plainText: '', marker: 'E', cavity: 'crack' };
        uni.showToast({ title: '情报已入暗点，已离场', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '投放失败').slice(0, 30), icon: 'none' });
    } finally {
        acting.value = false;
    }
}
async function doPickup() {
    acting.value = true;
    try {
        const r = await jh.pickupDeadDrop();
        pickedPlain.value = r.plainText;
        uni.showToast({ title: '取件成功 +' + r.rewardRep + ' 声望', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '取件失败').slice(0, 30), icon: 'none' });
    } finally {
        acting.value = false;
    }
}
async function doDeliver() {
    acting.value = true;
    try {
        const r = await jh.deliverDeadDrop();
        uni.showToast({ title: '已抵总舵核验 +' + r.rewardRep + ' 声望', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '流转失败').slice(0, 30), icon: 'none' });
    } finally {
        acting.value = false;
    }
}
async function ff(min: number) {
    await jh.fastForwardDeadDrop(min);
}
async function doReset() {
    await jh.resetDeadDrop();
    pickedPlain.value = '';
    S.barkPeeled = false;
    S.letterCavity = 'none';
    S.marker = null;
    S.blocks = [
        { id: 1, gxf: 1, gyf: 3 },
        { id: 2, gxf: 3, gyf: 1 }
    ];
    uni.showToast({ title: '暗点已重置', icon: 'none' });
}

/* ── 工具 ── */
type Tool = 'hand' | 'knife' | 'envelope' | 'stone' | 'person';
const tool = ref<Tool>('hand');
function setTool(t: Tool) {
    tool.value = t;
}
const bagOpen = ref(false);
const toolHint = computed(
    () =>
        ({
            hand: '拖拽石墩：挪开可露出下方湿土（可临时藏物）；把石墩压到标记石上则上线难寻。',
            knife: '点击树身上的树皮块，用刀剥开露出树洞，情报可藏得更深。',
            envelope: '点击树身裂缝（或已剥开的树洞）塞入信封，藏好情报。',
            stone: '点击空地放下标记石；再次点同一格循环朝向：东→南→西→北。',
            person: '点地面让角色走过去；点树则走到树前。再从背包取刀/枝条执行动作。'
        }[tool.value])
);

/* ── 场景本地交互状态（Phaser 每帧读取） ── */
const S = reactive({
    barkPeeled: false,
    topic: '',
    letterCavity: 'none' as 'none' | 'crack' | 'hollow',
    blocks: [
        { id: 1, gxf: 1, gyf: 3 },
        { id: 2, gxf: 3, gyf: 1 }
    ] as { id: number; gxf: number; gyf: number }[],
    marker: null as null | { gx: number; gy: number; orient: DeadDropMarker }
});

const MARK_DIR: Record<DeadDropMarker, [number, number]> = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] };
function nextOrient(o: DeadDropMarker): DeadDropMarker {
    return o === 'E' ? 'S' : o === 'S' ? 'W' : o === 'W' ? 'N' : 'E';
}
function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
}

/* ── Phaser 场景 ── */
const gameContainer = ref<HTMLElement | null>(null);
const sceneRef = shallowRef<any>(null);
let game: any = null;

function makeDeadDropScene(Phaser: any) {
    return class DeadDropScene extends Phaser.Scene {
    S: any;
    hooks: any;
    t: Tool = 'hand';
    // 等距投影参数
    TILE_W = 64;
    TILE_H = 32;
    N = 5;
    CX = 180;
    BASE_Y = 380;
    // 树身部件中心（设计坐标）
    BARK = { x: 165, y: 268 };
    CRACK = { x: 188, y: 272 };
    HOLLOW = { x: 180, y: 262 };

    dyn!: any;
    bg!: any;
    flashText!: any;
    blocks: { id: number; c: any }[] = [];
    dragging: any = null;

    treeState: 'healthy' | 'felled' | 'recovering' = 'healthy';
    felledAt = 0;
    recoverMs = 15000;
    prevBark = false;
    pavState: 'ok' | 'ruined' = 'ok';

    // 角色
    player: any = null;
    pg: any = null;
    kg: any = null;
    tg: any = null;
    holding: 'knife' | 'twig' | null = null;
    walking = false;
    faceDir = 1;
    busy = false;
    treeStand = { x: 180, y: 330 };

    constructor() {
        super('dd');
    }

    create() {
        this.S = this.registry.get('S');
        this.hooks = this.registry.get('hooks');
        this.t = (this.registry.get('tool') as Tool) || 'hand';

        this.cameras.main.setBackgroundColor('#0a1422');
        this.bg = this.add.graphics().setDepth(0);
        this.drawBg();

        this.dyn = this.add.graphics().setDepth(2);

        // 凉亭（实例化对象示例）
        this.pav = this.add.graphics().setDepth(1);
        this.pavX = 300;
        this.pavY = 330;

        // 石墩（可拖拽实例化对象）
        this.S.blocks.forEach((b: any) => this.makeBlock(b));

        // 角色（可走动虚拟形象）
        this.createPlayer();

        // 统一用场景级指针事件做命中（规避 uniapp H5 下容器 setInteractive 失灵）
        this.dragging = null;
        this.input.on('pointerdown', (p: any) => this.onPointerDown(p));
        this.input.on('pointermove', (p: any) => this.onPointerMove(p));
        this.input.on('pointerup', (p: any) => this.onPointerUp(p));
        this.input.on('pointerupoutside', (p: any) => this.onPointerUp(p));

        this.flashText = this.add
            .text(180, 525, '', { fontFamily: 'sans-serif', fontSize: '14px', color: '#f3e9cf', align: 'center' })
            .setOrigin(0.5)
            .setDepth(20);
        this.flashTimer = 0;

        this.hooks.onSceneReady(this);
    }

    // 等距投影
    isoPx(gx: number, gy: number) {
        return { x: this.CX + (gx - gy) * (this.TILE_W / 2), y: this.BASE_Y + (gx + gy) * (this.TILE_H / 2) };
    }
    isoInvert(px: number, py: number) {
        const dx = px - this.CX;
        const dy = py - this.BASE_Y;
        return { gx: (dx / (this.TILE_W / 2) + dy / (this.TILE_H / 2)) / 2, gy: (dy / (this.TILE_H / 2) - dx / (this.TILE_W / 2)) / 2 };
    }
    validCell(gx: number, gy: number) {
        if (gx < 0 || gx > this.N - 1 || gy < 0 || gy > this.N - 1) return false;
        if (Math.round(gx) === 2 && Math.round(gy) === 2) return false;
        for (const b of this.S.blocks) if (Math.round(b.gxf) === Math.round(gx) && Math.round(b.gyf) === Math.round(gy)) return false;
        return true;
    }

    makeBlock(b: any) {
        const c = this.add.container(0, 0).setDepth(6);
        const g = this.add.graphics();
        c.add(g);
        c.setData('id', b.id);
        const pos = this.isoPx(b.gxf, b.gyf);
        c.x = pos.x;
        c.y = pos.y;
        this.drawBlock(g);
        this.blocks.push({ id: b.id, c });
    }
    drawBlock(g: any) {
        g.clear();
        g.fillStyle(0x54504a, 1);
        g.fillPoints([{ x: -24, y: 0 }, { x: 0, y: 14 }, { x: 0, y: 40 }, { x: -24, y: 26 }], true);
        g.fillStyle(0x67625a, 1);
        g.fillPoints([{ x: 24, y: 0 }, { x: 0, y: 14 }, { x: 0, y: 40 }, { x: 24, y: 26 }], true);
        g.fillStyle(0x8a857c, 1);
        g.fillPoints([{ x: 0, y: -14 }, { x: 24, y: 0 }, { x: 0, y: 14 }, { x: -24, y: 0 }], true);
        g.fillStyle(0x000000, 0.18);
        g.fillEllipse(0, 6, 28, 12);
    }

    onPointerDown(p: any) {
        const x = p.x;
        const y = p.y;
        if (this.t === 'hand') {
            let hit: any = null;
            for (const bk of this.blocks) {
                if (Math.hypot(x - bk.c.x, y - bk.c.y) < 34) {
                    hit = bk;
                    break;
                }
            }
            if (hit) {
                this.dragging = { id: hit.id, c: hit.c, offX: x - hit.c.x, offY: y - hit.c.y };
            } else {
                this.flash('切到「手」工具才能挪动石墩');
            }
            return;
        }
        if (this.t === 'knife' || this.t === 'envelope') {
            this.hitTree(x, y);
            return;
        }
        if (this.t === 'stone') {
            if (y < 300) return;
            const g = this.isoInvert(x, y);
            const gx = Math.round(g.gx);
            const gy = Math.round(g.gy);
            if (!this.validCell(gx, gy)) {
                this.flash('这里不能摆放标记石');
                return;
            }
            this.hooks.onGroundTap(gx, gy);
        }
        if (this.t === 'person') {
            if (Math.hypot(x - 180, y - 280) < 80) {
                this.walkTo(this.treeStand.x, this.treeStand.y);
            } else if (y >= 300) {
                const g = this.isoInvert(x, y);
                const pos = this.isoPx(clamp(g.gx, 0, this.N - 1), clamp(g.gy, 0, this.N - 1));
                this.walkTo(pos.x, pos.y);
            }
        }
    }
    hitTree(x: number, y: number) {
        const dB = Math.hypot(x - this.BARK.x, y - this.BARK.y);
        const dC = Math.hypot(x - this.CRACK.x, y - this.CRACK.y);
        const dH = Math.hypot(x - this.HOLLOW.x, y - this.HOLLOW.y);
        const m = Math.min(dB, dC, dH);
        if (m > 28) {
            this.flash('这里没有可互动的树身部件');
            return;
        }
        const part = m === dB ? 'bark' : m === dC ? 'crack' : 'hollow';
        this.hooks.onTreePart(part);
    }
    onPointerMove(p: any) {
        if (!this.dragging) return;
        const x = p.x - this.dragging.offX;
        const y = p.y - this.dragging.offY;
        const g = this.isoInvert(x, y);
        const b = this.S.blocks.find((z: any) => z.id === this.dragging.id);
        if (b) {
            b.gxf = clamp(g.gx, 0.4, this.N - 1.4);
            b.gyf = clamp(g.gy, 0.4, this.N - 1.4);
            const pos = this.isoPx(b.gxf, b.gyf);
            this.dragging.c.x = pos.x;
            this.dragging.c.y = pos.y;
        }
    }
    onPointerUp(_p: any) {
        if (!this.dragging) return;
        const b = this.S.blocks.find((z: any) => z.id === this.dragging.id);
        if (b) {
            b.gxf = clamp(Math.round(b.gxf), 0, this.N - 1);
            b.gyf = clamp(Math.round(b.gyf), 0, this.N - 1);
            if (b.gxf === 2 && b.gyf === 2) b.gyf = 3;
            const pos = this.isoPx(b.gxf, b.gyf);
            this.dragging.c.x = pos.x;
            this.dragging.c.y = pos.y;
        }
        this.dragging = null;
        this.flash('你挪开了石墩');
    }

    flash(msg: string) {
        this.flashText.setText(msg);
        this.flashTimer = this.time.now + 2400;
    }

    // 可修复演示
    fellTree() {
        if (this.treeState !== 'healthy') return;
        this.treeState = 'felled';
        this.felledAt = this.time.now;
        this.flash('大树被砍倒（演示：15 秒后自动复原）');
    }
    burnPavilion() {
        if (this.pavState === 'ruined') return;
        this.pavState = 'ruined';
        this.flash('凉亭被焚毁——不可修复，只能手动重建');
    }
    rebuildPavilion() {
        this.pavState = 'ok';
        this.flash('凉亭已重建');
    }
    resetScene() {
        this.treeState = 'healthy';
        this.pavState = 'ok';
        this.S.blocks = [
            { id: 1, gxf: 1, gyf: 3 },
            { id: 2, gxf: 3, gyf: 1 }
        ];
        this.S.marker = null;
        this.blocks.forEach((bk) => {
            const b = this.S.blocks.find((x: any) => x.id === bk.id);
            if (b) {
                const pos = this.isoPx(b.gxf, b.gyf);
                bk.c.x = pos.x;
                bk.c.y = pos.y;
            }
        });
        this.flash('场景已重置');
    }

    /* ── 角色：走动 / 背包动作序列 ── */
    createPlayer() {
        const start = this.isoPx(0, 4);
        this.player = this.add.container(start.x, start.y).setDepth(7);
        this.pg = this.add.graphics();
        this.player.add(this.pg);
        this.kg = this.add.graphics();
        this.player.add(this.kg);
        this.kg.setVisible(false);
        this.tg = this.add.graphics();
        this.player.add(this.tg);
        this.tg.setVisible(false);
        this.drawPlayer();
    }
    drawPlayer() {
        const g = this.pg;
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
        g.fillStyle(0x4a6fa5, 1);
        g.fillRoundedRect(-9, -34, 18, 24, 6);
        g.fillStyle(0xc8a24a, 1);
        g.fillRect(-9, -20, 18, 4);
        g.fillStyle(0xe8c9a0, 1);
        g.fillCircle(0, -40, 7);
        g.fillStyle(0x8a6b3a, 1);
        g.fillTriangle(-12, -44, 12, -44, 0, -54);
        g.lineStyle(4, 0x4a6fa5, 1);
        g.beginPath();
        g.moveTo(-9, -30);
        g.lineTo(-13, -18);
        g.moveTo(9, -30);
        g.lineTo(13, -18);
        g.strokePath();
    }
    drawKnife() {
        const g = this.kg;
        g.clear();
        g.setVisible(true);
        g.fillStyle(0xb8b8c0, 1);
        g.fillRect(11, -22, 3, 12);
        g.fillStyle(0x6b4a2a, 1);
        g.fillRect(10, -12, 5, 4);
    }
    drawTwig() {
        const g = this.tg;
        g.clear();
        g.setVisible(true);
        g.lineStyle(3, 0x6b5236, 1);
        g.beginPath();
        g.moveTo(12, -20);
        g.lineTo(20, -26);
        g.moveTo(12, -20);
        g.lineTo(18, -14);
        g.strokePath();
    }
    setHolding(item: 'knife' | 'twig' | null) {
        this.holding = item;
        this.kg.setVisible(item === 'knife');
        this.tg.setVisible(item === 'twig');
        if (item === 'knife') this.drawKnife();
        if (item === 'twig') this.drawTwig();
    }
    updatePlayer(time: number) {
        if (!this.player) return;
        if (this.walking) {
            this.pg.y = Math.sin(time / 70) * 2;
            this.kg.y = this.pg.y;
            this.tg.y = this.pg.y;
        } else {
            this.pg.y = 0;
            this.kg.y = 0;
            this.tg.y = 0;
        }
        this.player.scaleX = this.faceDir;
    }
    walkTo(x: number, y: number): Promise<void> {
        return new Promise((resolve) => {
            const dx = x - this.player.x;
            const dy = y - this.player.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 2) {
                resolve();
                return;
            }
            this.walking = true;
            this.faceDir = dx < 0 ? -1 : 1;
            const dur = Math.min(1400, dist * 4.5);
            this.tweens.add({
                targets: this.player,
                x,
                y,
                duration: dur,
                ease: 'Sine.InOut',
                onComplete: () => {
                    this.walking = false;
                    resolve();
                }
            });
        });
    }
    wait(ms: number): Promise<void> {
        return new Promise((resolve) => this.time.delayedCall(ms, resolve));
    }
    peelAnim(): Promise<void> {
        return new Promise((resolve) => {
            this.tweens.add({
                targets: this.kg,
                y: this.kg.y - 8,
                duration: 130,
                yoyo: true,
                repeat: 2,
                onComplete: () => resolve()
            });
        });
    }
    hideAnim(): Promise<void> {
        return new Promise((resolve) => {
            this.tweens.add({
                targets: this.tg,
                y: this.tg.y - 28,
                alpha: 0,
                duration: 420,
                onComplete: () => {
                    this.tg.setAlpha(1);
                    resolve();
                }
            });
        });
    }
    async useKnifeFromPack() {
        if (this.busy) {
            this.flash('角色正忙碌');
            return;
        }
        if (this.S.barkPeeled) {
            this.flash('树皮已剥开');
            return;
        }
        this.busy = true;
        this.flash('角色从背包取出刀，走向老树…');
        await this.walkTo(this.treeStand.x, this.treeStand.y);
        this.setHolding('knife');
        await this.wait(220);
        await this.peelAnim();
        this.S.barkPeeled = true;
        this.flash('角色用刀剥开树皮，露出树洞');
        this.setHolding(null);
        this.busy = false;
    }
    async useTwigFromPack() {
        if (this.busy) {
            this.flash('角色正忙碌');
            return;
        }
        if (!this.S.barkPeeled) {
            this.flash('先用刀剥开树皮（从背包取刀）');
            return;
        }
        if (this.S.letterCavity !== 'none') {
            this.flash('已藏有情报');
            return;
        }
        this.busy = true;
        this.flash('角色取出枝条，走向老树…');
        await this.walkTo(this.treeStand.x, this.treeStand.y);
        this.setHolding('twig');
        await this.wait(220);
        await this.hideAnim();
        this.setHolding(null);
        this.S.letterCavity = 'hollow';
        this.flash('枝条已藏入树洞');
        this.busy = false;
        this.hooks.openForm('hollow');
    }

    update(time: number) {
        this.t = (this.registry.get('tool') as Tool) || this.t;

        // 树恢复检测
        if (this.treeState === 'felled' && time - this.felledAt >= this.recoverMs) {
            this.treeState = 'healthy';
            this.flash('大树已自行恢复（可修复对象）');
        }

        this.drawTiles();
        this.drawTree(time);
        this.drawPavilion();
        this.drawMarker();
        this.syncBlocks();
        this.updatePlayer(time);

        if (this.flashTimer && time > this.flashTimer) {
            this.flashText.setText('');
            this.flashTimer = 0;
        }
    }

    drawTiles() {
        const g = this.dyn;
        g.lineStyle(1, 0x789678, 0.18);
        for (let x = 0; x < this.N; x++) {
            for (let y = 0; y < this.N; y++) {
                const pt = this.isoPx(x, y);
                const hi = this.t === 'stone' && this.validCell(x, y);
                g.fillStyle((x + y) % 2 ? 0x465c48 : 0x364a3a, hi ? 0.8 : 0.45);
                g.fillPoints(
                    [
                        { x: pt.x, y: pt.y - 16 },
                        { x: pt.x + 32, y: pt.y },
                        { x: pt.x, y: pt.y + 16 },
                        { x: pt.x - 32, y: pt.y }
                    ],
                    true
                );
                if (hi) {
                    g.lineStyle(2.5, 0xc8a24a, 1);
                    g.strokePoints(
                        [
                            { x: pt.x, y: pt.y - 16 },
                            { x: pt.x + 32, y: pt.y },
                            { x: pt.x, y: pt.y + 16 },
                            { x: pt.x - 32, y: pt.y }
                        ],
                        true
                    );
                    g.lineStyle(1, 0x789678, 0.18);
                }
            }
        }
    }

    drawTree(time: number) {
        const g = this.dyn;
        const pulse = 0.4 + 0.4 * Math.sin(time / 200);
        let scaleY = 1;
        let rot = 0;
        let alpha = 1;
        if (this.treeState === 'felled') {
            scaleY = 0.35;
            rot = -0.35;
            alpha = 0.85;
        }

        // 树根阴影
        g.fillStyle(0x000000, 0.35 * alpha);
        g.fillEllipse(180, 306, 92, 28);

        const cx = 180;
        const cy = 300;
        // 树冠
        g.fillStyle(0x1f3a28, alpha);
        g.fillEllipse(cx, 200, 92, 80);
        g.fillEllipse(cx - 34, 214, 64, 56);
        g.fillEllipse(cx + 34, 214, 64, 56);
        g.fillStyle(0x3f6b46, alpha);
        g.fillEllipse(cx, 190, 60, 52);

        // 树干（用变换模拟倒下）
        const drawTrunk = (ax: number) => {
            g.fillStyle(0x3a2a1c, alpha);
            g.fillPoints(
                [
                    { x: cx - 16 + ax, y: cy },
                    { x: cx - 20 + ax, y: cy - 22 },
                    { x: cx - 12 + ax, y: cy - 52 },
                    { x: cx + 12 + ax, y: cy - 52 },
                    { x: cx + 20 + ax, y: cy - 22 },
                    { x: cx + 16 + ax, y: cy }
                ],
                true
            );
            g.lineStyle(1.4, 0x2a1d12, 0.6 * alpha);
            g.beginPath();
            g.moveTo(cx - 8 + ax, cy - 4);
            g.lineTo(cx - 11 + ax, cy - 50);
            g.moveTo(cx + 8 + ax, cy - 4);
            g.lineTo(cx + 11 + ax, cy - 50);
            g.strokePath();
        };
        if (this.treeState === 'felled') {
            // 倒下的树干（横向）
            g.fillStyle(0x3a2a1c, alpha);
            g.fillRoundedRect(cx - 70, cy - 6, 130, 18, 8);
            g.lineStyle(1.2, 0x2a1d12, 0.6);
            g.strokeRoundedRect(cx - 70, cy - 6, 130, 18, 8);
            g.fillStyle(0x5a4129, 1);
            g.fillCircle(cx - 68, cy + 3, 9);
        } else {
            drawTrunk(0);
        }

        // 裂缝（常驻可投）
        g.lineStyle(7, 0x140e08, 1);
        g.beginPath();
        g.moveTo(this.CRACK.x, this.CRACK.y - 12);
        g.lineTo(this.CRACK.x + 5, this.CRACK.y);
        g.lineTo(this.CRACK.x - 1, this.CRACK.y + 10);
        g.lineTo(this.CRACK.x + 5, this.CRACK.y + 22);
        g.lineTo(this.CRACK.x, this.CRACK.y + 34);
        g.lineTo(this.CRACK.x + 5, this.CRACK.y + 46);
        g.strokePath();

        // 树洞（剥皮后）
        if (this.S.barkPeeled) {
            g.fillStyle(0x0a0705, 1);
            g.fillEllipse(this.HOLLOW.x, this.HOLLOW.y, 26, 36);
            g.fillStyle(0x1a120a, 1);
            g.fillEllipse(this.HOLLOW.x, this.HOLLOW.y + 4, 16, 22);
        }

        // 可剥树皮块
        if (!this.S.barkPeeled) {
            g.fillStyle(0x6b5236, 1);
            g.fillRect(this.BARK.x - 5, this.BARK.y - 15, 10, 30);
            g.lineStyle(1, 0x2a1d12, 1);
            g.strokeRect(this.BARK.x - 5, this.BARK.y - 15, 10, 30);
            g.lineStyle(1, 0x4a3724, 1);
            g.beginPath();
            g.moveTo(this.BARK.x - 3, this.BARK.y - 12);
            g.lineTo(this.BARK.x + 3, this.BARK.y - 12);
            g.moveTo(this.BARK.x - 3, this.BARK.y - 4);
            g.lineTo(this.BARK.x + 3, this.BARK.y - 4);
            g.moveTo(this.BARK.x - 3, this.BARK.y + 4);
            g.lineTo(this.BARK.x + 3, this.BARK.y + 4);
            g.strokePath();
        }

        // 已藏信封
        if (this.S.letterCavity !== 'none') {
            const ex = this.S.letterCavity === 'hollow' ? this.HOLLOW.x : this.CRACK.x + 4;
            const ey = this.S.letterCavity === 'hollow' ? this.HOLLOW.y : this.CRACK.y - 14;
            g.fillStyle(0xefe6cf, 1);
            g.fillRoundedRect(ex - 13, ey - 9, 26, 18, 2);
            g.lineStyle(1, 0xb8a988, 1);
            g.strokeRoundedRect(ex - 13, ey - 9, 26, 18, 2);
            g.beginPath();
            g.moveTo(ex - 13, ey - 9);
            g.lineTo(ex, ey + 2);
            g.lineTo(ex + 13, ey - 9);
            g.strokePath();
        }

        // 工具高亮脉冲
        const ring = (x: number, y: number, on: boolean) => {
            if (!on) return;
            g.lineStyle(2.5, 0xe8d9a0, pulse);
            g.strokeCircle(x, y, 22);
        };
        ring(this.BARK.x, this.BARK.y, this.t === 'knife' && !this.S.barkPeeled);
        ring(this.CRACK.x, this.CRACK.y, this.t === 'envelope' && !this.S.barkPeeled);
        ring(this.HOLLOW.x, this.HOLLOW.y, this.t === 'envelope' && this.S.barkPeeled);
    }

    drawMarker() {
        const g = this.dyn;
        if (!this.S.marker) return;
        const m = this.S.marker;
        const pt = this.isoPx(m.gx, m.gy);
        g.fillStyle(0x8a8378, 1);
        g.fillEllipse(pt.x, pt.y, 18, 12);
        g.lineStyle(1, 0xd8d2c2, 1);
        g.strokeEllipse(pt.x, pt.y, 18, 12);
        const dir = MARK_DIR[m.orient as DeadDropMarker];
        const a = this.isoPx(0, 0);
        const b = this.isoPx(dir[0], dir[1]);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const len = 22;
        const ex = pt.x + Math.cos(ang) * len;
        const ey = pt.y + Math.sin(ang) * len;
        g.lineStyle(3, 0xe8d9a0, 1);
        g.beginPath();
        g.moveTo(pt.x, pt.y);
        g.lineTo(ex, ey);
        g.strokePath();
        g.fillStyle(0xe8d9a0, 1);
        g.fillTriangle(ex, ey, ex - Math.cos(ang - 0.4) * 8, ey - Math.sin(ang - 0.4) * 8, ex - Math.cos(ang + 0.4) * 8, ey - Math.sin(ang + 0.4) * 8);
    }

    drawPavilion() {
        const g = this.pav;
        const x = this.pavX;
        const y = this.pavY;
        g.clear();
        if (this.pavState === 'ok') {
            g.fillStyle(0x3a2a1c, 1);
            g.fillRect(x - 26, y - 30, 6, 40);
            g.fillRect(x + 20, y - 30, 6, 40);
            g.fillRect(x - 10, y - 26, 6, 36);
            g.fillRect(x + 6, y - 26, 6, 36);
            g.fillStyle(0x6b4a2a, 1);
            g.fillTriangle(x - 38, y - 30, x + 38, y - 30, x, y - 64);
            g.fillStyle(0x4a3320, 1);
            g.fillRect(x - 40, y - 34, 80, 6);
        } else {
            // 焚毁：残柱 + 瓦砾
            g.fillStyle(0x2a1d12, 1);
            g.fillRect(x - 24, y + 4, 6, 8);
            g.fillRect(x + 18, y + 2, 6, 10);
            g.fillStyle(0x554a3a, 1);
            g.fillCircle(x - 10, y + 8, 4);
            g.fillCircle(x + 8, y + 10, 3);
            g.fillCircle(x + 2, y + 6, 3);
            g.fillStyle(0x6b4a2a, 0.5);
            g.fillTriangle(x - 14, y - 18, x + 6, y - 18, x - 4, y - 34);
        }
    }

    drawBg() {
        const g = this.bg;
        g.fillStyle(0x0a1422, 1);
        g.fillRect(0, 0, 360, 560);
        g.fillStyle(0xfdf6d8, 1);
        g.fillCircle(300, 64, 20);
        g.fillStyle(0xc9c089, 0.25);
        g.fillCircle(300, 64, 34);
        g.fillStyle(0xffffff, 0.8);
        g.fillCircle(120, 40, 1.4);
        g.fillStyle(0xffffff, 0.7);
        g.fillCircle(210, 30, 1.1);
        g.fillStyle(0x16241c, 0.9);
        g.fillPoints([{ x: 0, y: 250 }, { x: 70, y: 180 }, { x: 140, y: 240 }, { x: 210, y: 170 }, { x: 300, y: 250 }, { x: 360, y: 210 }, { x: 360, y: 300 }, { x: 0, y: 300 }], true);
        g.fillStyle(0x1d2e22, 1);
        g.fillPoints([{ x: 0, y: 300 }, { x: 90, y: 250 }, { x: 180, y: 300 }, { x: 260, y: 255 }, { x: 360, y: 300 }, { x: 360, y: 340 }, { x: 0, y: 340 }], true);
        g.fillStyle(0x243524, 1);
        g.fillRect(0, 300, 360, 260);
        g.fillStyle(0x2c3a2c, 0.25);
        g.fillRect(0, 300, 360, 40);
        // 暗角
        g.fillStyle(0x000000, 0.35);
        g.fillRect(0, 0, 360, 60);
        g.fillRect(0, 500, 360, 60);
    }

    syncBlocks() {
        this.blocks.forEach((bk) => {
            if (this.dragging && this.dragging.id === bk.id) return;
            const b = this.S.blocks.find((x: any) => x.id === bk.id);
            if (b) {
                const pos = this.isoPx(b.gxf, b.gyf);
                bk.c.x = pos.x;
                bk.c.y = pos.y;
            }
        });
        // 手工具时高亮石墩
        const hi = this.t === 'hand';
        this.blocks.forEach((bk) => {
            bk.c.setAlpha(hi ? 1 : 1);
        });
    }
    };
}

/* ── 生命周期 ── */
let timer: any = 0;
onShow(async () => {
    await jh.loadDeadDrop();
    if (drop.value && drop.value.phase !== 'IDLE') {
        S.letterCavity = 'crack';
        S.topic = (drop.value as any).topic || '';
        S.marker = { gx: 3, gy: 3, orient: drop.value.marker };
    }
    timer = setInterval(() => jh.loadDeadDrop().catch(() => {}), 1000);
});
onHide(() => clearInterval(timer));

onMounted(() => {
    (async () => {
        const Phaser = (await import('phaser')).default;
        const DeadDropScene = makeDeadDropScene(Phaser);
        const host: any =
            (gameContainer.value as any)?.$el ?? gameContainer.value ?? (typeof document !== 'undefined' ? document.querySelector('.stage') : null);
        if (!host) {
            uni.showToast({ title: '场景容器未就绪', icon: 'none' });
            return;
        }
        const hooks = {
            onTreePart: (part: 'bark' | 'crack' | 'hollow') => onTreePart(part),
            onGroundTap: (gx: number, gy: number) => onTapGround(gx, gy),
            onSceneReady: (sc: any) => (sceneRef.value = sc),
            openForm: (cavity: 'crack' | 'hollow') => openForm(cavity)
        };
        game = new Phaser.Game({
            type: Phaser.AUTO,
            parent: host,
            width: 360,
            height: 560,
            backgroundColor: '#0a1422',
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH
            },
            scene: [DeadDropScene],
            callbacks: {
                preBoot: (g: any) => {
                    g.registry.set('S', S);
                    g.registry.set('hooks', hooks);
                    g.registry.set('tool', tool.value);
                }
            }
        });
    })();
});

onUnmounted(() => {
    clearInterval(timer);
    if (game) {
        game.destroy(true);
        game = null;
    }
});

/* ── 与场景交互的回调 ── */
function onTreePart(part: 'bark' | 'crack' | 'hollow') {
    if (tool.value === 'knife') {
        if (part === 'bark' && !S.barkPeeled) {
            S.barkPeeled = true;
            sceneRef.value?.flash('你用刀剥开树皮，露出树洞');
        } else sceneRef.value?.flash('用「刀」点击树身上的树皮块');
        return;
    }
    if (tool.value === 'envelope') {
        if (part === 'hollow' && S.barkPeeled) insertTo('hollow');
        else if (part === 'crack') insertTo('crack');
        else sceneRef.value?.flash('用「信封」点击树身裂缝或树洞');
        return;
    }
    sceneRef.value?.flash('选「刀」剥皮或「信封」藏信');
}
function insertTo(cavity: 'crack' | 'hollow') {
    if (S.letterCavity !== 'none') {
        sceneRef.value?.flash('信箱里已有情报');
        return;
    }
    openForm(cavity);
}
function onTapGround(gx: number, gy: number) {
    if (!S.marker) S.marker = { gx, gy, orient: 'E' };
    else if (S.marker.gx === gx && S.marker.gy === gy) S.marker.orient = nextOrient(S.marker.orient);
    else S.marker = { gx, gy, orient: S.marker.orient };
    form.value.marker = S.marker.orient;
    sceneRef.value?.flash('标记石已摆放，朝向：' + ({ E: '东', S: '南', W: '西', N: '北' }[S.marker.orient]));
}

watch(tool, (t) => {
    if (game) game.registry.set('tool', t);
});

function callScene(method: string, ...args: any[]) {
    const sc = sceneRef.value;
    if (sc && typeof sc[method] === 'function') sc[method](...args);
    else uni.showToast({ title: '场景尚未就绪', icon: 'none' });
}
</script>

<style scoped lang="scss">
.dd { padding: 24rpx; padding-bottom: 60rpx; }
.topbar { display: flex; flex-direction: column; margin-bottom: 14rpx; }
.title { font-size: 40rpx; font-weight: 800; color: $jh-ink; letter-spacing: 2rpx; }
.sub { font-size: 22rpx; color: $jh-ink-2; margin-top: 6rpx; }

.scene-wrap { position: relative; border-radius: 24rpx; overflow: hidden; box-shadow: 0 8rpx 24rpx rgba(31, 27, 22, .18); background: #0a1422; }
.stage { width: 100%; height: 560px; }

.tools { display: flex; gap: 12rpx; margin-top: 16rpx; }
.tool {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4rpx; padding: 14rpx 0;
    background: $surface; border-radius: 16rpx; border: 1rpx solid rgba(31, 27, 22, .12);
}
.tool.on { background: rgba(200, 162, 74, .18); border-color: rgba(200, 162, 74, .6); }
.t-ic { font-size: 36rpx; }
.t-tx { font-size: 20rpx; color: $jh-ink-2; }
.tool.on .t-tx { color: #8a6b1f; font-weight: 700; }
.tool-hint { font-size: 21rpx; color: $jh-ink-2; margin: 10rpx 4rpx 0; line-height: 1.6; min-height: 60rpx; }

.bag { margin-top: 12rpx; }
.bag-btn { display: inline-block; font-size: 24rpx; color: $jh-ink; background: $surface; border: 1rpx solid rgba(31,27,22,.14); border-radius: 14rpx; padding: 12rpx 24rpx; }
.bag-panel { margin-top: 12rpx; background: $surface; border-radius: 16rpx; padding: 18rpx 20rpx; display: flex; flex-direction: column; gap: 12rpx; box-shadow: 0 2rpx 10rpx rgba(31,27,22,.06); }
.bag-item { font-size: 26rpx; color: $jh-ink; background: #f3efe7; border: 1rpx solid rgba(31,27,22,.1); border-radius: 12rpx; padding: 16rpx 20rpx; }
.bag-item:active { background: rgba(200,162,74,.18); }
.bag-n { font-size: 20rpx; color: $jh-ink-2; line-height: 1.6; }

.demo { background: rgba(31,27,22,.05); border-radius: 16rpx; padding: 18rpx 20rpx; margin-top: 14rpx; }
.demo-t { font-size: 24rpx; font-weight: 700; color: $jh-ink; }
.demo-btns { display: flex; gap: 12rpx; margin: 12rpx 0 8rpx; flex-wrap: wrap; }
.dbtn { font-size: 22rpx; color: #fff; background: linear-gradient(140deg, #4a443c, #2f2a24); border-radius: 999rpx; padding: 12rpx 22rpx; }
.dbtn.ghost { background: transparent; color: $jh-ink-2; border: 1rpx solid rgba(31,27,22,.18); }
.demo-n { font-size: 20rpx; color: $jh-ink-2; line-height: 1.6; }

.ribbon { display: flex; justify-content: space-between; align-items: center; margin: 16rpx 4rpx; font-size: 24rpx; color: $jh-ink-2; }

.panel {
    background: $surface; border-radius: 20rpx; padding: 28rpx 24rpx; margin-top: 16rpx;
    box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06); display: flex; flex-direction: column; gap: 18rpx;
}
.panel.seized { background: rgba(178, 58, 46, .08); border: 1rpx solid rgba(178, 58, 46, .25); }
.p-t { font-size: 27rpx; color: $jh-ink; line-height: 1.7; }
.hint { font-size: 22rpx; color: $jh-ink-2; }

.info { display: flex; flex-direction: column; gap: 10rpx; }
.info-t { font-size: 28rpx; font-weight: 700; color: $jh-ink; }
.info-t.bad { color: $jh-cinnabar; }
.info-r { font-size: 24rpx; color: $jh-ink-2; }

.cipher { background: rgba(31, 27, 22, .05); border-radius: 16rpx; padding: 20rpx; display: flex; flex-direction: column; gap: 10rpx; }
.c-h { font-size: 22rpx; color: $jh-jade; font-weight: 700; }
.c-b { font-size: 28rpx; color: $jh-ink; line-height: 1.7; }

.btn {
    font-size: 28rpx; font-weight: 700; color: #fff; background: linear-gradient(140deg, #4a443c, #2f2a24);
    border-radius: 999rpx; padding: 20rpx; margin: 0; border: none;
}
.btn.primary { background: linear-gradient(140deg, $jh-cinnabar, #8a2c22); }
.btn.ghost { background: transparent; color: $jh-ink-2; border: 1rpx solid rgba(31, 27, 22, .18); }
.btn[disabled] { opacity: .5; }

.sheet { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: flex; align-items: flex-end; z-index: 50; }
.sheet-card { width: 100%; background: $surface; border-radius: 28rpx 28rpx 0 0; padding: 32rpx 28rpx calc(32rpx + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 18rpx; }
.s-t { font-size: 32rpx; font-weight: 800; color: $jh-ink; }
.inp, .area {
    width: 100%; box-sizing: border-box; background: #f3efe7; border-radius: 16rpx; padding: 20rpx;
    font-size: 27rpx; color: $jh-ink; border: 1rpx solid rgba(31, 27, 22, .1);
}
.area { height: 160rpx; }
.s-l { font-size: 24rpx; color: $jh-ink-2; margin-top: 6rpx; }
.marks { display: flex; gap: 14rpx; }
.mark {
    flex: 1; text-align: center; font-size: 24rpx; color: $jh-ink-2; padding: 18rpx 0; border-radius: 14rpx;
    background: #f3efe7; border: 1rpx solid rgba(31, 27, 22, .1);
}
.mark.on { background: rgba(200, 162, 74, .2); color: #8a6b1f; border-color: rgba(200, 162, 74, .5); font-weight: 700; }
.sheet-btns { display: flex; gap: 16rpx; margin-top: 8rpx; }
.sheet-btns .btn { flex: 1; }

.foot { margin-top: 24rpx; font-size: 20rpx; color: $jh-ink-2; line-height: 1.7; text-align: center; }
</style>
