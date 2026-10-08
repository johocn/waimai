<template>
    <view class="delivering">
        <EmptyState v-if="!tasks.length" :text="$t('riderDelivering.empty')" />

        <!-- plan 3.3 路线任务组卡（方案 A）：同 routeGroupId ≥2 单聚合为一张组卡 -->
        <view v-for="g in groups" :key="g.gid" class="task-card group">
            <view class="ghead">
                <text class="gname">📍 {{ g.orders[0].customFields?.campusZone || '' }} {{ buildingName(g.orders[0]) }}</text>
                <text class="gbadge">{{ $t('riderDelivering.groupBadge').replace('{n}', String(g.orders.length)) }}</text>
            </view>
            <text class="gmeta">
                {{ $t('riderDelivering.expect').replace('{t}', g.orders[0].customFields?.deliverySlotText || $t('riderDelivering.asap')) }}
                <template v-if="deliveredCount(g)"> · {{ $t('riderDelivering.deliveredProgress').replace('{a}', String(deliveredCount(g))).replace('{b}', String(g.orders.length)) }}</template>
            </text>
            <text class="gmeta warn" v-if="groupUrged(g)">{{ $t('riderDelivering.urgedGroup') }}</text>

            <!-- 子单行：点行展开单子单操作，点圆圈勾选（仅配送中） -->
            <view v-for="o in g.orders" :key="o.id" class="subwrap">
                <view class="sub" @tap="toggleRow(o)">
                    <view
                        class="ck" :class="{ on: checked.has(String(o.id)) }"
                        v-if="o.customFields?.deliveryStatus === 'in_progress'"
                        @tap.stop="toggleCheck(o)"
                    >✓</view>
                    <view class="sub-info">
                        <view class="sub-top">
                            <text class="code">#{{ o.code }} · {{ o.customFields?.fulfillmentRoute === 'R1' ? $t('riderDelivering.relay') : $t('riderDelivering.direct') }}</text>
                            <text class="amt" v-if="o.customFields?.deliveryStatus === 'delivered'">¥{{ fmt(o.customFields?.riderEarning ?? 0) }}</text>
                        </view>
                        <text class="sub-st">{{ statusLabel(o) }}</text>
                    </view>
                </view>
                <!-- 单子单操作行 -->
                <view class="rowops" v-if="expanded === String(o.id)">
                    <block v-if="o.customFields?.deliveryStatus === 'assigned'">
                        <button class="act ghost small" @tap="begin(o)">{{ $t('riderDelivering.startPick') }}</button>
                        <button class="act ghost small" @tap="transfer(o, false)">{{ $t('riderDelivering.transfer') }}</button>
                    </block>
                    <block v-else-if="o.customFields?.deliveryStatus === 'in_progress'">
                        <button class="act ghost small" @tap="deliverOne(o)">{{ $t('riderDelivering.deliverOne') }}</button>
                        <button class="act ghost small" @tap="transfer(o, true)">{{ $t('riderDelivering.transferPicked') }}</button>
                    </block>
                    <button class="act ghost small" @tap="openExcPanel(o)">{{ $t('riderDelivering.excReport') }}</button>
                </view>
            </view>

            <!-- 组级主操作：整组待取货 → 批量开始；配送中 → 勾选批量送达 -->
            <button v-if="allAssigned(g)" class="act" :disabled="busy" @tap="startGroup(g)">
                {{ $t('riderDelivering.startGroup').replace('{n}', String(g.orders.length)) }}
            </button>
            <button
                v-else-if="anyInProgress(g)" class="act" :disabled="busy || !checkedCount(g)"
                @tap="deliverGroup(g)"
            >{{ checkedCount(g) ? $t('riderDelivering.deliverChecked').replace('{n}', String(checkedCount(g))) : $t('riderDelivering.deliverPickFirst') }}</button>
        </view>

        <!-- 独立任务卡（无组 / 组内剩余单）：保持原单任务交互 -->
        <view v-for="o in singles" :key="o.id" class="task-card">
            <text class="code">#{{ o.code }} · {{ o.customFields?.fulfillmentRoute === 'R1' ? $t('riderDelivering.relay') : $t('riderDelivering.direct') }}</text>
            <text class="addr">📍 {{ o.customFields?.campusZone || '' }} {{ buildingName(o) }}</text>
            <text class="slot" v-if="o.customFields?.deliverySlotText">{{ $t('riderDelivering.expectSlot').replace('{t}', o.customFields.deliverySlotText) }}</text>
            <text class="sla">{{ $t('riderDelivering.sla') }}</text>
            <text class="urged" v-if="o.customFields?.urged">{{ $t('riderDelivering.urged') }}</text>

            <view class="actions">
                <block v-if="o.customFields?.deliveryStatus === 'assigned'">
                    <button class="act" :disabled="busy" @tap="begin(o)">{{ $t('riderDelivering.startSingle') }}</button>
                    <button class="act ghost" :disabled="busy" @tap="transfer(o, false)">{{ $t('riderDelivering.transferNoPick') }}</button>
                </block>
                <block v-else-if="o.customFields?.deliveryStatus === 'in_progress'">
                    <text class="picked">{{ $t('riderDelivering.picked') }}</text>
                    <button class="act" :disabled="busy" @tap="deliverOne(o)">{{ $t('riderDelivering.deliverPhoto') }}</button>
                    <button class="act ghost" :disabled="busy" @tap="transfer(o, true)">{{ $t('riderDelivering.transferPickedPhoto') }}</button>
                </block>
                <block v-else-if="o.customFields?.deliveryStatus === 'delivered'">
                    <text class="done">{{ $t('riderDelivering.doneEarn').replace('{n}', fmt(o.customFields?.riderEarning ?? 0)) }}</text>
                </block>
                <block v-else-if="o.customFields?.deliveryStatus === 'exception'">
                    <text class="exc">{{ $t('riderDelivering.excHandling') }}</text>
                </block>
            </view>

            <view class="extra" v-if="['assigned', 'in_progress'].includes(o.customFields?.deliveryStatus)">
                <button class="act ghost small" @tap="openExcPanel(o)">{{ $t('riderDelivering.excReport') }}</button>
            </view>
        </view>

        <!-- 异常上报面板（目标单 excTarget：独立卡按钮或组内子单行进入） -->
        <view class="task-card" v-if="excPanelOpen && excTarget">
            <view class="exc-chips">
                <view
                    v-for="t in excTypes" :key="t.key"
                    class="chip" :class="{ on: excType === t.key }"
                    @tap="excType = t.key"
                >{{ t.label }}</view>
            </view>
            <textarea class="exc-note" v-model="excNote" :placeholder="$t('riderDelivering.excNotePh')" />
            <view class="exc-photos">
                <view class="shot" v-for="(p, i) in excPhotos" :key="i">
                    <image :src="p" mode="aspectFill" @tap="previewExcPhoto(i)" />
                    <text class="del" @tap="excPhotos.splice(i, 1)">×</text>
                </view>
                <view class="shot add" v-if="excPhotos.length < 3" @tap="addExcPhoto">{{ $t('riderDelivering.excAddPhoto') }}</view>
            </view>
            <button class="act" :disabled="excSubmitting" @tap="submitException">{{ $t('riderDelivering.excSubmit') }}</button>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow, onHide, onUnload } from '@dcloudio/uni-app';
