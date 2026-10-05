import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

/** 字段以 campus-delivery-plugin shop-api schema 为准（lib/src/campus-delivery.plugin.js） */
export const WAIMAI_STORE_LIST = gql`
    query waimaiStoreList {
        waimaiStoreList {
            channelId channelToken name logo tags monthlySales promoText paused routesEnabled
        }
    }
`;

export async function fetchStoreList(): Promise<any[]> {
    const res = await getGraphQLClient().request(WAIMAI_STORE_LIST);
    return res?.waimaiStoreList ?? [];
}
