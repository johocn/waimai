<template>
    <view class="hall">
        <view class="topbar">
            <view class="online" :class="{ on }" @tap="toggleOnline">
                <view class="dot"></view><text>{{ on ? $t('riderHome.online') : $t('riderHome.offline') }}</text>
            </view>
            <text class="credit">{{ $t('riderHome.credit').replace('{n}', String(profile?.riderCredit ?? '--')) }}</text>
        </view>
        <!-- P2-5 合规提醒：健康证/保险过期或背调未通过 → 禁止接单（后端同样拦截） -->
        <view class="comp-warn" v-if="compLevel !== 'ok'" :class="'cw-' + compLevel">
            <text class="cw-t">{{ $t('riderHome.compTip_' + compLevel) }}</text>
            <text class="cw-d" v-if="compDetail">{{ compDetail }}</text>
        </view>
        <!-- 骑手评分（用户 1-5 星均分）+ 班次/申诉入口 -->
        <view class="quick">
            <text class="rating">
                {{ $t('riderHome.rating').replace('{r}', avgText).replace('{n}', String(rating?.ratingCount ?? 0)) }}
            </text>
            <view class="quick-links">
                <navigator class="qlink" url="/pkg-rider/pages/rider-shifts" hover-class="none">{{ $t('riderHome.myShifts') }}</navigator>
                <navigator class="qlink" url="/pkg-rider/pages/rider-appeal" hover-class="none">{{ $t('riderHome.appeal') }}</navigator>
            </view>
        </view>
        <!-- 我的评价（P3-3）：均分之外展示逐条评分/标签/留言 -->
        <view class="reviews" v-if="reviews.length">
            <text class="rv-title">{{ $t('riderHome.reviewsTitle') }}</text>
            <view v-for="rv in reviews" :key="rv.id" class="rv">
                <view class="rv-head">
                    <text class="rv-stars">{{ '★'.repeat(rv.rating) }}<text class="rv-stars-off">{{ '★'.repeat(5 - rv.rating) }}</text></text>
                    <text class="rv-time">{{ shortDate(rv.createdAt) }}</text>
                </view>
                <text v-if="rv.tags && rv.tags.length" class="rv-tags">{{ rv.tags.join(' · ') }}</text>
                <text v-if="rv.comment" class="rv-comment">{{ rv.comment }}</text>
            </view>
        </view>
        <navigator class="jh-entry" url="/pkg-jianghu/pages/jh-hall" hover-class="none">
            <view class="jh-ic">江</view>
            <view class="jh-b">
                <text class="jh-h">{{ $t('riderHome.jhTitle') }}</text>
                <text class="jh-p">{{ $t('riderHome.jhDesc') }}</text>
            </view>
            <text class="jh-go">{{ $t('riderHome.jhGo') }}</text>
        </navigator>
        <view class="hint" v-if="!on">{{ $t('riderHome.offlineHint') }}</view>
        <EmptyState v-else-if="!tasks.length" :text="$t('riderHome.empty')" />
        <view v-else class="tasks">
            <view v-for="t in tasks" :key="t.id" class="task" :class="{ taken: takenIds.has(t.id) }">
                <view class="task-head">
                    <text class="order-code">#{{ t.code }}<text v-if="isUrgent(t)" class="urgent">{{ $t('riderHome.urgent') }}</text><text v-if="routeCount(t) > 1" class="route-tag">{{ $t('riderHome.routeTag').replace('{n}', String(routeCount(t))) }}</text></text>
                    <text class="fee">¥{{ fmt(runnerFee(t)) }}</text>
                </view>
                <text class="task-addr">{{ t.channelName || '' }} · {{ t.customFields?.campusZone || '' }} {{ buildingName(t) }}</text>
                <text class="task-route">{{ ['R1', 'R2'].includes(t.customFields?.fulfillmentRoute ?? '') ? $t('riderHome.routeR1') : $t('riderHome.routeDirect') }}</text>
                <button class="grab" :disabled="grabbing || takenIds.has(t.id)" @tap="grab(t)">
                    {{ takenIds.has(t.id) ? $t('riderHome.taken') : grabbing ? $t('riderHome.locking') : $t('riderHome.grab') }}
                </button>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow, onHide, onUnload } from '@dcloudio/uni-app';
import { fetchHall, grabOrder, fetchBuildingMap } from '../../api/queries/hall';
import { myRiderProfile, riderOnline, riderHeartbeat } from '../../api/queries/rider';
import { fetchMyRiderRating, fetchMyRiderReviews } from '../../api/queries/support';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';
import EmptyState from '../../components/EmptyState.vue';

