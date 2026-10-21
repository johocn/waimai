/** 首页搜索的本地历史 / 热搜词 / 商品命中过滤（纯前端，无网络） */

const HISTORY_KEY = 'search_history';
export const SEARCH_HISTORY_MAX = 10;

function readRaw(): string[] {
    try {
        const raw = uni.getStorageSync(HISTORY_KEY);
        const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(list) ? list.map((v: any) => String(v)).filter(Boolean) : [];
    } catch {
        return [];
    }
}

/** 最新在前、去重、最多 10 条 */
export function readSearchHistory(): string[] {
    return readRaw().slice(0, SEARCH_HISTORY_MAX);
}

export function pushSearchHistory(keyword: string): string[] {
    const kw = String(keyword ?? '').trim();
    if (!kw) return readSearchHistory();
    const next = [kw, ...readRaw().filter(h => h !== kw)].slice(0, SEARCH_HISTORY_MAX);
    uni.setStorageSync(HISTORY_KEY, JSON.stringify(next));
    return next;
}

export function clearSearchHistory(): void {
    uni.removeStorageSync(HISTORY_KEY);
}

/**
 * 热搜词：优先店铺标签（去重、排除「全部」），不足用店铺名补齐。
 * 全是本地数据推导，无需后端热搜接口。
 */
export function buildHotWords(stores: any[], limit = 6): string[] {
    const words: string[] = [];
    const push = (w?: string) => {
        const v = String(w ?? '').trim();
        if (v && v !== '全部' && !words.includes(v)) words.push(v);
    };
    for (const s of stores) {
        for (const t of s.tags ?? []) push(t);
    }
    for (const s of stores) push(s.name);
    return words.slice(0, limit);
}

/** 商品描述可能是 JSON/富文本，统一转纯文本再命中 */
export function plainText(input?: string | null): string {
    if (!input) return '';
    let text = String(input);
    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
            const walk = (n: any): string => {
                if (!n) return '';
                if (typeof n === 'string') return n;
                if (Array.isArray(n)) return n.map(walk).join(' ');
                return [n.text, n.content, ...(n.children ?? []).map(walk)].filter(Boolean).join(' ');
            };
            text = walk(parsed);
        }
    } catch {
        // 非 JSON：直接按文本处理
    }
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function matchesProduct(product: any, keyword: string): boolean {
    const kw = String(keyword ?? '').trim().toLowerCase();
    if (!kw) return true;
    const name = String(product?.name ?? '').toLowerCase();
    if (name.includes(kw)) return true;
    return plainText(product?.description).toLowerCase().includes(kw);
}
