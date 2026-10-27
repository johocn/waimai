/**
 * 场景对象模型（渲染无关）
 *
 * 职责：只描述「场景里有哪些对象、各自处于什么状态、何时自动恢复」。
 * 渲染层（Phaser / SVG / Three）只负责把状态画出来，不持有业务状态。
 *
 * 核心概念：
 * - SceneObject：场景里的一个实例化对象（树、石墩、凉亭、标记石…）
 * - state：状态机当前状态（healthy / felled / ruined / placed …）
 * - repairable + recoverMs：是否可自动修复、多久恢复（不可修复则永远停在终态）
 * - tick(now)：由外部时钟驱动，到点自动恢复
 */

export type SceneObjectType = 'tree' | 'block' | 'pavilion' | 'marker' | 'lantern' | 'window' | 'table' | 'seat' | 'cup' | 'contact' | 'bookshelf' | 'painting' | 'story' | 'librarian' | 'reading';

export interface SceneObject {
    id: string;
    type: SceneObjectType;
    /** 当前状态 */
    state: string;
    /** 进入当前状态的时刻（与 tick 使用同一个时钟） */
    stateAt: number;
    /** 自动恢复所需毫秒；0 表示不自动恢复 */
    recoverMs: number;
    /** 是否可自动修复；false 表示只能人工修缮 */
    repairable: boolean;
    /** 自动恢复后回到的状态 */
    recoverTo: string;
    /** 对象自有数据（位置、朝向、附属属性等） */
    data: Record<string, any>;
}

export interface SceneObjectDef {
    id: string;
    type: SceneObjectType;
    state: string;
    recoverMs?: number;
    repairable?: boolean;
    recoverTo?: string;
    data?: Record<string, any>;
}

/** 蛛丝马迹：显性手法留下的证据，驱动适应性巡逻与暴露度 */
export interface EvidenceLink {
    id: string;
    zone: string;
    kind: string;
    /** 严重度 1-5，越界越易被巡查员盯上 */
    severity: number;
    /** 时间戳（与世界时钟同单位） */
    at: number;
}

/** 技能状态：六类组合技能 + UGC 审核闭环 */
export interface SkillState {
    id: string;
    name: string;
    category: SkillCategory;
    desc: string;
    status: 'pending' | 'approved' | 'rejected';
    author?: string;
}

export type SkillCategory = 'item' | 'hide' | 'gather' | 'layout' | 'frame' | 'interrupt';

export class SceneWorld {
    objects: Record<string, SceneObject>;
    now: number;
    /** 分化种子：由 playerId 派生，决定藏点/线索/暗号子集（多人信息不重样） */
    seed: string;
    /** 证据链：显性手法留下的蛛丝马迹，驱动适应性巡逻与 P1 暴露度 */
    evidence: EvidenceLink[];
    /** 已提交 / 入库技能状态（pending/approved/rejected） */
    skills: Record<string, SkillState>;
    /** 持有道具（PROPS.id）；驱动藏点 req 门控与道具效果 */
    inventory: string[];

    constructor(
        defs: SceneObjectDef[],
        now = 0,
        opts: { seed?: string; evidence?: EvidenceLink[]; skills?: Record<string, SkillState>; inventory?: string[] } = {}
    ) {
        this.now = now;
        this.objects = {} as Record<string, SceneObject>;
        this.seed = opts.seed ?? '';
        this.evidence = opts.evidence ?? [];
        this.skills = opts.skills ?? {};
        this.inventory = opts.inventory ?? [];
        defs.forEach((d) => {
            this.objects[d.id] = {
                id: d.id,
                type: d.type,
                state: d.state,
                stateAt: now,
                recoverMs: d.recoverMs ?? 0,
                repairable: d.repairable ?? false,
                recoverTo: d.recoverTo ?? d.state,
                data: d.data ?? {}
            };
        });
    }

    get(id: string): SceneObject {
        return this.objects[id];
    }
    list(type: SceneObjectType): SceneObject[] {
        return Object.values(this.objects).filter((o) => o.type === type);
    }
    is(id: string, state: string): boolean {
        const o = this.objects[id];
        return !!o && o.state === state;
    }

    /** 通用状态切换 */
    setState(id: string, state: string, now = this.now): SceneObject | undefined {
        const o = this.objects[id];
        if (!o) return undefined;
        o.state = state;
        o.stateAt = now;
        return o;
    }

