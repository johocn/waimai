import { getGraphQLClient } from '../client';

export async function getPickupLocations(
    type?: 'store' | 'point',
    location?: { lat: number; lng: number },
) {
    const client = getGraphQLClient();
    const variables: any = {};
    if (type) variables.type = type;
    if (location) {
        variables.lat = location.lat;
        variables.lng = location.lng;
    }
    return client.request(
        `query($type: String, $lat: Float, $lng: Float) {
            pickupLocations(type: $type, lat: $lat, lng: $lng) {
                id name type address contactPerson phoneNumber businessHours coordinates photos isPublic
            }
        }`,
        variables,
    );
}

export async function getEmployeePickupLocations(
    location?: { lat: number; lng: number },
) {
    const client = getGraphQLClient();
    const variables: any = {};
    if (location) {
        variables.lat = location.lat;
        variables.lng = location.lng;
    }
    return client.request(
        `query($lat: Float, $lng: Float) {
            employeePickupLocations(lat: $lat, lng: $lng) {
                id name type address contactPerson phoneNumber businessHours coordinates photos isPublic
            }
        }`,
        variables,
    );
}

/** R4 自提核销码（幂等，一生对一单；非 pickup/未过支付闸门抛错） */
export async function fetchMyPickupCode(orderId: string) {
    const client = getGraphQLClient();
    return client.request(
        `query ($orderId: ID!) { myPickupCode(orderId: $orderId) { id code status claimedAt collected } }`,
        { orderId },
    );
}

/** 顾客自助核销（仅线上已收款单；到店收款单由店员核销） */
export async function claimPickup(orderId: string, code: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation ($orderId: ID!, $code: String!) { claimMyPickup(orderId: $orderId, code: $code) { id code status } }`,
        { orderId, code },
    );
}
