<template>
    <view class="jh">
        <!-- 序：交代设计目的与玩法，不强制切入剧情 -->
        <view class="preface">
            <text class="pre-cap">拾光传信者 · 江湖志</text>
            <text class="pre-t">为什么骑手要有一个「江湖」？</text>
            <text class="pre-p"><text class="b">设计目的：</text>把跑腿送外卖包装成有温度的「传信江湖」，提升骑手履约幸福感与留存；声望只记荣誉，永不兑现金。</text>
            <text class="pre-p"><text class="b">一句话玩法：</text>接密信 → 找收信人 → 当面传密语 → 双向暗号核销（或绑定真实急单·送达即核销）→ 声望晋升段位。</text>
            <text class="pre-p pre-foot">你接的每封密信，背后都是一个真实同学的牵挂；你写下的每句心声，都会沉淀为江湖的下一卷。</text>
        </view>

        <!-- 章节：按段位门槛渐进解锁（伏笔在章末） -->
        <view class="sec"><text class="sec-h">江湖六卷</text><text class="sec-m">随段位徐徐展开</text></view>
        <view v-for="ch in chapters" :key="ch.id" class="chapter" :class="{ locked: !isUnlocked(ch) }">
            <view class="ch-head">
                <view class="ch-no">卷{{ ch.no }}</view>
                <view class="ch-h-b">
                    <text class="ch-title">{{ ch.title }}</text>
                    <text class="ch-sub">{{ ch.subtitle }}</text>
                </view>
            </view>
            <block v-if="isUnlocked(ch)">
                <text v-for="(p, i) in ch.paragraphs" :key="i" class="ch-p">{{ p }}</text>
                <view v-if="ch.takeaway" class="ch-mark"><text class="ch-mark-k">落点</text><text class="ch-mark-v">{{ ch.takeaway }}</text></view>
                <view v-if="ch.foreshadow" class="ch-shadow">伏笔 · {{ ch.foreshadow }}</view>
            </block>
            <view v-else class="ch-lock">
                <text class="lock-ico">锁</text>
                <text class="lock-txt">晋升至【{{ ch.unlockRankName }}】解锁此卷</text>
            </view>
        </view>

        <!-- 玩家心声：期待 / 玩法 / 建议 -->
        <view class="sec"><text class="sec-h">玩家心声</text><text class="sec-m">你的期待就是方向</text></view>
        <view class="voice-card">
            <view class="vtabs">
                <view class="vtab" :class="{ on: voiceKind === 'EXPECT' }" @tap="voiceKind = 'EXPECT'">期待</view>
                <view class="vtab" :class="{ on: voiceKind === 'PLAY' }" @tap="voiceKind = 'PLAY'">玩法</view>
                <view class="vtab" :class="{ on: voiceKind === 'SUGGEST' }" @tap="voiceKind = 'SUGGEST'">建议</view>
            </view>
            <textarea class="voice-input" v-model="voiceText" maxlength="200" placeholder="说点什么：你期待江湖变成什么样？哪段玩法最打动你？有什么建议？" />
            <button class="btn primary" :disabled="submitting" @tap="submitVoice">{{ submitting ? '送达中…' : '留下心声' }}</button>
        </view>

        <view v-if="voices.length" class="voice-list">
            <view v-for="v in voices" :key="v.id" class="voice-item" :class="{ done: v.precipitated }">
                <text class="vi-tag" :class="'t-' + v.kind">{{ v.kindText }}</text>
                <text v-if="v.precipitated" class="vi-done">已采纳 ✓</text>
                <text class="vi-c">{{ v.content }}</text>
                <text class="vi-t">{{ fmt(v.createdAt) }}</text>
            </view>
        </view>

        <!-- 沉淀的客户需求：心声聚合 → 未来方向 -->
        <view class="sec"><text class="sec-h">沉淀的需求</text><text class="sec-m">来自真实心声</text></view>
        <view class="demand-list">
            <view v-for="d in demands" :key="d.id" class="demand">
                <view class="dm-b">
                    <text class="dm-tag">{{ d.tag }}</text>
                    <text class="dm-t">{{ d.text }}</text>
                </view>
                <text class="dm-votes">{{ d.votes }} 人同感</text>
            </view>
        </view>

        <!-- 江湖札记：你自己的送达与成长轨迹，让声望有来处 -->
        <view class="sec"><text class="sec-h">江湖札记</text><text class="sec-m">你写下的每一笔</text></view>
        <view class="log">
            <view v-for="r in records" :key="r.id" class="log-item">
                <view class="log-l"><text class="log-dot"></text></view>
                <view class="log-b">
                    <text class="log-t">{{ r.reasonText }}</text>
                    <text class="log-m">声望 +{{ r.deltaRep }} · 累计 {{ r.snapshotRep }} · {{ fmt(r.createdAt) }}</text>
                </view>
            </view>
            <EmptyState v-if="!records.length" text="尚未留下痕迹，去送一封信吧" />
        </view>
    </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useJianghuStore } from '../../stores/jianghu';
