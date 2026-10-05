import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getAuthMethods, getSsoProviders } from '../api/queries/channel';

/**
 * waimai 精简版 tenant store（对比 vshop：去掉模板库/shopContent/五级合并，waimai 用不到）。
 * 渠道语义：站点本身挂在默认渠道；channel = 餐饮店铺（waimaiStoreList 返回 channelToken）。
 * 进店铺 = switchTenant(channelToken) 切 vendure 渠道，activeOrder 随 session+渠道隔离 = 每店独立购物车。
 */
export const useTenantStore = defineStore('tenant', () => {
    const token = ref('');
    const tenantCode = ref('default');
    const tenantReady = ref(false);
    const authMethods = ref<string[]>(['native']);
    const wechatAppId = ref('');
    const ssoProviders = ref<any[]>([]);

    function resolveTenantFromUrl(): string | null {
        // #ifdef H5
        try {
            const params = new URLSearchParams(window.location.search);
            return params.get('tenant');
        } catch {}
        // #endif
        return null;
    }

    async function initTenant() {
        // 租户来源优先级：?tenant= > storage > VITE_CHANNEL_TOKEN env 兜底。
        // waimai 单站点形态，无域名→渠道映射需求；无效 token 后端会静默落默认渠道，无需前端校验。
        const fromUrl = resolveTenantFromUrl();
        const stored = fromUrl ? null : (uni.getStorageSync('tenant_code') as string) || null;
        const code = fromUrl || stored || (import.meta.env.VITE_CHANNEL_TOKEN as string) || 'default';
        tenantCode.value = code;
        if (code && code !== 'default') {
            token.value = code;
        }
        tenantReady.value = true;
    }

    /** 进店铺：直接把渠道 token 写入请求头（menu 页传 waimaiStoreList 的 channelToken） */
    async function switchTenant(channelToken: string) {
        if (!channelToken) return false;
        token.value = channelToken;
        tenantCode.value = channelToken;
        return true;
    }

    /** 离开店铺（menu onUnload 调用）：回到站点默认渠道，orders/profile 聚合不受店铺 token 影响 */
    async function backToDefault() {
        const code = (import.meta.env.VITE_CHANNEL_TOKEN as string) || 'default';
        tenantCode.value = code;
        token.value = code === 'default' ? '' : code;
    }

    async function loadAuthMethods() {
        try {
            const res: any = await getAuthMethods();
            const data = res?.authMethods || {};
            authMethods.value = data.methods || ['native'];
            wechatAppId.value = data.wechatAppId || '';
        } catch (e) {
            authMethods.value = ['native'];
            wechatAppId.value = '';
        }
    }

    async function loadSsoProviders() {
        try {
            const res: any = await getSsoProviders();
            ssoProviders.value = res?.ssoProviders || [];
        } catch (e) {
            ssoProviders.value = [];
        }
    }

    return {
        token, tenantCode, tenantReady, authMethods, wechatAppId, ssoProviders,
        initTenant, switchTenant, backToDefault, loadAuthMethods, loadSsoProviders,
    };
});
