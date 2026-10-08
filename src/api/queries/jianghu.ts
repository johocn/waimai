import gql from 'graphql-tag';
import { riderClient } from './rider';
import { JIANGHU_MOCK } from '../jianghu-env';
import * as mock from '../mock/jianghu';
import type {
    JianghuEvent,
    JianghuEventContent,
    JianghuEventDetail,
    JianghuIntel,
    JianghuProfile,
    JianghuRecord,
    JianghuRankRow,
    JianghuTask,
    JianghuTaskType
} from '../../types/jianghu';

// 江湖模块查询。后端插件：campus-jianghu-plugin（实体与字段见 docs/specs/jianghu-courier-design.md §7）
// 骑手是平台角色，复用 riderClient() 的 vendure-token + Authorization 鉴权；
// 大厅/任务按 ctx.channelId 过滤的 campus* 接口才需要传店铺渠道 token，江湖任务为平台级，不传。
//
// VITE_JIANGHU_MOCK=true 时改走本地 mock（后端未就绪也能联调 UI），签名与返回结构完全一致。

const JH_PROFILE = gql`
    query jianghuProfile {
        jianghuProfile {
            customerId nickname rep intel rankCode rankName credit
            letterDone intelDone plotDone urgentDone secretDone
            repToday repDailyCap streakDays protectedUntil frozenUntil violateCount
        }
    }
`;

const JH_RANK_LADDER = gql`
    query jianghuRankLadder {
        jianghuRankLadder { code name rep realm seal conditionText perksVirtual perksReal }
    }
`;

const JH_HALL = gql`
    query jianghuHall($type: String, $campusCode: String, $cursor: String, $limit: Int, $lat: Float, $lng: Float) {
        jianghuHall(type: $type, campusCode: $campusCode, cursor: $cursor, limit: $limit, lat: $lat, lng: $lng) {
            id type level title brief campusCode buildingCode
            rewardRep rewardIntel verifyMode status distanceKm expireInSec
        }
    }
`;

const JH_TASK_DETAIL = gql`
    query jianghuTaskDetail($taskId: ID!) {
        jianghuTaskDetail(taskId: $taskId) {
            id type level title brief plainText campusCode buildingCode
            targetNick targetBuilding rewardRep verifyMode boundOrderId
            status verifyCode codeExpireAt tryCount expireInSec
        }
    }
`;

const JH_MY_RECORDS = gql`
    query jianghuMyRecords($cursor: String, $limit: Int) {
        jianghuMyRecords(cursor: $cursor, limit: $limit) {
            id taskId reason reasonText deltaRep deltaIntel snapshotRep createdAt
        }
    }
`;

const JH_DAILY_RANK = gql`
    query jianghuDailyRank($campusCode: String) {
        jianghuDailyRank(campusCode: $campusCode) { customerId nickname rep isMe }
    }
`;

const JH_INTEL_MARKET = gql`
    query jianghuIntelMarket($campusCode: String, $cursor: String, $limit: Int) {
        jianghuIntelMarket(campusCode: $campusCode, cursor: $cursor, limit: $limit) {
            id category categoryText campusCode summary sourceNote priceIntel viewCount unlocked
        }
    }
`;

const JH_EVENT_CURRENT = gql`
    query jianghuEventCurrent($campusCode: String) {
        jianghuEventCurrent(campusCode: $campusCode) {
            id name desc total collected perPersonLimit endAt rewardPoolRep
        }
    }
`;

const JH_EVENT_DETAIL = gql`
    query jianghuEventDetail {
        jianghuEventDetail {
            id name desc total collected perPersonLimit endAt rewardPoolRep
            clues { id eventId nickname content sourceNote campusCode likes status createdAt }
            myClues { id eventId nickname content sourceNote campusCode likes status createdAt }
            contributors { customerId nickname count isMe }
            myContributed solved myRewardRep rewarded
        }
    }
`;

/** 江湖档案：声望、段位、结构性晋升计数、日上限 */
export async function jianghuProfile(): Promise<JianghuProfile> {
    if (JIANGHU_MOCK) return mock.jianghuProfile();
    return riderClient().request(JH_PROFILE).then((r: any) => r.jianghuProfile);
}

