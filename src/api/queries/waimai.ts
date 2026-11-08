import gql from 'graphql-tag';
import { GraphQLClient } from 'graphql-request';
import { getGraphQLClient, getShopApiUrl, getSessionToken } from '../client';
import { useAuthStore } from '../../stores/auth';

/** 字段以 campus-delivery-plugin shop-api schema 为准（lib/src/campus-delivery.plugin.js）
 * 列表不再下发 channelToken（服务端已移除该字段）；进店/跨店操作按 channelId 调 campusStoreEntry 换取。 */
export const WAIMAI_STORE_LIST = gql`
    query waimaiStoreList {
        waimaiStoreList {
            channelId name logo tags monthlySales promoText paused openNow routesEnabled r1Available businessHours
            closedToday closureNote
            deliveryMinutes minOrderAmount deliveryFee storeAddress storePhone storeNotice errandBaseFee freeShippingThreshold
            deliveryFeeTiers
            foodLicenseNo foodLicenseImage foodLicenseExpiry foodSafetyGrade foodSafetyCommitmentImage kitchenLiveUrl kitchenLiveEnabled
            packingFeeEnabled packingFeeMode packingFeeAmount packingFeeCap packingFeeLabel
        }
    }
`;

/** 单店进店换取渠道 token（服务端限流：每 IP 每分钟 120 次） */
const CAMPUS_STORE_ENTRY = gql`
    query CampusStoreEntry($channelId: ID!) {
        campusStoreEntry(channelId: $channelId) { channelId channelToken }
    }
`;

const STORE_TOKEN_KEY = 'waimai_store_tokens_v2';
const STORE_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
let storeTokenCache: Record<string, { token: string; at: number }> | null = null;
const storeTokenInFlight = new Map<string, Promise<string>>();

function loadStoreTokenCache(): Record<string, { token: string; at: number }> {
    if (storeTokenCache) return storeTokenCache;
    try {
        const raw = uni.getStorageSync(STORE_TOKEN_KEY);
        storeTokenCache = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    } catch {
        storeTokenCache = {};
    }
    return storeTokenCache!;
}

function saveStoreTokenCache() {
    try {
        uni.setStorageSync(STORE_TOKEN_KEY, JSON.stringify(storeTokenCache ?? {}));
    } catch {
        /* 存储失败不影响本次进店 */
    }
}

/** 按 channelId 换取并缓存单店 token；并发去重，失败返回空串（由调用方按无 token 处理） */
async function storeTokenOf(channelId: string): Promise<string> {
    if (!channelId) return '';
    const cache = loadStoreTokenCache();
    const hit = cache[channelId];
    if (hit?.token && Date.now() - hit.at < STORE_TOKEN_TTL_MS) return hit.token;
    const existing = storeTokenInFlight.get(channelId);
    if (existing) return existing;
    const task = getGraphQLClient()
        .request(CAMPUS_STORE_ENTRY, { channelId })
        .then((res: any) => {
            const token = res?.campusStoreEntry?.channelToken ? String(res.campusStoreEntry.channelToken) : '';
            if (token) {
                cache[channelId] = { token, at: Date.now() };
                saveStoreTokenCache();
            }
            return token;
        })
        .catch(() => '')
        .finally(() => storeTokenInFlight.delete(channelId));
    storeTokenInFlight.set(channelId, task);
    return task;
}

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
                customFields { reviewRating reviewCount waimaiMonthlySales waimaiSoldOut waimaiPackingFee waimaiAddonGroups waimaiCombo }
            }
        }
    }
`;

/**
 * 轻量兜底查询：服务端 HardenPlugin 复杂度上限收紧时（返回 “Query is too complex”），
 * 去掉 optionGroups / variant.options / collections 等列表嵌套后重试，保证菜单与随机抽取可用。
 */
const PRODUCT_LIST_LITE_QUERY = `
    query MenuProductsLite {
        products(options: { take: 100, sort: { name: ASC } }) {
            items {
                id name slug description createdAt
                featuredAsset { preview }
                variants { id name priceWithTax stockLevel enabled }
                customFields { reviewRating reviewCount waimaiMonthlySales waimaiSoldOut waimaiPackingFee waimaiAddonGroups waimaiCombo }
            }
        }
    }
`;

function isComplexityError(e: any): boolean {
    return /too complex/i.test(String(e?.message ?? e ?? ''));
}

async function requestProductItems(client: GraphQLClient): Promise<any[]> {
    try {
        const res: any = await client.request(PRODUCT_LIST_QUERY);
        return res?.products?.items ?? [];
    } catch (e) {
        if (!isComplexityError(e)) throw e;
        const res: any = await client.request(PRODUCT_LIST_LITE_QUERY);
        return res?.products?.items ?? [];
    }
}

export async function fetchStoreList(): Promise<any[]> {
    const res = await getGraphQLClient().request(WAIMAI_STORE_LIST);
    const stores: any[] = res?.waimaiStoreList ?? [];
    // 兼容既有页面：逐店换取 token 后回填 channelToken（并发去重 + 6h 本地缓存）
    await Promise.all(stores.map(async (s: any) => {
        const token = await storeTokenOf(String(s.channelId ?? ''));
        if (token) s.channelToken = token;
    }));
    return stores;
}

export async function fetchProductList(): Promise<any[]> {
    return requestProductItems(getGraphQLClient());
}

/** 菜品每日限量/每人限购（§68）：当前渠道有限量配置商品的当日额度（未登录 my* 为 null） */
const DAILY_STOCK_QUERY = `
    query CampusProductDailyStock {
        campusProductDailyStock { productId dailyLimit perUserLimit soldToday remaining myToday myRemaining }
    }
`;

export async function fetchDailyStock(): Promise<any[]> {
    const res: any = await getGraphQLClient().request(DAILY_STOCK_QUERY);
    return res?.campusProductDailyStock ?? [];
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
    return requestProductItems(client);
}
