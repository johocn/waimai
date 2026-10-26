import gql from 'graphql-tag';
import { GraphQLClient } from 'graphql-request';
import { getGraphQLClient, getShopApiUrl, getSessionToken } from '../client';
import { useAuthStore } from '../../stores/auth';

/** 字段以 campus-delivery-plugin shop-api schema 为准（lib/src/campus-delivery.plugin.js） */
export const WAIMAI_STORE_LIST = gql`
    query waimaiStoreList {
        waimaiStoreList {
            channelId channelToken name logo tags monthlySales promoText paused openNow routesEnabled businessHours
            deliveryMinutes minOrderAmount deliveryFee storeAddress storePhone storeNotice errandBaseFee freeShippingThreshold
            foodLicenseNo foodLicenseImage foodLicenseExpiry foodSafetyGrade foodSafetyCommitmentImage kitchenLiveUrl kitchenLiveEnabled
        }
    }
`;

/** 店铺菜单商品列表（当前渠道全部在售商品，take 100 覆盖单店菜单规模） */
const PRODUCT_LIST_QUERY = `
    query MenuProducts {
        products(options: { take: 100, sort: { name: ASC } }) {
            items {
                id name slug description createdAt
                featuredAsset { preview }
                variants { id name priceWithTax stockLevel enabled options { id name code } }
                optionGroups { id name code options { id name code } }
                collections { id name slug parent { name } }
                customFields { reviewRating reviewCount waimaiMonthlySales waimaiSoldOut }
            }
        }
    }
`;

export async function fetchStoreList(): Promise<any[]> {
    const res = await getGraphQLClient().request(WAIMAI_STORE_LIST);
    return res?.waimaiStoreList ?? [];
}

export async function fetchProductList(): Promise<any[]> {
    const res: any = await getGraphQLClient().request(PRODUCT_LIST_QUERY);
    return res?.products?.items ?? [];
}

/**
 * 指定渠道商品（再来一单校验可售用）。
 * 独立 GraphQLClient：避免 ShopClient 用当前 tenant token 覆盖 vendure-token 头。
 */
export async function fetchProductListForChannel(channelToken: string): Promise<any[]> {
    const authStore = useAuthStore();
    const headers: Record<string, string> = { 'vendure-token': channelToken };
    const bearer = authStore.token || getSessionToken();
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    const client = new GraphQLClient(getShopApiUrl(), { headers });
    const res: any = await client.request(PRODUCT_LIST_QUERY);
    return res?.products?.items ?? [];
}