    /**
     * 推进世界时钟：处理「可修复对象」的自动恢复。
     * @returns 本帧发生自动恢复的对象 id（供渲染层播提示 / 动画）
     */
    tick(now: number): string[] {
        this.now = now;
        const recovered: string[] = [];
        Object.values(this.objects).forEach((o) => {
            if (!o.repairable || o.recoverMs <= 0) return;
            if (o.state === o.recoverTo) return;
            if (now - o.stateAt >= o.recoverMs) {
                o.state = o.recoverTo;
                o.stateAt = now;
                recovered.push(o.id);
            }
        });
        return recovered;
    }

    /* ── 语义化动作 ── */

    /** 砍倒：进入 felled，按 recoverMs 自动复原（可修复） */
    fell(id: string, now = this.now): boolean {
        const o = this.objects[id];
        if (!o || o.state === 'felled') return false;
        this.setState(id, 'felled', now);
        return true;
    }

    /** 焚毁：进入 ruined，并标记为不可自动修复 */
    burn(id: string, now = this.now): boolean {
        const o = this.objects[id];
        if (!o || o.state === 'ruined') return false;
        o.repairable = false;
        o.recoverMs = 0;
        this.setState(id, 'ruined', now);
        return true;
    }

    /** 人工修缮 */
    repair(id: string, now = this.now): boolean {
        const o = this.objects[id];
        if (!o) return false;
        this.setState(id, o.recoverTo, now);
        return true;
    }

    /** 把所有对象复位到 recoverTo */
    reset(now = this.now): void {
        Object.values(this.objects).forEach((o) => {
            o.state = o.recoverTo;
            o.stateAt = now;
        });
    }
}

/* ── 通用访问器 ── */

export const markerOf = (w: SceneWorld) => w.get('marker');
export const blocksOf = (w: SceneWorld) => w.list('block');

export function moveBlock(w: SceneWorld, id: string, gxf: number, gyf: number): void {
    const b = w.get(id);
    if (!b) return;
    b.data.gxf = gxf;
    b.data.gyf = gyf;
}

export function placeMarker(w: SceneWorld, gx: number, gy: number, orient: string): void {
    const m = w.get('marker');
    if (!m) return;
    m.state = 'placed';
    m.data.gx = gx;
    m.data.gy = gy;
    m.data.orient = orient;
}

/** 清除整场标记（便签收起） */
export function clearMarker(w: SceneWorld): void {
    const m = w.get('marker');
    if (m) m.state = 'none';
}

/* ───────────────────────────────────────────────────────────
 * 学校图书馆 · 密页传递 场景模型
 * ─────────────────────────────────────────────────────────── */

/** 藏匿手法 12 种（按 隐蔽度 / 取用速度 / 风险 分级） */
export interface StashMethod {
    id: string;
    name: string;
    zone: string;
    /** 需要的前置道具（对应 PROPS 的 id），无则空 */
    req?: string;
    conceal: 1 | 2 | 3; // 隐蔽度
    speed: 1 | 2 | 3; // 取用速度（越小越快）
    risk: 1 | 2 | 3; // 风险
}
export const STASH_METHODS: StashMethod[] = [
    { id: 'shelf-gap', name: '书架夹缝', zone: 'bookshelf', conceal: 1, speed: 1, risk: 2 },
    { id: 'fake-spine', name: '假书书脊中空', zone: 'bookshelf', req: 'fake-spine', conceal: 2, speed: 2, risk: 1 },
    { id: 'dict-cut', name: '字典切口凹槽', zone: 'bookshelf', conceal: 3, speed: 3, risk: 1 },
    { id: 'card-slot', name: '借阅卡夹层', zone: 'bookshelf', req: 'card', conceal: 3, speed: 2, risk: 1 },
    { id: 'behind-painting', name: '背景画后', zone: 'painting', req: 'take-painting', conceal: 3, speed: 2, risk: 2 },
    { id: 'desk-magnet', name: '阅览桌底磁贴', zone: 'reading', req: 'magnet', conceal: 2, speed: 1, risk: 2 },
    { id: 'journal-slit', name: '期刊架缝隙', zone: 'reading', conceal: 1, speed: 1, risk: 3 },
    { id: 'pot-soil', name: '花盆土里', zone: 'reading', conceal: 3, speed: 3, risk: 1 },
    { id: 'return-slot', name: '还书箱投递口', zone: 'desk', conceal: 2, speed: 2, risk: 2 },
    { id: 'carrel-back', name: '自习隔板背面', zone: 'reading', conceal: 2, speed: 1, risk: 2 },
    { id: 'vent', name: '窗台/通风口', zone: 'desk', req: 'stool', conceal: 3, speed: 3, risk: 3 },
    { id: 'closed-shelf', name: '闭架区(需权限卡)', zone: 'desk', req: 'staff-card', conceal: 3, speed: 3, risk: 1 }
];

