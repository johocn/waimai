<template>
    <view class="jh">
        <view v-if="!d && loading" class="loading">江湖异动加载中…</view>
        <view v-else-if="!d" class="empty">当前暂无进行中的江湖事件</view>

        <template v-else>
            <!-- 事件头 + 拼图进度 -->
            <view class="hero">
                <image v-if="banner" class="banner" :src="banner" mode="aspectFill" />
                <view class="hero-top">
                    <view class="seal gold">簿</view>
                    <view class="hero-id">
                        <text class="name">{{ title }}</text>
                        <text class="badge" :class="{ solved: d.solved }">{{ d.solved ? '已破案' : '拼图进行中' }}</text>
                    </view>
                </view>
                <text class="desc">{{ desc }}</text>
                <text v-if="rewardText" class="reward-tip">奖励 · {{ rewardText }}</text>

                <view class="pieces">
                    <view v-for="i in d.total" :key="i" class="piece" :class="{ got: i <= d.collected }">
                        <text class="piece-t">{{ i <= d.collected ? numCn(i) : '？' }}</text>
                    </view>
                </view>
                <view class="bar"><view class="bar-in" :style="{ width: pct + '%' }"></view></view>
                <view class="bar-txt">
                    <text>进度 {{ d.collected }}/{{ d.total }}</text>
                    <text v-if="need > 0">还差 {{ need }} 条线索</text>
                    <text v-else>拼图已集齐</text>
                </view>
            </view>

            <!-- 破案奖励横幅 -->
            <view v-if="d.solved" class="solved-banner">
                <text class="sb-t">本案告破 · 共 {{ d.contributors.length }} 位传信者协作</text>
                <text class="sb-p" v-if="d.myRewardRep">你分得 {{ d.myRewardRep }} 声望，江湖名探身份＋1</text>
                <text class="sb-p" v-else-if="!isContributor">你未参与本案线索，下次早些出手</text>
            </view>

            <!-- 信息条 -->
            <view class="info">
                <view class="ic"><text class="ic-n">{{ d.rewardPoolRep ?? 0 }}</text><text class="ic-l">奖励池声望</text></view>
                <view class="ic"><text class="ic-n">{{ d.myContributed }}/{{ d.perPersonLimit }}</text><text class="ic-l">我的贡献</text></view>
                <view class="ic"><text class="ic-n">{{ endText }}</text><text class="ic-l">截止</text></view>
            </view>

            <!-- 线索墙 -->
            <view class="sec"><text class="sec-h">线索墙</text><text class="sec-m">{{ wallClues.length }} 条已上墙</text></view>
            <view v-for="c in wallClues" :key="c.id" class="clue" :class="{ mine: c.customerId === me }">
                <view class="clue-h">
                    <text class="clue-n">{{ c.nickname || '匿名传信者' }}</text>
                    <text class="clue-l">♥ {{ c.likes }}</text>
                </view>
                <text class="clue-c">{{ c.content }}</text>
                <text class="clue-s">来源：{{ c.sourceNote }}</text>
            </view>
            <EmptyState v-if="!d.clues.length" text="尚无线索，做第一个拼图人" />

            <!-- 贡献者排行 -->
            <view class="sec"><text class="sec-h">协作榜</text><text class="sec-m">按线索数</text></view>
            <view v-for="(r, i) in d.contributors" :key="r.customerId" class="row" :class="{ me: r.isMe }">
                <text class="no" :class="'no' + (i + 1)">{{ i + 1 }}</text>
                <text class="nm">{{ r.nickname }}</text>
                <text class="rp">{{ r.count }} 条</text>
            </view>

            <!-- 提交线索 -->
            <view class="sec"><text class="sec-h">补充线索</text><text class="sec-m">点亮下一块拼图</text></view>
            <view class="form" v-if="canSubmit">
                <textarea class="ta" v-model="content" placeholder="写下你发现的线索碎片（拼图正文）" maxlength="200" />
                <input class="inp" v-model="sourceNote" placeholder="信息来源（必填，合规留痕）" />
                <button class="submit" :disabled="submitting" @tap="submit">{{ submitting ? '呈交中…' : '呈交线索' }}</button>
            </view>
            <view v-else class="form-locked">
                <text v-if="d.solved">本案已告破，静待新案</text>
                <text v-else-if="ended">事件已截止，无法再提交</text>
                <text v-else-if="d.myContributed >= d.perPersonLimit">你本期限额已用完（{{ d.perPersonLimit }} 条）</text>
            </view>
            <text class="tip">多人拼图破案：线索由传信者协作搜集，集齐即均分奖励池，贡献计入「组队破大案」晋升条件</text>
        </template>
    </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useJianghuStore } from '../../stores/jianghu';
