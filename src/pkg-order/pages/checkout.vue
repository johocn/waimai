<template>
  <view class="checkout-page">
    <!-- 配送方式（校园配送恒显置首，自提/邮寄按渠道启用情况显示） -->
    <view class="section">
      <text class="section__title">配送方式</text>
      <view class="seg-control">
        <view
          v-for="tab in shippingTabs"
          :key="tab.key"
          class="seg-control__item"
          :class="{ active: activeTab === tab.key }"
          @click="switchTab(tab.key)"
        >
          <text>{{ tab.label }}</text>
        </view>
      </view>
    </view>

    <!-- 校园配送面板（waimai 核心方式）：分区 → 宿舍楼 → 送达时段 + 路线说明 -->
    <view class="section" v-if="activeTab === 'campus'">
      <text class="section__title">配送目标</text>
      <view v-if="zonesLoading" class="campus-empty"><text>加载中...</text></view>
      <view v-else-if="!zones.length" class="campus-empty">
        <text>暂未配置配送分区</text>
        <text class="campus-empty__hint">请选择其他配送方式</text>
      </view>
      <template v-else>
        <view class="campus-default" v-if="defaultAddressSummary" @click="scrollToZones">
          <text class="campus-default__txt">默认地址：{{ defaultAddressSummary }}</text>
          <text class="campus-default__chg">改选</text>
        </view>
        <view class="campus-label">选择分区</view>
        <view class="chip-row">
          <view v-for="z in zones" :key="z.id" class="chip" :class="{ on: zoneId === z.id }" @click="chooseZone(z)">
            {{ z.name }}<text v-if="z.fee != null" class="chip__sub"> ¥{{ (z.fee / 100).toFixed(2) }}</text>
          </view>
        </view>
        <view class="campus-label">选择宿舍楼</view>
        <view class="chip-row">
          <view v-for="b in buildings" :key="b.id" class="chip" :class="{ on: buildingId === b.id }" @click="buildingId = b.id">
            {{ b.name }}<text v-if="b.detail" class="chip__sub"> {{ b.detail }}</text>
          </view>
          <view v-if="!buildings.length" class="campus-empty__hint">该分区暂无宿舍楼</view>
        </view>
        <view class="campus-label">送达时段（不选=尽快送，可选未来日期预约）</view>
        <view class="chip-row">
          <view class="chip" :class="{ on: !slotDate }" @click="clearSlotPick">尽快送</view>
          <view v-for="d in slotDates" :key="d" class="chip" :class="{ on: slotDate === d }" @click="pickDate(d)">
            {{ dateLabel(d) }}
          </view>
        </view>
        <view class="chip-row" v-if="slotDate">
          <view v-for="s in slotsOfDate" :key="s.id" class="chip" :class="{ on: slotId === s.id }" @click="slotId = s.id">
            {{ s.startTime }}-{{ s.endTime }} 剩{{ s.capacity - s.lockedCount }}位
          </view>
          <view v-if="!slotsOfDate.length" class="campus-empty__hint">该日期暂无可订时段</view>
        </view>
        <view v-if="selectedSlotFuture" class="slot-schedule-hint">预约单将在送达时段前 30 分钟自动进入配送调度</view>
        <view class="route-row" v-if="campusRoutes.length">
          <text class="route-row__text">{{ routeText }}</text>
          <text v-if="canSwitchRoute" class="route-row__switch" @click="toggleRoute">切换</text>
        </view>
        <text v-if="routeChoice === 'R2'" class="route-fee-hint">快递运费按商家快递标准收取；校内接力段 ¥0，接力费用在「发接力单」时单独支付</text>
      </template>
    </view>

    <!-- 收货地址（仅邮寄方式显示） -->
    <view class="section" v-if="activeTab === 'shipping'">
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
          <text>{{ getPaymentName(pm) }}</text>
        </view>
      </view>
    </view>

    <view class="checkout-page__summary" v-if="cart.order">
      <view class="summary-row"><text>商品总额</text><text>¥{{ originalSubTotalYuan }}</text></view>
      <view class="summary-row" v-if="activeTab === 'campus' && deliveryFeeFen != null"><text>配送费</text><text>¥{{ (deliveryFeeFen / 100).toFixed(2) }}</text></view>
      <view class="summary-row" v-if="activeTab === 'campus' && minOrderFen != null"><text>起送价</text><text>满 ¥{{ (minOrderFen / 100).toFixed(2) }} 起送</text></view>
      <view class="summary-row"><text>运费</text>
        <text v-if="freeShipOn"><text class="ship-orig">¥{{ shipOriginalYuan }}</text>¥0.00<text class="ship-tag">满¥{{ freeShipYuan }}免配送费</text></text>
        <text v-else>¥{{ shipDisplayYuan }}</text>
      </view>
      <view class="ship-free-hint" v-if="freeShipShortYuan">满 ¥{{ freeShipYuan }} 免配送费，再买 ¥{{ freeShipShortYuan }} 即免</view>
      <view class="summary-row summary-row--coupon" @click="openCouponSheet">
        <text>优惠券</text>
        <text :class="{ 'coupon-val': attachedCoupon }">
          {{ couponRowText }}
          <text class="coupon-arrow">›</text>
        </text>
      </view>
      <view class="summary-row summary-row--total"><text>应付</text><text class="checkout-page__total">¥{{ cart.formatPrice(cart.order.totalWithTax) }}</text></view>
    </view>

    <button class="checkout-page__submit" :disabled="submitting" @click="submitOrder">
      {{ submitting ? '处理中...' : '提交订单' }}
    </button>

    <!-- 选券弹层（spec §3.3）：换券/不使用实时回显合计，门槛未过置灰 -->
    <view class="coupon-sheet-mask" v-if="showCouponSheet" @click="showCouponSheet = false">
      <view class="coupon-sheet" @click.stop>
        <view class="coupon-sheet__title">选择优惠券</view>
        <scroll-view scroll-y class="coupon-sheet__list">
          <view class="cs-item" v-for="c in sheetCoupons" :key="c.id"
            :class="{ 'cs-item--on': attachedCouponCode === c.code, 'cs-item--off': !!unavailableReason(c) }"
            @click="pickCoupon(c)">
            <view class="cs-item__left">
              <text class="cs-item__amount">{{ csAmount(c) }}</text>
              <text class="cs-item__cond" v-if="c.template.type === 'FULL'">满 {{ csYuan(c.template.minSpend) }} 可用</text>
            </view>
            <view class="cs-item__right">
              <text class="cs-item__name">{{ c.template.name }}</text>
              <text class="cs-item__expire" v-if="c.expiredAt">有效期至 {{ csDate(c.expiredAt) }}</text>
              <text class="cs-item__reason" v-if="unavailableReason(c)">{{ unavailableReason(c) }}</text>
            </view>
          </view>
          <view class="cs-item cs-item--none" @click="clearCoupon">
            <text>不使用优惠券</text>
          </view>
        </scroll-view>
      </view>
    </view>
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
import { getActiveOrder, getEligibleShippingMethods, getOrderByCode } from '../../api/queries/order';
import { getActiveCustomer, getEligiblePaymentMethods } from '../../api/queries/user';
import { getPickupLocations } from '../../api/queries/pickup';
import { setOrderShippingAddress, setOrderShippingMethod, transitionOrderToState, addPaymentToOrder, setOrderPickupLocation, cancelPayment } from '../../api/mutations/checkout';
import { setDeliveryTarget, fetchZones, fetchBuildings, fetchSlots } from '../../api/mutations/campus';
import { createCustomerAddress, updateCustomerAddress, deleteCustomerAddress } from '../../api/mutations/address';
import { handlePayment, type PaymentMethod } from '../../composables/usePayment';
import { useTenantStore } from '../../stores/tenant';
import { fetchStoreList } from '../../api/queries/waimai';
import { filterCampusRoutes } from '../../utils/errand';
import { pickDefaultCampusAddress, isValidCampusTarget } from '../../utils/profile-mapping';
import { useAuthStore } from '../../stores/auth';
import { getMyCoupons } from '../../api/queries/coupon';
import { applyCouponToOrder, clearCouponFromOrder } from '../../api/mutations/coupon';
import { estimateDiscountFen, pickBestCoupon, couponUnavailableReason, type CouponTemplateLike } from '../../utils/coupon-estimate';

