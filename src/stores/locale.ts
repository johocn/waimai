import { defineStore } from 'pinia';
import { ref } from 'vue';
import zhHans from '../locale/zh-Hans.json';
import en from '../locale/en.json';

// F11 i18n 基建：移植 vshop web-admin localeStore 模式（自研 t()，无 vue-i18n 依赖）。
// waimai 当前单语产品暂不做切换 UI，但基建就绪（apply() 可切 + uni.setLocale 同步内置文案），
// 学生端文案后续批次迁入字典后统一加切换入口。语言包规范：zh-Hans / en 必须同步补充。
const STORAGE_KEY = 'wm_locale';
const SUPPORTED = ['zh-Hans', 'en'];
const DICTS: Record<string, Record<string, any>> = { 'zh-Hans': zhHans as any, en: en as any };

export const useLocaleStore = defineStore('locale', () => {
    const locale = ref<string>(load());

    function load(): string {
        let v = '';
        try {
            v = uni.getStorageSync(STORAGE_KEY) as string;
        } catch (_e) { /* ignore */ }
        return SUPPORTED.includes(v) ? v : 'zh-Hans';
    }

    function apply(localeOrNull?: string | null): void {
        const target = localeOrNull ?? locale.value;
        const next = SUPPORTED.includes(target) ? target : 'zh-Hans';
        // #ifdef H5
        try {
            // 预写 uni 框架的 locale 存储键（UNI_STORAGE_LOCALE='UNI_LOCALE'，见 uni-shared）。
            // uni.setLocale 仅在 app 创建后才写此键，而 createApp 阶段 getApp() 为空直接 return false，
            // 故必须在此裸写，保证冷加载时 initAppVm→useI18n 初始 locale 与 store 一致。
            window.localStorage.setItem('UNI_LOCALE', next);
        } catch (_e) { /* ignore */ }
        // #endif
        try {
            // 运行时切换（app 已创建）时同步 $locale 并响应式联动导航栏/TabBar；失败不阻断自研 $t
            uni.setLocale(next);
        } catch (_e) { /* ignore */ }
        try {
            uni.setStorageSync(STORAGE_KEY, next);
        } catch (_e) { /* ignore */ }
        locale.value = next;
    }

    // 启动时把 uni 框架 locale 对齐到 store 恢复值（无条件 apply，幂等）。
    // 注意：此处禁止调用 uni.getLocale —— 它会在 app 创建前提前创建 useI18n 实例，
    // 使 $locale 钉死在旧值（navigator.language），导致 UNI_LOCALE 预写失效。
    function ensure(): void {
        apply();
    }

    // 自研 translate：解析嵌套点键，当前 locale → 中文兜底 → 原文 key
    function t(key: string): string {
        const resolve = (dict?: any): string | undefined => {
            if (!dict) return undefined;
            let cur = dict;
            for (const part of key.split('.')) {
                if (cur === null || typeof cur !== 'object') return undefined;
                cur = cur[part];
                if (cur === undefined || cur === null) return undefined;
            }
            return typeof cur === 'string' ? cur : undefined;
        };
        return resolve(DICTS[locale.value]) ?? resolve(DICTS['zh-Hans']) ?? key;
    }

    return { locale, apply, ensure, t };
});
