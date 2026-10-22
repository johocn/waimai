import { getGraphQLClient } from '../client';

/** 会员卡字段（myMemberInfo / myTier 共用；倍率类字段均为千分比，1000=1.0） */
const MEMBER_FIELDS = `
    customerId level levelName growthValue points
    nextLevelThreshold nextLevelName
    pointsMultiplier redeemDiscountRate redeemCapRatio specialDiscountRate
`;

/** 我的会员信息：authenticated；渠道隔离由 vendure-token 决定 */
export async function getMyMemberInfo() {
    const client = getGraphQLClient();
    const query = `
        query GetMyMemberInfo {
            myMemberInfo { ${MEMBER_FIELDS} }
        }
    `;
    return client.request(query);
}

/** 积分收支明细：authenticated；options 仅支持 skip/take（后端 PointsHistoryListOptions） */
export async function getMyPointsHistory(options?: { take?: number; skip?: number }) {
    const client = getGraphQLClient();
    const query = `
        query GetMyPointsHistory($options: PointsHistoryListOptions) {
            myPointsHistory(options: $options) {
                totalItems
                items {
                    id type amount balanceBefore balanceAfter
                    orderId remark expiresAt createdAt
                }
            }
        }
    `;
    return client.request(query, { options: { take: 20, ...(options || {}) } });
}

/** 今日签到状态：checkedIn / streak（连续天数）/ canCheckin */
export async function getCheckinToday() {
    const client = getGraphQLClient();
    const query = `
        query GetCheckinToday {
            checkinToday { checkedIn streak canCheckin }
        }
    `;
    return client.request(query);
}

/** 每日签到：成功后返回本次积分/成长值与最新连续天数 */
export async function doCheckin() {
    const client = getGraphQLClient();
    const query = `
        mutation DoCheckin {
            checkin { success reason points growth streak }
        }
    `;
    return client.request(query);
}

/** 成长任务列表：state = available（可领取）/ claimed（已领取）/ not_met（未达成） */
export async function getMyGrowthTasks() {
    const client = getGraphQLClient();
    const query = `
        query GetMyGrowthTasks {
            myTasks { taskCode state points growth }
        }
    `;
    return client.request(query);
}

/** 领取任务奖励：taskCode 为任务编码（daily_login 等） */
export async function claimGrowthTask(taskCode: string) {
    const client = getGraphQLClient();
    const query = `
        mutation ClaimGrowthTask($taskCode: String!) {
            claimTask(taskCode: $taskCode) { success reason points growth streak }
        }
    `;
    return client.request(query, { taskCode });
}
