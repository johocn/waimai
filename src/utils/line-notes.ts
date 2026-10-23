/**
 * 单品备注：后端 OrderLineCustomFields 无 note 字段，备注存本机，
 * 结算时合并进整单备注（order.customFields.note，商家工作台/小票可见）。
 * 以 channelToken + variantId 为键：改数量/换行 id 不丢备注。
 */
const KEY = 'cart_line_notes';
/** 单条上限（含标点前），避免整单备注被挤爆 */
export const LINE_NOTE_MAX = 20;

type StoreNotes = Record<string, Record<string, string>>;

function readAll(): StoreNotes {
    try {
        const raw: any = uni.getStorageSync(KEY);
        if (!raw) return {};
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return obj && typeof obj === 'object' ? obj : {};
    } catch {
        return {};
    }
}

function writeAll(map: StoreNotes): void {
    try {
        uni.setStorageSync(KEY, JSON.stringify(map));
    } catch {
        /* 忽略 */
    }
}

export function readLineNotes(token: string): Record<string, string> {
    const all = readAll();
    return { ...(all[token] || {}) };
}

export function setLineNote(token: string, variantId: string, text: string): Record<string, string> {
    const all = readAll();
    const store = { ...(all[token] || {}) };
    const val = String(text || '').trim().slice(0, LINE_NOTE_MAX);
    if (!val) delete store[variantId];
    else store[variantId] = val;
    all[token] = store;
    writeAll(all);
    return { ...store };
}

export function clearLineNote(token: string, variantId: string): Record<string, string> {
    return setLineNote(token, variantId, '');
}

/** 清掉已不在购物车的备注，避免越积越多 */
export function pruneLineNotes(token: string, variantIds: string[]): Record<string, string> {
    const keep = new Set((variantIds || []).map(String));
    const all = readAll();
    const store = all[token] || {};
    const next: Record<string, string> = {};
    for (const [vid, note] of Object.entries(store)) {
        if (keep.has(String(vid))) next[vid] = note;
    }
    all[token] = next;
    writeAll(all);
    return { ...next };
}

export function clearStoreNotes(token: string): void {
    const all = readAll();
    if (all[token]) {
        delete all[token];
        writeAll(all);
    }
}

export interface LineNoteView { variantId: string; name: string; note: string; qty: number }

/** 购物车/结算页展示用：只返回有备注的行 */
export function lineNoteViews(token: string, lines: any[]): LineNoteView[] {
    const store = readLineNotes(token);
    const out: LineNoteView[] = [];
    for (const l of lines ?? []) {
        const vid = String(l?.productVariant?.id ?? '');
        const note = store[vid];
        if (!vid || !note) continue;
        out.push({
            variantId: vid,
            name: String(l?.productVariant?.name || ''),
            note,
            qty: Math.max(1, Number(l?.quantity) || 1),
        });
    }
    return out;
}

/** 合并段：`宫保鸡丁：少辣`（名称过长截断，避免占满整单备注） */
export function lineNoteSegments(views: LineNoteView[]): string[] {
    return views.map((v) => `${v.name.slice(0, 8)}${v.qty > 1 ? '×' + v.qty : ''}：${v.note}`);
}

/**
 * 拼装整单备注：保留用户原文，单品备注追加在后；超过 200 字时先截掉单品段。
 */
export function composeNote(baseParts: string[], lineSegs: string[], max = 200): string {
    const base = baseParts.filter(Boolean).join('；').slice(0, max);
    const segs = (lineSegs ?? []).filter(Boolean);
    if (!segs.length) return base;
    const head = '餐品备注：';
    let room = max - base.length - (base ? 1 : 0) - head.length;
    if (room <= 0) return base;
    const kept: string[] = [];
    for (const s of segs) {
        const need = s.length + (kept.length ? 1 : 0);
        if (need > room) break;
        kept.push(s);
        room -= need;
    }
    if (!kept.length) return base;
    const tail = head + kept.join('；');
    return [base, tail].filter(Boolean).join('；').slice(0, max);
}
