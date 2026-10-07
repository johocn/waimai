import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

const FIELDS = `
    id orderId orderLineId type state reason description evidenceImages
    refundAmount rejectReason refundTransactionId actualRefundAmount refundedAt refundError
    createdAt updatedAt messageCount
    order { id code totalWithTax }
`;

const MY_REQUESTS = gql`
    query myAfterSalesRequests($options: AfterSalesRequestListOptions) {
        myAfterSalesRequests(options: $options) { totalItems items { ${FIELDS} } }
    }
`;
const REQUEST_DETAIL = gql`
    query afterSalesRequest($id: ID!) { afterSalesRequest(id: $id) { ${FIELDS} } }
`;
const REQUEST_MESSAGES = gql`
    query afterSalesMessages($id: ID!, $options: AfterSalesMessageListOptions) {
        afterSalesMessages(id: $id, options: $options) { totalItems items { id senderType senderName content images createdAt } }
    }
`;
const CREATE = gql`
    mutation createAfterSalesRequest($input: CreateAfterSalesRequestInput!) {
        createAfterSalesRequest(input: $input) { ${FIELDS} }
    }
`;
const CANCEL = gql`
    mutation cancelAfterSalesRequest($id: ID!) { cancelAfterSalesRequest(id: $id) { ${FIELDS} } }
`;
const APPEAL = gql`
    mutation appealAfterSalesRequest($id: ID!, $note: String!) {
        appealAfterSalesRequest(id: $id, note: $note) { ${FIELDS} }
    }
`;
const ADD_MESSAGE = gql`
    mutation addAfterSalesMessage($id: ID!, $content: String!, $images: [String!]) {
        addAfterSalesMessage(id: $id, content: $content, images: $images) { id content createdAt }
    }
`;

export interface AfterSaleRequest {
    id: string;
    orderId: string;
    state: string;
    type: string;
    reason: string;
    description?: string | null;
    evidenceImages?: string[] | null;
    refundAmount: number;
    rejectReason?: string | null;
    refundTransactionId?: string | null;
    actualRefundAmount?: number | null;
    refundedAt?: string | null;
    refundError?: string | null;
    createdAt: string;
    updatedAt: string;
    messageCount?: number;
    order?: { id: string; code: string; totalWithTax: number };
}

export async function fetchMyAfterSales(): Promise<AfterSaleRequest[]> {
    const r = await getGraphQLClient().request(MY_REQUESTS, { options: { skip: 0, take: 20 } });
    return r?.myAfterSalesRequests?.items ?? [];
}
export async function fetchAfterSaleDetail(id: string): Promise<AfterSaleRequest | null> {
    const r = await getGraphQLClient().request(REQUEST_DETAIL, { id });
    return r?.afterSalesRequest ?? null;
}
export async function fetchAfterSaleMessages(id: string): Promise<any[]> {
    const r = await getGraphQLClient().request(REQUEST_MESSAGES, { id, options: { skip: 0, take: 50 } });
    return r?.afterSalesMessages?.items ?? [];
}
export async function createAfterSale(input: {
    orderId: string; type: string; reason: string; description?: string;
    evidenceImages?: string[]; refundAmount: number;
}): Promise<AfterSaleRequest> {
    const r = await getGraphQLClient().request(CREATE, { input });
    return r?.createAfterSalesRequest;
}
export async function cancelAfterSale(id: string): Promise<AfterSaleRequest> {
    const r = await getGraphQLClient().request(CANCEL, { id });
    return r?.cancelAfterSalesRequest;
}
export async function appealAfterSale(id: string, note: string): Promise<AfterSaleRequest> {
    const r = await getGraphQLClient().request(APPEAL, { id, note });
    return r?.appealAfterSalesRequest;
}
export async function addAfterSaleMessage(id: string, content: string, images?: string[]): Promise<any> {
    const r = await getGraphQLClient().request(ADD_MESSAGE, { id, content, images: images ?? null });
    return r?.addAfterSalesMessage;
}