/** 传递通道 10 种（异步 / 实时混合） */
export interface DeliveryChannel {
    id: string;
    name: string;
    type: 'async' | 'realtime';
    risk: 1 | 2 | 3;
}
export const DELIVERY_CHANNELS: DeliveryChannel[] = [
    { id: 'dead-drop', name: '错时死信', type: 'async', risk: 1 },
    { id: 'handoff', name: '当面交接', type: 'realtime', risk: 3 },
    { id: 'margin-copy', name: '书页传抄', type: 'async', risk: 2 },
    { id: 'borrow-chain', name: '借阅链', type: 'async', risk: 1 },
    { id: 'catalog-note', name: '目录终端留言', type: 'async', risk: 2 },
    { id: 'light-signal', name: '窗光信号', type: 'realtime', risk: 3 },
    { id: 'paper-plane', name: '纸飞机', type: 'realtime', risk: 3 },
    { id: 'note-relay', name: '布告栏便签接力', type: 'async', risk: 2 },
    { id: 'qr-code', name: '借阅码/二维码', type: 'async', risk: 1 },
    { id: 'whisper', name: '书架耳语', type: 'realtime', risk: 2 }
];

/** 可用道具 12 件（在「人物故事会」赚得/解锁） */
export interface GameProp {
    id: string;
    name: string;
    effect: string;
}
export const PROPS: GameProp[] = [
    { id: 'card', name: '借阅卡', effect: '开闭架区 / 分层核验信物' },
    { id: 'magnet', name: '磁贴/胶带', effect: '桌底、金属面藏信' },
    { id: 'developer', name: '显影剂', effect: '破解隐形墨水信 + 显出背景画暗号' },
    { id: 'fake-spine', name: '假书脊', effect: '自制新藏点' },
    { id: 'flashlight', name: '手机光/手电', effect: '暗角读字、发射窗光信号' },
    { id: 'distraction', name: '干扰物', effect: '引开巡逻，制造危险窗口' },
    { id: 'staff-card', name: '权限卡', effect: '进管理台/闭架区高阶藏点' },
    { id: 'spyglass', name: '窥镜/望远镜', effect: '远处窥视藏点内容，降低暴露' },
    { id: 'pocket-watch', name: '怀表', effect: '读巡逻节奏与可取时间窗' },
    { id: 'recorder', name: '录音笔', effect: '录耳语情报，回放取证' },
    { id: 'bookmark', name: '书签便签', effect: '标记藏点（双刃：也留蛛丝马迹）' },
    { id: 'decode-glass', name: '解码镜/红蓝眼镜', effect: '看穿背景画夹层' },
    { id: 'stool', name: '梯凳', effect: '攀高：开窗台/高处藏点' },
    { id: 'ink-eraser', name: '油墨擦', effect: '清理一处最重的痕迹（一次性）' },
    { id: 'decoy-envelope', name: '诱饵信封', effect: '在别处造假暗点引开检查（一次性）' },
    { id: 'sandglass', name: '时间沙漏', effect: '可取窗延长 5 分钟（一次性）' },
    { id: 'earplug', name: '耳塞', effect: '本局耳语不被记录（反噬：无法录取听）' },
    { id: 'chalk', name: '粉笔', effect: '墙面留误导记号，把巡逻引进错误区域' }
];

/** 一次性道具（用后从背包移除） */
export const CONSUMABLE_PROPS = ['ink-eraser', 'decoy-envelope', 'sandglass'];
/** 是否一次性道具 */
export function isConsumableProp(id: string): boolean {
    return CONSUMABLE_PROPS.indexOf(id) >= 0;
}

