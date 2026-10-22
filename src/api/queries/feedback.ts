import { getGraphQLClient } from '../client';

/** 反馈条目公共字段（createFeedback / myFeedbacks 共用） */
const FEEDBACK_FIELDS = `
    id type title content imgs contactWay status reply repliedAt repliedBy readAt createdAt
`;

/** 提交意见反馈：authenticated；type 白名单 bug / experience / other，title ≤20，contactWay ≤30 */
export async function createFeedback(input: {
    type?: string;
    title: string;
    content: string;
    imgs?: string[];
    contactWay?: string;
}) {
    const client = getGraphQLClient();
    const query = `
        mutation CreateFeedback($input: CreateFeedbackInput!) {
            createFeedback(input: $input) { ${FEEDBACK_FIELDS} }
        }
    `;
    return client.request(query, { input });
}

/** 我的反馈列表：authenticated；按创建时间倒序取前 N 条 */
export async function getMyFeedbacks(options?: { take?: number; skip?: number }) {
    const client = getGraphQLClient();
    const query = `
        query GetMyFeedbacks($options: FeedbackListOptions) {
            myFeedbacks(options: $options) {
                totalItems
                items { ${FEEDBACK_FIELDS} }
            }
        }
    `;
    return client.request(query, { options: { take: 20, ...(options || {}) } });
}

/** 标记回复已读：仅服务端已处理（processing/resolved）的反馈会置 readAt */
export async function markFeedbacksRead() {
    const client = getGraphQLClient();
    const query = `
        mutation MarkFeedbacksRead {
            markFeedbacksRead
        }
    `;
    return client.request(query);
}
