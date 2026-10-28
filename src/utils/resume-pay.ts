import { getChannelClient } from '../api/client';
import { ORDER_FRAGMENT } from '../api/fragments';
import { setActiveOrder } from '../api/mutations/checkout';
import { handlePayment, type PaymentMethod } from '../composables/usePayment';

/** 待付款订单续付结果：blocked=当前购物车有未结算商品，已拦截 */
export type ResumePayStatus = 'success' | 'pending' | 'fail' | 'blocked';

export interface ResumePayOrder {
    id: string;
    code: string;
    /** 订单所属渠道 token（订单列表按渠道聚合而来；缺省退回站点渠道） */
    channelToken?: string;
    totalWithTax?: number;
}

export interface ResumePayResult {
    status: ResumePayStatus;
    code?: string;
    /** 失败原因（优先后端返回的 message） */
    message?: string;
    /** blocked：当前购物车商品件数 */
    cartCount?: number;
    cartCode?: string;
}

/** 可提交支付的订单状态（Created/AddingItems 为未进入结算的购物车，同样允许） */
const PAYABLE_STATES = new Set(['Created', 'AddingItems', 'ArrangingPayment']);

interface PayMethodInfo {
    id: string;
    code: string;
    name: string;
    isEligible: boolean;
    eligibilityMessage?: string | null;
}

/**
 * 待付款订单续付：切换活跃订单 → 选支付方式 → 提交支付 →（JSAPI）拉起收银台 → 轮询结算。
 *
 * 关键约束：Vendure 同一 session 每个渠道只有一个 activeOrder，
 * 若当前活跃购物车还有商品，直接 setActiveOrder 会让用户已选商品「消失」——
 * 此时返回 blocked，由页面提示先结算或清空购物车。
 */
export async function resumePay(order: ResumePayOrder): Promise<ResumePayResult> {
    const code = order?.code;
    if (!order?.id || !code) return { status: 'fail' };
    // 订单可能来自店铺渠道：所有调用固定在该渠道（与列表 myOrders 查询同源）
    const client = getChannelClient(order.channelToken || '');

    try {
        // 1. 活跃订单冲突检查：活跃购物车非空且不是本单 → 拦截
        const activeRes: any = await client.request(`${ORDER_FRAGMENT}
            query ActiveOrder { activeOrder { ...OrderDetail } }`);
        const active = activeRes?.activeOrder;
        if (active && String(active.id) !== String(order.id) && (active.lines?.length ?? 0) > 0) {
            return { status: 'blocked', cartCount: active.totalQuantity ?? active.lines.length, cartCode: active.code };
        }

        // 2. 切换活跃订单，拿到本单最新状态与支付参数
        const setRes: any = await setActiveOrder(order.id, client);
        const target = setRes?.campusResumePaymentOrder;
        if (!target?.id) return { status: 'fail', code };
        if (target?.state === 'PaymentSettled') return { status: 'success', code };
        if (!PAYABLE_STATES.has(String(target?.state ?? ''))) {
            return { status: 'fail', message: '', code };
        }

        // 3. 选支付方式：H5 优先本站公众号 JSAPI 方式，其次小程序 wechatpay，最后取第一个可用
        const pmRes: any = await client.request('query { eligiblePaymentMethods { id name code isEligible eligibilityMessage } }');
        const methods: PayMethodInfo[] = pmRes?.eligiblePaymentMethods ?? [];
        const eligible = methods.filter((m) => m.isEligible);
        const method = eligible.find((m) => m.code === 'wechatpay-yourbao-h5')
            || eligible.find((m) => m.code === 'wechatpay')
            || eligible[0];
        if (!method) return { status: 'fail', message: '', code };
        // 平台适配层只认 wechatpay 等基础 code（wechatpay-yourbao-h5 等渠道专属 PM 需归一）
        const handlerMethod = (method.code.startsWith('wechatpay') ? 'wechatpay' : method.code) as PaymentMethod;

        // 4. 提交支付（wechatpay JSAPI 需 openid）
        const metadata: Record<string, any> = {};
        if (method.code.startsWith('wechatpay')) {
            const openid = uni.getStorageSync('auth_openid');
            if (openid) metadata.openid = openid;
        }
        const payRes: any = await client.request(`${ORDER_FRAGMENT}
            mutation Pay($input: PaymentInput!) { addPaymentToOrder(input: $input) { ... on Order { ...OrderDetail } ... on ErrorResult { errorCode message } } }`, { input: { method: method.code, metadata } });
        const paid = payRes?.addPaymentToOrder;
        if (paid?.errorCode) return { status: 'fail', message: paid.message, code };

        const payments: any[] = paid?.payments ?? [];
        const lastPayment = payments[payments.length - 1];
        const pub = lastPayment?.metadata?.public || lastPayment?.metadata || {};

        // 5. JSAPI：PaymentAuthorized ≠ 已支付，须拉起收银台，结算靠微信异步回调
        if (paid?.state === 'PaymentAuthorized' && pub.payType === 'jsapi') {
            const result = await handlePayment(handlerMethod, {
                ...lastPayment,
                orderCode: paid?.code ?? code,
                orderState: paid?.state,
            });
            if (!result.success) {
                // 用户取消/失败：取消该笔 payment，让订单回到可支付状态（失败不阻断）
                try { await client.request(`mutation CancelPay($paymentId: ID!) { cancelPayment(paymentId: $paymentId) { ... on Order { id state } ... on ErrorResult { errorCode message } } }`, { paymentId: lastPayment?.id }); } catch (e) { console.warn('[resume-pay] cancelPayment failed', e); }
                return { status: 'fail', message: result.message, code };
            }
            const settled = await pollOrderSettled(client, paid?.code ?? code);
            return { status: settled ? 'success' : 'pending', code: paid?.code ?? code };
        }
        if (paid?.state === 'PaymentSettled' || paid?.state === 'PaymentAuthorized') {
            return { status: 'success', code: paid?.code ?? code };
        }
        // 其他方式（H5 跳转 / 货到付款 / 余额）：交给平台适配层，成功即视为已发起
        const r = await handlePayment(handlerMethod, {
            ...lastPayment,
            orderCode: paid?.code ?? code,
            orderState: paid?.state,
        });
        return r.success ? { status: 'success', code: paid?.code ?? code } : { status: 'fail', message: r.message, code };
    } catch (e: any) {
        return { status: 'fail', message: e?.response?.errors?.[0]?.message || e?.message, code };
    }
}

/** 轮询订单是否已结算（微信异步回调有延迟：2 次 × 1.5s） */
async function pollOrderSettled(client: any, code: string): Promise<boolean> {
    for (let i = 0; i < 2; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
            const res: any = await client.request(`${ORDER_FRAGMENT}
                query OrderByCode($code: String!) { orderByCode(code: $code) { ...OrderDetail } }`, { code });
            if (res?.orderByCode?.state === 'PaymentSettled') return true;
        } catch (e) { console.warn('[resume-pay] poll order failed', e); }
    }
    return false;
}
