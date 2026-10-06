import{g as t}from"./index.Br3_8q2V.js";import{c as e}from"./rider.Z0Xu8vfe.js";const r=t`
    query myRiderWallet {
        myRiderWallet { available frozen totalEarned }
    }
`,a=t`
    query riderBalanceHistory($skip: Int, $take: Int) {
        riderBalanceHistory(skip: $skip, take: $take) {
            id createdAt type amount balanceAfter remark
        }
    }
`,n=t`
    query riderWithdrawRequests($skip: Int, $take: Int) {
        riderWithdrawRequests(skip: $skip, take: $take) {
            id amount channel account status remark reviewedAt createdAt
        }
    }
`,i=t`
    mutation riderWithdraw($amount: Int!, $channel: String!, $account: String!) {
        riderWithdraw(amount: $amount, channel: $channel, account: $account) {
            id amount status
        }
    }
`;async function s(){return e().request(r).then(t=>t.myRiderWallet)}async function u(t=0,r=20){return e().request(a,{skip:t,take:r}).then(t=>t.riderBalanceHistory)}async function c(t=0,r=20){return e().request(n,{skip:t,take:r}).then(t=>t.riderWithdrawRequests)}async function d(t){return e().request(i,t).then(t=>t.riderWithdraw)}export{c as a,d as b,s as m,u as r};
