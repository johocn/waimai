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
    query campusOrderRider($orderId: ID!) { campusOrderRider(orderId: $orderId) { realName credit } }
`;

export function setDeliveryTarget(v: { zoneId: string; buildingId: string; route?: string; slotId?: number }) {
    return getGraphQLClient().request(CAMPUS_SET_DELIVERY_TARGET, v);
}
export function fetchZones() { return getGraphQLClient().request(CAMPUS_ZONES).then((r: any) => r?.campusZones ?? []); }
export function fetchBuildings(zoneId?: string) { return getGraphQLClient().request(CAMPUS_BUILDINGS, { zoneId }).then((r: any) => r?.campusBuildings ?? []); }
export function fetchSlots() { return getGraphQLClient().request(CAMPUS_SHOP_SLOTS).then((r: any) => r?.campusShopSlots ?? []); }
export function fetchOrderRider(orderId: string) { return getGraphQLClient().request(CAMPUS_ORDER_RIDER, { orderId }).then((r: any) => r?.campusOrderRider); }
