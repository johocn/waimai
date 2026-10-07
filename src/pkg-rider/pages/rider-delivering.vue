<template>
    <view class="delivering">
        <EmptyState v-if="!task" text="暂无进行中的任务，去大厅接一单吧" />
        <view v-else class="task-card">
            <text class="code">#{{ task.code }} · {{ task.customFields?.fulfillmentRoute === 'R1' ? '接力单' : '直送单' }}</text>
            <text class="addr">📍 {{ task.customFields?.campusZone || '' }} {{ buildingName }}</text>
            <text class="slot" v-if="task.customFields?.deliverySlotText">期望送达 {{ task.customFields.deliverySlotText }}</text>
            <text class="sla">建议 45 分钟内送达</text>
            <!-- plan 2.4：用户催单标记（后端 campusUrgeOrder 写入，8s 轮询自动带出） -->
            <text class="urged" v-if="task.customFields?.urged">⚠ 用户已催单，请尽快送达</text>

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
                <button class="act ghost small" @tap="toggleExcPanel">异常上报</button>
                <!-- 页内上报面板（plan 3.4 补全）：类型 chips + 备注 + 拍照存证，类型随配送状态过滤 -->
                <view class="exc-panel" v-if="excPanelOpen">
                    <view class="exc-chips">
                        <view
                            v-for="t in excTypes" :key="t.key"
                            class="chip" :class="{ on: excType === t.key }"
                            @tap="excType = t.key"
                        >{{ t.label }}</view>
                    </view>
                    <textarea class="exc-note" v-model="excNote" placeholder="补充说明（选「其他」必填）" />
                    <view class="exc-photos">
                        <view class="shot" v-for="(p, i) in excPhotos" :key="i">
                            <image :src="p" mode="aspectFill" @tap="previewExcPhoto(i)" />
                            <text class="del" @tap="excPhotos.splice(i, 1)">×</text>
                        </view>
                        <view class="shot add" v-if="excPhotos.length < 3" @tap="addExcPhoto">＋ 拍照存证</view>
                    </view>
                    <button class="act" :disabled="excSubmitting" @tap="submitException">提交上报</button>
                </view>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow, onHide } from '@dcloudio/uni-app';
import { fetchMyTasks, fetchBuildingMap } from '../../api/queries/hall';
import { startTask, deliverTask, reportException, transferTask } from '../../api/queries/task-actions';
import { riderReportLocation } from '../../api/mutations/campus';
import { uploadCustomerAsset } from '../../api/mutations/upload';
import { useAuthStore } from '../../stores/auth';
import EmptyState from '../../components/EmptyState.vue';

const auth = useAuthStore();
const task = ref<any>(null);
const buildingMap = ref<Record<string, string>>({});
let timer: any = null;
let locTimer: any = null;

const status = computed(() => task.value?.customFields?.deliveryStatus ?? '');
const buildingName = computed(() => buildingMap.value[String(task.value?.customFields?.buildingId)] ?? '');

// 异常上报面板状态（plan 3.4 补全）：类型按 deliveryStatus 过滤——
// 待取货 assigned → 商家无法出餐/其他；配送中 in_progress → 联系不上收件人/餐品洒漏（需拍照）/其他
const EXC_TYPES = [
    { key: 'merchant_issue', label: '商家无法出餐', statuses: ['assigned'] },
    { key: 'no_recipient', label: '联系不上收件人', statuses: ['in_progress'] },
    { key: 'food_spilled', label: '餐品洒漏损坏', statuses: ['in_progress'] },
    { key: 'other', label: '其他', statuses: ['assigned', 'in_progress'] },
];
const excPanelOpen = ref(false);
const excType = ref('');
const excNote = ref('');
const excPhotos = ref<string[]>([]);
const excSubmitting = ref(false);
const excTypes = computed(() => EXC_TYPES.filter(t => t.statuses.includes(status.value)));

onShow(async () => {
    if (!auth.token) {
        return uni.redirectTo({ url: '/pages/login/index?redirect=' + encodeURIComponent('/pkg-rider/pages/rider-delivering') });
    }
    buildingMap.value = await fetchBuildingMap().catch(() => ({}));
    await refresh();
    timer = setInterval(refresh, 8000);   // spec §6.2 任务页 8s 轮询
    // plan 2.2 位置上报：配送中每 10s 上报经纬度（gcj02），仅 assigned/in_progress 有效，失败静默
    reportLocation();
    locTimer = setInterval(reportLocation, 10000);
});
onHide(() => { clearInterval(timer); clearInterval(locTimer); });

