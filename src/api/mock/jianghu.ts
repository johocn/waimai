/**
 * 江湖模块本地 mock 数据源。
 *
 * 仅在 VITE_JIANGHU_MOCK=true 时生效（见 src/api/jianghu-env.ts）。
 * 签名与真实 GraphQL 接口一一对应（src/api/queries|mutations/jianghu.ts），
 * 后端就绪后把环境变量置 false 即可无缝切换，页面代码无需改动。
 *
 * 数据口径来自设计文档：
 * 段位见 docs/specs/jianghu-rank-system.md，任务与数值见 docs/specs/jianghu-courier-design.md
 */
import type {
    ClueInput,
    DeadDropMarker,
    DeadDropPhase,
    DeadDropPlaceInput,
    JianghuChapter,
    JianghuClue,
    JianghuCustomSkill,
    JianghuDeadDrop,
    JianghuDemand,
    JianghuEvent,
    JianghuEventContent,
    JianghuEventDetail,
    JianghuEventInput,
    JianghuIntel,
    JianghuLevel,
    JianghuProfile,
    JianghuRankRow,
    JianghuRecord,
    JianghuTask,
    JianghuTaskType,
    JianghuVerifyResult,
    JianghuVoice,
    RankTier,
    RumorInput,
    VoiceInput,
    CustomSkillInput
} from '../../types/jianghu';
import { MAX_CODE_TRIES, codeEntry, codeHintOf } from '../../pkg-jianghu/scene/codebook';
import { CLUE_SOURCES, clueFragment, type ClueFragment, type ClueSource } from '../../pkg-jianghu/scene/clues';

/* ────────────────── 识别系统：点场景物体取线索碎片（demo：客户端同源生成） ────────────────── */

/** 点场景物体取得一枚线索碎片；同一来源重复取只刷新文案，不重复入包 */
export async function jianghuDeadDropClue(source: ClueSource, seed: string): Promise<ClueFragment> {
    await delay(180);
    if (!CLUE_SOURCES.some((s) => s.id === source)) throw new Error('没有这类线索');
    return clueFragment(source, seed);
}

/** 服务端内部字段：暗号本体与报错次数，绝不随暗点下发前端 */
type DeadDropInternal = JianghuDeadDrop & { codeKey?: string; codeFails?: number };

/** 脱敏：剥离暗号等内部字段后再下发 */
function toPublic(d: DeadDropInternal | null): JianghuDeadDrop | null {
    if (!d) return null;
    const { codeKey, codeFails, ...rest } = d;
    return clone(rest as JianghuDeadDrop);
}

/** 九级段位（与后端 JianghuRankConfig 保持一致，真实环境由 jianghuRankLadder 下发） */
export const RANK_LADDER: RankTier[] = [
    { code: 'L1', name: '布衣闲人', rep: 0, realm: '行脚境', seal: '布', conditionText: '领取第一封密信', perksVirtual: ['江湖名号可见'], perksReal: ['—'] },
    { code: 'L2', name: '见习传信者', rep: 60, realm: '行脚境', seal: '见', conditionText: '骑手入驻通过 + 信用分 ≥60 + 完成 3 单真实订单', perksVirtual: ['江湖名号自定义一次', '素墨头像框'], perksReal: ['—'] },
    { code: 'L3', name: '青羽信童', rep: 180, realm: '行脚境', seal: '青', conditionText: '密信累计 10 封 + 传闻采纳 5 条 + 信用分 ≥70', perksVirtual: ['可接普通信全量', '传闻不限分类', '青羽头像框'], perksReal: ['接单范围 +1 栋楼'] },
    { code: 'L4', name: '墨羽信使', rep: 420, realm: '信使境', seal: '墨', conditionText: '加急密函 5 封 + 绝密卷宗 1 封 + 入江湖满 7 天', perksVirtual: ['可接加急密函', '密语可选密文体'], perksReal: ['高峰期优先派单 ×1.2'] },
    { code: 'L5', name: '疾影信使', rep: 900, realm: '信使境', seal: '疾', conditionText: '带教 1 名新人至 L2 + 连续 2 周每周活跃 ≥3 天', perksVirtual: ['可发江湖召集令', '师徒系统开启'], perksReal: ['提现手续费 5 折'] },
    { code: 'L6', name: '飞鸿驿丞', rep: 1600, realm: '信使境', seal: '鸿', conditionText: '情报值 ≥300 + 完成 1 次江湖事件', perksVirtual: ['解锁情报阁', '可发布悬赏', '可看集市热门'], perksReal: ['提现免手续费', '免押金领装备'] },
    { code: 'L7', name: '包打听', rep: 2600, realm: '百晓境', seal: '听', conditionText: '情报值 ≥800 + 集市上架被采纳 10 条', perksVirtual: ['可看绝密条目', '可发起江湖事件', '包打听身份标识'], perksReal: ['优先派单 ×1.5', '可接跨校区订单'] },
    { code: 'L8', name: '万事通', rep: 4000, realm: '百晓境', seal: '通', conditionText: '组队完成 1 次江湖大案 + 解锁剧情 ≥3 章', perksVirtual: ['可建传信者联盟', '自定义队徽', '剧情皮肤'], perksReal: ['专属客服通道', '提现 T+0'] },
    { code: 'L9', name: '百晓生', rep: 6000, realm: '百晓境', seal: '晓', conditionText: '密信累计 200 封 + 3 名 L7 举荐 + 零严重违规 + 校区学期限量 20 人', perksVirtual: ['百晓生金印框', '首页推荐位', '内容共创资格'], perksReal: ['平台激励返点 +1%'] }
];

/** 演示用固定暗号：真实环境由服务端生成并 60s 过期 */
const DEMO_CODE = '749213';

const LV_TEXT: Record<JianghuLevel, string> = { NORMAL: '普通信', URGENT: '加急密函', SECRET: '绝密卷宗' };

function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
}

function delay(ms = 260): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

/* ────────────────── 内存态（刷新即重置） ────────────────── */

