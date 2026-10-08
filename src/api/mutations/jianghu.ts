import gql from 'graphql-tag';
import { riderClient } from '../queries/rider';
import { JIANGHU_MOCK } from '../jianghu-env';
import * as mock from '../mock/jianghu';
import type { ClueInput, JianghuEventDetail, JianghuIntel, JianghuTask, JianghuVerifyResult, RumorInput } from '../../types/jianghu';

// 江湖模块写操作。核销与声望变更在服务端走事务 + 幂等键（taskId + customerId），
// 见 docs/specs/jianghu-courier-design.md §7.3 / §9.4。
// VITE_JIANGHU_MOCK=true 时改走本地 mock，签名与返回结构一致。

const JH_TAKE_TASK = gql`
    mutation jianghuTakeTask($taskId: ID!) {
        jianghuTakeTask(taskId: $taskId) {
            id type level title brief plainText campusCode buildingCode
            targetNick targetBuilding rewardRep verifyMode boundOrderId
            status verifyCode codeExpireAt tryCount expireInSec
        }
    }
`;

const JH_RELEASE_TASK = gql`
    mutation jianghuReleaseTask($taskId: ID!) { jianghuReleaseTask(taskId: $taskId) }
`;

const JH_REFRESH_CODE = gql`
    mutation jianghuRefreshCode($taskId: ID!) { jianghuRefreshCode(taskId: $taskId) }
`;

const JH_VERIFY = gql`
    mutation jianghuVerify($taskId: ID!, $code: String, $lat: Float, $lng: Float) {
        jianghuVerify(taskId: $taskId, code: $code, lat: $lat, lng: $lng) {
            ok deltaRep rep rankUp rankCode rankName message
        }
    }
`;

const JH_SUBMIT_RUMOR = gql`
    mutation jianghuSubmitRumor($input: RumorInput!) {
        jianghuSubmitRumor(input: $input) { id status }
    }
`;

const JH_UNLOCK_INTEL = gql`
    mutation jianghuUnlockIntel($intelId: ID!) {
        jianghuUnlockIntel(intelId: $intelId) {
            id category categoryText campusCode summary content sourceNote priceIntel viewCount unlocked
        }
    }
`;

const JH_COLLECT_CLUE = gql`
    mutation jianghuCollectClue($input: ClueInput!) {
        jianghuCollectClue(input: $input) {
            id name desc total collected perPersonLimit endAt rewardPoolRep
            clues { id eventId nickname content sourceNote campusCode likes status createdAt }
            myClues { id eventId nickname content sourceNote campusCode likes status createdAt }
            contributors { customerId nickname count isMe }
            myContributed solved myRewardRep rewarded
        }
    }
`;

/** 接取密信：锁定 15 分钟并返回明文密语与核销暗号 */
export async function jianghuTakeTask(taskId: string): Promise<JianghuTask> {
    if (JIANGHU_MOCK) return mock.jianghuTakeTask(taskId);
    return riderClient().request(JH_TAKE_TASK, { taskId }).then((r: any) => r.jianghuTakeTask);
}

/** 放弃密信：任务回收，信用分 -1 */
export async function jianghuReleaseTask(taskId: string): Promise<boolean> {
    if (JIANGHU_MOCK) return mock.jianghuReleaseTask(taskId);
    return riderClient().request(JH_RELEASE_TASK, { taskId }).then((r: any) => !!r.jianghuReleaseTask);
}

/** 刷新 6 位暗号（60s 有效，单任务最多 3 次试错） */
export async function jianghuRefreshCode(taskId: string): Promise<string> {
    if (JIANGHU_MOCK) return mock.jianghuRefreshCode(taskId);
    return riderClient().request(JH_REFRESH_CODE, { taskId }).then((r: any) => r.jianghuRefreshCode);
}

/** 核销：双口令 / 扫码 / LBS 围栏 / 绑定单送达，返回声望结算与是否晋升 */
export async function jianghuVerify(taskId: string, code?: string, lat?: number, lng?: number): Promise<JianghuVerifyResult> {
    if (JIANGHU_MOCK) return mock.jianghuVerify(taskId, code || '', lat, lng);
    return riderClient().request(JH_VERIFY, { taskId, code, lat, lng }).then((r: any) => r.jianghuVerify);
}

/** 重置 mock 演示数据（仅 VITE_JIANGHU_MOCK=true 时有效） */
export async function jianghuResetDemo(): Promise<void> {
    if (!JIANGHU_MOCK) throw new Error('仅演示模式支持重置');
    mock.resetJianghuMock();
}

/** 提交传闻：category + content + sourceNote（必填，合规留痕） */
export async function jianghuSubmitRumor(input: RumorInput): Promise<{ id: string; status: string }> {
    if (JIANGHU_MOCK) return mock.jianghuSubmitRumor(input);
    return riderClient().request(JH_SUBMIT_RUMOR, { input }).then((r: any) => r.jianghuSubmitRumor);
}

/** 解锁集市情报（P1，消耗积分） */
export async function jianghuUnlockIntel(intelId: string): Promise<JianghuIntel> {
    if (JIANGHU_MOCK) return mock.jianghuUnlockIntel(intelId);
    return riderClient().request(JH_UNLOCK_INTEL, { intelId }).then((r: any) => r.jianghuUnlockIntel);
}

/** P2 提交线索：点亮一块拼图，集齐后触发破案均分奖励池 */
export async function jianghuCollectClue(input: ClueInput): Promise<JianghuEventDetail> {
    if (JIANGHU_MOCK) return mock.jianghuCollectClue(input);
    return riderClient().request(JH_COLLECT_CLUE, { input }).then((r: any) => r.jianghuCollectClue);
}
