import { getGraphQLClient } from '../client';

/**
 * 购物圈（后端 shopping-circle-plugin shop-api）。
 * circleFeed 公开可读；myCirclePosts / createCirclePost / 点赞收藏需登录。
 * images 为资产 URL 数组（后端以 JSON 字符串存储，GraphQL 侧已解析为 [String!]!）。
 */

const POST_FIELDS = `
    id createdAt nickname title content images videoUrl productId
    likeCount favoriteCount viewerLiked viewerFavorited isPinned
`;

export interface CirclePost {
    id: string;
    createdAt: string;
    nickname: string;
    title?: string | null;
    content: string;
    images: string[];
    videoUrl?: string | null;
    productId?: string | null;
    likeCount: number;
    favoriteCount: number;
    viewerLiked: boolean;
    viewerFavorited: boolean;
    isPinned: boolean;
}

type ListOptions = { skip?: number; take?: number };

export async function getCircleFeed(options?: ListOptions) {
    const client = getGraphQLClient();
    const query = `query CircleFeed($options: CirclePostListOptions) {
        circleFeed(options: $options) {
            totalItems
            items { ${POST_FIELDS} }
        }
    }`;
    const res: any = await client.request(query, { options: { take: 20, ...(options || {}) } });
    return (res?.circleFeed || { items: [], totalItems: 0 }) as { items: CirclePost[]; totalItems: number };
}

export async function getMyCirclePosts(options?: ListOptions) {
    const client = getGraphQLClient();
    const query = `query MyCirclePosts($options: CirclePostListOptions) {
        myCirclePosts(options: $options) {
            totalItems
            items { ${POST_FIELDS} }
        }
    }`;
    const res: any = await client.request(query, { options: { take: 20, ...(options || {}) } });
    return (res?.myCirclePosts || { items: [], totalItems: 0 }) as { items: CirclePost[]; totalItems: number };
}

export async function createCirclePost(input: {
    title?: string;
    content: string;
    images?: string[];
    videoUrl?: string;
    productId?: string;
}) {
    const client = getGraphQLClient();
    const query = `mutation CreateCirclePost($input: CreateCirclePostInput!) {
        createCirclePost(input: $input) { ${POST_FIELDS} }
    }`;
    const res: any = await client.request(query, { input });
    return res?.createCirclePost as CirclePost;
}

export async function toggleCircleLike(postId: string) {
    const client = getGraphQLClient();
    const query = `mutation ToggleCircleLike($postId: ID!) {
        toggleCircleLike(postId: $postId) { liked favorited likeCount favoriteCount }
    }`;
    const res: any = await client.request(query, { postId });
    return res?.toggleCircleLike as { liked: boolean; favorited: boolean; likeCount: number; favoriteCount: number };
}

export async function toggleCircleFavorite(postId: string) {
    const client = getGraphQLClient();
    const query = `mutation ToggleCircleFavorite($postId: ID!) {
        toggleCircleFavorite(postId: $postId) { liked favorited likeCount favoriteCount }
    }`;
    const res: any = await client.request(query, { postId });
    return res?.toggleCircleFavorite as { liked: boolean; favorited: boolean; likeCount: number; favoriteCount: number };
}
