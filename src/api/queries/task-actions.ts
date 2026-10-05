import gql from 'graphql-tag';
import { riderClient } from './rider';

// schema 校准（rider-task-shop.resolver.ts / rider-task.service.ts）：
// 四个 mutation 均返回 Order（状态推进后自定义字段已更新，gql 选 customFields { deliveryStatus }）
// 任务单来自具体店铺渠道（hall.ts 聚合时附加 channelToken），操作时必须带同渠道 token 回传。

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

export async function startTask(orderId: string, channelToken?: string) {
    return riderClient(channelToken).request(START, { orderId }).then((r: any) => r.campusStartTask);
}

export async function deliverTask(orderId: string, photos: string[], note?: string, channelToken?: string) {
    return riderClient(channelToken).request(DELIVER, { orderId, photos, note }).then((r: any) => r.campusDeliverTask);
}

export async function reportException(orderId: string, type: string, photos: string[], note?: string, channelToken?: string) {
    return riderClient(channelToken).request(REPORT, { orderId, type, photos, note }).then((r: any) => r.campusReportException);
}

export async function transferTask(orderId: string, photos: string[], note?: string, channelToken?: string) {
    return riderClient(channelToken).request(TRANSFER, { orderId, photos, note }).then((r: any) => r.campusTransferTask);
}
