// 履约时间线映射（设计 spec §5.4）
//
// 枚举校准（campus-delivery-plugin 实测，与计划文档初稿 PENDING/ASSIGNED 大写不同）：
// - hallStatus（大厅/派单态，小写）：open（进大厅等骑手）/ grabbed（已被抢/派）/ no_rider_final（终态无骑手，留人工）
// - deliveryStatus（骑手配送推进，小写，delivery-plugin 定义）：assigned（已指派未取货）→ in_progress（已取货配送中）→ delivered（已送达）/ exception
// 后端无独立交接点事件（leg1Status 仅 R2 快递单用），R1 交接节点以 deliveryStatus=in_progress 近似。

export interface TimelineNode { key: string; label: string; done: boolean }

/** deliveryStatus → 进度档位：0 大厅无骑手 / 1 已指派 / 2 已取货 / 3 已送达 */
function deliveryProgress(deliveryStatus: string | null): number {
    switch ((deliveryStatus ?? '').toLowerCase()) {
        case 'assigned': return 1;
        case 'in_progress': return 2;
        case 'delivered': return 3;
        default: return 0;
    }
}

/** R3 单段四节点；R1 接力五节点（校门口交接点插入）；R2 快递段三节点（leg1Status 驱动）；其余路线回退单段 */
export function buildTimeline(route: string | null, hallStatus: string | null, deliveryStatus: string | null, leg1Status?: string | null): TimelineNode[] {
    const p = deliveryProgress(deliveryStatus);
    // 预约单（plan 3.1）：已支付未放量，到点前 30min 自动进入调度——首节点替换为预约提示
    if ((hallStatus ?? '').toLowerCase() === 'scheduled') {
        return [
            { key: 'scheduled', label: '预约单 · 到点前30分钟自动进入调度', done: false },
            { key: 'merchant_accept', label: '商家接单', done: false },
            ...buildTimeline(route, null, null, leg1Status).slice(1).filter(n => n.key !== 'merchant_accept'),
        ];
    }
    if (route === 'R1') {
        return [
            { key: 'merchant_accept', label: '商家接单', done: true },
            { key: 'to_gate', label: '商家自送 · 已到校门口交接点', done: p >= 2 },
            { key: 'handover', label: '接力取货完成（拍照确认）', done: p >= 2 },
            { key: 'upstairs', label: '第二程 · 配送上楼', done: p >= 3 },
            { key: 'delivered', label: '已送达', done: p >= 3 },
        ];
    }
    if (route === 'R2') {
        const arrived = (leg1Status ?? '') === 'arrived_gate';
        return [
            { key: 'merchant_accept', label: '商家接单', done: true },
            { key: 'express_shipping', label: '快递配送中', done: arrived },
            { key: 'arrived_gate', label: '快递已到校内代收点', done: arrived },
        ];
    }
    return [
        { key: 'merchant_accept', label: '商家接单', done: true },
        { key: 'pickup', label: '传信者取餐', done: p >= 2 },
        { key: 'delivering', label: '配送中', done: p >= 3 },
        { key: 'delivered', label: '已送达', done: p >= 3 },
    ];
}

/** 是否已到「无骑手」终态（前端停轮询 + 人工介入提示） */
export function isNoRiderFinal(hallStatus: string | null): boolean {
    return (hallStatus ?? '').toLowerCase() === 'no_rider_final';
}
