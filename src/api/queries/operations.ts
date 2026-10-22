import { getGraphQLClient } from '../client';

/**
 * 首页运营位（后端 operations-plugin，公开查询）。
 * publishedContent 仅返回「已启用 + 已发布 + 在投放时间内」的内容，按 sort 升序。
 * data 为 JSON：Banner 需 imageUrl；Notice 需 content；IconGrid 需 items[{icon,label,link}]。
 */

const CONTENT_FIELDS = `id type code name sort position data startAt endAt`;

export interface ContentItemPublic {
    id: string;
    type: string;
    code: string;
    name: string;
    sort: number;
    position: string;
    data: any;
    startAt?: string | null;
    endAt?: string | null;
}

function parseData(raw: any) {
    if (!raw) return {};
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch { return {}; }
    }
    return raw;
}

export async function getPublishedContent(type: string, position?: string) {
    const client = getGraphQLClient();
    const query = `query PublishedContent($type: String, $position: String) {
        publishedContent(type: $type, position: $position) { ${CONTENT_FIELDS} }
    }`;
    const res: any = await client.request(query, { type, position });
    const list: any[] = res?.publishedContent || [];
    return list.map((it) => ({ ...it, data: parseData(it.data) })) as ContentItemPublic[];
}