const state = {
    profile: {
        customerId: 'mock-customer-1',
        nickname: '夜行小驿',
        rep: 1240,
        intel: 640,
        rankCode: 'L5',
        rankName: '疾影信使',
        credit: 92,
        letterDone: 86,
        intelDone: 12,
        plotDone: 0,
        urgentDone: 21,
        secretDone: 4,
        repToday: 86,
        repDailyCap: 300
    } as JianghuProfile,

    tasks: [
        { id: 't1', type: 'LETTER', level: 'SECRET', title: '老槐树下的第三次叩门', brief: '密文待启封', plainText: '今夜子时，东门老槐树下，有人等你', campusCode: 'EAST', buildingCode: '文渊阁', targetNick: '柳三眠', targetBuilding: '文渊阁三层东侧', rewardRep: 60, verifyMode: 'CODE', status: 'OPEN', distanceKm: 1.2, expireInSec: 8040, storyRef: 'ch2' },
        { id: 't2', type: 'LETTER', level: 'URGENT', title: '南门豆浆已凉', brief: '密文待启封', plainText: '豆浆凉了，趁热的人还在等你一句话', campusCode: 'EAST', buildingCode: '6 号楼阁', targetNick: '阿七', targetBuilding: '6 号楼阁一层', rewardRep: 25, verifyMode: 'ORDER_BIND', boundOrderId: 'ORD-20871', status: 'OPEN', distanceKm: 0.4, expireInSec: 1680 },
        { id: 't3', type: 'LETTER', level: 'NORMAL', title: '把这句话带给我同桌', brief: '密文待启封', plainText: '明天的课，我替你点名', campusCode: 'EAST', buildingCode: '二教 305', targetNick: '青禾', targetBuilding: '二教 305', rewardRep: 10, verifyMode: 'CODE', status: 'OPEN', distanceKm: 0.6, expireInSec: 3120, storyRef: 'ch2' },
        { id: 't4', type: 'LETTER', level: 'URGENT', title: '图书馆四楼有人等你', brief: '密文待启封', plainText: '书在四楼，人在窗边', campusCode: 'EAST', buildingCode: '图书馆', targetNick: '墨羽小舟', targetBuilding: '图书馆四层窗边', rewardRep: 25, verifyMode: 'CODE', status: 'OPEN', distanceKm: 0.9, expireInSec: 2460 },
        { id: 't5', type: 'LETTER', level: 'NORMAL', title: '社团招新的暗号', brief: '密文待启封', plainText: '报名表藏在最后一页', campusCode: 'EAST', buildingCode: '大礼堂', targetNick: '一苇', targetBuilding: '大礼堂前厅', rewardRep: 10, verifyMode: 'CODE', status: 'OPEN', distanceKm: 1.5, expireInSec: 4800 }
    ] as JianghuTask[],

    records: [
        { id: 'r1', taskId: 't9', reason: 'LETTER_URGENT', reasonText: '加急密函送达', deltaRep: 25, snapshotRep: 1215, createdAt: '2026-10-08T09:12:00+08:00' },
        { id: 'r2', taskId: 't8', reason: 'RUMOR', reasonText: '传闻采纳', deltaRep: 8, snapshotRep: 1190, createdAt: '2026-10-08T08:40:00+08:00' },
        { id: 'r3', reason: 'INTEL_SALE', reasonText: '情报被查看分成', deltaRep: 0, deltaIntel: 3, snapshotRep: 1182, createdAt: '2026-10-07T20:05:00+08:00' }
    ] as JianghuRecord[],

    bounties: [
        { id: 'b1', type: 'INTEL', level: 'NORMAL', title: '今天操场有没有活动？', brief: '风物情报 · 西区操场 · 剩 3 小时', campusCode: 'WEST', buildingCode: '西区操场', rewardRep: 20, verifyMode: 'LBS', status: 'OPEN', distanceKm: 0.8, expireInSec: 10800 },
        { id: 'b2', type: 'INTEL', level: 'NORMAL', title: '二教哪间教室下午空着？', brief: '风物情报 · 第二教学楼 · 剩 5 小时', campusCode: 'EAST', buildingCode: '第二教学楼', rewardRep: 15, verifyMode: 'LBS', status: 'OPEN', distanceKm: 0.5, expireInSec: 18000 },
        { id: 'b3', type: 'INTEL', level: 'NORMAL', title: '社团文化节演出时间确定了吗？', brief: '江湖传闻 · 大礼堂 · 剩 1 天', campusCode: 'EAST', buildingCode: '大礼堂', rewardRep: 25, verifyMode: 'LBS', status: 'OPEN', distanceKm: 1.1, expireInSec: 86400 }
    ] as JianghuTask[],

    market: [
        { id: 'i1', category: 'FOOD', categoryText: '食堂上新', campusCode: 'EAST', summary: '三食堂 · 新出 XXX 窗口', content: '二层新开麻辣香锅窗口，17:00 前基本不用排队。', sourceNote: '三食堂二层窗口上方公告牌', priceIntel: 5, viewCount: 128, unlocked: true },
        { id: 'i2', category: 'CLASSROOM', categoryText: '教室空位', campusCode: 'EAST', summary: '图书馆 · 四楼靠窗空位实况', content: '四楼靠窗 12 个座位，下午 14:00-16:00 空置率约 70%。', sourceNote: '图书馆四楼现场观察', priceIntel: 5, viewCount: 76, unlocked: false },
        { id: 'i3', category: 'CLUB', categoryText: '社团活动', campusCode: 'EAST', summary: '大礼堂 · 文化节彩排时间', content: '文化节彩排安排在周五 19:00，正式演出周六 18:30。', sourceNote: '大礼堂门口公告栏', priceIntel: 5, viewCount: 41, unlocked: false }
    ] as JianghuIntel[],

    event: {
        id: 'e1', name: '书院异动', desc: '六条线索散落各处，需四名以上传信者分头搜集。集齐后解锁完整故事，参与者均分声望池。',
        total: 6, collected: 4, perPersonLimit: 2, endAt: '2026-10-11T22:00:00+08:00', rewardPoolRep: 200
    } as JianghuEvent,

    // P2 已上墙的线索墙（4/6，还差 2 条由「我」补齐）
    clues: [
        { id: 'c1', eventId: 'e1', customerId: 'u2', nickname: '青羽阿七', content: '子时三刻，文渊阁后窗有烛影晃动，似有人以指节叩窗三下。', sourceNote: '文渊阁现场观察', campusCode: 'EAST', likes: 3, status: 'SHOWN', createdAt: '2026-10-08T20:10:00+08:00' },
        { id: 'c2', eventId: 'e1', customerId: 'u3', nickname: '墨羽小舟', content: '二教公告栏贴着半张残信，墨迹未干，落款是一枚朱砂印记。', sourceNote: '二教公告栏', campusCode: 'EAST', likes: 2, status: 'SHOWN', createdAt: '2026-10-08T20:40:00+08:00' },
        { id: 'c3', eventId: 'e1', customerId: 'u4', nickname: '一苇渡江', content: '食堂后门今夜提前落锁，但排水窗未关，风里有桂花酿的气味。', sourceNote: '食堂后门', campusCode: 'EAST', likes: 1, status: 'SHOWN', createdAt: '2026-10-08T21:05:00+08:00' },
        { id: 'c4', eventId: 'e1', customerId: 'u5', nickname: '城南快脚', content: '图书馆四楼出借登记簿上，有一笔被人用指甲划掉的名字。', sourceNote: '图书馆四楼登记簿', campusCode: 'EAST', likes: 2, status: 'SHOWN', createdAt: '2026-10-08T21:30:00+08:00' }
    ] as JianghuClue[],

    /* 江湖志：以段位为解锁门槛的剧情线，渐进交代设计目的与玩法（不强制切入） */
    chapters: [
        {
            no: 1, id: 'ch1', title: '入江湖 · 第一封密信', unlockRank: 'L1', unlockRankName: '布衣闲人',
            subtitle: '为什么外卖骑手要有一个「江湖」？',
            paragraphs: [
                '你接的第一单，也许是份还冒着热气的麻辣烫。但总有些东西，外卖盒装不下——一句想当面说出口的话，一张不便落字的纸条。',
                '「拾光传信者」把跑腿包装成有温度的「传信江湖」：你送的每一封密信，背后都是一个真实同学的牵挂。设计目的很朴素——让履约不再只是跑腿，而是一段被人记得的相遇。',
                '玩法：在「江湖密信」里接信 → 找到收信人 → 当面说出密语 → 双向暗号核销。声望随之累积，段位从布衣一路走向百晓生。'
            ],
            takeaway: '设计目的：用「传信」叙事提升骑手履约幸福感与留存；声望只记荣誉，永不兑现金。',
            foreshadow: '师傅在卷二等你：密语背后，是一个个有名字的人。'
        },
        {
            no: 2, id: 'ch2', title: '青羽信童 · 密语背后', unlockRank: 'L3', unlockRankName: '青羽信童',
            subtitle: '收信人，都是真实来去的同学',
            paragraphs: [
                '青禾、阿七、柳三眠……你在密信里见过的名字，都是园区里真实来去的同学。密语只可当面口述，是为了把「温度」留在相遇里。',
                '你接过的「老槐树下的第三次叩门」，收信人正是柳三眠——她总在文渊阁三层东侧窗边等人。这一章，江湖开始有了熟悉的脸。'
            ],
            takeaway: '玩法提示：收信人只显示楼阁与代号，绝不暴露真实姓名与具体位置，合规且安全。',
            foreshadow: '到了墨羽信使，你会带教新人——江湖不止你一个人在跑。'
        },
        {
            no: 3, id: 'ch3', title: '疾影信使 · 带教', unlockRank: 'L5', unlockRankName: '疾影信使',
            subtitle: '一个人跑，不如一队人传',
            paragraphs: [
                '疾影信使的标志，是「可发江湖召集令、师徒系统开启」。你带的第一个新人，会从布衣走到见习——这段路你刚走过。',
                '带教不是任务，是把「传信的温度」传下去。真实环境里，每带成 1 名 L2，师者得一份现实权益（如提现手续费折扣）。'
            ],
            takeaway: '玩法提示：师徒是留存飞轮——新人越快上手，你越受益。',
            foreshadow: '再往上，你的一线观察能变成「情报」，反哺整个园区。'
        },
        {
            no: 4, id: 'ch4', title: '飞鸿驿丞 · 情报阁', unlockRank: 'L6', unlockRankName: '飞鸿驿丞',
            subtitle: '把一线观察，变成同学用得上的情报',
            paragraphs: [
                '飞鸿驿丞解锁「情报阁」：你跑腿时看见的——三食堂新窗口、图书馆空座、社团彩排时间——都能写成情报，挂上集市。',
                '这就是虚实双轨的闭环：真实配送产生观察，观察沉淀为情报，情报反哺同学。声望之外，你攒的是「百晓」的名声。'
            ],
            takeaway: '设计目的：情报是骑手一线视角的产品化，让配送数据有了人情味。',
            foreshadow: '等你成了「包打听」，江湖事件会请你出手拼图。'
        },
        {
            no: 5, id: 'ch5', title: '包打听 · 江湖事件', unlockRank: 'L7', unlockRankName: '包打听',
            subtitle: '多人拼图，集齐线索解锁大案',
            paragraphs: [
                '「书院异动」正在发生：六条线索散落各处，需四名以上传信者分头搜集。你已见过的 c1~c4 就是其中四条，还差两条由「你」补齐。',
                '江湖事件把单机传信升级成协作叙事——这也是 P2 的重点方向。'
            ],
            takeaway: '玩法提示：事件线索需实地观察 + 来源留痕，拼图完成均分声望池。',
            foreshadow: '更高处，传信者能结盟、共创内容——江湖由你写。'
        },
        {
            no: 6, id: 'ch6', title: '百晓生 · 内容共创', unlockRank: 'L9', unlockRankName: '百晓生',
            subtitle: '玩家心声，就是江湖的下一卷',
            paragraphs: [
                '百晓生不是终点，而是「由玩家共建」的起点。你在本页留下的期待、玩法、建议，会被沉淀为需求池，写进未来的版本。',
                '比如「师徒奖励想兑实物」「情报想覆盖更多校区」「密信想要剧情分支」——这些都来自真实心声，是江湖要走的方向。'
            ],
            takeaway: '设计目的闭环：玩家心声 → 沉淀需求 → 未来游戏发展方向。',
            foreshadow: '下一卷，由你提笔。'
        }
    ] as JianghuChapter[],

    /* 玩家心声（期待 / 玩法 / 建议），其中部分已沉淀为需求 */
    voices: [
        { id: 'v0', kind: 'SUGGEST', kindText: '建议', content: '希望能在江湖志里看到自己带教新人的进度', createdAt: '2026-10-07T19:20:00+08:00', precipitated: true },
        { id: 'v1', kind: 'EXPECT', kindText: '期待', content: '绝密卷宗能不能有更复杂的谜面，像真在解密', createdAt: '2026-10-08T10:05:00+08:00', precipitated: false }
    ] as JianghuVoice[],

    /* 沉淀的客户需求：玩家心声聚合 → 未来游戏发展方向 */
    demands: [
        { id: 'd1', text: '师徒奖励希望可兑换实物周边（贴纸 / 挂绳）', votes: 38, tag: '权益' },
        { id: 'd2', text: '情报希望覆盖更多校区与夜宵时段', votes: 27, tag: '情报' },
        { id: 'd3', text: '密信想要剧情分支选择，影响声望走向', votes: 21, tag: '剧情' },
        { id: 'd4', text: '江湖活动希望有线下见面 / 同城局', votes: 19, tag: '活动' },
        { id: 'd5', text: '暗号希望更有江湖设定（诗谜 / 手势）', votes: 15, tag: '玩法' }
    ] as JianghuDemand[],

    /** 自定义技能（UGC）：pending 待审 / approved 已入库（多人共享）/ rejected 已驳回 */
    skills: [
        { id: 'sk1', name: '窗台借光传信', category: 'gather', desc: '借窗格光影做实时信号，闭馆前约定明暗节奏。', status: 'approved', customerId: 'u9', nickname: '青羽阿七', createdAt: '2026-10-08T20:00:00+08:00' },
        { id: 'sk2', name: '双层藏（画后书脊）', category: 'hide', desc: '背景画后再塞假书脊，双保险藏点。', status: 'pending', customerId: 'mock-customer-1', nickname: '夜行小驿', createdAt: '2026-10-09T09:00:00+08:00' }
    ] as JianghuCustomSkill[],

    /** 持有道具（PROPS.id）：演示初始发放书签与磁贴，用于展示 req 门控与组合技 */
    inventory: ['bookmark', 'magnet'] as string[],

    /** 死信箱（虚拟暗点投递） demo 态：当前暗点 + 演示时间快进（分钟） */
    deadDrop: null as JianghuDeadDrop | null,
    clockOffsetMin: 0
};

