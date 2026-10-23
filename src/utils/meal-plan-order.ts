/**
 * 点餐日程 → 一键带入购物车：逐行跨店加购（固定 vendure-token 指向计划店铺渠道）。
 * 与收藏页「一键加购」同一副作用链路（addItemToOrderInChannel + cart store），
 * 提醒后由用户手动触发，不自动下单扣款。
 */
import { addItemToOrderInChannel } from '../api/mutations/cart';
import { useCartStore } from '../stores/cart';
import type { MealPlanItem } from './meal-plan';

/** 成功返回 true；失败 toast 由本函数统一处理 */
export async function addPlanToCart(plan: MealPlanItem, t: (k: string) => string): Promise<boolean> {
  try {
    uni.showLoading({ title: t('mealPlan.adding'), mask: true });
    let last: any = null;
    for (const line of plan.lines) {
      const res: any = await addItemToOrderInChannel(plan.storeToken, line.variantId, line.qty);
      if (!res?.addItemToOrder?.id) throw new Error(res?.addItemToOrder?.message || 'fail');
      last = res.addItemToOrder;
    }
    if (last) useCartStore().setOrder(last);
    uni.hideLoading();
    uni.showToast({ title: t('mealPlan.addCartOk'), icon: 'success' });
    return true;
  } catch {
    uni.hideLoading();
    uni.showToast({ title: t('mealPlan.addCartFail'), icon: 'none' });
    return false;
  }
}