import { fetchMyTasks, fetchBuildingMap } from '../../api/queries/hall';
import { startTask, deliverTask, reportException, transferTask } from '../../api/queries/task-actions';
import { riderReportLocation } from '../../api/mutations/campus';
import { uploadCustomerAsset } from '../../api/mutations/upload';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';
import EmptyState from '../../components/EmptyState.vue';

const auth = useAuthStore();
const locale = useLocaleStore();
const tasks = ref<any[]>([]);   // plan 3.3：多任务列表（原单任务 ref task 改为列表）
const buildingMap = ref<Record<string, string>>({});
const checked = ref(new Set<string>());   // 组内勾选待送达子单（order id）
const expanded = ref<string | null>();    // 展开单子单操作行的 order id
const busy = ref(false);
let timer: any = null;
let locTimer: any = null;

const status = (o: any) => o.customFields?.deliveryStatus ?? '';

const ACTIVE = ['assigned', 'in_progress', 'exception'];

/** 活动任务（含所在组仍有活动单的 delivered 子单，用于组进度展示） */
const activeOrders = computed(() => {
    const active = tasks.value.filter(o => ACTIVE.includes(status(o)));
    const gids = new Set(active.map(o => o.customFields?.routeGroupId).filter(Boolean));
    return tasks.value.filter(o => ACTIVE.includes(status(o)) || gids.has(o.customFields?.routeGroupId));
});

/** 路线任务组：同 routeGroupId 且成员 ≥2（打包由后端 T1.5 完成，前端纯聚合） */
const groups = computed(() => {
    const map = new Map<string, any[]>();
    for (const o of activeOrders.value) {
        const gid = o.customFields?.routeGroupId;
        if (!gid) continue;
        const arr = map.get(gid) ?? [];
        arr.push(o);
        map.set(gid, arr);
    }
    return [...map.entries()]
        .filter(([, arr]) => arr.length >= 2)
        .map(([gid, orders]) => ({ gid, orders }));
});