/** 组合技能六大类（按需扩充） */
export interface SkillCategoryDef {
    id: SkillCategory;
    name: string;
    examples: string[];
}
export const SKILL_CATEGORIES: SkillCategoryDef[] = [
    { id: 'item', name: '道具类', examples: ['显影剂破隐形墨', '磁贴+桌底', '假书脊造藏点', '权限卡开闭架区', '干扰物引开巡逻', '窥镜远观'] },
    { id: 'hide', name: '藏匿手法', examples: ['双层藏(书+画夹)', '流动藏(借阅链)', '寄生藏(借他人书页)'] },
    { id: 'gather', name: '传统情报获取', examples: ['耳语', '窗光信号', '书页传抄', '布告栏接力', '借阅码', '当面交接'] },
    { id: 'layout', name: '布局', examples: ['布假线索误导巡逻', '设诱饵藏点', '挪书架造盲区'] },
    { id: 'frame', name: '陷害', examples: ['伪造取信痕迹嫁祸', '留他人借阅卡造嫌疑'] },
    { id: 'interrupt', name: '打断', examples: ['截半空纸飞机', '撞翻对方藏物', '制造骚动打断交接', '屏蔽灯号'] }
];

/** 由 playerId 派生分化种子（保证多人信息不重样） */
export function deriveSeed(playerId: string): string {
    let h = 0;
    for (let i = 0; i < playerId.length; i++) h = (h * 31 + playerId.charCodeAt(i)) >>> 0;
    return h.toString(36);
}

/** 简单确定性伪随机（按种子 + key 取 0..1），用于分化藏点/线索子集 */
export function seededPick(seed: string, key: string, mod: number): number {
    let h = 2166136261;
    const s = seed + '|' + key;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h) % mod;
}

/** 按种子挑选该玩家可见的藏点子集（差异化体验） */
export function activeStashes(seed: string): StashMethod[] {
    return STASH_METHODS.filter((m, i) => seededPick(seed, 'stash' + m.id, 3) !== 0 || i < 4);
}

export function createLibraryWorld(
    now = 0,
    seed = '',
    opts: { evidence?: EvidenceLink[]; skills?: Record<string, SkillState>; inventory?: string[] } = {}
): SceneWorld {
    return new SceneWorld(
        [
            // 管理台（背景墙左下，背景画挂其旁）
            { id: 'desk', type: 'table', state: 'ok', recoverTo: 'ok', data: { gx: 0, gy: 0, zone: 'desk' } },
            // 背景画（藏密页 + 含环境暗号），挂在后墙
            { id: 'painting', type: 'painting', state: 'hung', recoverTo: 'hung', data: { gx: 2, gy: 0, zone: 'painting', cavity: 'none' } },
            // 书架区（三面书架）
            { id: 'shelf-1', type: 'bookshelf', state: 'ok', recoverTo: 'ok', data: { gx: 1, gy: 1, zone: 'bookshelf' } },
            { id: 'shelf-2', type: 'bookshelf', state: 'ok', recoverTo: 'ok', data: { gx: 3, gy: 1, zone: 'bookshelf' } },
            { id: 'shelf-3', type: 'bookshelf', state: 'ok', recoverTo: 'ok', data: { gx: 4, gy: 3, zone: 'bookshelf' } },
            // 阅览区（左下桌）
            { id: 'reading-1', type: 'reading', state: 'ok', recoverTo: 'ok', data: { gx: 0, gy: 3, zone: 'reading' } },
            // 故事角（人物故事会：NPC 发道具，右下）
            { id: 'story', type: 'story', state: 'ok', recoverTo: 'ok', data: { gx: 4, gy: 4, zone: 'story' } },
            // 巡逻员（巡查 NPC，按证据链自适应）
            { id: 'librarian', type: 'librarian', state: 'patrol', recoverTo: 'patrol', data: { gx: 2, gy: 2, patrol: true, route: 'desk>reading>bookshelf>story' } },
            // 可挪动书堆（演示/藏物）
            { id: 'block-1', type: 'block', state: 'ok', recoverTo: 'ok', data: { gxf: 1, gyf: 3 } },
            { id: 'block-2', type: 'block', state: 'ok', recoverTo: 'ok', data: { gxf: 3, gyf: 1 } },
            // 教学道具：被撕书页（可修复，演示用）
            { id: 'teach-book', type: 'block', state: 'ok', recoverTo: 'ok', data: { gx: 2, gy: 4, teach: 'book' } },
            // 教学道具：被封架位（不可修复，演示用）
            { id: 'teach-shelf', type: 'bookshelf', state: 'ok', recoverTo: 'ok', data: { gx: 1, gy: 4, teach: 'sealed' } },
            // 书签便签标记
            { id: 'marker', type: 'marker', state: 'none', recoverTo: 'none', data: { gx: 3, gy: 3, orient: 'E' } }
        ],
        now,
        { seed, evidence: opts.evidence ?? [], skills: opts.skills ?? {}, inventory: opts.inventory ?? [] }
    );
}

