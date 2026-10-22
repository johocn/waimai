import { getGraphQLClient } from '../client';

/**
 * 订单配送包裹与轨迹（shop-api myOrderPackages / myOrderTracks，需登录）。
 * 包裹来自配送档案（含骑手/快递员、预计送达、运单号），轨迹为物流节点。
 */

export interface OrderPackageLine {
    orderLineId: string;
    quantity: number;
    productName: string;
    sku?: string | null;
}

export interface OrderPackage {
    code: string;
    deliveryMode: string;
    status: string;
    shippedAt?: string | null;
    deliveredAt?: string | null;
    cancelledAt?: string | null;
    shippingFee: number;
    trackingNo?: string | null;
    carrierName?: string | null;
    courierName?: string | null;
    courierPhone?: string | null;
    thirdPartyNo?: string | null;
    etaMinutes?: number | null;
    lines: OrderPackageLine[];
}

export interface LogisticsTrack {
    id: string;
    fulfillmentId?: string | null;
    trackingNo?: string | null;
    carrierCode?: string | null;
    carrierName?: string | null;
    status?: string | null;
    trackInfo?: string | null;
    signedAt?: string | null;
    lastSyncedAt?: string | null;
}

const PACKAGE_FIELDS = `
    code deliveryMode status shippedAt deliveredAt cancelledAt shippingFee
    trackingNo carrierName courierName courierPhone thirdPartyNo etaMinutes
    lines { orderLineId quantity productName sku }
`;

const TRACK_FIELDS = `
    id fulfillmentId trackingNo carrierCode carrierName status trackInfo signedAt lastSyncedAt
`;

export async function getOrderPackages(orderId: string) {
    const client = getGraphQLClient();
    const query = `query MyOrderPackages($orderId: ID!) {
        myOrderPackages(orderId: $orderId) { ${PACKAGE_FIELDS} }
    }`;
    const res: any = await client.request(query, { orderId });
    return (res?.myOrderPackages || []) as OrderPackage[];
}

export async function getOrderTracks(orderId: string) {
    const client = getGraphQLClient();
    const query = `query MyOrderTracks($orderId: ID!) {
        myOrderTracks(orderId: $orderId) { ${TRACK_FIELDS} }
    }`;
    const res: any = await client.request(query, { orderId });
    return (res?.myOrderTracks || []) as LogisticsTrack[];
}
