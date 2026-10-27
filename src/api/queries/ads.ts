import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

/** 在投广告（P2-3）：服务端只返回当前渠道、审核通过且在投放日期窗口内的广告（≤3 条） */
export const ACTIVE_ADS_QUERY = gql`
    query CampusActiveAds($slot: String!) {
        campusActiveAds(slot: $slot) {
            id slot title imageUrl linkUrl endDate
        }
    }
`;

export interface ShopAd {
    id: string;
    slot: string;
    title: string;
    imageUrl: string | null;
    linkUrl: string | null;
    endDate: string;
}

/** 取某广告位在投广告；失败静默返回空，不阻塞页面主体 */
export async function fetchActiveAds(slot: 'homeBanner' | 'shopTop'): Promise<ShopAd[]> {
    const res: any = await getGraphQLClient().request(ACTIVE_ADS_QUERY, { slot });
    return (res?.campusActiveAds ?? []) as ShopAd[];
}
