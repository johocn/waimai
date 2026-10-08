<template>
    <view class="jh">
        <view class="hero">
            <view class="hero-top">
                <view class="seal">{{ seal }}</view>
                <view class="hero-id">
                    <text class="nick">{{ jh.profile?.nickname || '江湖未启' }}</text>
                    <text class="rank">{{ tierName }} · {{ realm }}</text>
                </view>
                <view class="hero-rep">
                    <text class="rep-num">{{ jh.profile?.rep ?? '--' }}</text>
                    <text class="rep-cap">江湖声望</text>
                </view>
            </view>
            <view class="bar"><view class="bar-in" :style="{ width: progress + '%' }"></view></view>
            <view class="bar-txt">
                <text v-if="nextName">距【{{ nextName }}】还差 {{ gap }} 声望</text>
                <text v-else>已至百晓生</text>
                <text v-if="gap > 0">约 {{ eta }} 天</text>
            </view>
        </view>

        <view class="trio">
            <view class="cell"><text class="cell-num">{{ jh.profile?.intel ?? 0 }}</text><text class="cell-lb">情报值</text></view>
            <view class="cell"><text class="cell-num">{{ jh.profile?.letterDone ?? 0 }}</text><text class="cell-lb">密信总数</text></view>
            <view class="cell"><text class="cell-num">{{ jh.profile?.violateCount ?? 0 }}</text><text class="cell-lb">违规记录</text></view>
        </view>

        <view class="sec"><text class="sec-h">段位晋升塔</text><text class="sec-m">三境九级</text></view>
        <view class="tower">
            <view v-for="(r, i) in ladder" :key="r.code" class="tier" :class="tierCls(i)">
                <view class="rail"><view class="badge">{{ r.seal }}</view></view>
                <view class="info" @tap="openSheet(r.code)">
                    <view class="tier-h">
                        <text class="tier-n">{{ r.name }}</text>
                        <text v-if="i === curIdx" class="tier-tag">当前</text>
                    </view>
                    <text class="tier-th">{{ r.realm }} · 声望 {{ r.rep }}</text>
                    <text class="tier-pk">晋升：{{ r.conditionText }}</text>
                </view>
            </view>
        </view>

        <view class="sec"><text class="sec-h">已解锁现实权益</text><text class="sec-m">声望不兑现金</text></view>
        <view class="card">
            <view v-for="pk in realPerks" :key="pk.text" class="kv" :class="{ dim: !pk.unlocked }">
                <text class="kv-k">{{ pk.text }}</text>
                <text class="kv-v">{{ pk.unlocked ? '已解锁' : pk.from + ' 解锁' }}</text>
            </view>
        </view>

        <!-- 段位详情弹层 -->
        <view v-if="sheet" class="mask" @tap="sheet = null">
            <view class="sheet" @tap.stop>
                <view class="grab"></view>
                <text class="sh-h">{{ sheet.name }}</text>
                <text class="sh-sub">{{ sheet.realm }} · {{ sheetState }}</text>
                <view class="kv"><text class="kv-k">声望门槛</text><text class="kv-v">{{ sheet.rep }}</text></view>
                <view class="grp">
                    <text class="grp-h">晋升条件</text>
                    <text class="grp-li">{{ sheet.conditionText }}</text>
                </view>
                <view class="grp">
                    <text class="grp-h">江湖权益（虚拟）</text>
                    <view v-for="v in sheet.perksVirtual" :key="v" class="grp-li"><text class="dot gold">·</text>{{ v }}</view>
                </view>
                <view class="grp">
                    <text class="grp-h">现实权益（骑手侧）</text>
                    <view v-for="v in sheet.perksReal" :key="v" class="grp-li"><text class="dot jade">·</text>{{ v }}</view>
                </view>
                <button class="btn ghost" @tap="sheet = null">知 道 了</button>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useJianghuStore } from '../../stores/jianghu';
import type { RankTier } from '../../types/jianghu';

const jh = useJianghuStore();
const sheet = ref<RankTier | null>(null);

const ladder = computed(() => jh.ladder);
const curIdx = computed(() => ladder.value.findIndex((r) => r.code === jh.profile?.rankCode));
const progress = computed(() => jh.progressPct);
const gap = computed(() => jh.gapRep);
const eta = computed(() => jh.etaDays);
const seal = computed(() => jh.currentTier?.seal || '布');
const tierName = computed(() => jh.currentTier?.name || '布衣闲人');
const realm = computed(() => jh.currentTier?.realm || '行脚境');
const nextName = computed(() => jh.nextTier?.name || '');
const sheetState = computed(() => {
    if (!sheet.value) return '';
    const i = ladder.value.findIndex((r) => r.code === sheet.value!.code);
    if (i < curIdx.value) return '已达成';
    if (i === curIdx.value) return '当前段位';
    return '未达成';
});

/** 现实权益：按当前段位是否已解锁渲染 */
const realPerks = computed(() => {
    const list: Array<{ text: string; unlocked: boolean; from: string }> = [
        { text: '接单范围 +1 栋楼（跨楼阁接单）', unlocked: false, from: 'L3 青羽信童' },
        { text: '高峰期优先派单 ×1.2', unlocked: false, from: 'L4 墨羽信使' },
        { text: '提现手续费 5 折', unlocked: false, from: 'L5 疾影信使' },
        { text: '提现免手续费 · 免押金领装备', unlocked: false, from: 'L6 飞鸿驿丞' },
        { text: '优先派单 ×1.5 · 可接跨校区订单', unlocked: false, from: 'L7 包打听' },
        { text: '专属客服通道 · 提现 T+0', unlocked: false, from: 'L8 万事通' },
        { text: '平台激励返点 +1%', unlocked: false, from: 'L9 百晓生' }
    ];
    const idx = curIdx.value;
    const order = [2, 3, 4, 5, 6, 7, 8]; // 对应 L3..L9 在 ladder 中的下标
    list.forEach((pk, i) => { pk.unlocked = idx >= order[i]; });
    return list;
});

