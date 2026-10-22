import { getGraphQLClient } from '../client';

// CouponTemplate 字段（对齐 vshop/src/api/queries/coupon.ts）。
// type: FIXED | PERCENT | FULL | FREE_SHIPPING；discountValue：FIXED/FULL 为分，PERCENT 为折数（85=8.5折）
const COUPON_TEMPLATE_FIELDS = `
    id name description type discountValue minSpend
    startsAt endsAt totalCount claimedCount perUserLimit
    scope categoryId variantId enabled usageScene
    claimable claimCode validDays newCustomerOnly pointsPrice
`;

/** 领券中心：当前可领取的券模板（仅已开始的；即将开始走 couponCentreUpcoming） */
export async function getCouponCentre() {
    const client = getGraphQLClient();
    const query = `query CouponCentre { couponCentre { ${COUPON_TEMPLATE_FIELDS} } }`;
    return client.request(query);
}

/** 领券中心「即将开始」：startsAt 在未来的券模板 */
export async function getCouponCentreUpcoming() {
    const client = getGraphQLClient();
    const query = `query CouponCentreUpcoming { couponCentreUpcoming { ${COUPON_TEMPLATE_FIELDS} } }`;
    return client.request(query);
}

/** 我的券包，status: UNUSED | USED | RETURNED | EXPIRED | INVALID */
export async function getMyCoupons(status?: string) {
    const client = getGraphQLClient();
    const query = `query MyCoupons($status: CouponStatus) {
        myCoupons(status: $status) {
            id code status issuedAt usedAt expiredAt
            template { ${COUPON_TEMPLATE_FIELDS} }
        }
    }`;
    return client.request(query, { status: status ?? null });
}

/** 商品专属券绑定列表（含模板详情） */
export async function getProductCoupons(productId: string) {
    const client = getGraphQLClient();
    const query = `query ProductCoupons($productId: ID!) {
        productCoupons(productId: $productId) {
            id productId couponTemplateId enabled
            template { ${COUPON_TEMPLATE_FIELDS} }
        }
    }`;
    return client.request(query, { productId });
}

/** 积分兑券目录：渠道内可兑券模板（按 pointsPrice 升序，后端已做场景/等级过滤） */
export async function getPointsMallTemplates() {
    const client = getGraphQLClient();
    const query = `query PointsMallTemplates { pointsMallTemplates { ${COUPON_TEMPLATE_FIELDS} } }`;
    const res: any = await client.request(query);
    return res?.pointsMallTemplates || [];
}

/** 积分兑换优惠券：返回券 + 实际扣减积分 */
export async function exchangeCouponWithPoints(templateId: string) {
    const client = getGraphQLClient();
    const query = `mutation ExchangeCouponWithPoints($templateId: ID!) {
        exchangeCouponWithPoints(templateId: $templateId) {
            spentPoints
            coupon { id code status expiredAt }
        }
    }`;
    const res: any = await client.request(query, { templateId });
    return res?.exchangeCouponWithPoints;
}

/** 每日领券专场（未配置返回 null） */
export async function getCouponDailyClaimActivity() {
    const client = getGraphQLClient();
    const query = `query CouponDailyClaimActivity {
        couponDailyClaimActivity {
            name subtitle rules startsAt endsAt
            items {
                claimedToday soldOut
                template { ${COUPON_TEMPLATE_FIELDS} }
            }
        }
    }`;
    const res: any = await client.request(query);
    return res?.couponDailyClaimActivity || null;
}

/** 每日领券：同一模板每天限领 1 张，status 复用领取结果枚举 */
export async function claimDailyCoupon(templateId: string) {
    const client = getGraphQLClient();
    const query = `mutation ClaimDailyCoupon($templateId: ID!) {
        claimDailyCoupon(templateId: $templateId) {
            status
            coupon { id code status expiredAt }
        }
    }`;
    const res: any = await client.request(query, { templateId });
    return res?.claimDailyCoupon || { status: 'UNKNOWN', coupon: null };
}
