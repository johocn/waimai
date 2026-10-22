import { GraphQLClient } from 'graphql-request';
import { getGraphQLClient, getShopApiUrl, getSessionToken } from '../client';
import { useAuthStore } from '../../stores/auth';
import { CART_FRAGMENT } from '../fragments';

export async function addItemToOrder(productVariantId: string, quantity: number) {
    const client = getGraphQLClient();
    const mutation = `${CART_FRAGMENT}
        mutation AddToCart($productVariantId: ID!, $quantity: Int!) { addItemToOrder(productVariantId: $productVariantId, quantity: $quantity) { ... on Order { ...CartInfo } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation, { productVariantId, quantity });
}

/** 跨店加购：收藏商品一键加购用，独立客户端固定 vendure-token 指向商品所属店铺渠道 */
export async function addItemToOrderInChannel(channelToken: string, productVariantId: string, quantity: number) {
    const authStore = useAuthStore();
    const headers: Record<string, string> = { 'vendure-token': channelToken };
    const bearer = authStore.token || getSessionToken();
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    const client = new GraphQLClient(getShopApiUrl(), { headers });
    const mutation = `${CART_FRAGMENT}
        mutation AddToCart($productVariantId: ID!, $quantity: Int!) { addItemToOrder(productVariantId: $productVariantId, quantity: $quantity) { ... on Order { ...CartInfo } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation, { productVariantId, quantity });
}

export async function adjustOrderLine(orderLineId: string, quantity: number) {
    const client = getGraphQLClient();
    const mutation = `${CART_FRAGMENT}
        mutation AdjustLine($orderLineId: ID!, $quantity: Int!) { adjustOrderLine(orderLineId: $orderLineId, quantity: $quantity) { ... on Order { ...CartInfo } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation, { orderLineId, quantity });
}

export async function removeOrderLine(orderLineId: string) {
    const client = getGraphQLClient();
    const mutation = `${CART_FRAGMENT}
        mutation RemoveLine($orderLineId: ID!) { removeOrderLine(orderLineId: $orderLineId) { ... on Order { ...CartInfo } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation, { orderLineId });
}

export async function removeAllOrderLines() {
    const client = getGraphQLClient();
    const mutation = `${CART_FRAGMENT}
        mutation RemoveAllLines { removeAllOrderLines { ... on Order { ...CartInfo } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation);
}

/** 清空指定渠道购物车（跨店购物车页用，独立客户端固定 vendure-token） */
export async function removeAllOrderLinesForChannel(channelToken: string) {
    const authStore = useAuthStore();
    const headers: Record<string, string> = { 'vendure-token': channelToken };
    const bearer = authStore.token || getSessionToken();
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    const client = new GraphQLClient(getShopApiUrl(), { headers });
    const mutation = `${CART_FRAGMENT}
        mutation RemoveAllLines { removeAllOrderLines { ... on Order { ...CartInfo } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation);
}

/** 调整指定渠道购物车单行数量（跨店购物车页，必须固定 vendure-token 指向该店铺渠道） */
export async function adjustOrderLineForChannel(channelToken: string, orderLineId: string, quantity: number) {
    const authStore = useAuthStore();
    const headers: Record<string, string> = { 'vendure-token': channelToken };
    const bearer = authStore.token || getSessionToken();
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    const client = new GraphQLClient(getShopApiUrl(), { headers });
    const mutation = `${CART_FRAGMENT}
        mutation AdjustLine($orderLineId: ID!, $quantity: Int!) { adjustOrderLine(orderLineId: $orderLineId, quantity: $quantity) { ... on Order { ...CartInfo } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation, { orderLineId, quantity });
}

/** 删除指定渠道购物车中的单行（购物车失效巡查，跨店场景必须固定 vendure-token） */
export async function removeOrderLineForChannel(channelToken: string, orderLineId: string) {
    const authStore = useAuthStore();
    const headers: Record<string, string> = { 'vendure-token': channelToken };
    const bearer = authStore.token || getSessionToken();
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    const client = new GraphQLClient(getShopApiUrl(), { headers });
    const mutation = `${CART_FRAGMENT}
        mutation RemoveLine($orderLineId: ID!) { removeOrderLine(orderLineId: $orderLineId) { ... on Order { ...CartInfo } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation, { orderLineId });
}

export async function applyCouponCode(couponCode: string) {
    const client = getGraphQLClient();
    const mutation = `${CART_FRAGMENT}
        mutation ApplyCoupon($couponCode: String!) { applyCouponCode(couponCode: $couponCode) { ... on Order { ...CartInfo } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation, { couponCode });
}

export async function removeCouponCode(couponCode: string) {
    const client = getGraphQLClient();
    // removeCouponCode 返回 Order（非 union），不能使用 inline fragments
    const mutation = `${CART_FRAGMENT}
        mutation RemoveCoupon($couponCode: String!) { removeCouponCode(couponCode: $couponCode) { ...CartInfo } }`;
    return client.request(mutation, { couponCode });
}