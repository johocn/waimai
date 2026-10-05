/** 订单卡履约徽标：校园配送单（R1/R3）按 deliveryStatus 映射，其余返回空串走订单 state 文案 */
export function fulfillmentBadge(fulfillmentRoute: string | null, deliveryStatus: string | null): string {
    const route = (fulfillmentRoute ?? '').toUpperCase();
    if (route !== 'R1' && route !== 'R3') return '';
    switch ((deliveryStatus ?? '').toLowerCase()) {
        case 'assigned': return '待取货';
        case 'in_progress': return '配送中';
        case 'delivered': return '已送达';
        default: return '';
    }
}
