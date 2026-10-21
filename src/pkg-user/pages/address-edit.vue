<template>
  <view class="ae-page">
    <!-- 粘贴识别：从剪贴板读取「姓名 电话 地址」，自动拆分填充；读取失败可手动粘贴 -->
    <view class="ae-paste">
      <view class="ae-paste__body">
        <text class="ae-paste__title">{{ $t('addressEdit.pasteTitle') }}</text>
        <text class="ae-paste__hint">{{ $t('addressEdit.pasteHint') }}</text>
      </view>
      <view class="ae-paste__btn" @click="pasteRecognize">{{ $t('addressEdit.pasteBtn') }}</view>
    </view>

    <view class="ae-page__cell">
      <text class="ae-page__lbl">{{ $t('addressEdit.contactLabel') }}</text>
      <input class="ae-page__input" v-model="form.fullName" :placeholder="$t('addressEdit.phContact')" />
    </view>
    <view class="ae-page__cell">
      <text class="ae-page__lbl">{{ $t('addressEdit.phoneLabel') }}</text>
      <input class="ae-page__input" v-model="form.phoneNumber" type="number" maxlength="11" :placeholder="$t('addressEdit.phPhone')" />
    </view>
    <picker mode="selector" :range="zoneNames" @change="onZoneChange">
      <view class="ae-page__cell">
        <text class="ae-page__lbl">{{ $t('addressEdit.zoneLabel') }}</text>
        <text class="ae-page__val" :class="{ placeholder: !form.zoneId }">{{ zoneLabel }}</text>
        <text class="ae-page__arrow">></text>
      </view>
    </picker>
    <picker mode="selector" :range="buildingNames" @change="onBuildingChange" :disabled="!form.zoneId">
      <view class="ae-page__cell">
        <text class="ae-page__lbl">{{ $t('addressEdit.buildingLabel') }}</text>
        <text class="ae-page__val" :class="{ placeholder: !form.buildingId }">{{ buildingLabel }}</text>
        <text class="ae-page__arrow">></text>
      </view>
    </picker>
    <view class="ae-page__cell">
      <text class="ae-page__lbl">{{ $t('addressEdit.roomLabel') }}</text>
      <input class="ae-page__input" v-model="form.room" :placeholder="$t('addressEdit.phRoom')" />
    </view>
    <view class="ae-page__cell" @click="form.defaultShipping = !form.defaultShipping">
      <text class="ae-page__lbl">{{ $t('addressEdit.defaultLabel') }}</text>
      <switch :checked="form.defaultShipping" color="#ff6600" style="transform: scale(.8)" />
    </view>
    <button class="ae-page__save" :disabled="saving" @click="save">{{ saving ? $t('addressEdit.saving') : $t('addressEdit.save') }}</button>

    <!-- 手动粘贴兜底：浏览器拒绝读剪贴板时，用户可直接粘贴文本 -->
    <view class="ae-mask" v-if="pasteOpen" @click="pasteOpen = false">
      <view class="ae-sheet" @click.stop>
        <text class="ae-sheet__title">{{ $t('addressEdit.pasteSheetTitle') }}</text>
        <textarea
          class="ae-sheet__input"
          v-model="pasteText"
          :placeholder="$t('addressEdit.pastePlaceholder')"
          :maxlength="200"
          auto-height
        />
        <view class="ae-sheet__actions">
          <view class="ae-sheet__cancel" @click="pasteOpen = false">{{ $t('addressEdit.cancel') }}</view>
          <view class="ae-sheet__ok" @click="applyPaste">{{ $t('addressEdit.pasteParse') }}</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { fetchZones, fetchBuildings } from '../../api/mutations/campus';
import { createCustomerAddress, updateCustomerAddress } from '../../api/mutations/user';
import { parseAddressText, matchCampus } from '../../utils/address-parse';
import { useLocaleStore } from '../../stores/locale';

const locale = useLocaleStore();
const zones = ref<any[]>([]);
const buildings = ref<any[]>([]);
const saving = ref(false);
const addressId = ref('');
const pasteOpen = ref(false);
const pasteText = ref('');
const form = ref({ fullName: '', phoneNumber: '', zoneId: '', buildingId: '', room: '', defaultShipping: false });

onMounted(async () => {
    zones.value = await fetchZones();
    const opt: any = uni.getStorageSync('address_edit_options');
    if (opt?.addressId) {
        addressId.value = opt.addressId;
        form.value = {
            fullName: opt.fullName || '', phoneNumber: opt.phoneNumber || '',
            zoneId: opt.zoneId || '', buildingId: opt.buildingId || '',
            room: opt.room || '', defaultShipping: !!opt.defaultShipping,
        };
        if (form.value.zoneId) buildings.value = await fetchBuildings(form.value.zoneId);
    }
    uni.removeStorageSync('address_edit_options');
});

const zoneNames = computed(() => zones.value.map((z) => z.name));
const zoneLabel = computed(() => zones.value.find((z) => String(z.id) === String(form.value.zoneId))?.name || locale.t('addressEdit.selectZone'));
const buildingNames = computed(() => buildings.value.map((b) => b.name));
const buildingLabel = computed(() => buildings.value.find((b) => String(b.id) === String(form.value.buildingId))?.name || locale.t('addressEdit.selectBuilding'));

async function onZoneChange(e: any) {
    const z = zones.value[Number(e.detail.value)];
    if (!z) return;
    form.value.zoneId = String(z.id);
    form.value.buildingId = '';
    buildings.value = await fetchBuildings(form.value.zoneId);
}
function onBuildingChange(e: any) {
    const b = buildings.value[Number(e.detail.value)];
    if (b) form.value.buildingId = String(b.id);
}