/* ────────────────── 持久化（演示态落本地存储，刷新不丢） ────────────────── */
const STORAGE_KEY = 'jianghu_mock_v1';
const DEFAULT_STATE = clone(state);

function hasStorage(): boolean {
    return typeof uni !== 'undefined' && !!uni && typeof (uni as any).getStorageSync === 'function';
}
function persist() {
    if (!hasStorage()) return;
    try { (uni as any).setStorageSync(STORAGE_KEY, state); } catch { /* 写入失败忽略 */ }
}
function hydrate() {
    if (!hasStorage()) return;
    try {
        const saved = (uni as any).getStorageSync(STORAGE_KEY);
        if (saved && typeof saved === 'object') {
            for (const k of ['profile', 'tasks', 'records', 'bounties', 'market', 'event', 'clues', 'chapters', 'voices', 'demands', 'skills', 'inventory', 'deadDrop', 'clockOffsetMin'] as const) {
                if (saved[k] !== undefined) (state as any)[k] = saved[k];
            }
        }
    } catch { /* 损坏数据丢弃，回退默认 */ }
}
hydrate();

/** mock 环境下的演示暗号（真实环境不要下发，页面仅在 mock 时展示） */
export function jianghuDemoCode(): string {
    return DEMO_CODE;
}

/** 重置演示数据：清空本地存储并恢复初始态（仅 mock 模式有效） */
export function resetJianghuMock() {
    Object.assign(state, clone(DEFAULT_STATE));
    if (hasStorage()) {
        try { (uni as any).removeStorageSync(STORAGE_KEY); } catch { /* ignore */ }
    }
}