/** 区域中文名（识别面板 / 暗点回显 / 巡逻分区共用，避免页面硬编码） */
export const ZONE_LABELS: Record<string, string> = {
    bookshelf: '书架区',
    painting: '背景画',
    reading: '阅览区',
    desk: '管理台',
    story: '故事角',
    custom: '自定技能'
};
export function zoneLabel(zone?: string): string {
    return (zone && ZONE_LABELS[zone]) || zone || '';
}

/** 便签指向与暗点格子的曼哈顿偏移（0 = 精确指向） */
export function driftOf(markerGx: number, markerGy: number, gx: number, gy: number): number {
    return Math.abs(markerGx - gx) + Math.abs(markerGy - gy);
}

/** 便签格是否被可挪动书堆压住（压住后巡逻看不见便签，但上线寻点更难） */
export function markerCoveredByBlock(w: SceneWorld): boolean {
    const m = w.get('marker');
    if (!m || m.state !== 'placed') return false;
    return w.list('block').some((b) => Math.round(b.data.gxf) === m.data.gx && Math.round(b.data.gyf) === m.data.gy);
}

/** 有效 drift：便签被书堆压住时 +1（双刃：更难寻点，也更不招摇）；未摆便签返回 -1 */
export function effectiveDrift(w: SceneWorld, gx: number, gy: number): number {
    const m = w.get('marker');
    if (!m || m.state !== 'placed') return -1;
    return driftOf(m.data.gx, m.data.gy, gx, gy) + (markerCoveredByBlock(w) ? 1 : 0);
}

/**
 * 便签偏移 → 取件时的「点格容忍半径」：
 * drift 0 → 邻格也算命中；drift 1 → 必须同格；drift ≥2 → 还要额外靠近（0 表示必须精确命中）
 */
export function pickTolerance(drift: number): number {
    if (drift <= 0) return 1;
    if (drift === 1) return 0;
    return -1;
}

/** 证据链：向某区域追加一条痕迹（显性手法调用） */
export function addEvidence(w: SceneWorld, zone: string, kind: string, severity: number, now = w.now): void {
    w.evidence.push({ id: 'ev' + w.evidence.length, zone, kind, severity, at: now });
}

/**
 * 撤回某类痕迹（场景异常恢复时用）：书合上、桌子翻回、书从地上捡回，
 * 对应证据一并撤掉，避免「恢复后仍背着暴露度」。
 * 返回撤掉的严重度合计。
 */
export function removeEvidenceByKind(w: SceneWorld, kind: string): number {
    let removed = 0;
    for (let i = w.evidence.length - 1; i >= 0; i--) {
        if (w.evidence[i].kind === kind) {
            removed += w.evidence[i].severity;
            w.evidence.splice(i, 1);
        }
    }
    return removed;
}

/** 某区域累计证据严重度（喂给适应性巡逻与暴露度） */
export function evidenceSeverityAt(w: SceneWorld, zone: string): number {
    return w.evidence.filter((e) => e.zone === zone).reduce((s, e) => s + e.severity, 0);
}

/**
 * 抹去一条最轻的痕迹（窥镜远观 / 事后善后）：
 * 返回被抹去的严重度；无痕迹返回 0。用于道具「降低暴露」的实玩效果。
 */
export function clearLightestEvidence(w: SceneWorld): number {
    if (!w.evidence.length) return 0;
    let idx = 0;
    for (let i = 1; i < w.evidence.length; i++) {
        if (w.evidence[i].severity < w.evidence[idx].severity) idx = i;
    }
    return w.evidence.splice(idx, 1)[0].severity;
}

/**
 * 抹去一条最重的痕迹（油墨擦：一次性清理最显眼的一处）：
 * 返回被抹去的严重度；无痕迹返回 0。
 */
