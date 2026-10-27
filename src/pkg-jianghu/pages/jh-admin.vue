<template>
    <view class="jh">
        <view class="top">
            <text class="title">江湖运营后台</text>
            <text class="sub">发布江湖事件 · 审核线索与自定义技能</text>
        </view>
        <text class="hint">内部运营工具：复用 admin 接口的 jianghuCreateEvent / jianghuAuditClue。生产需运营 admin token（VITE_ADMIN_TOKEN），开发期走 mock。</text>

        <view v-if="loading" class="loading">江湖动态加载中…</view>
        <view v-else-if="!d" class="empty">当前暂无进行中的江湖事件</view>

        <template v-else>
            <!-- 当前事件概览 -->
            <view class="hero">
                <view class="hero-top">
                    <view class="seal gold">治</view>
                    <view class="hero-id">
                        <text class="name">{{ d.name }}</text>
                        <text class="badge" :class="{ solved: d.solved }">{{ d.solved ? '已破案' : '拼图进行中' }}</text>
                    </view>
                </view>
                <text class="desc">{{ d.desc }}</text>
                <view class="info">
                    <view class="ic"><text class="ic-n">{{ d.collected }}/{{ d.total }}</text><text class="ic-l">拼图进度</text></view>
                    <view class="ic"><text class="ic-n">{{ d.rewardPoolRep ?? 0 }}</text><text class="ic-l">奖励池声望</text></view>
                    <view class="ic"><text class="ic-n">{{ d.perPersonLimit }}</text><text class="ic-l">单人上限</text></view>
                    <view class="ic"><text class="ic-n">{{ endText }}</text><text class="ic-l">截止</text></view>
                </view>
            </view>

            <!-- 线索审核 -->
            <view class="sec"><text class="sec-h">线索审核</text><text class="sec-m">{{ pendingCount }} 条待处理 / 共 {{ jh.eventClues.length }} 条</text></view>
            <view class="tabs">
                <view class="tab" :class="{ on: filter === 'PENDING' }" @tap="setFilter('PENDING')">待审<text v-if="pendingCount" class="dot">{{ pendingCount }}</text></view>
                <view class="tab" :class="{ on: filter === 'SHOWN' }" @tap="setFilter('SHOWN')">已上墙</view>
                <view class="tab" :class="{ on: filter === 'REJECTED' }" @tap="setFilter('REJECTED')">已下线</view>
                <view class="tab" :class="{ on: filter === 'ALL' }" @tap="setFilter('ALL')">全部</view>
            </view>
            <view v-for="c in reviewClues" :key="c.id" class="clue" :class="c.status">
                <view class="clue-h">
                    <text class="clue-n">{{ c.nickname || '匿名传信者' }}</text>
                    <text class="tag" :class="c.status">{{ statusText(c.status) }}</text>
                </view>
                <text class="clue-c">{{ c.content }}</text>
                <text class="clue-s">来源：{{ c.sourceNote }}</text>
                <view class="clue-act">
                    <button v-if="c.status !== 'SHOWN'" class="btn approve" @tap="audit(c.id, true)" :disabled="acting">通过上墙</button>
                    <button v-if="c.status !== 'REJECTED'" class="btn reject" @tap="audit(c.id, false)" :disabled="acting">下线</button>
                </view>
            </view>
            <EmptyState v-if="!reviewClues.length" text="本分类暂无线索" />

            <!-- 自定义技能审核（UGC）：pending 待审 / approved 已入库 / rejected 已驳回 -->
            <view class="sec"><text class="sec-h">自定义技能审核</text><text class="sec-m">{{ skillPendingCount }} 条待处理 / 共 {{ jh.adminSkills.length }} 条</text></view>
            <view class="tabs">
                <view class="tab" :class="{ on: skillFilter === 'pending' }" @tap="setSkillFilter('pending')">待审<text v-if="skillPendingCount" class="dot">{{ skillPendingCount }}</text></view>
                <view class="tab" :class="{ on: skillFilter === 'approved' }" @tap="setSkillFilter('approved')">已入库</view>
                <view class="tab" :class="{ on: skillFilter === 'rejected' }" @tap="setSkillFilter('rejected')">已驳回</view>
                <view class="tab" :class="{ on: skillFilter === 'ALL' }" @tap="setSkillFilter('ALL')">全部</view>
            </view>
            <view v-for="s in reviewSkills" :key="s.id" class="clue" :class="s.status">
                <view class="clue-h">
                    <text class="clue-n">{{ s.name }}<text class="sk-cat">{{ catText(s.category) }}</text></text>
                    <text class="tag" :class="s.status">{{ skillStatusText(s.status) }}</text>
                </view>
                <text class="clue-c">{{ s.desc }}</text>
                <text class="clue-s">提交者：{{ s.nickname || '匿名传信者' }}</text>
                <view class="clue-act">
                    <button v-if="s.status !== 'approved'" class="btn approve" @tap="auditSkill(s.id, true)" :disabled="skillActing">通过入库</button>
                    <button v-if="s.status !== 'rejected'" class="btn reject" @tap="auditSkill(s.id, false)" :disabled="skillActing">驳回</button>
                </view>
            </view>
            <EmptyState v-if="!reviewSkills.length" text="本分类暂无技能" />

            <!-- 发布新事件 -->
            <view class="sec"><text class="sec-h">发布江湖事件</text><text class="sec-m">将成为最新当前事件</text></view>
            <view class="form">
                <text class="fl">事件名称</text>
                <input class="inp" v-model="form.name" placeholder="如「书院异动」" maxlength="30" />
                <text class="fl">事件背景</text>
                <textarea class="ta" v-model="form.desc" placeholder="一句话交代剧情背景与拼图目标" maxlength="200" />
                <view class="grid">
                    <view class="gf">
                        <text class="fl">线索总数</text>
                        <input class="inp" v-model="form.total" type="number" placeholder="默认 6" />
                    </view>
                    <view class="gf">
                        <text class="fl">单人上限</text>
                        <input class="inp" v-model="form.perPersonLimit" type="number" placeholder="默认 2" />
                    </view>
                    <view class="gf">
                        <text class="fl">奖励池声望</text>
                        <input class="inp" v-model="form.rewardPoolRep" type="number" placeholder="集齐均分" />
                    </view>
                </view>
                <text class="fl">截止时间（留空为长期，格式 2026-10-11T22:00:00+08:00）</text>
                <input class="inp" v-model="form.endAt" placeholder="如 2026-10-11T22:00:00+08:00" />
                <button class="submit" :disabled="creating" @tap="create">{{ creating ? '发布中…' : '发布江湖事件' }}</button>
            </view>
        </template>

        <!-- 玩家心声 & 沉淀需求：运营侧看见玩家提交的期待/玩法/建议，并可采纳为方向 -->
        <view class="sec"><text class="sec-h">玩家心声</text><text class="sec-m">{{ voices.length }} 条 · 可采纳</text></view>
        <view class="voice-list">
            <view v-for="v in voices" :key="v.id" class="voice-item" :class="{ done: v.precipitated }">
                <view class="vi-top">
                    <text class="vi-tag" :class="'t-' + v.kind">{{ v.kindText }}</text>
                    <text class="vi-t">{{ fmt(v.createdAt) }}</text>
                </view>
                <text class="vi-c">{{ v.content }}</text>
                <view class="vi-act">
                    <button v-if="!v.precipitated" class="vi-adopt" :disabled="adopting" @tap="adopt(v.id)">采纳为需求</button>
                    <text v-else class="vi-done">已沉淀 ✓</text>
                </view>
            </view>
        </view>

        <view class="sec"><text class="sec-h">沉淀的需求</text><text class="sec-m">未来游戏方向</text></view>
        <view class="demand-list">
            <view v-for="dm in demands" :key="dm.id" class="demand">
                <view class="dm-b">
                    <text class="dm-tag">{{ dm.tag }}</text>
                    <text class="dm-t">{{ dm.text }}</text>
                </view>
                <text class="dm-votes">{{ dm.votes }} 人同感</text>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useJianghuStore } from '../../stores/jianghu';
