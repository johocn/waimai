/**
 * 多人拼单：纯前端会话（本机存储）+ 链接携带清单。
 * - 邀请链接：group-order?g=<base64>  → 受邀方看到店铺与已合并清单；
 * - 回传链接：group-order?pick=<base64> → 发起方看到好友清单并一键合并加购。
 * 无服务端房间状态：链接可转发多人，各自回传。
 */
export interface GroupItem {
    variantId: string;
    name: string;
    image?: string;
    /** 分 */
    price: number;
    qty: number;
    /** 谁点的（昵称） */
    from: string;
}

export interface GroupSession {
    id: string;
    host: string;
    /** 店铺 channelToken */
    token: string;
    channelId?: string;
    shop: string;
    routes: string;
    items: GroupItem[];
    participants: string[];
    createdAt: number;
    closed?: boolean;
}

export interface GroupInvite {
    id: string;
    host: string;
    token: string;
    cid?: string;
    shop: string;
    routes: string;
    ts: number;
    items: GroupItem[];
}

export interface GroupPick {
    gid: string;
    from: string;
    token: string;
    shop: string;
    items: GroupItem[];
}

const SESSION_KEY = 'group_order_sessions';
const ACTIVE_KEY = 'group_order_active';
const SESSION_MAX = 5;

/* ── 本地存储 ───────────────────────────────────────────── */
function readJSON<T>(key: string, fallback: T): T {
    try {
        const raw: any = uni.getStorageSync(key);
        if (!raw) return fallback;
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return obj ?? fallback;
    } catch {
        return fallback;
    }
}

function writeJSON(key: string, value: any): void {
    try {
        uni.setStorageSync(key, JSON.stringify(value));
    } catch {
        /* 存储不可用时静默 */
    }
}

export function readSessions(): GroupSession[] {
    const list = readJSON<GroupSession[]>(SESSION_KEY, []);
    return Array.isArray(list) ? list.filter((s) => s && s.id && s.token) : [];
}

export function writeSessions(list: GroupSession[]): void {
    writeJSON(SESSION_KEY, list.slice(0, SESSION_MAX));
}

export function activeSessionId(): string {
    try {
        return String(uni.getStorageSync(ACTIVE_KEY) || '');
    } catch {
        return '';
    }
}

export function setActiveSessionId(id: string): void {
    try {
        uni.setStorageSync(ACTIVE_KEY, id);
    } catch {
        /* 忽略 */
    }
}

/** 新会话（id 10 位随机，够用且链接短） */
export function createSession(input: {
    token: string;
    channelId?: string;
    shop: string;
    routes: string;
    host?: string;
}): GroupSession {
    let host = String(input.host || '');
    if (!host) {
        try {
            const raw: any = uni.getStorageSync('user_nickname');
            host = typeof raw === 'string' ? raw : '';
        } catch {
            host = '';
        }
    }
    return {
        id: Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4),
        host: host || '我',
        token: input.token,
        channelId: input.channelId,
        shop: input.shop,
        routes: input.routes || '',
        items: [],
        participants: [],
        createdAt: Date.now(),
    };
}

/** 同店铺进行中的会话（拼单以店铺为单位） */
export function findOpenSession(token: string): GroupSession | undefined {
    return readSessions().find((s) => s.token === token && !s.closed);
}

/** 写入/更新会话；新的排在最前 */
export function upsertSession(session: GroupSession): GroupSession[] {
    const list = readSessions().filter((s) => s.id !== session.id);
    const next = [session, ...list].slice(0, SESSION_MAX);
    writeSessions(next);
    setActiveSessionId(session.id);
    return next;
}

export function removeSession(id: string): GroupSession[] {
    const next = readSessions().filter((s) => s.id !== id);
    writeSessions(next);
    if (activeSessionId() === id) setActiveSessionId('');
    return next;
}

export function sessionOf(id: string): GroupSession | undefined {
    return readSessions().find((s) => s.id === id);
}

/* ── 合并 ───────────────────────────────────────────────── */
/** 同规格累加数量；不同则追加 */
export function mergeItems(base: GroupItem[], add: GroupItem[]): GroupItem[] {
    const out = base.map((x) => ({ ...x }));
    for (const it of add) {
        const hit = out.find((x) => String(x.variantId) === String(it.variantId));
        if (hit) {
            hit.qty += Number(it.qty) || 1;
        } else {
            out.push({ ...it, qty: Number(it.qty) || 1 });
        }
    }
    return out;
}

