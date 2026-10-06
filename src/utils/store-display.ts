/** 店铺显示名：后端 waimaiStoreList 取 channel.code 作名，默认渠道 code 为
 * '__default_channel__'（vendure 内建占位），显示兜底为「平台」。 */
export function storeDisplayName(name: string | null | undefined): string {
    return !name || name === '__default_channel__' ? '平台' : name;
}

/** 商品描述纯文本化：vendure description 含 <p>/<img> 等富文本标签，列表场景仅取纯文本 */
export function plainDescription(html: string | null | undefined): string {
    return (html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** 配送方式文案：R1=商家自送+骑手接力，其余=档口直送；空=未开通 */
export function routeText(routes: string[] | null | undefined): string {
    if (!routes?.length) return '暂未开通配送';
    return routes.includes('R1') ? '商家自送 + 校内骑手接力' : '档口直送 · 校内骑手上楼';
}
