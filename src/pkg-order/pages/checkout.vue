<template>
  <view class="checkout-page">
    <!-- 配送方式（始终显示，置顶） -->
    <view class="section">
      <text class="section__title">配送方式</text>
      <view class="seg-control">
        <view
          v-for="tab in shippingTabs"
          :key="tab.category"
          class="seg-control__item"
          :class="{ active: activeTab === tab.category }"
          @click="switchTab(tab.category)"
        >
          <text>{{ tab.label }}</text>
        </view>
      </view>
    </view>

    <!-- 收货地址（仅邮寄方式显示） -->
    <view class="section" v-if="shippingCategory === 'shipping'">
      <text class="section__title">收货地址</text>
      <!-- 已有地址：显示当前选中地址 + 更换入口 -->
      <view v-if="selectedAddress" class="address-block" @click="showAddressPicker = true">
        <view class="address-block__top">
          <text class="address-block__name">{{ selectedAddress.fullName }}</text>
          <text class="address-block__phone">{{ selectedAddress.phoneNumber }}</text>
          <text v-if="selectedAddress.defaultShippingAddress" class="address-block__tag">默认</text>
        </view>
        <text class="address-block__detail">{{ selectedAddress.province }} {{ selectedAddress.city }} {{ selectedAddress.streetLine1 }}{{ selectedAddress.streetLine2 ? ' ' + selectedAddress.streetLine2 : '' }}</text>
        <text class="address-block__change">更换 ▾</text>
      </view>
      <!-- 无地址：显示新增表单 -->
      <view v-else class="address-form">
        <view class="address-form__tip">您还没有收货地址，请填写以下信息</view>
        <input v-model="address.fullName" placeholder="收货人姓名" class="input" />
        <input v-model="address.phoneNumber" placeholder="手机号" type="number" class="input" />
        <view class="region-row" @click="openRegionPicker('inline')">
          <text :class="{ 'region-row__placeholder': !regionText(address) }">{{ regionText(address) || '请选择省/市/区' }}</text>
          <text class="region-row__arrow">▸</text>
        </view>
        <input v-model="address.streetLine1" placeholder="详细地址" class="input" />
        <input v-model="address.streetLine2" placeholder="补充地址(可选)" class="input" />
        <view class="address-form__check">
          <text>设为默认收货地址</text>
          <switch :checked="address.defaultShippingAddress" @change="address.defaultShippingAddress = $event.detail.value" />
        </view>
        <button class="address-form__save" @click="saveNewAddress">保存并使用</button>
      </view>
    </view>

    <!-- 地址选择/管理弹窗 -->
    <view v-if="showAddressPicker" class="addr-modal-mask" @click.self="showAddressPicker = false">
      <view class="addr-modal">
        <view class="addr-modal__head">
          <text class="addr-modal__title">选择收货地址</text>
          <text class="addr-modal__close" @click="showAddressPicker = false">✕</text>
        </view>
        <scroll-view class="addr-modal__list" scroll-y>
          <view
            v-for="addr in customerAddresses"
            :key="addr.id"
            class="addr-option"
            :class="{ selected: selectedAddress?.id === addr.id }"
            @click="chooseAddress(addr)"
          >
            <view class="addr-option__top">
              <text class="addr-option__name">{{ addr.fullName }}</text>
              <text class="addr-option__phone">{{ addr.phoneNumber }}</text>
              <text v-if="addr.defaultShippingAddress" class="addr-option__tag">默认</text>
            </view>
            <text class="addr-option__detail">{{ addr.province }} {{ addr.city }} {{ addr.streetLine1 }}{{ addr.streetLine2 ? ' ' + addr.streetLine2 : '' }}</text>
            <view class="addr-option__actions">
              <text class="addr-option__edit" @click.stop="openEditForm(addr)">编辑</text>
              <text class="addr-option__del" @click.stop="deleteAddress(addr.id)">删除</text>
              <text v-if="!addr.defaultShippingAddress" class="addr-option__default" @click.stop="setDefaultAddress(addr)">设为默认</text>
            </view>
          </view>
          <view v-if="customerAddresses.length === 0" class="addr-modal__empty">
            <text>暂无收货地址</text>
          </view>
        </scroll-view>
        <view class="addr-modal__fab" @click="openAddForm">
          <text>+ 新增地址</text>
        </view>
      </view>
    </view>

    <!-- 地址新增/编辑表单弹窗 -->
    <view v-if="showAddressForm" class="addr-modal-mask" @click.self="showAddressForm = false">
      <view class="addr-modal">
        <view class="addr-modal__head">
          <text class="addr-modal__title">{{ editingAddressId ? '编辑地址' : '新增地址' }}</text>
          <text class="addr-modal__close" @click="showAddressForm = false">✕</text>
        </view>
        <scroll-view class="addr-modal__list" scroll-y>
          <input v-model="addressForm.fullName" placeholder="收货人姓名" class="input" />
          <input v-model="addressForm.phoneNumber" placeholder="手机号" type="number" class="input" />
          <view class="region-row" @click="openRegionPicker('modal')">
            <text :class="{ 'region-row__placeholder': !regionText(addressForm) }">{{ regionText(addressForm) || '请选择省/市/区' }}</text>
            <text class="region-row__arrow">▸</text>
          </view>
          <input v-model="addressForm.streetLine1" placeholder="详细地址" class="input" />
          <input v-model="addressForm.streetLine2" placeholder="补充地址(可选)" class="input" />
          <view class="address-form__check">
            <text>设为默认收货地址</text>
            <switch :checked="addressForm.defaultShippingAddress" @change="addressForm.defaultShippingAddress = $event.detail.value" />
          </view>
        </scroll-view>
        <view class="addr-modal__fab addr-modal__fab--save" @click="saveAddressForm">
          <text>保存</text>
        </view>
      </view>
    </view>

    <!-- 自提点选择（自提方式显示） -->
    <view class="section" v-if="shippingCategory === 'store-pickup'">
      <text class="section__title">自提点选择</text>
      <!-- 已选自提点卡片 -->
      <view v-if="selectedPickupLocation" class="pickup-card" @click="showPickupSheet = true">
        <text class="pickup-card__name">{{ selectedPickupLocation.name }}</text>
        <text class="pickup-card__addr">{{ selectedPickupLocation.address }}</text>
        <view class="pickup-card__meta">
          <text v-if="selectedPickupLocation.businessHours" class="pickup-card__hours">营业: {{ selectedPickupLocation.businessHours }}</text>
          <text v-if="pickupDistance" class="pickup-card__dist">{{ pickupDistance }}</text>
        </view>
        <text class="pickup-card__change">更换自提点 ▾</text>
      </view>
      <!-- 加载中状态 -->
      <view v-else-if="pickupLoading" class="pickup-empty">
        <text class="pickup-empty__loading">等待加载自提点...</text>
      </view>
      <!-- 加载完成但无数据 -->
      <view v-else class="pickup-empty">
        <text>当前区域暂无可用自提点</text>
        <text class="pickup-empty__hint">请选择其他配送方式</text>
      </view>
    </view>

    <!-- 自提点选择弹窗 -->
    <PickupLocationSheet
      v-model:visible="showPickupSheet"
      :locations="pickupLocations"
      :selected-id="selectedPickupLocation?.id"
      :user-location="userLocation"
      title="选择自提点"
      @select="onPickupSelect"
    />

    <RegionPicker
      v-model:visible="showRegionPicker"
      :init-province="regionTarget === 'inline' ? address.province : addressForm.province"
      :init-city="regionTarget === 'inline' ? address.city : addressForm.city"
      :init-district="regionTarget === 'inline' ? address.district : addressForm.district"
      @confirm="onRegionConfirm"
    />

    <view class="section">
      <text class="section__title">支付方式</text>
      <view v-for="pm in paymentMethods" :key="pm.id"
        class="radio-item" :class="{ active: selectedPayment === pm.code }"
        @click="selectedPayment = pm.code">
        <view class="radio-item__left">
          <text class="radio-item__icon">{{ getPaymentIcon(pm.code) }}</text>
          <text>{{ pm.name }}</text>
        </view>
      </view>
    </view>

    <view class="checkout-page__summary" v-if="cart.order">
      <view class="summary-row"><text>商品总额</text><text>¥{{ originalSubTotalYuan }}</text></view>
      <view class="summary-row"><text>运费</text><text>¥{{ shippingFee }}</text></view>
      <view class="summary-row summary-row--total"><text>应付</text><text class="checkout-page__total">¥{{ cart.formatPrice(cart.order.totalWithTax) }}</text></view>
    </view>

    <button class="checkout-page__submit" :disabled="submitting" @click="submitOrder">
      {{ submitting ? '处理中...' : '提交订单' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import PickupLocationSheet from '../../components/PickupLocationSheet.vue';
import RegionPicker from '../../components/RegionPicker.vue';
import type { PickupLocation } from '../../types/pickup';
import { useCartStore } from '../../stores/cart';
import { useUIStore } from '../../stores/ui';
import { getActiveOrder, getEligibleShippingMethods, getEligiblePaymentMethods } from '../../api/queries/order';
import { getActiveCustomer } from '../../api/queries/user';
import { getPickupLocations } from '../../api/queries/pickup';
import { setOrderShippingAddress, setOrderShippingMethod, transitionOrderToState, addPaymentToOrder, setOrderPickupLocation } from '../../api/mutations/checkout';
import { createCustomerAddress, updateCustomerAddress, deleteCustomerAddress } from '../../api/mutations/address';
import { handlePayment, type PaymentMethod } from '../../composables/usePayment';

type ShippingCategory = 'shipping' | 'store-pickup';

const cart = useCartStore();
const ui = useUIStore();
const shippingMethods = ref<any[]>([]);
const paymentMethods = ref<any[]>([]);
const selectedShipping = ref('');
const selectedPayment = ref('');
const submitting = ref(false);
const showAddressPicker = ref(false);
const customerAddresses = ref<any[]>([]);
const selectedAddress = ref<any>(null);
// 内嵌新增表单（无地址时显示）
const address = ref({ fullName: '', phoneNumber: '', streetLine1: '', streetLine2: '', city: '', province: '', district: '', postalCode: '', countryCode: 'CN', defaultShippingAddress: true });
// 弹窗新增/编辑表单
const showAddressForm = ref(false);
const editingAddressId = ref('');
const addressForm = ref({ fullName: '', phoneNumber: '', streetLine1: '', streetLine2: '', city: '', province: '', district: '', postalCode: '', countryCode: 'CN', defaultShippingAddress: false });
// 省市区联动选择器
const showRegionPicker = ref(false);
const regionTarget = ref<'inline' | 'modal'>('inline');

// 自提点相关 state
const shippingCategory = ref<ShippingCategory>('shipping');
const activeTab = ref<ShippingCategory>('shipping');
const selectedPickupLocation = ref<PickupLocation | null>(null);
const pickupLocations = ref<PickupLocation[]>([]);
const userLocation = ref<{ lat: number; lng: number } | null>(null);
const showPickupSheet = ref(false);
const pickupLoading = ref(false);

// 商品原价小计（元，保留两位）
const originalSubTotalYuan = computed(() => cart.formatPrice(cart.order?.subTotalWithTax || 0));
// 当前运费（元）：shippingLines 已含分区运费（campus/zone 相关 calculator 出价）
const shippingFee = computed(() => cart.formatPrice(cart.order?.shippingWithTax || 0));

// 按启用的配送方式分组为 Tab（waimai：自提 / 邮寄；校园配送 Tab 由 Task 6 加入）
const shippingTabs = computed(() => {
    const tabs: { category: ShippingCategory; label: string; method: any }[] = [];
    for (const sm of shippingMethods.value) {
        const cat = categorizeShipping(sm);
        if (!tabs.find(t => t.category === cat)) {
            tabs.push({ category: cat, label: tabLabel(cat), method: sm });
        }
    }
    return tabs;
});

function getPaymentIcon(code: string): string {
    const icons: Record<string, string> = { 'wechatpay': '💳', 'alipay': '💰', 'cod': '📦', 'balance-pay': '💵', 'aggregate-pay': '🧾' };
    return icons[code] || '💳';
}

function categorizeShipping(sm: any): ShippingCategory {
    if (sm.code === 'store-pickup') return 'store-pickup';
    return 'shipping';
}

function tabLabel(cat: ShippingCategory): string {
    const labels: Record<ShippingCategory, string> = {
        shipping: '邮寄',
        'store-pickup': '自提',
    };
    return labels[cat] || '配送方式';
}

function getLocationWithTimeout(ms: number): Promise<{ lat: number; lng: number } | null> {
    return new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), ms);
        uni.getLocation({
            type: 'gcj02',
            success: (res: any) => { clearTimeout(timer); resolve({ lat: res.latitude, lng: res.longitude }); },
            fail: () => { clearTimeout(timer); resolve(null); },
        });
    });
}

