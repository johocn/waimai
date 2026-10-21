import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
    jianghuDailyRank,
    jianghuDemands,
    jianghuEventContent,
    jianghuEventCurrent,
    jianghuEventDetail,
    jianghuHall,
    jianghuIntelMarket,
    jianghuProfile,
    jianghuRankLadder,
    jianghuStory,
    jianghuTaskDetail,
    jianghuMyRecords,
    jianghuVoices
} from '../api/queries/jianghu';
import { jianghuAdoptVoice, jianghuCollectClue, jianghuDeadDropDeliver, jianghuDeadDropFastForward, jianghuDeadDropInspect, jianghuDeadDropPickup, jianghuDeadDropPlace, jianghuDeadDropReset, jianghuReleaseTask, jianghuResetDemo, jianghuSubmitRumor, jianghuSubmitVoice, jianghuTakeTask, jianghuUnlockIntel, jianghuVerify } from '../api/mutations/jianghu';
import type {
    ClueInput,
    DeadDropMarker,
    JianghuChapter,
    JianghuClue,
    JianghuDeadDrop,
    JianghuDemand,
    JianghuEvent,
    JianghuEventContent,
    JianghuEventDetail,
    JianghuIntel,
    JianghuProfile,
    JianghuRankRow,
    JianghuRecord,
    JianghuTask,
    JianghuVerifyResult,
    RankTier,
    RumorInput,
    VoiceInput,
    JianghuVoice
} from '../types/jianghu';
import { jianghuListClues } from '../api/admin/jianghu';

// 江湖域状态。风格与 auth/tenant 一致（setup store）；
// 工程未引入持久化插件，这里手写 uni.setStorageSync 缓存档案，用于秒开首屏。
const PROFILE_CACHE_KEY = 'jianghu_profile';

