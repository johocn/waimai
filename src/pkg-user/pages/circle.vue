<template>
    <view class="cc-page">
        <view class="cc-hero">
            <view class="cc-hero__row">
                <view class="cc-hero__brand">
                    <text class="cc-hero__ico">📸</text>
                    <text class="cc-hero__title">{{ $t('circle.title') }}</text>
                </view>
                <view class="cc-hero__publish" @tap="goPublish">✍️ {{ $t('circle.publish') }}</view>
            </view>
            <text class="cc-hero__sub">{{ $t('circle.sub') }}</text>
        </view>

        <view class="cc-tabs">
            <text class="cc-tab" :class="{ on: tab === 'feed' }" @tap="switchTab('feed')">{{ $t('circle.tabFeed') }}</text>
            <text class="cc-tab" :class="{ on: tab === 'mine' }" @tap="switchTab('mine')">{{ $t('circle.tabMine') }}</text>
        </view>

        <view v-if="tab === 'mine' && !auth.isLoggedIn" class="cc-guest">
            <text class="cc-guest__ico">🔐</text>
            <text class="cc-guest__txt">{{ $t('circle.needLogin') }}</text>
            <button class="cc-guest__btn" @tap="goLogin">{{ $t('circle.login') }}</button>
        </view>

        <view v-else-if="loading && !posts.length" class="cc-tip">{{ $t('circle.loading') }}</view>

        <view v-else-if="!posts.length" class="cc-empty">
            <text class="cc-empty__ico">🫧</text>
            <text class="cc-empty__txt">{{ tab === 'mine' ? $t('circle.mineEmpty') : $t('circle.empty') }}</text>
            <button class="cc-empty__btn" @tap="goPublish">{{ $t('circle.publishFirst') }}</button>
        </view>

        <view v-for="p in posts" :key="p.id" class="cc-card">
            <view class="cc-card__head">
                <view class="cc-avatar">{{ (p.nickname || '?').slice(0, 1) }}</view>
                <view class="cc-card__who">
                    <text class="cc-card__name">{{ p.nickname || $t('circle.anonymous') }}</text>
                    <text class="cc-card__time">{{ timeText(p.createdAt) }}</text>
                </view>
                <text v-if="p.isPinned" class="cc-card__pin">{{ $t('circle.pinned') }}</text>
            </view>
            <text v-if="p.title" class="cc-card__title">{{ p.title }}</text>
            <text class="cc-card__content">{{ p.content }}</text>
            <view v-if="p.images && p.images.length" class="cc-card__imgs" :class="'n' + Math.min(3, p.images.length)">
                <image
                    v-for="(img, i) in p.images.slice(0, 3)" :key="i" class="cc-card__img"
                    :src="img" mode="aspectFill" @tap="preview(p.images, i)"
                />
            </view>
            <view class="cc-card__acts">
                <view class="cc-act" :class="{ on: p.viewerLiked }" @tap.stop="toggleLike(p)">
                    <text class="cc-act__ico">{{ p.viewerLiked ? '❤️' : '🤍' }}</text>
                    <text class="cc-act__num">{{ p.likeCount || 0 }}</text>
                </view>
                <view class="cc-act" :class="{ on: p.viewerFavorited }" @tap.stop="toggleFav(p)">
                    <text class="cc-act__ico">{{ p.viewerFavorited ? '⭐' : '☆' }}</text>
                    <text class="cc-act__num">{{ p.favoriteCount || 0 }}</text>
                </view>
            </view>
        </view>

        <view v-if="hasMore && !loading && posts.length" class="cc-more" @tap="loadMore">{{ $t('circle.loadMore') }}</view>
        <view v-if="loading && posts.length" class="cc-tip">{{ $t('circle.loading') }}</view>
        <view class="cc-note">{{ $t('circle.note') }}</view>
    </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getCircleFeed, getMyCirclePosts, toggleCircleFavorite, toggleCircleLike, type CirclePost } from '../../api/queries/circle';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();