async function resolveLocation(): Promise<{ lat: number; lng: number } | null> {
    const pos = await getLocationWithTimeout(3000);
    if (pos) { userLocation.value = pos; return pos; }
    return null;
}

// 切换 Tab
async function switchTab(category: ShippingCategory) {
    activeTab.value = category;
    shippingCategory.value = category;
    selectedPickupLocation.value = null;

    const tab = shippingTabs.value.find(t => t.category === category);
    if (!tab) return;
    selectedShipping.value = tab.method.id;

    if (category === 'shipping') {
        // 快递方式：同步 shipping method 到后端，并用返回值更新订单（含运费）
        try {
            const res: any = await setOrderShippingMethod([tab.method.id]);
            if (res?.setOrderShippingMethod?.id) cart.setOrder(res.setOrderShippingMethod);
        } catch (e) { console.warn('[checkout] setOrderShippingMethod failed', e); }
        return;
    }

    // 自提：清空旧数据 + 进入加载态
    pickupLoading.value = true;
    pickupLocations.value = [];
    const location = await resolveLocation();
    try {
        const res: any = await getPickupLocations('store', location);
        pickupLocations.value = res.pickupLocations || [];
        if (pickupLocations.value.length > 0) {
            selectedPickupLocation.value = pickupLocations.value[0];
        }
    } catch (e) { console.warn('[checkout] load pickupLocations failed', e); }
    pickupLoading.value = false;
    // 同步 shipping method 到后端，并用返回值更新订单（含运费）
    try {
        const res: any = await setOrderShippingMethod([tab.method.id]);
        if (res?.setOrderShippingMethod?.id) cart.setOrder(res.setOrderShippingMethod);
    } catch (e) { console.warn('[checkout] setOrderShippingMethod failed', e); }
}

