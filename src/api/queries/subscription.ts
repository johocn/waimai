import { getGraphQLClient } from '../client';

/**
 * 周期购订阅（subscription-plugin，shop-api）。
 * 买断制：创建订阅即用预存余额抵扣整期总价，后端按下单频次展开期次并逐期生成订单。
 */

const PLAN_FIELDS = `
    id shopId title description periods periodPrice enabled
`;

const SUB_FIELDS = `
    id code planId shopId customerId scheduleJson
    startDate endDate prepaidBalance purchasedTotal status
`;

const OCC_FIELDS = `
    id subscriptionId periodNo scheduledDate
    orderCode generatedOrderId status skipReason
`;

export async function getAvailablePlans() {
    const client = getGraphQLClient();
    const query = `query AvailablePlans { availablePlans { items { ${PLAN_FIELDS} } totalItems } }`;
    const res: any = await client.request(query);
    return res?.availablePlans?.items || [];
}

export async function getMySubscriptions() {
    const client = getGraphQLClient();
    const query = `query MySubscriptions { mySubscriptions { items { ${SUB_FIELDS} } totalItems } }`;
    const res: any = await client.request(query);
    return res?.mySubscriptions?.items || [];
}

export async function getMySubscriptionOccurrences(subscriptionId: string) {
    const client = getGraphQLClient();
    const query = `query SubscriptionOccurrences($subscriptionId: ID!) {
        mySubscriptionOccurrences(subscriptionId: $subscriptionId) { items { ${OCC_FIELDS} } totalItems }
    }`;
    const res: any = await client.request(query, { subscriptionId });
    return res?.mySubscriptionOccurrences?.items || [];
}

/** 开通订阅（买断）：planId + 起始日期（ISO 字符串） */
export async function createSubscription(planId: string, startDate: string) {
    const client = getGraphQLClient();
    const mutation = `mutation CreateSubscription($planId: ID!, $input: CreateSubscriptionInput!) {
        createSubscription(planId: $planId, input: $input) { ${SUB_FIELDS} }
    }`;
    const res: any = await client.request(mutation, { planId, input: { startDate } });
    return res?.createSubscription;
}

/** 买断期满后续订确认（status=renewalPending 时可用） */
export async function confirmRenewal(id: string) {
    const client = getGraphQLClient();
    const mutation = `mutation ConfirmRenewal($id: ID!) {
        confirmRenewal(id: $id) { ${SUB_FIELDS} }
    }`;
    const res: any = await client.request(mutation, { id });
    return res?.confirmRenewal;
}