import EmptyState from '../../components/EmptyState.vue';

const jh = useJianghuStore();
const loading = ref(false);
const content = ref('');
const sourceNote = ref('');
const submitting = ref(false);

const d = computed(() => jh.eventDetail);
/** 文案源（Strapi）覆盖：非空时覆盖实体内联文案，否则回退到实体字段 */
const copy = computed(() => jh.eventContent);
const title = computed(() => copy.value?.title ?? d.value?.name ?? '');
const desc = computed(() => copy.value?.desc ?? d.value?.desc ?? '');
const banner = computed(() => copy.value?.bannerImage ?? null);
const rewardText = computed(() => copy.value?.rewardText ?? null);
const me = computed(() => jh.profile?.customerId);
// 公共线索墙仅展示已上墙(SHOWN)；PENDING 待审 / REJECTED 下线 对玩家不可见
const wallClues = computed(() => (d.value?.clues ?? []).filter((c) => c.status === 'SHOWN'));
const pct = computed(() => (d.value ? Math.round((d.value.collected / d.value.total) * 100) : 0));
const need = computed(() => (d.value ? Math.max(0, d.value.total - d.value.collected) : 0));
const ended = computed(() => !!d.value?.endAt && new Date(d.value.endAt).getTime() < Date.now());
const isContributor = computed(() => !!d.value?.contributors.some((c) => c.isMe));
const canSubmit = computed(
    () => !!d.value && !d.value.solved && !ended.value && d.value.myContributed < d.value.perPersonLimit && !submitting.value,
);
const endText = computed(() => {
    if (!d.value?.endAt) return '长期';
    const diff = new Date(d.value.endAt).getTime() - Date.now();
    if (diff <= 0) return '已截止';
    const day = Math.floor(diff / 86400000);
    return day > 0 ? day + ' 天后' : Math.max(1, Math.floor(diff / 3600000)) + ' 小时后';
});

const cn = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾'];
function numCn(i: number) {
    return cn[i] || String(i);
}

onShow(async () => {
    loading.value = true;
    try {
        await jh.loadEventDetail();
    } catch {
        uni.showToast({ title: '江湖事件暂未开放', icon: 'none' });
    } finally {
        loading.value = false;
    }
});

async function submit() {
    if (!content.value.trim()) return uni.showToast({ title: '线索内容不可为空', icon: 'none' });
    if (!sourceNote.value.trim()) return uni.showToast({ title: '请填写信息来源', icon: 'none' });
    submitting.value = true;
    try {
        const r = await jh.collectClue({ content: content.value, sourceNote: sourceNote.value });
        content.value = '';
        sourceNote.value = '';
        if (r.solved) uni.showToast({ title: '线索集齐，本案告破！', icon: 'none' });
        else uni.showToast({ title: '线索已呈交，待运营审核', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '呈交失败').slice(0, 30), icon: 'none' });
    } finally {
        submitting.value = false;
    }
}
</script>

<style scoped lang="scss">
.jh { padding: 24rpx; padding-bottom: 60rpx; }
.loading, .empty { text-align: center; color: $jh-ink-2; padding: 120rpx 0; font-size: 28rpx; }

