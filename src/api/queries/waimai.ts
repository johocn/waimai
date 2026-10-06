import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

/** 字段以 campus-delivery-plugin shop-api schema 为准（lib/src/campus-delivery.plugin.js） */
export const WAIMAI_STORE_LIST = gql`
    query waimaiStoreList {
        waimaiStoreList {
            channelId channelToken name logo tags monthlySales promoText paused routesEnabled
            deliveryMinutes minOrderAmount deliveryFee storeAddress storePhone storeNotice errandBaseFee
        }
    }
`;

export async function fetchStoreList(): Promise<any[]> {
    const res = await getGraphQLClient().request(WAIMAI_STORE_LIST);
    return res?.waimaiStoreList ?? [];
}

/** 店铺菜单商品列表（当前渠道全部在售商品，take 100 覆盖单店菜单规模） */
export async function fetchProductList(): Promise<any[]> {
    const client = getGraphQLClient();
    const query = `
        query MenuProducts {
            products(options: { take: 100, sort: { name: ASC } }) {
                items {
                    id name slug description
                    featuredAsset { preview }
                    variants { id name priceWithTax stockLevel options { id name code } }
                    collections { id name slug parent { name } }
                    customFields { reviewRating reviewCount }
                }
            }
        }
    `;
    const res: any = await client.request(query);
    return res?.products?.items ?? [];
}
