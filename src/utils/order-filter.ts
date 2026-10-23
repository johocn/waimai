/**
 * 订单列表筛选（第 39 轮）：时间范围 + 店铺（渠道 token）。
 * 纯函数：只产出查询参数与展示判定，不读写页面状态。
 */
export type OrderRange = 'all' | '7d' | '30d' | '90d';

export const ORDER_RANGE_DAYS: Record<OrderRange, number | null> = {
    all: null,
    '7d': 7,
    '30d': 30,
    '90d': 90,
};

export function isOrderRange(v: unknown): v is OrderRange {
    return v === 'all' || v === '7d' || v === '30d' || v === '90d';
}

/**
 * 时间范围起点（ISO 字符串）；`all` / 非法值返回 null。
 * now 传 Date 或毫秒时间戳，便于单测注入固定时刻。
 */
export function orderSinceISO(range: unknown, now: Date | number = Date.now()): string | null {
    const key = isOrderRange(range) ? range : 'all';
    const days = ORDER_RANGE_DAYS[key];
    if (!days) return null;
    const base = now instanceof Date ? now.getTime() : Number(now);
    if (!Number.isFinite(base)) return null;
    return new Date(base - days * 86400000).toISOString();
}

/** 筛选是否生效：非「全部」时间范围，或选了具体店铺 */
export function orderFilterActive(range: unknown, storeToken: unknown): boolean {
    return (isOrderRange(range) && range !== 'all') || !!String(storeToken ?? '').trim();
}

/** 筛选生效项数（用于筛选按钮角标，0~2） */
export function orderFilterCount(range: unknown, storeToken: unknown): number {
    const a = isOrderRange(range) && range !== 'all' ? 1 : 0;
    const b = String(storeToken ?? '').trim() ? 1 : 0;
    return a + b;
}

/** 合并订单查询 filter：state 与 createdAt 均为可选项，二者都空时返回 null（不传 filter） */
export function buildOrderFilter(opts: {
    states?: string[] | null;
    range?: unknown;
    now?: Date | number;
}): Record<string, any> | null {
    const filter: Record<string, any> = {};
    const states = (opts.states ?? []).filter(Boolean);
    if (states.length === 1) filter.state = { eq: states[0] };
    else if (states.length > 1) filter.state = { in: states };
    const since = orderSinceISO(opts.range, opts.now);
    if (since) filter.createdAt = { after: since };
    return Object.keys(filter).length ? filter : null;
}