type ShippingCategory = 'shipping' | 'store-pickup';
type TabKey = 'campus' | ShippingCategory;

const cart = useCartStore();
const ui = useUIStore();
const tenantStore = useTenantStore();
const authStore = useAuthStore();
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
const activeTab = ref<TabKey>('campus');
const selectedPickupLocation = ref<PickupLocation | null>(null);
const pickupLocations = ref<PickupLocation[]>([]);
const userLocation = ref<{ lat: number; lng: number } | null>(null);
const showPickupSheet = ref(false);
const pickupLoading = ref(false);

// ===== 校园配送（Task 6）：分区 → 宿舍楼 → 送达时段 + 路线判定 =====
const campusRoutes = ref<string[]>([]);            // 店铺 routesEnabled（URL 透传兜底，onLoad 后动态刷新）
const routeChoice = ref<'R3' | 'R1' | 'R2'>('R3');
const zones = ref<any[]>([]);
const buildings = ref<any[]>([]);
const slots = ref<any[]>([]);
const zoneId = ref('');
const buildingId = ref('');
const slotId = ref<string | number>('');
const slotDate = ref('');                        // 预约日期筛选（plan 3.1；''=尽快送）
const zonesLoading = ref(false);
const minOrderFen = ref<number | null>(null);   // 起送价（分，URL 透传；null=未配置）
const deliveryFeeFen = ref<number | null>(null); // 配送费（分，仅展示）
const freeShipFen = ref<number | null>(null);    // 满X元免配送费门槛（分；null/0=不启用，plan 3.2）
const defaultAddressSummary = ref('');           // 默认校园地址摘要（Task 10，可点击改选）

// checkout 可选路线（R1/R2/R3 保序）；R2 二期加入轮换
const campusRouteOptions = computed(() => filterCampusRoutes(campusRoutes.value));
const canSwitchRoute = computed(() => campusRouteOptions.value.length > 1);
const routeText = computed(() => {
    if (!campusRoutes.value.length) return '配送路线以商家实际安排为准';
    if (routeChoice.value === 'R1') return '商家送至校门口，拾光传信者接力送到手（R1）';
    if (routeChoice.value === 'R2') return '快递到校，拾光传信者接力送到手（R2）';
    return '档口现做，拾光传信者送至楼层（R3）';
});
// DeliverySlot 无 remaining 字段，余量 = capacity - lockedCount（schema 校准）
const slotsWithRemain = computed(() => slots.value.filter(s => s.capacity - s.lockedCount > 0));

