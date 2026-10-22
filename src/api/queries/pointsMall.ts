import { getGraphQLClient } from '../client';

/** 积分商品列表（仅当前渠道有效商品） */
export async function getPointsProducts(options?: { take?: number; skip?: number }) {
    const client = getGraphQLClient();
    const query = `
        query GetPointsProducts($options: PointsProductListOptions) {
            pointsProducts(options: $options) {
                totalItems
                items {
                    id productId variantId name slug image
                    pointsPrice cashPrice deliveryType stock perUserLimit
                    redeemedCount myRedeemedCount inStock validFrom validTo
                    priceWithTax
                }
            }
        }
    `;
    return client.request(query, { options: { take: 30, ...(options || {}) } });
}

/** 我的积分兑换记录 */
export async function getMyPointsOrders(options?: { take?: number; skip?: number; status?: string }) {
    const client = getGraphQLClient();
    const query = `
        query GetMyPointsOrders($options: PointsOrderListOptions) {
            myPointsOrders(options: $options) {
                totalItems
                items {
                    id code quantity pointsTotal cashTotal deliveryType status trackingNo
                    paidAt shippedAt completedAt createdAt refundStatus
                    productSnapshot { productId variantId name image spec }
                    addressSnapshot { name phone province city district detail }
                }
            }
        }
    `;
    return client.request(query, { options: { take: 20, ...(options || {}) } });
}

/** 创建积分兑换单：虚拟商品不传 addressId */
export async function createPointsOrderExchange(input: {
    pointsProductId: string;
    quantity: number;
    addressId?: string | null;
}) {
    const client = getGraphQLClient();
    const query = `
        mutation CreatePointsOrderExchange($input: CreatePointsOrderInput!) {
            createPointsOrderExchange(input: $input) {
                id code quantity pointsTotal cashTotal deliveryType status
            }
        }
    `;
    return client.request(query, {
        input: {
            pointsProductId: input.pointsProductId,
            quantity: input.quantity,
            ...(input.addressId ? { addressId: input.addressId } : {}),
        },
    });
}

/** 现金补差支付：pay 为微信支付参数（JSON） */
export async function createPointsOrderPayment(pointsOrderId: string) {
    const client = getGraphQLClient();
    const query = `
        mutation CreatePointsOrderPayment($pointsOrderId: ID!) {
            createPointsOrderPayment(pointsOrderId: $pointsOrderId) {
                pointsOrderId outTradeNo pay
            }
        }
    `;
    return client.request(query, { pointsOrderId });
}

/** 取消待支付兑换单（积分原路退回） */
export async function cancelPointsOrder(id: string) {
    const client = getGraphQLClient();
    const query = `
        mutation CancelPointsOrder($id: ID!) {
            cancelPointsOrder(id: $id) { id status }
        }
    `;
    return client.request(query, { id });
}