/** 段位：按声望取所处段位 */
function rankByRep(rep: number): RankTier {
    return RANK_LADDER.reduce((acc, r) => (rep >= r.rep ? r : acc), RANK_LADDER[0]);
}

/* ────────────────── Query ────────────────── */

export async function jianghuProfile(): Promise<JianghuProfile> {
    await delay();
    return clone(state.profile);
}

export async function jianghuRankLadder(): Promise<RankTier[]> {
    await delay(120);
    return clone(RANK_LADDER);
}

export async function jianghuHall(q: { type?: JianghuTaskType } = {}): Promise<JianghuTask[]> {
    await delay();
    const list = q.type === 'INTEL' ? state.bounties : state.tasks;
    return clone(list.filter((t) => t.status === 'OPEN'));
}

export async function jianghuTaskDetail(taskId: string): Promise<JianghuTask | null> {
    await delay(180);
    const t = [...state.tasks, ...state.bounties].find((x) => x.id === taskId);
    return t ? clone(t) : null;
}

export async function jianghuMyRecords(): Promise<JianghuRecord[]> {
    await delay(180);
    return clone(state.records);
}

export async function jianghuDailyRank(): Promise<JianghuRankRow[]> {
    await delay(180);
    return [
        { customerId: 'mock-customer-1', nickname: '夜行小驿（我）', rep: 86, isMe: true },
        { customerId: 'c2', nickname: '青羽阿七', rep: 79 },
        { customerId: 'c3', nickname: '城南快脚', rep: 64 },
        { customerId: 'c4', nickname: '墨羽小舟', rep: 58 },
        { customerId: 'c5', nickname: '一苇渡江', rep: 47 }
    ];
}

export async function jianghuIntelMarket(): Promise<JianghuIntel[]> {
    await delay();
    return clone(state.market);
}

export async function jianghuEventCurrent(): Promise<JianghuEvent> {
    await delay(150);
    return clone(state.event);
}

/** 江湖志：全部章节（前端按当前段位门槛决定解锁/锁定） */
export async function jianghuStory(): Promise<JianghuChapter[]> {
    await delay(150);
    return clone(state.chapters);
}

/** 玩家心声流（期待 / 玩法 / 建议） */
export async function jianghuVoices(): Promise<JianghuVoice[]> {
    await delay(120);
    return clone(state.voices);
}

/** 沉淀的客户需求（玩家心声聚合 → 未来方向） */
export async function jianghuDemands(): Promise<JianghuDemand[]> {
    await delay(120);
    return clone(state.demands);
}