/** plan 2.2：配送中向平台上报当前位置，用户端订单跟踪可看骑手 Marker */
function reportLocation() {
    const st = task.value?.customFields?.deliveryStatus;
    if (!task.value || (st !== 'assigned' && st !== 'in_progress')) return;
    uni.getLocation({
        type: 'gcj02',
        isHighAccuracy: true,
        success: (res: any) => {
            void riderReportLocation(task.value.id, res.latitude, res.longitude).catch(() => {});
        },
        fail: () => { /* 未授权/定位失败静默跳过，下轮再试 */ },
    });
}

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

function toggleExcPanel() {
    excPanelOpen.value = !excPanelOpen.value;
    // 状态推进后已选类型可能不在当前可选列表，重开面板时清掉
    if (excPanelOpen.value && excType.value && !excTypes.value.some(t => t.key === excType.value)) {
        excType.value = '';
    }
}

function previewExcPhoto(i: number) {
    uni.previewImage({ urls: excPhotos.value, current: excPhotos.value[i] });
}

async function addExcPhoto() {
    try {
        const photo = await takePhoto();
        if (excPhotos.value.length < 3) excPhotos.value.push(photo);
    } catch (e: any) {
        if (e?.message !== 'cancel') {
            uni.showToast({ title: '拍照失败，请重试', icon: 'none' });
        }
    }
}

async function submitException() {
    if (!excType.value) {
        uni.showToast({ title: '请选择异常类型', icon: 'none' });
        return;
    }
    if (excType.value === 'other' && !excNote.value.trim()) {
        uni.showToast({ title: '请填写备注说明', icon: 'none' });
        return;
    }
    if (excType.value === 'food_spilled' && !excPhotos.value.length) {
        uni.showToast({ title: '请拍照存证后提交', icon: 'none' });
        return;
    }
    excSubmitting.value = true;
    try {
        await reportException(task.value.id, excType.value, excPhotos.value, excNote.value.trim() || undefined, task.value.channelToken);
        uni.showToast({ title: '已上报，平台将介入', icon: 'none' });
        excPanelOpen.value = false;
        excType.value = '';
        excNote.value = '';
        excPhotos.value = [];
        await refresh();
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '上报失败', icon: 'none' });
    } finally {
        excSubmitting.value = false;
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
.urged { display: block; font-size: 26rpx; color: #e02020; font-weight: 600; margin-bottom: 16rpx; }
.picked, .done { display: block; font-size: 28rpx; color: #1dc981; margin-bottom: 24rpx; }
.exc { display: block; font-size: 28rpx; color: #e02020; margin-bottom: 24rpx; }
.actions { display: flex; flex-direction: column; gap: 16rpx; }
.act { background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 30rpx; }
.act.ghost { background: $bg; color: $text; }
.act.small { font-size: 24rpx; }
.extra { margin-top: 32rpx; }
.exc-panel { margin-top: 24rpx; padding: 24rpx; background: $bg; border-radius: $radius-card; display: flex; flex-direction: column; gap: 20rpx;
    .exc-chips { display: flex; flex-wrap: wrap; gap: 16rpx; }
    .chip { padding: 12rpx 28rpx; border-radius: 999rpx; font-size: 26rpx; color: $text-muted; background: $surface; border: 1.5px solid transparent; }
    .chip.on { color: $brand-color; border-color: $brand-color; }
    .exc-note { width: 100%; height: 140rpx; font-size: 26rpx; padding: 16rpx; box-sizing: border-box; }
    .exc-photos { display: flex; flex-wrap: wrap; gap: 20rpx; }
    .shot { position: relative; width: 136rpx; height: 136rpx;
        image { width: 100%; height: 100%; border-radius: 12rpx; }
        .del { position: absolute; top: -12rpx; right: -12rpx; width: 36rpx; height: 36rpx; line-height: 32rpx; text-align: center; background: #e02020; color: #fff; border-radius: 999rpx; font-size: 24rpx; }
        &.add { display: flex; align-items: center; justify-content: center; border: 1.5px dashed $text-muted; border-radius: 12rpx; color: $text-muted; font-size: 22rpx; }
    }
}
</style>
