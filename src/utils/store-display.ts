/** 店铺显示名：后端 waimaiStoreList 取 channel.code 作名，默认渠道 code 为
 * '__default_channel__'（vendure 内建占位），显示兜底为「平台」。 */
export function storeDisplayName(name: string | null | undefined): string {
    return !name || name === '__default_channel__' ? '平台' : name;
}

/** 商品描述纯文本化：vendure description 含 <p>/<img> 等富文本标签，列表场景仅取纯文本 */
export function plainDescription(html: string | null | undefined): string {
    return (html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * 配送路线语义（campus-delivery-plugin）：
 * R1=商家自送至校门口+校内骑手接力；R2=快递到校代取；R3=档口直送·骑手上楼；R4=到店自取；R5=跑腿代取。
 */
const ROUTE_LABELS: Record<string, string> = {
    R1: '商家自送 + 校内骑手接力',
    R2: '快递到校代取',
    R3: '档口直送 · 校内骑手上楼',
    R4: '到店自取',
    R5: '跑腿代取',
};
const ROUTE_PRIORITY = ['R1', 'R3', 'R2', 'R4', 'R5'];

function knownRoutes(routes: string[] | null | undefined): string[] {
    if (!routes?.length) return [];
    return ROUTE_PRIORITY.filter(r => routes.includes(r));
}

/** 店铺卡主文案：按优先级取主路线，多条时追加「等N种方式」 */
export function routeText(routes: string[] | null | undefined): string {
    const known = knownRoutes(routes);
    if (!known.length) return '暂未开通配送';
    const primary = ROUTE_LABELS[known[0]];
    return known.length > 1 ? `${primary} 等${known.length}种方式` : primary;
}

/** 店铺页/商家页全量路线文案列表（按优先级排序） */
export function routeDetail(routes: string[] | null | undefined): string[] {
    return knownRoutes(routes).map(r => ROUTE_LABELS[r]);
}
