import { GraphQLClient } from 'graphql-request';
import { getShopApiUrl, getSessionToken } from '../client';
import { useAuthStore } from '../../stores/auth';

/**
 * 店铺直播（live-streaming-plugin）。
 * 直播间、商品与 activeOrder 均按渠道隔离，因此跨店列表用固定 vendure-token 的独立客户端。
 */

function channelClient(channelToken: string): GraphQLClient {
    const authStore = useAuthStore();
    const headers: Record<string, string> = { 'vendure-token': channelToken };
    const bearer = authStore.token || getSessionToken();
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    return new GraphQLClient(getShopApiUrl(), { headers });
}

const ROOM_FIELDS = `
    id name coverUrl description streamerCustomerId streamerName
    type status scheduledStartAt startedAt endedAt
    playUrl replayUrl likeCount viewCount pushUrl
    platforms { id platform externalUrl }
    createdAt updatedAt
`;

const PRODUCT_FIELDS = `
    id variantId name price imageUrl sortOrder
`;

/** status: live=直播中 / upcoming=预告 / replay=回放（省略则全部） */
export async function getLiveRoomsInChannel(channelToken: string, status?: 'live' | 'upcoming' | 'replay') {
    const client = channelClient(channelToken);
    const query = `query LiveRooms($status: String) { liveRooms(status: $status) { ${ROOM_FIELDS} } }`;
    const res: any = await client.request(query, { status: status ?? null });
    return res?.liveRooms || [];
}

export async function getLiveRoomInChannel(channelToken: string, id: string) {
    const client = channelClient(channelToken);
    const query = `query LiveRoom($id: ID!) { liveRoom(id: $id) { ${ROOM_FIELDS} } }`;
    const res: any = await client.request(query, { id });
    return res?.liveRoom || null;
}

export async function getLiveRoomProductsInChannel(channelToken: string, id: string) {
    const client = channelClient(channelToken);
    const query = `query LiveRoomProducts($id: ID!) { liveRoomProducts(id: $id) { ${PRODUCT_FIELDS} } }`;
    const res: any = await client.request(query, { id });
    return res?.liveRoomProducts || [];
}

/** 进房：返回播放地址 + ws 票据（后端按房间状态只给 live 房间 playUrl/pushUrl） */
export async function enterLiveRoomInChannel(channelToken: string, roomId: string) {
    const client = channelClient(channelToken);
    const mutation = `mutation EnterLiveRoom($roomId: ID!) {
        enterLiveRoom(roomId: $roomId) { roomId playUrl pushUrl wsUrl wsTicket }
    }`;
    const res: any = await client.request(mutation, { roomId });
    return res?.enterLiveRoom;
}

/** 当前渠道 activeOrder 标记来源直播间（直播佣金归因） */
export async function setOrderLiveRoomInChannel(channelToken: string, roomId: string) {
    const client = channelClient(channelToken);
    const mutation = `mutation SetOrderLiveRoom($roomId: ID!) { setOrderLiveRoom(roomId: $roomId) { id code } }`;
    const res: any = await client.request(mutation, { roomId });
    return res?.setOrderLiveRoom;
}