import { jianghuAuditClue, jianghuCreateEvent } from '../../api/admin/jianghu';
import { SKILL_CATEGORIES } from '../scene/world';
import EmptyState from '../../components/EmptyState.vue';
import type { JianghuEventInput } from '../../types/jianghu';

const jh = useJianghuStore();
const loading = ref(false);
const acting = ref(false);
const creating = ref(false);
const adopting = ref(false);

const voices = computed(() => jh.voices);
const demands = computed(() => jh.demands);

function fmt(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const d = computed(() => jh.eventDetail);
/** 审核用线索列表：来自 admin 专属查询（含 PENDING 待审），玩家侧不可见 PENDING */
/** 默认聚焦待审，便于运营优先处理；筛选为客户端过滤（始终拉全量，使待处理计数稳定） */
const filter = ref<'PENDING' | 'SHOWN' | 'REJECTED' | 'ALL'>('PENDING');
function setFilter(f: typeof filter.value) {
    filter.value = f;
}
const reviewClues = computed(() =>
    filter.value === 'ALL' ? jh.eventClues : jh.eventClues.filter((c) => c.status === filter.value),
);
/** 待处理计数始终基于全量（不受当前筛选影响） */
const pendingCount = computed(() => jh.eventClues.filter((c) => c.status === 'PENDING').length);

const endText = computed(() => {
    if (!d.value?.endAt) return '长期';
    const diff = new Date(d.value.endAt).getTime() - Date.now();
    if (diff <= 0) return '已截止';
    const day = Math.floor(diff / 86400000);
    return day > 0 ? day + ' 天后' : Math.max(1, Math.floor(diff / 3600000)) + ' 小时后';
});

function statusText(s?: string) {
    return s === 'SHOWN' ? '已上墙' : s === 'REJECTED' ? '已下线' : '待审';
}

/* ── 自定义技能审核（UGC） ── */
const SKILL_CAT_TEXT: Record<string, string> = SKILL_CATEGORIES.reduce((acc, c) => {
    acc[c.id] = c.name;
    return acc;
}, {} as Record<string, string>);
function catText(c: string): string {
    return SKILL_CAT_TEXT[c] || c;
}
function skillStatusText(s: string): string {
    return s === 'approved' ? '已入库' : s === 'rejected' ? '已驳回' : '待审';
}
/** 默认聚焦待审；筛选为客户端过滤（始终拉全量，使待处理计数稳定） */
const skillFilter = ref<'pending' | 'approved' | 'rejected' | 'ALL'>('pending');
const skillActing = ref(false);
function setSkillFilter(f: typeof skillFilter.value) {
    skillFilter.value = f;
}
const reviewSkills = computed(() =>
    skillFilter.value === 'ALL' ? jh.adminSkills : jh.adminSkills.filter((s) => s.status === skillFilter.value),
);
const skillPendingCount = computed(() => jh.adminSkills.filter((s) => s.status === 'pending').length);

async function auditSkill(id: string, approve: boolean) {
    skillActing.value = true;
    try {
        await jh.auditCustomSkill(id, approve);
        uni.showToast({ title: approve ? '已通过入库' : '已驳回', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '操作失败').slice(0, 30), icon: 'none' });
    } finally {
        skillActing.value = false;
    }
}

