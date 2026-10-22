import { getGraphQLClient } from '../client';

/**
 * 分期 / 预售尾款账单（payment-schedule-plugin）。
 * paymentSchedule 依赖订单归属（后端 requireOwner），必须带登录会话。
 */

const SCHEDULE_FIELDS = `
    id createdAt updatedAt orderId scenario status breachType
    depositRule deliveryGate agreementVersion shipDeadline meta
    paidTotal totalAmount
    items {
        id createdAt updatedAt seq kind amount paidAmount allowCod
        status dueAt graceHours trigger paidAt lateFeeAccrued
    }
`;

export async function getPaymentSchedule(orderId: string) {
    const client = getGraphQLClient();
    const query = `query PaymentSchedule($orderId: ID!) {
        paymentSchedule(orderId: $orderId) { ${SCHEDULE_FIELDS} }
    }`;
    const res: any = await client.request(query, { orderId });
    return res?.paymentSchedule || null;
}

/** 支付某一期（method: 'balance-pay' 余额 / 'wechatpay' 微信） */
export async function paySchedulePeriod(orderId: string, seq: number, method: string) {
    const client = getGraphQLClient();
    const mutation = `mutation PaySchedulePeriod($orderId: ID!, $seq: Int!, $method: String!) {
        paySchedulePeriod(orderId: $orderId, seq: $seq, method: $method) { ${SCHEDULE_FIELDS} }
    }`;
    const res: any = await client.request(mutation, { orderId, seq, method });
    return res?.paySchedulePeriod;
}

/** 取消账单（法定定金场景须 confirmForfeit=true 表示接受定金没收） */
export async function cancelSchedule(orderId: string, confirmForfeit: boolean) {
    const client = getGraphQLClient();
    const mutation = `mutation CancelSchedule($orderId: ID!, $confirmForfeit: Boolean) {
        cancelSchedule(orderId: $orderId, confirmForfeit: $confirmForfeit) { ${SCHEDULE_FIELDS} }
    }`;
    const res: any = await client.request(mutation, { orderId, confirmForfeit });
    return res?.cancelSchedule;
}
