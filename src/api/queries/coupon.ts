import { getGraphQLClient } from '../client';

// CouponTemplate 字段（对齐 vshop/src/api/queries/coupon.ts）。
// type: FIXED | PERCENT | FULL | FREE_SHIPPING；discountValue：FIXED/FULL 为分，PERCENT 为折数（85=8.5折）
const COUPON_TEMPLATE_FIELDS = `
    id name description type discountValue minSpend
    startsAt endsAt totalCount claimedCount perUserLimit
    scope categoryId variantId enabled usageScene
    claimable claimCode validDays newCustomerOnly
`;

/** 领券中心：当前可领取的券模板（仅已开始的；即将开始走 couponCentreUpcoming，里程碑 2 接入） */
export async function getCouponCentre() {
    const client = getGraphQLClient();
    const query = `query CouponCentre { couponCentre { ${COUPON_TEMPLATE_FIELDS} } }`;
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
