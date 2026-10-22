import { getGraphQLClient } from '../client';

/**
 * 消息中心（后端 message-plugin）。
 * myMessages 以 MessageDelivery 为粒度返回（messageId/title/body/readAt/createdAt），
 * 匿名调用返回空列表；markMessageRead 需登录（Permission.Owner）。
 */

const MY_MESSAGE_FIELDS = `
    id messageId title body readAt createdAt
`;

export interface MyMessage {
    id: string;
    messageId: string;
    title: string;
    body: string;
    readAt?: string | null;
    createdAt: string;
}

export async function getMyMessages(options?: { take?: number; skip?: number }) {
    const client = getGraphQLClient();
    const query = `query MyMessages($options: JSON) {
        myMessages(options: $options) {
            totalItems
            items { ${MY_MESSAGE_FIELDS} }
        }
    }`;
    const res: any = await client.request(query, { options: { take: 50, ...(options || {}) } });
    return (res?.myMessages || { items: [], totalItems: 0 }) as { items: MyMessage[]; totalItems: number };
}

export async function getMyUnreadMessageCount() {
    const client = getGraphQLClient();
    const query = `query MyUnreadMessageCount { myUnreadMessageCount }`;
    const res: any = await client.request(query);
    return Number(res?.myUnreadMessageCount || 0);
}

export async function markMessageRead(id: string) {
    const client = getGraphQLClient();
    const query = `mutation MarkMessageRead($id: ID!) { markMessageRead(id: $id) }`;
    const res: any = await client.request(query, { id });
    return Boolean(res?.markMessageRead);
}
