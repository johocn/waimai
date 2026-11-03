<template>
  <web-view v-if="url" :src="url"></web-view>
  <view v-else class="wv-empty">{{ $t('webview.invalidLink') }}</view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../stores/locale';

const locale = useLocaleStore();
const url = ref('');

const DEFAULT_ALLOWED_HOSTS = ['joho.cn', 'weixin.qq.com', 'wx.tenpay.com', 'alipay.com', 'alipayobjects.com'];

function getHost(target: string): string {
    const match = /^https:\/\/([^/?#]+)/i.exec(target);
    if (!match) return '';
    return match[1].split('@').pop()!.split(':')[0].toLowerCase();
}

function isAllowed(target: string): boolean {
    const host = getHost(target);
    if (!host) return false;
    const extra = (import.meta.env.VITE_WEBVIEW_ALLOWED_HOSTS || '')
        .split(',')
        .map((h: string) => h.trim().toLowerCase())
        .filter(Boolean);
    const allowed = [...DEFAULT_ALLOWED_HOSTS, ...extra];
    if (allowed.some(h => host === h || host.endsWith('.' + h))) return true;
    // #ifdef H5
    try {
        if (host === window.location.hostname.toLowerCase()) return true;
    } catch (e) {}
    // #endif
    return false;
}

onLoad((query: any) => {
    const target = decodeURIComponent(query?.url || '');
    if (!isAllowed(target)) {
        uni.showToast({ title: locale.t('webview.invalidLink'), icon: 'none' });
        // 仅在有上一页时返回；直接打开（无历史）保持当前页，由下方空态文案兜底，避免白屏
        if (getCurrentPages().length > 1) uni.navigateBack();
        return;
    }
    url.value = target;
});
</script>

<style scoped>
.wv-empty { padding: 160rpx 40rpx; text-align: center; font-size: 26rpx; color: $text-color-placeholder; }
</style>
