import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

// schema 对照（campus-delivery.plugin.js shopApiExtensions）：
// CampusZone    { id name fee channelId }
// CampusBuilding{ id name detail zoneId channelId }
// DeliverySlot  { id slotDate startTime endTime zoneId capacity lockedCount active channelId }
//   —— 无 remaining 字段，余量 = capacity - lockedCount，前端自算
// campusSetDeliveryTarget(zoneId: ID!, buildingId: ID!, route: String, slotId: Int): Order!

export const CAMPUS_SET_DELIVERY_TARGET = gql`
    mutation campusSetDeliveryTarget($zoneId: ID!, $buildingId: ID!, $route: String, $slotId: Int) {
        campusSetDeliveryTarget(zoneId: $zoneId, buildingId: $buildingId, route: $route, slotId: $slotId) {
            id
            customFields { buildingId campusZone fulfillmentRoute deliverySlotId deliverySlotText }
        }
    }
`;

export const CAMPUS_ZONES = gql`
    query campusZones { campusZones { id name fee } }
`;

export const CAMPUS_BUILDINGS = gql`
    query campusBuildings($zoneId: ID) { campusBuildings(zoneId: $zoneId) { id name detail zoneId } }
`;

export const CAMPUS_SHOP_SLOTS = gql`
    query campusShopSlots { campusShopSlots { id slotDate startTime endTime capacity lockedCount active } }
`;

export const CAMPUS_ORDER_RIDER = gql`
    query campusOrderRider($orderId: ID!) { campusOrderRider(orderId: $orderId) { realName credit location { lat lng } } }
`;

/** 我的骑手档案：riderStatus 为 null/PENDING/REJECTED/APPROVED（未登录时后端直接报未授权） */
export const MY_RIDER_PROFILE = gql`
    query myRiderProfile {
        myRiderProfile {
            customerId riderStatus riderRealName riderStudentNo riderCampus riderCredit
        }
    }
`;

export function setDeliveryTarget(v: { zoneId: string; buildingId: string; route?: string; slotId?: number }) {
    return getGraphQLClient().request(CAMPUS_SET_DELIVERY_TARGET, v);
}
export function fetchZones() { return getGraphQLClient().request(CAMPUS_ZONES).then((r: any) => r?.campusZones ?? []); }
export function fetchBuildings(zoneId?: string) { return getGraphQLClient().request(CAMPUS_BUILDINGS, { zoneId }).then((r: any) => r?.campusBuildings ?? []); }
export function fetchSlots() { return getGraphQLClient().request(CAMPUS_SHOP_SLOTS).then((r: any) => r?.campusShopSlots ?? []); }
export function fetchOrderRider(orderId: string) { return getGraphQLClient().request(CAMPUS_ORDER_RIDER, { orderId }).then((r: any) => r?.campusOrderRider); }
export function fetchMyRiderProfile() { return getGraphQLClient().request(MY_RIDER_PROFILE).then((r: any) => r?.myRiderProfile); }

/** R2: 确认快递已到校（幂等；后端校验归属/R2/状态） */
export const CAMPUS_MARK_ARRIVED = gql`
    mutation campusMarkArrived($orderId: ID!) { campusMarkArrived(orderId: $orderId) { leg1Status } }
`;

/** R2 原单动态反查接力单状态（null=暂无接力单） */
export const CAMPUS_R2_RELAY = gql`
    query campusR2Relay($orderId: ID!) {
        campusR2Relay(orderId: $orderId) { orderId orderCode state hallStatus deliveryStatus errandTo tip totalWithTax }
    }
`;

/** R5 发单第一步：0 元载体 variantId + 跑腿起步价（分） */
export const CAMPUS_ERRAND_VARIANT = gql`
    query campusErrandVariant { campusErrandVariant { variantId sku errandBaseFee } }
`;

/** T0 运力预检：在线传信者数量（不阻断发单，仅提示） */
export const CAMPUS_CAPACITY_CHECK = gql`
    query campusCapacityCheck { campusCapacityCheck { paused ridersOnline } }
`;

/** R5/R2 接力第二步：写 errand 标记（须先 addItemToOrder 建购物车） */
export const CAMPUS_SET_ERRAND_INFO = gql`
    mutation campusSetErrandInfo($input: CampusErrandInput!) { campusSetErrandInfo(input: $input) { orderId } }
`;

export function markArrived(orderId: string) { return getGraphQLClient().request(CAMPUS_MARK_ARRIVED, { orderId }).then((r: any) => r?.campusMarkArrived); }
export function fetchR2Relay(orderId: string) { return getGraphQLClient().request(CAMPUS_R2_RELAY, { orderId }).then((r: any) => r?.campusR2Relay ?? null); }
export function fetchErrandVariant() { return getGraphQLClient().request(CAMPUS_ERRAND_VARIANT).then((r: any) => r?.campusErrandVariant); }
export function capacityCheck() { return getGraphQLClient().request(CAMPUS_CAPACITY_CHECK).then((r: any) => r?.campusCapacityCheck); }
export function setErrandInfo(input: any) { return getGraphQLClient().request(CAMPUS_SET_ERRAND_INFO, { input }).then((r: any) => r?.campusSetErrandInfo); }

/** plan 2.2 骑手位置上报：配送中 10s/次，仅本人 + assigned/in_progress 有效（后端校验），失败静默 */
export const CAMPUS_RIDER_REPORT_LOCATION = gql`
    mutation campusRiderReportLocation($orderId: ID!, $lat: Float!, $lng: Float!) {
        campusRiderReportLocation(orderId: $orderId, lat: $lat, lng: $lng) { id }
    }
`;
export function riderReportLocation(orderId: string, lat: number, lng: number) {
    return getGraphQLClient().request(CAMPUS_RIDER_REPORT_LOCATION, { orderId, lat, lng });
}

/** plan 2.4 用户催单：本人 + 未终态 + 10min 频控（后端校验），标记 urged=true 供骑手端轮询可见 */
export const CAMPUS_URGE_ORDER = gql`
    mutation campusUrgeOrder($orderId: ID!) { campusUrgeOrder(orderId: $orderId) { id } }
`;
export function urgeOrder(orderId: string) {
    return getGraphQLClient().request(CAMPUS_URGE_ORDER, { orderId });
}
