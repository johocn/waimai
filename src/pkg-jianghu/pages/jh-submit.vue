<template>
    <view class="jh">
        <view class="sec"><text class="sec-h">传闻收集</text><text class="sec-m">采纳 +8 声望 · 每日 3 条</text></view>

        <!-- 红线 -->
        <view class="redline">
            <text class="rl-ic">!</text>
            <view class="rl-b">
                <text class="rl-h">江湖有规矩：只探公开事，不问私人情。</text>
                <text class="rl-p">姓名、手机号、宿舍房号、课表、行踪一概不可打探；照片不得含人脸与门牌。违者面壁七日。</text>
            </view>
        </view>

        <!-- 分类 -->
        <view class="chips">
            <view v-for="c in cats" :key="c.key" class="chip" :class="{ on: category === c.key }" @tap="category = c.key">
                {{ c.text }}
            </view>
        </view>

        <view class="field">
            <text class="f-lb">一句话传闻</text>
            <textarea class="f-ta" v-model="content" maxlength="50" placeholder="例如：三食堂二层新出麻辣香锅窗口，17:00 前不用排队" />
            <text class="f-ct">{{ content.length }}/50</text>
        </view>

        <view class="field">
            <text class="f-lb">信息来源（必填 · 合规留痕）</text>
            <input class="f-in" v-model="sourceNote" placeholder="例如：三食堂二层窗口上方公告牌" />
        </view>

        <view class="field">
            <text class="f-lb">现场图片（最多 3 张 · 自动加水印）</text>
            <view class="ups">
                <view v-for="(img, i) in photos" :key="i" class="up filled">已传 {{ i + 1 }}</view>
                <view v-if="photos.length < 3" class="up" @tap="pickImage">+</view>
            </view>
        </view>

        <button class="btn primary" :disabled="submitting" @tap="submit">
            {{ submitting ? '提交中…' : '提交传闻' }}
        </button>

        <view class="sec"><text class="sec-h">我的提交</text><text class="sec-m">审核约 2 小时</text></view>
        <view class="card">
            <view v-for="r in records" :key="r.id" class="rec">
                <text class="pill" :class="recCls(r.reason)">{{ recText(r.reason) }}</text>
                <text class="rec-t">{{ r.reasonText }}</text>
                <text class="rec-r">{{ r.deltaRep ? '+' + r.deltaRep : r.deltaIntel ? '+' + r.deltaIntel + ' 情报值' : '—' }}</text>
            </view>
            <EmptyState v-if="!records.length" text="还没有提交记录" />
        </view>
    </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useJianghuStore } from '../../stores/jianghu';
import EmptyState from '../../components/EmptyState.vue';
import type { IntelCategory } from '../../types/jianghu';

const jh = useJianghuStore();

const cats: Array<{ key: IntelCategory; text: string }> = [
    { key: 'FOOD', text: '食堂上新' },
    { key: 'CLASSROOM', text: '教室空位' },
    { key: 'CLUB', text: '社团活动' },
    { key: 'EVENT', text: '操场赛事' },
    { key: 'NOTICE', text: '公告通知' },
    { key: 'SCENERY', text: '校园风景' }
];

const category = ref<IntelCategory>('FOOD');
const content = ref('三食堂二层新出麻辣香锅窗口，17:00 前不用排队');
const sourceNote = ref('三食堂二层窗口上方公告牌');
const photos = ref<string[]>([]);
const submitting = ref(false);

const records = computed(() => jh.records.filter((r) => r.reason.startsWith('RUMOR')));

onShow(() => { jh.loadRecords().catch(() => {}); });

function pickImage() {
    uni.chooseImage({
        count: 3 - photos.value.length,
        sizeType: ['compressed'],
        success: (res: any) => { photos.value = photos.value.concat(res.tempFilePaths || []).slice(0, 3); },
        fail: () => {}
    });
}

async function submit() {
    if (!content.value.trim()) return uni.showToast({ title: '请填写传闻内容', icon: 'none' });
    if (!sourceNote.value.trim()) return uni.showToast({ title: '请填写信息来源', icon: 'none' });
    submitting.value = true;
    try {
        await jh.submitRumor({
            category: category.value,
            content: content.value.trim(),
            sourceNote: sourceNote.value.trim(),
            photos: photos.value
        });
        uni.showToast({ title: '已提交，2 小时内出审核结果', icon: 'none' });
        content.value = '';
        sourceNote.value = '';
        photos.value = [];
    } catch (e: any) {
        uni.showToast({ title: (e?.message || '提交失败').slice(0, 30), icon: 'none' });
    } finally {
        submitting.value = false;
    }
}

