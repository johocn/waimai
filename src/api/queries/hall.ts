import gql from 'graphql-tag';
import { riderClient } from './rider';
import { fetchStoreList } from './waimai';

// schema 校准（hall-shop.resolver.ts / hall-grab.service.ts / rider-task.service.ts）：
// campusHallAll → [CampusHallOrder!]!（F5 聚合大厅：全渠道 open 单一次带回，含 channelId/channelName；
//   M1：列表不再下发 channelToken，token 由 fetchHall 按 channelId 从店铺列表回填）
//   后端范围=有履约配置+非默认渠道+未暂停，加急置顶+小费降序；匿名/非骑手被 assertApprovedRider 拒绝）
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

const CAMPUS_HALL_ALL = gql`
    query campusHallAll {
        campusHallAll {
            id code total shipping createdAt
            channelId channelName
            customFields { hallStatus hallEnteredAt tip fulfillmentRoute campusZone buildingId deliverySlotText routeGroupId }
        }
    }
`;

const GRAB = gql`
    mutation campusGrabOrder($orderId: ID!) { campusGrabOrder(orderId: $orderId) { id code } }
`;

// P3-3 批量接单：同渠道一次最多 10 单，逐单独立事务，返回逐单结果（失败不抛整体错误）
const GRAB_BATCH = gql`
    mutation campusGrabOrders($orderIds: [ID!]!) {
        campusGrabOrders(orderIds: $orderIds) { orderId ok message }
    }
`;

const MY_TASKS = gql`
    query campusMyTasks($status: String) {
        campusMyTasks(status: $status) {
            id code total shipping createdAt
            customFields { deliveryStatus fulfillmentRoute campusZone buildingId deliverySlotText tip riderEarning urged routeGroupId handoverCode }
        }
    }
`;

const CAMPUS_BUILDINGS = gql`
    query campusBuildings($zoneId: ID) { campusBuildings(zoneId: $zoneId) { id name zoneId } }
`;

/** 营业中店铺渠道（暂停店铺不参与大厅/任务）；大厅轮询频繁，短期缓存减少店铺列表请求 */
let channelsMemo: { at: number; list: any[] } | null = null;
const CHANNELS_MEMO_MS = 60_000;

async function activeChannels(): Promise<any[]> {
    if (channelsMemo && Date.now() - channelsMemo.at < CHANNELS_MEMO_MS) return channelsMemo.list;
    // 失败必须向上抛：这里若吞成空数组，调用方会把“渠道加载失败”误当成“没有店铺/没有单”
    const list = (await fetchStoreList()).filter((s: any) => !s.paused);
    channelsMemo = { at: Date.now(), list };
    return list;
}

/** 大厅：campusHallAll 一次带回全渠道 open 单（token 按 channelId 回填，列表不再下发）；
 *  请求失败直接抛错，由页面区分“成功但为空”与“加载失败” */
export async function fetchHall(): Promise<ChannelOrder[]> {
    const [rows, stores] = await Promise.all([
        riderClient().request(CAMPUS_HALL_ALL)
            .then((r: any) => (r.campusHallAll ?? []) as ChannelOrder[]),
        activeChannels(),
    ]);
    const tokenOf = new Map(stores.map((s: any) => [String(s.channelId ?? ''), String(s.channelToken ?? '')]));
    return rows.map(o => ({ ...o, channelToken: tokenOf.get(String(o.channelId ?? '')) ?? '' }));
}

export async function grabOrder(orderId: string, channelToken?: string) {
    return riderClient(channelToken).request(GRAB, { orderId }).then((r: any) => r.campusGrabOrder);
}

/** 批量接单（P3-3）：同渠道订单一次提交（≤10），返回 `[{orderId, ok, message}]` */
export async function grabOrders(orderIds: string[], channelToken?: string) {
    return riderClient(channelToken).request(GRAB_BATCH, { orderIds })
        .then((r: any) => (r.campusGrabOrders ?? []) as Array<{ orderId: string; ok: boolean; message?: string }>);
}

/** 我的任务：逐店铺渠道并行聚合；全部渠道都失败时抛错（页面显示“加载失败 + 重试”），
 *  部分渠道失败但拿到了数据则保留可用结果，避免整页不可用 */
export async function fetchMyTasks(status?: string): Promise<ChannelOrder[]> {
    const stores = await activeChannels();
    const settled = await Promise.allSettled(stores.map((s: any) =>
        riderClient(s.channelToken).request(MY_TASKS, { status })
            .then((r: any) => (r.campusMyTasks ?? []).map((o: any) => ({ ...o, channelToken: s.channelToken, channelName: s.name })))));
    const list: ChannelOrder[] = [];
    let firstError: unknown = null;
    for (const r of settled) {
        if (r.status === 'fulfilled') list.push(...r.value);
        else firstError = firstError ?? r.reason;
    }
    if (!list.length && firstError) throw firstError;
    return list;
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
