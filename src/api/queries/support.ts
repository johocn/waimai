import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

/**
 * C 端客服工单 / 骑手申诉 / 骑手评分 / 我的班次 / 骑手配送导航。
 * schema 以 campus-delivery-plugin shop-api 为准（campus-delivery.plugin.ts 第 1162-1221 行）。
 */

const MY_SUPPORT_TICKETS = gql`
    query campusMySupportTickets($skip: Int, $take: Int) {
        campusMySupportTickets(skip: $skip, take: $take) {
            id orderCode category content images status reply repliedAt createdAt
        }
    }
`;

const CREATE_SUPPORT_TICKET = gql`
    mutation campusCreateSupportTicket($category: String!, $content: String!, $images: [String!], $orderCode: String) {
        campusCreateSupportTicket(category: $category, content: $content, images: $images, orderCode: $orderCode) {
            id status createdAt
        }
    }
`;

const MY_RIDER_APPEALS = gql`
    query campusMyRiderAppeals($skip: Int, $take: Int) {
        campusMyRiderAppeals(skip: $skip, take: $take) {
            id orderCode reason images status creditDelta reviewNote reviewedAt createdAt
        }
    }
`;

const CREATE_RIDER_APPEAL = gql`
    mutation campusCreateRiderAppeal($reason: String!, $orderId: ID, $images: [String!]) {
        campusCreateRiderAppeal(reason: $reason, orderId: $orderId, images: $images) {
            id status createdAt
        }
    }
`;

const MY_RIDER_RATING = gql`
    query campusMyRiderRating {
        campusMyRiderRating { riderCustomerId avgRating ratingCount }
    }
`;

const MY_SHIFTS = gql`
    query campusMyShifts($from: String, $to: String) {
        campusMyShifts(from: $from, to: $to) { id shiftDate startTime endTime note }
    }
`;

const RIDER_NAV = gql`
    query campusRiderNav($orderId: ID!) {
        campusRiderNav(orderId: $orderId) {
            orderId orderCode storeName storeAddress storePhone storeLat storeLng
            buildingName buildingDetail buildingLat buildingLng campusZone note deliveryStatus
        }
    }
`;

const RATE_RIDER = gql`
    mutation campusRateRider($orderId: ID!, $rating: Int!, $tags: [String!], $comment: String) {
        campusRateRider(orderId: $orderId, rating: $rating, tags: $tags, comment: $comment) { ok rating }
    }
`;

export function fetchMySupportTickets(skip = 0, take = 50): Promise<any[]> {
    return getGraphQLClient()
        .request(MY_SUPPORT_TICKETS, { skip, take })
        .then((r: any) => r?.campusMySupportTickets ?? []);
}

export function createSupportTicket(v: {
    category: string;
    content: string;
    images?: string[];
    orderCode?: string;
}) {
    return getGraphQLClient()
        .request(CREATE_SUPPORT_TICKET, v)
        .then((r: any) => r?.campusCreateSupportTicket);
}

export function fetchMyRiderAppeals(skip = 0, take = 50): Promise<any[]> {
    return getGraphQLClient()
        .request(MY_RIDER_APPEALS, { skip, take })
        .then((r: any) => r?.campusMyRiderAppeals ?? []);
}

export function createRiderAppeal(v: { reason: string; orderId?: string; images?: string[] }) {
    return getGraphQLClient()
        .request(CREATE_RIDER_APPEAL, v)
        .then((r: any) => r?.campusCreateRiderAppeal);
}

export function fetchMyRiderRating(): Promise<any> {
    return getGraphQLClient()
        .request(MY_RIDER_RATING)
        .then((r: any) => r?.campusMyRiderRating ?? null);
}

export function fetchMyShifts(from?: string, to?: string): Promise<any[]> {
    return getGraphQLClient()
        .request(MY_SHIFTS, { from, to })
        .then((r: any) => r?.campusMyShifts ?? []);
}

export function fetchRiderNav(orderId: string): Promise<any> {
    return getGraphQLClient()
        .request(RIDER_NAV, { orderId })
        .then((r: any) => r?.campusRiderNav ?? null);
}

export function rateRider(v: { orderId: string; rating: number; tags?: string[]; comment?: string }) {
    return getGraphQLClient()
        .request(RATE_RIDER, v)
        .then((r: any) => r?.campusRateRider);
}