const form = ref<JianghuEventInput>({ name: '', desc: '', total: undefined, perPersonLimit: undefined, rewardPoolRep: undefined, endAt: '' });

onShow(async () => {
    loading.value = true;
    try {
        await Promise.all([jh.loadEventDetail(), jh.loadEventClues(), jh.loadStory(), jh.loadAdminCustomSkills()]);
    } catch {
        uni.showToast({ title: '江湖事件暂未开放', icon: 'none' });
    } finally {
        loading.value = false;
    }
});

async function audit(id: string, approve: boolean) {
    acting.value = true;
    try {
        await jianghuAuditClue(id, approve);
        await Promise.all([jh.loadEventDetail(), jh.loadEventClues()]);
        uni.showToast({ title: approve ? '已通过上墙' : '已下线索', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '操作失败').slice(0, 30), icon: 'none' });
    } finally {
        acting.value = false;
    }
}

async function create() {
    if (!form.value.name?.trim()) return uni.showToast({ title: '请填写事件名称', icon: 'none' });
    if (!form.value.desc?.trim()) return uni.showToast({ title: '请填写事件背景', icon: 'none' });
    creating.value = true;
    try {
        const input: JianghuEventInput = {
            name: form.value.name.trim(),
            desc: form.value.desc.trim(),
            total: form.value.total ? Number(form.value.total) : undefined,
            perPersonLimit: form.value.perPersonLimit ? Number(form.value.perPersonLimit) : undefined,
            rewardPoolRep: form.value.rewardPoolRep ? Number(form.value.rewardPoolRep) : undefined,
            endAt: form.value.endAt?.trim() || undefined,
        };
        await jianghuCreateEvent(input);
        form.value = { name: '', desc: '', total: undefined, perPersonLimit: undefined, rewardPoolRep: undefined, endAt: '' };
        await jh.loadEventDetail();
        uni.showToast({ title: '江湖事件已发布', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '发布失败').slice(0, 30), icon: 'none' });
    } finally {
        creating.value = false;
    }
}