// 弹窗选中回调
function onPickupSelect(loc: PickupLocation) {
    selectedPickupLocation.value = loc;
}

// ===== 收货地址管理 =====
function emptyAddressForm() {
    return { fullName: '', phoneNumber: '', streetLine1: '', streetLine2: '', city: '', province: '', district: '', postalCode: '', countryCode: 'CN', defaultShippingAddress: false };
}

// 省市区显示文本
function regionText(form: any): string {
    if (form.province) {
        return [form.province, form.city, form.district].filter(Boolean).join(' ');
    }
    return '';
}

// 打开省市区选择器
function openRegionPicker(target: 'inline' | 'modal') {
    regionTarget.value = target;
    showRegionPicker.value = true;
}

// 省市区选择确认
function onRegionConfirm(region: { province: string; city: string; district: string }) {
    const form = regionTarget.value === 'inline' ? address.value : addressForm.value;
    form.province = region.province;
    form.city = region.city;
    form.district = region.district;
}

// 合并区+详细地址为 streetLine1（发送给后端时使用）
function buildStreetLine1(form: any): string {
    if (form.district) {
        return `${form.district} ${form.streetLine1}`.trim();
    }
    return form.streetLine1;
}

// 重新加载客户地址列表
async function reloadCustomerAddresses() {
    try {
        const custRes: any = await getActiveCustomer();
        customerAddresses.value = custRes.activeCustomer?.addresses || [];
    } catch (e) { console.warn('[checkout] reloadCustomerAddresses failed', e); }
}

