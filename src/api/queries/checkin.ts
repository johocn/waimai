import { getGraphQLClient } from '../client';

/**
 * 每日签到（checkin-plugin，shop-api）。
 * 签到与任务奖励直接进会员积分 / 成长值，接口均要求登录态。
 */

export async function getCheckinToday() {
    const client = getGraphQLClient();
    const query = `query CheckinToday {
        checkinToday { checkedIn streak canCheckin }
    }`;
    const res: any = await client.request(query);
    return res?.checkinToday || { checkedIn: false, streak: 0, canCheckin: false };
}

export async function getMyTaskSummaries() {
    const client = getGraphQLClient();
    const query = `query MyTasks {
        myTasks { taskCode state points growth }
    }`;
    const res: any = await client.request(query);
    return res?.myTasks || [];
}

/** 执行签到：返回本次获得的积分/成长值与当前连签天数 */
export async function doCheckin() {
    const client = getGraphQLClient();
    const mutation = `mutation Checkin {
        checkin { success reason points growth streak }
    }`;
    const res: any = await client.request(mutation);
    return res?.checkin;
}

/** 领取任务奖励（taskCode 见后端 ACTIVE_TASKS，状态 available 时才可领） */
export async function claimTask(taskCode: string) {
    const client = getGraphQLClient();
    const mutation = `mutation ClaimTask($taskCode: String!) {
        claimTask(taskCode: $taskCode) { success reason points growth streak }
    }`;
    const res: any = await client.request(mutation, { taskCode });
    return res?.claimTask;
}
