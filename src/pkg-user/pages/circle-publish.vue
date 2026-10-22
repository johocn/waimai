<template>
    <view class="cp-page">
        <view class="cp-card">
            <text class="cp-label">{{ $t('circlePublish.titleLabel') }}</text>
            <input
                v-model="title" class="cp-input" :maxlength="50"
                :placeholder="$t('circlePublish.titlePh')" :placeholder-style="phStyle"
            />
        </view>

        <view class="cp-card">
            <text class="cp-label">{{ $t('circlePublish.contentLabel') }}</text>
            <textarea
                v-model="content" class="cp-textarea" :maxlength="500"
                :placeholder="$t('circlePublish.contentPh')" :placeholder-style="phStyle"
            />
            <text class="cp-count">{{ content.length }}/500</text>
        </view>

        <view class="cp-card">
            <text class="cp-label">{{ $t('circlePublish.imagesLabel') }}</text>
            <VImageUpload v-model="images" :maxCount="9" />
            <text class="cp-hint">{{ $t('circlePublish.imagesHint') }}</text>
        </view>

        <view class="cp-note">{{ $t('circlePublish.note') }}</view>

        <view class="cp-bar">
            <button class="cp-btn" :disabled="submitting" @tap="submit">
                {{ submitting ? $t('circlePublish.submitting') : $t('circlePublish.submit') }}
            </button>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import VImageUpload from '../../components/ImageUpload.vue';
import { createCirclePost } from '../../api/queries/circle';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';

const auth = useAuthStore();
const locale = useLocaleStore();

const title = ref('');
const content = ref('');
const images = ref<string[]>([]);
const submitting = ref(false);
const phStyle = 'color:#bdbdbd';

onLoad(() => {
    if (!auth.isLoggedIn) auth.requireLogin('/pkg-user/pages/circle-publish');
});

async function submit() {
    if (submitting.value) return;
    const body = content.value.trim();
    if (!body) {
        uni.showToast({ title: locale.t('circlePublish.needContent'), icon: 'none' });
        return;
    }
    submitting.value = true;
    try {
        await createCirclePost({
            title: title.value.trim() || undefined,
            content: body,
            images: images.value,
        });
        uni.showToast({ title: locale.t('circlePublish.ok'), icon: 'success' });
        setTimeout(() => uni.navigateBack(), 600);
    } catch (e: any) {
        const msg = String(e?.message || '');
        let text = locale.t('circlePublish.fail');
        if (/title.*(50|length|too long)/i.test(msg)) text = locale.t('circlePublish.titleTooLong');
        else if (/content.*required/i.test(msg)) text = locale.t('circlePublish.needContent');
        else if (msg) text = msg;
        uni.showToast({ title: text, icon: 'none' });
    } finally {
        submitting.value = false;
    }
}
</script>

<style lang="scss" scoped>
.cp-page { min-height: 100vh; padding: 24rpx 24rpx 200rpx; box-sizing: border-box; }
.cp-card {
    background: #fff; border-radius: $radius-lg; padding: 26rpx; margin-bottom: 22rpx;
    box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.04);
}
.cp-label { display: block; font-size: 26rpx; font-weight: 600; color: $text-color; margin-bottom: 16rpx; }
.cp-input {
    height: 76rpx; background: #f7f7f7; border-radius: $radius-md; padding: 0 20rpx;
    font-size: 27rpx; color: $text-color;
}
.cp-textarea {
    width: 100%; height: 260rpx; background: #f7f7f7; border-radius: $radius-md;
    padding: 18rpx 20rpx; box-sizing: border-box; font-size: 27rpx; color: $text-color;
}
.cp-count { display: block; text-align: right; margin-top: 10rpx; font-size: 22rpx; color: $text-color-placeholder; }
.cp-hint { display: block; margin-top: 14rpx; font-size: 22rpx; color: $text-color-placeholder; }
.cp-note {
    text-align: center; font-size: 22rpx; color: $text-color-placeholder;
    line-height: 1.6; padding: 10rpx 20rpx;
}
.cp-bar {
    position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 24rpx 34rpx;
    background: #fff; box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.05);
}
.cp-btn {
    background: linear-gradient(135deg, #ff7a45 0%, #ff4d4f 100%);
    color: #fff; border-radius: 44rpx; font-size: 30rpx; line-height: 88rpx;
}
.cp-btn[disabled] { opacity: 0.6; }
</style>
