import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

/**
 * 游客查单（免登录）：订单号 + 手机号。
 * 后端仅在「访客下单且手机号与订单 contactPhone 一致」时返回概览，
 * 否则统一抛 GUEST_ORDER_NOT_FOUND（不暴露订单是否存在）。
 */
export const GUEST_ORDER_LOOKUP = gql`
    query GuestOrderLookup($input: GuestOrderLookupInput!) {
        guestOrderLookup(input: $input) {
            orderCode
            orderPlacedAt
            state
            currencyCode
            totalQuantity
            subTotal
            shippingWithTax
            totalWithTax
            isPickup
            pickupClaimed
            paymentType
            collected
            pickupCode
            pickupClaimable
            pickupLocation {
                name
                address
                businessHours
            }
            lines {
                productName
                sku
                quantity
                linePriceWithTax
                hotelCheckIn
                hotelCheckOut
                hotelNights
            }
            hasPhone
        }
    }
`;

export async function lookupGuestOrder(orderCode: string, phone: string): Promise<any> {
    const res: any = await getGraphQLClient().request(GUEST_ORDER_LOOKUP, {
        input: { orderCode: orderCode.trim(), phone: phone.trim() },
    });
    return res?.guestOrderLookup ?? null;
}

/** 后端未找到/手机号不匹配的统一错误码，前端译为「未找到订单」 */
export const GUEST_ORDER_NOT_FOUND = 'GUEST_ORDER_NOT_FOUND';

export function isGuestOrderNotFound(err: any): boolean {
    const msg = String(err?.message ?? err ?? '');
    return msg.includes(GUEST_ORDER_NOT_FOUND);
}
