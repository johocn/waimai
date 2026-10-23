<template>
  <view class="poster-page">
    <view v-if="loading" class="poster-tip">{{ $t('poster.loading') }}</view>
    <view v-else-if="!order" class="poster-tip">{{ $t('poster.empty') }}</view>

    <template v-else>
      <!-- 海报预览：canvas 离屏绘制后转图片，长按可保存 -->
      <view class="poster-stage">
        <image v-if="posterUrl" class="poster-img" :src="posterUrl" mode="widthFix" show-menu-by-longpress @click="previewPoster" />
        <view v-else class="poster-loading">{{ $t('poster.generating') }}</view>
      </view>

      <view class="poster-acts">
        <button class="poster-btn poster-btn--main" :disabled="!posterUrl" @click="savePoster">{{ $t('poster.save') }}</button>
        <button class="poster-btn" :disabled="!posterUrl" @click="sharePoster">{{ $t('poster.share') }}</button>
      </view>
      <text class="poster-hint">{{ $t('poster.longPressTip') }}</text>
    </template>

    <canvas canvas-id="poster" id="poster" class="poster-canvas" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getOrderByCode } from '../../api/queries/order';
import { useLocaleStore } from '../../stores/locale';
import { sharePage } from '../../utils/share';

const locale = useLocaleStore();
const order = ref<any>(null);
const shopName = ref('');
const loading = ref(true);
const posterUrl = ref('');

const W = 750;
const H = 1180;

function fen(v: any): string {
  return ((Number(v) || 0) / 100).toFixed(2);
}