/** 订单行 → 拼单项（用于购物车/回传） */
export function itemsFromLines(lines: any[], from: string): GroupItem[] {
    return (lines ?? []).map((l: any) => {
        const v = l?.productVariant ?? {};
        const qty = Math.max(1, Number(l?.quantity) || 1);
        const unit = Number(l?.unitPriceWithTax ?? v?.priceWithTax ?? 0);
        const opts = (v?.options ?? []).map((o: any) => o?.name).filter(Boolean);
        return {
            variantId: String(v.id ?? ''),
            name: String(v.name || '') + (opts.length ? ` (${opts.join('/')})` : ''),
            image: v.featuredAsset?.preview || l?.featuredAsset?.preview,
            price: Math.round(Number.isFinite(unit) ? unit : Number(l?.linePriceWithTax || 0) / qty),
            qty,
            from,
        };
    }).filter((x) => !!x.variantId);
}

export function totalQty(items: GroupItem[]): number {
    return items.reduce((s, x) => s + (Number(x.qty) || 0), 0);
}

export function totalFen(items: GroupItem[]): number {
    return items.reduce((s, x) => s + (Number(x.qty) || 0) * (Number(x.price) || 0), 0);
}

export function participantsOf(items: GroupItem[]): string[] {
    const out: string[] = [];
    for (const it of items) {
        const f = String(it.from || '');
        if (f && !out.includes(f)) out.push(f);
    }
    return out;
}

/* ── base64url（unicode 安全，H5 可用） ──────────────────── */
function toBase64(str: string): string {
    try {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        bytes.forEach((b) => { bin += String.fromCharCode(b); });
        return btoa(bin);
    } catch {
        try {
            return btoa(unescape(encodeURIComponent(str)));
        } catch {
            return '';
        }
    }
}

function fromBase64(b64: string): string {
    try {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    } catch {
        try {
            return decodeURIComponent(escape(atob(b64)));
        } catch {
            return '';
        }
    }
}

function encode(obj: any): string {
    const b64 = toBase64(JSON.stringify(obj));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(raw: string): any {
    const norm = String(raw || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = norm.length % 4 ? '='.repeat(4 - (norm.length % 4)) : '';
    const json = fromBase64(norm + pad);
    if (!json) return null;
    try {
        return JSON.parse(json);
    } catch {
        return null;
    }
}

export function encodeInvite(session: GroupSession): string {
    const payload: GroupInvite = {
        id: session.id,
        host: session.host,
        token: session.token,
        cid: session.channelId,
        shop: session.shop,
        routes: session.routes,
        ts: session.createdAt,
        items: session.items,
    };
    return encode(payload);
}

export function decodeInvite(raw: string): GroupInvite | null {
    const obj = decode(raw);
    if (!obj || !obj.id || !obj.token) return null;
    return {
        id: String(obj.id),
        host: String(obj.host || '好友'),
        token: String(obj.token),
        cid: obj.cid ? String(obj.cid) : undefined,
        shop: String(obj.shop || ''),
        routes: String(obj.routes || ''),
        ts: Number(obj.ts) || 0,
        items: Array.isArray(obj.items) ? obj.items : [],
    };
}

export function encodePick(pick: GroupPick): string {
    return encode(pick);
}

export function decodePick(raw: string): GroupPick | null {
    const obj = decode(raw);
    if (!obj || !obj.token || !Array.isArray(obj.items)) return null;
    return {
        gid: String(obj.gid || ''),
        from: String(obj.from || '好友'),
        token: String(obj.token),
        shop: String(obj.shop || ''),
        items: obj.items.map((it: any) => ({
            variantId: String(it?.v ?? it?.variantId ?? ''),
            name: String(it?.n ?? it?.name ?? ''),
            image: it?.img || it?.image || undefined,
            price: Number(it?.p ?? it?.price ?? 0) || 0,
            qty: Math.max(1, Number(it?.q ?? it?.qty ?? 1) || 1),
            from: String(obj.from || '好友'),
        })).filter((x: GroupItem) => !!x.variantId),
    };
}

/** 回传链接尽量短：字段缩写 + 去掉无用图片 */
export function encodePickShort(pick: GroupPick): string {
    return encode({
        gid: pick.gid,
        from: pick.from,
        token: pick.token,
        shop: pick.shop,
        items: pick.items.map((it) => ({ v: it.variantId, n: it.name, q: it.qty, p: it.price })),
    });
}

/** 站内分享路径（配合 sharePage 转绝对地址） */
export function invitePath(encoded: string): string {
    return `/pkg-order/pages/group-order?g=${encoded}`;
}

export function pickPath(encoded: string): string {
    return `/pkg-order/pages/group-order?pick=${encoded}`;
}