// 选择地址（点击列表项）
function chooseAddress(addr: any) {
    selectedAddress.value = addr;
    showAddressPicker.value = false;
}

// 打开新增地址表单
function openAddForm() {
    editingAddressId.value = '';
    addressForm.value = emptyAddressForm();
    showAddressForm.value = true;
}

// 打开编辑地址表单
function openEditForm(addr: any) {
    editingAddressId.value = addr.id;
    addressForm.value = { ...addr, countryCode: addr.country?.code || 'CN', defaultShippingAddress: !!addr.defaultShippingAddress };
    showAddressForm.value = true;
}

// 保存地址表单（新增或编辑）
async function saveAddressForm() {
    if (!addressForm.value.fullName || !addressForm.value.phoneNumber || !addressForm.value.streetLine1) {
        ui.showToast('请填写完整地址信息');
        return;
    }
    try {
        ui.showLoading();
        const payload = { ...addressForm.value, streetLine1: buildStreetLine1(addressForm.value) };
        if (editingAddressId.value) {
            await updateCustomerAddress({ id: editingAddressId.value, ...payload });
        } else {
            await createCustomerAddress(payload);
        }
        ui.showToast('保存成功', 'success');
        showAddressForm.value = false;
        await reloadCustomerAddresses();
    } catch (e: any) { ui.showToast(e.message); }
    ui.hideLoading();
}

