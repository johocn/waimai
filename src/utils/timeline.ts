// 履约时间线映射（设计 spec §5.4）
//
// 枚举校准（campus-delivery-plugin 实测，与计划文档初稿 PENDING/ASSIGNED 大写不同）：
// - hallStatus（大厅/派单态，小写）：open（进大厅等骑手）/ grabbed（已被抢/派）/ no_rider_final（终态无骑手，留人工）
// - deliveryStatus（骑手配送推进，小写，delivery-plugin 定义）：assigned（已指派未取货）→ in_progress（已取货配送中）→ delivered（已送达）/ exception
// 后端无独立交接点事件：R1/R2 交接点以订单快照 handoverAt / 外部快递 delivered 判定。

export interface TimelineNode { key: string; label: string; done: boolean }

export interface TimelineOpts {
    /** 下单快照：merchant | owned | external_courier | campus_rider | self_pickup */
    deliveryPlan?: string | null;
    /** 外部快递进度（delivery-gateway state）：pending/accepted/pickup/delivered */
    thirdPartyState?: string | null;
    /** 第一段送达校园交接点时间（商户/自营/外部快递） */
    handoverAt?: string | null;
}

/** deliveryStatus → 进度档位：0 大厅无骑手 / 1 已指派 / 2 已取货 / 3 已送达 */
function deliveryProgress(deliveryStatus: string | null): number {
    switch ((deliveryStatus ?? '').toLowerCase()) {
        case 'assigned': return 1;
        case 'in_progress': return 2;
        case 'delivered': return 3;
        default: return 0;
    }
}

/** 外部快递进度：pending 1 / accepted 2 / pickup 3 / delivered 4 */
function thirdPartyProgress(state: string | null | undefined): number {
    switch ((state ?? '').toLowerCase()) {
        case 'pending': return 1;
        case 'accepted': return 2;
        case 'pickup': return 3;
        case 'delivered': return 4;
        default: return 0;
    }
}

/**
 * R1/R2 恒两段（先到校园交接点，再由传信者接力）；R3 一段到底，按快照 deliveryPlan 切换节点；
 * R4/R5 与传信者直送同构。deliveryStatus 只表达校园骑手（第二段）。
 */
export function buildTimeline(
    route: string | null,
    hallStatus: string | null,
    deliveryStatus: string | null,
    leg1Status?: string | null,
    opts?: TimelineOpts,
): TimelineNode[] {
    const p = deliveryProgress(deliveryStatus);
    const tp = thirdPartyProgress(opts?.thirdPartyState);
    const hs = (hallStatus ?? '').toLowerCase();
    const plan = opts?.deliveryPlan ?? '';
    // 预约单（plan 3.1）：已支付未放量，到点前 30min 自动进入调度——首节点替换为预约提示
    if (hs === 'scheduled') {
        return [
            { key: 'scheduled', label: '预约单 · 到点前30分钟自动进入调度', done: false },
            { key: 'merchant_accept', label: '商家接单', done: false },
            ...buildTimeline(route, null, null, leg1Status, opts).slice(1).filter(n => n.key !== 'merchant_accept'),
        ];
    }

    // R1 / R2：恒两段。第一段为商户/自营快递（R1）或外部快递（R2），第二段传信者
    if (route === 'R1' || route === 'R2') {
        // 第一段完成：外部快递已送达 / 已写交接时间 / 已进接力大厅或已送达
        const handed = tp >= 4 || !!opts?.handoverAt || ['open', 'grabbed', 'delivered'].includes(hs);
        const externalFirstLeg = route === 'R2' || plan === 'external_courier';
        const ownedFirstLeg = route === 'R1' && plan === 'owned';
        return [
            { key: 'merchant_accept', label: '商家接单', done: true },
            {
                key: 'leg1_dispatch',
                label: externalFirstLeg ? '外部快递接单' : ownedFirstLeg ? '自营快递接单' : '商户接单配送',
                done: externalFirstLeg ? tp >= 2 : true,
            },
            {
                key: 'leg1_arrive',
                label: externalFirstLeg ? '外部快递已送达交接点' : ownedFirstLeg ? '自营快递已送达交接点' : '商户已送达交接点',
                done: handed,
            },
            { key: 'handover', label: '传信者接力取货（拍照确认）', done: hs === 'grabbed' || p >= 2 || hs === 'delivered' },
            { key: 'upstairs', label: '第二程 · 配送上楼', done: p >= 2 || hs === 'delivered' },
            { key: 'delivered', label: '已送达', done: p >= 3 || hs === 'delivered' },
        ];
    }

    // R3：一段到底，按第一段承运方切换节点
    if (route === 'R3') {
        if (plan === 'external_courier') {
            return [
                { key: 'merchant_accept', label: '商家接单', done: true },
                { key: 'external_accept', label: '外部快递接单', done: tp >= 2 },
                { key: 'external_pickup', label: '外部快递已取餐', done: tp >= 3 },
                { key: 'delivered', label: '已送达', done: tp >= 4 || hs === 'delivered' },
            ];
        }
        if (plan === 'owned') {
            return [
                { key: 'merchant_accept', label: '商家接单', done: true },
                { key: 'owned_accept', label: '自营快递接单', done: ['owned_dispatched', 'delivered'].includes(hs) || p >= 1 },
                { key: 'delivering', label: '自营快递配送中', done: p >= 2 || hs === 'delivered' },
                { key: 'delivered', label: '已送达', done: p >= 3 || hs === 'delivered' },
            ];
        }
    }

    // R3 默认（传信者）/ R4 / R5：单段
    return [
        { key: 'merchant_accept', label: '商家接单', done: true },
        { key: 'pickup', label: '传信者取餐', done: p >= 2 },
        { key: 'delivering', label: '配送中', done: p >= 3 || hs === 'delivered' },
        { key: 'delivered', label: '已送达', done: p >= 3 || hs === 'delivered' },
    ];
}

/** 是否已到「无骑手」终态（前端停轮询 + 人工介入提示） */
export function isNoRiderFinal(hallStatus: string | null): boolean {
    return (hallStatus ?? '').toLowerCase() === 'no_rider_final';
}

/** 异常已处置完结终态（plan 3.4：赔付/发券/退单后置 exception_final，前端停轮询 + 展示处理结果） */
export function isExceptionFinal(hallStatus: string | null): boolean {
    return (hallStatus ?? '').toLowerCase() === 'exception_final';
}