// ===== 预约日期（plan 3.1）：日期 tab → 时段 chips 两级选择 =====
const fmtDate = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const todayStr = fmtDate(new Date());
const tomorrowStr = fmtDate(new Date(Date.now() + 86_400_000));
const slotDates = computed(() => [...new Set(slotsWithRemain.value.map(s => s.slotDate))].sort());
const slotsOfDate = computed(() => slotsWithRemain.value.filter(s => s.slotDate === slotDate.value));
const selectedSlotFuture = computed(() => {
    const s = slotsWithRemain.value.find(x => x.id === slotId.value);
    return !!s && s.slotDate > todayStr; // 今天余下时段照旧即时调度，仅未来日期提示预约
});
function dateLabel(d: string): string {
    if (d === todayStr) return '今天';
    if (d === tomorrowStr) return '明天';
    return d.slice(5); // MM-DD
}
function pickDate(d: string) { slotDate.value = d; slotId.value = ''; }
function clearSlotPick() { slotDate.value = ''; slotId.value = ''; }

function toggleRoute() {
    const opts = campusRouteOptions.value;
    if (opts.length < 2) return;
    const i = opts.indexOf(routeChoice.value);
    routeChoice.value = opts[(i + 1) % opts.length] as 'R3' | 'R1' | 'R2';
}

// 二期 §5.1：路线组按店铺 routesEnabled 动态刷新（URL 透传作兜底）
async function loadStoreRoutes() {
    try {
        const stores = await fetchStoreList();
        const store = stores.find((s: any) => s.channelToken === tenantStore.token);
        freeShipFen.value = store?.freeShippingThreshold ?? null;
        const routes = filterCampusRoutes(store?.routesEnabled);
        if (routes.length) {
            campusRoutes.value = routes;
            if (!routes.includes(routeChoice.value)) routeChoice.value = routes[0] as 'R3' | 'R1' | 'R2';
        }
    } catch (e) { /* 拉取失败保留 URL 兜底 */ }
}

/** 默认校园地址预选（spec §3.3）：zone/building 命中当前店铺配置才生效，时段仍需手选；命中返回目标，未命中返回 null */
async function applyDefaultAddress(): Promise<{ zoneId: string; buildingId: string } | null> {
    try {
        const cust: any = await getActiveCustomer();
        const hit = pickDefaultCampusAddress(cust?.activeCustomer?.addresses || []);
        if (!hit?.customFields?.zoneId || !hit.customFields.buildingId) return null;
        const { zoneId: zid, buildingId: bid } = hit.customFields;
        if (!isValidCampusTarget(zid as string, bid as string, zones.value, buildings.value)) {
            if (zones.value.length && !zones.value.some((z) => String(z.id) === String(zid))) return null; // 跨店铺脏数据，静默忽略
            const bds = await fetchBuildings(zid as string);
            if (!isValidCampusTarget(zid as string, bid as string, zones.value, bds)) return null;
        }
        if (!zoneId.value) zoneId.value = zid as string;
        if (!buildingId.value && zoneId.value === zid) buildingId.value = bid as string;
        defaultAddressSummary.value = `${hit.fullName || ''} ${hit.phoneNumber || ''} · ${hit.streetLine1 || ''}`.trim();
        return { zoneId: zid as string, buildingId: bid as string };
    } catch (e) { console.error('默认地址预选失败', e); return null; }
}

function scrollToZones() { uni.showToast({ title: '可在下方重新选择分区楼栋', icon: 'none' }); }

async function chooseZone(z: any) {
    zoneId.value = z.id;
    buildingId.value = '';
    try {
        buildings.value = await fetchBuildings(z.id);
        if (buildings.value.length) buildingId.value = buildings.value[0].id;
    } catch (e) { buildings.value = []; }
}

async function loadCampusData() {
    zonesLoading.value = true;
    try {
        zones.value = await fetchZones();
        if (zones.value.length) {
            // Task 10：默认校园地址预选——命中当前店铺分区时，初始选中从 zones[0] 切到默认地址的 zone/building
            const hit = await applyDefaultAddress();
            const target = (hit && zones.value.find((z: any) => String(z.id) === String(hit.zoneId))) || zones.value[0];
            await chooseZone(target);
            if (hit && buildings.value.some((b: any) => String(b.id) === String(hit.buildingId))) {
                buildingId.value = hit.buildingId; // chooseZone 默认选首楼，纠正回默认地址楼栋
            }
        }
        slots.value = await fetchSlots();
    } catch (e) { zones.value = []; }
    zonesLoading.value = false;
}

async function saveCampusTarget(): Promise<boolean> {
    if (!zoneId.value || !buildingId.value) {
        ui.showToast('请选择宿舍楼');
        return false;
    }
    // 选了预约日期但没选具体时段 → 提示补全（或切回尽快送）
    if (slotDate.value && !slotId.value) {
        ui.showToast('请选择具体送达时段，或点「尽快送」');
        return false;
    }
    await setDeliveryTarget({
        zoneId: zoneId.value,
        buildingId: buildingId.value,
        route: routeChoice.value,
        slotId: slotId.value ? Number(slotId.value) : undefined,
    });
    return true;
}

