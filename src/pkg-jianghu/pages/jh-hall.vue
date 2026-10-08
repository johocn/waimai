<template>
    <view class="jh">
        <!-- 头衔卡 -->
        <view class="hero">
            <view class="hero-top">
                <view class="seal">{{ seal }}</view>
                <view class="hero-id">
                    <text class="nick">{{ p?.nickname || '江湖未启' }}</text>
                    <text class="rank">{{ tierName }} · {{ realm }}</text>
                </view>
                <view class="hero-rep">
                    <text class="rep-num">{{ p?.rep ?? '--' }}</text>
                    <text class="rep-cap">江湖声望</text>
                </view>
            </view>
            <view class="bar"><view class="bar-in" :style="{ width: progress + '%' }"></view></view>
            <view class="bar-txt">
                <text v-if="nextName">距【{{ nextName }}】还差 {{ gap }} 声望</text>
                <text v-else>已至百晓生，声望仍在累积</text>
                <text v-if="gap > 0">约 {{ eta }} 天</text>
            </view>
        </view>

        <view v-if="frozen" class="frozen">{{ frozenReason }}</view>

        <!-- 今日三宫格 -->
        <view class="trio">
            <view class="cell"><text class="cell-num">{{ p?.repToday ?? 0 }}</text><text class="cell-lb">今日声望</text></view>
            <view class="cell"><text class="cell-num">{{ p?.letterDone ?? 0 }}</text><text class="cell-lb">密信总数</text></view>
            <view class="cell"><text class="cell-num">{{ repLeft }}</text><text class="cell-lb">日上限剩余</text></view>
        </view>

        <!-- 三方向入口 -->
        <view class="sec"><text class="sec-h">江湖去处</text><text class="sec-m">虚实双轨</text></view>
        <view class="entries">
            <view class="entry wide" @tap="go('/pkg-jianghu/pages/jh-letter-detail')">
                <view class="ico cin">信</view>
                <view class="entry-t">
                    <text class="entry-h">江湖密信传递</text>
                    <text class="entry-p">接密信 → 找 NPC 当面传密语 → 双向暗号核销</text>
                </view>
            </view>
            <view class="entry" @tap="go('/pkg-jianghu/pages/jh-intel-hall')">
                <view class="ico jade">阁</view>
                <text class="entry-h">百晓生情报阁</text>
                <text class="entry-p">悬赏 · 集市</text>
                <text class="entry-lock">情报值 {{ p?.intel ?? 0 }}</text>
            </view>
            <view class="entry" @tap="go('/pkg-jianghu/pages/jh-event')">
                <view class="ico gold">簿</view>
                <text class="entry-h">江湖事件簿</text>
                <text class="entry-p">剧本 · 组队拼图破案</text>
                <text class="entry-lock">多人协作 · 均分声望池</text>
            </view>
        </view>

        <!-- 运营后台（内部） -->
        <view class="sec"><text class="sec-h">运营后台</text><text class="sec-m">内部 · 事件与线索治理</text></view>
        <view class="entries">
            <view class="entry" @tap="go('/pkg-jianghu/pages/jh-admin')">
                <view class="ico gold">治</view>
                <text class="entry-h">江湖运营后台</text>
                <text class="entry-p">发布江湖事件 · 审核下线线索</text>
            </view>
        </view>

        <!-- 今日江湖榜 -->
        <view class="sec"><text class="sec-h">今日江湖榜</text><text class="sec-m">书院 · 东区</text></view>
        <view class="card board">
            <view v-for="(r, i) in rankRows" :key="r.customerId" class="row" :class="{ me: r.isMe }">
                <text class="no" :class="'no' + (i + 1)">{{ i + 1 }}</text>
                <text class="nm">{{ r.nickname }}</text>
                <text class="rp">{{ r.rep }}</text>
            </view>
            <EmptyState v-if="!rankRows.length" text="今日暂无江湖榜" />
        </view>

        <!-- 可接密信 -->
        <view class="sec"><text class="sec-h">可接密信</text><text class="sec-m">{{ tasks.length }} 封待取</text></view>
        <view v-for="t in tasks" :key="t.id" class="letter" :class="'l-' + t.level" @tap="open(t.id)">
            <view class="letter-b">
                <text class="letter-t">{{ t.title }}</text>
                <view class="letter-d">
                    <text class="pill" :class="pillCls(t.level)">{{ levelText(t.level) }}</text>
                    <text class="letter-m">{{ t.buildingCode || t.campusCode }}</text>
                    <text class="letter-m" v-if="t.distanceKm">{{ t.distanceKm }}km</text>
                </view>
                <text class="countdown" v-if="t.expireInSec">限时 {{ fmtLeft(t.expireInSec) }}</text>
            </view>
            <view class="letter-r">
                <text class="rep">+{{ t.rewardRep }}</text>
                <text class="rep-lb">声望</text>
            </view>
        </view>
        <EmptyState v-if="!tasks.length && !loading" text="暂无可接密信，稍后再来看看" />
        <view class="reset" @tap="resetDemo">重置演示数据</view>
    </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useJianghuStore } from '../../stores/jianghu';
