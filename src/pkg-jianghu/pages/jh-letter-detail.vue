<template>
    <view class="jh">
        <EmptyState v-if="!task" text="密信不存在或已被接走" buttonText="返回江湖大厅" @action="back" />

        <template v-else>
            <view class="lv">
                <text class="pill" :class="pillCls(task.level)">{{ levelText(task.level) }}</text>
                <text class="lv-d">{{ task.verifyMode === 'ORDER_BIND' ? '绑定真实急单 · 送达即核销' : '当面核销 · 暗号 60 秒有效' }}</text>
            </view>

            <!-- 密函：未接取显示密文，接取后可翻转看明文 -->
            <view class="envelope" :class="{ flipped }" @tap="onEnvelopeTap">
                <view class="face front">
                    <text class="face-k">拾 光 密 函</text>
                    <text class="face-t">{{ task.title }}</text>
                    <text class="face-hint">{{ taken ? '— 轻触启封，查看密语 —' : '— 接取后方可启封 —' }}</text>
                </view>
                <view class="face back">
                    <text class="face-k gold">密 语</text>
                    <text class="cipher">{{ task.plainText || '（密文未下发）' }}</text>
                    <text class="face-note">此语只可当面口述，不可落于文字</text>
                </view>
            </view>

            <!-- 收信人线索 -->
            <view class="card npc">
                <view class="av">{{ (task.targetNick || '某')[0] }}</view>
                <view class="npc-b">
                    <text class="npc-n">收信人 · {{ task.targetNick || '江湖同袍' }}</text>
                    <text class="npc-d">常在 <text class="b">{{ task.targetBuilding || task.buildingCode }}</text> 出没</text>
                    <text class="npc-tip">线索仅显示楼阁，不暴露具体位置与真实姓名</text>
                </view>
            </view>

            <!-- 核销区 -->
            <view class="sec"><text class="sec-h">当面核销</text><text class="sec-m" v-if="taken">剩余 {{ codeLeft }} 秒</text></view>
            <view class="card verify">
                <template v-if="!isOrderBind">
                    <view class="vtabs">
                        <view class="vtab" :class="{ on: mode === 'CODE' }" @tap="mode = 'CODE'">口令</view>
                        <view class="vtab" :class="{ on: mode === 'QR' }" @tap="mode = 'QR'">扫码</view>
                        <view class="vtab" :class="{ on: mode === 'LBS' }" @tap="mode = 'LBS'">打卡</view>
                    </view>

                    <view v-if="mode === 'CODE'" class="vp">
                        <input class="code-input" v-model="code" type="text" maxlength="6" placeholder="请输入 6 位暗号" />
                        <text class="vp-m">请让收信人输入你出示的 6 位暗号</text>
                        <text class="vp-demo" v-if="demoCode">演示暗号：{{ demoCode }}（mock 环境专用）</text>
                        <text class="vp-try" v-if="tryCount">已试错 {{ tryCount }} 次，上限 3 次</text>
                    </view>
                    <view v-else-if="mode === 'QR'" class="vp">
                        <view class="qr-box"><text class="qr-t">江湖码</text></view>
                        <text class="vp-m">请收信人出示江湖码，扫码即核销</text>
                    </view>
                    <view v-else class="vp">
                        <view class="map-box"><view class="pin"></view></view>
                        <text class="vp-m">进入 {{ task.buildingCode }} 100 米围栏后可打卡核销</text>
                    </view>
                </template>
                <view v-else class="vp bind">
                    <text class="vp-m">本密信绑定真实急单 {{ task.boundOrderId }}，送达后由系统自动核销。</text>
                    <text class="vp-m">点击下方「模拟送达核销」即可在本演示中完成。</text>
                </view>

                <button v-if="!taken" class="btn primary" @tap="take">接取密信 · 锁定 15 分钟</button>
                <template v-else>
                    <button class="btn primary" :disabled="verifying" @tap="doVerify">{{ verifyBtnText }}</button>
                    <button class="btn ghost" @tap="release">放弃密信（信用分 -1）</button>
                </template>
            </view>
        </template>

        <!-- 结算弹层 -->
        <view v-if="settle" class="settle" @tap="closeSettle">
            <view class="scroll" @tap.stop>
                <text class="s-cap">密 信 已 送 达</text>
                <text class="s-num">+{{ settle.deltaRep }}</text>
                <text class="s-txt">{{ settle.rankUp ? '晋升 ' + settle.rankName : '江湖声望' }}</text>
                <view class="s-bar"><view class="s-bar-in" :style="{ width: progress + '%' }"></view></view>
                <view class="s-bar-txt">
                    <text>{{ prevName }}</text>
                    <text>{{ nextName || '百晓生' }}</text>
                </view>
                <button class="btn primary" @tap="closeSettle">收 下 声 望</button>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { useJianghuStore } from '../../stores/jianghu';