/**
 * 组装 P2 事件详情：拼图进度 + 线索墙 + 贡献者排行 + 我的状态与破案奖励核算。
 * 公共线索墙仅返回已上墙(SHOWN)线索；PENDING 待审 / REJECTED 下线 对玩家不可见。
 * 运营后台审核走专属 jianghuListClues（可见 PENDING）。
 */
function buildEventDetail(): JianghuEventDetail {
    const ev = state.event;
    const allClues = clone(state.clues);
    const me = state.profile.customerId ?? '';
    const shownClues = allClues.filter((c) => c.status === 'SHOWN');
    // 我的线索保留自身全部状态（玩家可见自己提交的待审线索）
    const myClues = allClues.filter((c) => c.customerId === me);
    const map = new Map<string, { count: number; nickname: string }>();
    for (const c of shownClues) {
        const k = c.customerId || c.nickname || 'anon';
        if (!map.has(k)) map.set(k, { count: 0, nickname: c.nickname || '匿名传信者' });
        map.get(k)!.count += 1;
    }
    const contributorIds = [...map.keys()];
    const contributors = contributorIds
        .map((cid) => ({ customerId: cid, nickname: map.get(cid)!.nickname, count: map.get(cid)!.count, isMe: cid === me }))
        .sort((a, b) => b.count - a.count);
    const solved = ev.collected >= ev.total;
    let myRewardRep: number | undefined;
    let rewarded = false;
    if (solved && contributorIds.includes(me) && ev.rewardPoolRep) {
        myRewardRep = Math.floor(ev.rewardPoolRep / contributorIds.length) || undefined;
        rewarded = state.profile.plotDone > 0;
    }
    return {
        ...clone(ev),
        clues: shownClues,
        myClues,
        contributors,
        myContributed: myClues.length,
        solved,
        myRewardRep,
        rewarded,
    };
}

export async function jianghuEventDetail(): Promise<JianghuEventDetail> {
    await delay(180);
    return buildEventDetail();
}

/** 江湖事件文案（Strapi 内容源 mock）：演示「运营改文案无需发版」 */
export async function jianghuEventContent(): Promise<JianghuEventContent | null> {
    await delay(120);
    return {
        title: '书院异动 · 新版',
        desc: '六条线索散落各处，由四名以上传信者分头搜集。集齐后解锁完整故事，参与者均分声望池。',
        bannerImage: 'https://via.placeholder.com/600x240.png?text=Jianghu+Event',
        rewardText: '集齐均分 200 声望＋限定「治」字印章',
        active: true,
    };
}

/** 运营后台：发布江湖事件（成为最新当前事件，清空线索墙） */
export async function jianghuCreateEvent(input: JianghuEventInput): Promise<JianghuEvent> {
    await delay(360);
    if (!input.name?.trim()) throw new Error('事件名称不可为空');
    if (!input.desc?.trim()) throw new Error('事件描述不可为空');
    const ev: JianghuEvent = {
        id: 'e' + Date.now(),
        name: input.name.trim(),
        desc: input.desc.trim(),
        total: input.total && input.total > 0 ? input.total : 6,
        collected: 0,
        perPersonLimit: input.perPersonLimit && input.perPersonLimit > 0 ? input.perPersonLimit : 2,
        endAt: input.endAt || undefined,
        rewardPoolRep: input.rewardPoolRep ?? undefined,
    };
    state.event = ev;
    state.clues = [];
    persist();
    return clone(ev);
}

/** 运营后台：审核线索。approve=true 上墙(SHOWN) 并 +1 进度（集齐触发破案结算）；approve=false 下线(REJECTED) 并回收进度 */
export async function jianghuAuditClue(id: string, approve: boolean): Promise<JianghuClue> {
    await delay(260);
    const c = state.clues.find((x) => x.id === id);
    if (!c) throw new Error('线索不存在');
    const ev = state.event;
    if (approve) {
        if (c.status !== 'SHOWN') {
            c.status = 'SHOWN';
            if (ev.collected < ev.total) {
                ev.collected += 1;
                if (ev.collected >= ev.total) settleMock();
            }
        }
    } else {
        if (c.status === 'SHOWN' && ev.collected > 0) ev.collected -= 1;
        c.status = 'REJECTED';
    }
    persist();
    return clone(c);
}

/** mock 破案结算：已上墙线索去重贡献者均分奖励池 */
function settleMock() {
    const ev = state.event;
    const ids = [...new Set(state.clues.filter((c) => c.status === 'SHOWN').map((c) => c.customerId))];
    const per = Math.floor((ev.rewardPoolRep || 0) / Math.max(1, ids.length));
    if (per > 0) {
        state.profile.rep += per;
        state.profile.repToday = Math.min(state.profile.repDailyCap, state.profile.repToday + per);
        state.profile.plotDone += 1;
    }
}

/** 运营后台：列出当前事件线索（含 PENDING 待审），按创建时间倒序；status 可过滤 */
export async function jianghuListClues(status?: string, limit = 50): Promise<JianghuClue[]> {
    await delay(180);
    let list = clone(state.clues);
    if (status) list = list.filter((c) => c.status === status);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
}

/* ────────────────── 自定义技能（UGC）审核闭环 ────────────────── */
/** 单人待审技能上限，避免刷量（照搬线索单人贡献限制的思路） */
const MAX_MY_PENDING_SKILLS = 5;

/** 提交自定义技能：进入 pending（待运营审核），非 approved 不进选择器 */
export async function jianghuCustomSkillSubmit(input: CustomSkillInput): Promise<JianghuCustomSkill> {
    await delay(300);
    if (!input.name?.trim()) throw new Error('请填写技能名');
    if (!input.desc?.trim()) throw new Error('请补充技能说明（如何不露痕迹）');
    const me = state.profile.customerId ?? '';
    const myPending = state.skills.filter((s) => s.customerId === me && s.status === 'pending');
    if (myPending.length >= MAX_MY_PENDING_SKILLS) throw new Error(`待审技能过多（上限 ${MAX_MY_PENDING_SKILLS} 条），先等运营审核`);
    const sk: JianghuCustomSkill = {
        id: 'sk' + Date.now(),
        name: input.name.trim(),
        category: input.category,
        desc: input.desc.trim(),
        status: 'pending',
        customerId: me,
        nickname: state.profile.nickname,
        createdAt: new Date().toISOString()
    };
    state.skills.push(sk);
    persist();
    return clone(sk);
}

