/**
 * 明亮/黑暗双主题（方案 A「橙头」）：暗色下头部/搜索框保持品牌橙不换肤，
 * 仅页面背景、卡片、文字、标签、tabBar 跟随主题。
 * 状态为模块级单例 + localStorage 持久化；首页 onMounted 调 initTheme() 同步 html 类与 tabBar 样式。
 */
import { ref } from 'vue';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'waimai_theme';

export const theme = ref<ThemeMode>(
    uni.getStorageSync(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
);

const TABBAR_STYLE: Record<ThemeMode, Parameters<typeof uni.setTabBarStyle>[0]> = {
    light: { color: '#999999', selectedColor: '#ff6600', backgroundColor: '#ffffff', borderStyle: 'black' },
    dark: { color: '#9a9aa3', selectedColor: '#ff6600', backgroundColor: '#202024', borderStyle: 'black' },
};

function syncH5(mode: ThemeMode) {
    // #ifdef H5
    document.documentElement.classList.toggle('dark-html', mode === 'dark');
    // #endif
}

function syncNavBar(mode: ThemeMode) {
    // 原生导航栏跟随主题（custom 导航栏页面不受影响）；小程序过早调用失败静默，由页面 onMounted initTheme 兜底
    uni.setNavigationBarColor({
        frontColor: mode === 'dark' ? '#ffffff' : '#000000',
        backgroundColor: mode === 'dark' ? '#161618' : '#ffffff',
        fail: () => {},
    });
}

function syncTabBar(mode: ThemeMode) {
    uni.setTabBarStyle({ ...TABBAR_STYLE[mode], fail: () => {} });
}

/** 页面挂载时按持久化主题同步全局外观（刷新/直达页面也能恢复暗色） */
export function initTheme() {
    syncH5(theme.value);
    syncNavBar(theme.value);
    syncTabBar(theme.value);
}

/** 切换主题：翻转 + 持久化 + 同步 html 类与 tabBar 样式 */
export function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
    uni.setStorageSync(STORAGE_KEY, theme.value);
    syncH5(theme.value);
    syncNavBar(theme.value);
    syncTabBar(theme.value);
}