import { jianghuDemoCode } from '../../api/queries/jianghu';
import EmptyState from '../../components/EmptyState.vue';
import type { JianghuLevel, JianghuTask, JianghuVerifyResult } from '../../types/jianghu';

const jh = useJianghuStore();
const task = ref<JianghuTask | null>(null);
const flipped = ref(false);
const mode = ref<'CODE' | 'QR' | 'LBS'>('CODE');
const code = ref('');
const verifying = ref(false);
const settle = ref<JianghuVerifyResult | null>(null);
const demoCode = jianghuDemoCode();
const codeLeft = ref(60);
let timer: any = null;

const taken = computed(() => task.value?.status === 'TAKEN');
const tryCount = computed(() => task.value?.tryCount ?? 0);
const progress = computed(() => jh.progressPct);
const prevName = computed(() => jh.prevTier?.name || '布衣闲人');
const nextName = computed(() => jh.nextTier?.name || '');
const isOrderBind = computed(() => task.value?.verifyMode === 'ORDER_BIND');
const verifyBtnText = computed(() => {
    const r = task.value?.rewardRep ?? 0;
    return (isOrderBind.value ? '模拟送达核销' : '确认核销') + ' · 声望 +' + r;
});

const levelMap: Record<JianghuLevel, string> = { NORMAL: '普通信', URGENT: '加急密函', SECRET: '绝密卷宗' };
function levelText(l: JianghuLevel) { return levelMap[l] || '密信'; }
function pillCls(l: JianghuLevel) { return l === 'SECRET' ? 'p-gold' : l === 'URGENT' ? 'p-cin' : 'p-jade'; }

onLoad(async (options: any) => {
    const id: string = options?.id || '';
    if (!id) {
        if (!jh.tasks.length) await jh.loadHall().catch(() => {});
        task.value = jh.tasks[0] || null;
    } else {
        task.value = await jh.openTask(id).catch(() => null);
    }
    if (!task.value) return;
});

onUnload(() => { clearInterval(timer); });

function startCountdown() {
    clearInterval(timer);
    codeLeft.value = 60;
    timer = setInterval(() => {
        codeLeft.value -= 1;
        if (codeLeft.value <= 0) clearInterval(timer);
    }, 1000);
}

function onEnvelopeTap() {
    if (!taken.value) {
        uni.showToast({ title: '接取后方可启封', icon: 'none' });
        return;
    }
    flipped.value = !flipped.value;
}

async function take() {
    if (!task.value) return;
    if (jh.frozen) return uni.showToast({ title: jh.frozenReason, icon: 'none' });
    try {
        task.value = await jh.takeTask(task.value.id);
        flipped.value = true;
        startCountdown();
        uni.showToast({ title: '密信已入怀', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '接取失败').slice(0, 30), icon: 'none' });
    }
}

async function release() {
    if (!task.value) return;
    await jh.releaseTask(task.value.id).catch(() => {});
    uni.showToast({ title: '已放弃密信，信用分 -1', icon: 'none' });
    back();
}

