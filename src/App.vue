<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { useTenantStore } from './stores/tenant';
import { useAuthStore } from './stores/auth';
import { openTenantGate } from './api/client';
import { initTheme } from './utils/theme';

onLaunch(async () => {
    // 品牌色运行时注入（一处换肤）
    // #ifdef H5
    const brand = (import.meta.env.VITE_BRAND_COLOR as string) || '#ff6600';
    document.documentElement.style.setProperty('--brand', brand);
    // #endif
    initTheme();   // 按持久化主题同步 html.dark-html 与 tabBar（任意直达页面都生效，不依赖首页挂载）
    useAuthStore().restoreSession();   // 恢复登录态（纯同步读 storage，须在页面 onShow 前）
    const tenant = useTenantStore();
    try {
        await tenant.initTenant();
    } finally {
        openTenantGate();
    }
});
</script>
<style>
:root {
    --brand: #ff6600;
    --brand-soft: #fff3e6;
    --text: #1a1a1a;
    --text-secondary: #666666;
    --text-muted: #999999;
    --bg: #f5f5f5;
    --surface: #ffffff;
    --border: #eeeeee;
}
page { background: #f5f5f5; }
/* 暗色主题（utils/theme.ts 切换 html.dark-html）：页面与 overscroll 区域不露白，
   中性色令牌翻转（uni.scss 各 $ 变量经 var() 引用，全站组件自动跟随）；
   品牌橙头部/按钮保持品牌色不换肤 */
html.dark-html { background: #161618; }
html.dark-html page { background: var(--bg, #161618); }
html.dark-html {
    --text: #ececec;
    --text-secondary: #b8b8bf;
    --text-muted: #9a9aa3;
    --bg: #161618;
    --surface: #202024;
    --border: #2c2c30;
}
</style>
