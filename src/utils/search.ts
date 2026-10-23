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

/**
 * 搜索无结果兜底：常见「主食后缀」近似替换。
 * 用户搜「牛腩饭」搜不到时，给出「牛腩粉 / 牛腩面 / 牛腩套餐」等。
 */
const FALLBACK_SUFFIX: Record<string, string[]> = {
    饭: ['粉', '面', '套餐', '盖饭', '煲仔饭'],
    粉: ['饭', '面', '米线', '河粉'],
    面: ['饭', '粉', '米线', '拉面'],
    汤: ['羹', '粥', '煲'],
    粥: ['汤', '羹', '粉'],
    茶: ['奶茶', '果茶', '咖啡'],
    鸡: ['鸭', '牛', '猪'],
    奶茶: ['果茶', '咖啡', '气泡水'],
};

/** 非 ASCII 尾部字符（中文/日文等）取末尾 1 字做后缀替换 */
function tailChar(kw: string): string {
    const chars = Array.from(kw);
    return chars.length ? chars[chars.length - 1] : '';
}

/**
 * 近似词建议：先用词库（店铺标签/店名/商品名）找同词根、且一定搜得到的词，
 * 再用「后缀替换」补足（如「牛腩饭」→「牛腩粉 / 牛腩面」）。去重、不含原词、最多 limit 条。
 */
export function similarKeywords(kw: string, vocab: string[] = [], limit = 4): string[] {
    const raw = String(kw ?? '').trim();
    if (!raw) return [];
    const out: string[] = [];
    const push = (w: string) => {
        const v = String(w ?? '').trim();
        if (!v || v === raw || out.includes(v)) return;
        out.push(v);
    };
    // 词库同词根（搜索词前 2 字命中）：本身就是词库里的词，点击必有结果
    const head = raw.slice(0, 2);
    if (head.length >= 2) {
        const near = vocab
            .map((v) => String(v ?? '').trim())
            .filter((v) => v.includes(head) && !v.includes(raw) && v.length <= raw.length + 4)
            .sort((a, b) => a.length - b.length);
        for (const v of near) push(v);
    }
    const tail = tailChar(raw);
    const stem = raw.slice(0, Math.max(0, raw.length - tail.length));
    for (const s of FALLBACK_SUFFIX[tail] ?? []) push(stem + s);
    return out.slice(0, limit);
}

/** 换品类兜底：从店铺标签里挑与搜索词无关、且未出现的标签作为可点品类 */
export function fallbackCategories(stores: any[], kw: string, limit = 6): string[] {
    const key = String(kw ?? '').trim();
    const out: string[] = [];
    for (const s of stores ?? []) {
        for (const t of s?.tags ?? []) {
            const v = String(t ?? '').trim();
            if (!v || v === '全部' || v === key || out.includes(v)) continue;
            out.push(v);
        }
    }
    return out.slice(0, limit);
}

/** 搜索词清洗：去掉空白与常见语气词，避免「想吃 牛腩饭」直接搜不到 */
export function cleanKeyword(kw: string): string {
    return String(kw ?? '')
        .replace(/[\s\u3000]+/g, '')
        .replace(/^(我想吃|想吃|来一份|来个|整一份|给我来)/, '')
        .trim();
}

