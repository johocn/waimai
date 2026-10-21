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

export async function fetchFavoriteStores(): Promise<string[]> {
    const res: any = await getGraphQLClient().request(CAMPUS_FAVORITE_STORES);
    return (res?.campusFavoriteStores ?? []).map(String);
}

/** toggle 语义：已收藏则取消，未收藏则收藏；返回最新完整列表 */
export async function toggleFavoriteStore(channelId: string): Promise<string[]> {
    const res: any = await getGraphQLClient().request(CAMPUS_TOGGLE_FAVORITE_STORE, { channelId });
    return (res?.campusToggleFavoriteStore ?? []).map(String);
}