.hero {
    background: linear-gradient(140deg, #221e19 0%, #1f1b16 55%, #3a2a20 100%);
    border-radius: 24rpx; padding: 32rpx; color: #f2ece1; box-shadow: 0 8rpx 24rpx rgba(31, 27, 22, .18);
}
.hero-top { display: flex; align-items: center; }
.seal {
    width: 88rpx; height: 88rpx; border-radius: 20rpx; margin-right: 20rpx;
    background: linear-gradient(150deg, $jh-gold-l, $jh-gold 45%, #9c7830);
    color: #402c06; font-size: 40rpx; font-weight: 700; text-align: center; line-height: 88rpx;
}
.hero-id { flex: 1; display: flex; flex-direction: column; }
.name { font-size: 36rpx; font-weight: 700; letter-spacing: 2rpx; }
.badge {
    align-self: flex-start; margin-top: 10rpx; font-size: 20rpx; padding: 4rpx 16rpx; border-radius: 999rpx;
    background: rgba(200, 162, 74, .2); color: $jh-gold-l;
}
.badge.solved { background: rgba(31, 111, 92, .25); color: #7fd0bc; }
.desc { display: block; font-size: 24rpx; color: #cfc7b8; line-height: 1.7; margin: 20rpx 0 24rpx; }
.banner { width: 100%; height: 220rpx; border-radius: 16rpx; margin-bottom: 20rpx; display: block; }
.reward-tip {
    display: inline-block; margin-top: 8rpx; font-size: 22rpx; color: $jh-gold-l;
    padding: 6rpx 16rpx; border-radius: 999rpx; background: rgba(200, 162, 74, .16);
}
.pieces { display: flex; gap: 12rpx; }
.piece {
    flex: 1; height: 64rpx; border-radius: 12rpx; background: rgba(255, 255, 255, .1);
    display: flex; align-items: center; justify-content: center;
}
.piece.got { background: linear-gradient(140deg, $jh-gold-l, $jh-gold); }
.piece-t { font-size: 24rpx; color: #8b8578; }
.piece.got .piece-t { color: #402c06; font-weight: 700; }
.bar { height: 16rpx; border-radius: 8rpx; background: rgba(255, 255, 255, .14); margin-top: 24rpx; overflow: hidden; }
.bar-in { height: 100%; background: linear-gradient(90deg, $jh-gold, $jh-gold-l); border-radius: 8rpx; transition: width .8s ease; }
.bar-txt { display: flex; justify-content: space-between; font-size: 22rpx; color: #cfc7b8; margin-top: 12rpx; }

.solved-banner {
    margin-top: 20rpx; padding: 24rpx; border-radius: 20rpx;
    background: linear-gradient(140deg, rgba(31, 111, 92, .16), rgba(31, 111, 92, .08));
    border: 1rpx solid rgba(31, 111, 92, .3);
}
.sb-t { display: block; font-size: 28rpx; font-weight: 700; color: $jh-jade; }
.sb-p { display: block; font-size: 24rpx; color: $jh-ink-2; margin-top: 8rpx; }

.info { display: flex; gap: 16rpx; margin-top: 20rpx; }
.ic {
    flex: 1; background: $surface; border-radius: 20rpx; padding: 24rpx 8rpx; text-align: center;
    box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06);
}
.ic-n { display: block; font-size: 36rpx; font-weight: 700; color: $jh-cinnabar; }
.ic-l { display: block; font-size: 22rpx; color: $jh-ink-2; margin-top: 6rpx; }

.sec { display: flex; justify-content: space-between; align-items: baseline; margin: 36rpx 4rpx 16rpx; }
.sec-h { font-size: 32rpx; font-weight: 700; color: $jh-ink; }
.sec-m { font-size: 22rpx; color: $jh-ink-2; }

.clue {
    background: $surface; border-radius: 20rpx; padding: 24rpx; margin-bottom: 16rpx;
    box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06); border-left: 8rpx solid $jh-jade;
}
.clue.mine { border-left-color: $jh-gold; }
.clue-h { display: flex; justify-content: space-between; align-items: center; }
.clue-n { font-size: 26rpx; font-weight: 700; color: $jh-ink; }
.clue-l { font-size: 22rpx; color: $jh-cinnabar; }
.clue-c { display: block; font-size: 28rpx; color: $jh-ink; line-height: 1.7; margin: 12rpx 0; }
.clue-s { display: block; font-size: 22rpx; color: $jh-ink-2; }

.row { display: flex; align-items: center; padding: 16rpx 20rpx; border-radius: 16rpx; background: $surface; margin-bottom: 8rpx; }
.row.me { background: rgba(200, 162, 74, .16); }
.no { width: 40rpx; font-size: 28rpx; font-weight: 700; color: $jh-ink-2; text-align: center; }
.no1 { color: $jh-gold; }
.no2 { color: #8c8c8c; }
.no3 { color: #b0704a; }
.nm { flex: 1; font-size: 26rpx; color: $jh-ink; margin-left: 12rpx; }
.rp { font-size: 26rpx; font-weight: 700; color: $jh-jade; }

.form {
    background: $surface; border-radius: 20rpx; padding: 24rpx; box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06);
}
.ta {
    width: 100%; height: 160rpx; box-sizing: border-box; padding: 20rpx; font-size: 26rpx;
    border-radius: 16rpx; background: $jh-paper; color: $jh-ink;
}
.inp {
    width: 100%; box-sizing: border-box; margin-top: 16rpx; padding: 20rpx; font-size: 26rpx;
    border-radius: 16rpx; background: $jh-paper; color: $jh-ink;
}
.submit {
    margin-top: 20rpx; background: linear-gradient(140deg, $jh-cinnabar, #8a2c22); color: #fff;
    font-size: 30rpx; font-weight: 700; border-radius: 16rpx; padding: 18rpx 0;
}
.submit[disabled] { opacity: .5; }
.form-locked {
    background: $surface; border-radius: 20rpx; padding: 32rpx; text-align: center;
    font-size: 26rpx; color: $jh-ink-2; box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06);
}
.tip { display: block; text-align: center; font-size: 22rpx; color: $jh-ink-2; margin-top: 24rpx; line-height: 1.6; }
</style>