export function clearHeaviestEvidence(w: SceneWorld): number {
    if (!w.evidence.length) return 0;
    let idx = 0;
    for (let i = 1; i < w.evidence.length; i++) {
        if (w.evidence[i].severity > w.evidence[idx].severity) idx = i;
    }
    return w.evidence.splice(idx, 1)[0].severity;
}

/** 提交自定义技能（UGC 审核闭环：进入 pending） */
export function submitSkill(w: SceneWorld, id: string, name: string, category: SkillCategory, desc: string, author?: string): SkillState {
    const sk: SkillState = { id, name, category, desc, status: 'pending', author };
    w.skills[id] = sk;
    return sk;
}

/** 审核判定：approved 进常规库 / rejected 复用触发失败 */
export function judgeSkill(w: SceneWorld, id: string, decision: 'approved' | 'rejected'): SkillState | undefined {
    const sk = w.skills[id];
    if (!sk) return undefined;
    sk.status = decision;
    return sk;
}

/* ── 已入库技能 → 实玩藏匿手法 / 传递通道（UGC 闭环闭环到张力模型） ── */

/** 自定义技能按类别推导的实玩属性（调参集中处，便于在 dev 冒烟时微调平衡） */
export function categoryAttrs(c: SkillCategory): { conceal: 1 | 2 | 3; speed: 1 | 2 | 3; risk: 1 | 2 | 3 } {
    switch (c) {
        case 'hide': // 藏匿手法：高隐蔽、低风险
            return { conceal: 3, speed: 2, risk: 1 };
        case 'item': // 道具类：均衡
            return { conceal: 2, speed: 2, risk: 2 };
        case 'layout': // 布局：均衡，略偏隐蔽
            return { conceal: 2, speed: 2, risk: 2 };
        case 'gather': // 情报获取：显性、低隐蔽、中风险
            return { conceal: 1, speed: 2, risk: 2 };
        case 'frame': // 陷害：取用快但高风险（嫁祸留痕）
            return { conceal: 2, speed: 1, risk: 3 };
        case 'interrupt': // 打断：低隐蔽、慢取用、高风险
            return { conceal: 1, speed: 3, risk: 3 };
        default:
            return { conceal: 2, speed: 2, risk: 2 };
    }
}

/** 已入库（approved）自定义技能：多人共享的实玩可选项（不分 playerId） */
export function approvedCustomSkills(w: SceneWorld): SkillState[] {
    return Object.values(w.skills).filter((s) => s.status === 'approved');
}

/** 技能 → 藏匿手法（与 StashMethod 同形，zone 标为 custom） */
export function skillToStash(sk: SkillState): StashMethod {
    const a = categoryAttrs(sk.category);
    return { id: 'ugc:' + sk.id, name: sk.name, zone: 'custom', conceal: a.conceal, speed: a.speed, risk: a.risk };
}

/** 技能 → 传递通道（与 DeliveryChannel 同形） */
export function skillToChannel(sk: SkillState): DeliveryChannel {
    const a = categoryAttrs(sk.category);
    const type: 'async' | 'realtime' = ['hide', 'item', 'layout'].includes(sk.category) ? 'async' : 'realtime';
    return { id: 'ugc:' + sk.id, name: sk.name, type, risk: a.risk };
}

/** 风险(1-3) → 证据严重度（写入证据链，驱动暴露度与巡逻截获） */
export function riskSeverity(risk: number): number {
    return Math.max(1, Math.min(3, Math.round(risk)));
}

/* ── 道具（持有背包）· req 门控 · 组合技 · 平衡常量 ── */

/** 平衡常量（集中调参，dev 冒烟时微调） */
export const EXPOSURE_PER_SEVERITY = 11; // 每点证据严重度 → 暴露度
export const PATROL_BASE_SPEED = 0.7; // 巡逻员基础速度
export const PATROL_ALERT_GAIN = 1.8; // 警觉(证据)带来的额外巡逻速度
export const DISTRACT_MS = 20000; // 干扰物引开巡逻的持续时长

/** 是否为「真实道具」（PROPS 内）；req 里的 take-painting/climb 属场景动作，不门控 */
export function isRealProp(id?: string): boolean {
    return !!id && PROPS.some((p) => p.id === id);
}
export function propName(id?: string): string {
    return (id && PROPS.find((p) => p.id === id)?.name) || id || '';
}

