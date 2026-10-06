import gql from 'graphql-tag';
import { riderClient } from './rider';

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
            id amount channel account status remark reviewedAt createdAt
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
