/**
 * 地址标签（家/学校/公司）：本地存储，键为 Vendure address id。
 * 仅前端展示用，不写后端 customFields（避免与校园 zone/building 字段混用）。
 */
const LABEL_KEY = 'address_labels';

export const ADDRESS_LABELS: Array<{ key: string; i18n: string }> = [
    { key: 'home', i18n: 'addressBook.tagHome' },
    { key: 'school', i18n: 'addressBook.tagSchool' },
    { key: 'company', i18n: 'addressBook.tagCompany' },
];

export function readAddressLabels(): Record<string, string> {
    try {
        return JSON.parse(uni.getStorageSync(LABEL_KEY) || '{}') || {};
    } catch {
        return {};
    }
}

export function writeAddressLabel(addressId: string, labelKey: string | null) {
    const map = readAddressLabels();
    if (labelKey) map[String(addressId)] = labelKey;
    else delete map[String(addressId)];
    uni.setStorageSync(LABEL_KEY, JSON.stringify(map));
}

export function addressLabelKey(addressId: string | number): string {
    return readAddressLabels()[String(addressId)] || '';
}
