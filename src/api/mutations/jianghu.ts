import gql from 'graphql-tag';
import { riderClient } from '../queries/rider';
import { JIANGHU_MOCK } from '../jianghu-env';
import * as mock from '../mock/jianghu';
import type { ClueInput, CustomSkillInput, DeadDropPlaceInput, JianghuCustomSkill, JianghuDeadDrop, JianghuDemand, JianghuEventDetail, JianghuIntel, JianghuTask, JianghuVerifyResult, RumorInput, VoiceInput } from '../../types/jianghu';

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

/** 玩家心声：期待 / 玩法 / 建议，可沉淀为未来需求（后端 JH_SUBMIT_VOICE 待接入） */
export async function jianghuSubmitVoice(input: VoiceInput): Promise<{ id: string }> {
    if (JIANGHU_MOCK) return mock.jianghuSubmitVoice(input);
    // TODO(backend): 后端 campus-jianghu-plugin 提供 jianghuSubmitVoice 后替换
    return { id: 'pending' };
}

/** 运营采纳心声，沉淀为需求（后端 JH_ADOPT_VOICE 待接入） */
export async function jianghuAdoptVoice(id: string): Promise<JianghuDemand> {
    if (JIANGHU_MOCK) return mock.jianghuAdoptVoice(id);
    // TODO(backend): 后端 campus-jianghu-plugin 提供 jianghuAdoptVoice 后替换
    throw new Error('采纳心声接口待接入');
}

/** P2 提交线索：点亮一块拼图，集齐后触发破案均分奖励池 */
export async function jianghuCollectClue(input: ClueInput): Promise<JianghuEventDetail> {
    if (JIANGHU_MOCK) return mock.jianghuCollectClue(input);
    return riderClient().request(JH_COLLECT_CLUE, { input }).then((r: any) => r.jianghuCollectClue);
}

/* ── 死信箱（虚拟暗点投递） demo ── */

/** 查看暗点：返回当前暗点 + 当前时钟 */
export async function jianghuDeadDropInspect(): Promise<{ drop: JianghuDeadDrop | null; nowIso: string }> {
    if (JIANGHU_MOCK) return mock.jianghuDeadDropInspect();
    // TODO(backend): 后端 campus-jianghu-plugin 提供 jianghuDeadDropInspect 后替换
    throw new Error('死信箱接口待接入');
}

/** 投放情报（自动加密，明文不回传） */
export async function jianghuDeadDropPlace(input: DeadDropPlaceInput): Promise<JianghuDeadDrop> {
    if (JIANGHU_MOCK) return mock.jianghuDeadDropPlace(input);
    throw new Error('死信箱接口待接入');
}

/** 上线错时取件（须报对暗号，报错超限即被巡线截获） */
export async function jianghuDeadDropPickup(code: string, opts?: { conceal?: number; exposure?: number }): Promise<{ drop: JianghuDeadDrop; plainText: string; rewardRep: number }> {
    if (JIANGHU_MOCK) return mock.jianghuDeadDropPickup(code, opts);
    throw new Error('死信箱接口待接入');
}

/** 取件后流转至总舵核验（bonus=取证加成，如录音笔录音） */
export async function jianghuDeadDropDeliver(opts?: { bonus?: number }): Promise<{ rewardRep: number; bonus?: number }> {
    if (JIANGHU_MOCK) return mock.jianghuDeadDropDeliver(opts);
    throw new Error('死信箱接口待接入');
}

/** 演示用时间快进 */
export async function jianghuDeadDropFastForward(min: number): Promise<{ drop: JianghuDeadDrop | null; nowIso: string }> {
    if (JIANGHU_MOCK) return mock.jianghuDeadDropFastForward(min);
    throw new Error('死信箱接口待接入');
}

/** 重置暗点 */
export async function jianghuDeadDropReset(): Promise<void> {
    if (JIANGHU_MOCK) return mock.jianghuDeadDropReset();
    throw new Error('死信箱接口待接入');
}

/** 点场景物体取一枚线索碎片（识别系统；服务端须同源生成，防前端拼凑暗号） */export async function jianghuDeadDropClue(source: import('../../pkg-jianghu/scene/clues').ClueSource, seed: string): Promise<import('../../pkg-jianghu/scene/clues').ClueFragment> {
    if (JIANGHU_MOCK) return mock.jianghuDeadDropClue(source, seed);
    throw new Error('线索接口待接入');
}

/** 主动失败（取件过慢 / 被目击）：进入截获终态 */
export async function jianghuDeadDropFail(reason: string, penalty?: number): Promise<JianghuDeadDrop> {
    if (JIANGHU_MOCK) return mock.jianghuDeadDropFail(reason, penalty);
    throw new Error('死信箱接口待接入');
}

/** 时间沙漏：延长可取窗（分钟） */
export async function jianghuDeadDropExtend(min: number): Promise<JianghuDeadDrop> {
    if (JIANGHU_MOCK) return mock.jianghuDeadDropExtend(min);
    throw new Error('死信箱接口待接入');
}

/** 提交自定义技能（UGC）：进入 pending，待运营审核，approved 后才进藏匿/通道选择器 */
export async function jianghuCustomSkillSubmit(input: CustomSkillInput): Promise<JianghuCustomSkill> {
    if (JIANGHU_MOCK) return mock.jianghuCustomSkillSubmit(input);
    // TODO(backend): 后端 campus-jianghu-plugin 提供 jianghuCustomSkillSubmit 后替换
    throw new Error('自定义技能提交接口待接入');
}

/** 保存持有道具（领取/使用后整体回写） */
export async function jianghuSaveInventory(ids: string[]): Promise<string[]> {
    if (JIANGHU_MOCK) return mock.jianghuSaveInventory(ids);
    // TODO(backend): 后端 campus-jianghu-plugin 提供 jianghuSaveInventory 后替换
    throw new Error('持有道具保存接口待接入');
}