import EmptyState from '../../components/EmptyState.vue';
import type { JianghuLevel } from '../../types/jianghu';

const jh = useJianghuStore();
const loading = computed(() => jh.loading);
const p = computed(() => jh.profile);
const tasks = computed(() => jh.tasks);
const rankRows = computed(() => jh.rankRows);
const frozen = computed(() => jh.frozen);
const frozenReason = computed(() => jh.frozenReason);
const progress = computed(() => jh.progressPct);
const gap = computed(() => jh.gapRep);
const eta = computed(() => jh.etaDays);

const seal = computed(() => jh.currentTier?.seal || '布');
const tierName = computed(() => jh.currentTier?.name || '布衣闲人');
const realm = computed(() => jh.currentTier?.realm || '行脚境');
const nextName = computed(() => jh.nextTier?.name || '');
const repLeft = computed(() => Math.max(0, (p.value?.repDailyCap ?? 300) - (p.value?.repToday ?? 0)));

const levelMap: Record<JianghuLevel, string> = { NORMAL: '普通信', URGENT: '加急密函', SECRET: '绝密卷宗' };
function levelText(l: JianghuLevel) { return levelMap[l] || '密信'; }
function pillCls(l: JianghuLevel) { return l === 'SECRET' ? 'p-gold' : l === 'URGENT' ? 'p-cin' : 'p-jade'; }
function fmtLeft(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : m + ' 分钟');
}

onShow(async () => {
    jh.restoreCache();
    try { await jh.loadAll(); } catch { uni.showToast({ title: '江湖暂未开放', icon: 'none' }); }
});

function go(url: string) { uni.navigateTo({ url }); }
function open(id: string) { uni.navigateTo({ url: '/pkg-jianghu/pages/jh-letter-detail?id=' + id }); }
function resetDemo() {
    uni.showModal({
        title: '重置演示数据',
        content: '将清空本机 mock 进度（接取 / 核销 / 声望），恢复初始演示态。',
        success: (r: any) => {
            if (r.confirm) {
                jh.resetDemo();
                uni.showToast({ title: '已重置', icon: 'none' });
            }
        }
    });
}
</script>