// 保存内嵌新增表单并使用
async function saveNewAddress() {
    if (!address.value.fullName || !address.value.phoneNumber || !address.value.streetLine1) {
        ui.showToast('请填写完整地址信息');
        return;
    }
    try {
        ui.showLoading();
        const res: any = await createCustomerAddress({ ...address.value, streetLine1: buildStreetLine1(address.value) });
        const newId = res?.createCustomerAddress?.id;
        await reloadCustomerAddresses();
        if (newId) {
            selectedAddress.value = customerAddresses.value.find((a: any) => a.id === newId) || null;
        }
        ui.showToast('保存成功', 'success');
    } catch (e: any) { ui.showToast(e.message); }
    ui.hideLoading();
}

// 删除地址
async function deleteAddress(id: string) {
    return new Promise<void>((resolve) => {
        uni.showModal({
            title: '删除地址',
            content: '确定删除该收货地址?',
            success: async (r: any) => {
                if (r.confirm) {
                    try {
                        ui.showLoading();
                        await deleteCustomerAddress(id);
                        if (selectedAddress.value?.id === id) selectedAddress.value = null;
                        await reloadCustomerAddresses();
                        ui.showToast('已删除', 'success');
                    } catch (e: any) { ui.showToast(e.message); }
                    ui.hideLoading();
                }
                resolve();
            },
        });
    });
}

// 设为默认地址
async function setDefaultAddress(addr: any) {
    try {
        ui.showLoading();
        await updateCustomerAddress({ id: addr.id, defaultShippingAddress: true });
        ui.showToast('已设为默认', 'success');
        await reloadCustomerAddresses();
        // 同步当前选中地址
        if (selectedAddress.value?.id === addr.id) {
            selectedAddress.value = customerAddresses.value.find((a: any) => a.id === addr.id) || selectedAddress.value;
        }
    } catch (e: any) { ui.showToast(e.message); }
    ui.hideLoading();
}

onMounted(async () => {
    // Load saved addresses
    try { const custRes: any = await getActiveCustomer(); customerAddresses.value = custRes.activeCustomer?.addresses || []; if (customerAddresses.value.length > 0) { selectedAddress.value = customerAddresses.value.find((a: any) => a.defaultShippingAddress) || customerAddresses.value[0]; } } catch (e) {}
    try {
        const orderRes: any = await getActiveOrder();
        if (orderRes.activeOrder) cart.setOrder(orderRes.activeOrder);

        const [shipRes, payRes]: any = await Promise.all([getEligibleShippingMethods(), getEligiblePaymentMethods()]);
        shippingMethods.value = shipRes.eligibleShippingMethods || [];

        // 支付方式
        const payList = (payRes.eligiblePaymentMethods || []).filter((p: any) => p.isEligible);
        const seen = new Set<string>();
        paymentMethods.value = payList.filter((p: any) => {
            if (seen.has(p.code)) return false;
            seen.add(p.code);
            return true;
        });
        if (paymentMethods.value.length > 0) selectedPayment.value = paymentMethods.value[0].code;
        // 默认选中第一个 Tab
        if (shippingTabs.value.length > 0) {
            await switchTab(shippingTabs.value[0].category);
        }
    } catch (e) { console.error(e); }
});

/**
 * 为当前 active order 设置地址/自提点 + 配送方式
 * 返回是否成功（校验失败时为 false）
 */