// 商品原价小计（元，保留两位）
const originalSubTotalYuan = computed(() => cart.formatPrice(cart.order?.subTotalWithTax || 0));
// 当前运费（元）：shippingLines 已含分区运费（campus/zone 相关 calculator 出价）
const shippingFee = computed(() => cart.formatPrice(cart.order?.shippingWithTax || 0));

// ===== plan 3.2 满X免配送费（方案A：运费行内减免明细） =====
const campusRouteSel = computed(() => activeTab.value === 'campus' && ['R1', 'R3'].includes(routeChoice.value));
const selectedZoneFeeFen = computed(() => {
    const z = zones.value.find(x => String(x.id) === String(zoneId.value));
    return z ? Number(z.fee) : null;   // 分区运费（campusZones 出价，提交前预估口径）
});
const goodsFen = computed(() => cart.order?.subTotalWithTax || 0);
const freeShipOn = computed(() =>
    campusRouteSel.value && freeShipFen.value != null && freeShipFen.value > 0
    && goodsFen.value >= freeShipFen.value);
const freeShipShortFen = computed(() => {
    if (!campusRouteSel.value || freeShipFen.value == null || freeShipFen.value <= 0) return 0;
    return goodsFen.value < freeShipFen.value ? freeShipFen.value - goodsFen.value : 0;
});
// 运费行展示值：校园 R1/R3 提交前未出价（shippingWithTax=0），有分区时预显示分区运费
const shipDisplayYuan = computed(() => {
    if (campusRouteSel.value && selectedZoneFeeFen.value != null && !freeShipOn.value) {
        return (selectedZoneFeeFen.value / 100).toFixed(2);
    }
    return shippingFee.value;
});
const shipOriginalYuan = computed(() => selectedZoneFeeFen.value != null ? (selectedZoneFeeFen.value / 100).toFixed(2) : '');
const freeShipYuan = computed(() => freeShipFen.value != null ? (freeShipFen.value / 100).toFixed(2) : '');
const freeShipShortYuan = computed(() => freeShipShortFen.value ? (freeShipShortFen.value / 100).toFixed(2) : '');

// Tab = 校园配送（恒显置首）+ eligible 启用的自提/邮寄
const shippingTabs = computed(() => {
    const tabs: { key: TabKey; label: string; method?: any }[] = [{ key: 'campus', label: '拾光达配送' }];
    for (const sm of shippingMethods.value) {
        const cat = categorizeShipping(sm);
        if (!tabs.find(t => t.key === cat)) {
            tabs.push({ key: cat, label: tabLabel(cat), method: sm });
        }
    }
    return tabs;
});

function getPaymentIcon(code: string): string {
    const icons: Record<string, string> = { 'wechatpay': '💳', 'alipay': '💰', 'cod': '📦', 'balance-pay': '💵', 'aggregate-pay': '🧾' };
    return icons[code] || '💳';
}

