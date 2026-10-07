import { getGraphQLClient } from '../client';
import { CART_FRAGMENT } from '../fragments';

/**
 * 领券/挂券 mutation 返回非 union（CustomerCoupon! / Order!），失败直接抛 GraphQL error。
 * 调用方 catch 后取 e?.response?.errors?.[0]?.message 原样 toast（后端报错即人话：已领完/超出限领/未开始/仅限新客）。
 */

export async function claimCoupon(templateId: string) {
    const client = getGraphQLClient();
    const mutation = `mutation ClaimCoupon($templateId: ID!) { claimCoupon(templateId: $templateId) { id code status } }`;
    return client.request(mutation, { templateId });
}

export async function claimProductCoupon(bindingId: string) {
    const client = getGraphQLClient();
    const mutation = `mutation ClaimProductCoupon($bindingId: ID!) { claimProductCoupon(bindingId: $bindingId) { id code status } }`;
    return client.request(mutation, { bindingId });
}

export async function applyCouponToOrder(code: string) {
    const client = getGraphQLClient();
    const mutation = `${CART_FRAGMENT}
        mutation ApplyCouponToOrder($code: String!) { applyCouponToOrder(code: $code) { ...CartInfo } }`;
    return client.request(mutation, { code });
}

export async function clearCouponFromOrder() {
    const client = getGraphQLClient();
    const mutation = `${CART_FRAGMENT}
        mutation ClearCouponFromOrder { clearCouponFromOrder { ...CartInfo } }`;
    return client.request(mutation);
}
