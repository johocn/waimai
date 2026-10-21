/**
 * 店铺营业状态：解析后端 businessHours 文本（如 "10:00-21:00"、"10:00–14:00, 17:00–21:00"），
 * 结合当前时间给出 营业中 / 即将打烊 / 已打烊 / 未知。纯函数，SSR 与 H5 通用。
 */
export type StoreOpenState = 'open' | 'closing' | 'closed' | 'unknown';

export interface StoreStatus {
    state: StoreOpenState;
    /** 营业中距打烊分钟数（state=open/closing 时有值） */
    closesInMin: number | null;
    /** 下一次开门：0=今天，1=明天；unknown 时为 null */
    nextOpenDayOffset: number | null;
    /** 下一次开门时间 "HH:mm" */
    nextOpenHM: string;
}

const UNKNOWN: StoreStatus = { state: 'unknown', closesInMin: null, nextOpenDayOffset: null, nextOpenHM: '' };

/** 超过该分钟数视为「即将打烊」 */
export const CLOSING_SOON_MIN = 30;

function toMinutes(hm: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h > 24 || mi > 59) return null;
    return h * 60 + mi;
}

function toHM(min: number): string {
    const m = ((min % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

interface Range { start: number; end: number }

/** 支持全角冒号、各种连接符、逗号/顿号/斜杠/分号分隔的多时段；跨零点时段结束时间 +1440 */
export function parseBusinessHours(raw?: string | null): Range[] {
    const text = String(raw ?? '')
        .replace(/[：]/g, ':')
        .replace(/[–—~～至]/g, '-')
        .replace(/[，、;；/]/g, ',');
    const out: Range[] = [];
    for (const part of text.split(',')) {
        const m = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.exec(part);
        if (!m) continue;
        const start = toMinutes(m[1]);
        let end = toMinutes(m[2]);
        if (start == null || end == null) continue;
        if (end <= start) end += 1440; // 跨零点，如 18:00-02:00
        out.push({ start, end });
    }
    return out.sort((a, b) => a.start - b.start);
}

export function getStoreStatus(raw?: string | null, now: Date = new Date()): StoreStatus {
    const ranges = parseBusinessHours(raw);
    if (!ranges.length) return UNKNOWN;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (const r of ranges) {
        // 当日窗口；跨零点窗口同时按 toNow + 1440 判断凌晨时段
        for (const offset of [0, 1440]) {
            const cur = nowMin + offset;
            if (cur >= r.start && cur < r.end) {
                const closesInMin = r.end - cur;
                return {
                    state: closesInMin <= CLOSING_SOON_MIN ? 'closing' : 'open',
                    closesInMin,
                    nextOpenDayOffset: null,
                    nextOpenHM: '',
                };
            }
        }
    }
    const next = ranges.find(r => r.start > nowMin);
    if (next) {
        return { state: 'closed', closesInMin: null, nextOpenDayOffset: 0, nextOpenHM: toHM(next.start) };
    }
    return { state: 'closed', closesInMin: null, nextOpenDayOffset: 1, nextOpenHM: toHM(ranges[0].start) };
}

/** 已打烊（含无营业时间配置时按营业处理，避免误伤） */
export function isStoreClosed(raw?: string | null, now: Date = new Date()): boolean {
    return getStoreStatus(raw, now).state === 'closed';
}