// PM 展示名：管理端 name 缺失或为原始 code 时按内置中文名兜底（extra PM 如 wechatpay-yourbao-h5）
function getPaymentName(pm: any): string {
    if (pm.name && pm.name !== pm.code) return pm.name;
    const labels: Record<string, string> = {
        'wechatpay': '微信支付', 'wechatpay-yourbao-h5': '微信支付', 'alipay': '支付宝',
        'cod': '货到付款', 'balance-pay': '余额支付', 'aggregate-pay': '聚合收款',
    };
    return labels[pm.code] || pm.code;
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
async function switchTab(key: TabKey) {
    activeTab.value = key;
    selectedPickupLocation.value = null;

    if (key === 'campus') {
        // 校园配送：运费 method（campus-errand-smoke）在 fulfillmentRoute 写入前不 eligible
        // （campusErrandCalculator 对无路线单返回 undefined），故此处不预选，提交时先写 target 再选
        if (!zones.value.length && !zonesLoading.value) await loadCampusData();
        return;
    }

    shippingCategory.value = key;
    const tab = shippingTabs.value.find(t => t.key === key);
    if (!tab) return;
    selectedShipping.value = tab.method.id;

    if (key === 'shipping') {
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

// ===== 优惠券（spec §3.3）：优惠券行 + 选券弹层 + 自动试挂最优 =====
const myUnusedCoupons = ref<any[]>([]);
const showCouponSheet = ref(false);
const couponApplying = ref(false);
const autoTried = ref(false); // 每次进入 checkout 只自动试挂一次
// 「去使用」预挂券（my-coupons 写入 storage，onLoad 读取）
const prefillCouponCode = ref('');

const attachedCouponCode = computed(() => cart.order?.couponCodes?.[0] ?? '');

const subtotalFen = computed(() => cart.order?.subTotalWithTax ?? 0);
const shippingFen = computed(() => {
    if (cart.order?.shippingWithTax != null) return cart.order.shippingWithTax;
    return null; // FREE_SHIPPING 估不到配送费时按 0
});

const couponRowText = computed(() => {
    if (attachedCouponCode.value) {
        const d = (cart.order?.discounts ?? []).reduce((s: number, x: any) => s + (x.amountWithTax ?? 0), 0);
        return d > 0 ? `-¥${cart.formatPrice(d)}` : attachedCouponCode.value;
    }
    return myUnusedCoupons.value.length ? `${myUnusedCoupons.value.length} 张可用` : '暂无可用';
});

const attachedCoupon = computed(() => !!attachedCouponCode.value);

const sheetCoupons = computed(() =>
    [...myUnusedCoupons.value].sort((a, b) =>
        estimateDiscountFen(b.template, subtotalFen.value, shippingFen.value) - estimateDiscountFen(a.template, subtotalFen.value, shippingFen.value)));

function unavailableReason(c: any): string | null {
    return couponUnavailableReason(c.template as CouponTemplateLike, subtotalFen.value);
}

function csAmount(c: any): string {
    const t = c.template;
    if (t.type === 'PERCENT') return `${(t.discountValue / 10).toFixed(1).replace(/\.0$/, '')}折`;
    if (t.type === 'FREE_SHIPPING') return '免运费';
    const yuan = t.discountValue / 100;
    return `¥${Number.isInteger(yuan) ? yuan : yuan.toFixed(2)}`;
}

function csYuan(fen: number): string {
    const yuan = fen / 100;
    return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

function csDate(s: string): string {
    const d = new Date(s);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

async function loadMyCoupons() {
    if (!authStore.isLoggedIn) return; // checkout 必然已登录，防御
    try {
        const res = await getMyCoupons('UNUSED');
        myUnusedCoupons.value = res?.myCoupons ?? [];
    } catch { myUnusedCoupons.value = []; }
}

function openCouponSheet() {
    showCouponSheet.value = true;
}

async function pickCoupon(c: any) {
    if (couponApplying.value || unavailableReason(c)) return;
    if (attachedCouponCode.value === c.code) { showCouponSheet.value = false; return; }
    couponApplying.value = true;
    try {
        const res = await applyCouponToOrder(c.code);
        cart.setOrder(res.applyCouponToOrder); // 实时回显新合计（Order fragment 已含 couponCodes+discounts）
        showCouponSheet.value = false;
    } catch (e: any) {
        // 并发用掉/订单态变化：toast + 刷新弹层券列表 + 重算费用，不阻塞下单
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '用券失败', icon: 'none' });
        await loadMyCoupons();
    } finally {
        couponApplying.value = false;
    }
}

async function clearCoupon() {
    if (couponApplying.value || !attachedCouponCode.value) { showCouponSheet.value = false; return; }
    couponApplying.value = true;
    try {
        const res = await clearCouponFromOrder();
        cart.setOrder(res.clearCouponFromOrder);
        showCouponSheet.value = false;
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '操作失败', icon: 'none' });
    } finally {
        couponApplying.value = false;
    }
}

/** 消费「去使用」预挂券：购物车就绪后挂券并清 storage，优先于自动试挂 */
async function consumePrefillCoupon() {
    if (!prefillCouponCode.value) return;
    const code = prefillCouponCode.value;
    prefillCouponCode.value = '';
    uni.removeStorageSync('checkout_prefill_coupon');
    if (attachedCouponCode.value) return;
    try {
        const res: any = await applyCouponToOrder(code);
        cart.setOrder(res.applyCouponToOrder);
        uni.showToast({ title: '已使用优惠券', icon: 'none' });
    } catch { /* 预挂失败静默（券可能已用/失效），可手动选 */ }
}

/** 自动试挂最优（spec §3.3）：进入 checkout 未挂券时按口径取最大者 */
async function tryAutoApplyBest() {
    if (autoTried.value || attachedCouponCode.value || !myUnusedCoupons.value.length) return;
    autoTried.value = true;
    const best = pickBestCoupon(
        myUnusedCoupons.value.map(c => ({ ...c.template, code: c.code })),
        subtotalFen.value, shippingFen.value,
    );
    if (!best) return;
    try {
        const res = await applyCouponToOrder((best as any).code);
        cart.setOrder(res.applyCouponToOrder);
        uni.showToast({ title: '已自动使用最优优惠券', icon: 'none' });
    } catch { /* 试挂失败静默，用户可手动选 */ }
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
        // H5（yourbao 站专属）：微信 PM 只保留本站公众号 JSAPI 方法——
        // wechatpay 为小程序专用（公众号内 appid 不匹配），wechatpay-youshop-jsapi 为他站公众号
        // #ifdef H5
        const visiblePayList = payList.filter((p: any) => p.code === 'wechatpay-yourbao-h5' || !p.code.includes('wechatpay'));
        // #endif
        // #ifndef H5
        const visiblePayList = payList;
        // #endif
        const seen = new Set<string>();
        paymentMethods.value = visiblePayList.filter((p: any) => {
            if (seen.has(p.code)) return false;
            seen.add(p.code);
            return true;
        });
        if (paymentMethods.value.length > 0) {
            // H5（yourbao 站专属）默认选中公众号 JSAPI PM，避免同名/多微信 PM 时默认选错；
            // 小程序端保持列表首位
            // #ifdef H5
            const preferred = paymentMethods.value.find((p: any) => p.code === 'wechatpay-yourbao-h5') || paymentMethods.value[0];
            // #endif
            // #ifndef H5
            const preferred = paymentMethods.value[0];
            // #endif
            selectedPayment.value = preferred.code;
        }
        // 默认选中第一个 Tab（校园配送恒置首）
        if (shippingTabs.value.length > 0) {
            await switchTab(shippingTabs.value[0].key);
        }
        // 优惠券：购物车就绪后加载券包 → 消费「去使用」预挂券 → 自动试挂最优
        if (cart.order) {
            await loadMyCoupons();
            await consumePrefillCoupon();
            await tryAutoApplyBest();
        }
    } catch (e) { console.error(e); }
});

