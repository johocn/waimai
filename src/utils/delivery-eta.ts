/**
 * 预计送达时间（ETA）：纯函数，菜单页与结算页共用。
 *
 * 口径：预计送达 = 当前时间 + 店铺配送时长（deliveryMinutes），按 5 分钟向上取整；
 * 展示为固定宽度区间（默认 10 分钟），避免「精确到分钟」的假精度。
 * 打烊时返回下一次开门后的送达时段；无营业时间配置时按营业中处理（与 store-status 一致）。
 */
import { getStoreStatus } from './store-status';

/** 店铺未配置 deliveryMinutes 时的兜底时长（分钟） */
export const DEFAULT_DELIVERY_MIN = 30;
/** 送达区间宽度（分钟） */
export const ETA_WINDOW_MIN = 10;
/** ETA 取整粒度（分钟） */
export const ETA_ROUND_MIN = 5;

export type EtaState = 'asap' | 'closed';

export interface EtaInput {
    now?: Date;
    /** 店铺配送时长（分钟），来自 waimaiStoreList.deliveryMinutes */
    deliveryMinutes?: number | null;
    /** 营业时间文本，如 "10:00-22:00"（支持多时段/跨零点，解析见 store-status） */
    businessHours?: string | null;
    /** 送达区间宽度（分钟），默认 ETA_WINDOW_MIN */
    windowMin?: number;
}

export interface EtaResult {
    state: EtaState;
    /** 预计总时长（分钟，含配送时长；打烊时为开门后配送时长） */
    minutes: number;
    /** 起点（距当日 00:00 的分钟数，>=1440 表示次日） */
    startMin: number;
    /** 终点（同上） */
    endMin: number;
    /** 起点 "HH:mm" */
    startHM: string;
    /** 终点 "HH:mm" */
    endHM: string;
    /** 是否跨天（次日送达） */
    nextDay: boolean;
    /** 打烊时下一次开门 "HH:mm"；营业中为空串 */
    nextOpenHM: string;
    /** 打烊时下一次开门距离今天的天数（0=今天，1=明天）；营业中为 null */
    nextOpenDayOffset: number | null;
}

function toHM(min: number): string {
    const m = ((min % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function normalizeMinutes(n: unknown): number {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return DEFAULT_DELIVERY_MIN;
    return Math.max(1, Math.round(v));
}

function roundUp(min: number, step: number): number {
    if (step <= 1) return Math.round(min);
    return Math.ceil(min / step) * step;
}

/** 计算 ETA 区间（不会抛错；缺数据按默认值兜底） */
export function etaRange(input: EtaInput = {}): EtaResult {
    const now = input.now ?? new Date();
    const minutes = normalizeMinutes(input.deliveryMinutes);
    const windowMin = Math.max(0, Math.round(Number(input.windowMin ?? ETA_WINDOW_MIN)) || 0);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const status = getStoreStatus(input.businessHours, now);

    let base: number;
    let nextOpenHM = '';
    let nextOpenDayOffset: number | null = null;
    if (status.state === 'closed') {
        const [h, m] = String(status.nextOpenHM || '10:00').split(':');
        const openMin = Number(h) * 60 + Number(m);
        const offset = status.nextOpenDayOffset ?? 0;
        base = offset * 1440 + openMin + minutes;
        nextOpenHM = status.nextOpenHM;
        nextOpenDayOffset = offset;
    } else {
        base = nowMin + minutes;
    }

    const startMin = roundUp(base, ETA_ROUND_MIN);
    const endMin = startMin + windowMin;
    return {
        state: status.state === 'closed' ? 'closed' : 'asap',
        minutes,
        startMin,
        endMin,
        startHM: toHM(startMin),
        endHM: toHM(endMin),
        nextDay: startMin >= 1440,
        nextOpenHM,
        nextOpenDayOffset,
    };
}

/** 送达时段文本，如 "12:20–12:35"（端点跨天时不额外标注，由调用方加「次日」） */
export function etaClockText(r: EtaResult | null | undefined): string {
    if (!r) return '';
    return `${r.startHM}–${r.endHM}`;
}
