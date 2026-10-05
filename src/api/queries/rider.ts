import gql from 'graphql-tag';
import { GraphQLClient } from 'graphql-request';
import { getShopApiUrl, getSessionToken } from '../client';
import { useAuthStore } from '../../stores/auth';

// 骑手是平台角色：走默认渠道会话，不随进店切渠道（spec §6）。
// 独立 GraphQLClient（ShopClient 每次请求会用 tenantStore.token 覆盖请求头）。
// schema 已按 vendure campus-delivery-plugin 源码校准：
//   rider-shop.resolver.ts / hall-shop.resolver.ts / rider-task-shop.resolver.ts
//   riderStatus 值域小写：null / 'pending' / 'approved' / 'suspended'
const RIDER_CHANNEL_TOKEN = (import.meta.env?.VITE_CHANNEL_TOKEN as string) || '';

export function riderClient(): GraphQLClient {
    const authStore = useAuthStore();
    const headers: Record<string, string> = { 'vendure-token': RIDER_CHANNEL_TOKEN };
    const bearer = authStore.token || getSessionToken();
    if (bearer) {
        headers['Authorization'] = 'Bearer ' + bearer;
    }
    return new GraphQLClient(getShopApiUrl(), { headers });
}

const APPLY_RIDER = gql`
    mutation applyRider($realName: String!, $studentNo: String!, $campus: String!, $idImg: String) {
        applyRider(realName: $realName, studentNo: $studentNo, campus: $campus, idImg: $idImg) { status }
    }
`;

const MY_RIDER_PROFILE = gql`
    query myRiderProfile {
        myRiderProfile { customerId riderStatus riderRealName riderStudentNo riderCampus riderCredit }
    }
`;

const RIDER_ONLINE = gql`
    mutation campusRiderOnline($online: Boolean!) { campusRiderOnline(online: $online) { online } }
`;

const RIDER_HEARTBEAT = gql`
    mutation campusRiderHeartbeat { campusRiderHeartbeat { online } }
`;

/** 提交骑手入驻申请，后端返回 { status: 'pending' } */
export async function applyRider(v: { realName: string; studentNo: string; campus: string; idImg?: string }) {
    return riderClient().request(APPLY_RIDER, v).then((r: any) => r.applyRider);
}

export async function myRiderProfile() {
    return riderClient().request(MY_RIDER_PROFILE).then((r: any) => r.myRiderProfile);
}

/** 上下线开关：返回 { online: boolean } */
export async function riderOnline(online: boolean) {
    return riderClient().request(RIDER_ONLINE, { online }).then((r: any) => r.campusRiderOnline);
}

/** 心跳（30s 定时）：返回 { online: true }；未登录/非骑手抛 Forbidden */
export async function riderHeartbeat() {
    return riderClient().request(RIDER_HEARTBEAT).then((r: any) => r.campusRiderHeartbeat);
}