async function doVerify() {
    if (!task.value) return;
    // 绑定真实急单：送达即核销，无需暗号/坐标
    if (isOrderBind.value) {
        verifying.value = true;
        try {
            const res = await jh.verify(task.value.id);
            finishVerify(res);
        } catch (e: any) {
            uni.showToast({ title: (e?.message || '核销失败').slice(0, 30), icon: 'none' });
        } finally {
            verifying.value = false;
        }
        return;
    }
    if (mode.value === 'CODE' && code.value.length !== 6) {
        return uni.showToast({ title: '请输入 6 位暗号', icon: 'none' });
    }
    verifying.value = true;
    try {
        let lat: number | undefined;
        let lng: number | undefined;
        if (mode.value === 'LBS') {
            const loc = await uni.getLocation({ type: 'gcj02' }).catch(() => null);
            lat = loc ? (loc as any).latitude : undefined;
            lng = loc ? (loc as any).longitude : undefined;
        }
        const res = await jh.verify(task.value.id, mode.value === 'CODE' ? code.value : undefined, lat, lng);
        finishVerify(res);
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '核销失败').slice(0, 30), icon: 'none' });
    } finally {
        verifying.value = false;
    }
}

function finishVerify(res: JianghuVerifyResult) {
    if (!res.ok) {
        if (task.value) task.value.tryCount = (task.value.tryCount ?? 0) + 1;
        return uni.showToast({ title: res.message || '核销失败', icon: 'none' });
    }
    settle.value = res;
    clearInterval(timer);
}

function closeSettle() {
    settle.value = null;
    jh.loadRecords().catch(() => {});
    back();
}

function back() { uni.navigateBack({ delta: 1 }); }
</script>

