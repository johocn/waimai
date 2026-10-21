import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

/** 商家收藏（店铺 = 渠道）：返回值恒为收藏的 channelId 列表（有序，按收藏时间） */
export const CAMPUS_FAVORITE_STORES = gql`
    query CampusFavoriteStores {
        campusFavoriteStores
    }
`;

export const CAMPUS_TOGGLE_FAVORITE_STORE = gql`
    mutation CampusToggleFavoriteStore($channelId: ID!) {
        campusToggleFavoriteStore(channelId: $channelId)
    }
`;

export interface FavoriteVariant {
    variantId: string;
    channelId: string;
}

export const CAMPUS_FAVORITE_VARIANTS = gql`
    query CampusFavoriteVariants {
        campusFavoriteVariants { variantId channelId }
    }
`;

export const CAMPUS_TOGGLE_FAVORITE_VARIANT = gql`
    mutation CampusToggleFavoriteVariant($variantId: ID!, $channelId: ID!) {
        campusToggleFavoriteVariant(variantId: $variantId, channelId: $channelId) { variantId channelId }
    }
`;

export async function fetchFavoriteStores(): Promise<string[]> {
    const res: any = await getGraphQLClient().request(CAMPUS_FAVORITE_STORES);
    return (res?.campusFavoriteStores ?? []).map(String);
}

/** toggle 语义：已收藏则取消，未收藏则收藏；返回最新完整列表 */
export async function toggleFavoriteStore(channelId: string): Promise<string[]> {
    const res: any = await getGraphQLClient().request(CAMPUS_TOGGLE_FAVORITE_STORE, { channelId });
    return (res?.campusToggleFavoriteStore ?? []).map(String);
}

export async function fetchFavoriteVariants(): Promise<FavoriteVariant[]> {
    const res: any = await getGraphQLClient().request(CAMPUS_FAVORITE_VARIANTS);
    return (res?.campusFavoriteVariants ?? []).map((v: any) => ({
        variantId: String(v.variantId),
        channelId: String(v.channelId),
    }));
}

/** 商品收藏 toggle：已收藏则取消，未收藏则收藏；返回最新完整列表 */
export async function toggleFavoriteVariant(variantId: string, channelId: string): Promise<FavoriteVariant[]> {
    const res: any = await getGraphQLClient().request(CAMPUS_TOGGLE_FAVORITE_VARIANT, { variantId, channelId });
    return (res?.campusToggleFavoriteVariant ?? []).map((v: any) => ({
        variantId: String(v.variantId),
        channelId: String(v.channelId),
    }));
}
