/**
 * 点餐日程（用餐计划）：纯本机存储的周期点餐安排（无后端改动）。
 * 每条计划 = 店铺 + 商品行 + 餐段时段 + 重复星期（1=周一 … 7=周日）；
 * 送达时段前 30 分钟起在首页/日程页提醒，一键带入购物车（不自动下单扣款）。
 */

const KEY = 'meal_plan';
export const PLAN_MAX = 20;
export const REMIND_BEFORE_MIN = 30;

export type MealSlot = 'lunch' | 'dinner';
export const SLOT_KEYS: MealSlot[] = ['lunch', 'dinner'];
export const SLOT_DEFAULT: Record<MealSlot, string> = { lunch: '11:00', dinner: '17:30' };

export interface MealPlanLine {
    variantId: string;
    name: string;
    qty: number;
    price?: number;
    image?: string;
}

export interface MealPlanItem {
    id: string;
    enabled: boolean;
    slot: MealSlot;
    /** 送达时段 HH:mm（餐段默认 11:00 / 17:30，可自定义） */
    time: string;
    /** 重复星期：1=周一 … 7=周日 */
    days: number[];
    storeToken: string;
    storeName: string;
    routes?: string;
    lines: MealPlanLine[];
    createdAt: number;
}

/** JS getDay()（0=周日）→ ISO 星期（1=周一 … 7=周日） */
export function isoWeekday(d: Date): number {
    const x = d.getDay();
    return x === 0 ? 7 : x;
}

function validHM(v: any): string | null {
    const s = String(v ?? '');
    const m = /^(\d{2}):(\d{2})$/.exec(s);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h <= 23 && min <= 59 ? s : null;
}

function normalizeLines(raw: any): MealPlanLine[] {
    if (!Array.isArray(raw)) return [];
    const out: MealPlanLine[] = [];
    for (const l of raw) {
        if (!l?.variantId || !l?.name) continue;
        out.push({
            variantId: String(l.variantId),
            name: String(l.name),
            qty: Math.max(1, Math.min(20, Math.round(Number(l.qty) || 1))),
            price: l.price != null && Number.isFinite(Number(l.price)) ? Number(l.price) : undefined,
            image: l.image ? String(l.image) : undefined,
        });
    }
    return out.slice(0, 20);
}

export function normalizePlan(raw: any): MealPlanItem | null {
    if (!raw?.storeToken || !raw?.storeName) return null;
    const slot: MealSlot = SLOT_KEYS.includes(raw.slot) ? raw.slot : 'lunch';
    const days = Array.isArray(raw.days)
        ? Array.from(new Set(raw.days.map((n: any) => Math.round(Number(n))).filter(n => n >= 1 && n <= 7))).sort()
        : [];
    const lines = normalizeLines(raw.lines);
    if (!days.length || !lines.length) return null;
    return {
        id: String(raw.id || ''),
        enabled: raw.enabled !== false,
        slot,
        time: validHM(raw.time) || SLOT_DEFAULT[slot],
        days,
        storeToken: String(raw.storeToken),
        storeName: String(raw.storeName),
        routes: raw.routes ? String(raw.routes) : undefined,
        lines,
        createdAt: Number(raw.createdAt) || 0,
    };
}

export function readMealPlans(): MealPlanItem[] {
    try {
        const raw: any = uni.getStorageSync(KEY);
        const list = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
        if (!Array.isArray(list)) return [];
        return list
            .map(normalizePlan)
            .filter((p): p is MealPlanItem => !!p)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, PLAN_MAX);
    } catch {
        return [];
    }
}

export function writeMealPlans(list: MealPlanItem[]): MealPlanItem[] {
    const next = list.slice(0, PLAN_MAX);
    try {
        uni.setStorageSync(KEY, JSON.stringify(next));
    } catch {
        /* 忽略存储异常 */
    }
    return next;
}

