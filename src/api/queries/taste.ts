import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

const UPDATE_TASTE_PROFILE = gql`
    mutation CampusUpdateTasteProfile($input: String!) {
        campusUpdateTasteProfile(input: $input)
    }
`;

/**
 * 口味偏好云端同步（P3-1）：把本机 JSON 上行到 Customer.customFields.tasteProfile。
 * 传空串代表清除。未登录/网络失败由调用方静默降级（本机存储仍是权威副本）。
 */
export async function saveTasteProfile(input: string): Promise<string> {
    const r: any = await getGraphQLClient().request(UPDATE_TASTE_PROFILE, { input });
    return r?.campusUpdateTasteProfile || '';
}
