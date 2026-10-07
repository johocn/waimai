/** 个人中心纯函数：默认地址挑选 / 校园目标校验 / 发票抬头校验（spec §3.2/§3.3） */

export interface CampusAddress {
    id: string;
    fullName?: string;
    phoneNumber?: string;
    streetLine1?: string;
    defaultShippingAddress?: boolean;
    customFields?: { zoneId?: string; buildingId?: string; route?: string };
}

/** 取默认校园地址：defaultShippingAddress 优先，否则首个带 zoneId 的地址 */
export function pickDefaultCampusAddress(addresses: CampusAddress[]): CampusAddress | null {
    const campus = (addresses || []).filter((a) => a?.customFields?.zoneId);
    if (!campus.length) return null;
    return campus.find((a) => a.defaultShippingAddress) || campus[0];
}

/** zone/building 是否有效（存在且楼栋归属该分区），失效地址/跨店铺脏数据均 false */
export function isValidCampusTarget(zoneId: string, buildingId: string, zones: any[], buildings: any[]): boolean {
    if (!zones?.some((z) => String(z.id) === String(zoneId))) return false;
    return !!buildings?.some((b) => String(b.id) === String(buildingId) && String(b.zoneId) === String(zoneId));
}

export interface InvoiceTitle {
    type: 'personal' | 'company';
    name: string;
    taxNo?: string;
    email: string;
}

/** 发票抬头 JSON 安全解析：坏 JSON / 非数组返回 []，最多 5 条（spec §5） */
export function parseInvoiceTitles(raw: unknown): InvoiceTitle[] {
    if (typeof raw !== 'string' || !raw) return [];
    try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr.slice(0, 5) as InvoiceTitle[];
    } catch {
        return [];
    }
}

/** 抬头校验：返回错误码，null=合法。个人：name+email；企业：+taxNo（15-20 位字母数字） */
export function validateInvoiceTitle(t: InvoiceTitle): string | null {
    if (t?.type !== 'personal' && t?.type !== 'company') return 'TYPE_INVALID';
    if (!t.name || !String(t.name).trim()) return 'NAME_REQUIRED';
    if (t.type === 'company' && !t.taxNo) return 'TAXNO_REQUIRED';
    if (t.taxNo && !/^[A-Za-z0-9]{15,20}$/.test(String(t.taxNo))) return 'TAXNO_INVALID';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(t.email || ''))) return 'EMAIL_INVALID';
    return null;
}
