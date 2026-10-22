import { getGraphQLClient } from '../client';

/**
 * 提货券 / 服务券（voucher-plugin，shop-api）。
 * 券由服务类订单支付成功后自动发放，C 端只能查自己的券；核销在商家后台扫码完成。
 */

export const VOUCHER_FIELDS = `
    id orderId customerId shopId code productVoucherName
    status effectiveDays expiresAt usedAt refundedAt
`;

export async function getMyVouchers() {
    const client = getGraphQLClient();
    const query = `query MyVouchers { myVouchers { ${VOUCHER_FIELDS} } }`;
    const res: any = await client.request(query);
    return res?.myVouchers || [];
}
