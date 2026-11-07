import { describe, it, expect } from 'vitest';
import { CART_FRAGMENT, ORDER_FRAGMENT } from '../src/api/fragments';

/**
 * 结算页的打包费/加料费预估需要与后端落账同口径：
 * - 打包费按商品覆盖 waimaiPackingFee（含显式 0）逐行算；
 * - 已落账的 campus-packing-fee / campus-addon-fee 从 surcharges 读取。
 * CART_FRAGMENT 会覆盖 cart.order（改券/加购等操作），缺字段会让预估口径退化。
 */
describe('CART_FRAGMENT 与 ORDER_FRAGMENT 口径一致', () => {
    it('打包费覆盖字段 waimaiPackingFee 必须存在', () => {
        expect(CART_FRAGMENT).toContain('waimaiPackingFee');
        expect(ORDER_FRAGMENT).toContain('waimaiPackingFee');
    });
    it('surcharges（已落账打包费/加料费）必须存在', () => {
        expect(CART_FRAGMENT).toContain('surcharges');
        expect(ORDER_FRAGMENT).toContain('surcharges');
    });
    it('加料费引用与商品配置字段必须存在', () => {
        expect(CART_FRAGMENT).toContain('waimaiAddons');
        expect(CART_FRAGMENT).toContain('waimaiAddonGroups');
    });
});
