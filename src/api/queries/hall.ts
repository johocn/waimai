import gql from 'graphql-tag';
import { riderClient } from './rider';

// schema 校准（hall-shop.resolver.ts / hall-grab.service.ts / rider-task.service.ts）：
// campusHall → [Order!]!（当前渠道 hallStatus='open'，加急置顶+小费降序）
// campusGrabOrder(orderId) → Order!：成功返回订单；失败抛 GraphQL 错误
//   （'手慢了，该订单已被抢' / '不能抢自己的订单' / 信用分不足 Forbidden）
// campusMyTasks(status) → [Order!]！deliveryStatus 域：assigned/in_progress/delivered/exception
// Order.customFields 可读字段：hallStatus hallEnteredAt tip fulfillmentRoute campusZone
//   buildingId（存 ID，展示需映射楼栋名） deliverySlotText
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

export async function fetchHall() {
    return riderClient().request(CAMPUS_HALL).then((r: any) => r.campusHall ?? []);
}

export async function grabOrder(orderId: string) {
    return riderClient().request(GRAB, { orderId }).then((r: any) => r.campusGrabOrder);
}

export async function fetchMyTasks(status?: string) {
    return riderClient().request(MY_TASKS, { status }).then((r: any) => r.campusMyTasks ?? []);
}

/** 楼栋 ID→名称映射（大厅/任务卡展示地址用） */
export async function fetchBuildingMap(): Promise<Record<string, string>> {
    return riderClient().request(CAMPUS_BUILDINGS, {}).then((r: any) => {
        const map: Record<string, string> = {};
        for (const b of r.campusBuildings ?? []) map[String(b.id)] = b.name;
        return map;
    });
}
