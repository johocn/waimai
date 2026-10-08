<template>
  <view class="it-page">
    <view class="it-page__item" v-for="(t, i) in titles" :key="i">
      <view class="it-page__main" @click="openForm(i)">
        <view class="it-page__row">
          <text class="it-page__name">{{ t.name }}</text>
          <text class="it-page__tag" :class="{ company: t.type === 'company' }">{{ t.type === 'company' ? $t('invoice.typeCompany') : $t('invoice.typePersonal') }}</text>
          <text class="it-page__tag it-page__tag--def" v-if="i === 0">{{ $t('invoice.defaultTag') }}</text>
        </view>
        <text class="it-page__meta">{{ t.type === 'company' ? $t('invoice.taxNoPrefix').replace('{n}', t.taxNo) : $t('invoice.personalTitle') }} · {{ t.email }}</text>
      </view>
      <text class="it-page__del" @click="del(i)">{{ $t('invoice.del') }}</text>
    </view>
    <view class="it-page__empty" v-if="!titles.length"><text>{{ $t('invoice.empty') }}</text></view>

    <view class="it-page__mask" v-if="showForm" @click="showForm = false">
      <view class="it-page__form" @click.stop>
        <view class="it-page__type-row">
          <text class="it-page__type" :class="{ on: draft.type === 'personal' }" @click="draft.type = 'personal'">{{ $t('invoice.typePersonal') }}</text>
          <text class="it-page__type" :class="{ on: draft.type === 'company' }" @click="draft.type = 'company'">{{ $t('invoice.typeCompany') }}</text>
        </view>
        <input class="it-page__ipt" v-model="draft.name" :placeholder="draft.type === 'company' ? $t('invoice.phCompanyName') : $t('invoice.phName')" />
        <input class="it-page__ipt" v-if="draft.type === 'company'" v-model="draft.taxNo" :placeholder="$t('invoice.phTaxNo')" />
        <input class="it-page__ipt" v-model="draft.email" type="text" :placeholder="$t('invoice.phEmail')" />
        <button class="it-page__save" :disabled="saving" @click="save">{{ saving ? $t('invoice.saving') : $t('invoice.save') }}</button>
      </view>
    </view>

    <view class="it-page__footer" v-if="!showForm">
      <button class="it-page__add" :disabled="titles.length >= 5" @click="openForm(-1)">{{ titles.length >= 5 ? $t('invoice.maxReached') : $t('invoice.add') }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getActiveCustomer } from '../../api/queries/user';
import { updateInvoiceTitles } from '../../api/mutations/user';
import { parseInvoiceTitles, validateInvoiceTitle, type InvoiceTitle } from '../../utils/profile-mapping';
import { useLocaleStore } from '../../stores/locale';

const locale = useLocaleStore();
const titles = ref<InvoiceTitle[]>([]);
const showForm = ref(false);
const saving = ref(false);
const editIndex = ref(-1);
const draft = ref<InvoiceTitle>({ type: 'personal', name: '', email: '' });

onMounted(refresh);

async function refresh() {
    try {
        const res: any = await getActiveCustomer();
        titles.value = parseInvoiceTitles(res?.activeCustomer?.customFields?.invoiceTitles);
    } catch (e) {}
}

function openForm(i: number) {
    editIndex.value = i;
    draft.value = i >= 0 ? { ...titles.value[i] } : { type: 'personal', name: '', email: '' };
    showForm.value = true;
}

async function save() {
    const err = validateInvoiceTitle(draft.value);
    if (err) {
        // 展示键映射（键存枚举，不存中文）
        const msgKeys: Record<string, string> = {
            TYPE_INVALID: 'errTypeInvalid', NAME_REQUIRED: 'errNameRequired', TAXNO_REQUIRED: 'errTaxNoRequired',
            TAXNO_INVALID: 'errTaxNoInvalid', EMAIL_INVALID: 'errEmailInvalid',
        };
        uni.showToast({ title: msgKeys[err] ? locale.t(`invoice.${msgKeys[err]}`) : err, icon: 'none' });
        return;
    }
    saving.value = true;
    try {
        const next = [...titles.value];
        if (editIndex.value >= 0) next[editIndex.value] = { ...draft.value };
        else next.unshift({ ...draft.value }); // 新增置首=默认
        await updateInvoiceTitles(JSON.stringify(next.slice(0, 5)));
        uni.showToast({ title: locale.t('invoice.saved'), icon: 'success' });
        showForm.value = false;
        refresh();
    } catch (e: any) { uni.showToast({ title: e?.message || locale.t('invoice.saveFail'), icon: 'none' }); }
    saving.value = false;
}

function del(i: number) {
    uni.showModal({
        title: locale.t('invoice.delTitle'), content: locale.t('invoice.delConfirm').replace('{n}', titles.value[i].name),
        success: async (res: any) => {
            if (!res.confirm) return;
            const next = titles.value.filter((_, idx) => idx !== i);
            try { await updateInvoiceTitles(JSON.stringify(next)); uni.showToast({ title: locale.t('invoice.deleted'), icon: 'success' }); refresh(); }
            catch (e: any) { uni.showToast({ title: e?.message || locale.t('invoice.delFail'), icon: 'none' }); }
        },
    });
}
</script>

<style lang="scss" scoped>
.it-page {
    min-height: 100vh; background: $bg-color; padding: 20rpx 20rpx 160rpx;
    &__item { background: $surface; border-radius: $radius-md; padding: 30rpx; margin-bottom: 20rpx; display: flex; align-items: center; }
    &__main { flex: 1; min-width: 0; }
    &__row { display: flex; align-items: center; gap: 12rpx; }
    &__name { font-size: 30rpx; font-weight: bold; }
    &__tag { font-size: 20rpx; color: $text-color-secondary; border: 1rpx solid #ccc; border-radius: 6rpx; padding: 2rpx 10rpx; &.company { color: $brand-color; border-color: $brand-color; } }
    &__tag--def { color: $brand-color; border-color: $brand-color; }
    &__meta { display: block; font-size: 24rpx; color: $text-color-placeholder; margin-top: 8rpx; }
    &__del { font-size: 24rpx; color: #e8463a; margin-left: 20rpx; }
    &__empty { text-align: center; color: $text-color-placeholder; font-size: 26rpx; padding: 120rpx 0; }
    &__footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx; background: $bg-color; }
    &__add, &__save { background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; }
    &__mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: flex-end; z-index: 9; }
    &__form { width: 100%; background: $surface; border-radius: 24rpx 24rpx 0 0; padding: 40rpx 30rpx calc(40rpx + env(safe-area-inset-bottom)); }
    &__type-row { display: flex; gap: 20rpx; margin-bottom: 24rpx; }
    &__type { font-size: 26rpx; padding: 10rpx 36rpx; border-radius: 999rpx; background: $bg-color; color: $text-color-secondary; &.on { background: $brand-soft; color: $brand-color; } }
    &__ipt { border-bottom: 1rpx solid $border-color; height: 88rpx; font-size: 28rpx; margin-bottom: 8rpx; }
    &__save { margin-top: 24rpx; }
}
</style>
