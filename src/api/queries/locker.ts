import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

/** 智能取餐柜站点（P2-4）：仅返回本渠道启用站点，未登录亦可读 */
export const LOCKER_STATIONS_QUERY = gql`
    query CampusLockerStations {
        campusLockerStations {
            id name location provider providerName totalCells availableCells openHours pickupGuide
        }
    }
`;

/** 无人配送通道状态（P2-4 接口占位）：enabled=false 时入口只做说明 */
export const UNMANNED_CHANNEL_QUERY = gql`
    query CampusUnmannedDeliveryChannel {
        campusUnmannedDeliveryChannel { enabled provider providerName }
    }
`;

export interface LockerStation {
    id: string;
    name: string;
    location: string;
    provider: string;
    providerName: string;
    totalCells: number;
    availableCells: number;
    openHours: string | null;
    pickupGuide: string | null;
}

export interface UnmannedChannel {
    enabled: boolean;
    provider: string;
    providerName: string;
}

export interface LockerInfo {
    stations: LockerStation[];
    unmanned: UnmannedChannel | null;
}

/** 取餐柜 + 无人配送通道；失败静默返回空，不阻塞店铺页主体 */
export async function fetchLockerInfo(): Promise<LockerInfo> {
    const client = getGraphQLClient();
    const [stations, channel] = await Promise.all([
        client.request(LOCKER_STATIONS_QUERY).catch(() => null) as any,
        client.request(UNMANNED_CHANNEL_QUERY).catch(() => null) as any,
    ]);
    return {
        stations: (stations?.campusLockerStations ?? []) as LockerStation[],
        unmanned: (channel?.campusUnmannedDeliveryChannel ?? null) as UnmannedChannel | null,
    };
}