const auth = useAuthStore();
const locale = useLocaleStore();
const on = ref(false);
const profile = ref<any>(null);
const rating = ref<any>(null);
const reviews = ref<any[]>([]);
const avgText = computed(() => {
    const n = Number(rating.value?.avgRating);
    return rating.value?.ratingCount ? (Number.isFinite(n) ? n.toFixed(1) : '--') : '--';
});

/* ===== P2-5 合规：与后端 rider-compliance.ts 同口径（blocked > pending > expiring > ok） ===== */
const compLevel = computed(() => {
    const c = profile.value?.compliance;
    if (!c) return 'ok';
    if (c.blocked) return 'blocked';
    if (c.pending) return 'pending';
    if ((c.items || []).some((i: any) => i.status === 'expiring')) return 'expiring';
    return 'ok';
});

/** 异常项摘要：健康证 · 2026-08-01 / 背景调查 · 未通过 */
const compDetail = computed(() => {
    const items = (profile.value?.compliance?.items || []).filter((i: any) => i.status !== 'ok');
    return items
        .map((i: any) => locale.t('riderHome.comp_' + i.key) + (i.expiry ? ' · ' + shortDay(i.expiry) : ''))
        .join(' / ');
});

function shortDay(v?: string): string {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 评价时间显示为 MM-DD HH:mm（列表只展示最近 5 条，无需完整年份） */
function shortDate(v?: string): string {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
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
    stopTimers();
    profile.value = await myRiderProfile().catch(() => null);
    if (profile.value?.riderStatus !== 'approved') {
        return uni.redirectTo({ url: '/pkg-rider/pages/rider-join' });
    }
    rating.value = await fetchMyRiderRating().catch(() => null);
    reviews.value = await fetchMyRiderReviews(0, 5).catch(() => []);
    buildingMap.value = await fetchBuildingMap().catch(() => ({}));
    await refresh();
    pollTimer = setInterval(refresh, 10000);      // spec §6.1 大厅轮询 10s
    beatTimer = setInterval(() => { if (on.value) riderHeartbeat().catch(() => {}); }, 30000);  // 在线才心跳 30s
});
// 定时器清理必须同时挂 onHide 与 onUnload：抢单成功走 redirectTo（触发 onUnload 而非
// onHide），只挂 onHide 会泄漏轮询循环（每循环 = 1 店铺列表 + 27 渠道请求/10s）；
// onShow 先 stopTimers 防止重复进入叠加多组定时器。
function stopTimers() { clearInterval(pollTimer); clearInterval(beatTimer); pollTimer = null; beatTimer = null; }
onHide(stopTimers);
onUnload(stopTimers);

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

/** plan 3.3 顺路组：同 routeGroupId 的大厅 open 单数（>1 显示徽标，抢单自动整组接走） */
function routeCount(t: any) {
    const gid = t.customFields?.routeGroupId;
    if (!gid) return 1;
    return tasks.value.filter((x: any) => x.customFields?.routeGroupId === gid).length;
}

async function refresh() {
    try { tasks.value = await fetchHall(); } catch { /* 网络抖动静默重试 */ }
}

async function toggleOnline() {
    // 合规失效时后端会拒绝上线，前端提前拦截并给出明确原因
    if (!on.value && compLevel.value === 'blocked') {
        return uni.showToast({ title: locale.t('riderHome.compTip_blocked'), icon: 'none' });
    }
    on.value = !on.value;
    try {
        await riderOnline(on.value);
        if (on.value) await refresh();
    } catch {
        on.value = !on.value;
        uni.showToast({ title: locale.t('riderHome.opFail'), icon: 'none' });
    }
}

