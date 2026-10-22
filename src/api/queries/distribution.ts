import { getGraphQLClient } from '../client';

/**
 * 推广 / 分销中心（distribution-plugin）。
 * 所有查询按当前渠道隔离；未申请推广员时 profile 为 null，
 * 佣金/提现/团队均返回空结构（后端已兜底，不抛错）。
 */

const DISTRIBUTOR_FIELDS = `
    id customerId parentId level status
    totalEarnings availableBalance frozenBalance referralCode createdAt
`;

const COMMISSION_FIELDS = `
    id distributorId orderId fromDistributorId
    commissionType commissionRate orderAmount commissionAmount status settledAt createdAt
`;

const WITHDRAWAL_FIELDS = `
    id distributorId amount method status reviewedAt paidAt createdAt
`;

export async function getMyDistributorProfile() {
    const client = getGraphQLClient();
    const query = `query MyDistributorProfile { myDistributorProfile { ${DISTRIBUTOR_FIELDS} } }`;
    const res: any = await client.request(query);
    return res?.myDistributorProfile || null;
}

export async function getMyCommissionRecords() {
    const client = getGraphQLClient();
    const query = `query MyCommissionRecords {
        myCommissionRecords {
            totalItems
            items { ${COMMISSION_FIELDS} }
        }
    }`;
    const res: any = await client.request(query);
    return (res?.myCommissionRecords || { items: [], totalItems: 0 }) as {
        items: any[];
        totalItems: number;
    };
}

export async function getMyWithdrawalRequests() {
    const client = getGraphQLClient();
    const query = `query MyWithdrawalRequests {
        myWithdrawalRequests {
            totalItems
            items { ${WITHDRAWAL_FIELDS} }
        }
    }`;
    const res: any = await client.request(query);
    return (res?.myWithdrawalRequests || { items: [], totalItems: 0 }) as {
        items: any[];
        totalItems: number;
    };
}

export async function getMyTeamSummary() {
    const client = getGraphQLClient();
    const query = `query MyTeamSummary {
        myTeamSummary {
            directTeamSize indirectTeamSize totalTeamSize
            orderCount orderAmount teamCommission
        }
    }`;
    const res: any = await client.request(query);
    return res?.myTeamSummary || {
        directTeamSize: 0,
        indirectTeamSize: 0,
        totalTeamSize: 0,
        orderCount: 0,
        orderAmount: 0,
        teamCommission: 0,
    };
}

/** 申请成为推广员；referredByCode 为上级推广码（可选） */
export async function applyDistributor(referredByCode?: string) {
    const client = getGraphQLClient();
    const query = `mutation ApplyDistributor($referredByCode: String) {
        applyDistributor(referredByCode: $referredByCode) { ${DISTRIBUTOR_FIELDS} }
    }`;
    const res: any = await client.request(query, { referredByCode: referredByCode || null });
    return res?.applyDistributor;
}

/** 申请提现：amount 单位为分；method: bank | alipay | wechat */
export async function requestWithdrawal(amount: number, method: string, accountInfo: string) {
    const client = getGraphQLClient();
    const query = `mutation RequestWithdrawal($amount: Int!, $method: WithdrawalMethod!, $accountInfo: String!) {
        requestWithdrawal(amount: $amount, method: $method, accountInfo: $accountInfo) {
            ${WITHDRAWAL_FIELDS}
        }
    }`;
    const res: any = await client.request(query, { amount, method, accountInfo });
    return res?.requestWithdrawal;
}
