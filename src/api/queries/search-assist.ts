import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

/** 识别结果字段以 campus-delivery-plugin shop-api schema 为准 */
export const SEARCH_ASSIST_QUERY = gql`
    query CampusSearchAssist($type: String!, $payload: String) {
        campusSearchAssist(type: $type, payload: $payload) {
            ok type provider text keywords latencyMs error
        }
    }
`;

export interface SearchAssistResult {
    ok: boolean;
    type: string;
    provider: string;
    text: string;
    keywords: string[];
    latencyMs: number;
    error: string | null;
}

/**
 * 语音/拍照搜索（P2-2）：把音频/图片交给服务端识别，返回可直接搜索的关键词。
 * payload 目前由服务端 mock 忽略（传文本时会按分隔符切词），接入真实服务商后无需改本函数。
 */
export async function assistSearch(type: 'voice' | 'image', payload?: string): Promise<SearchAssistResult> {
    const res: any = await getGraphQLClient().request(SEARCH_ASSIST_QUERY, { type, payload: payload ?? null });
    return res?.campusSearchAssist;
}