/** 九级段位配置（运营后台可配） */
export async function jianghuRankLadder(): Promise<any[]> {
    if (JIANGHU_MOCK) return mock.jianghuRankLadder();
    return riderClient().request(JH_RANK_LADDER).then((r: any) => r.jianghuRankLadder);
}

/** 江湖大厅：type=LETTER 密信 / INTEL 悬赏 */
export async function jianghuHall(q: { type?: JianghuTaskType; campusCode?: string; cursor?: string; limit?: number; lat?: number; lng?: number } = {}): Promise<JianghuTask[]> {
    if (JIANGHU_MOCK) return mock.jianghuHall(q);
    return riderClient().request(JH_HALL, q).then((r: any) => r.jianghuHall);
}

/** 任务详情；plainText 仅 TAKEN 后由服务端下发 */
export async function jianghuTaskDetail(taskId: string): Promise<JianghuTask | null> {
    if (JIANGHU_MOCK) return mock.jianghuTaskDetail(taskId);
    return riderClient().request(JH_TASK_DETAIL, { taskId }).then((r: any) => r.jianghuTaskDetail);
}

/** 我的江湖流水 */
export async function jianghuMyRecords(cursor?: string, limit = 20): Promise<JianghuRecord[]> {
    if (JIANGHU_MOCK) return mock.jianghuMyRecords();
    return riderClient().request(JH_MY_RECORDS, { cursor, limit }).then((r: any) => r.jianghuMyRecords);
}

/** 今日校区声望榜 */
export async function jianghuDailyRank(campusCode?: string): Promise<JianghuRankRow[]> {
    if (JIANGHU_MOCK) return mock.jianghuDailyRank();
    return riderClient().request(JH_DAILY_RANK, { campusCode }).then((r: any) => r.jianghuDailyRank);
}

/** 情报集市（P1） */
export async function jianghuIntelMarket(campusCode?: string, cursor?: string, limit = 20): Promise<JianghuIntel[]> {
    if (JIANGHU_MOCK) return mock.jianghuIntelMarket();
    return riderClient().request(JH_INTEL_MARKET, { campusCode, cursor, limit }).then((r: any) => r.jianghuIntelMarket);
}

/** 当前江湖事件（P1 多人拼图） */
export async function jianghuEventCurrent(campusCode?: string): Promise<JianghuEvent> {
    if (JIANGHU_MOCK) return mock.jianghuEventCurrent();
    return riderClient().request(JH_EVENT_CURRENT, { campusCode }).then((r: any) => r.jianghuEventCurrent);
}

/** P2 事件详情：拼图进度 + 线索墙 + 贡献者排行 + 我的状态 */
export async function jianghuEventDetail(): Promise<JianghuEventDetail | null> {
    if (JIANGHU_MOCK) return mock.jianghuEventDetail();
    return riderClient().request(JH_EVENT_DETAIL).then((r: any) => r.jianghuEventDetail);
}

/**
 * 江湖事件文案（Strapi 内容源）。运营在 h.joho.cn 可视化编辑上架，覆盖实体内联文案。
 * 返回 null 表示未配置/不可达，前端回退到实体字段（兼容老事件）。
 */
const JH_EVENT_CONTENT = gql`
    query jianghuEventContent {
        jianghuEventContent {
            title desc bannerImage rewardText active
        }
    }
`;

export async function jianghuEventContent(): Promise<JianghuEventContent | null> {
    if (JIANGHU_MOCK) return mock.jianghuEventContent();
    return riderClient().request(JH_EVENT_CONTENT).then((r: any) => r.jianghuEventContent);
}

/**
 * 演示暗号：仅 mock 环境返回（真实环境暗号由服务端生成并 60s 过期，前端不得预知）。
 * 页面据此决定是否展示「演示暗号」提示，避免演示时无法完成核销流程。
 */
export function jianghuDemoCode(): string {
    return JIANGHU_MOCK ? mock.jianghuDemoCode() : '';
}
