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

/**
 * 骑手请求客户端。
 * 不传 channelToken → 默认渠道（profile/上下线/心跳等平台级操作）；
 * 传店铺渠道 token → 大厅/任务/抢单等按渠道过滤的 campus* 接口
 * （campusHall/campusMyTasks 按 ctx.channelId 过滤，跨店铺聚合见 hall.ts）。
 */
export function riderClient(channelToken?: string): GraphQLClient {
    const authStore = useAuthStore();
    const headers: Record<string, string> = { 'vendure-token': channelToken || RIDER_CHANNEL_TOKEN };
    const bearer = authStore.token || getSessionToken();
    if (bearer) {
        headers['Authorization'] = 'Bearer ' + bearer;
    }
    return new GraphQLClient(getShopApiUrl(), { headers });
}

const APPLY_RIDER = gql`
    mutation applyRider($realName: String!, $studentNo: String!, $campus: String!, $idImg: String, $healthCertImg: String) {
        applyRider(realName: $realName, studentNo: $studentNo, campus: $campus, idImg: $idImg, healthCertImg: $healthCertImg) { status }
    }
`;

// P2-5 合规：compliance 由后端 rider-compliance.ts 实时判定（过期/背调未通过 → blocked 禁止接单）
const MY_RIDER_PROFILE = gql`
    query myRiderProfile {
        myRiderProfile {
            customerId riderStatus riderRealName riderStudentNo riderCampus riderCredit
            riderHealthCertExpiry riderInsuranceExpiry
            compliance { ok blocked pending items { key label status expiry detail } }
        }
    }
`;

const RIDER_ONLINE = gql`
    mutation campusRiderOnline($online: Boolean!) { campusRiderOnline(online: $online) { online } }
`;

const RIDER_HEARTBEAT = gql`
    mutation campusRiderHeartbeat { campusRiderHeartbeat { online } }
`;

// P2-6 骑手侧顾客联系方式（号码保护）：仅本单骑手可查，真实号不出服务端
const RIDER_CUSTOMER_CONTACT = gql`
    query campusRiderCustomerContact($orderId: ID!) {
        campusRiderCustomerContact(orderId: $orderId) {
            protected display callable provider expiresAt note
        }
    }
`;

/** 提交骑手入驻申请，后端返回 { status: 'pending' }；healthCertImg 为健康证照片（选填） */
export async function applyRider(v: { realName: string; studentNo: string; campus: string; idImg?: string; healthCertImg?: string }) {
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

/** 骑手侧顾客联系方式：返回 { protected, display, callable, provider, expiresAt, note }；
 *  未开启号码保护时 display 即真实号；开启后只有脱敏/虚拟号（callable 为 null 表示不可拨）。 */
export async function riderCustomerContact(orderId: string, channelToken?: string) {
    return riderClient(channelToken).request(RIDER_CUSTOMER_CONTACT, { orderId }).then((r: any) => r.campusRiderCustomerContact);
}
