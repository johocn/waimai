/**
 * 加料/小料 + 套餐（P1-2）C 端解析与预估计价。
 * 口径必须与后端 packages/campus-delivery-plugin/src/addon-fee.ts 完全一致，
 * 否则页面显示金额与结算落账金额不符。
 *
 * 约定：C 端只提交「加料选择的引用」（组名 + 选项名），金额一律由服务端按商品配置解析。
 */

/** 结算 surcharge 的 sku：与后端 ADDON_FEE_SKU 对齐（结算页识别加料费行用） */
export const ADDON_FEE_SKU = 'campus-addon-fee';

const ADDON_MAX_GROUPS = 5;
const ADDON_MAX_OPTIONS_PER_GROUP = 12;
const ADDON_MAX_PRICE_FEN = 100000;
const COMBO_MAX_ITEMS = 20;
const ADDON_TEXT_MAX = 20;

export interface AddonOptionConfig {
    name: string;
    /** 加价（分），0 = 免费加料 */
    price: number;
}

export interface AddonGroupConfig {
    name: string;
    min?: number | null;
    max?: number | null;
    options: AddonOptionConfig[];
}

export interface ComboItemConfig {
    name: string;
    qty: number;
    price?: number | null;
}

export interface ComboConfig {
    title?: string | null;
    items: ComboItemConfig[];
    note?: string | null;
}

/** 加料选择引用（提交给 shop-api，仅组名 + 选项名） */
export interface AddonSelection {
    g: string;
    n: string;
}

function toInt(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
}

function clampText(v: unknown, max = ADDON_TEXT_MAX): string {
    const s = String(v ?? '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max) : s;
}

function toFen(v: unknown): number {
    const n = toInt(v);
    if (n <= 0) return 0;
    return n > ADDON_MAX_PRICE_FEN ? ADDON_MAX_PRICE_FEN : n;
}

function toArray(raw: unknown): any[] {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        const s = raw.trim();
        if (!s) return [];
        try {
            const parsed = JSON.parse(s);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return Array.isArray((raw as any).items) ? (raw as any).items : [];
}

function toObject(raw: unknown): Record<string, any> | null {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw as Record<string, any>;
    if (typeof raw === 'string') {
        const s = raw.trim();
        if (!s) return null;
        try {
            const parsed = JSON.parse(s);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch {
            return null;
        }
    }
    return null;
}

/** 解析商品加料组配置（JSON 字符串或对象）；非法结构退空数组 */
export function parseAddonGroups(raw: unknown): AddonGroupConfig[] {
    const arr = toArray(raw);
    const out: AddonGroupConfig[] = [];
    for (const g of arr) {
        if (!g || typeof g !== 'object') continue;
        const name = clampText((g as any).name);
        if (!name) continue;
        const options: AddonOptionConfig[] = [];
        for (const o of toArray((g as any).options)) {
            if (!o || typeof o !== 'object') continue;
            const on = clampText((o as any).name);
            if (!on) continue;
            options.push({ name: on, price: toFen((o as any).price) });
            if (options.length >= ADDON_MAX_OPTIONS_PER_GROUP) break;
        }
        if (!options.length) continue;
        const rawMax = toInt((g as any).max);
        const rawMin = toInt((g as any).min);
        out.push({
            name,
            min: rawMin > 0 ? Math.min(rawMin, options.length) : 0,
            max: rawMax > 0 ? Math.min(rawMax, options.length) : 0,
            options,
        });
        if (out.length >= ADDON_MAX_GROUPS) break;
    }
    return out;
}

/** 解析套餐配置；items 为空视为非套餐（返回 null） */
export function parseCombo(raw: unknown): ComboConfig | null {
    const obj = toObject(raw);
    if (!obj) return null;
    const items: ComboItemConfig[] = [];
    for (const it of toArray(obj.items)) {
        if (!it || typeof it !== 'object') continue;
        const name = clampText((it as any).name);
        if (!name) continue;
        const qty = Math.max(1, Math.min(99, toInt((it as any).qty) || 1));
        const p = (it as any).price;
        items.push({ name, qty, price: p == null ? null : toFen(p) });
        if (items.length >= COMBO_MAX_ITEMS) break;
    }
    if (!items.length) return null;
    const note = clampText(obj.note, 100);
    const title = clampText(obj.title);
    return { title: title || null, items, note: note || null };
}

/** 按商品配置白名单校验加料选择引用（去重 + 逐组 max 截断） */
export function resolveAddonSelection(raw: unknown, groups: AddonGroupConfig[]): AddonSelection[] {
    const list = toArray(raw);
    if (!list.length || !groups.length) return [];
    const out: AddonSelection[] = [];
    const seen = new Set<string>();
    for (const s of list) {
        if (!s || typeof s !== 'object') continue;
        const g = clampText((s as any).g);
        const n = clampText((s as any).n);
        if (!g || !n) continue;
        const group = groups.find(x => x.name === g);
        if (!group || !group.options.some(o => o.name === n)) continue;
        const key = `${g}\u0000${n}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ g, n });
    }
    const used = new Map<string, number>();
    const capped: AddonSelection[] = [];
    for (const s of out) {
        const group = groups.find(x => x.name === s.g)!;
        const cur = used.get(s.g) ?? 0;
        const max = Number(group.max ?? 0);
        if (max > 0 && cur >= max) continue;
        used.set(s.g, cur + 1);
        capped.push(s);
    }
    return capped;
}

/** 单份加料加价合计（分）：仅白名单内选项参与 */
export function addonUnitFee(raw: unknown, groupsRaw: unknown): number {
    const groups = parseAddonGroups(groupsRaw);
    if (!groups.length) return 0;
    const selection = resolveAddonSelection(raw, groups);
    let fee = 0;
    for (const s of selection) {
        const opt = groups.find(g => g.name === s.g)?.options.find(o => o.name === s.n);
        if (opt) fee += toFen(opt.price);
    }
    return fee;
}

/** 单行加料费（分）= 单份加价和 × 件数 */
export function quoteAddonFeePerLine(raw: unknown, groupsRaw: unknown, quantity: number): number {
    const unit = addonUnitFee(raw, groupsRaw);
    if (!unit) return 0;
    const qty = Math.max(0, toInt(quantity));
    return unit * qty;
}

/** 加料展示文本：'加蛋 / 加辣' */
export function addonDisplayText(raw: unknown, separator = ' / '): string {
    const list = toArray(raw);
    const names: string[] = [];
    for (const s of list) {
        if (!s || typeof s !== 'object') continue;
        const n = clampText((s as any).n);
        if (n) names.push(n);
    }
    return names.join(separator);
}

/** 套餐原价合计（分）；无法计算返回 null */
export function comboOriginalPrice(combo: ComboConfig | null | undefined): number | null {
    if (!combo?.items?.length) return null;
    let sum = 0;
    let priced = 0;
    for (const it of combo.items) {
        if (it.price == null) continue;
        sum += toFen(it.price) * Math.max(1, toInt(it.qty));
        priced++;
    }
    return priced > 0 ? sum : null;
}

/** 套餐内容展示文本：'宫保鸡丁×1 / 米饭×1' */
export function comboItemsText(combo: ComboConfig | null | undefined, separator = ' / '): string {
    if (!combo?.items?.length) return '';
    return combo.items.map(it => `${it.name}×${Math.max(1, toInt(it.qty))}`).join(separator);
}

/** 分 → 元（保留两位，去掉无意义的 .00 由调用方决定） */
export function fenToYuan(fen: number): string {
    return (Math.max(0, toInt(fen)) / 100).toFixed(2);
}
