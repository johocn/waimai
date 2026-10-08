import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useLocaleStore } from './stores/locale';

export function createApp() {
    const app = createSSRApp(App);
    app.use(createPinia());
    // F11 i18n：全局 $t（模板直接用）+ 启动校验 locale（uni.setLocale 同步导航栏等内置文案）
    const localeStore = useLocaleStore();
    app.config.globalProperties.$t = (key: string) => localeStore.t(key);
    try { localeStore.ensure(); } catch { /* 非 H5 端 uni API 异常不阻断启动 */ }
    return { app };
}
