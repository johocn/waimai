<template>
    <view class="jh">
        <view class="sec">
            <text class="sec-h">百晓生情报阁</text>
            <text class="sec-m">情报值 {{ jh.profile?.intel ?? 0 }}</text>
        </view>

        <view class="tabs2">
            <view class="t2" :class="{ on: tab === 'bounty' }" @tap="tab = 'bounty'">悬赏大厅</view>
            <view class="t2" :class="{ on: tab === 'market' }" @tap="tab = 'market'">情报集市</view>
        </view>

        <!-- 悬赏 -->
        <template v-if="tab === 'bounty'">
            <view v-if="event" class="event" @tap="go('/pkg-jianghu/pages/jh-event')">
                <text class="ev-h">江湖事件 · {{ event.name }}</text>
                <text class="ev-p">{{ event.desc }}</text>
                <view class="pieces">
                    <view v-for="i in event.total" :key="i" class="piece" :class="{ got: i <= event.collected }">
                        <text class="piece-t">{{ i <= event.collected ? numCn(i) : '？' }}</text>
                    </view>
                </view>
                <text class="ev-pg">进度 {{ event.collected }}/{{ event.total }} · 单人最多 {{ event.perPersonLimit }} 条 · 奖励池 {{ event.rewardPoolRep }} 声望</text>
                <text class="ev-go">进入事件簿，协作破案 →</text>
            </view>

            <view v-for="b in bounties" :key="b.id" class="bounty">
                <view class="bt-ic">悬</view>
                <view class="bt-b">
                    <text class="bt-t">{{ b.title }}</text>
                    <text class="bt-d">{{ b.brief }}</text>
                </view>
                <text class="bt-go">+{{ b.rewardRep }}</text>
            </view>
            <EmptyState v-if="!bounties.length" text="暂无悬赏，稍后再来" />
        </template>

        <!-- 集市 -->
        <template v-else>
            <view v-for="it in market" :key="it.id" class="market" :class="{ unlocked: it.unlocked }">
                <text class="mk-t">{{ it.summary }}</text>
                <text class="mk-d" v-if="it.unlocked">{{ it.content }}</text>
                <text class="mk-m">{{ it.categoryText }} · 已被查看 {{ it.viewCount }} 次 · 来源：{{ it.sourceNote }}</text>
                <view v-if="!it.unlocked" class="mk-mask" @tap="unlock(it.id)">
                    <text class="mk-mask-t">消耗 {{ it.priceIntel }} 积分查看</text>
                </view>
            </view>
            <EmptyState v-if="!market.length" text="集市暂无情报" />
            <text class="tip">集市条目均由审核通过的公开情报自动上架</text>
        </template>
    </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useJianghuStore } from '../../stores/jianghu';
import EmptyState from '../../components/EmptyState.vue';

const jh = useJianghuStore();
const tab = ref<'bounty' | 'market'>('bounty');

const bounties = computed(() => jh.bounties);
const market = computed(() => jh.market);
const event = computed(() => jh.event);

const cn = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
function numCn(i: number) { return cn[i] || String(i); }
function go(url: string) { uni.navigateTo({ url }); }

onShow(async () => {
    await Promise.all([jh.loadBounties().catch(() => {}), jh.loadMarket().catch(() => {}), jh.loadEvent().catch(() => {})]);
});

async function unlock(id: string) {
    try {
        await jh.unlockIntel(id);
        uni.showToast({ title: '情报已解锁', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '解锁失败').slice(0, 30), icon: 'none' });
    }
}
</script>

<style scoped lang="scss">
.jh { padding: 24rpx; padding-bottom: 60rpx; }
.sec { display: flex; justify-content: space-between; align-items: baseline; margin: 8rpx 4rpx 20rpx; }
.sec-h { font-size: 32rpx; font-weight: 700; color: $jh-ink; }
.sec-m { font-size: 22rpx; color: $jh-ink-2; }
.tabs2 { display: flex; gap: 48rpx; border-bottom: 1rpx solid $border-color; margin-bottom: 24rpx; }
.t2 { padding: 16rpx 4rpx 20rpx; font-size: 30rpx; font-weight: 600; color: $jh-ink-2; position: relative; }
.t2.on { color: $jh-ink; }
.t2.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1rpx; height: 6rpx; border-radius: 3rpx; background: linear-gradient(90deg, $jh-cinnabar, $jh-gold); }

.event {
    background: linear-gradient(140deg, #221e19, #3a2a20); border-radius: 24rpx; padding: 32rpx;
    color: #f2ece1; margin-bottom: 24rpx;
}
.ev-h { font-size: 34rpx; font-weight: 700; letter-spacing: 2rpx; }
.ev-p { display: block; font-size: 22rpx; color: #cfc7b8; line-height: 1.7; margin: 12rpx 0 24rpx; }
.pieces { display: flex; gap: 12rpx; }
.piece {
    flex: 1; height: 60rpx; border-radius: 12rpx; background: rgba(255, 255, 255, .1);
    display: flex; align-items: center; justify-content: center;
}
.piece.got { background: linear-gradient(140deg, $jh-gold-l, $jh-gold); }
.piece-t { font-size: 22rpx; color: #8b8578; }
.piece.got .piece-t { color: #402c06; font-weight: 700; }
.ev-pg { display: block; font-size: 22rpx; color: $jh-gold-l; margin-top: 20rpx; }
.ev-go { display: block; margin-top: 18rpx; font-size: 22rpx; color: $jh-gold-l; }

.bounty {
    display: flex; align-items: center; background: $surface; border-radius: 20rpx; padding: 24rpx;
    margin-bottom: 16rpx; box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06);
}
.bt-ic {
    width: 72rpx; height: 72rpx; border-radius: 20rpx; margin-right: 20rpx; text-align: center; line-height: 72rpx;
    background: rgba(31, 111, 92, .14); color: $jh-jade; font-weight: 700;
}
.bt-b { flex: 1; display: flex; flex-direction: column; }
.bt-t { font-size: 28rpx; font-weight: 600; color: $jh-ink; }
.bt-d { font-size: 22rpx; color: $jh-ink-2; margin-top: 8rpx; }
.bt-go { font-size: 30rpx; font-weight: 700; color: $jh-cinnabar; }

.market {
    position: relative; background: $surface; border-radius: 20rpx; padding: 28rpx; margin-bottom: 16rpx;
    overflow: hidden; box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06);
}
.mk-t { font-size: 30rpx; font-weight: 700; color: $jh-ink; }
.mk-d { display: block; font-size: 26rpx; color: $jh-ink; line-height: 1.7; margin-top: 12rpx; }
.mk-m { display: block; font-size: 22rpx; color: $jh-ink-2; margin-top: 12rpx; }
.mk-mask {
    position: absolute; left: 0; right: 0; bottom: 0; height: 104rpx; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0), $surface 70%);
}
.mk-mask-t { font-size: 24rpx; font-weight: 700; color: $jh-ink-2; }
.tip { display: block; text-align: center; font-size: 22rpx; color: $jh-ink-2; margin-top: 16rpx; }
</style>
