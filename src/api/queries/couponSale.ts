import { GraphQLClient } from 'graphql-request';
import { getGraphQLClient, getShopApiUrl, getSessionToken } from '../client';
import { useAuthStore } from '../../stores/auth';

/**
 * 券商城（付费购券）C 端接口。
 *
 * 目录与出售单都按「店铺渠道」隔离（后端用 ctx.channelId 过滤渠道券/券包），
 * 购物车里的加价购又必须指向该店铺的 activeOrder，因此提供 channelClient：
 * 固定 vendure-token，避免被全局 ShopClient 的默认渠道覆盖。
 */

function channelClient(channelToken: string): GraphQLClient {
    const authStore = useAuthStore();
    const headers: Record<string, string> = { 'vendure-token': channelToken };
    const bearer = authStore.token || getSessionToken();
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    return new GraphQLClient(getShopApiUrl(), { headers });
}

const SALE_TEMPLATE_FIELDS = `
    id name description type discountValue minSpend salePrice anchorPrice label
    pointsPrice validDays totalCount claimedCount perUserLimit usageScene soldCount
`;

const BUNDLE_FIELDS = `
    id name description salePrice soldCount
    items { id templateId quantity }
`;

const SALE_ORDER_FIELDS = `
    id customerId payMode templateId bundleId orderId amount
    discountType discountAmount status paidAt refundedAt createdAt
`;

/** 券商城目录（匿名可浏览）：可售单券 + 券包 + 首购优惠 + 倒计时活动位 */
export async function getCouponSaleCatalogueInChannel(channelToken?: string) {
    const client = channelToken ? channelClient(channelToken) : getGraphQLClient();
    const query = `query CouponSaleCatalogue {
        couponSaleCatalogue {
            templates { ${SALE_TEMPLATE_FIELDS} }
            bundles { ${BUNDLE_FIELDS} }
            firstBuyDiscount firstBuyEligible studentApproved
            campaign { name subtitle rules startsAt endsAt }
        }
    }`;
    const res: any = await client.request(query);
    return res?.couponSaleCatalogue || {
        templates: [], bundles: [], firstBuyDiscount: 0,
        firstBuyEligible: null, studentApproved: null, campaign: null,
    };
}

/** 我的购券单（需登录，当前会话渠道） */
export async function getMyCouponSaleOrders() {
    const client = getGraphQLClient();
    const query = `query MyCouponSaleOrders { myCouponSaleOrders { ${SALE_ORDER_FIELDS} } }`;
    const res: any = await client.request(query);
    return res?.myCouponSaleOrders || [];
}

/** 指定店铺渠道的购券单（购物车按店铺分组时用，固定 vendure-token） */
export async function getMyCouponSaleOrdersInChannel(channelToken: string) {
    const client = channelClient(channelToken);
    const query = `query MyCouponSaleOrders { myCouponSaleOrders { ${SALE_ORDER_FIELDS} } }`;
    const res: any = await client.request(query);
    return res?.myCouponSaleOrders || [];
}

/** 创建购券单：templateId（单券）与 bundleId（券包）二选一 */
export async function createCouponSaleOrder(input: { templateId?: string; bundleId?: string }) {
    const client = getGraphQLClient();
    const query = `mutation CreateCouponSaleOrder($templateId: ID, $bundleId: ID) {
        createCouponSaleOrder(templateId: $templateId, bundleId: $bundleId) { ${SALE_ORDER_FIELDS} }
    }`;
    const res: any = await client.request(query, {
        templateId: input.templateId || null,
        bundleId: input.bundleId || null,
    });
    return res?.createCouponSaleOrder;
}

/** 余额支付购券单 */
export async function payCouponSaleWithBalance(id: string) {
    const client = getGraphQLClient();
    const query = `mutation PayCouponSaleWithBalance($id: ID!) {
        payCouponSaleWithBalance(id: $id) { ${SALE_ORDER_FIELDS} }
    }`;
    const res: any = await client.request(query, { id });
    return res?.payCouponSaleWithBalance;
}

/** 微信支付购券单：H5 下 tradeType=H5，公众号内 JSAPI */
export async function createWechatCouponPayment(saleOrderId: string, tradeType = 'H5') {
    const client = getGraphQLClient();
    const query = `mutation CreateWechatCouponPayment($saleOrderId: ID!, $tradeType: String) {
        createWechatCouponPayment(saleOrderId: $saleOrderId, tradeType: $tradeType) {
            saleOrderId outTradeNo
            pay { payType prepayId appId timeStamp nonceStr package signType paySign payUrl }
        }
    }`;
    const res: any = await client.request(query, { saleOrderId, tradeType });
    return res?.createWechatCouponPayment;
}

export async function cancelCouponSaleOrder(id: string) {
    const client = getGraphQLClient();
    const query = `mutation CancelCouponSaleOrder($id: ID!) {
        cancelCouponSaleOrder(id: $id) { ${SALE_ORDER_FIELDS} }
    }`;
    const res: any = await client.request(query, { id });
    return res?.cancelCouponSaleOrder;
}

export async function refundCouponSaleOrder(id: string, reason?: string) {
    const client = getGraphQLClient();
    const query = `mutation RefundCouponSaleOrder($id: ID!, $reason: String) {
        refundCouponSaleOrder(id: $id, reason: $reason) { ${SALE_ORDER_FIELDS} }
    }`;
    const res: any = await client.request(query, { id, reason: reason || null });
    return res?.refundCouponSaleOrder;
}

/** 加价购：把券价作为 surcharge 挂到本店铺 activeOrder 上（返回出售单） */
export async function attachCouponToOrderInChannel(channelToken: string, orderId: string, templateId: string) {
    const client = channelClient(channelToken);
    const query = `mutation AttachCouponToOrder($orderId: ID!, $templateId: ID!) {
        attachCouponToOrder(orderId: $orderId, templateId: $templateId) { ${SALE_ORDER_FIELDS} }
    }`;
    const res: any = await client.request(query, { orderId, templateId });
    return res?.attachCouponToOrder;
}

/** 摘除加价购：移除 surcharge 并把出售单置 CANCELLED */
export async function detachCouponFromOrderInChannel(channelToken: string, orderId: string, templateId: string) {
    const client = channelClient(channelToken);
    const query = `mutation DetachCouponFromOrder($orderId: ID!, $templateId: ID!) {
        detachCouponFromOrder(orderId: $orderId, templateId: $templateId)
    }`;
    const res: any = await client.request(query, { orderId, templateId });
    return res?.detachCouponFromOrder;
}
