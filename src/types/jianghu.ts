/**
 * 江湖域类型定义（拾光传信者）
 *
 * 三方向（密信 / 情报 / 剧情）共用一套数据模型，用 type 字段区分，
 * 对应后端 campus-jianghu-plugin 的实体。设计文档：docs/specs/jianghu-courier-design.md §7
 */

/** 任务方向：LETTER 密信传递（P0）/ INTEL 情报悬赏（P1）/ PLOT 剧情支线（P2） */
export type JianghuTaskType = 'LETTER' | 'INTEL' | 'PLOT';

/** 密信等级：普通信 / 加急密函 / 绝密卷宗 */
export type JianghuLevel = 'NORMAL' | 'URGENT' | 'SECRET';

/** 核销方式：双口令 / 扫码 / LBS 围栏 / 绑定真实订单（虚实联动） */
export type JianghuVerifyMode = 'CODE' | 'QR' | 'LBS' | 'ORDER_BIND';

/** 任务状态机：OPEN → TAKEN → SUBMITTED → VERIFIED / REJECTED，超时回 OPEN 或 EXPIRED */
export type JianghuTaskStatus = 'OPEN' | 'TAKEN' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';

/** 情报分类（方向二，均为公开信息） */
export type IntelCategory = 'FOOD' | 'CLASSROOM' | 'CLUB' | 'EVENT' | 'NOTICE' | 'SCENERY';

/** 江湖任务（三方向共用主表） */
export interface JianghuTask {
    id: string;
    /** 方向：LETTER / INTEL / PLOT */
    type: JianghuTaskType;
    /** 等级：普通 / 加急 / 绝密 */
    level: JianghuLevel;
    title: string;
    /** 加密后的密语或悬赏描述（列表态展示） */
    brief: string;
    /** 密语明文：仅接取（TAKEN）后服务端下发，禁止列表态返回 */
    plainText?: string;
    campusCode: string;
    /** 楼阁（LBS 围栏颗粒度） */
    buildingCode?: string;
    /** 收信人 NPC：前端只展示打码代号，不暴露真实身份 */
    targetNick?: string;
    targetBuilding?: string;
    /** 声望奖励 */
    rewardRep: number;
    /** 情报值奖励（P1） */
    rewardIntel?: number;
    verifyMode: JianghuVerifyMode;
    /** 虚实联动：绑定的真实订单 */
    boundOrderId?: string;
    status: JianghuTaskStatus;
    /** 6 位一次性暗号（仅 TAKEN 后返回，60s 过期） */
    verifyCode?: string;
    codeExpireAt?: string;
    /** 已试错次数，上限 3 */
    tryCount?: number;
    distanceKm?: number;
    /** 接取后剩余有效时间（秒） */
    expireInSec?: number;
    expireAt?: string;
}

/** 传信者江湖档案（1:1 挂 Customer） */
export interface JianghuProfile {
    customerId?: string;
    /** 江湖名号 */
    nickname: string;
    /** 江湖声望（总累计，只增不减，违规处罚除外） */
    rep: number;
    /** 情报值（P1） */
    intel: number;
    /** 段位编码 L1..L9 */
    rankCode: string;
    /** 段位名称（后端冗余下发，避免前端硬编码） */
    rankName?: string;
    /** 骑手信用分，<60 冻结江湖任务 */
    credit: number;
    /** 结构性晋升计数 */
    letterDone: number;
    intelDone: number;
    plotDone: number;
    urgentDone?: number;
    secretDone?: number;
    /** 当日已得声望 / 日上限 */
    repToday: number;
    repDailyCap: number;
    /** 连续活跃天数（连击系数） */
    streakDays?: number;
    /** 段位保护期（ISO 时间串） */
    protectedUntil?: string;
    /** 面壁结束时间；非空表示被冻结 */
    frozenUntil?: string;
    violateCount?: number;
}

/** 声望流水（幂等键 taskId+customerId 唯一索引） */
export interface JianghuRecord {
    id: string;
    taskId?: string;
    /** 变动原因：LETTER_URGENT / RUMOR / INTEL_SALE / PENALTY … */
    reason: string;
    reasonText?: string;
    deltaRep: number;
    deltaIntel?: number;
    snapshotRep?: number;
    createdAt: string;
}

/** 情报集市条目（P1） */
export interface JianghuIntel {
    id: string;
    category: IntelCategory;
    categoryText?: string;
    campusCode: string;
    /** 打码标题 */
    summary: string;
    /** 解锁后可见正文 */
    content?: string;
    /** 信息来源（必填，合规留痕） */
    sourceNote?: string;
    priceIntel: number;
    viewCount: number;
    /** 当前用户是否已解锁 */
    unlocked?: boolean;
}