const groupedIds = computed(() => new Set(groups.value.flatMap(g => g.orders.map(o => String(o.id)))));
const singles = computed(() => activeOrders.value.filter(o => !groupedIds.value.has(String(o.id))));

// 异常上报面板（plan 3.4 补全，plan 3.3 增加目标单 excTarget 支持组内子单上报）
const EXC_TYPES = [
    { key: 'merchant_issue', labelKey: 'excMerchantIssue', statuses: ['assigned'] },
    { key: 'no_recipient', labelKey: 'excNoRecipient', statuses: ['in_progress'] },
    { key: 'food_spilled', labelKey: 'excFoodSpilled', statuses: ['in_progress'] },
    { key: 'other', labelKey: 'excOther', statuses: ['assigned', 'in_progress'] },
];
const excPanelOpen = ref(false);
const excTarget = ref<any>(null);
const excType = ref('');
const excNote = ref('');
const excPhotos = ref<string[]>([]);
const excSubmitting = ref(false);
const excTypes = computed(() => EXC_TYPES
    .filter(t => t.statuses.includes(status(excTarget.value)))
    .map(t => ({ ...t, label: locale.t(`riderDelivering.${t.labelKey}`) })));

onShow(async () => {
    if (!auth.token) {
        return uni.redirectTo({ url: '/pages/login/index?redirect=' + encodeURIComponent('/pkg-rider/pages/rider-delivering') });
    }
    stopTimers();
    buildingMap.value = await fetchBuildingMap().catch(() => ({}));
    await refresh();
    timer = setInterval(refresh, 8000);   // spec §6.2 任务页 8s 轮询
    // plan 2.2 位置上报：配送中每 10s 上报经纬度（gcj02），多任务逐单上报同一位置，失败静默
    reportLocation();
    locTimer = setInterval(reportLocation, 10000);
});
// 与 rider-home 同款：onUnload（redirectTo/navigateBack 离开）与 onHide 都要清定时器，
// onShow 先 stopTimers 防叠加，否则 8s 轮询与 10s 定位上报会在页面销毁后持续泄漏。
function stopTimers() { clearInterval(timer); clearInterval(locTimer); timer = null; locTimer = null; }
onHide(stopTimers);
onUnload(stopTimers);

/** plan 2.2：配送中向平台上报当前位置，用户端订单跟踪可看骑手 Marker */
function reportLocation() {
    const actives = activeOrders.value.filter(o => ['assigned', 'in_progress'].includes(status(o)));
    if (!actives.length) return;
    uni.getLocation({
        type: 'gcj02',
        isHighAccuracy: true,
        success: (res: any) => {
            for (const o of actives) {
                void riderReportLocation(o.id, res.latitude, res.longitude).catch(() => {});
            }
        },
        fail: () => { /* 未授权/定位失败静默跳过，下轮再试 */ },
    });
}

function fmt(fen: number) { return (fen / 100).toFixed(2); }

async function refresh() {
    const list = await fetchMyTasks().catch(() => []);
    tasks.value = list;
    // 勾选集清理：已不在活动列表的单移除勾选，避免幽灵计数
    const alive = new Set(list.map(o => String(o.id)));
    for (const id of [...checked.value]) {
        if (!alive.has(id)) checked.value.delete(id);
    }
}

function buildingName(o: any) {
    return buildingMap.value[String(o.customFields?.buildingId)] ?? '';
}

function statusLabel(o: any) {
    switch (status(o)) {
        case 'assigned': return locale.t('riderDelivering.stAssigned');
        case 'in_progress': return locale.t('riderDelivering.stInProgress');
        case 'delivered': return locale.t('riderDelivering.stDelivered').replace('{n}', fmt(o.customFields?.riderEarning ?? 0));
        case 'exception': return locale.t('riderDelivering.stException');
        default: return '';
    }
}

const allAssigned = (g: any) => g.orders.every((o: any) => status(o) === 'assigned');
const anyInProgress = (g: any) => g.orders.some((o: any) => status(o) === 'in_progress');
const deliveredCount = (g: any) => g.orders.filter((o: any) => status(o) === 'delivered').length;
const groupUrged = (g: any) => g.orders.some((o: any) => o.customFields?.urged && status(o) !== 'delivered');

function checkedCount(g: any) {
    return g.orders.filter((o: any) => checked.value.has(String(o.id))).length;
}

