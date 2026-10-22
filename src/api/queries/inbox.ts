import { getGraphQLClient } from '../client';

/**
 * 站内通知收件箱（后端 notification-plugin shop-api）。
 * myInbox / inboxUnreadCount / markInboxRead 均需登录。
 */

const INBOX_FIELDS = `
    id scene title content link isRead createdAt
`;

export interface InboxMessage {
    id: string;
    scene: string;
    title: string;
    content: string;
    link?: string | null;
    isRead: boolean;
    createdAt: string;
}

export async function getMyInbox() {
    const client = getGraphQLClient();
    const query = `query MyInbox {
        myInbox { totalItems items { ${INBOX_FIELDS} } }
    }`;
    const res: any = await client.request(query);
    return (res?.myInbox || { items: [], totalItems: 0 }) as { items: InboxMessage[]; totalItems: number };
}

export async function getInboxUnreadCount() {
    const client = getGraphQLClient();
    const res: any = await client.request(`query InboxUnreadCount { inboxUnreadCount }`);
    return Number(res?.inboxUnreadCount || 0);
}

export async function markInboxRead(id: string) {
    const client = getGraphQLClient();
    const query = `mutation MarkInboxRead($id: ID!) { markInboxRead(id: $id) { id isRead } }`;
    const res: any = await client.request(query, { id });
    return Boolean(res?.markInboxRead?.isRead);
}
