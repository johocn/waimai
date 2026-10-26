import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

/**
 * 在线客服 IM（P0-3）：schema 对照 campus-delivery.plugin shopApiExtensions。
 * 轮询模型（5s 增量拉 afterId 之后的消息），无长连接。
 */

const CONVERSATION_FIELDS = `
  id orderCode subject status lastMessage lastMessageAt lastSenderType unreadForCustomer createdAt
`;

const MESSAGE_FIELDS = `
  id conversationId senderType content images readAt createdAt
`;

const START_CHAT = gql`
  mutation campusStartChat($orderCode: String, $subject: String) {
    campusStartChat(orderCode: $orderCode, subject: $subject) { ${CONVERSATION_FIELDS} }
  }
`;

const MY_CONVERSATIONS = gql`
  query campusMyChatConversations($skip: Int, $take: Int) {
    campusMyChatConversations(skip: $skip, take: $take) { ${CONVERSATION_FIELDS} }
  }
`;

const CHAT_MESSAGES = gql`
  query campusChatMessages($conversationId: ID!, $afterId: ID, $take: Int) {
    campusChatMessages(conversationId: $conversationId, afterId: $afterId, take: $take) { ${MESSAGE_FIELDS} }
  }
`;

const SEND_CHAT_MESSAGE = gql`
  mutation campusSendChatMessage($conversationId: ID!, $content: String, $images: [String!]) {
    campusSendChatMessage(conversationId: $conversationId, content: $content, images: $images) { ${MESSAGE_FIELDS} }
  }
`;

const MARK_CHAT_READ = gql`
  mutation campusMarkChatRead($conversationId: ID!) {
    campusMarkChatRead(conversationId: $conversationId) { ${CONVERSATION_FIELDS} }
  }
`;

const CLOSE_CHAT = gql`
  mutation campusCloseChat($conversationId: ID!) {
    campusCloseChat(conversationId: $conversationId) { ${CONVERSATION_FIELDS} }
  }
`;

/** 发起会话（同订单已有 open 会话时后端复用，不产生重复会话） */
export function startChat(orderCode?: string, subject?: string) {
  return getGraphQLClient()
    .request(START_CHAT, { orderCode: orderCode ?? null, subject: subject ?? null })
    .then((r: any) => r?.campusStartChat);
}

export function fetchMyChatConversations(skip = 0, take = 20) {
  return getGraphQLClient()
    .request(MY_CONVERSATIONS, { skip, take })
    .then((r: any) => r?.campusMyChatConversations ?? []);
}

/** afterId 为空时拉最近一页；传 afterId 走增量（轮询） */
export function fetchChatMessages(conversationId: string, afterId?: string | null, take = 30) {
  return getGraphQLClient()
    .request(CHAT_MESSAGES, { conversationId, afterId: afterId ?? null, take })
    .then((r: any) => r?.campusChatMessages ?? []);
}

export function sendChatMessage(conversationId: string, content?: string, images?: string[]) {
  return getGraphQLClient()
    .request(SEND_CHAT_MESSAGE, { conversationId, content: content ?? null, images: images ?? null })
    .then((r: any) => r?.campusSendChatMessage);
}

export function markChatRead(conversationId: string) {
  return getGraphQLClient()
    .request(MARK_CHAT_READ, { conversationId })
    .then((r: any) => r?.campusMarkChatRead);
}

export function closeChat(conversationId: string) {
  return getGraphQLClient()
    .request(CLOSE_CHAT, { conversationId })
    .then((r: any) => r?.campusCloseChat);
}
