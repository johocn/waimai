/**
 * 地址文本解析：把「收货人 手机号 详细地址」一长串拆成表单字段（纯前端，无网络）。
 * 兼容常见粘贴格式：空格 / 逗号 / 全角标点 / 带「收货人：」前缀 / 手机号带空格或横线。
 */

export interface ParsedAddress {
    fullName: string;
    phoneNumber: string;
    detail: string;
}

const PHONE_RE = /1[3-9]\d{9}/;

/** 去掉 emoji 与不可见字符，统一全角标点为半角，压缩空白 */
function normalize(input: string): string {
    return String(input || '')
        .replace(/[\u200b-\u200d\ufeff]/g, '')
        .replace(/[，、,;；|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** 解析粘贴的地址文本；识别不到手机号时返回 phoneNumber 空串，detail 为全文 */
export function parseAddressText(input: string): ParsedAddress {
    const text = normalize(input);
    if (!text) return { fullName: '', phoneNumber: '', detail: '' };

    // 手机号可能被空格/横线分隔：先按紧凑数字找号码，再定位原文位置
    const compact = text.replace(/[\s-]/g, '');
    const hit = PHONE_RE.exec(compact);
    let phone = '';
    let before = text;
    let after = '';
    if (hit) {
        phone = hit[0];
        const digits = text.replace(/[\s-]/g, '');
        const startInCompact = digits.indexOf(phone);
        // 逐字符回推原文位置：跳过空格与横线
        let seen = 0;
        let start = -1;
        let end = -1;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === ' ' || ch === '-') continue;
            if (seen === startInCompact) start = i;
            seen++;
            if (seen === startInCompact + phone.length) { end = i + 1; break; }
        }
        if (start >= 0 && end > start) {
            before = text.slice(0, start).trim();
            after = text.slice(end).trim();
        }
    }

    // 姓名：手机号前的内容去掉「收货人/联系人/姓名」等前缀，取最后一段（多数格式为「姓名 电话」）
    let fullName = before
        .replace(/^(收货人|联系人|收件人|姓名)\s*[:：]?\s*/, '')
        .replace(/[:：]/g, ' ')
        .trim();
    if (fullName.includes(' ')) {
        const segs = fullName.split(' ').filter(Boolean);
        fullName = segs[segs.length - 1] || '';
    }
    // 姓名只保留中英文与间隔号，避免把门牌号当姓名
    fullName = fullName.replace(/[^\u4e00-\u9fa5A-Za-z·]/g, '').slice(0, 20);

    const detail = (after || before.replace(fullName, '').trim() || '').replace(/^[:：\s]+/, '').trim();
    return { fullName, phoneNumber: phone, detail: detail.slice(0, 120) };
}

/** 从详细地址中匹配校区/楼栋名称，返回命中的 id 与去掉名称后的门牌文本 */
export function matchCampus(
    detail: string,
    zones: Array<{ id: any; name: string }>,
    buildings: Array<{ id: any; name: string }>,
): { zoneId: string; buildingId: string; room: string } {
    let rest = String(detail || '');
    let zoneId = '';
    let buildingId = '';
    for (const z of zones) {
        if (z?.name && rest.includes(z.name)) {
            zoneId = String(z.id);
            rest = rest.replace(z.name, ' ');
            break;
        }
    }
    for (const b of buildings) {
        if (b?.name && rest.includes(b.name)) {
            buildingId = String(b.id);
            rest = rest.replace(b.name, ' ');
            break;
        }
    }
    return { zoneId, buildingId, room: rest.replace(/\s+/g, ' ').trim() };
}