/** 持有态（单一事实源 = world.inventory） */
export function hasProp(w: SceneWorld, id: string): boolean {
    return w.inventory.indexOf(id) >= 0;
}
/** 获得道具；重复或非法返回 false */
export function grantProp(w: SceneWorld, id: string): boolean {
    if (!isRealProp(id) || hasProp(w, id)) return false;
    w.inventory.push(id);
    return true;
}

/** 带门控 / 组合信息的藏匿手法可选项 */
export interface StashOption extends StashMethod {
    /** 因缺少 req 道具而置灰不可选 */
    locked: boolean;
    /** 置灰角标：需道具：X */
    reqLabel?: string;
    /** 组合技说明（持有互补道具时） */
    combo?: string;
}

/** 道具×手法 组合增量（隐蔽/取用/风险，负向=增益） */
export interface ComboBonus {
    concealDelta: number;
    speedDelta: number;
    riskDelta: number;
    label?: string;
}

/** 组合技：按持有道具推导对某藏点的影响 */
export function comboBonus(w: SceneWorld, method: StashMethod): ComboBonus {
    let c = 0;
    let s = 0;
    let r = 0;
    const tags: string[] = [];
    if (hasProp(w, 'magnet') && method.zone === 'reading') {
        s -= 1;
        tags.push('磁贴快手');
    }
    if (hasProp(w, 'spyglass')) {
        r -= 1;
        tags.push('窥镜先探');
    }
    if (hasProp(w, 'flashlight') && method.id === 'vent') {
        c += 1;
        tags.push('借光暗角');
    }
    if (hasProp(w, 'decode-glass') && method.zone === 'painting') {
        c += 1;
        tags.push('看穿夹层');
    }
    if (hasProp(w, 'fake-spine') && method.id === 'fake-spine') {
        c += 1;
        tags.push('自制书脊');
    }
    if (hasProp(w, 'stool') && method.id === 'vent') {
        s -= 1;
        tags.push('梯凳快手');
    }
    if (hasProp(w, 'chalk') && method.zone === 'painting') {
        r -= 1;
        tags.push('粉笔误导');
    }
    return { concealDelta: c, speedDelta: s, riskDelta: r, label: tags.length ? tags.join('·') : undefined };
}

/** 组合后的有效属性（1..3 钳制） */
export function effectiveStash(w: SceneWorld, method: StashMethod): { conceal: number; speed: number; risk: number } {
    const b = comboBonus(w, method);
    const cl = (v: number) => Math.max(1, Math.min(3, v));
    return {
        conceal: cl(method.conceal + b.concealDelta),
        speed: cl(method.speed + b.speedDelta),
        risk: cl(method.risk + b.riskDelta)
    };
}

/** 门控后的藏点可选项：内置分化子集（req 未持有则置灰）+ approved 自定义技能 */
export function availableStashes(w: SceneWorld, seed: string): StashOption[] {
    const builtin: StashOption[] = activeStashes(seed).map((m) => {
        const locked = !!m.req && isRealProp(m.req) && !hasProp(w, m.req);
        return {
            ...m,
            locked,
            reqLabel: locked ? '需道具：' + propName(m.req) : undefined,
            combo: comboBonus(w, m).label
        };
    });
    const ugc: StashOption[] = approvedCustomSkills(w).map((sk) => {
        const base = skillToStash(sk);
        return { ...base, locked: false, combo: comboBonus(w, base).label };
    });
    // 持有道具 → 额外开辟对应藏点：道具解锁的藏点不受本局分化子集限制（保证每个道具都有用武之地）
    const inList = (id: string) => builtin.some((b) => b.id === id);
    const extra: StashOption[] = STASH_METHODS.filter((m) => !!m.req && isRealProp(m.req) && hasProp(w, m.req) && !inList(m.id)).map((m) => ({
        ...m,
        locked: false,
        combo: comboBonus(w, m).label
    }));
    return [...builtin, ...extra, ...ugc];
}

/** 整场复位（保留种子，清空证据/技能） */
export function resetLibraryWorld(w: SceneWorld, now = 0): void {
    w.reset(now);
    w.evidence = [];
    w.skills = {};
    moveBlock(w, 'block-1', 1, 3);
    moveBlock(w, 'block-2', 3, 1);
    clearMarker(w);
}
