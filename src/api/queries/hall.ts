import gql from 'graphql-tag';
import { riderClient } from './rider';
import { fetchStoreList } from './waimai';

// schema 校准（hall-shop.resolver.ts / hall-grab.service.ts / rider-task.service.ts）：
// campusHall → [Order!]!（当前渠道 hallStatus='open'，加急置顶+小费降序）
// campusGrabOrder(orderId) → Order!：成功返回订单；失败抛 GraphQL 错误
//   （'手慢了，该订单已被抢' / '不能抢自己的订单' / 信用分不足 Forbidden）
// campusMyTasks(status) → [Order!]！deliveryStatus 域：assigned/in_progress/delivered/exception
// Order.customFields 可读字段：hallStatus hallEnteredAt tip fulfillmentRoute campusZone
//   buildingId（存 ID，展示需映射楼栋名） deliverySlotText
//
// 渠道隔离（e2e 冒烟实证）：campusHall/campusMyTasks/campusBuildings 全部按 ctx.channelId
// 过滤，骑手前端必须逐店铺渠道聚合，否则只能看到默认渠道的单。聚合结果附加
// channelToken/channelName，后续 mutation（抢单/开始/送达/转单）须带同渠道 token 回传。
export interface ChannelOrder {
    channelToken?: string;
    channelName?: string;
    [key: string]: any;
}

const CAMPUS_HALL = gql`
    query campusHall {
        campusHall {
            id code total shipping createdAt
            customFields { hallStatus hallEnteredAt tip fulfillmentRoute campusZone buildingId deliverySlotText }
        }
    }
`;

const GRAB = gql`
    mutation campusGrabOrder($orderId: ID!) { campusGrabOrder(orderId: $orderId) { id code } }
`;

const MY_TASKS = gql`
    query campusMyTasks($status: String) {
        campusMyTasks(status: $status) {
            id code total shipping createdAt
            customFields { deliveryStatus fulfillmentRoute campusZone buildingId deliverySlotText tip }
        }
    }
`;

const CAMPUS_BUILDINGS = gql`
    query campusBuildings($zoneId: ID) { campusBuildings(zoneId: $zoneId) { id name zoneId } }
`;

/** 营业中店铺渠道（暂停店铺不参与大厅/任务） */
async function activeChannels(): Promise<any[]> {
    return (await fetchStoreList().catch(() => [] as any[])).filter((s: any) => !s.paused);
}

/** 大厅：逐店铺渠道并行聚合（单渠道失败静默降级为空，不拖垮整厅） */
export async function fetchHall(): Promise<ChannelOrder[]> {
    const stores = await activeChannels();
    const res = await Promise.all(stores.map((s: any) =>
        riderClient(s.channelToken).request(CAMPUS_HALL)
            .then((r: any) => (r.campusHall ?? []).map((o: any) => ({ ...o, channelToken: s.channelToken, channelName: s.name })))
            .catch(() => [] as ChannelOrder[])));
    return res.flat();
}

export async function grabOrder(orderId: string, channelToken?: string) {
    return riderClient(channelToken).request(GRAB, { orderId }).then((r: any) => r.campusGrabOrder);
}

/** 我的任务：逐店铺渠道并行聚合 */
export async function fetchMyTasks(status?: string): Promise<ChannelOrder[]> {
    const stores = await activeChannels();
    const res = await Promise.all(stores.map((s: any) =>
        riderClient(s.channelToken).request(MY_TASKS, { status })
            .then((r: any) => (r.campusMyTasks ?? []).map((o: any) => ({ ...o, channelToken: s.channelToken, channelName: s.name })))
            .catch(() => [] as ChannelOrder[])));
    return res.flat();
}

/** 楼栋 ID→名称映射：跨渠道聚合（楼栋 ID 全局唯一，各渠道楼栋合并一张表） */
export async function fetchBuildingMap(): Promise<Record<string, string>> {
    const stores = await activeChannels();
    const res = await Promise.all(stores.map((s: any) =>
        riderClient(s.channelToken).request(CAMPUS_BUILDINGS, {})
            .catch(() => ({ campusBuildings: [] }))));
    const map: Record<string, string> = {};
    for (const r of res) {
        for (const b of r.campusBuildings ?? []) map[String(b.id)] = b.name;
    }
    return map;
}
