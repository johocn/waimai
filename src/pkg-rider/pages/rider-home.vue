<template>
    <view class="hall">
        <view class="topbar">
            <view class="online" :class="{ on }" @tap="toggleOnline">
                <view class="dot"></view><text>{{ on ? '接单中' : '已下线' }}</text>
            </view>
            <text class="credit">信用分 {{ profile?.riderCredit ?? '--' }}</text>
        </view>
        <view class="hint" v-if="!on">打开「接单中」开关开始接收新任务</view>
        <EmptyState v-else-if="!tasks.length" text="暂无待抢任务，新单会实时出现在这里" />
        <view v-else class="tasks">
            <view v-for="t in tasks" :key="t.id" class="task" :class="{ taken: takenIds.has(t.id) }">
                <view class="task-head">
                    <text class="order-code">#{{ t.code }}<text v-if="isUrgent(t)" class="urgent">加急</text></text>
                    <text class="fee">¥{{ fmt(runnerFee(t)) }}</text>
                </view>
                <text class="task-addr">📍 {{ t.customFields?.campusZone || '' }} {{ buildingName(t) }}</text>
                <text class="task-route">{{ t.customFields?.fulfillmentRoute === 'R1' ? '接力单（到校门口交接点取货）' : '直送单（档口取货）' }}</text>
                <button class="grab" :disabled="grabbing || takenIds.has(t.id)" @tap="grab(t)">
                    {{ takenIds.has(t.id) ? '已被抢' : grabbing ? '锁定中…' : '一键接单' }}
                </button>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow, onHide } from '@dcloudio/uni-app';
import { fetchHall, grabOrder, fetchBuildingMap } from '../../api/queries/hall';
import { myRiderProfile, riderOnline, riderHeartbeat } from '../../api/queries/rider';
import { useAuthStore } from '../../stores/auth';
import EmptyState from '../../components/EmptyState.vue';

const auth = useAuthStore();
const on = ref(false);
const profile = ref<any>(null);
const tasks = ref<any[]>([]);
const grabbing = ref(false);
const takenIds = ref(new Set<string>());
const buildingMap = ref<Record<string, string>>({});
let pollTimer: any = null;
let beatTimer: any = null;

onShow(async () => {
    if (!auth.token) {
        return uni.redirectTo({ url: '/pages/login/index?redirect=' + encodeURIComponent('/pkg-rider/pages/rider-home') });
    }
    profile.value = await myRiderProfile().catch(() => null);
    if (profile.value?.riderStatus !== 'approved') {
        return uni.redirectTo({ url: '/pkg-rider/pages/rider-join' });
    }
    buildingMap.value = await fetchBuildingMap().catch(() => ({}));
    await refresh();
    pollTimer = setInterval(refresh, 10000);      // spec §6.1 大厅轮询 10s
    beatTimer = setInterval(() => { if (on.value) riderHeartbeat().catch(() => {}); }, 30000);  // 在线才心跳 30s
});
onHide(() => { clearInterval(pollTimer); clearInterval(beatTimer); });

function fmt(fen: number) { return (fen / 100).toFixed(2); }

/** 跑腿费 = 运费（跑腿单运费即跑腿费）+ 小费 */
function runnerFee(t: any) { return (t.shipping ?? 0) + (t.customFields?.tip ?? 0); }

function buildingName(t: any) {
    const id = t.customFields?.buildingId;
    return buildingMap.value[String(id)] ?? '';
}

/** 滞留超 5 分钟 = 加急（后端排序已置顶，前端加徽标提示） */
function isUrgent(t: any) {
    const at = t.customFields?.hallEnteredAt ?? t.createdAt;
    return at ? Date.now() - new Date(at).getTime() > 5 * 60_000 : false;
}

async function refresh() {
    try { tasks.value = await fetchHall(); } catch { /* 网络抖动静默重试 */ }
}

async function toggleOnline() {
    on.value = !on.value;
    try {
        await riderOnline(on.value);
        if (on.value) await refresh();
    } catch {
        on.value = !on.value;
        uni.showToast({ title: '操作失败，请重试', icon: 'none' });
    }
}

async function grab(t: any) {
    grabbing.value = true;   // 乐观锁 UI：立即置灰（spec §6.1.2）
    try {
        await grabOrder(t.id);   // 成功返回订单
        uni.redirectTo({ url: '/pkg-rider/pages/rider-delivering' });
    } catch (e: any) {
        const msg: string = e?.response?.errors?.[0]?.message || e?.message || '抢单失败';
        if (msg.includes('已被抢')) {
            takenIds.value.add(t.id);
            uni.showToast({ title: '手慢了，已被抢', icon: 'none' });
        } else if (msg.includes('不能抢自己')) {
            uni.showToast({ title: '不能抢自己的订单', icon: 'none' });
        } else {
            uni.showToast({ title: msg.slice(0, 40), icon: 'none' });
        }
        await refresh();
    } finally { grabbing.value = false; }
}
</script>

<style scoped lang="scss">
.hall { padding: 24rpx; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24rpx; }
.online { display: flex; align-items: center; gap: 12rpx; background: $surface; padding: 12rpx 28rpx; border-radius: 999rpx; font-size: 26rpx; }
.online .dot { width: 16rpx; height: 16rpx; border-radius: 999rpx; background: #ccc; }
.online.on .dot { background: #1dc981; }
.credit { font-size: 26rpx; color: $text-muted; }
.hint { text-align: center; color: $text-muted; font-size: 26rpx; margin-top: 120rpx; }
.tasks { display: flex; flex-direction: column; gap: 20rpx; }
.task { background: $surface; border-radius: $radius-card; padding: 24rpx; }
.task.taken { opacity: .45; }
.task-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8rpx; }
.order-code { font-size: 26rpx; color: $text-muted; }
.urgent { margin-left: 12rpx; color: #e02020; font-size: 22rpx; background: #ffece8; padding: 2rpx 12rpx; border-radius: 999rpx; }
.fee { font-size: 34rpx; font-weight: 700; color: $brand-color; }
.task-addr { display: block; font-size: 30rpx; font-weight: 600; color: $text; margin-bottom: 6rpx; }
.task-route { display: block; font-size: 24rpx; color: $text-muted; margin-bottom: 20rpx; }
.grab { background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 30rpx; }
.grab[disabled] { opacity: .5; }
</style>
