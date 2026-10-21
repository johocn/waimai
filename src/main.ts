import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useLocaleStore } from './stores/locale';

// #ifdef H5
// 腾讯地图 Key 注入：uni-app H5 的 <map> 在挂载时读取 window.__uniConfig.qqMapKey，
// 因此可用构建期环境变量注入，避免在代码/仓库中硬编码 Key（需在腾讯位置服务配域名白名单）。
const qqMapKey = (import.meta as any).env?.VITE_QQMAP_KEY as string | undefined;
if (qqMapKey) {
    const w = window as any;
    const cfg = w.__uniConfig ?? (w.__uniConfig = {});
    cfg.qqMapKey = qqMapKey;
    cfg.sdkConfigs = {
        ...(cfg.sdkConfigs || {}),
        maps: { ...((cfg.sdkConfigs || {}).maps || {}), qqmap: { key: qqMapKey } },
    };
}
// #endif

export function createApp() {
    const app = createSSRApp(App);
    app.use(createPinia());
    // F11 i18n：全局 $t（模板直接用）+ 启动校验 locale（uni.setLocale 同步导航栏等内置文案）
    const localeStore = useLocaleStore();
    app.config.globalProperties.$t = (key: string) => localeStore.t(key);
    try { localeStore.ensure(); } catch { /* 非 H5 端 uni API 异常不阻断启动 */ }
    return { app };
}
