/**
 * 我的口味偏好：辣度 / 忌口 / 过敏原 / 餐具份数。
 * 纯本机存储（无后端改动），下单时自动拼进整单备注；
 * 进店时按忌口/过敏原对菜品做命中提示。
 */
const KEY = 'taste_profile';
/** 迁移来源：结算页旧的口味勾选（字符串数组） */
const LEGACY_KEY = 'taste_preferences';

export const SPICY_KEYS = ['none', 'mild', 'medium', 'hot'] as const;
export const AVOID_KEYS = ['coriander', 'onion', 'garlic', 'chives', 'ginger'] as const;
export const ALLERGEN_KEYS = ['peanut', 'seafood', 'gluten', 'dairy', 'nuts', 'egg'] as const;

export type SpicyKey = (typeof SPICY_KEYS)[number];
export type AvoidKey = (typeof AVOID_KEYS)[number];
export type AllergenKey = (typeof ALLERGEN_KEYS)[number];

export interface TasteProfile {
    /** 辣度：单选，'' 表示未设置 */
    spicy: SpicyKey | '';
    /** 忌口：多选 */
    avoid: AvoidKey[];
    /** 过敏原：多选 */
    allergens: AllergenKey[];
    /** 餐具份数：0 = 无需餐具 */
    tableware: number;
}

export const EMPTY_PROFILE: TasteProfile = { spicy: '', avoid: [], allergens: [], tableware: 0 };

const AVOID_SET = new Set<string>(AVOID_KEYS);
const ALLERGEN_SET = new Set<string>(ALLERGEN_KEYS);

function pickKeys(value: any, allow: Set<string>): string[] {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const v of value) {
        const k = String(v);
        if (allow.has(k) && !out.includes(k)) out.push(k);
    }
    return out;
}

export function normalizeProfile(raw: any): TasteProfile {
    const obj = raw && typeof raw === 'object' ? raw : {};
    const spicy = SPICY_KEYS.includes(obj.spicy) ? (obj.spicy as SpicyKey) : '';
    const tw = Math.max(0, Math.min(5, Math.round(Number(obj.tableware) || 0)));
    return {
        spicy,
        avoid: pickKeys(obj.avoid, AVOID_SET) as AvoidKey[],
        allergens: pickKeys(obj.allergens, ALLERGEN_SET) as AllergenKey[],
        tableware: tw,
    };
}

/** 旧版勾选（noSpicy/lessSpicy/noCoriander/noOnion）→ 新结构 */
function migrateLegacy(): TasteProfile | null {
    try {
        const raw: any = uni.getStorageSync(LEGACY_KEY);
        const arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
        if (!Array.isArray(arr) || !arr.length) return null;
        const keys = arr.map(String);
        const spicy: SpicyKey | '' = keys.includes('noSpicy') ? 'none' : keys.includes('lessSpicy') ? 'mild' : '';
        const avoid: AvoidKey[] = [];
        if (keys.includes('noCoriander')) avoid.push('coriander');
        if (keys.includes('noOnion')) avoid.push('onion');
        return { spicy, avoid, allergens: [], tableware: 0 };
    } catch {
        return null;
    }
}

export function readTasteProfile(): TasteProfile {
    try {
        const raw: any = uni.getStorageSync(KEY);
        if (raw) {
            const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (obj && typeof obj === 'object') return normalizeProfile(obj);
        }
    } catch {
        /* 存储不可用时返回空档 */
    }
    const migrated = migrateLegacy();
    return migrated ?? { ...EMPTY_PROFILE };
}

export function writeTasteProfile(profile: TasteProfile): TasteProfile {
    const norm = normalizeProfile(profile);
    try {
        uni.setStorageSync(KEY, JSON.stringify(norm));
    } catch {
        /* 忽略 */
    }
    return norm;
}

export function clearTasteProfile(): void {
    try {
        uni.removeStorageSync(KEY);
    } catch {
        /* 忽略 */
    }
}

/** 是否有任何设置（决定是否带入备注 / 是否显示菜品提示） */
export function hasTaste(profile: TasteProfile): boolean {
    return !!profile.spicy || profile.avoid.length > 0 || profile.allergens.length > 0 || profile.tableware > 0;
}

