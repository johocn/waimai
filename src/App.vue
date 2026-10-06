<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { useTenantStore } from './stores/tenant';
import { useAuthStore } from './stores/auth';
import { openTenantGate } from './api/client';

onLaunch(async () => {
    // 品牌色运行时注入（一处换肤）
    // #ifdef H5
    const brand = (import.meta.env.VITE_BRAND_COLOR as string) || '#ff6600';
    document.documentElement.style.setProperty('--brand', brand);
    // #endif
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
}
page { background: #f5f5f5; }
/* 暗色主题（utils/theme.ts 切换 html.dark-html）：页面与 overscroll 区域不露白 */
html.dark-html { background: #161618; }
html.dark-html page { background: #161618; }
</style>