async function grab(t: any) {
    grabbing.value = true;   // 乐观锁 UI：立即置灰（spec §6.1.2）
    try {
        await grabOrder(t.id, t.channelToken);   // 成功返回订单（带来源渠道 token 抢单）
        uni.redirectTo({ url: '/pkg-rider/pages/rider-delivering' });
    } catch (e: any) {
        const msg: string = e?.response?.errors?.[0]?.message || e?.message || locale.t('riderHome.grabFail');
        // includes 匹配的是后端中文错误消息原文，不随语言切换
        if (msg.includes('已被抢')) {
            takenIds.value.add(t.id);
            uni.showToast({ title: locale.t('riderHome.grabTaken'), icon: 'none' });
        } else if (msg.includes('不能抢自己')) {
            uni.showToast({ title: locale.t('riderHome.grabSelf'), icon: 'none' });
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
/* P2-5 合规提醒（健康证/保险/背调异常） */
.comp-warn { display: flex; flex-direction: column; gap: 6rpx; padding: 20rpx 24rpx; border-radius: $radius-card; margin-bottom: 24rpx;
    .cw-t { font-size: 26rpx; font-weight: 600; }
    .cw-d { font-size: 22rpx; opacity: .85; line-height: 1.6; }
    &.cw-blocked { background: #fdeaea; .cw-t { color: #b91c1c; } .cw-d { color: #b91c1c; } }
    &.cw-expiring { background: #fdf3e0; .cw-t { color: #b45309; } .cw-d { color: #b45309; } }
    &.cw-pending { background: #f0f1f4; .cw-t { color: #6b7280; } .cw-d { color: #6b7280; } } }
/* 评分 + 班次/申诉快捷入口 */
.quick { display: flex; justify-content: space-between; align-items: center; gap: 16rpx; margin-bottom: 24rpx; }
.rating { font-size: 24rpx; color: #f59e0b; }
.quick-links { display: flex; gap: 12rpx; }
.qlink { font-size: 22rpx; color: $text-muted; background: $surface; border-radius: 999rpx; padding: 8rpx 20rpx; }
/* 我的评价（P3-3）：逐条评分/标签/留言 */
.reviews { background: $surface; border-radius: $radius-card; padding: 20rpx 24rpx; margin-bottom: 24rpx; }
.rv-title { display: block; font-size: 26rpx; font-weight: 600; color: $text; margin-bottom: 12rpx; }
.rv { padding-top: 16rpx; border-top: 1rpx solid rgba(0, 0, 0, .06); }
.rv:first-of-type { border-top: none; padding-top: 0; }
.rv-head { display: flex; justify-content: space-between; align-items: center; }
.rv-stars { font-size: 24rpx; color: #f59e0b; letter-spacing: 2rpx; }
.rv-stars-off { color: rgba(0, 0, 0, .12); }
.rv-time { font-size: 22rpx; color: $text-muted; }
.rv-tags { display: block; font-size: 22rpx; color: #0a8f4d; margin-top: 8rpx; }
.rv-comment { display: block; font-size: 24rpx; color: $text; margin-top: 6rpx; line-height: 1.6; }
/* 江湖入口（拾光传信者）：水墨风卡片，与订单列表区隔 */
.jh-entry {
    display: flex; align-items: center; margin-bottom: 24rpx; padding: 24rpx; border-radius: $radius-card;
    background: linear-gradient(140deg, #2a2621 0%, #1f1b16 55%, #3a2a20 100%);
}
.jh-ic {
    width: 72rpx; height: 72rpx; border-radius: 20rpx; margin-right: 20rpx; flex-shrink: 0;
    background: linear-gradient(150deg, #e3c877, #c8a24a 45%, #9c7830);
    color: #402c06; font-size: 34rpx; font-weight: 700; text-align: center; line-height: 72rpx;
}
.jh-b { flex: 1; display: flex; flex-direction: column; }
.jh-h { font-size: 30rpx; font-weight: 700; color: #f2ece1; }
.jh-p { font-size: 22rpx; color: #cfc7b8; margin-top: 8rpx; line-height: 1.6; }
.jh-go { font-size: 24rpx; color: #e3c877; }
.hint { text-align: center; color: $text-muted; font-size: 26rpx; margin-top: 120rpx; }
.tasks { display: flex; flex-direction: column; gap: 20rpx; }
.task { background: $surface; border-radius: $radius-card; padding: 24rpx; }
.task.taken { opacity: .45; }
.task-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8rpx; }
.order-code { font-size: 26rpx; color: $text-muted; }
.urgent { margin-left: 12rpx; color: #e02020; font-size: 22rpx; background: #ffece8; padding: 2rpx 12rpx; border-radius: 999rpx; }
.route-tag { margin-left: 12rpx; color: #0a8f4d; font-size: 22rpx; background: rgba(29, 201, 129, .12); padding: 2rpx 12rpx; border-radius: 999rpx; }
.fee { font-size: 34rpx; font-weight: 700; color: $brand-color; }
.task-addr { display: block; font-size: 30rpx; font-weight: 600; color: $text; margin-bottom: 6rpx; }
.task-route { display: block; font-size: 24rpx; color: $text-muted; margin-bottom: 20rpx; }
.grab { background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 30rpx; }
.grab[disabled] { opacity: .5; }
</style>