async function prepareOrderAddressAndShipping(): Promise<boolean> {
    if (shippingCategory.value === 'shipping') {
        // 邮寄方式：设置收货地址
        if (!selectedAddress.value) {
            // 没有已选地址，尝试用内嵌表单数据
            if (!address.value.fullName || !address.value.phoneNumber || !address.value.streetLine1) {
                ui.showToast('请填写收货地址');
                return false;
            }
            await setOrderShippingAddress({ ...address.value, streetLine1: buildStreetLine1(address.value) });
        } else {
            // 已有地址，传 id 让后端关联
            await setOrderShippingAddress({
                id: selectedAddress.value.id,
                fullName: selectedAddress.value.fullName,
                phoneNumber: selectedAddress.value.phoneNumber,
                streetLine1: selectedAddress.value.streetLine1,
                streetLine2: selectedAddress.value.streetLine2 || '',
                city: selectedAddress.value.city,
                province: selectedAddress.value.province,
                postalCode: selectedAddress.value.postalCode || '',
                countryCode: selectedAddress.value.country?.code || 'CN',
            });
        }
    } else {
        // 自提方式：设置自提点
        if (!selectedPickupLocation.value) {
            ui.showToast('请选择自提点');
            return false;
        }
        await setOrderPickupLocation(selectedPickupLocation.value.id, shippingCategory.value);
    }
    // Set shipping method
    if (selectedShipping.value) await setOrderShippingMethod([selectedShipping.value]);
    return true;
}

/**
 * 对当前 active order 提交支付
 * 返回跳转用的订单号
 */
async function payCurrentOrder(method: string): Promise<string> {
    // Build payment metadata (wechatpay JSAPI requires openid)
    const paymentMetadata: Record<string, any> = {};
    if (method === 'wechatpay') {
        const openid = uni.getStorageSync('auth_openid');
        if (openid) paymentMetadata.openid = openid;
    }
    // Add payment
    const payRes: any = await addPaymentToOrder(method, paymentMetadata);
    const order = payRes.addPaymentToOrder;
    if (order?.state === 'PaymentSettled' || order?.state === 'PaymentAuthorized') {
        return order.code;
    }
    // 从最新一笔 payment 取 metadata（后端在 payment.metadata 中返回支付参数）
    const lastPayment = order?.payments?.[order.payments.length - 1];
    const result = await handlePayment(method as PaymentMethod, {
        ...lastPayment,
        orderCode: order?.code,
        orderState: order?.state,
    });
    return result.success ? order?.code : '';
}

async function submitOrder() {
    if (submitting.value) return;
    submitting.value = true;
    try {
        ui.showLoading();
        const ok = await prepareOrderAddressAndShipping();
        if (!ok) return;
        // Transition to ArrangingPayment
        await transitionOrderToState('ArrangingPayment');
        const code = await payCurrentOrder(selectedPayment.value);
        uni.redirectTo({ url: `/pkg-order/pages/pay-result?code=${encodeURIComponent(code)}&status=success` });
    } catch (e: any) { ui.showToast(e.message); }
    ui.hideLoading();
    submitting.value = false;
}

// 页面参数预留（Task 6 校园配送 Tab 会透传店铺 routes）
onLoad((q: any) => {
    void q;
});
</script>

