import { GraphQLClient } from 'graphql-request';
import { getGraphQLClient, getShopApiUrl, getSessionToken } from '../client';
import { useAuthStore } from '../../stores/auth';

/**
 * 预售活动（pre-sale-plugin）。
 * 活动、变体与 activeOrder 都挂在店铺渠道下，因此按店铺用固定 vendure-token 的独立客户端。
 */

function channelClient(channelToken: string): GraphQLClient {
    const authStore = useAuthStore();
    const headers: Record<string, string> = { 'vendure-token': channelToken };
    const bearer = authStore.token || getSessionToken();
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    return new GraphQLClient(getShopApiUrl(), { headers });
}

const PRE_SALE_FIELDS = `
    id name mode startAt endAt releaseAt tailStartAt tailEndAt
    presalePrice depositAmount totalStock soldCount limitPerUser
    productId variantId status depositKind tailTriggerType tailWindowHours
    shipDeadlineAt
`;

export async function getActivePreSalesInChannel(channelToken: string) {
    const client = channelClient(channelToken);
    const query = `query ActivePreSales { activePreSaleActivities { ${PRE_SALE_FIELDS} } }`;
    const res: any = await client.request(query);
    return res?.activePreSaleActivities || [];
}

/** 对购物车应用预售（订单须已包含该预售变体；后端校验窗口/限购/库存并打折） */
export async function applyPreSaleInChannel(channelToken: string, activityId: string) {
    const client = channelClient(channelToken);
    const mutation = `mutation ApplyPreSale($activityId: ID!) {
        applyPreSale(activityId: $activityId) { id code state totalWithTax }
    }`;
    const res: any = await client.request(mutation, { activityId });
    return res?.applyPreSale;
}

/** 默认渠道（当前站点）预售列表：入口页在未选店铺时展示 */
export async function getActivePreSales() {
    const client = getGraphQLClient();
    const query = `query ActivePreSales { activePreSaleActivities { ${PRE_SALE_FIELDS} } }`;
    const res: any = await client.request(query);
    return res?.activePreSaleActivities || [];
}
