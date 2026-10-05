import { describe, expect, it } from 'vitest';
import { filterStores } from '../src/utils/store-filter';

// 计划文档 fixture 校准：原「CBS/ZJ 拼音匹配」用例与实现（店名包含、不分大小写）矛盾，
// 以英文店名 KFC 验证大小写不敏感语义（spec §12.2 拼音不要求）。
const stores = [
    { name: '张记麻辣香锅', tags: ['米饭快餐', '夜宵'] },
    { name: '茶百道·校园店', tags: ['奶茶甜品'] },
    { name: '兰州拉面', tags: [] },
    { name: 'KFC 校园店', tags: ['米饭快餐'] },
];

describe('filterStores', () => {
    it('关键词不区分大小写过滤店名', () => {
        expect(filterStores(stores, '茶百')).toHaveLength(1);
        expect(filterStores(stores, 'kfc')).toHaveLength(1);
        expect(filterStores(stores, 'KFC')).toHaveLength(1);
        expect(filterStores(stores, '香锅')).toHaveLength(1);
        expect(filterStores(stores, '不存在')).toHaveLength(0);
    });
    it('tag 匹配：点「奶茶甜品」只出茶百道', () => {
        expect(filterStores(stores, '', '奶茶甜品')).toHaveLength(1);
    });
    it('「全部」或未配置 tag 的店铺归入全部', () => {
        expect(filterStores(stores, '', '')).toHaveLength(4);
        expect(filterStores(stores, '', '米饭快餐')).toHaveLength(2);
        expect(filterStores(stores, '', '全部')).toHaveLength(4);
    });
    it('搜索优先于分类（同时给按时搜索生效）', () => {
        expect(filterStores(stores, '茶百', '米饭快餐')).toHaveLength(1);
        expect(filterStores(stores, '茶百', '奶茶甜品')).toHaveLength(1);
    });
});
