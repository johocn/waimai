import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

const LOGIN_EVENT = 'auth:login';
const LOGOUT_EVENT = 'auth:logout';

export const useAuthStore = defineStore('auth', () => {
    const token = ref('');
    const userId = ref('');
    const userInfo = ref<any>(null);
    const inviteCode = ref('');

    // 「已登录」= 显式登录令牌 + 后端返回的客户 id 都存在。
    // 匿名会话 token（vendure_session_token）不算登录态；token 残留但无 userId 也不可信。
    const isLoggedIn = computed(() => !!token.value && !!userId.value);

    function setAuth(newToken: string, newUserId: string) {
        token.value = newToken;
        userId.value = newUserId;
        uni.setStorageSync('auth_token', newToken);
        uni.setStorageSync('auth_userId', newUserId);
        uni.$emit(LOGIN_EVENT);
    }

    function setInviteCode(code: string) {
        if (!code) return;
        inviteCode.value = code;
        uni.setStorageSync('auth_inviteCode', code);
    }

    function restoreSession() {
        token.value = uni.getStorageSync('auth_token') || '';
        userId.value = uni.getStorageSync('auth_userId') || '';
        inviteCode.value = uni.getStorageSync('auth_inviteCode') || '';
    }

    function logout() {
        token.value = '';
        userId.value = '';
        userInfo.value = null;
        inviteCode.value = '';
        uni.removeStorageSync('auth_token');
        uni.removeStorageSync('auth_userId');
        uni.removeStorageSync('auth_inviteCode');
        uni.removeStorageSync('auth_openid');
        // 会话令牌同样属于登录态：不清会让后续请求继续以「已登录会话」运行，
        // 匿名会话被续签后又会被误判成已登录（见 api/client.ts customFetch）。
        uni.removeStorageSync('vendure_session_token');
        uni.$emit(LOGOUT_EVENT);
    }

    function setUserInfo(info: any) {
        userInfo.value = info;
    }

    function onLogin(callback: () => void) {
        uni.$on(LOGIN_EVENT, callback);
        return () => uni.$off(LOGIN_EVENT, callback);
    }

    function onLogout(callback: () => void) {
        uni.$on(LOGOUT_EVENT, callback);
        return () => uni.$off(LOGOUT_EVENT, callback);
    }

    function requireLogin(redirect?: string): boolean {
        if (isLoggedIn.value) return true;
        const url = redirect
            ? '/pages/login/index?redirect=' + encodeURIComponent(redirect)
            : '/pages/login/index';
        uni.navigateTo({ url });
        return false;
    }

    return { token, userId, userInfo, inviteCode, isLoggedIn, setAuth, setInviteCode, restoreSession, logout, setUserInfo, onLogin, onLogout, requireLogin };
});