import type { JianghuChapter, VoiceKind } from '../../types/jianghu';

const jh = useJianghuStore();
const chapters = computed(() => jh.chapters);
const voices = computed(() => jh.voices);
const demands = computed(() => jh.demands);
const records = computed(() => jh.records);

const voiceKind = ref<VoiceKind>('EXPECT');
const voiceText = ref('');
const submitting = ref(false);

/** 段位门槛：Lx 字符串同序可比（L1<L3<…<L9） */
function isUnlocked(ch: JianghuChapter): boolean {
    const cur = jh.profile?.rankCode || 'L1';
    return cur >= ch.unlockRank;
}

function fmt(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

onShow(async () => {
    if (!jh.profile) await jh.loadProfile().catch(() => {});
    await Promise.all([jh.loadStory().catch(() => {}), jh.loadRecords().catch(() => {})]);
});

async function submitVoice() {
    const content = voiceText.value.trim();
    if (content.length < 2) return uni.showToast({ title: '请至少写两个字', icon: 'none' });
    submitting.value = true;
    try {
        await jh.submitVoice({ kind: voiceKind.value, content });
        voiceText.value = '';
        uni.showToast({ title: '心声已送达', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '提交失败').slice(0, 30), icon: 'none' });
    } finally {
        submitting.value = false;
    }
}
</script>

