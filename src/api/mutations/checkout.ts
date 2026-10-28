import { getGraphQLClient } from '../client';
import { ORDER_FRAGMENT } from '../fragments';

export async function setOrderShippingAddress(input: any) {
    const client = getGraphQLClient();
    const mutation = `${ORDER_FRAGMENT}
        mutation SetAddr($input: CreateAddressInput!) { setOrderShippingAddress(input: $input) { ... on Order { ...OrderDetail } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation, { input });
}

export async function setOrderShippingMethod(shippingMethodId: string[]) {
    const client = getGraphQLClient();
    const mutation = `${ORDER_FRAGMENT}
        mutation SetShip($shippingMethodId: [ID!]!) { setOrderShippingMethod(shippingMethodId: $shippingMethodId) { ... on Order { ...OrderDetail } ... on ErrorResult { errorCode message } } }`;
    return client.request(mutation, { shippingMethodId });
}

export async function transitionOrderToState(state: string) {
    const client = getGraphQLClient();
    return client.request(`${ORDER_FRAGMENT}
        mutation Transition($state: String!) { transitionOrderToState(state: $state) { ... on Order { ...OrderDetail } ... on ErrorResult { errorCode message } } }`, { state });
}

/**
 * 切换活跃订单（待付款订单续付）：把目标订单设为 activeOrder 后才能提交支付。
 * Vendure Shop API 无内置 setActiveOrder，由 campus-delivery-plugin 提供
 * campusResumePaymentOrder（校验归属 + 状态后落 session）。须在订单所属渠道下调用，故支持传入渠道客户端。
 */
export async function setActiveOrder(orderId: string, client?: any) {
    const c = client || getGraphQLClient();
    return c.request(`${ORDER_FRAGMENT}
        mutation ResumePay($orderId: ID!) { campusResumePaymentOrder(orderId: $orderId) { ...OrderDetail } }`, { orderId });
}

export async function addPaymentToOrder(method: string, metadata?: Record<string, any>) {
    const client = getGraphQLClient();
    return client.request(`${ORDER_FRAGMENT}
        mutation Pay($input: PaymentInput!) { addPaymentToOrder(input: $input) { ... on Order { ...OrderDetail } ... on ErrorResult { errorCode message } } }`, { input: { method, metadata: metadata || {} } });
}

/** 取消未结算的 payment（用户取消 JSAPI 支付时回退订单到可支付状态） */
export async function cancelPayment(paymentId: string) {
    const client = getGraphQLClient();
    return client.request(`
        mutation CancelPay($paymentId: ID!) { cancelPayment(paymentId: $paymentId) { ... on Order { id state } ... on ErrorResult { errorCode message } } }`, { paymentId });
}

export async function setCustomerForOrder(input: any) {
    const client = getGraphQLClient();
    return client.request(`${ORDER_FRAGMENT}
        mutation SetCustomer($input: CreateCustomerInput!) { setCustomerForOrder(input: $input) { ... on Order { ...OrderDetail } ... on ErrorResult { errorCode message } } }`, { input });
}

/** 整单备注：transition 前写入 Order customFields.note（空串/null 清除，防上单残留） */
export async function setOrderCustomFields(customFields: Record<string, any>) {
    const client = getGraphQLClient();
    return client.request(`${ORDER_FRAGMENT}
        mutation SetOrderNote($customFields: JSON!) { setOrderCustomFields(customFields: $customFields) { ... on Order { ...OrderDetail } ... on ErrorResult { errorCode message } } }`, { customFields });
}

export async function setOrderPickupLocation(pickupLocationId: string, pickupType: string) {
    const client = getGraphQLClient();
    // setOrderPickupLocation 返回 Order!（非 union），不能使用 inline fragments
    const mutation = `${ORDER_FRAGMENT}
        mutation SetPickup($pickupLocationId: ID!, $pickupType: String!) {
            setOrderPickupLocation(pickupLocationId: $pickupLocationId, pickupType: $pickupType) {
                ...OrderDetail
            }
        }`;
    return client.request(mutation, { pickupLocationId, pickupType });
}