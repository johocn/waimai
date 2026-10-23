/**
 * 打烊店铺「开门提醒我」：本机订阅，进入首页/收藏时对比营业时间，
 * 已开门的店铺弹一次性横幅（点「知道了」取消关注）。
 */
import { getStoreStatus } from './store-status';

export interface WatchEntry {
    token: string;
    channelId?: string;
    name: string;
    businessHours?: string;
    addedAt: number;
    notifiedAt?: number;
}

const KEY = 'store_open_watch';
const MAX = 30;

function readAll(): WatchEntry[] {
    try {
        const raw: any = uni.getStorageSync(KEY);
        if (!raw) return [];
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(obj) ? obj.filter((x: any) => x && x.token) : [];
    } catch {
        return [];
    }
}

function writeAll(list: WatchEntry[]): void {
    try {
        uni.setStorageSync(KEY, JSON.stringify(list.slice(0, MAX)));
    } catch {
        /* 忽略 */
    }
}

export function readWatched(): WatchEntry[] {
    return readAll();
}

export function isWatched(token: string): boolean {
    return readAll().some((x) => String(x.token) === String(token));
}

export function watchStore(entry: Omit<WatchEntry, 'addedAt'>): WatchEntry[] {
    const list = readAll().filter((x) => String(x.token) !== String(entry.token));
    list.unshift({ ...entry, addedAt: Date.now() });
    writeAll(list);
    return list;
}

export function unwatchStore(token: string): WatchEntry[] {
    const list = readAll().filter((x) => String(x.token) !== String(token));
    writeAll(list);
    return list;
}

export function clearWatched(): void {
    writeAll([]);
}

export interface OpenedStore {
    token: string;
    channelId?: string;
    name: string;
    logo?: string;
    routes?: string;
    businessHours?: string;
    nextOpenHM?: string;
}

/**
 * 关注的店铺中「现在已开门」的列表。
 * 店铺列表存在时用最新名称/时间覆盖本机快照；不存在时退回快照（离线也能判断）。
 */
export function openedWatched(stores: any[], now: Date = new Date()): OpenedStore[] {
    const list = readAll();
    if (!list.length) return [];
    const byToken = new Map<string, any>();
    for (const s of stores ?? []) if (s?.channelToken) byToken.set(String(s.channelToken), s);
    const out: OpenedStore[] = [];
    for (const w of list) {
        const fresh = byToken.get(String(w.token));
        const hours = fresh?.businessHours ?? w.businessHours;
        const st = getStoreStatus(hours, now);
        if (st.state === 'closed') continue;
        out.push({
            token: String(w.token),
            channelId: fresh?.channelId != null ? String(fresh.channelId) : w.channelId,
            name: String(fresh?.name || w.name || ''),
            logo: fresh?.logo,
            routes: (fresh?.routesEnabled || []).join(','),
            businessHours: hours,
            nextOpenHM: st.nextOpenHM,
        });
    }
    return out;
}