<style scoped lang="scss">
.jh { padding: 24rpx; padding-bottom: 60rpx; }
.preface {
    background: linear-gradient(140deg, #2a2621 0%, #1f1b16 55%, #3a2a20 100%);
    border-radius: 24rpx; padding: 32rpx; color: #f2ece1;
    box-shadow: 0 8rpx 24rpx rgba(31, 27, 22, .18);
    display: flex; flex-direction: column;
}
.pre-cap { font-size: 22rpx; color: $jh-gold-l; letter-spacing: 4rpx; }
.pre-t { font-size: 34rpx; font-weight: 700; margin-top: 12rpx; }
.pre-p { font-size: 24rpx; color: #d8d0c2; line-height: 1.8; margin-top: 16rpx; }
.pre-p .b { color: $jh-gold-l; font-weight: 700; }
.pre-foot { color: #b9b1a4; font-style: italic; }

.sec { display: flex; justify-content: space-between; align-items: baseline; margin: 36rpx 4rpx 16rpx; }
.sec-h { font-size: 32rpx; font-weight: 700; color: $jh-ink; }
.sec-m { font-size: 22rpx; color: $jh-ink-2; }

.chapter {
    background: $surface; border-radius: 20rpx; padding: 28rpx; margin-bottom: 16rpx;
    box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06); border-left: 8rpx solid $jh-jade;
}
.chapter.locked { border-left-color: #b9b1a4; opacity: .82; }
.ch-head { display: flex; align-items: center; margin-bottom: 16rpx; }
.ch-no {
    width: 72rpx; height: 72rpx; border-radius: 18rpx; margin-right: 18rpx; flex-shrink: 0;
    background: linear-gradient(150deg, #2a2621, #1f1b16); color: $jh-gold-l;
    font-size: 26rpx; font-weight: 700; text-align: center; line-height: 72rpx;
}
.ch-h-b { display: flex; flex-direction: column; }
.ch-title { font-size: 30rpx; font-weight: 700; color: $jh-ink; }
.ch-sub { font-size: 22rpx; color: $jh-ink-2; margin-top: 6rpx; }
.ch-p { font-size: 26rpx; color: $jh-ink; line-height: 1.85; margin-top: 14rpx; }
.ch-mark { display: flex; gap: 12rpx; margin-top: 18rpx; padding: 16rpx; border-radius: 14rpx; background: rgba(200, 162, 74, .1); }
.ch-mark-k { font-size: 22rpx; font-weight: 700; color: #8a6b1f; flex-shrink: 0; }
.ch-mark-v { font-size: 24rpx; color: #6b5a3a; line-height: 1.7; }
.ch-shadow { font-size: 22rpx; color: $jh-cinnabar; margin-top: 14rpx; font-style: italic; }
.ch-lock { display: flex; align-items: center; gap: 14rpx; margin-top: 8rpx; }
.lock-ico {
    width: 44rpx; height: 44rpx; border-radius: 50%; background: #e7e0d4; color: #8a8378;
    font-size: 22rpx; text-align: center; line-height: 44rpx; flex-shrink: 0;
}
.lock-txt { font-size: 24rpx; color: $jh-ink-2; }

.voice-card { background: $surface; border-radius: 20rpx; padding: 24rpx; box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06); }
.vtabs { display: flex; gap: 12rpx; margin-bottom: 20rpx; }
.vtab {
    flex: 1; text-align: center; padding: 14rpx 0; border-radius: 16rpx; font-size: 26rpx; font-weight: 600;
    background: $jh-paper; color: $jh-ink-2;
}
.vtab.on { background: linear-gradient(140deg, #2a2621, #1f1b16); color: $jh-gold-l; }
.voice-input {
    width: 100%; height: 160rpx; box-sizing: border-box; padding: 18rpx; font-size: 26rpx;
    background: $jh-paper; border-radius: 16rpx; color: $jh-ink;
}
.btn { margin-top: 20rpx; border-radius: 16rpx; font-size: 30rpx; font-weight: 700; }
.btn.primary { background: linear-gradient(140deg, $jh-cinnabar, #8f2b21); color: #fff; }
.btn[disabled] { opacity: .5; }

.voice-list { margin-top: 16rpx; }
.voice-item {
    background: $surface; border-radius: 16rpx; padding: 20rpx 24rpx; margin-bottom: 12rpx;
    display: flex; flex-wrap: wrap; align-items: center; gap: 12rpx; box-shadow: 0 2rpx 8rpx rgba(31, 27, 22, .05);
}
.voice-item.done { background: linear-gradient(135deg, rgba(200, 162, 74, .12), $surface); border: 1rpx solid rgba(200, 162, 74, .4); }
.vi-done { font-size: 20rpx; padding: 4rpx 14rpx; border-radius: 999rpx; font-weight: 600; background: rgba(200, 162, 74, .22); color: #8a6b1f; }
.vi-tag { font-size: 20rpx; padding: 4rpx 14rpx; border-radius: 999rpx; font-weight: 600; }
.t-EXPECT { background: rgba(31, 111, 92, .14); color: $jh-jade; }
.t-PLAY { background: rgba(200, 162, 74, .2); color: #8a6b1f; }
.t-SUGGEST { background: rgba(178, 58, 46, .12); color: $jh-cinnabar; }
.vi-c { flex: 1; font-size: 26rpx; color: $jh-ink; line-height: 1.6; }
.vi-t { width: 100%; font-size: 20rpx; color: $jh-ink-2; }

.demand-list { display: flex; flex-direction: column; gap: 12rpx; }
.demand { background: $surface; border-radius: 16rpx; padding: 22rpx 24rpx; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2rpx 8rpx rgba(31, 27, 22, .05); }
.dm-b { flex: 1; display: flex; flex-direction: column; gap: 8rpx; padding-right: 16rpx; }
.dm-tag { font-size: 20rpx; color: $jh-jade; font-weight: 700; }
.dm-t { font-size: 26rpx; color: $jh-ink; line-height: 1.6; }
.dm-votes { font-size: 22rpx; color: $jh-cinnabar; flex-shrink: 0; }

.log { margin-top: 4rpx; }
.log-item { display: flex; gap: 16rpx; padding: 18rpx 0; border-bottom: 1rpx solid $border-color; }
.log-l { width: 20rpx; display: flex; justify-content: center; padding-top: 12rpx; flex-shrink: 0; }
.log-dot { width: 14rpx; height: 14rpx; border-radius: 50%; background: $jh-gold; }
.log-b { flex: 1; display: flex; flex-direction: column; }
.log-t { font-size: 27rpx; color: $jh-ink; font-weight: 600; }
.log-m { font-size: 22rpx; color: $jh-ink-2; margin-top: 6rpx; }
</style>
