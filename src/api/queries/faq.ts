import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

/** 帮助中心 FAQ（后台可维护）：启用中条目，按渠道隔离；lang 命中则返回对应翻译 */
export const FAQS = gql`
    query Faqs($type: String, $lang: String) {
        faqs(type: $type, lang: $lang) {
            id
            title
            content
            type
            sort
        }
    }
`;

export interface FaqItem {
    id: string;
    title: string;
    content: string;
    type: string;
    sort: number;
}

/** 前端 locale（zh-Hans / en）→ 后端 CONTENT_LOCALES（zh-CN / en） */
export function toContentLocale(locale: string): string {
    return locale === 'zh-Hans' ? 'zh-CN' : locale;
}

/** 拉取全部 FAQ；接口失败返回空数组，由页面回落内置静态 FAQ */
export async function fetchFaqs(locale: string): Promise<FaqItem[]> {
    try {
        const res: any = await getGraphQLClient().request(FAQS, { lang: toContentLocale(locale) });
        return (res?.faqs ?? []).map((f: any) => ({
            id: String(f.id),
            title: String(f.title ?? ''),
            content: String(f.content ?? ''),
            type: String(f.type ?? 'general'),
            sort: Number(f.sort) || 0,
        })).filter((f: FaqItem) => f.title && f.content);
    } catch (e) {
        console.warn('[faq] fetch failed, fallback to static', e);
        return [];
    }
}