/** 玩家查询：已入库（全部 approved，多人共享）+ 本人提交（任意状态），按创建时间倒序 */
export async function jianghuCustomSkillList(): Promise<JianghuCustomSkill[]> {
    await delay(120);
    const me = state.profile.customerId ?? '';
    const list = clone(state.skills).filter((s) => s.status === 'approved' || s.customerId === me);
    return list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

/** 运营后台：列出自定义技能（含 pending 待审），status 可过滤，按创建时间倒序 */
export async function jianghuListCustomSkills(status?: string, limit = 50): Promise<JianghuCustomSkill[]> {
    await delay(180);
    let list = clone(state.skills);
    if (status) list = list.filter((s) => s.status === status);
    return list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, limit);
}

/** 运营后台：审核自定义技能。approve=true 入库(approved)；approve=false 驳回(rejected) */
export async function jianghuAuditCustomSkill(id: string, approve: boolean): Promise<JianghuCustomSkill> {
    await delay(240);
    const sk = state.skills.find((x) => x.id === id);
    if (!sk) throw new Error('技能不存在');
    sk.status = approve ? 'approved' : 'rejected';
    persist();
    return clone(sk);
}

/* ────────────────── 持有道具（背包） ────────────────── */

/** 玩家持有道具列表（PROPS.id） */
export async function jianghuInventory(): Promise<string[]> {
    await delay(80);
    return clone(state.inventory);
}

/** 保存持有道具（领取/使用后整体回写，简单可靠） */
export async function jianghuSaveInventory(ids: string[]): Promise<string[]> {
    await delay(80);
    state.inventory = (ids || []).filter((x) => typeof x === 'string');
    persist();
    return clone(state.inventory);
}

/** P2 提交线索：进入待审(PENDING)，不上墙、不计数；集齐后由运营审核通过触发结算 */
export async function jianghuCollectClue(input: ClueInput): Promise<JianghuEventDetail> {
    await delay(360);
    if (!input.content?.trim()) throw new Error('线索内容不可为空');
    if (!input.sourceNote?.trim()) throw new Error('请填写信息来源（合规留痕）');
    const ev = state.event;
    if (ev.endAt && new Date(ev.endAt).getTime() < Date.now()) throw new Error('事件已结束，无法再提交');
    // 待审门禁：进度以「已上墙」为准，提交时不再占用 collected 名额，仅限制单人贡献数与事件是否存在
    const me = state.profile.customerId ?? '';
    const myClues = state.clues.filter((c) => c.customerId === me);
    if (myClues.length >= ev.perPersonLimit) throw new Error(`单人最多贡献 ${ev.perPersonLimit} 条线索`);

    state.clues.push({
        id: 'c' + (state.clues.length + 1),
        eventId: ev.id,
        customerId: me,
        nickname: state.profile.nickname,
        content: input.content.trim(),
        sourceNote: input.sourceNote.trim(),
        campusCode: 'EAST',
        likes: 0,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
    } as any);
    // 不在此处 ev.collected += 1（待审门禁）
    persist();
    return buildEventDetail();
}

/* ────────────────── Mutation ────────────────── */

export async function jianghuTakeTask(taskId: string): Promise<JianghuTask> {
    await delay();
    const t = [...state.tasks, ...state.bounties].find((x) => x.id === taskId);
    if (!t) throw new Error('密信不存在或已被接走');
    t.status = 'TAKEN';
    t.verifyCode = DEMO_CODE;
    t.codeExpireAt = new Date(Date.now() + 60_000).toISOString();
    t.tryCount = 0;
    persist();
    return clone(t);
}

export async function jianghuReleaseTask(taskId: string): Promise<boolean> {
    await delay(200);
    const t = [...state.tasks, ...state.bounties].find((x) => x.id === taskId);
    if (t) {
        t.status = 'OPEN';
        t.verifyCode = undefined;
    }
    persist();
    return true;
}

export async function jianghuRefreshCode(taskId: string): Promise<string> {
    await delay(180);
    const t = [...state.tasks, ...state.bounties].find((x) => x.id === taskId);
    if (!t) throw new Error('密信不存在');
    t.verifyCode = DEMO_CODE;
    t.codeExpireAt = new Date(Date.now() + 60_000).toISOString();
    persist();
    return DEMO_CODE;
}

export async function jianghuVerify(taskId: string, code: string = '', lat?: number, lng?: number): Promise<JianghuVerifyResult> {
    await delay(320);
    const t = [...state.tasks, ...state.bounties].find((x) => x.id === taskId);
    if (!t) return { ok: false, deltaRep: 0, rep: state.profile.rep, rankUp: false, message: '密信不存在' };
    if (t.status !== 'TAKEN') {
        return { ok: false, deltaRep: 0, rep: state.profile.rep, rankUp: false, message: '请先接取密信' };
    }
    t.tryCount = (t.tryCount ?? 0) + 1;

    // 按核销方式分支（mock 模拟服务端校验逻辑）
    const mode = t.verifyMode;
    if (mode === 'CODE') {
        if (code !== DEMO_CODE) {
            const left = Math.max(0, 3 - t.tryCount);
            return { ok: false, deltaRep: 0, rep: state.profile.rep, rankUp: false, message: `暗号有误，还可试 ${left} 次` };
        }
    } else if (mode === 'LBS') {
        if (!(lat && lng)) {
            return { ok: false, deltaRep: 0, rep: state.profile.rep, rankUp: false, message: '请进入围栏后打卡核销' };
        }
    } else if (mode === 'ORDER_BIND') {
        // 绑定真实急单：送达即核销（演示中视为已送达）
    } else if (mode === 'QR') {
        // 扫码即过
    } else if (code !== DEMO_CODE) {
        const left = Math.max(0, 3 - t.tryCount);
        return { ok: false, deltaRep: 0, rep: state.profile.rep, rankUp: false, message: `暗号有误，还可试 ${left} 次` };
    }

    // 声望入账（含日上限裁剪）
    const room = Math.max(0, state.profile.repDailyCap - state.profile.repToday);
    const delta = Math.min(t.rewardRep, room);
    t.status = 'VERIFIED';
    state.profile.rep += delta;
    state.profile.repToday += delta;
    state.profile.letterDone += 1;
    if (t.level === 'URGENT') state.profile.urgentDone = (state.profile.urgentDone ?? 0) + 1;
    if (t.level === 'SECRET') state.profile.secretDone = (state.profile.secretDone ?? 0) + 1;

    const next = rankByRep(state.profile.rep);
    const rankUp = next.code !== state.profile.rankCode;
    state.profile.rankCode = next.code;
    state.profile.rankName = next.name;

    state.records.unshift({
        id: 'r' + Date.now(),
        taskId,
        reason: 'LETTER_' + t.level,
        reasonText: LV_TEXT[t.level] + '送达',
        deltaRep: delta,
        snapshotRep: state.profile.rep,
        createdAt: new Date().toISOString()
    });

    persist();
    return {
        ok: true,
        deltaRep: delta,
        rep: state.profile.rep,
        rankUp,
        rankCode: next.code,
        rankName: next.name
    };
}