/** 备注片段用到的文案解析（由页面注入 i18n，保持本文件纯净可测） */
export interface TasteLabels {
    spicy: (k: SpicyKey) => string;
    avoid: (k: AvoidKey) => string;
    allergen: (k: AllergenKey) => string;
    noTableware: string;
    /** 需 {n} 份餐具 */
    tableware: (n: number) => string;
    segAvoid: (names: string) => string;
    segAllergen: (names: string) => string;
}

/**
 * 口味偏好 → 整单备注片段（按「辣度 / 忌口 / 过敏原 / 餐具」顺序，逐段可省略）。
 * 追加在用户自由备注之后，方便商家一眼看到硬性要求。
 * includeTableware=false：餐具已单独写入 order.tablewareCount，避免备注重复。
 */
export function tasteNoteParts(
    profile: TasteProfile,
    L: TasteLabels,
    opts: { includeTableware?: boolean } = {},
): string[] {
    const includeTableware = opts.includeTableware !== false;
    const parts: string[] = [];
    if (profile.spicy) parts.push(L.spicy(profile.spicy));
    if (profile.avoid.length) parts.push(L.segAvoid(profile.avoid.map(L.avoid).join('、')));
    if (profile.allergens.length) parts.push(L.segAllergen(profile.allergens.map(L.allergen).join('、')));
    if (!includeTableware) return parts;
    if (profile.tableware > 0) parts.push(L.tableware(profile.tableware));
    else if (hasTaste(profile)) parts.push(L.noTableware);
    return parts;
}

/** 由 i18n 的 t 组装标签解析器（页面 / 菜单 / 结算三处共用，避免文案散落） */
export function tasteLabels(t: (key: string) => string): TasteLabels {
    const rep = (key: string, n: string) => t(key).replace('{n}', n);
    return {
        spicy: (k) => t('taste.spicy.' + k),
        avoid: (k) => t('taste.avoid.' + k),
        allergen: (k) => t('taste.allergen.' + k),
        noTableware: t('taste.noTableware'),
        tableware: (n) => rep('taste.tablewareN', String(n)),
        segAvoid: (names) => rep('taste.segAvoid', names),
        segAllergen: (names) => rep('taste.segAllergen', names),
    };
}

/** 关键词表：命中即提示（中英兼顾，菜品文案由商家自定义语言） */
const HIT_WORDS: Record<string, string[]> = {
    coriander: ['香菜', '芫荽', 'coriander'],
    onion: ['洋葱', '葱花', '葱末', '香葱', '小葱', 'onion'],
    garlic: ['蒜', 'garlic'],
    chives: ['韭菜', 'chive'],
    ginger: ['姜', 'ginger'],
    peanut: ['花生', 'peanut'],
    seafood: ['海鲜', '虾', '蟹', '鱿鱼', '贝', 'seafood', 'shrimp', 'crab', 'squid'],
    gluten: ['面粉', '面条', '麦', '麸', 'gluten', 'wheat', 'noodle'],
    dairy: ['牛奶', '奶', '芝士', '乳酪', '黄油', 'milk', 'cheese', 'butter', 'dairy'],
    nuts: ['坚果', '杏仁', '腰果', '核桃', 'nut', 'almond', 'cashew'],
    egg: ['鸡蛋', '蛋', 'egg'],
};

export interface TasteHit {
    kind: 'avoid' | 'allergen';
    key: string;
}

/** 菜名/描述命中忌口与过敏原（去重，忌口优先） */
export function tasteHits(text: string, profile: TasteProfile): TasteHit[] {
    const src = String(text ?? '').toLowerCase();
    if (!src) return [];
    const out: TasteHit[] = [];
    const scan = (keys: readonly string[], kind: TasteHit['kind']) => {
        for (const k of keys) {
            if (out.some((h) => h.key === k)) continue;
            const words = HIT_WORDS[k] ?? [];
            if (words.some((w) => src.includes(w.toLowerCase()))) out.push({ kind, key: k });
        }
    };
    scan(profile.avoid, 'avoid');
    scan(profile.allergens, 'allergen');
    return out;
}
