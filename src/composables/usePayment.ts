import { wxRequestPayment, redirectPayment, getPlatform } from "../utils/platform";

export type PaymentMethod = "wechatpay" | "alipay" | "cod" | "balance-pay" | "aggregate-pay";

/**
 * 公众号 JSAPI 支付：通过 WeixinJSBridge 调起微信收银台。
 * 仅在微信内置浏览器中可用；未注入 bridge 时等待 WeixinJSBridgeReady（3s 超时兜底）。
 * err_msg: get_brand_wcpay_request:ok / :cancel / :fail
 */
function jsapiPay(m: { appId?: string; timeStamp?: string; nonceStr?: string; package?: string; signType?: string; paySign?: string }): Promise<PaymentResult> {
    return new Promise((resolve) => {
        let settled = false;
        const done = (r: PaymentResult) => { if (!settled) { settled = true; resolve(r); } };
        const invoke = () => {
            const bridge = (window as any).WeixinJSBridge;
            if (!bridge) { done({ success: false, message: "请在微信中打开完成支付" }); return; }
            bridge.invoke("getBrandWCPayRequest", {
                appId: m.appId,
                timeStamp: m.timeStamp,
                nonceStr: m.nonceStr,
                package: m.package,
                signType: m.signType || "RSA",
                paySign: m.paySign,
            }, (res: any) => {
                const msg = String(res?.err_msg || "");
                if (msg === "get_brand_wcpay_request:ok") {
                    done({ success: true });
                } else if (msg === "get_brand_wcpay_request:cancel") {
                    done({ success: false, message: "已取消支付" });
                } else {
                    done({ success: false, message: "支付失败" + (msg ? `: ${msg}` : "") });
                }
            });
        };
        if (typeof window !== "undefined" && (window as any).WeixinJSBridge) {
            invoke();
        } else if (typeof document !== "undefined") {
            document.addEventListener("WeixinJSBridgeReady", invoke, { once: true });
            setTimeout(() => {
                if (!(window as any).WeixinJSBridge) done({ success: false, message: "请在微信中打开完成支付" });
            }, 3000);
        } else {
            done({ success: false, message: "请在微信中打开完成支付" });
        }
    });
}

export interface PaymentResult {
    success: boolean;
    message?: string;
    orderCode?: string;
}

/**
 * Handle payment based on method and response from server.
 * - wechatpay: JSAPI in mini-program, H5 redirect in browser, Dev Bypass redirect in dev
 * - alipay: redirect to payment URL
 * - cod: immediate success
 * - balance-pay: immediate success (deducted server-side)
 */
export async function handlePayment(
    method: PaymentMethod,
    paymentData: any,
): Promise<PaymentResult> {
    const platform = getPlatform();

    switch (method) {
        case "wechatpay":
            if (platform === "mp-weixin") {
                // WeChat JSAPI payment in mini-program: 后端返回完整签名参数
                // Shop API 的 Payment.metadata 只暴露 metadata.public 字段
                try {
                    const m = paymentData.metadata?.public || paymentData.metadata || paymentData;
                    await wxRequestPayment({
                        timeStamp: m.timeStamp,
                        nonceStr: m.nonceStr,
                        package: m.package,
                        signType: m.signType,
                        paySign: m.paySign,
                    });
                    return { success: true, orderCode: paymentData.orderCode };
                } catch (e: any) {
                    return { success: false, message: e.errMsg || "支付取消" };
                }
            } else if (platform === "h5") {
                const pub = paymentData.metadata?.public || paymentData.metadata || {};
                // 公众号 JSAPI：后端返回完整签名参数，须用 WeixinJSBridge 调起收银台
                if (pub.payType === "jsapi") {
                    return await jsapiPay(pub);
                }
                // Dev Bypass 返回相对 URL /wechatpay/dev-pay?orderCode=xxx
                // 生产 H5（tradeType=H5）返回完整 h5_url
                // Shop API 的 Payment.metadata 只暴露 metadata.public 字段
                const rawUrl =
                    paymentData.h5Url ||
                    pub.h5Url ||
                    pub.payUrl ||
                    paymentData.payUrl;
                if (rawUrl) {
                    const baseUrl = import.meta.env.VITE_API_URL || (import.meta.env.BASE_URL ? window.location.origin : '');   // H5 同源动态 origin（勿硬编码域名）
                    const fullUrl = rawUrl.startsWith('http')
                        ? rawUrl
                        : `${baseUrl}${rawUrl}`;
                    redirectPayment(fullUrl);
                    return { success: true, message: "请在微信中完成支付" };
                }
                return { success: false, message: "未获取到支付链接" };
            } else {
                // APP - native WeChat SDK
                // #ifdef APP-PLUS
                return new Promise((resolve) => {
                    uni.requestPayment({
                        provider: "wxpay",
                        orderInfo: paymentData,
                        success: () => resolve({ success: true, orderCode: paymentData.orderCode }),
                        fail: (err: any) => resolve({ success: false, message: err.errMsg }),
                    });
                });
                // #endif
                return { success: false, message: "不支持的支付方式" };
            }

        case "alipay":
            if (paymentData.payUrl || paymentData.metadata?.payUrl) {
                redirectPayment(paymentData.payUrl || paymentData.metadata.payUrl);
                return { success: true, message: "请在支付宝中完成支付" };
            }
            // #ifdef APP-PLUS
            return new Promise((resolve) => {
                uni.requestPayment({
                    provider: "alipay",
                    orderInfo: paymentData.orderString || paymentData.metadata?.orderString,
                    success: () => resolve({ success: true, orderCode: paymentData.orderCode }),
                    fail: (err: any) => resolve({ success: false, message: err.errMsg }),
                });
            });
            // #endif
            return { success: false, message: "支付宝支付参数缺失" };

        case "cod":
            return { success: true, message: "货到付款，请在收货时支付" };

        case "aggregate-pay":
            return { success: true, message: "已扫码聚合收款码，请确认到账后发货" };

        case "balance-pay":
            return { success: true, message: "余额支付成功" };

        default:
            return { success: false, message: "未知支付方式: " + method };
    }
}
