/**
 * 配送偏好：本地记忆（与口味偏好同一策略），结算页默认带入并写入订单备注。
 * 不新增后端字段，避免依赖 Order customFields 配置变更。
 */
export type DeliveryPrefKey = 'door' | 'reception' | 'call';

export const DELIVERY_PREF_KEYS: readonly DeliveryPrefKey[] = ['door', 'reception', 'call'];
export const DELIVERY_PREF_STORAGE = 'delivery_preference';
export const DELIVERY_PREF_NOTE_STORAGE = 'delivery_preference_note';
/** 自定义配送说明长度上限（与备注段同量级） */
export const DELIVERY_PREF_NOTE_MAX = 40;

export function isDeliveryPrefKey(v: any): v is DeliveryPrefKey {
    return DELIVERY_PREF_KEYS.includes(v as DeliveryPrefKey);
}

export function readDeliveryPref(): DeliveryPrefKey | '' {
    try {
        const raw = String(uni.getStorageSync(DELIVERY_PREF_STORAGE) || '');
        return isDeliveryPrefKey(raw) ? raw : '';
    } catch {
        return '';
    }
}

export function writeDeliveryPref(key: DeliveryPrefKey | '') {
    try {
        if (key) uni.setStorageSync(DELIVERY_PREF_STORAGE, key);
        else uni.removeStorageSync(DELIVERY_PREF_STORAGE);
    } catch { /* 隐私模式忽略 */ }
}

export function readDeliveryPrefNote(): string {
    try {
        return String(uni.getStorageSync(DELIVERY_PREF_NOTE_STORAGE) || '').slice(0, DELIVERY_PREF_NOTE_MAX);
    } catch {
        return '';
    }
}

export function writeDeliveryPrefNote(note: string) {
    try {
        const v = String(note || '').trim().slice(0, DELIVERY_PREF_NOTE_MAX);
        if (v) uni.setStorageSync(DELIVERY_PREF_NOTE_STORAGE, v);
        else uni.removeStorageSync(DELIVERY_PREF_NOTE_STORAGE);
    } catch { /* 隐私模式忽略 */ }
}