function recCls(reason: string) {
    if (reason === 'RUMOR') return 'p-jade';
    if (reason === 'RUMOR_PENDING') return 'p-gray';
    return 'p-cin';
}
function recText(reason: string) {
    if (reason === 'RUMOR') return '已采纳';
    if (reason === 'RUMOR_PENDING') return '审核中';
    return '未通过';
}
</script>

<style scoped lang="scss">
.jh { padding: 24rpx; padding-bottom: 60rpx; }
.sec { display: flex; justify-content: space-between; align-items: baseline; margin: 8rpx 4rpx 20rpx; }
.sec-h { font-size: 32rpx; font-weight: 700; color: $jh-ink; }
.sec-m { font-size: 22rpx; color: $jh-ink-2; }
.redline {
    display: flex; gap: 16rpx; padding: 24rpx; border-radius: 20rpx; margin-bottom: 24rpx;
    background: rgba(178, 58, 46, .1); border: 1rpx solid rgba(178, 58, 46, .25);
}
.rl-ic {
    width: 40rpx; height: 40rpx; border-radius: 50%; background: $jh-cinnabar; color: #fff;
    text-align: center; line-height: 40rpx; font-weight: 700; flex-shrink: 0;
}
.rl-b { flex: 1; display: flex; flex-direction: column; }
.rl-h { font-size: 26rpx; font-weight: 700; color: #8f2b21; margin-bottom: 8rpx; }
.rl-p { font-size: 22rpx; line-height: 1.7; color: #8f2b21; }
.chips { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 24rpx; }
.chip { padding: 14rpx 28rpx; border-radius: 999rpx; font-size: 24rpx; background: $surface; color: $jh-ink-2; }
.chip.on { background: linear-gradient(140deg, $jh-jade, #2f9179); color: #fff; font-weight: 600; }
.field { background: $surface; border-radius: 20rpx; padding: 24rpx; margin-bottom: 20rpx; }
.f-lb { display: block; font-size: 24rpx; color: $jh-ink-2; margin-bottom: 16rpx; }
.f-ta { width: 100%; height: 150rpx; font-size: 28rpx; line-height: 1.7; color: $jh-ink; }
.f-in { width: 100%; font-size: 28rpx; color: $jh-ink; }
.f-ct { display: block; text-align: right; font-size: 22rpx; color: $jh-ink-2; }
.ups { display: flex; gap: 16rpx; }
.up {
    width: 148rpx; height: 148rpx; border-radius: 20rpx; border: 1rpx dashed $jh-ink-2;
    display: flex; align-items: center; justify-content: center; color: $jh-ink-2; font-size: 48rpx;
}
.up.filled {
    border-style: solid; border-color: $border-color; background: $jh-paper;
    font-size: 22rpx; color: $jh-ink-2;
}
.btn { margin-top: 12rpx; border-radius: 16rpx; font-size: 30rpx; font-weight: 700; }
.btn.primary { background: linear-gradient(140deg, $jh-cinnabar, #8f2b21); color: #fff; }
.btn[disabled] { opacity: .5; }
.card { background: $surface; border-radius: 20rpx; padding: 12rpx 24rpx; }
.rec { display: flex; align-items: center; gap: 16rpx; padding: 24rpx 0; border-bottom: 1rpx dashed $border-color; }
.rec:last-child { border-bottom: none; }
.rec-t { flex: 1; font-size: 26rpx; color: $jh-ink; }
.rec-r { font-size: 26rpx; font-weight: 700; color: $jh-cinnabar; }
.pill { font-size: 20rpx; padding: 4rpx 14rpx; border-radius: 999rpx; font-weight: 600; }
.p-jade { background: rgba(31, 111, 92, .12); color: $jh-jade; }
.p-cin { background: rgba(178, 58, 46, .12); color: $jh-cinnabar; }
.p-gray { background: rgba(31, 27, 22, .08); color: $jh-ink-2; }
</style>
