import gql from 'graphql-tag';
import { riderClient } from './rider';

// schema 校准（hall-shop.resolver.ts myRiderEarnings / rider-earning.entity.ts）：
// 返回 [RiderEarning!]!：{ id orderId riderCustomerId amount tip status channelId createdAt updatedAt }
// status 域：'credited'（随送达实时入账）
const MY_EARNINGS = gql`
    query myRiderEarnings($skip: Int, $take: Int) {
        myRiderEarnings(skip: $skip, take: $take) { id orderId amount tip status createdAt }
    }
`;

export async function fetchMyEarnings(skip = 0, take = 50) {
    return riderClient().request(MY_EARNINGS, { skip, take }).then((r: any) => r.myRiderEarnings ?? []);
}
