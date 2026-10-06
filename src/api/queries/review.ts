import { getGraphQLClient } from '../client';

/** 评价条目公共字段（productReviews / myReviews / createReview 三个操作共用） */
const REVIEW_FIELDS = `
    id customerId customerName productId variantId orderLineId parentId
    rating content images tags isAnonymous status reply repliedAt helpfulCount
    createdAt
`;

/** 商品评价列表：public；ratingMin/ratingMax 为服务端分档筛选（见 vendure review-plugin S6） */
export async function getProductReviews(productId: string, options?: {
    take?: number;
    skip?: number;
    ratingMin?: number;
    ratingMax?: number;
}) {
    const client = getGraphQLClient();
    const query = `
        query GetProductReviews($productId: ID!, $options: ReviewListOptions) {
            productReviews(productId: $productId, options: $options) {
                totalItems
                items { ${REVIEW_FIELDS} }
            }
        }
    `;
    return client.request(query, { productId, options: { take: 10, ...(options || {}) } });
}

/** 商品评分聚合：totalCount / goodRate(0-100) / averageRating(1 位小数) / ratingDistribution(1-5 恒 5 条) / topTags */
export async function getReviewStats(productId: string) {
    const client = getGraphQLClient();
    const query = `
        query GetReviewStats($productId: ID!) {
            reviewStats(productId: $productId) {
                totalCount goodRate averageRating
                ratingDistribution { rating count }
                topTags { tag count }
            }
        }
    `;
    return client.request(query, { productId });
}

/** 我的评价：authenticated；后端为全量返回（无分页、无 status 过滤），调用方自行剔除 deleted */
export async function getMyReviews() {
    const client = getGraphQLClient();
    const query = `
        query GetMyReviews {
            myReviews { ${REVIEW_FIELDS} }
        }
    `;
    return client.request(query);
}

/** 发表评价：authenticated；orderLineId 必传，同一 orderLine 同一客户只能评一次 */
export async function createReview(input: {
    productId: string;
    orderLineId?: string;
    variantId?: string;
    rating: number;
    content: string;
    images?: string[];
    tags?: string[];
    isAnonymous?: boolean;
}) {
    const client = getGraphQLClient();
    const query = `
        mutation CreateReview($input: CreateReviewInput!) {
            createReview(input: $input) { ${REVIEW_FIELDS} }
        }
    `;
    return client.request(query, { input });
}

/** 删除本人评价（软删）：authenticated */
export async function deleteReview(id: string) {
    const client = getGraphQLClient();
    return client.request(
        `mutation DeleteReview($id: ID!) { deleteReview(id: $id) }`,
        { id },
    );
}

/** 店铺级评论流：当前渠道全部 approved 主评（menu 评论 tab）；ratingMin/ratingMax/hasImages 分档筛选 */
export async function getChannelReviews(options?: {
    take?: number;
    skip?: number;
    ratingMin?: number;
    ratingMax?: number;
    hasImages?: boolean;
}) {
    const client = getGraphQLClient();
    const query = `
        query GetChannelReviews($options: ReviewListOptions) {
            channelReviews(options: $options) {
                totalItems
                items { ${REVIEW_FIELDS} }
            }
        }
    `;
    return client.request(query, { options: { take: 10, ...(options || {}) } });
}

/** 店铺级统计：当前渠道全店 approved 主评（摘要卡：均分/好评率/分布/标签） */
export async function getChannelReviewStats() {
    const client = getGraphQLClient();
    const query = `
        query GetChannelReviewStats {
            channelReviewStats {
                totalCount goodRate averageRating
                ratingDistribution { rating count }
                topTags { tag count }
            }
        }
    `;
    return client.request(query);
}
