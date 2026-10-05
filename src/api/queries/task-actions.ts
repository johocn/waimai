import gql from 'graphql-tag';
import { riderClient } from './rider';

// schema 校准（rider-task-shop.resolver.ts / rider-task.service.ts）：
// 四个 mutation 均返回 Order（状态推进后自定义字段已更新，gql 选 customFields { deliveryStatus }）
// campusStartTask(orderId)
// campusDeliverTask(orderId, photos: [String!]!, note?)   送达拍照必填（service 校验 photos.length）
// campusTransferTask(orderId, photos: [String!]!, note?)  未取货转单传 []；已取货必须 ≥1 张
// campusReportException(orderId, type, photos: [String!]!, note?)  参数名是 type（非 exceptionType）

const START = gql`
    mutation campusStartTask($orderId: ID!) {
        campusStartTask(orderId: $orderId) { id customFields { deliveryStatus } }
    }
`;
const DELIVER = gql`
    mutation campusDeliverTask($orderId: ID!, $photos: [String!]!, $note: String) {
        campusDeliverTask(orderId: $orderId, photos: $photos, note: $note) {
            id customFields { deliveryStatus riderEarning }
        }
    }
`;
const REPORT = gql`
    mutation campusReportException($orderId: ID!, $type: String!, $photos: [String!]!, $note: String) {
        campusReportException(orderId: $orderId, type: $type, photos: $photos, note: $note) {
            id customFields { deliveryStatus }
        }
    }
`;
const TRANSFER = gql`
    mutation campusTransferTask($orderId: ID!, $photos: [String!]!, $note: String) {
        campusTransferTask(orderId: $orderId, photos: $photos, note: $note) {
            id customFields { deliveryStatus }
        }
    }
`;

export async function startTask(orderId: string) {
    return riderClient().request(START, { orderId }).then((r: any) => r.campusStartTask);
}

export async function deliverTask(orderId: string, photos: string[], note?: string) {
    return riderClient().request(DELIVER, { orderId, photos, note }).then((r: any) => r.campusDeliverTask);
}

export async function reportException(orderId: string, type: string, photos: string[], note?: string) {
    return riderClient().request(REPORT, { orderId, type, photos, note }).then((r: any) => r.campusReportException);
}

export async function transferTask(orderId: string, photos: string[], note?: string) {
    return riderClient().request(TRANSFER, { orderId, photos, note }).then((r: any) => r.campusTransferTask);
}