export async function jianghuSubmitRumor(input: RumorInput): Promise<{ id: string; status: string }> {
    await delay(420);
    if (!input.sourceNote) throw new Error('请填写信息来源');
    state.records.unshift({
        id: 'r' + Date.now(),
        reason: 'RUMOR_PENDING',
        reasonText: '传闻审核中',
        deltaRep: 0,
        createdAt: new Date().toISOString()
    });
    persist();
    return { id: 'rm' + Date.now(), status: 'PENDING' };
}

const VOICE_KIND_TEXT: Record<VoiceKind, string> = { EXPECT: '期待', PLAY: '玩法', SUGGEST: '建议' };

/** 玩家心声：期待 / 玩法 / 建议，提交后进入心声流，可沉淀为需求 */
export async function jianghuSubmitVoice(input: VoiceInput): Promise<{ id: string }> {
    await delay(300);
    if (!input.content || input.content.trim().length < 2) throw new Error('请至少写两个字');
    const id = 'v' + Date.now();
    state.voices.unshift({
        id,
        kind: input.kind,
        kindText: VOICE_KIND_TEXT[input.kind] || '建议',
        content: input.content.trim(),
        createdAt: new Date().toISOString(),
        precipitated: false
    });
    persist();
    return { id };
}

/** 运营采纳某条心声，沉淀为需求（同向措辞自动合并票数，否则新增） */
export async function jianghuAdoptVoice(id: string): Promise<JianghuDemand> {
    await delay(200);
    const v = state.voices.find((x) => x.id === id);
    if (!v) throw new Error('心声不存在');
    v.precipitated = true;
    const exist = state.demands.find((d) => d.text === v.content);
    if (exist) {
        exist.votes += 1;
    } else {
        state.demands.push({ id: 'd' + Date.now(), text: v.content, votes: 1, tag: v.kindText });
    }
    persist();
    return exist || state.demands[state.demands.length - 1];
}

export async function jianghuUnlockIntel(intelId: string): Promise<JianghuIntel> {
    await delay(280);
    const it = state.market.find((x) => x.id === intelId);
    if (!it) throw new Error('情报不存在');
    it.unlocked = true;
    state.profile.intel = Math.max(0, state.profile.intel - it.priceIntel);
    persist();
    return clone(it);
}

/* ────────────────── 死信箱（虚拟暗点投递） demo ────────────────── */
const MARKER_TEXT: Record<DeadDropMarker, string> = { E: '石子朝东', W: '石子朝西', S: '石子朝南', N: '石子朝北' };
const DD_PICKABLE_DELAY_MS = 2 * 60_000;   // 投放后 2 分钟才到可取窗（演示用，真实更长）
const DD_WINDOW_MS = 30 * 60_000;          // 可取窗 30 分钟，超时巡查截获

/** 模拟 AES：仅用于演示「未解密只见密文」，非真实加密（真实环境后端 AES 落库，明文不落前端） */
function fakeCipher(plain: string): string {
    try {
        return 'AES·' + btoa(unescape(encodeURIComponent('密封·' + plain + '·封')));
    } catch {
        return 'AES·' + Buffer.from('密封·' + plain + '·封').toString('base64');
    }
}
function fakeDecipher(cipher: string): string {
    const body = cipher.replace(/^AES·/, '');
    try {
        return decodeURIComponent(escape(atob(body))).replace(/^密封·/, '').replace(/·封$/, '');
    } catch {
        return '（密文已损坏）';
    }
}

function effectiveNow(): number {
    return Date.now() + state.clockOffsetMin * 60_000;
}

/** 依据时钟重算阶段；PICKED / SEIZED 为终态，不再回退 */
function recomputeDeadDrop(d: JianghuDeadDrop): JianghuDeadDrop {
    if (d.phase === 'PICKED' || d.phase === 'SEIZED') return d;
    const now = effectiveNow();
    const from = new Date(d.pickableFrom).getTime();
    const to = new Date(d.pickableTo).getTime();
    let phase: DeadDropPhase = 'PLACED';
    if (now >= to) phase = 'SEIZED';
    else if (now >= from) phase = 'PICKABLE';
    return { ...d, phase, seizeReason: phase === 'SEIZED' ? d.seizeReason || '超时未取，被巡查取走' : d.seizeReason };
}

/** 查看暗点：返回当前暗点 + 当前（快进后的）时钟 */
export async function jianghuDeadDropInspect(): Promise<{ drop: JianghuDeadDrop | null; nowIso: string }> {
    await delay(60);
    const d = state.deadDrop ? recomputeDeadDrop(state.deadDrop) : null;
    if (d) state.deadDrop = d; // 固化阶段，避免回退
    persist();
    return { drop: toPublic(d as DeadDropInternal), nowIso: new Date(effectiveNow()).toISOString() };
}