<style scoped lang="scss">
.jh { padding: 24rpx; padding-bottom: 60rpx; }
.lv { display: flex; align-items: center; gap: 16rpx; margin-bottom: 20rpx; }
.lv-d { font-size: 22rpx; color: $jh-ink-2; }
.pill { font-size: 22rpx; padding: 6rpx 16rpx; border-radius: 999rpx; font-weight: 600; }
.p-jade { background: rgba(31, 111, 92, .12); color: $jh-jade; }
.p-cin { background: rgba(178, 58, 46, .12); color: $jh-cinnabar; }
.p-gold { background: rgba(200, 162, 74, .2); color: #8a6b1f; }

.envelope { height: 360rpx; perspective: 1400rpx; margin-bottom: 24rpx; }
.envelope .face {
    position: absolute; left: 24rpx; right: 24rpx; height: 360rpx; border-radius: 24rpx; padding: 40rpx 32rpx;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    backface-visibility: hidden; transition: transform .6s ease;
}
.face.front {
    background: linear-gradient(150deg, #e9dfc8, #f6f1e7 60%, #e6dcc4);
    border: 1rpx solid rgba(178, 58, 46, .25);
}
.face.back {
    background: linear-gradient(150deg, #221e19, #1f1b16); color: #f2ece1;
    transform: rotateY(180deg); border: 1rpx solid rgba(200, 162, 74, .35);
}
.envelope.flipped .face.front { transform: rotateY(180deg); }
.envelope.flipped .face.back { transform: rotateY(0deg); }
.face-k { font-size: 24rpx; letter-spacing: 6rpx; color: $jh-ink-2; }
.face-k.gold { color: $jh-gold-l; }
.face-t { font-size: 40rpx; font-weight: 700; margin-top: 16rpx; color: $jh-ink; }
.face-hint { font-size: 22rpx; color: $jh-cinnabar; margin-top: 60rpx; }
.cipher { font-size: 36rpx; line-height: 1.8; margin-top: 20rpx; text-align: center; }
.face-note { font-size: 22rpx; color: #b9b1a4; margin-top: 32rpx; }

.card { background: $surface; border-radius: 20rpx; padding: 24rpx; box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06); }
.npc { display: flex; align-items: center; margin-bottom: 8rpx; }
.av {
    width: 88rpx; height: 88rpx; border-radius: 50%; margin-right: 20rpx; text-align: center; line-height: 88rpx;
    background: linear-gradient(140deg, #ddd3c0, #c3b7a0); color: $jh-ink-2; font-size: 34rpx; font-weight: 700;
}
.npc-b { flex: 1; display: flex; flex-direction: column; }
.npc-n { font-size: 30rpx; font-weight: 700; color: $jh-ink; }
.npc-d { font-size: 24rpx; color: $jh-ink-2; margin-top: 8rpx; }
.npc-d .b { color: $jh-ink; font-weight: 600; }
.npc-tip { font-size: 20rpx; color: $jh-ink-2; margin-top: 8rpx; }

.sec { display: flex; justify-content: space-between; align-items: baseline; margin: 32rpx 4rpx 16rpx; }
.sec-h { font-size: 32rpx; font-weight: 700; color: $jh-ink; }
.sec-m { font-size: 22rpx; color: $jh-cinnabar; }
.verify { padding: 28rpx; }
.vtabs { display: flex; gap: 12rpx; margin-bottom: 24rpx; }
.vtab {
    flex: 1; text-align: center; padding: 16rpx 0; border-radius: 16rpx; font-size: 26rpx; font-weight: 600;
    background: $jh-paper; color: $jh-ink-2;
}
.vtab.on { background: linear-gradient(140deg, #2a2621, #1f1b16); color: $jh-gold-l; }
.vp { display: flex; flex-direction: column; align-items: center; padding: 8rpx 0 16rpx; }
.vp.bind { align-items: flex-start; text-align: left; }
.code-input {
    width: 100%; height: 96rpx; text-align: center; font-size: 44rpx; letter-spacing: 12rpx; font-weight: 700;
    background: $jh-paper; border-radius: 16rpx; color: $jh-cinnabar;
}
.vp-m { font-size: 22rpx; color: $jh-ink-2; margin-top: 16rpx; }
.vp-demo { font-size: 22rpx; color: $jh-jade; margin-top: 12rpx; }
.vp-try { font-size: 22rpx; color: $jh-cinnabar; margin-top: 8rpx; }
.qr-box {
    width: 260rpx; height: 260rpx; border-radius: 24rpx; background: $jh-ink; color: $jh-gold-l;
    display: flex; align-items: center; justify-content: center; font-size: 28rpx;
}
.map-box {
    width: 100%; height: 260rpx; border-radius: 24rpx; background: $jh-paper;
    display: flex; align-items: center; justify-content: center;
}
.pin { width: 32rpx; height: 32rpx; border-radius: 50%; background: $jh-cinnabar; }

.btn { margin-top: 20rpx; border-radius: 16rpx; font-size: 30rpx; font-weight: 700; }
.btn.primary { background: linear-gradient(140deg, $jh-cinnabar, #8f2b21); color: #fff; }
.btn.ghost { background: $surface; color: $jh-ink-2; border: 1rpx solid $border-color; }
.btn[disabled] { opacity: .5; }

.settle {
    position: fixed; left: 0; right: 0; top: 0; bottom: 0; background: rgba(14, 17, 22, .62);
    display: flex; align-items: center; justify-content: center; z-index: 99;
}
.scroll {
    width: 600rpx; border-radius: 32rpx; padding: 60rpx 44rpx; text-align: center; color: #f2ece1;
    background: linear-gradient(160deg, #2a2621, #1f1b16 60%, #3a2a20);
}
.s-cap { font-size: 24rpx; color: $jh-gold-l; letter-spacing: 6rpx; }
.s-num { display: block; font-size: 96rpx; font-weight: 700; color: $jh-gold-l; margin: 16rpx 0; }
.s-txt { font-size: 30rpx; }
.s-bar { height: 16rpx; border-radius: 8rpx; background: rgba(255, 255, 255, .14); margin: 32rpx 0 12rpx; overflow: hidden; }
.s-bar-in { height: 100%; background: linear-gradient(90deg, $jh-gold, $jh-gold-l); transition: width .9s ease; }
.s-bar-txt { display: flex; justify-content: space-between; font-size: 22rpx; color: #cfc7b8; }
</style>
