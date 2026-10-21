// #ifdef H5
import { ensureWxReady, isWechatBrowser } from './wechat';
// #endif

export interface SharePayload {
    /** 分享标题（微信卡片标题 / 剪贴板场景仅作提示） */
    title: string;
    /** 分享描述（微信卡片副标题） */
    desc?: string;
    /** 站内路由（如 /pages/shop/menu?token=...），自动转绝对地址 */
    path: string;
    /** 分享缩略图（微信卡片） */
    image?: string;
}

/** 站内路由 → 当前站点绝对地址（hash 路由，兼容部署在子路径） */
export function absoluteUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    if (typeof location === 'undefined') return path;
    const base = location.origin + location.pathname.replace(/index\.html?$/i, '');
    return `${base}#/${path.replace(/^\//, '')}`;
}

/**
 * 分享：微信内调用 JS-SDK 设置卡片，其它环境复制链接兜底。
 * 返回实际生效的渠道，便于调用方按需提示。
 */
export async function sharePage(payload: SharePayload): Promise<'wechat' | 'copy'> {
    const link = absoluteUrl(payload.path);
    // #ifdef H5
    if (isWechatBrowser()) {
        try {
            await ensureWxReady();
            const wx = (window as any).wx;
            const data = {
                title: payload.title,
                desc: payload.desc || '',
                link,
                imgUrl: payload.image || '',
                success: () => {},
                fail: () => {},
            };
            wx?.updateAppMessageShareData?.(data);
            wx?.onMenuShareAppMessage?.(data);
            wx?.updateTimelineShareData?.({ title: payload.title, link, imgUrl: data.imgUrl, success: () => {}, fail: () => {} });
            wx?.onMenuShareTimeline?.({ title: payload.title, link, imgUrl: data.imgUrl, success: () => {}, fail: () => {} });
            return 'wechat';
        } catch {
            // 签名不可用（非公众号域名等）→ 走复制链接
        }
    }
    // #endif
    await new Promise<void>((resolve) => {
        uni.setClipboardData({ data: link, success: () => resolve(), fail: () => resolve() });
    });
    return 'copy';
}