/** 投放情报：自动加密、记录标记与可取窗口，投放后玩家不可再查看明文 */
export async function jianghuDeadDropPlace(input: DeadDropPlaceInput): Promise<JianghuDeadDrop> {
    await delay(320);
    if (!input.topic?.trim()) throw new Error('请填写情报主题');
    if (!input.plainText?.trim()) throw new Error('请录入情报原文');
    if (!codeEntry(input.code)) throw new Error('暗号须从暗语本中选取');
    const now = effectiveNow();
    const drop: DeadDropInternal = {
        id: 'dd' + Date.now(),
        topic: input.topic.trim(),
        cipher: fakeCipher(input.plainText.trim()),
        marker: input.marker,
        markerText: MARKER_TEXT[input.marker],
        methodId: input.methodId,
        channelId: input.channelId,
        zone: input.zone,
        gx: input.gx,
        gy: input.gy,
        conceal: input.conceal,
        markerDrift: input.markerDrift,
        placedAt: new Date(now).toISOString(),
        pickableFrom: new Date(now + DD_PICKABLE_DELAY_MS).toISOString(),
        pickableTo: new Date(now + DD_PICKABLE_DELAY_MS + DD_WINDOW_MS).toISOString(),
        phase: 'PLACED',
        codeKey: input.code,
        codeFails: 0,
        codeHint: codeHintOf(input.code),
        codeTriesLeft: MAX_CODE_TRIES
    };
    state.deadDrop = drop;
    persist();
    return toPublic(drop) as JianghuDeadDrop;
}

/** 取件奖励：基础 + 隐蔽加成 − 高暴露惩罚（client 传入 conceal/exposure；缺省按中性计） */
function pickupReward(conceal = 2, exposure = 40): number {
    const base = 18;
    const c = Math.max(1, Math.min(3, Math.round(conceal)));
    const concealBonus = (c - 1) * 4; // 0 / 4 / 8
    const exposurePenalty = exposure > 60 ? Math.round((exposure - 60) / 10) * 2 : 0;
    return Math.max(4, base + concealBonus - exposurePenalty);
}

/** 上线错时取件：须报对暗号；报错超过上限即被巡线截获并扣声望 */
export async function jianghuDeadDropPickup(code: string, opts?: { conceal?: number; exposure?: number }): Promise<{ drop: JianghuDeadDrop; plainText: string; rewardRep: number }> {
    await delay(320);
    const d = state.deadDrop ? (recomputeDeadDrop(state.deadDrop) as DeadDropInternal) : null;
    if (!d) throw new Error('暗点空空如也');
    if (d.phase !== 'PICKABLE') throw new Error('尚不可取件（未到可取窗口或已失效）');

    // 暗号校验
    if (d.codeKey && code !== d.codeKey) {
        const fails = (d.codeFails || 0) + 1;
        const seized = fails >= MAX_CODE_TRIES;
        const bad: DeadDropInternal = {
            ...d,
            codeFails: fails,
            codeTriesLeft: Math.max(0, MAX_CODE_TRIES - fails)
        };
        if (seized) {
            bad.phase = 'SEIZED';
            bad.seizeReason = '暗号不符，被巡线截获';
            state.profile.rep = Math.max(0, state.profile.rep - 12);
        }
        state.deadDrop = bad;
        persist();
        throw new Error(seized ? '暗号再次不符——情报被巡线截获！' : `暗号不符，巡线起疑（还剩 ${MAX_CODE_TRIES - fails} 次机会）`);
    }

    const upd: DeadDropInternal = { ...d, phase: 'PICKED', pickedBy: '上线·云中君' };
    state.deadDrop = upd;
    const rewardRep = pickupReward(opts?.conceal, opts?.exposure);
    state.profile.rep += rewardRep;
    state.profile.repToday = Math.min(state.profile.repDailyCap, state.profile.repToday + rewardRep);
    persist();
    return { drop: toPublic(upd) as JianghuDeadDrop, plainText: fakeDecipher(d.cipher), rewardRep };
}

/** 取件后情报流转至交通站 → 总舵译信核验，投放人与取件人双方声望入账（bonus=取证加成，如录音笔） */
export async function jianghuDeadDropDeliver(opts?: { bonus?: number }): Promise<{ rewardRep: number; bonus?: number }> {
    await delay(320);
    const d = state.deadDrop;
    if (!d || d.phase !== 'PICKED') throw new Error('情报尚未取走，无法流转');
    const bonus = Math.max(0, Math.round(opts?.bonus || 0));
    const rewardRep = 22 + bonus;
    state.profile.rep += rewardRep;
    state.profile.repToday = Math.min(state.profile.repDailyCap, state.profile.repToday + rewardRep);
    persist();
    return { rewardRep, bonus };
}

/** 演示用时间快进（分钟）：让单人即可体验错时取件 / 超时截获 */
export async function jianghuDeadDropFastForward(min: number): Promise<{ drop: JianghuDeadDrop | null; nowIso: string }> {
    await delay(80);
    state.clockOffsetMin += min;
    const d = state.deadDrop ? recomputeDeadDrop(state.deadDrop) : null;
    if (d) state.deadDrop = d;
    persist();
    return { drop: toPublic(d as DeadDropInternal), nowIso: new Date(effectiveNow()).toISOString() };
}

/** 时间沙漏：延长可取窗（分钟） */
export async function jianghuDeadDropExtend(min: number): Promise<JianghuDeadDrop> {
    await delay(160);
    const d = state.deadDrop ? (recomputeDeadDrop(state.deadDrop) as DeadDropInternal) : null;
    if (!d || d.phase !== 'PICKABLE') throw new Error('仅可取窗可延长');
    const add = Math.max(1, Math.round(min)) * 60_000;
    const bad: DeadDropInternal = { ...d, pickableTo: new Date(new Date(d.pickableTo).getTime() + add).toISOString() };
    state.deadDrop = bad;
    persist();
    return toPublic(bad) as JianghuDeadDrop;
}

/** 主动失败（取件过慢 / 被目击等）：直接进入截获终态并留痕 */
export async function jianghuDeadDropFail(reason: string, penalty = 8): Promise<JianghuDeadDrop> {
    await delay(120);
    const d = state.deadDrop ? (recomputeDeadDrop(state.deadDrop) as DeadDropInternal) : null;
    if (!d || d.phase === 'PICKED' || d.phase === 'SEIZED') throw new Error('当前没有可失败的暗点');
    const bad: DeadDropInternal = { ...d, phase: 'SEIZED', seizeReason: reason || '任务失败' };
    state.deadDrop = bad;
    state.profile.rep = Math.max(0, state.profile.rep - Math.max(0, Math.round(penalty)));
    persist();
    return toPublic(bad) as JianghuDeadDrop;
}

/** 重置暗点（清空当前暗点与时钟偏移） */
export async function jianghuDeadDropReset(): Promise<void> {
    await delay(80);
    state.deadDrop = null;
    state.clockOffsetMin = 0;
    persist();
}