async function adopt(id: string) {
    adopting.value = true;
    try {
        await jh.adoptVoice(id);
        uni.showToast({ title: '已沉淀为需求', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '操作失败').slice(0, 30), icon: 'none' });
    } finally {
        adopting.value = false;
    }
}
</script>

<style scoped lang="scss">
.jh { padding: 24rpx; padding-bottom: 60rpx; }
.top { display: flex; flex-direction: column; }
.title { font-size: 40rpx; font-weight: 700; color: $jh-ink; }
.sub { font-size: 24rpx; color: $jh-ink-2; margin-top: 6rpx; }
.hint {
    display: block; font-size: 22rpx; color: $jh-ink-2; line-height: 1.6; margin: 16rpx 0 8rpx;
    padding: 16rpx 20rpx; border-radius: 16rpx; background: rgba(200, 162, 74, .12); border: 1rpx solid rgba(200, 162, 74, .25);
}
.loading, .empty { text-align: center; color: $jh-ink-2; padding: 120rpx 0; font-size: 28rpx; }

.hero {
    background: linear-gradient(140deg, #221e19 0%, #1f1b16 55%, #3a2a20 100%);
    border-radius: 24rpx; padding: 32rpx; color: #f2ece1; box-shadow: 0 8rpx 24rpx rgba(31, 27, 22, .18); margin-top: 16rpx;
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
.info { display: flex; gap: 12rpx; }
.ic {
    flex: 1; background: rgba(255, 255, 255, .08); border-radius: 16rpx; padding: 18rpx 4rpx; text-align: center;
}
.ic-n { display: block; font-size: 28rpx; font-weight: 700; color: #fff; }
.ic-l { display: block; font-size: 20rpx; color: #cfc7b8; margin-top: 6rpx; }

.sec { display: flex; justify-content: space-between; align-items: baseline; margin: 36rpx 4rpx 16rpx; }
.sec-h { font-size: 32rpx; font-weight: 700; color: $jh-ink; }
.sec-m { font-size: 22rpx; color: $jh-ink-2; }

.tabs { display: flex; gap: 12rpx; margin: 0 4rpx 16rpx; }
.tab {
    flex: 1; text-align: center; font-size: 24rpx; color: $jh-ink-2;
    padding: 14rpx 0; border-radius: 14rpx; background: $surface; position: relative;
}
.tab.on { color: $jh-ink; background: rgba(200, 162, 74, .16); font-weight: 700; }
.tab .dot {
    position: absolute; top: -8rpx; right: 16rpx; min-width: 28rpx; height: 28rpx; line-height: 28rpx;
    font-size: 18rpx; color: #fff; background: $jh-cinnabar; border-radius: 999rpx; padding: 0 6rpx;
}

.clue {
    background: $surface; border-radius: 20rpx; padding: 24rpx; margin-bottom: 16rpx;
    box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06); border-left: 8rpx solid $jh-jade;
}
.clue.REJECTED { border-left-color: $jh-ink-2; opacity: .7; }
.clue.approved { border-left-color: $jh-jade; }
.clue.rejected { border-left-color: $jh-ink-2; opacity: .7; }
.sk-cat { font-size: 20rpx; color: $jh-ink-2; margin-left: 12rpx; }
.clue-h { display: flex; justify-content: space-between; align-items: center; }
.clue-n { font-size: 26rpx; font-weight: 700; color: $jh-ink; }
.tag { font-size: 20rpx; padding: 4rpx 14rpx; border-radius: 999rpx; }
.tag.SHOWN { background: rgba(31, 111, 92, .12); color: $jh-jade; }
.tag.REJECTED { background: rgba(120, 120, 120, .14); color: $jh-ink-2; }
.tag.PENDING { background: rgba(200, 162, 74, .2); color: #8a6b1f; }
.tag.approved { background: rgba(31, 111, 92, .12); color: $jh-jade; }
.tag.rejected { background: rgba(120, 120, 120, .14); color: $jh-ink-2; }
.tag.pending { background: rgba(200, 162, 74, .2); color: #8a6b1f; }
.clue-c { display: block; font-size: 28rpx; color: $jh-ink; line-height: 1.7; margin: 12rpx 0; }
.clue-s { display: block; font-size: 22rpx; color: $jh-ink-2; }
.clue-act { display: flex; gap: 16rpx; margin-top: 16rpx; }
.btn {
    flex: 1; font-size: 26rpx; font-weight: 700; border-radius: 14rpx; padding: 14rpx 0; margin: 0;
}
.btn.approve { background: rgba(31, 111, 92, .14); color: $jh-jade; }
.btn.reject { background: rgba(178, 58, 46, .12); color: $jh-cinnabar; }
.btn[disabled] { opacity: .5; }

.form {
    background: $surface; border-radius: 20rpx; padding: 24rpx; box-shadow: 0 2rpx 10rpx rgba(31, 27, 22, .06);
}
.fl { display: block; font-size: 24rpx; color: $jh-ink-2; margin: 16rpx 0 8rpx; }
.fl:first-child { margin-top: 0; }
.inp {
    width: 100%; box-sizing: border-box; padding: 20rpx; font-size: 26rpx;
    border-radius: 16rpx; background: $jh-paper; color: $jh-ink;
}
.ta {
    width: 100%; height: 140rpx; box-sizing: border-box; padding: 20rpx; font-size: 26rpx;
    border-radius: 16rpx; background: $jh-paper; color: $jh-ink;
}
.grid { display: flex; gap: 16rpx; }
.gf { flex: 1; }
.submit {
    margin-top: 24rpx; background: linear-gradient(140deg, $jh-cinnabar, #8a2c22); color: #fff;
    font-size: 30rpx; font-weight: 700; border-radius: 16rpx; padding: 18rpx 0;
}
.submit[disabled] { opacity: .5; }

.voice-list { display: flex; flex-direction: column; gap: 12rpx; }
.voice-item {
    background: $surface; border-radius: 18rpx; padding: 22rpx 24rpx; box-shadow: 0 2rpx 8rpx rgba(31, 27, 22, .05);
    display: flex; flex-direction: column; gap: 10rpx;
}
.voice-item.done { opacity: .72; }
.vi-top { display: flex; align-items: center; justify-content: space-between; }
.vi-tag { font-size: 20rpx; padding: 4rpx 14rpx; border-radius: 999rpx; font-weight: 600; }
.t-EXPECT { background: rgba(31, 111, 92, .14); color: $jh-jade; }
.t-PLAY { background: rgba(200, 162, 74, .2); color: #8a6b1f; }
.t-SUGGEST { background: rgba(178, 58, 46, .12); color: $jh-cinnabar; }
.vi-t { font-size: 20rpx; color: $jh-ink-2; }
.vi-c { font-size: 27rpx; color: $jh-ink; line-height: 1.6; }
.vi-act { display: flex; justify-content: flex-end; }
.vi-adopt {
    font-size: 22rpx; font-weight: 700; color: #fff; background: linear-gradient(140deg, $jh-cinnabar, #8a2c22);
    border-radius: 999rpx; padding: 10rpx 28rpx; margin: 0;
}
.vi-adopt[disabled] { opacity: .5; }
.vi-done { font-size: 22rpx; color: $jh-jade; align-self: flex-end; }

.demand-list { display: flex; flex-direction: column; gap: 12rpx; }
.demand {
    background: $surface; border-radius: 16rpx; padding: 22rpx 24rpx; display: flex; justify-content: space-between; align-items: center;
    box-shadow: 0 2rpx 8rpx rgba(31, 27, 22, .05);
}
.dm-b { flex: 1; display: flex; flex-direction: column; gap: 8rpx; padding-right: 16rpx; }
.dm-tag { font-size: 20rpx; color: $jh-jade; font-weight: 700; }
.dm-t { font-size: 26rpx; color: $jh-ink; line-height: 1.6; }
.dm-votes { font-size: 22rpx; color: $jh-cinnabar; flex-shrink: 0; }
</style>
