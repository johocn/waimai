/**
 * 校园配送二期纯函数：R2 接力子卡状态文案 + R5 发单 payload 构建校验。
 * 金额一律分。
 */

export interface R2RelayLike {
    state?: string | null;
    hallStatus?: string | null;
    deliveryStatus?: string | null;
}

/** R2 原单「接力单状态」子卡文案（动态反查结果 → 展示态） */
export function relayStatusLabel(relay: R2RelayLike | null | undefined): string {
    if (!relay) return '';
    if (relay.state === 'Cancelled' || relay.hallStatus === 'no_rider_final') {
        return '接力单已退款，快递仍在代收点，可选择自取或再次发单';
    }
    if (relay.deliveryStatus === 'delivered') return '传信者已送达';
    if (relay.deliveryStatus) return '传信者配送中';
    if (relay.hallStatus === 'grabbed') return '传信者已接单';
    if (relay.hallStatus === 'open') return '平台调度中，正在加急派单';
    return '接力单准备中';
}

/** 后端 CampusErrandInput 形状（errandFrom/buildingId/note 可选） */
export interface ErrandPayload {
    kind: string;
    fromText: string;
    toText: string;
    tip: number;
    errandFrom?: string;
    buildingId?: string;
    note?: string;
}

export function buildErrandPayload(input: {
    kind: string; fromText: string; toText: string; tip: number;
    errandFrom?: string; buildingId?: string; note?: string;
}): ErrandPayload | null {
    const kind = (input.kind || '').trim();
    const fromText = (input.fromText || '').trim();
    const toText = (input.toText || '').trim();
    if (!kind || !fromText || !toText) return null;
    const tip = Number(input.tip);
    if (!Number.isFinite(tip) || tip < 0) return null;
    const payload: ErrandPayload = { kind, fromText, toText, tip: Math.floor(tip) };
    const errandFrom = (input.errandFrom || '').trim();
    if (errandFrom) payload.errandFrom = errandFrom;
    const buildingId = (input.buildingId || '').trim();
    if (buildingId) payload.buildingId = buildingId;
    const note = (input.note || '').trim();
    if (note) payload.note = note;
    return payload;
}

/** 小费滑杆档位（分）：0/100/200/300/500/800 */
export const TIP_STEPS = [0, 100, 200, 300, 500, 800];

/** R5 服务类型选项（值与后端 errandKind 约定一致） */
export const ERRAND_KINDS = [
    { value: 'pickup_express', label: '代取快递' },
    { value: 'bring_food', label: '带饭' },
    { value: 'buy', label: '帮买' },
    { value: 'other', label: '其他' },
];

/** checkout 路线组动态化：routesEnabled 过滤出 checkout 可选路线（R1/R2/R3，保序） */
export function filterCampusRoutes(routes: string[] | null | undefined): string[] {
    return (routes ?? []).filter(r => r === 'R1' || r === 'R2' || r === 'R3');
}

/** R2→R5 发单页预填解析（URL：?from=R2&code=原单号&a=A点&b=B点&buildingId=楼栋） */
export function parseRelayPrefill(q: Record<string, string | undefined> = {}): {
    relayFrom: string; fromText: string; toText: string; buildingId: string;
} {
    const decode = (v?: string) => { if (!v) return ''; try { return decodeURIComponent(v); } catch { return v; } };
    // uni-app 各端对 onLoad options 的解码时机不一：已解码串再 decode 会抛 URIError（如含 % 的文案），须兜底原样返回
    if (q.from !== 'R2') return { relayFrom: '', fromText: '', toText: '', buildingId: '' };
    return {
        relayFrom: q.code ?? '',
        fromText: decode(q.a) || '校内代收点',
        toText: decode(q.b),
        buildingId: q.buildingId ?? '',
    };
}
