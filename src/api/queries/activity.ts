import { GraphQLClient } from 'graphql-request';
import { getGraphQLClient, getShopApiUrl, getSessionToken } from '../client';
import { useAuthStore } from '../../stores/auth';

/**
 * 营销活动（秒杀 / 拼团 / 券秒杀 / 抽奖）C 端接口。
 *
 * 秒杀与拼团按「店铺渠道」隔离：活动、商品、activeOrder 都挂在店铺渠道下，
 * 因此列表与操作都必须用固定 vendure-token 的独立客户端（与跨店购物车同一思路），
 * 不能用全局 ShopClient —— 它会用当前 tenant token 覆盖请求头。
 */

function channelClient(channelToken: string): GraphQLClient {
    const authStore = useAuthStore();
    const headers: Record<string, string> = { 'vendure-token': channelToken };
    const bearer = authStore.token || getSessionToken();
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    return new GraphQLClient(getShopApiUrl(), { headers });
}

const FLASH_FIELDS = `
    id name startAt endAt flashPrice totalStock soldCount limitPerUser
    productId variantId status
`;

/** 某店铺渠道进行中的秒杀活动 */
export async function getActiveFlashSalesInChannel(channelToken: string) {
    const client = channelClient(channelToken);
    const query = `query ActiveFlashSales { activeFlashSaleActivities { ${FLASH_FIELDS} } }`;
    const res: any = await client.request(query);
    return res?.activeFlashSaleActivities || [];
}

/** 按 id 批量补拉商品（活动类型只暴露 productId） */
export async function getProductsByIdsInChannel(channelToken: string, ids: string[]) {
    const list = (ids || []).filter(Boolean);
    if (!list.length) return [];
    const client = channelClient(channelToken);
    const query = `
        query ProductsByIds($ids: [String!]!) {
            products(options: { filter: { id: { in: $ids } }, take: 50 }) {
                items { id name featuredAsset { preview } variants { id priceWithTax } }
            }
        }
    `;
    const res: any = await client.request(query, { ids: list });
    return res?.products?.items || [];
}

/** 秒杀下单：先加购该变体，再对购物车应用秒杀价（后端校验活动/限购/库存） */
export async function applyFlashSaleInChannel(channelToken: string, activityId: string) {
    const client = channelClient(channelToken);
    const mutation = `mutation ApplyFlashSale($activityId: ID!) {
        applyFlashSale(activityId: $activityId) { id code totalWithTax }
    }`;
    const res: any = await client.request(mutation, { activityId });
    return res?.applyFlashSale;
}

const GROUP_FIELDS = `
    id name description targetCount currentCount maxCount status
    startAt endAt groupPrice leaderDiscount leaderRewardType productId variantId
`;

/** 某店铺渠道进行中的拼团活动 */
export async function getActiveGroupBuysInChannel(channelToken: string) {
    const client = channelClient(channelToken);
    const query = `query ActiveGroupBuys { activeGroupBuyActivities { ${GROUP_FIELDS} } }`;
    const res: any = await client.request(query);
    return res?.activeGroupBuyActivities || [];
}

/** 我的拼团（团长 + 参团合并；接口要求 isLeader 必填，故查两次） */
export async function getMyGroupBuysInChannel(channelToken: string) {
    const client = channelClient(channelToken);
    const query = `query MyGroupBuys($isLeader: Boolean!) {
        myGroupBuyOrders(isLeader: $isLeader) {
            id orderId orderCode groupBuyActivityId isLeader status
            activity { ${GROUP_FIELDS} }
        }
    }`;
    const [asLeader, asMember]: any[] = await Promise.all([
        client.request(query, { isLeader: true }).catch(() => ({})),
        client.request(query, { isLeader: false }).catch(() => ({})),
    ]);
    const merged = [
        ...(asLeader?.myGroupBuyOrders || []),
        ...(asMember?.myGroupBuyOrders || []),
    ];
    const seen = new Set<string>();
    return merged.filter((o: any) => {
        const key = String(o.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** 参团/开团：orderId 为已含拼团变体的购物车订单 */
export async function joinGroupBuyInChannel(
    channelToken: string,
    activityId: string,
    orderId: string,
    isLeader: boolean,
) {
    const client = channelClient(channelToken);
    const mutation = `mutation JoinGroupBuy($activityId: ID!, $orderId: ID!, $isLeader: Boolean!) {
        joinGroupBuy(activityId: $activityId, orderId: $orderId, isLeader: $isLeader) {
            id groupBuyActivityId isLeader status
        }
    }`;
    const res: any = await client.request(mutation, { activityId, orderId, isLeader });
    return res?.joinGroupBuy;
}

const COUPON_TEMPLATE_FIELDS = `
    id name description type discountValue minSpend totalCount claimedCount
    perUserLimit validDays scope usageScene
`;

/** 券秒杀场次（站点默认渠道，与领券中心一致） */
export async function getCouponFlashSale() {
    const client = getGraphQLClient();
    const query = `query CouponFlashSale {
        couponFlashSaleActivity {
            name subtitle rules startsAt endsAt perUserLimit
            items { soldOut myClaimed template { ${COUPON_TEMPLATE_FIELDS} } }
        }
    }`;
    const res: any = await client.request(query);
    return res?.couponFlashSaleActivity || null;
}

/** 抢券：返回 status + 领取到的券 */
export async function claimFlashCoupon(templateId: string) {
    const client = getGraphQLClient();
    const query = `mutation ClaimFlashCoupon($templateId: ID!) {
        claimFlashCoupon(templateId: $templateId) {
            status
            coupon { id code status expiredAt }
        }
    }`;
    const res: any = await client.request(query, { templateId });
    return res?.claimFlashCoupon || { status: 'UNKNOWN', coupon: null };
}

/** 抽奖奖品 + 消耗配置（未登录也可看） */
export async function getLotteryOverview() {
    const client = getGraphQLClient();
    const query = `query LotteryOverview {
        myLotteryPrizes { id name image consume }
        lotteryCostConfig { mode fixedCost }
    }`;
    const res: any = await client.request(query);
    return {
        prizes: res?.myLotteryPrizes || [],
        cost: res?.lotteryCostConfig || { mode: 'perPrize', fixedCost: 0 },
    };
}

/** 我的中奖记录 */
export async function getMyLotteryRecords(options?: { take?: number; skip?: number }) {
    const client = getGraphQLClient();
    const query = `query MyLotteryRecords($options: LotteryRecordListOptions) {
        myLotteryRecords(options: $options) {
            totalItems
            items { id prizeId prizeName prizeImage consume createdAt }
        }
    }`;
    const res: any = await client.request(query, { options: { take: 10, ...(options || {}) } });
    return res?.myLotteryRecords || { items: [], totalItems: 0 };
}

/** 抽奖（消耗积分由后端按配置扣减） */
export async function drawLottery() {
    const client = getGraphQLClient();
    const query = `mutation DrawLottery {
        drawLottery { prizeIndex prize { id name image consume } }
    }`;
    const res: any = await client.request(query);
    return res?.drawLottery;
}
