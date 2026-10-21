/**
 * 规格记忆：按商品记住上次选择的变体，再次进店默认选中，减少重复点选。
 * 仅存本地，换设备不同步；变体下架/售罄时由调用方回退首个可用规格。
 */
const KEY = 'sku_memory';
const MAX_ENTRIES = 200;

type MemoryMap = Record<string, string>;

function readAll(): MemoryMap {
    try {
        const raw = uni.getStorageSync(KEY);
        const obj = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
        return obj && typeof obj === 'object' ? obj : {};
    } catch {
        return {};
    }
}

/** 读取上次选择的变体 id；无记录返回空串 */
export function preferredVariantId(productId: string | number | null | undefined): string {
    if (productId == null || productId === '') return '';
    const id = readAll()[String(productId)];
    return typeof id === 'string' ? id : '';
}

/** 记录本次选择的变体；超出上限时丢弃最早写入的记录 */
export function rememberVariant(productId: string | number | null | undefined, variantId: string | number | null | undefined): void {
    if (productId == null || productId === '' || variantId == null || variantId === '') return;
    const map = readAll();
    const key = String(productId);
    delete map[key];
    map[key] = String(variantId);
    const keys = Object.keys(map);
    if (keys.length > MAX_ENTRIES) {
        for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete map[k];
    }
    try {
        uni.setStorageSync(KEY, JSON.stringify(map));
    } catch {
        /* 存储满/隐私模式失败时静默，不影响加购 */
    }
}

/** 从变体列表挑出上次选择的可用变体，不可用（下架/售罄/已删除）时返回 null */
export function resolvePreferredVariant<T extends { id: any; enabled?: boolean; stockLevel?: any }>(
    productId: string | number | null | undefined,
    variants: T[] | null | undefined,
): T | null {
    const id = preferredVariantId(productId);
    if (!id || !Array.isArray(variants)) return null;
    const hit = variants.find(v => String(v.id) === id);
    if (!hit || hit.enabled === false) return null;
    const raw = hit.stockLevel;
    if (raw === 'OUT_OF_STOCK') return null;
    if (typeof raw === 'number' && raw <= 0) return null;
    return hit;
}
