import { getGraphQLClient } from '../client';

/**
 * 分享裂变领券（coupon-plugin FR-C）。
 * 活动匿名可看（未配置/未开始/已结束后端返回 null）；领奖需登录，
 * 未登录不报错而是返回 status=NOT_LOGGED_IN，由前端引导登录。
 */

const FISSION_TEMPLATE_FIELDS = `
    id name description type discountValue minSpend validDays usageScene
`;

export async function getCouponFissionActivity() {
    const client = getGraphQLClient();
    const query = `query CouponFissionActivity {
        couponFissionActivity {
            name subtitle rules startsAt endsAt
            inviteeTemplate { ${FISSION_TEMPLATE_FIELDS} }
            inviterTemplate { ${FISSION_TEMPLATE_FIELDS} }
        }
    }`;
    const res: any = await client.request(query);
    return res?.couponFissionActivity || null;
}

export async function claimFissionReward(inviteCode: string) {
    const client = getGraphQLClient();
    const query = `mutation ClaimFissionReward($inviteCode: String!) {
        claimFissionReward(inviteCode: $inviteCode) {
            status
            inviteeCoupon { id code status expiredAt }
            inviterCoupon { id code status expiredAt }
        }
    }`;
    const res: any = await client.request(query, { inviteCode });
    return res?.claimFissionReward || { status: 'UNKNOWN', inviteeCoupon: null, inviterCoupon: null };
}

/**
 * 个人邀请码：后端规则为 `F<base36(customerId)>`（可逆码，与 nshop 同构）。
 * 前端直接用 activeCustomer.id 生成，无需额外接口。
 */
export function fissionInviteCodeOf(customerId: string | number): string {
    const id = Number(customerId);
    if (!Number.isFinite(id) || id <= 0) return '';
    return `F${id.toString(36).toUpperCase()}`;
}