/** 江湖事件（多人拼图，P1） */
export interface JianghuEvent {
    id: string;
    name: string;
    desc: string;
    /** 线索总数 */
    total: number;
    /** 已收集数 */
    collected: number;
    /** 单人最多贡献条数 */
    perPersonLimit: number;
    endAt?: string;
    rewardPoolRep?: number;
}

/** 江湖事件文案（Strapi 内容源）：运营在 h.joho.cn 可视化编辑上架，覆盖实体内联文案 */
export interface JianghuEventContent {
    /** 标题（覆盖事件名） */
    title?: string | null;
    /** 背景描述（覆盖事件 desc） */
    desc?: string | null;
    /** 横幅图 URL */
    bannerImage?: string | null;
    /** 奖励文案（如「集齐均分 600 声望＋限定印章」） */
    rewardText?: string | null;
    /** 是否上架 */
    active?: boolean | null;
}

/** 江湖事件线索（P2 多人拼图碎片），内容公开可见 */
export interface JianghuClue {
    id: string;
    eventId: string;
    customerId?: string;
    /** 贡献者江湖名号（脱敏展示） */
    nickname?: string;
    /** 线索正文（拼图碎片内容） */
    content: string;
    /** 信息来源（必填，合规留痕） */
    sourceNote?: string;
    campusCode?: string;
    /** 被其他传信者点亮次数 */
    likes: number;
    /** SHOWN 已上墙 / PENDING 待审 / REJECTED 下线 */
    status?: string;
    createdAt?: string;
}

/** 事件贡献者排行行 */
export interface JianghuContributor {
    customerId: string;
    nickname: string;
    /** 本人贡献线索数 */
    count: number;
    /** 是否当前用户 */
    isMe?: boolean;
}

/** P2 事件详情（含拼图进度、线索墙、贡献者、我的状态） */
export interface JianghuEventDetail extends JianghuEvent {
    clues: JianghuClue[];
    /** 当前用户已提交的线索 */
    myClues: JianghuClue[];
    /** 贡献者排行（按贡献数降序） */
    contributors: JianghuContributor[];
    /** 当前用户已贡献线索数 */
    myContributed: number;
    /** 是否已破案（集齐 total 块拼图） */
    solved: boolean;
    /** 破案后本人获得的声望（仅 solved 且有贡献时有值） */
    myRewardRep?: number;
    /** 是否已对本事件领过奖（防前端重复展示） */
    rewarded?: boolean;
}

/** 提交线索入参 */
export interface ClueInput {
    /** 线索正文（拼图碎片） */
    content: string;
    /** 信息来源（必填，合规留痕） */
    sourceNote: string;
}

/** 创建江湖事件入参（运营后台） */
export interface JianghuEventInput {
    /** 事件名（如「书院异动」） */
    name: string;
    /** 事件背景描述 */
    desc: string;
    /** 线索总数（默认 6） */
    total?: number;
    /** 单人最多贡献条数（默认 2） */
    perPersonLimit?: number;
    /** 截止时间（ISO 串，留空为长期） */
    endAt?: string;
    /** 破案奖励池声望（集齐后均分） */
    rewardPoolRep?: number;
}

/** 段位配置（运营后台可配，不发版） */
export interface RankTier {
    code: string;
    name: string;
    /** 声望门槛 */
    rep: number;
    /** 境界：行脚境 / 信使境 / 百晓境 */
    realm: string;
    /** 徽章字 */
    seal: string;
    /** 晋升条件文案（后端按配置生成） */
    conditionText: string;
    /** 虚拟权益 */
    perksVirtual: string[];
    /** 现实权益（骑手侧，声望永不兑现金） */
    perksReal: string[];
}

/** 江湖榜行 */
export interface JianghuRankRow {
    customerId: string;
    nickname: string;
    rep: number;
    /** 是否当前用户 */
    isMe?: boolean;
}

/** 核销结果 */
export interface JianghuVerifyResult {
    ok: boolean;
    /** 本次声望增量 */
    deltaRep: number;
    /** 结算后总声望 */
    rep: number;
    /** 是否发生晋升 */
    rankUp: boolean;
    rankCode?: string;
    rankName?: string;
    /** 失败原因（如「暗号错误，还可试 2 次」） */
    message?: string;
}

/** 江湖大厅查询参数 */
export interface JianghuHallQuery {
    type?: JianghuTaskType;
    level?: JianghuLevel;
    campusCode?: string;
    cursor?: string;
    limit?: number;
    /** 骑手当前坐标：传入则服务端计算 distanceKm */
    lat?: number;
    lng?: number;
}

/** 传闻提交入参 */
export interface RumorInput {
    category: IntelCategory;
    content: string;
    /** 信息来源（必填，合规留痕） */
    sourceNote: string;
    photos?: string[];
}
