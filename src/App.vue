<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { useTenantStore } from './stores/tenant';
import { openTenantGate } from './api/client';

onLaunch(async () => {
    // 品牌色运行时注入（一处换肤）
    // #ifdef H5
    const brand = (import.meta.env.VITE_BRAND_COLOR as string) || '#ff6600';
    document.documentElement.style.setProperty('--brand', brand);
    // #endif
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
</style>