/** 点「粘贴识别」：先读剪贴板；读不到（浏览器权限/空）则打开展示手动粘贴面板 */
function pasteRecognize() {
    uni.getClipboardData({
        success: (res: any) => {
            const text = String(res?.data || '').trim();
            if (text) {
                void applyPasteText(text);
                return;
            }
            pasteOpen.value = true;
        },
        fail: () => { pasteOpen.value = true; },
    });
}

function applyPaste() {
    const text = pasteText.value.trim();
    if (!text) {
        uni.showToast({ title: locale.t('addressEdit.pasteEmpty'), icon: 'none' });
        return;
    }
    void applyPasteText(text);
}

/** 解析文本并回填：姓名/手机号必填项，校区与楼栋按名称自动匹配，剩余文本作为门牌 */
async function applyPasteText(text: string) {
    const parsed = parseAddressText(text);
    pasteText.value = text;
    if (!parsed.fullName && !parsed.phoneNumber) {
        pasteOpen.value = true;
        uni.showToast({ title: locale.t('addressEdit.pasteNoContact'), icon: 'none' });
        return;
    }
    if (parsed.fullName) form.value.fullName = parsed.fullName;
    if (parsed.phoneNumber) form.value.phoneNumber = parsed.phoneNumber;

    const zoneHit = matchCampus(parsed.detail, zones.value, []);
    if (zoneHit.zoneId) {
        form.value.zoneId = zoneHit.zoneId;
        form.value.buildingId = '';
        buildings.value = await fetchBuildings(form.value.zoneId);
    }
    const buildingHit = matchCampus(zoneHit.room || parsed.detail, [], buildings.value);
    if (buildingHit.buildingId) form.value.buildingId = buildingHit.buildingId;
    form.value.room = (buildingHit.room || zoneHit.room || parsed.detail).slice(0, 60);

    pasteOpen.value = false;
    uni.showToast({ title: locale.t('addressEdit.pasteDone'), icon: 'none' });
}

async function save() {
    if (!form.value.fullName.trim()) { uni.showToast({ title: locale.t('addressEdit.contactRequired'), icon: 'none' }); return; }
    if (!/^1\d{10}$/.test(form.value.phoneNumber)) { uni.showToast({ title: locale.t('addressEdit.phoneInvalid'), icon: 'none' }); return; }
    if (!form.value.zoneId || !form.value.buildingId) { uni.showToast({ title: locale.t('addressEdit.zoneBuildingRequired'), icon: 'none' }); return; }
    const zone = zones.value.find((z) => String(z.id) === String(form.value.zoneId));
    const building = buildings.value.find((b) => String(b.id) === String(form.value.buildingId));
    const streetLine1 = `${zone?.name || ''}${building?.name || ''} ${form.value.room}`.trim();
    saving.value = true;
    try {
        const payload = {
            fullName: form.value.fullName.trim(), phoneNumber: form.value.phoneNumber,
            streetLine1, zoneId: form.value.zoneId, buildingId: form.value.buildingId,
            defaultShipping: form.value.defaultShipping,
        };
        const res: any = addressId.value
            ? await updateCustomerAddress({ id: addressId.value, ...payload })
            : await createCustomerAddress(payload);
        const body = addressId.value ? res?.updateCustomerAddress : res?.createCustomerAddress;
        if (body?.errorCode) throw new Error(body.message || locale.t('addressEdit.saveFail'));
        uni.showToast({ title: locale.t('addressEdit.saved'), icon: 'success' });
        setTimeout(() => uni.navigateBack(), 600);
    } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('addressEdit.saveFail'), icon: 'none' });
    }
    saving.value = false;
}
</script>

<style lang="scss" scoped>
.ae-page {
    min-height: 100vh; background: $bg-color; padding: 20rpx;
    &__cell { background: $surface; border-radius: $radius-md; display: flex; align-items: center; padding: 30rpx; margin-bottom: 20rpx; }
    &__lbl { width: 180rpx; font-size: 28rpx; }
    &__input { flex: 1; font-size: 28rpx; text-align: right; }
    &__val { flex: 1; font-size: 28rpx; text-align: right; &.placeholder { color: $text-color-placeholder; } }
    &__arrow { color: $text-color-placeholder; margin-left: 12rpx; }
    &__save { margin-top: 40rpx; background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; }
}
.ae-paste { display: flex; align-items: center; gap: 16rpx; background: #fff8ef; border: 1rpx solid #ffd9ad; border-radius: $radius-md; padding: 22rpx 26rpx; margin-bottom: 20rpx;
    &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
    &__title { font-size: 26rpx; font-weight: 600; color: #b45309; }
    &__hint { font-size: 22rpx; color: #b98249; }
    &__btn { flex-shrink: 0; font-size: 24rpx; color: #fff; background: #f59e0b; border-radius: 999rpx; padding: 10rpx 26rpx; }
}
.ae-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); z-index: 90; display: flex; align-items: flex-end; }
.ae-sheet { width: 100%; background: $surface; border-radius: 24rpx 24rpx 0 0; padding: 32rpx; box-sizing: border-box;
    &__title { display: block; font-size: 30rpx; font-weight: 600; color: $text-color; margin-bottom: 20rpx; }
    &__input { width: 100%; min-height: 160rpx; background: $bg-color; border-radius: $radius-md; padding: 20rpx; font-size: 26rpx; box-sizing: border-box; }
    &__actions { display: flex; gap: 20rpx; margin-top: 24rpx; }
    &__cancel, &__ok { flex: 1; text-align: center; height: 80rpx; line-height: 80rpx; border-radius: $radius-md; font-size: 28rpx; }
    &__cancel { background: $bg-color; color: $text-color-secondary; }
    &__ok { background: $brand-color; color: #fff; }
}
</style>
