/**
 * 骑手端加载失败分类：把 GraphQL/网络错误归成两类，页面据此给“无权限”或“加载失败 + 重试”。
 * 只做展示分类，不改变请求行为。
 */
export type LoadErrorKind = 'forbidden' | 'failed';

export function classifyLoadError(err: any): LoadErrorKind {
    const raw = String(err?.response?.errors?.[0]?.message || err?.message || '');
    return /forbidden|unauthori[sz]ed|permission|not approved|权限|认证|骑手资格/i.test(raw)
        ? 'forbidden'
        : 'failed';
}
