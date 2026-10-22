/**
 * 时段推荐店铺：按当前本地时间判断早餐/午餐/下午茶/晚餐/夜宵，
 * 结合店铺标签、月售、活动与营业状态打分，供首页横滑推荐。
 * 纯函数，SSR 与 H5 通用。
 */
import { getStoreStatus } from './store-status';

export type MealSlotKey = 'breakfast' | 'lunch' | 'tea' | 'dinner' | 'night';

export interface MealSlot {
    key: MealSlotKey;
    /** 匹配的店铺标签（业务值） */
    tags: string[];
    /** 「查看全部」切到的类目（业务值） */
    filterTag: string;
    icon: string;
    /** [开始小时, 结束小时)，夜宵跨零点 */
    hours: [number, number];
}

const SLOTS: MealSlot[] = [
    { key: 'breakfast', tags: ['面食', '米饭快餐'], filterTag: '面食', icon: '🥣', hours: [6, 10] },
    { key: 'lunch', tags: ['米饭快餐', '面食'], filterTag: '米饭快餐', icon: '🍚', hours: [10, 14] },
    { key: 'tea', tags: ['奶茶甜品'], filterTag: '奶茶甜品', icon: '🧋', hours: [14, 17] },
    { key: 'dinner', tags: ['米饭快餐', '面食'], filterTag: '米饭快餐', icon: '🍱', hours: [17, 21] },
    { key: 'night', tags: ['夜宵'], filterTag: '夜宵', icon: '🌙', hours: [21, 2] },
];

/** 当前时段：06–10 早餐、10–14 午餐、14–17 下午茶、17–21 晚餐、21–02 夜宵 */
export function currentMealSlot(now: Date = new Date()): MealSlot {
    const h = now.getHours();
    if (h >= 21 || h < 2) return SLOTS[4];
    if (h < 6) return SLOTS[4];
    if (h < 10) return SLOTS[0];
    if (h < 14) return SLOTS[1];
    if (h < 17) return SLOTS[2];
    return SLOTS[3];
}

interface StoreLike {
    name?: string;
    tags?: string[];
    promoText?: string;
    monthlySales?: number;
    businessHours?: string | null;
    paused?: boolean;
}

/** 时段推荐：标签命中 > 有活动 > 月售 > 营业状态，降序取前 max 家 */
export function recommendStores<T extends StoreLike>(stores: T[] | null | undefined, slot: MealSlot, max = 4): T[] {
    if (!Array.isArray(stores)) return [];
    return stores
        .map((s) => {
            const tags = (s.tags ?? []).map(String);
            const hit = tags.some(t => slot.tags.includes(t));
            let score = hit ? 100 : 0;
            if (String(s.promoText ?? '').trim()) score += 20;
            score += (Number(s.monthlySales) || 0) / 100;
            if (getStoreStatus(s.businessHours).state === 'closed') score -= 50;
            if (s.paused) score -= 100;
            return { s, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, max)
        .map(x => x.s);
}