/**
 * 为当前 active order 设置地址/自提点 + 配送方式
 * 返回是否成功（校验失败时为 false）
 */
async function prepareOrderAddressAndShipping(): Promise<boolean> {
    if (activeTab.value === 'campus') {
        // 校园配送：先写配送目标（zone/building/route/slot）——fulfillmentRoute 写入后
        // campus-errand calculator 才对该单出价（分区运费），再重拉 eligible 选中该方法
        const ok = await saveCampusTarget();
        if (!ok) return false;
        const eligibleRes: any = await getEligibleShippingMethods();
        const all: any[] = eligibleRes?.eligibleShippingMethods || [];
        const campusMethod = all.find((m: any) => m.code?.startsWith('campus-errand'))
            || all.find((m: any) => categorizeShipping(m) === 'shipping');
        if (campusMethod) {
            const res: any = await setOrderShippingMethod([campusMethod.id]);
            if (res?.setOrderShippingMethod?.id) cart.setOrder(res.setOrderShippingMethod);
        }
        return true;
    }
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
 * 轮询订单是否已结算（JSAPI 支付 ok 后微信异步回调有延迟，轻量探测 2 次 × 1.5s）
 */
async function pollOrderSettled(code: string): Promise<boolean> {
    for (let i = 0; i < 2; i++) {
        await new Promise(r => setTimeout(r, 1500));
        try {
            const res: any = await getOrderByCode(code);
            if (res?.orderByCode?.state === 'PaymentSettled') return true;
        } catch (e) { console.warn('[checkout] poll order failed', e); }
    }
    return false;
}

/**
 * 对当前 active order 提交支付
 * 返回 { code, status }：success=已确认结算 / pending=已调起待回调确认 / fail=未完成
 */
async function payCurrentOrder(method: string): Promise<{ code: string; status: 'success' | 'pending' | 'fail' }> {
    // Build payment metadata (wechatpay JSAPI requires openid)
    const paymentMetadata: Record<string, any> = {};
    if (method === 'wechatpay') {
        const openid = uni.getStorageSync('auth_openid');
        if (openid) paymentMetadata.openid = openid;
    }
    // Add payment
    const payRes: any = await addPaymentToOrder(method, paymentMetadata);
    const order = payRes.addPaymentToOrder;
    // PM 拒单（如微信 openid 校验失败）返回 ErrorResult——直接上抛透出后端错误信息
    if (order?.errorCode) throw new Error(order.message || '支付失败');
    // 从最新一笔 payment 取 metadata（后端在 payment.metadata.public 中返回支付参数）
    const lastPayment = order?.payments?.[order.payments.length - 1];
    const pub = lastPayment?.metadata?.public || lastPayment?.metadata || {};
    // JSAPI（小程序 wx.requestPayment / 公众号 WeixinJSBridge）：PaymentAuthorized ≠ 已支付，
    // 须前端调起收银台，用户支付完成后微信异步回调才结算——绝不能在此提前跳 success
    if (order?.state === 'PaymentAuthorized' && pub.payType === 'jsapi') {
        const result = await handlePayment(method as PaymentMethod, {
            ...lastPayment,
            orderCode: order?.code,
            orderState: order?.state,
        });
        if (result.success) {
            const settled = await pollOrderSettled(order.code);
            return { code: order.code, status: settled ? 'success' : 'pending' };
        }
        // 用户取消/失败：取消该笔 payment 让订单回到可支付状态（失败不阻断，仅提示）
        try { await cancelPayment(lastPayment.id); } catch (e) { console.warn('[checkout] cancelPayment failed', e); }
        return { code: order.code, status: 'fail' };
    }
    if (order?.state === 'PaymentSettled' || order?.state === 'PaymentAuthorized') {
        return { code: order.code, status: 'success' };
    }
    const result = await handlePayment(method as PaymentMethod, {
        ...lastPayment,
        orderCode: order?.code,
        orderState: order?.state,
    });
    return result.success ? { code: order?.code, status: 'success' } : { code: order?.code, status: 'fail' };
}

async function submitOrder() {
    if (submitting.value) return;
    // 起送价软校验：未达标仅 toast 提示，不阻断（硬校验二期后端化）
    if (activeTab.value === 'campus' && minOrderFen.value != null
        && (cart.order?.subTotalWithTax || 0) < minOrderFen.value) {
        ui.showToast(`商品未满起送价 ¥${(minOrderFen.value / 100).toFixed(2)}，请确认后再下单`);
    }
    submitting.value = true;
    try {
        ui.showLoading();
        const ok = await prepareOrderAddressAndShipping();
        if (!ok) return;
        // Transition to ArrangingPayment
        await transitionOrderToState('ArrangingPayment');
        const pay = await payCurrentOrder(selectedPayment.value);
        // fail = 支付未完成（取消/失败/addPaymentToOrder 报错），不得伪装成功
        if (pay.status === 'fail' || !pay.code) { ui.showToast('支付未完成，请重试或更换支付方式'); return; }
        uni.redirectTo({ url: `/pkg-order/pages/pay-result?code=${encodeURIComponent(pay.code)}&status=${pay.status}` });
    } catch (e: any) { ui.showToast(e?.response?.errors?.[0]?.message || e.message); }
    ui.hideLoading();
    submitting.value = false;
}

// 页面参数：店铺 routesEnabled 透传（menu→checkout，决定校园配送 Tab 路线判定/切换）
onLoad((q: any) => {
    const routes = String(q?.routes || '').split(',').map(s => s.trim()).filter(Boolean);
    campusRoutes.value = routes;
    if (!routes.includes('R3') && routes.includes('R1')) routeChoice.value = 'R1';
    minOrderFen.value = q?.minOrder ? Number(q.minOrder) : null;
    deliveryFeeFen.value = q?.dfee ? Number(q.dfee) : null;
    // 「去使用」预挂券（my-coupons 写入）：购物车就绪后消费（onMounted consumePrefillCoupon）
    prefillCouponCode.value = String(uni.getStorageSync('checkout_prefill_coupon') || '');
    loadStoreRoutes();
});
</script>

<style lang="scss" scoped>
.checkout-page { padding: 20rpx 20rpx 180rpx; .route-fee-hint { display: block; font-size: 22rpx; color: $text-color-secondary; margin-top: 8rpx; } }
.section { background: $surface; border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx; &__title { font-size: 28rpx; font-weight: bold; display: block; margin-bottom: 20rpx; } }
.seg-control { display: flex; gap: 16rpx; &__item { flex: 1; text-align: center; padding: 18rpx 0; font-size: 26rpx; border-radius: $radius-md; background: $bg-color; color: $text-color-secondary; border: 1rpx solid transparent; &.active { background: $brand-color-light; color: $brand-color; border-color: $brand-color; font-weight: 600; } } }
.input { width: 100%; height: 80rpx; background: $bg-color; border-radius: $radius-sm; padding: 0 20rpx; font-size: 26rpx; margin-bottom: 16rpx; box-sizing: border-box; }
.region-row { display: flex; justify-content: space-between; align-items: center; height: 80rpx; background: $bg-color; border-radius: $radius-sm; padding: 0 20rpx; font-size: 26rpx; margin-bottom: 16rpx; &__placeholder { color: $text-color-placeholder; } &__arrow { color: $text-color-placeholder; } }
.address-form { &__tip { font-size: 24rpx; color: $text-color-secondary; margin-bottom: 16rpx; } &__check { display: flex; justify-content: space-between; align-items: center; font-size: 26rpx; margin: 8rpx 0 16rpx; } &__save { height: 80rpx; line-height: 80rpx; background: $brand-color; color: #fff; font-size: 28rpx; border-radius: $radius-md; border: none; } }
.address-block { position: relative; &__top { display: flex; align-items: center; gap: 16rpx; } &__name { font-size: 30rpx; font-weight: 600; } &__phone { font-size: 26rpx; color: $text-color-secondary; } &__tag { font-size: 20rpx; color: $brand-color; border: 1rpx solid $brand-color; border-radius: 6rpx; padding: 0 8rpx; } &__detail { display: block; font-size: 26rpx; color: $text-color-secondary; margin-top: 12rpx; line-height: 1.5; } &__change { display: block; text-align: right; font-size: 24rpx; color: $brand-color; margin-top: 8rpx; } }
.addr-modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 300; display: flex; align-items: flex-end; }
.addr-modal { width: 100%; max-height: 75vh; background: $surface; border-radius: 24rpx 24rpx 0 0; padding: 24rpx; box-sizing: border-box; display: flex; flex-direction: column; &__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; } &__title { font-size: 30rpx; font-weight: 600; } &__close { font-size: 32rpx; color: $text-color-placeholder; padding: 8rpx; } &__list { flex: 1; max-height: 55vh; } &__empty { text-align: center; padding: 60rpx 0; color: $text-color-placeholder; font-size: 26rpx; } &__fab { margin-top: 20rpx; height: 80rpx; line-height: 80rpx; text-align: center; border-radius: $radius-md; background: $brand-color-light; color: $brand-color; font-size: 28rpx; &--save { background: $brand-color; color: #fff; } } }
.addr-option { border: 1rpx solid $border-color; border-radius: $radius-md; padding: 20rpx; margin-bottom: 16rpx; &.selected { border-color: $brand-color; background: $brand-color-light; } &__top { display: flex; align-items: center; gap: 12rpx; } &__name { font-size: 28rpx; font-weight: 600; } &__phone { font-size: 24rpx; color: $text-color-secondary; } &__tag { font-size: 20rpx; color: $brand-color; border: 1rpx solid $brand-color; border-radius: 6rpx; padding: 0 8rpx; } &__detail { display: block; font-size: 24rpx; color: $text-color-secondary; margin-top: 8rpx; } &__actions { display: flex; gap: 24rpx; margin-top: 12rpx; font-size: 24rpx; } &__edit { color: $brand-color; } &__del { color: $text-color-placeholder; } &__default { color: $text-color-secondary; } }
.pickup-card { border: 1rpx solid $border-color; border-radius: $radius-md; padding: 20rpx; &__name { font-size: 28rpx; font-weight: 600; display: block; } &__addr { display: block; font-size: 24rpx; color: $text-color-secondary; margin-top: 8rpx; } &__meta { display: flex; gap: 16rpx; margin-top: 8rpx; } &__hours, &__dist { font-size: 22rpx; color: $text-color-placeholder; } &__change { display: block; text-align: right; font-size: 24rpx; color: $brand-color; margin-top: 8rpx; } }
.pickup-empty { text-align: center; padding: 30rpx 0; color: $text-color-secondary; font-size: 26rpx; &__loading { color: $text-color-placeholder; } &__hint { display: block; font-size: 22rpx; color: $text-color-placeholder; margin-top: 8rpx; } &__btn { margin-top: 16rpx; } &__btn--primary { background: $brand-color; color: #fff; } }
.radio-item { display: flex; justify-content: space-between; align-items: center; padding: 20rpx; border: 1rpx solid $border-color; border-radius: $radius-md; margin-bottom: 16rpx; font-size: 26rpx; &.active { border-color: $brand-color; background: $brand-color-light; } &__left { display: flex; align-items: center; gap: 12rpx; } &__icon { font-size: 32rpx; } &__balance { font-size: 24rpx; color: $text-color-secondary; } }
.checkout-page__summary { background: $surface; border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx; }
.summary-row { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 26rpx; color: $text-color-secondary; &--total { border-top: 1rpx solid $border-color; margin-top: 8rpx; padding-top: 16rpx; color: $text-color; font-size: 28rpx; } }
.checkout-page__total { color: $price-color; font-size: 36rpx; font-weight: bold; }
// plan 3.2 满X免配送费（方案A：运费行内减免）
.ship-orig { color: $text-color-placeholder; text-decoration: line-through; font-size: 24rpx; margin-right: 8rpx; }
.ship-tag { margin-left: 12rpx; font-size: 20rpx; color: $brand-color; background: $brand-color-light; border-radius: 6rpx; padding: 2rpx 10rpx; }
.ship-free-hint { padding: 4rpx 0 8rpx; font-size: 22rpx; color: $brand-color; }
.checkout-page__submit { position: fixed; left: 20rpx; right: 20rpx; bottom: calc(20rpx + env(safe-area-inset-bottom)); height: 88rpx; line-height: 88rpx; background: $brand-color; color: #fff; font-size: 30rpx; border-radius: 999rpx; border: none; &[disabled] { opacity: 0.6; } }
// ===== 校园配送面板 =====
.campus-empty { text-align: center; padding: 30rpx 0; color: $text-color-secondary; font-size: 26rpx; &__hint { display: block; font-size: 22rpx; color: $text-color-placeholder; margin-top: 8rpx; } }
.campus-label { font-size: 24rpx; color: $text-color-secondary; margin: 16rpx 0 12rpx; }
.chip-row { display: flex; flex-wrap: wrap; gap: 16rpx; }
.chip { padding: 12rpx 24rpx; font-size: 24rpx; border-radius: 999rpx; background: $bg-color; color: $text-color-secondary; border: 1rpx solid transparent; &.on { background: $brand-color-light; color: $brand-color; border-color: $brand-color; font-weight: 600; } &__sub { font-size: 22rpx; opacity: .8; } }
.slot-schedule-hint { display: block; margin-top: 16rpx; padding: 12rpx 20rpx; font-size: 22rpx; color: $brand-color; background: $brand-color-light; border-radius: $radius-sm; }
.route-row { display: flex; align-items: center; justify-content: space-between; margin-top: 20rpx; padding: 16rpx 20rpx; background: $brand-color-light; border-radius: $radius-sm; &__text { font-size: 24rpx; color: $brand-color; flex: 1; } &__switch { font-size: 24rpx; color: #fff; background: $brand-color; border-radius: 999rpx; padding: 4rpx 20rpx; } }
.campus-default { display: flex; align-items: center; justify-content: space-between; background: $brand-soft; border-radius: $radius-md; padding: 16rpx 20rpx; margin-bottom: 16rpx; &__txt { font-size: 24rpx; color: #8a4b00; flex: 1; } &__chg { font-size: 24rpx; color: $brand-color; margin-left: 12rpx; } }
// ===== 优惠券行 + 选券弹层（spec §3.3） =====
.summary-row--coupon { cursor: pointer; }
.coupon-val { color: #ff6600; }
.coupon-arrow { color: #c0c0c0; margin-left: 8rpx; }
.coupon-sheet-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 999; display: flex; align-items: flex-end; }
.coupon-sheet { width: 100%; background: #f5f5f5; border-radius: 24rpx 24rpx 0 0; padding: 32rpx 0 calc(32rpx + env(safe-area-inset-bottom)); max-height: 70vh; display: flex; flex-direction: column; }
.coupon-sheet__title { text-align: center; font-size: 30rpx; font-weight: bold; padding-bottom: 24rpx; }
.coupon-sheet__list { max-height: 56vh; padding: 0 24rpx; box-sizing: border-box; }
.cs-item { display: flex; background: #fff; border-radius: 16rpx; margin-bottom: 20rpx; overflow: hidden; &--on { outline: 2rpx solid #ff6600; } &--off { opacity: 0.55; } }
.cs-item__left { width: 200rpx; background: #ff6600; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24rpx 0; }
.cs-item--off .cs-item__left, .cs-item--none .cs-item__left { background: #ccc; }
.cs-item__amount { font-size: 40rpx; font-weight: bold; }
.cs-item__cond { font-size: 20rpx; margin-top: 6rpx; }
.cs-item__right { flex: 1; padding: 20rpx 24rpx; display: flex; flex-direction: column; }
.cs-item__name { font-size: 26rpx; color: #333; }
.cs-item__expire { font-size: 22rpx; color: #999; margin-top: 6rpx; }
.cs-item__reason { font-size: 22rpx; color: #ff4d4f; margin-top: 6rpx; }
.cs-item--none { justify-content: center; padding: 28rpx 0; color: #666; font-size: 26rpx; }
</style>
