import gql from 'graphql-tag';
import { riderClient } from './rider';
import { getGraphQLClient } from '../client';

// 骑手钱包：余额底座 = recharge-card CustomerBalance（经 coupon-balance-port），
// 提现/流水是平台级能力，走 riderClient() 默认渠道（与 rider.ts 会话一致）。

const MY_RIDER_WALLET = gql`
    query myRiderWallet {
        myRiderWallet { available frozen totalEarned }
    }
`;

const RIDER_BALANCE_HISTORY = gql`
    query riderBalanceHistory($skip: Int, $take: Int) {
        riderBalanceHistory(skip: $skip, take: $take) {
            id createdAt type amount balanceAfter remark
        }
    }
`;

const RIDER_WITHDRAW_REQUESTS = gql`
    query riderWithdrawRequests($skip: Int, $take: Int) {
        riderWithdrawRequests(skip: $skip, take: $take) {
            id amount channel account status remark reviewedAt createdAt payoutRef
        }
    }
`;

const RIDER_WITHDRAW = gql`
    mutation riderWithdraw($amount: Int!, $channel: String!, $account: String!) {
        riderWithdraw(amount: $amount, channel: $channel, account: $account) {
            id amount status
        }
    }
`;

/** { available 可用（分） frozen 冻结中 totalEarned 累计收入 } */
export async function myRiderWallet() {
    return riderClient().request(MY_RIDER_WALLET).then((r: any) => r.myRiderWallet);
}

/** 余额流水：{ type recharge/consume/refund/... amount（含符号） balanceAfter } */
export async function riderBalanceHistory(skip = 0, take = 20) {
    return riderClient().request(RIDER_BALANCE_HISTORY, { skip, take }).then((r: any) => r.riderBalanceHistory);
}

/** 提现申请记录（本人，倒序） */
export async function riderWithdrawRequests(skip = 0, take = 20) {
    return riderClient().request(RIDER_WITHDRAW_REQUESTS, { skip, take }).then((r: any) => r.riderWithdrawRequests);
}

/** 提现申请：amount（分）≥¥10；成功即冻结（available 减少、frozen 增加） */
export async function riderWithdraw(v: { amount: number; channel: string; account: string }) {
    return riderClient().request(RIDER_WITHDRAW, v).then((r: any) => r.riderWithdraw);
}

// ---------------------------------------------------------------------------
// 顾客余额中心（充值卡 / 在线充值 / 余额流水）：走当前会话渠道，租户隔离
// ---------------------------------------------------------------------------

/** 余额快照：金额单位为分 */
export async function getMyBalance() {
    const client = getGraphQLClient();
    const query = `
        query GetMyBalance {
            myBalanceWithFrozen { balance frozenBalance minWithdrawalAmount }
        }
    `;
    return client.request(query);
}

/** 余额流水：options 仅支持 skip/take */
export async function getMyBalanceTransactions(options?: { take?: number; skip?: number }) {
    const client = getGraphQLClient();
    const query = `
        query GetMyBalanceTransactions($options: RechargeCardListOptions) {
            myBalanceTransactions(options: $options) {
                totalItems
                items { id type amount balanceBefore balanceAfter orderId remark createdAt }
            }
        }
    `;
    return client.request(query, { options: { take: 20, ...(options || {}) } });
}

/** 已兑换的充值卡记录 */
export async function getMyRechargeHistory() {
    const client = getGraphQLClient();
    const query = `
        query GetMyRechargeHistory {
            myRechargeHistory { id code faceValue state redeemedAt createdAt }
        }
    `;
    return client.request(query);
}

/** 在线充值单（pending/paid/cancelled） */
export async function getMyRechargeOrders() {
    const client = getGraphQLClient();
    const query = `
        query GetMyRechargeOrders {
            myRechargeOrders { id amount status paymentMethod paidAt remark createdAt }
        }
    `;
    return client.request(query);
}

/** 充值卡兑换：code 必填，pin 仅加密批次需要 */
export async function redeemRechargeCard(code: string, pin?: string) {
    const client = getGraphQLClient();
    const query = `
        mutation RedeemRechargeCard($code: String!, $pin: String) {
            redeemRechargeCard(code: $code, pin: $pin) { success faceValue newBalance cardCode }
        }
    `;
    return client.request(query, { code, pin: pin || null });
}

/** 创建在线充值单：amount 单位为分 */
export async function createRechargeOrder(amount: number, remark?: string) {
    const client = getGraphQLClient();
    const query = `
        mutation CreateRechargeOrder($amount: Int!, $remark: String) {
            createRechargeOrder(amount: $amount, remark: $remark) { id amount status createdAt }
        }
    `;
    return client.request(query, { amount, remark: remark || null });
}

/** 拉起微信支付：返回 JSAPI / H5 支付参数 */
export async function createWechatRechargePayment(rechargeOrderId: string) {
    const client = getGraphQLClient();
    const query = `
        mutation CreateWechatRechargePayment($rechargeOrderId: ID!) {
            createWechatRechargePayment(rechargeOrderId: $rechargeOrderId) {
                rechargeOrderId outTradeNo
                pay { payType prepayId appId timeStamp nonceStr package signType paySign payUrl }
            }
        }
    `;
    return client.request(query, { rechargeOrderId });
}