<style lang="scss" scoped>
.checkout-page { padding: 20rpx 20rpx 180rpx; }
.section { background: #fff; border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx; &__title { font-size: 28rpx; font-weight: bold; display: block; margin-bottom: 20rpx; } }
.seg-control { display: flex; gap: 16rpx; &__item { flex: 1; text-align: center; padding: 18rpx 0; font-size: 26rpx; border-radius: $radius-md; background: $bg-color; color: $text-color-secondary; border: 1rpx solid transparent; &.active { background: $brand-color-light; color: $brand-color; border-color: $brand-color; font-weight: 600; } } }
.input { width: 100%; height: 80rpx; background: $bg-color; border-radius: $radius-sm; padding: 0 20rpx; font-size: 26rpx; margin-bottom: 16rpx; box-sizing: border-box; }
.region-row { display: flex; justify-content: space-between; align-items: center; height: 80rpx; background: $bg-color; border-radius: $radius-sm; padding: 0 20rpx; font-size: 26rpx; margin-bottom: 16rpx; &__placeholder { color: $text-color-placeholder; } &__arrow { color: #ccc; } }
.address-form { &__tip { font-size: 24rpx; color: $text-color-secondary; margin-bottom: 16rpx; } &__check { display: flex; justify-content: space-between; align-items: center; font-size: 26rpx; margin: 8rpx 0 16rpx; } &__save { height: 80rpx; line-height: 80rpx; background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; border: none; } }
.address-block { position: relative; &__top { display: flex; align-items: center; gap: 16rpx; } &__name { font-size: 30rpx; font-weight: 600; } &__phone { font-size: 26rpx; color: $text-color-secondary; } &__tag { font-size: 20rpx; color: $brand-color; border: 1rpx solid $brand-color; border-radius: 6rpx; padding: 0 8rpx; } &__detail { display: block; font-size: 26rpx; color: $text-color-secondary; margin-top: 12rpx; line-height: 1.5; } &__change { display: block; text-align: right; font-size: 24rpx; color: $brand-color; margin-top: 8rpx; } }
.addr-modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 300; display: flex; align-items: flex-end; }
.addr-modal { width: 100%; max-height: 75vh; background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 24rpx; box-sizing: border-box; display: flex; flex-direction: column; &__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; } &__title { font-size: 30rpx; font-weight: 600; } &__close { font-size: 32rpx; color: #ccc; padding: 8rpx; } &__list { flex: 1; max-height: 55vh; } &__empty { text-align: center; padding: 60rpx 0; color: $text-color-placeholder; font-size: 26rpx; } &__fab { margin-top: 20rpx; height: 80rpx; line-height: 80rpx; text-align: center; border-radius: $radius-md; background: $brand-color-light; color: $brand-color; font-size: 28rpx; &--save { background: $brand-color; color: #fff; } } }
.addr-option { border: 1rpx solid $border-color; border-radius: $radius-md; padding: 20rpx; margin-bottom: 16rpx; &.selected { border-color: $brand-color; background: $brand-color-light; } &__top { display: flex; align-items: center; gap: 12rpx; } &__name { font-size: 28rpx; font-weight: 600; } &__phone { font-size: 24rpx; color: $text-color-secondary; } &__tag { font-size: 20rpx; color: $brand-color; border: 1rpx solid $brand-color; border-radius: 6rpx; padding: 0 8rpx; } &__detail { display: block; font-size: 24rpx; color: $text-color-secondary; margin-top: 8rpx; } &__actions { display: flex; gap: 24rpx; margin-top: 12rpx; font-size: 24rpx; } &__edit { color: $brand-color; } &__del { color: #999; } &__default { color: $text-color-secondary; } }
.pickup-card { border: 1rpx solid $border-color; border-radius: $radius-md; padding: 20rpx; &__name { font-size: 28rpx; font-weight: 600; display: block; } &__addr { display: block; font-size: 24rpx; color: $text-color-secondary; margin-top: 8rpx; } &__meta { display: flex; gap: 16rpx; margin-top: 8rpx; } &__hours, &__dist { font-size: 22rpx; color: #999; } &__change { display: block; text-align: right; font-size: 24rpx; color: $brand-color; margin-top: 8rpx; } }
.pickup-empty { text-align: center; padding: 30rpx 0; color: $text-color-secondary; font-size: 26rpx; &__loading { color: $text-color-placeholder; } &__hint { display: block; font-size: 22rpx; color: $text-color-placeholder; margin-top: 8rpx; } &__btn { margin-top: 16rpx; } &__btn--primary { background: $brand-color; color: #fff; } }
.radio-item { display: flex; justify-content: space-between; align-items: center; padding: 20rpx; border: 1rpx solid $border-color; border-radius: $radius-md; margin-bottom: 16rpx; font-size: 26rpx; &.active { border-color: $brand-color; background: $brand-color-light; } &__left { display: flex; align-items: center; gap: 12rpx; } &__icon { font-size: 32rpx; } &__balance { font-size: 24rpx; color: $text-color-secondary; } }
.checkout-page__summary { background: #fff; border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx; }
.summary-row { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 26rpx; color: $text-color-secondary; &--total { border-top: 1rpx solid $border-color; margin-top: 8rpx; padding-top: 16rpx; color: $text-color; font-size: 28rpx; } }
.checkout-page__total { color: $price-color; font-size: 36rpx; font-weight: bold; }
.checkout-page__submit { position: fixed; left: 20rpx; right: 20rpx; bottom: calc(20rpx + env(safe-area-inset-bottom)); height: 88rpx; line-height: 88rpx; background: $brand-color; color: #fff; font-size: 30rpx; border-radius: 999rpx; border: none; &[disabled] { opacity: 0.6; } }
</style>
