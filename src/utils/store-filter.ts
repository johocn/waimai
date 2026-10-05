export interface StoreLike { name: string; tags: string[] }

/** spec §12.2：搜索（店名包含、不分大小写）优先于分类 pills；未配置 tag 的店铺归入「全部」 */
export function filterStores(list: StoreLike[], keyword: string, tag: string): StoreLike[] {
    let out = list;
    const kw = keyword.trim().toLowerCase();
    if (kw) {
        out = out.filter(s => s.name.toLowerCase().includes(kw));
        return out;
    }
    if (tag && tag !== '全部') {
        out = out.filter(s => s.tags.includes(tag));
    }
    return out;
}