<style scoped lang="scss">
.jh { padding: 24rpx; padding-bottom: 60rpx; }
.hero {
    background: linear-gradient(140deg, #2a2621 0%, #1f1b16 55%, #3a2a20 100%);
    border-radius: 24rpx; padding: 32rpx; color: #f2ece1; box-shadow: 0 8rpx 24rpx rgba(31, 27, 22, .18);
}
.hero-top { display: flex; align-items: center; }
.seal {
    width: 96rpx; height: 96rpx; border-radius: 24rpx; margin-right: 24rpx;
    background: linear-gradient(150deg, $jh-gold-l, $jh-gold 45%, #9c7830);
    color: #402c06; font-size: 44rpx; font-weight: 700; text-align: center; line-height: 96rpx;
}
.hero-id { flex: 1; display: flex; flex-direction: column; }
.nick { font-size: 34rpx; font-weight: 700; }
.rank { font-size: 24rpx; color: $jh-gold-l; margin-top: 6rpx; }
.hero-rep { text-align: right; }
.rep-num { font-size: 44rpx; font-weight: 700; color: #fff; }
.rep-cap { display: block; font-size: 22rpx; color: #b9b1a4; margin-top: 4rpx; }
.bar { height: 16rpx; border-radius: 8rpx; background: rgba(255, 255, 255, .14); margin-top: 24rpx; overflow: hidden; }
.bar-in { height: 100%; background: linear-gradient(90deg, $jh-gold, $jh-gold-l); border-radius: 8rpx; transition: width .8s ease; }
.bar-txt { display: flex; justify-content: space-between; font-size: 22rpx; color: #cfc7b8; margin-top: 12rpx; }
.frozen {
    margin-top: 20rpx; padding: 20rpx 24rpx; border-radius: 16rpx; font-size: 26rpx;
    color: $jh-cinnabar; background: rgba(178, 58, 46, .1); border: 1rpx solid rgba(178, 58, 46, .25);
}
.trio { display: flex; gap: 16rpx; margin-top: 20rpx; }
.cell {
    flex: 1; background: $surface; border-radius: 20rpx; padding: 24rpx 8rpx; text-align: center;
    box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06);
}
.cell-num { display: block; font-size: 38rpx; font-weight: 700; color: $jh-cinnabar; }
.cell-lb { display: block; font-size: 22rpx; color: $jh-ink-2; margin-top: 6rpx; }
.sec { display: flex; justify-content: space-between; align-items: baseline; margin: 36rpx 4rpx 16rpx; }
.sec-h { font-size: 32rpx; font-weight: 700; color: $jh-ink; }
.sec-m { font-size: 22rpx; color: $jh-ink-2; }
.entries { display: flex; flex-wrap: wrap; gap: 16rpx; }
.entry {
    width: calc(50% - 8rpx); background: $surface; border-radius: 20rpx; padding: 24rpx;
    box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06);
}
.entry.wide { width: 100%; display: flex; align-items: center; }
.entry.disabled { opacity: .6; }
.ico {
    width: 72rpx; height: 72rpx; border-radius: 20rpx; text-align: center; line-height: 72rpx;
    font-size: 34rpx; font-weight: 700; margin-bottom: 12rpx;
}
.entry.wide .ico { margin-bottom: 0; margin-right: 20rpx; }
.ico.cin { background: rgba(178, 58, 46, .14); color: $jh-cinnabar; }
.ico.jade { background: rgba(31, 111, 92, .14); color: $jh-jade; }
.ico.gold { background: rgba(200, 162, 74, .2); color: #8a6b1f; }
.entry-t { display: flex; flex-direction: column; }
.entry-h { font-size: 30rpx; font-weight: 700; color: $jh-ink; }
.entry-p { font-size: 22rpx; color: $jh-ink-2; margin-top: 8rpx; line-height: 1.6; }
.entry-lock { font-size: 22rpx; color: $jh-ink-2; margin-top: 10rpx; }
.card { background: $surface; border-radius: 20rpx; padding: 12rpx; box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06); }
.board .row { display: flex; align-items: center; padding: 16rpx 20rpx; border-radius: 16rpx; }
.board .row.me { background: rgba(200, 162, 74, .16); }
.no { width: 40rpx; font-size: 28rpx; font-weight: 700; color: $jh-ink-2; text-align: center; }
.no1 { color: $jh-gold; }
.no2 { color: #8c8c8c; }
.no3 { color: #b0704a; }
.nm { flex: 1; font-size: 26rpx; color: $jh-ink; margin-left: 12rpx; }
.rp { font-size: 26rpx; font-weight: 700; color: $jh-cinnabar; }
.letter {
    display: flex; background: $surface; border-radius: 20rpx; padding: 24rpx; margin-bottom: 16rpx;
    box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06); border-left: 8rpx solid $jh-jade;
}
.letter.l-URGENT { border-left-color: $jh-cinnabar; }
.letter.l-SECRET { border-left-color: $jh-gold; }
.letter-b { flex: 1; }
.letter-t { font-size: 30rpx; font-weight: 700; color: $jh-ink; }
.letter-d { display: flex; align-items: center; gap: 16rpx; margin-top: 12rpx; flex-wrap: wrap; }
.letter-m { font-size: 22rpx; color: $jh-ink-2; }
.pill { font-size: 20rpx; padding: 4rpx 14rpx; border-radius: 999rpx; font-weight: 600; }
.p-jade { background: rgba(31, 111, 92, .12); color: $jh-jade; }
.p-cin { background: rgba(178, 58, 46, .12); color: $jh-cinnabar; }
.p-gold { background: rgba(200, 162, 74, .2); color: #8a6b1f; }
.countdown { display: block; font-size: 22rpx; color: $jh-cinnabar; margin-top: 10rpx; }
.letter-r { text-align: right; margin-left: 16rpx; }
.rep { font-size: 36rpx; font-weight: 700; color: $jh-cinnabar; }
.rep-lb { display: block; font-size: 20rpx; color: $jh-ink-2; }
.reset {
    margin: 40rpx 0 8rpx; text-align: center; font-size: 24rpx; color: $jh-ink-2;
    text-decoration: underline; text-underline-offset: 4rpx;
}
</style>
