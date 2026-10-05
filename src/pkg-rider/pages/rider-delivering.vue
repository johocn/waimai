<template>
    <view class="delivering">
        <EmptyState v-if="!task" text="暂无进行中的任务，去大厅接一单吧" />
        <view v-else class="task-card">
            <text class="code">#{{ task.code }} · {{ task.customFields?.fulfillmentRoute === 'R1' ? '接力单' : '直送单' }}</text>
            <text class="addr">📍 {{ task.customFields?.campusZone || '' }} {{ buildingName }}</text>
            <text class="slot" v-if="task.customFields?.deliverySlotText">期望送达 {{ task.customFields.deliverySlotText }}</text>
            <text class="sla">建议 45 分钟内送达</text>

            <!-- 状态推进区：deliveryStatus 域 assigned/in_progress/delivered/exception（小写，已校准） -->
            <view class="actions">
                <block v-if="status === 'assigned'">
                    <button class="act" @tap="startTask">我已到店 · 开始取货</button>
                    <button class="act ghost" @tap="transfer(false)">转单（未取货）</button>
                </block>
                <block v-else-if="status === 'in_progress'">
                    <text class="picked">已取货，配送中</text>
                    <button class="act" @tap="deliverFlow">我已送达（拍照存证）</button>
                    <button class="act ghost" @tap="transfer(true)">转单（已取货 · 拍照交接）</button>
                </block>
                <block v-else-if="status === 'delivered'">
                    <text class="done">已送达 ✓ 分成 ¥{{ fmt(task.customFields?.riderEarning ?? 0) }} 已入账</text>
                </block>
                <block v-else-if="status === 'exception'">
                    <text class="exc">异常处理中，平台将介入协调</text>
                </block>
            </view>

            <view class="extra" v-if="status === 'assigned' || status === 'in_progress'">
                <button class="act ghost small" @tap="reportException">异常上报（联系不上学生等）</button>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow, onHide } from '@dcloudio/uni-app';
import { fetchMyTasks, fetchBuildingMap } from '../../api/queries/hall';
import { startTask, deliverTask, reportException, transferTask } from '../../api/queries/task-actions';
import { uploadCustomerAsset } from '../../api/mutations/upload';
import { useAuthStore } from '../../stores/auth';
import EmptyState from '../../components/EmptyState.vue';

const auth = useAuthStore();
const task = ref<any>(null);
const buildingMap = ref<Record<string, string>>({});
let timer: any = null;

const status = computed(() => task.value?.customFields?.deliveryStatus ?? '');
const buildingName = computed(() => buildingMap.value[String(task.value?.customFields?.buildingId)] ?? '');

onShow(async () => {
    if (!auth.token) {
        return uni.redirectTo({ url: '/pages/login/index?redirect=' + encodeURIComponent('/pkg-rider/pages/rider-delivering') });
    }
    buildingMap.value = await fetchBuildingMap().catch(() => ({}));
    await refresh();
    timer = setInterval(refresh, 8000);   // spec §6.2 任务页 8s 轮询
});
onHide(() => clearInterval(timer));

function fmt(fen: number) { return (fen / 100).toFixed(2); }

async function refresh() {
    const list = await fetchMyTasks().catch(() => []);
    task.value = list[0] ?? null;   // 一期单人单任务
}

async function begin() {
    await startTask(task.value.id, task.value.channelToken);
    uni.showToast({ title: '已开始取货', icon: 'none' });
    await refresh();
}

async function takePhoto(): Promise<string> {
    const res: any = await uni.chooseImage({ count: 1 });
    const path = res?.tempFilePaths?.[0];
    if (!path) throw new Error('cancel');
    const asset = await uploadCustomerAsset(path);
    return asset.source;
}

async function deliverFlow() {
    try {
        const photo = await takePhoto();          // 送达拍照必填（spec §6.2.2）
        await deliverTask(task.value.id, [photo], undefined, task.value.channelToken);
        uni.showToast({ title: '已送达，分成入账', icon: 'success' });
        await refresh();
    } catch (e: any) {
        if (e?.message !== 'cancel') {
            uni.showToast({ title: e?.response?.errors?.[0]?.message || '送达失败', icon: 'none' });
        }
    }
}

async function transfer(picked: boolean) {
    try {
        let photos: string[] = [];
        if (picked) photos = [await takePhoto()]; // 已取货转单强制拍照交接（spec §6.2.4）
        await transferTask(task.value.id, photos, undefined, task.value.channelToken);
        uni.showToast({ title: '已转回大厅', icon: 'none' });
        await refresh();
    } catch (e: any) {
        if (e?.message !== 'cancel') {
            uni.showToast({ title: e?.response?.errors?.[0]?.message || '转单失败', icon: 'none' });
        }
    }
}

async function reportException() {
    // 一期固定类型 no_recipient（联系不上学生），后续扩 UI 选择器
    try {
        await reportException(task.value.id, 'no_recipient', [], '学生电话未接通，已尝试催取', task.value.channelToken);
        uni.showToast({ title: '已上报，平台将介入', icon: 'none' });
        await refresh();
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '上报失败', icon: 'none' });
    }
}
</script>

<style scoped lang="scss">
.delivering { padding: 24rpx; }
.task-card { background: $surface; border-radius: $radius-card; padding: 32rpx; }
.code { display: block; font-size: 24rpx; color: $text-muted; margin-bottom: 8rpx; }
.addr { display: block; font-size: 34rpx; font-weight: 600; color: $text; margin-bottom: 8rpx; }
.slot { display: block; font-size: 24rpx; color: $text-muted; margin-bottom: 8rpx; }
.sla { display: block; font-size: 22rpx; color: #efa500; margin-bottom: 32rpx; }
.picked, .done { display: block; font-size: 28rpx; color: #1dc981; margin-bottom: 24rpx; }
.exc { display: block; font-size: 28rpx; color: #e02020; margin-bottom: 24rpx; }
.actions { display: flex; flex-direction: column; gap: 16rpx; }
.act { background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 30rpx; }
.act.ghost { background: $bg; color: $text; }
.act.small { font-size: 24rpx; }
.extra { margin-top: 32rpx; }
</style>
