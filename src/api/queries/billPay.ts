import { getGraphQLClient } from '../client';

/**
 * 账单代付 / 企业账单（bill-pay-plugin，shop-api）。
 * 金额单位：分。autoQuote 命中的委托单创建后即为 QUOTED，可直接支付。
 */

const BILL_FIELDS = `
    id createdAt updatedAt code customerId
    merchantName expectedAmount quoteAmount actualAmount discountDetail
    status remark quoteNote quoteExpireAt proofUrl paymentMethod
    paidAt completedAt settledAt refundedAt completeNote channelId
`;

const CONFIG_FIELDS = `
    autoQuote quoteExpireMinutes couponEnabled tolerancePercent
    dailyLimitAmount minAmount maxAmount
    memberDiscount { percent label }
    thresholds { minSpend reduce label }
`;

export async function getBillPayConfig() {
    const client = getGraphQLClient();
    const query = `query BillPayConfig { billPayConfig { ${CONFIG_FIELDS} } }`;
    const res: any = await client.request(query);
    return res?.billPayConfig || null;
}

export async function getMyBillPayOrders(options?: { skip?: number; take?: number; status?: string }) {
    const client = getGraphQLClient();
    const query = `query BillPayOrders($options: BillPayOrderListOptions) {
        billPayOrders(options: $options) { items { ${BILL_FIELDS} } totalItems }
    }`;
    const res: any = await client.request(query, { options: options || {} });
    return res?.billPayOrders || { items: [], totalItems: 0 };
}

export async function createBillPayOrder(input: { merchantName: string; expectedAmount: number; remark?: string }) {
    const client = getGraphQLClient();
    const mutation = `mutation CreateBillPay($input: CreateBillPayOrderInput!) {
        createBillPayOrder(input: $input) { ${BILL_FIELDS} }
    }`;
    const res: any = await client.request(mutation, { input });
    return res?.createBillPayOrder;
}

export async function cancelBillPayOrder(id: string) {
    const client = getGraphQLClient();
    const mutation = `mutation CancelBillPay($id: ID!) {
        cancelBillPayOrder(id: $id) { ${BILL_FIELDS} }
    }`;
    const res: any = await client.request(mutation, { id });
    return res?.cancelBillPayOrder;
}

/** 微信支付参数（tradeType: JSAPI / H5 / NATIVE / APP） */
export async function createWechatBillPayment(id: string, tradeType?: string, openid?: string) {
    const client = getGraphQLClient();
    const mutation = `mutation WechatBillPay($id: ID!, $tradeType: String, $openid: String) {
        createWechatBillPayment(id: $id, tradeType: $tradeType, openid: $openid) {
            billPayOrderId outTradeNo
            pay { payType prepayId appId timeStamp nonceStr package signType paySign payUrl }
        }
    }`;
    const res: any = await client.request(mutation, { id, tradeType: tradeType ?? null, openid: openid ?? null });
    return res?.createWechatBillPayment;
}

export async function payBillPayOrderWithBalance(id: string) {
    const client = getGraphQLClient();
    const mutation = `mutation PayBillWithBalance($id: ID!) {
        payBillPayOrderWithBalance(id: $id) { ${BILL_FIELDS} }
    }`;
    const res: any = await client.request(mutation, { id });
    return res?.payBillPayOrderWithBalance;
}