const tab = ref<'feed' | 'mine'>('feed');
const posts = ref<CirclePost[]>([]);
const loading = ref(false);
const hasMore = ref(false);
const total = ref(0);
const PAGE_SIZE = 10;

function timeText(iso: string) {
    const t = new Date(iso).getTime();
    if (!t) return '';
    const diff = Date.now() - t;
    if (diff < 60 * 1000) return locale.t('circle.justNow');
    if (diff < 3600 * 1000) return locale.t('circle.minutesAgo').replace('{n}', String(Math.floor(diff / 60000)));
    if (diff < 86400 * 1000) return locale.t('circle.hoursAgo').replace('{n}', String(Math.floor(diff / 3600000)));
    if (diff < 7 * 86400 * 1000) return locale.t('circle.daysAgo').replace('{n}', String(Math.floor(diff / 86400000)));
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

async function fetchPage(skip: number) {
    const res = tab.value === 'mine'
        ? await getMyCirclePosts({ skip, take: PAGE_SIZE })
        : await getCircleFeed({ skip, take: PAGE_SIZE });
    total.value = Number(res.totalItems || 0);
    if (skip === 0) posts.value = res.items || [];
    else posts.value = posts.value.concat(res.items || []);
    hasMore.value = posts.value.length < total.value;
}

async function load(reset = true) {
    if (loading.value) return;
    if (tab.value === 'mine' && !auth.isLoggedIn) {
        posts.value = [];
        loading.value = false;
        return;
    }
    loading.value = true;
    try {
        await fetchPage(reset ? 0 : posts.value.length);
    } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('circle.loadFail'), icon: 'none' });
    } finally {
        loading.value = false;
    }
}

function loadMore() {
    if (!hasMore.value) return;
    void load(false);
}

function switchTab(next: 'feed' | 'mine') {
    if (tab.value === next) return;
    tab.value = next;
    posts.value = [];
    total.value = 0;
    hasMore.value = false;
    void load();
}

function goLogin() {
    auth.requireLogin('/pkg-user/pages/circle');
}

function goPublish() {
    if (!auth.isLoggedIn) {
        auth.requireLogin('/pkg-user/pages/circle-publish');
        return;
    }
    uni.navigateTo({ url: '/pkg-user/pages/circle-publish' });
}

function preview(urls: string[], idx: number) {
    uni.previewImage({ current: idx, urls });
}

async function toggleLike(p: CirclePost) {
    if (!auth.isLoggedIn) { auth.requireLogin('/pkg-user/pages/circle'); return; }
    try {
        const r = await toggleCircleLike(p.id);
        p.viewerLiked = r.liked;
        p.likeCount = r.likeCount;
        p.viewerFavorited = r.favorited;
        p.favoriteCount = r.favoriteCount;
    } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('circle.opFail'), icon: 'none' });
    }
}

async function toggleFav(p: CirclePost) {
    if (!auth.isLoggedIn) { auth.requireLogin('/pkg-user/pages/circle'); return; }
    try {
        const r = await toggleCircleFavorite(p.id);
        p.viewerLiked = r.liked;
        p.likeCount = r.likeCount;
        p.viewerFavorited = r.favorited;
        p.favoriteCount = r.favoriteCount;
    } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('circle.opFail'), icon: 'none' });
    }
}

onShow(() => { void load(); });
</script>