export const useJianghuStore = defineStore('jianghu', () => {
    const profile = ref<JianghuProfile | null>(null);
    const ladder = ref<RankTier[]>([]);
    const tasks = ref<JianghuTask[]>([]);
    const bounties = ref<JianghuTask[]>([]);
    const market = ref<JianghuIntel[]>([]);
    const records = ref<JianghuRecord[]>([]);
    const rankRows = ref<JianghuRankRow[]>([]);
    const event = ref<JianghuEvent | null>(null);
    /** P2 事件详情（含线索墙与贡献者） */
    const eventDetail = ref<JianghuEventDetail | null>(null);
    /** 江湖事件文案（Strapi 内容源）；非空时覆盖实体内联文案 */
    const eventContent = ref<JianghuEventContent | null>(null);
    /** 运营后台审核用线索列表（含 PENDING 待审，由 admin 专属查询拉取，玩家不可见 PENDING） */
    const eventClues = ref<JianghuClue[]>([]);
    /** 当前查看中的密信（详情页用） */
    const currentTask = ref<JianghuTask | null>(null);
    /** 江湖志章节（按段位门槛解锁） */
    const chapters = ref<JianghuChapter[]>([]);
    /** 玩家心声流 */
    const voices = ref<JianghuVoice[]>([]);
    /** 沉淀的客户需求 */
    const demands = ref<JianghuDemand[]>([]);
    /** 死信箱（虚拟暗点投递）当前暗点 + 当前（快进后）时钟 */
    const deadDrop = ref<JianghuDeadDrop | null>(null);
    const ddNowIso = ref<string>(new Date().toISOString());
    const loading = ref(false);
    /** 骑手最近一次定位（用于大厅 distanceKm）；拿不到则留空，距离态隐藏 */
    const location = ref<{ lat: number; lng: number } | null>(null);

    /** 轻量获取定位：失败静默（不弹窗阻塞），仅用于距离展示增强 */
    async function ensureLocation() {
        if (location.value) return location.value;
        try {
            const r: any = await new Promise((resolve, reject) =>
                uni.getLocation({ type: 'gcj02', success: resolve, fail: reject }),
            );
            if (r && typeof r.latitude === 'number') {
                location.value = { lat: r.latitude, lng: r.longitude };
            }
        } catch {
            /* 用户拒绝或不可用 → 不阻断主流程 */
        }
        return location.value;
    }

    /* ── 派生：段位区间与进度 ── */
    const currentTier = computed<RankTier | null>(() => {
        if (!ladder.value.length || !profile.value) return null;
        const rep = profile.value.rep;
        return ladder.value.reduce<RankTier | null>((acc, r) => (rep >= r.rep ? r : acc), null) ?? ladder.value[0];
    });

    const nextTier = computed<RankTier | null>(() => {
        if (!ladder.value.length || !profile.value) return null;
        return ladder.value.find((r) => r.rep > profile.value!.rep) ?? null;
    });

    const prevTier = computed<RankTier | null>(() => {
        if (!ladder.value.length || !profile.value) return null;
        const rep = profile.value.rep;
        return [...ladder.value].reverse().find((r) => r.rep <= rep) ?? ladder.value[0];
    });

    /** 当前段位区间内的进度百分比 */
    const progressPct = computed(() => {
        const p = profile.value;
        const prev = prevTier.value;
        const next = nextTier.value;
        if (!p || !prev) return 0;
        if (!next) return 100;
        const span = Math.max(1, next.rep - prev.rep);
        return Math.min(100, Math.round(((p.rep - prev.rep) / span) * 100));
    });

    /** 距离下一段位还差多少声望 */
    const gapRep = computed(() => {
        const p = profile.value;
        const next = nextTier.value;
        if (!p || !next) return 0;
        return Math.max(0, next.rep - p.rep);
    });

    /** 按近 7 日均 160 声望估算还需几天（真实环境应取近 7 日流水，见设计文档 §7 段位塔交互） */
    const etaDays = computed(() => {
        if (gapRep.value <= 0) return 0;
        return Math.max(1, Math.ceil(gapRep.value / 160));
    });

    /** 信用分 <60 或被面壁时冻结江湖任务 */
    const frozen = computed(() => {
        const p = profile.value;
        if (!p) return false;
        if (p.credit < 60) return true;
        if (p.frozenUntil && new Date(p.frozenUntil).getTime() > Date.now()) return true;
        return false;
    });

    const frozenReason = computed(() => {
        const p = profile.value;
        if (!p) return '';
        if (p.credit < 60) return '信用分低于 60，江湖任务已冻结';
        if (p.frozenUntil && new Date(p.frozenUntil).getTime() > Date.now()) return '面壁中，暂不可接取江湖任务';
        return '';
    });

    /* ── 读 ── */
    function restoreCache() {
        const cached = uni.getStorageSync(PROFILE_CACHE_KEY);
        if (cached) {
            try {
                profile.value = typeof cached === 'string' ? JSON.parse(cached) : cached;
            } catch {
                profile.value = null;
            }
        }
    }

    function cacheProfile() {
        if (profile.value) uni.setStorageSync(PROFILE_CACHE_KEY, profile.value);
    }

    async function loadProfile() {
        profile.value = await jianghuProfile();
        cacheProfile();
    }

    async function loadLadder() {
        ladder.value = (await jianghuRankLadder()) as RankTier[];
    }

    async function loadHall() {
        const loc = await ensureLocation();
        tasks.value = await jianghuHall({ type: 'LETTER', lat: loc?.lat, lng: loc?.lng });
    }

    async function loadBounties() {
        const loc = await ensureLocation();
        bounties.value = await jianghuHall({ type: 'INTEL', lat: loc?.lat, lng: loc?.lng });
    }

    async function loadMarket() {
        market.value = await jianghuIntelMarket();
    }

    async function loadEvent() {
        event.value = await jianghuEventCurrent().catch(() => null);
    }

    /** 江湖志：章节 + 玩家心声 + 沉淀需求 一并拉取 */
    async function loadStory() {
        const [ch, vs, ds] = await Promise.all([jianghuStory(), jianghuVoices(), jianghuDemands()]);
        chapters.value = ch;
        voices.value = vs;
        demands.value = ds;
    }

    async function loadEventDetail() {
        eventDetail.value = await jianghuEventDetail().catch(() => null);
        // 文案源（Strapi）与实体内联文案并行拉取；文案源为空时前端回退到实体字段
        eventContent.value = await jianghuEventContent().catch(() => null);
    }

    /** 运营后台：拉取当前事件的线索（含待审），供审核 */
    async function loadEventClues() {
        try {
            eventClues.value = await jianghuListClues();
        } catch {
            eventClues.value = [];
        }
    }

    async function collectClue(input: ClueInput) {
        const d = await jianghuCollectClue(input);
        eventDetail.value = d;
        await loadProfile();
        return d;
    }

    async function loadRecords() {
        records.value = await jianghuMyRecords();
    }

    async function loadRankRows() {
        rankRows.value = await jianghuDailyRank();
    }

    /** 首屏：档案 + 段位 + 大厅 + 榜单并行拉取 */
    async function loadAll() {
        loading.value = true;
        try {
            await Promise.all([loadProfile(), loadLadder(), loadHall(), loadRankRows()]);
        } finally {
            loading.value = false;
        }
    }

    async function openTask(taskId: string) {
        const t = await jianghuTaskDetail(taskId);
        currentTask.value = t;
        return t;
    }

    /* ── 写 ── */
    async function takeTask(taskId: string) {
        const t = await jianghuTakeTask(taskId);
        currentTask.value = t;
        return t;
    }

    async function releaseTask(taskId: string) {
        await jianghuReleaseTask(taskId);
        await loadHall();
    }

    async function verify(taskId: string, code?: string, lat?: number, lng?: number): Promise<JianghuVerifyResult> {
        const res = await jianghuVerify(taskId, code, lat, lng);
        if (res.ok) {
            await loadProfile();
            await loadHall();
        }
        return res;
    }

    async function submitRumor(input: RumorInput) {
        const res = await jianghuSubmitRumor(input);
        await loadRecords();
        return res;
    }

    /** 提交玩家心声（期待 / 玩法 / 建议），落库后刷新江湖志 */
    async function submitVoice(input: VoiceInput) {
        const res = await jianghuSubmitVoice(input);
        await loadStory();
        return res;
    }

    /** 运营采纳心声，沉淀为需求 */
    async function adoptVoice(id: string) {
        await jianghuAdoptVoice(id);
        await loadStory();
    }

    /* ── 死信箱（虚拟暗点投递） ── */
    /** 查看暗点 + 同步当前时钟（阶段由服务端时间锁裁决，前端只渲染） */
    async function loadDeadDrop() {
        const r = await jianghuDeadDropInspect();
        deadDrop.value = r.drop;
        ddNowIso.value = r.nowIso;
    }

    /** 投放情报（自动加密，明文不回传前端） */
    async function placeDeadDrop(input: { topic: string; plainText: string; marker: DeadDropMarker }) {
        const d = await jianghuDeadDropPlace(input);
        deadDrop.value = d;
        await loadProfile();
        return d;
    }

    /** 上线错时取件，取走后明文下发并结算声望 */
    async function pickupDeadDrop() {
        const r = await jianghuDeadDropPickup();
        deadDrop.value = r.drop;
        await loadProfile();
        return r;
    }

    /** 取件后情报流转至交通站 → 总舵核验 */
    async function deliverDeadDrop() {
        const r = await jianghuDeadDropDeliver();
        await loadProfile();
        return r;
    }

    /** 演示用时间快进（分钟） */
    async function fastForwardDeadDrop(min: number) {
        const r = await jianghuDeadDropFastForward(min);
        deadDrop.value = r.drop;
        ddNowIso.value = r.nowIso;
        return r;
    }

    /** 重置暗点（清空当前暗点） */
    async function resetDeadDrop() {
        await jianghuDeadDropReset();
        deadDrop.value = null;
        ddNowIso.value = new Date().toISOString();
    }

    async function unlockIntel(intelId: string) {
        const it = await jianghuUnlockIntel(intelId);
        await loadMarket();
        await loadProfile();
        return it;
    }

    function reset() {
        profile.value = null;
        ladder.value = [];
        tasks.value = [];
        bounties.value = [];
        market.value = [];
        records.value = [];
        rankRows.value = [];
        event.value = null;
        currentTask.value = null;
        location.value = null;
        try { uni.removeStorageSync(PROFILE_CACHE_KEY); } catch { /* ignore */ }
    }

    /** 重置演示数据（仅 mock 模式）：清空本地进度并恢复初始态 */
    async function resetDemo() {
        try {
            await jianghuResetDemo();
        } catch (e: any) {
            return uni.showToast({ title: (e?.message || '重置失败').slice(0, 30), icon: 'none' });
        }
        reset();
        await loadAll();
    }

    return {
        profile, ladder, tasks, bounties, market, records, rankRows, event, eventDetail, eventContent, eventClues, currentTask, chapters, voices, demands, deadDrop, ddNowIso, loading, location,
        currentTier, nextTier, prevTier, progressPct, gapRep, etaDays, frozen, frozenReason,
        ensureLocation, restoreCache, loadProfile, loadLadder, loadHall, loadBounties, loadMarket, loadEvent, loadEventDetail, loadEventClues, collectClue, loadRecords, loadRankRows, loadAll, loadStory, loadDeadDrop,
        openTask, takeTask, releaseTask, verify, submitRumor, submitVoice, adoptVoice, unlockIntel, reset, resetDemo, placeDeadDrop, pickupDeadDrop, deliverDeadDrop, fastForwardDeadDrop, resetDeadDrop
    };
});