function toggleCheck(o: any) {
    const id = String(o.id);
    if (checked.value.has(id)) checked.value.delete(id);
    else checked.value.add(id);
    // 触发 Set 响应式更新
    checked.value = new Set(checked.value);
}

function toggleRow(o: any) {
    expanded.value = expanded.value === String(o.id) ? null : String(o.id);
}

async function takePhoto(): Promise<string> {
    const res: any = await uni.chooseImage({ count: 1 });
    const path = res?.tempFilePaths?.[0];
    if (!path) throw new Error('cancel');
    const asset = await uploadCustomerAsset(path);
    return asset.source;
}

/** 批量开始取货：组内全部 assigned 单逐一推进（同组同渠道，token 逐单透传） */
async function startGroup(g: any) {
    busy.value = true;
    try {
        for (const o of g.orders.filter((x: any) => status(x) === 'assigned')) {
            await startTask(o.id, o.channelToken);
        }
        uni.showToast({ title: locale.t('riderDelivering.started'), icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('riderDelivering.opFail'), icon: 'none' });
    } finally {
        busy.value = false;
        await refresh();
    }
}

async function begin(o: any) {
    busy.value = true;
    try {
        await startTask(o.id, o.channelToken);
        uni.showToast({ title: locale.t('riderDelivering.started'), icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('riderDelivering.opFail'), icon: 'none' });
    } finally {
        busy.value = false;
        await refresh();
    }
}

/** 勾选批量送达：一次拍照存证，逐单调 campusDeliverTask（同一照片，各单独立入账分成） */
async function deliverGroup(g: any) {
    const targets = g.orders.filter((o: any) => checked.value.has(String(o.id)) && status(o) === 'in_progress');
    if (!targets.length) return;
    try {
        const photo = await takePhoto();   // 送达拍照必填（spec §6.2.2），批量共用一张
        busy.value = true;
        let ok = 0;
        for (const o of targets) {
            try {
                await deliverTask(o.id, [photo], undefined, o.channelToken);
                checked.value.delete(String(o.id));
                ok++;
            } catch { /* 单单失败不阻断其余子单，refresh 后状态如实 */ }
        }
        checked.value = new Set(checked.value);
        uni.showToast({ title: locale.t('riderDelivering.deliveredN').replace('{n}', String(ok)), icon: 'success' });
    } catch (e: any) {
        if (e?.message !== 'cancel') {
            uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('riderDelivering.deliverFail'), icon: 'none' });
        }
    } finally {
        busy.value = false;
        await refresh();
    }
}

async function deliverOne(o: any) {
    try {
        const photo = await takePhoto();
        busy.value = true;
        await deliverTask(o.id, [photo], undefined, o.channelToken);
        uni.showToast({ title: locale.t('riderDelivering.deliveredOne'), icon: 'success' });
    } catch (e: any) {
        if (e?.message !== 'cancel') {
            uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('riderDelivering.deliverFail'), icon: 'none' });
        }
    } finally {
        busy.value = false;
        await refresh();
    }
}

async function transfer(o: any, picked: boolean) {
    try {
        let photos: string[] = [];
        if (picked) photos = [await takePhoto()]; // 已取货转单强制拍照交接（spec §6.2.4）
        busy.value = true;
        await transferTask(o.id, photos, undefined, o.channelToken);
        uni.showToast({ title: locale.t('riderDelivering.toHall'), icon: 'none' });
    } catch (e: any) {
        if (e?.message !== 'cancel') {
            uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('riderDelivering.transferFail'), icon: 'none' });
        }
    } finally {
        busy.value = false;
        await refresh();
    }
}

function openExcPanel(o: any) {
    excTarget.value = o;
    excPanelOpen.value = true;
    expanded.value = null;
    if (excType.value && !excTypes.value.some(t => t.key === excType.value)) excType.value = '';
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
            uni.showToast({ title: locale.t('riderDelivering.photoFail'), icon: 'none' });
        }
    }
}

async function submitException() {
    if (!excTarget.value) return;
    if (!excType.value) {
        uni.showToast({ title: locale.t('riderDelivering.excPickType'), icon: 'none' });
        return;
    }
    if (excType.value === 'other' && !excNote.value.trim()) {
        uni.showToast({ title: locale.t('riderDelivering.excNoteRequired'), icon: 'none' });
        return;
    }
    if (excType.value === 'food_spilled' && !excPhotos.value.length) {
        uni.showToast({ title: locale.t('riderDelivering.excPhotoRequired'), icon: 'none' });
        return;
    }
    excSubmitting.value = true;
    try {
        await reportException(
            excTarget.value.id, excType.value, excPhotos.value,
            excNote.value.trim() || undefined, excTarget.value.channelToken,
        );
        uni.showToast({ title: locale.t('riderDelivering.excSubmitted'), icon: 'none' });
        excPanelOpen.value = false;
        excType.value = '';
        excNote.value = '';
        excPhotos.value = [];
        await refresh();
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('riderDelivering.excSubmitFail'), icon: 'none' });
    } finally {
        excSubmitting.value = false;
    }
}
</script>

