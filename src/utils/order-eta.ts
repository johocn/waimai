/**
 * 订单预计送达：待配送/配送中订单按「下单时间 + 店铺配送时长」估算，
 * 预约单（customFields.deliverySlotText）不参与倒计时，避免与时段冲突。
 */
export interface OrderEta {
    /** 预计送达时间戳（ms） */
    etaAt: number;
    /** 距送达剩余分钟（向上取整，>0） */
    remainMin: number;
    /** 已超时分钟（向上取整，>0 表示超时） */
    overdueMin: number;
}

const IN_FLIGHT = new Set(['PaymentAuthorized', 'PaymentSettled']);

export function orderEta(order: any, deliveryMinutes?: number | null, now: number = Date.now()): OrderEta | null {
    if (!order || !IN_FLIGHT.has(String(order.state))) return null;
    const cf = order.customFields || {};
    if (cf.deliveredAt || cf.deliverySlotText) return null;
    const created = new Date(order.createdAt || 0).getTime();
    if (!created) return null;
    const minutes = Number(deliveryMinutes);
    const span = Number.isFinite(minutes) && minutes > 0 ? minutes : 40;
    const etaAt = created + span * 60000;
    const diffMin = Math.ceil((etaAt - now) / 60000);
    return diffMin > 0
        ? { etaAt, remainMin: diffMin, overdueMin: 0 }
        : { etaAt, remainMin: 0, overdueMin: Math.max(1, Math.ceil((now - etaAt) / 60000)) };
}

export function clockHM(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