<style lang="scss" scoped>
.cc-page { min-height: 100vh; padding: 24rpx 24rpx 60rpx; box-sizing: border-box; }
.cc-hero {
    background: linear-gradient(135deg, #ff7a45 0%, #ff4d4f 100%);
    border-radius: $radius-lg; padding: 28rpx 28rpx 30rpx; color: #fff;
}
.cc-hero__row { display: flex; align-items: center; justify-content: space-between; }
.cc-hero__brand { display: flex; align-items: center; gap: 12rpx; }
.cc-hero__ico { font-size: 40rpx; }
.cc-hero__title { font-size: 36rpx; font-weight: 700; }
.cc-hero__publish {
    background: rgba(255, 255, 255, 0.22); border-radius: 40rpx; padding: 10rpx 22rpx;
    font-size: 24rpx; color: #fff;
}
.cc-hero__sub { display: block; margin-top: 12rpx; font-size: 24rpx; opacity: 0.9; }

.cc-tabs { display: flex; gap: 40rpx; padding: 28rpx 8rpx 20rpx; }
.cc-tab { font-size: 28rpx; color: $text-color-secondary; padding-bottom: 10rpx; }
.cc-tab.on { color: $text-color; font-weight: 700; border-bottom: 6rpx solid #ff4d4f; }

.cc-tip { text-align: center; padding: 60rpx 0; font-size: 26rpx; color: $text-color-placeholder; }
.cc-guest { display: flex; flex-direction: column; align-items: center; padding: 80rpx 40rpx; }
.cc-guest__ico { font-size: 72rpx; }
.cc-guest__txt { margin-top: 20rpx; font-size: 26rpx; color: $text-color-secondary; }
.cc-guest__btn {
    margin-top: 28rpx; background: #ff4d4f; color: #fff; border-radius: 44rpx;
    font-size: 26rpx; padding: 0 48rpx; line-height: 76rpx;
}
.cc-empty { display: flex; flex-direction: column; align-items: center; padding: 80rpx 40rpx; }
.cc-empty__ico { font-size: 72rpx; }
.cc-empty__txt { margin-top: 20rpx; font-size: 26rpx; color: $text-color-placeholder; }
.cc-empty__btn {
    margin-top: 28rpx; background: #fff; color: #ff4d4f; border: 2rpx solid #ff4d4f;
    border-radius: 44rpx; font-size: 26rpx; padding: 0 48rpx; line-height: 72rpx;
}

.cc-card {
    background: #fff; border-radius: $radius-lg; padding: 26rpx; margin-bottom: 24rpx;
    box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.04);
}
.cc-card__head { display: flex; align-items: center; gap: 16rpx; }
.cc-avatar {
    width: 68rpx; height: 68rpx; border-radius: 50%; background: #fff1ec; color: #ff4d4f;
    display: flex; align-items: center; justify-content: center; font-size: 30rpx; font-weight: 700;
}
.cc-card__who { flex: 1; display: flex; flex-direction: column; }
.cc-card__name { font-size: 27rpx; font-weight: 600; color: $text-color; }
.cc-card__time { font-size: 22rpx; color: $text-color-placeholder; margin-top: 4rpx; }
.cc-card__pin {
    font-size: 20rpx; color: #ff4d4f; border: 2rpx solid #ff4d4f;
    border-radius: 8rpx; padding: 2rpx 10rpx;
}
.cc-card__title { display: block; margin-top: 18rpx; font-size: 30rpx; font-weight: 700; color: $text-color; }
.cc-card__content {
    display: block; margin-top: 12rpx; font-size: 27rpx; line-height: 1.6;
    color: $text-color-secondary; word-break: break-all;
}
.cc-card__imgs { display: flex; gap: 10rpx; margin-top: 18rpx; }
.cc-card__img { flex: 1; height: 210rpx; border-radius: $radius-md; background: #f5f5f5; }
.cc-card__imgs.n1 .cc-card__img { flex: none; width: 420rpx; }
.cc-card__imgs.n2 .cc-card__img { height: 250rpx; }
.cc-card__acts { display: flex; gap: 46rpx; margin-top: 20rpx; }
.cc-act { display: flex; align-items: center; gap: 8rpx; }
.cc-act__ico { font-size: 30rpx; }
.cc-act__num { font-size: 24rpx; color: $text-color-secondary; }
.cc-act.on .cc-act__num { color: #ff4d4f; }

.cc-more {
    text-align: center; padding: 22rpx 0; font-size: 26rpx; color: #ff4d4f;
}
.cc-note {
    margin-top: 10rpx; text-align: center; font-size: 22rpx; color: $text-color-placeholder;
}
</style>