function tierCls(i: number) {
    if (i < curIdx.value) return 'done';
    if (i === curIdx.value) return 'now';
    return '';
}

function openSheet(code: string) {
    sheet.value = ladder.value.find((r) => r.code === code) || null;
}

onShow(async () => {
    if (!jh.ladder.length) await jh.loadLadder().catch(() => {});
    if (!jh.profile) await jh.loadProfile().catch(() => {});
});
</script>

<style scoped lang="scss">
.jh { padding: 24rpx; padding-bottom: 60rpx; }
.hero {
    background: linear-gradient(140deg, #2a2621 0%, #1f1b16 55%, #3a2a20 100%);
    border-radius: 24rpx; padding: 32rpx; color: #f2ece1;
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
.trio { display: flex; gap: 16rpx; margin-top: 20rpx; }
.cell { flex: 1; background: $surface; border-radius: 20rpx; padding: 24rpx 8rpx; text-align: center; }
.cell-num { display: block; font-size: 38rpx; font-weight: 700; color: $jh-cinnabar; }
.cell-lb { display: block; font-size: 22rpx; color: $jh-ink-2; margin-top: 6rpx; }
.sec { display: flex; justify-content: space-between; align-items: baseline; margin: 36rpx 4rpx 16rpx; }
.sec-h { font-size: 32rpx; font-weight: 700; color: $jh-ink; }
.sec-m { font-size: 22rpx; color: $jh-ink-2; }
.card { background: $surface; border-radius: 20rpx; padding: 12rpx 24rpx; }

.tower { padding-top: 8rpx; }
.tier { display: flex; padding-bottom: 32rpx; }
.tier:last-child { padding-bottom: 0; }
.rail { width: 96rpx; display: flex; flex-direction: column; align-items: center; position: relative; }
.rail::before {
    content: ''; position: absolute; top: 88rpx; bottom: -32rpx; width: 4rpx;
    background: linear-gradient(180deg, rgba(200, 162, 74, .5), rgba(31, 27, 22, .1));
}
.tier:last-child .rail::before { display: none; }
.badge {
    width: 88rpx; height: 88rpx; border-radius: 50%; text-align: center; line-height: 88rpx;
    background: #e6e0d2; color: #a89d8c; font-size: 32rpx; font-weight: 700; z-index: 2;
}
.tier.done .badge { background: linear-gradient(150deg, $jh-gold-l, $jh-gold 50%, #9c7830); color: #402c06; }
.tier.now .badge {
    width: 104rpx; height: 104rpx; line-height: 104rpx; font-size: 38rpx; color: #402c06;
    background: linear-gradient(150deg, #fff, #f2e3b8 40%, $jh-gold);
}
.info {
    flex: 1; background: $surface; border-radius: 20rpx; padding: 24rpx 28rpx; margin-left: 8rpx;
    box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06);
}
.tier.now .info { border: 1rpx solid rgba(200, 162, 74, .55); }
.tier-h { display: flex; align-items: center; }
.tier-n { font-size: 30rpx; font-weight: 700; color: $jh-ink; }
.tier-tag { font-size: 20rpx; color: $jh-cinnabar; background: rgba(178, 58, 46, .12); padding: 2rpx 12rpx; border-radius: 6rpx; margin-left: 12rpx; }
.tier-th { display: block; font-size: 22rpx; color: $jh-ink-2; margin-top: 8rpx; }
.tier-pk { display: block; font-size: 22rpx; color: $jh-jade; margin-top: 12rpx; line-height: 1.6; }

.kv { display: flex; justify-content: space-between; padding: 24rpx 0; border-bottom: 1rpx dashed $border-color; }
.kv:last-child { border-bottom: none; }
.kv.dim { color: $jh-ink-2; }
.kv-k { font-size: 26rpx; }
.kv-v { font-size: 26rpx; font-weight: 600; text-align: right; }

.mask { position: fixed; left: 0; right: 0; top: 0; bottom: 0; background: rgba(14, 17, 22, .55); display: flex; align-items: flex-end; z-index: 99; }
.sheet {
    width: 100%; background: $surface; border-radius: 32rpx 32rpx 0 0; padding: 16rpx 36rpx 48rpx;
    max-height: 76vh; overflow-y: auto;
}
.grab { width: 76rpx; height: 8rpx; border-radius: 4rpx; background: $jh-ink-2; opacity: .5; margin: 12rpx auto 24rpx; }
.sh-h { font-size: 36rpx; font-weight: 700; color: $jh-ink; }
.sh-sub { display: block; font-size: 24rpx; color: $jh-ink-2; margin: 8rpx 0 24rpx; }
.grp { margin-top: 28rpx; }
.grp-h { display: block; font-size: 24rpx; color: $jh-ink-2; margin-bottom: 12rpx; }
.grp-li { display: flex; align-items: flex-start; font-size: 26rpx; line-height: 1.7; margin-bottom: 10rpx; color: $jh-ink; }
.dot { width: 32rpx; height: 32rpx; border-radius: 50%; text-align: center; line-height: 32rpx; color: #fff; margin-right: 12rpx; flex-shrink: 0; }
.dot.gold { background: $jh-gold; }
.dot.jade { background: $jh-jade; }
.btn { margin-top: 36rpx; border-radius: 16rpx; font-size: 30rpx; font-weight: 700; }
.btn.ghost { background: $bg-color; color: $jh-ink-2; }
</style>
