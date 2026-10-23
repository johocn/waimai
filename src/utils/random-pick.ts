/**
 * 「帮我选」随机点餐：纯函数，便于单测与截图回归。
 * 店铺可参与条件：未暂停、当前营业中（打烊/即将打烊不排除，便于「先看看」）、起送价 ≤ 预算。
 */
import { getStoreStatus } from './store-status';

export function saleableVariant(v: any): boolean {
    return !!v && v.enabled !== false && v.stockLevel !== 'OUT_OF_STOCK' && Number(v.priceWithTax) > 0;
}

export function variantLabel(v: any): string {
    const opts = (v?.options ?? []).map((o: any) => o?.name).filter(Boolean);
    return opts.length ? opts.join(' / ') : String(v?.name ?? '');
}

function minOrderOf(s: any): number {
    const n = Number(s?.minOrderAmount);
    return Number.isFinite(n) ? n : 0;
}

export function eligibleStores(stores: any[], budgetFen: number | null): any[] {
    return (stores ?? []).filter((s) => {
        if (!s || !s.channelToken || s.paused) return false;
        if (getStoreStatus(s.businessHours).state === 'closed') return false;
        if (budgetFen != null && minOrderOf(s) > budgetFen) return false;
        return true;
    });
}

export function pickStore(stores: any[], rnd: () => number): any | null {
    if (!stores?.length) return null;
    return stores[Math.floor(rnd() * stores.length) % stores.length];
}

function shuffle<T>(list: T[], rnd: () => number): T[] {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1)) % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/** 商品分类名（优先一级 collection） */
export function productCategory(p: any): string {
    const c = (p?.collections ?? []).find((x: any) => x?.parent?.name === '__root_collection__')
        || (p?.collections ?? [])[0];
    return String(c?.name || '');
}

interface Candidate { p: any; v: any; price: number }

function candidatesOf(products: any[], category: string): Candidate[] {
    const out: Candidate[] = [];
    for (const p of products ?? []) {
        if (!p || p.enabled === false) continue;
        if (category && productCategory(p) !== category) continue;
        for (const v of p.variants ?? []) {
            if (!saleableVariant(v)) continue;
            out.push({ p, v, price: Number(v.priceWithTax) });
            break; // 每个商品只取一个可售规格（价格最低的在前）
        }
    }
    return out;
}

/**
 * 随机菜品组合：总价 ≤ 预算（预算为空则不设限）。
 * 1 件「主力」+ 随机 0–2 件低价配菜，同一商品不重复。
 */
export function pickCombo(
    products: any[],
    budgetFen: number | null,
    rnd: () => number,
    maxItems = 3,
    category = '',
): Array<{ p: any; v: any }> {
    let pool = candidatesOf(products, category);
    if (!pool.length && category) pool = candidatesOf(products, '');
    if (!pool.length) return [];

    if (budgetFen == null) {
        const picked: Candidate[] = [];
        for (const c of shuffle(pool, rnd)) {
            if (picked.length >= maxItems) break;
            picked.push(c);
        }
        return picked.map(({ p, v }) => ({ p, v }));
    }

    const affordable = shuffle(pool.filter((c) => c.price <= budgetFen), rnd);
    if (!affordable.length) return [];
    const picked: Candidate[] = [affordable[0]];
    let remain = budgetFen - affordable[0].price;
    const rest = affordable.filter((c) => String(c.p.id) !== String(affordable[0].p.id));
    for (const c of shuffle(rest, rnd)) {
        if (picked.length >= maxItems || remain <= 0) break;
        if (c.price > remain) continue;
        picked.push(c);
        remain -= c.price;
    }
    return picked.map(({ p, v }) => ({ p, v }));
}

export function comboTotal(items: Array<{ v: any }>): number {
    return items.reduce((s, it) => s + (Number(it?.v?.priceWithTax) || 0), 0);
}