function fmtDate(raw?: string): string {
  const d = new Date(String(raw ?? ''));
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 单行截断：超出宽度补省略号 */
function clip(text: string, maxChars: number): string {
  const s = String(text ?? '');
  return s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s;
}

function drawPoster() {
  const o = order.value;
  if (!o) return;
  const ctx = uni.createCanvasContext('poster');
  const c = ctx as any;

  c.setFillStyle('#ffffff');
  c.fillRect(0, 0, W, H);

  // 顶部品牌色渐变区
  const grad = c.createLinearGradient(0, 0, W, 340);
  grad.addColorStop(0, '#ff6600');
  grad.addColorStop(1, '#ff9a3d');
  c.setFillStyle(grad);
  c.fillRect(0, 0, W, 340);

  c.setFillStyle('#ffffff');
  c.setFontSize(26);
  c.fillText(locale.t('poster.brand'), 48, 74);

  c.setFontSize(52);
  c.fillText(locale.t('poster.headline'), 48, 168);

  c.setFontSize(24);
  c.fillText(fmtDate(o.createdAt), 48, 220);

  // 店铺名与合计
  c.setFillStyle('#222222');
  c.setFontSize(40);
  c.fillText(clip(shopName.value || locale.t('poster.defaultShop'), 14), 48, 420);

  c.setFillStyle('#ff6600');
  c.setFontSize(64);
  c.fillText('¥' + fen(o.totalWithTax), 48, 510);

  c.setFillStyle('#888888');
  c.setFontSize(24);
  c.fillText(locale.t('poster.itemsCount').replace('{n}', String(o.totalQuantity ?? (o.lines ?? []).length)), 260, 508);

  // 分隔虚线
  c.setStrokeStyle('#e5e5e5');
  c.setLineWidth(2);
  c.setLineDash([10, 8], 0);
  c.beginPath();
  c.moveTo(48, 552);
  c.lineTo(W - 48, 552);
  c.stroke();
  c.setLineDash([], 0);

  // 菜品清单（最多 4 行，超出合并为「等 N 件」）
  const lines = (o.lines ?? []).slice(0, 4);
  c.setFontSize(28);
  lines.forEach((l: any, i: number) => {
    const y = 610 + i * 56;
    c.setFillStyle('#333333');
    c.fillText(clip(String(l.productVariant?.name ?? locale.t('poster.itemFallback')), 16), 48, y);
    c.setFillStyle('#888888');
    c.fillText('×' + (l.quantity ?? 1), 520, y);
    c.setFillStyle('#333333');
    c.fillText('¥' + fen(l.linePriceWithTax ?? l.unitPriceWithTax), 606, y);
  });
  if ((o.lines ?? []).length > 4) {
    c.setFillStyle('#888888');
    c.setFontSize(24);
    c.fillText(locale.t('poster.moreItems').replace('{n}', String(o.lines.length - 4)), 48, 610 + 4 * 56);
  }

  // 底部寄语 + 订单号
  c.setFillStyle('#ff6600');
  c.setFontSize(30);
  c.fillText(locale.t('poster.thanks'), 48, 950);

  c.setFillStyle('#bbbbbb');
  c.setFontSize(22);
  c.fillText(locale.t('poster.orderNo') + ': ' + String(o.code ?? ''), 48, 1010);

  c.setFillStyle('#ff6600');
  c.setFontSize(24);
  c.fillText(locale.t('poster.footer'), 48, 1100);

  c.draw(false, () => {
    setTimeout(() => {
      uni.canvasToTempFilePath({
        canvasId: 'poster',
        destWidth: W,
        destHeight: H,
        success: (res: any) => { posterUrl.value = res.tempFilePath; },
        fail: () => { uni.showToast({ title: locale.t('poster.genFail'), icon: 'none' }); },
      });
    }, 120);
  });
}

onLoad(async (q: any) => {
  shopName.value = String(q?.shop ?? '');
  const code = String(q?.code ?? '');
  try {
    const res: any = await getOrderByCode(code);
    order.value = res?.orderByCode ?? res?.order ?? null;
  } catch {
    order.value = null;
  } finally {
    loading.value = false;
  }
  if (order.value) drawPoster();
});

function previewPoster() {
  if (!posterUrl.value) return;
  uni.previewImage({ urls: [posterUrl.value], current: posterUrl.value });
}

function savePoster() {
  if (!posterUrl.value) return;
  uni.saveImageToPhotosAlbum({
    filePath: posterUrl.value,
    success: () => uni.showToast({ title: locale.t('poster.saved'), icon: 'success' }),
    fail: () => previewPoster(),
  });
}

async function sharePoster() {
  const o = order.value;
  if (!o) return;
  const how = await sharePage({
    title: locale.t('poster.shareTitle').replace('{s}', shopName.value || locale.t('poster.defaultShop')),
    desc: locale.t('poster.shareDesc').replace('{y}', fen(o.totalWithTax)),
    path: '/pkg-order/pages/order-detail?code=' + encodeURIComponent(String(o.code ?? '')),
  });
  if (how === 'copy') uni.showToast({ title: locale.t('poster.linkCopied'), icon: 'none' });
}
</script>

<style lang="scss" scoped>
.poster-page { min-height: 100vh; background: $bg-color; padding: 24rpx 24rpx 60rpx; box-sizing: border-box; }
.poster-tip { padding: 160rpx 0; text-align: center; font-size: 26rpx; color: $text-color-secondary; }
.poster-stage { background: $surface; border-radius: $radius-md; overflow: hidden; box-shadow: $shadow; }
.poster-img { display: block; width: 100%; }
.poster-loading { padding: 220rpx 0; text-align: center; font-size: 26rpx; color: $text-color-placeholder; }
.poster-acts { display: flex; gap: 20rpx; margin-top: 28rpx; }
.poster-btn { flex: 1; height: 84rpx; line-height: 84rpx; border-radius: 42rpx; font-size: 28rpx; border: 1rpx solid $border-color;
  background: $surface; color: $text-color;
  &::after { border: none; }
  &--main { background: $brand-color; color: #fff; border: none; font-weight: 600; }
  &[disabled] { opacity: .5; }
}
.poster-hint { display: block; margin-top: 18rpx; text-align: center; font-size: 22rpx; color: $text-color-placeholder; }
/* 离屏 canvas：参与绘制但不可见 */
.poster-canvas { position: fixed; left: -9999px; top: 0; width: 750px; height: 1180px; }
</style>