<style scoped lang="scss">
.delivering { padding: 24rpx; display: flex; flex-direction: column; gap: 20rpx; }
.task-card { background: $surface; border-radius: $radius-card; padding: 32rpx; }

/* 路线任务组卡（plan 3.3 方案 A） */
.task-card.group { border: 2rpx solid $brand-color; }
.ghead { display: flex; justify-content: space-between; align-items: center; gap: 12rpx; }
.gname { font-size: 30rpx; font-weight: 600; color: $text; }
.gbadge { flex: none; font-size: 22rpx; color: #0a8f4d; background: rgba(29, 201, 129, .12); padding: 4rpx 16rpx; border-radius: 999rpx; }
.gmeta { display: block; font-size: 24rpx; color: $text-muted; margin: 8rpx 0 16rpx; }
.gmeta.warn { color: #e02020; }

/* 子单行 */
.subwrap { margin-bottom: 12rpx; }
.sub { display: flex; align-items: center; gap: 16rpx; background: rgba(0, 0, 0, .03); border-radius: $radius-card; padding: 20rpx; }
.ck { flex: none; width: 44rpx; height: 44rpx; border-radius: 999rpx; border: 2rpx solid $text-muted; background: $surface;
      display: flex; align-items: center; justify-content: center; font-size: 26rpx; color: transparent; }
.ck.on { background: $brand-color; border-color: $brand-color; color: #fff; font-weight: 700; }
.sub-info { flex: 1; min-width: 0; }
.sub-top { display: flex; justify-content: space-between; align-items: center; gap: 12rpx; }
.code { font-size: 26rpx; color: $text-muted; }
.amt { font-size: 26rpx; font-weight: 600; color: #0a8f4d; }
.sub-st { display: block; font-size: 24rpx; color: $text-muted; margin-top: 4rpx; }

/* 单子单操作行 */
.rowops { display: flex; flex-wrap: wrap; gap: 12rpx; padding: 12rpx 0 0 20rpx; }

.code, .addr, .slot, .sla, .urged { display: block; }
.addr { font-size: 30rpx; font-weight: 600; color: $text; margin-top: 8rpx; }
.slot { font-size: 24rpx; color: $text-muted; margin-top: 8rpx; }
.sla { font-size: 24rpx; color: $text-muted; margin-top: 4rpx; }
.urged { font-size: 24rpx; color: #e02020; margin-top: 8rpx; }
.actions { margin-top: 24rpx; display: flex; flex-direction: column; gap: 16rpx; }
.picked, .done, .exc { font-size: 26rpx; color: $text; text-align: center; padding: 8rpx 0; }
.act { background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 30rpx; }
.act.ghost { background: transparent; border: 2rpx solid $text-muted; color: $text-muted; }
.act.small { font-size: 24rpx; padding: 0 24rpx; line-height: 56rpx; min-height: 56rpx; }
.act[disabled] { opacity: .5; }
.extra { margin-top: 16rpx; }

/* 异常上报面板 */
.exc-chips { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 16rpx; }
.chip { font-size: 24rpx; color: $text-muted; border: 2rpx solid $text-muted; border-radius: 999rpx; padding: 8rpx 24rpx; }
.chip.on { color: #0a8f4d; border-color: $brand-color; background: rgba(29, 201, 129, .08); }
.exc-note { width: 100%; box-sizing: border-box; min-height: 120rpx; background: rgba(0, 0, 0, .03); border-radius: $radius-card; padding: 20rpx; font-size: 26rpx; margin-bottom: 16rpx; }
.exc-photos { display: flex; gap: 12rpx; margin-bottom: 16rpx; }
.shot { position: relative; width: 140rpx; height: 140rpx; border-radius: $radius-card; overflow: hidden; }
.shot image { width: 100%; height: 100%; }
.shot .del { position: absolute; top: 0; right: 0; width: 40rpx; height: 40rpx; line-height: 40rpx; text-align: center; background: rgba(0, 0, 0, .5); color: #fff; font-size: 24rpx; }
.shot.add { border: 2rpx dashed $text-muted; display: flex; align-items: center; justify-content: center; font-size: 24rpx; color: $text-muted; }
</style>