export function upsertPlan(plan: MealPlanItem): MealPlanItem[] {
    const list = readMealPlans();
    const id = plan.id || `mp${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const item = { ...plan, id, createdAt: plan.createdAt || Date.now() };
    const idx = list.findIndex(p => p.id === id);
    const next = idx >= 0 ? list.map(p => (p.id === id ? item : p)) : [item, ...list];
    return writeMealPlans(next);
}

export function removePlanById(id: string): MealPlanItem[] {
    return writeMealPlans(readMealPlans().filter(p => p.id !== id));
}

export function setPlanEnabled(id: string, enabled: boolean): MealPlanItem[] {
    return writeMealPlans(readMealPlans().map(p => (p.id === id ? { ...p, enabled } : p)));
}

/** 计划是否命中某天（不看 enabled，启停由 UI 控制） */
export function planHits(plan: MealPlanItem, d: Date): boolean {
    return plan.days.includes(isoWeekday(d));
}

/** 计划在 d 当天的执行时刻 */
export function planTimeOn(plan: MealPlanItem, d: Date): Date | null {
    if (!planHits(plan, d)) return null;
    const [h, m] = plan.time.split(':').map(Number);
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
    return Number.isFinite(t.getTime()) ? t : null;
}

/** 下一顿：启用中的计划在 8 天内最近的执行时刻（8 天保证周期计划当日已过点也能找到下一次） */
export function nextOccurrence(plans: MealPlanItem[], now: Date = new Date()): { plan: MealPlanItem; at: Date } | null {
    let best: { plan: MealPlanItem; at: Date } | null = null;
    for (const plan of plans) {
        if (!plan.enabled) continue;
        for (let off = 0; off < 8; off++) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off);
            const t = planTimeOn(plan, d);
            if (!t || t.getTime() < now.getTime() - 60_000) continue;
            if (!best || t.getTime() < best.at.getTime()) best = { plan, at: t };
            break;
        }
    }
    return best;
}

/** 即将到点：送达时段前 30 分钟起至时段后 30 分钟内（提醒 + 一键带入窗口） */
export function imminentPlans(plans: MealPlanItem[], now: Date = new Date()): { plan: MealPlanItem; at: Date }[] {
    const win = REMIND_BEFORE_MIN * 60_000;
    const out: { plan: MealPlanItem; at: Date }[] = [];
    for (const plan of plans) {
        if (!plan.enabled) continue;
        const t = planTimeOn(plan, now);
        if (!t) continue;
        const diff = t.getTime() - now.getTime();
        if (diff <= win && diff >= -win) out.push({ plan, at: t });
    }
    return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** 一周内启用计划的总顿数（周视图统计角标） */
export function weekPlanCount(plans: MealPlanItem[], weekStartMon: Date): number {
    let n = 0;
    for (let off = 0; off < 7; off++) {
        const d = new Date(weekStartMon.getFullYear(), weekStartMon.getMonth(), weekStartMon.getDate() + off);
        for (const p of plans) if (p.enabled && planHits(p, d)) n++;
    }
    return n;
}

/** 重复规则文案（文案由页面注入，保持本文件纯净可测） */
export function repeatLabel(days: number[], L: { everyDay: string; workday: string; dayNames: string[] }): string {
    const set = new Set(days);
    if (set.size === 7) return L.everyDay;
    if (set.size === 5 && [1, 2, 3, 4, 5].every(d => set.has(d))) return L.workday;
    return days.slice().sort().map(d => L.dayNames[d - 1] ?? '').filter(Boolean).join('·');
}

/** 简易金额展示：分为单位的整数 → 「xx.x」元文本（无价不显示） */
export function fenText(price?: number): string {
    if (price == null || !Number.isFinite(Number(price)) || Number(price) <= 0) return '';
    const y = Number(price) / 100;
    return y % 1 === 0 ? String(y) : y.toFixed(2).replace(/0$/, '');
}
