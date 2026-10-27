<template>
  <view class="checkout-page">
    <!-- 配送方式（校园配送恒显置首，自提/邮寄按渠道启用情况显示） -->
    <view class="section">
      <text class="section__title">{{ $t('checkout.shippingTitle') }}</text>
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
      <text class="section__title">{{ $t('checkout.targetTitle') }}</text>
      <view v-if="zonesLoading" class="campus-empty"><text>{{ $t('checkout.loading') }}</text></view>
      <view v-else-if="!zones.length" class="campus-empty">
        <text>{{ $t('checkout.noZones') }}</text>
        <text class="campus-empty__hint">{{ $t('checkout.chooseOtherHint') }}</text>
      </view>
      <template v-else>
        <view class="campus-default" v-if="defaultAddressSummary" @click="scrollToZones">
          <text class="campus-default__txt">{{ $t('checkout.defaultAddr').replace('{t}', defaultAddressSummary) }}</text>
          <text class="campus-default__chg">{{ $t('checkout.change') }}</text>
        </view>
        <view class="campus-label">{{ $t('checkout.pickZone') }}</view>
        <view class="chip-row">
          <view v-for="z in zones" :key="z.id" class="chip" :class="{ on: zoneId === z.id }" @click="chooseZone(z)">
            {{ z.name }}<text v-if="zonePrice(z) != null" class="chip__sub"> ¥{{ (Number(zonePrice(z)) / 100).toFixed(2) }}</text>
          </view>
        </view>
        <view class="campus-label">{{ $t('checkout.pickBuilding') }}</view>
        <view class="chip-row">
          <view v-for="b in buildings" :key="b.id" class="chip" :class="{ on: buildingId === b.id }" @click="buildingId = b.id">
            {{ b.name }}<text v-if="b.detail" class="chip__sub"> {{ b.detail }}</text>
          </view>
          <view v-if="!buildings.length" class="campus-empty__hint">{{ $t('checkout.noBuildings') }}</view>
        </view>
        <view class="campus-label">{{ $t('checkout.slotLabel') }}</view>
        <view class="chip-row">
          <view class="chip" :class="{ on: !slotDate }" @click="clearSlotPick">{{ $t('checkout.asap') }}</view>
          <view v-for="d in slotDates" :key="d" class="chip" :class="{ on: slotDate === d }" @click="pickDate(d)">
            {{ dateLabel(d) }}
          </view>
        </view>
        <view class="chip-row" v-if="slotDate">
          <view v-for="s in slotsOfDate" :key="s.id" class="chip" :class="{ on: slotId === s.id }" @click="slotId = s.id">
            {{ $t('checkout.slotLeft').replace('{s}', s.startTime).replace('{e}', s.endTime).replace('{n}', String(s.capacity - s.lockedCount)) }}
          </view>
          <view v-if="!slotsOfDate.length" class="campus-empty__hint">{{ $t('checkout.noSlots') }}</view>
        </view>
        <view v-if="selectedSlotFuture" class="slot-schedule-hint">{{ $t('checkout.scheduleHint') }}</view>
        <view class="route-row" v-if="campusRoutes.length">
          <text class="route-row__text">{{ routeText }}</text>
          <text v-if="canSwitchRoute" class="route-row__switch" @click="toggleRoute">{{ $t('checkout.switchBtn') }}</text>
        </view>
        <text v-if="routeChoice === 'R2'" class="route-fee-hint">{{ $t('checkout.r2FeeHint') }}</text>
      </template>
    </view>

    <!-- 收货地址（仅邮寄方式显示） -->
    <view class="section" v-if="activeTab === 'shipping'">
      <text class="section__title">{{ $t('checkout.addrTitle') }}</text>
      <!-- 已有地址：显示当前选中地址 + 更换入口 -->
      <view v-if="selectedAddress" class="address-block" @click="showAddressPicker = true">
        <view class="address-block__top">
          <text class="address-block__name">{{ selectedAddress.fullName }}</text>
          <text class="address-block__phone">{{ selectedAddress.phoneNumber }}</text>
          <text v-if="selectedAddress.defaultShippingAddress" class="address-block__tag">{{ $t('checkout.defaultTag') }}</text>
          <text v-if="addrLabel(selectedAddress.id)" class="address-block__label">{{ addrLabel(selectedAddress.id) }}</text>
        </view>
        <text class="address-block__detail">{{ selectedAddress.province }} {{ selectedAddress.city }} {{ selectedAddress.streetLine1 }}{{ selectedAddress.streetLine2 ? ' ' + selectedAddress.streetLine2 : '' }}</text>
        <text class="address-block__change">{{ $t('checkout.changeAddr') }}</text>
      </view>
      <!-- 无地址：显示新增表单 -->
      <view v-else class="address-form">
        <view class="address-form__tip">{{ $t('checkout.addrFormTip') }}</view>
        <input v-model="address.fullName" :placeholder="$t('checkout.namePh')" class="input" />
        <input v-model="address.phoneNumber" :placeholder="$t('checkout.phonePh')" type="number" class="input" />
        <view class="region-row" @click="openRegionPicker('inline')">
          <text :class="{ 'region-row__placeholder': !regionText(address) }">{{ regionText(address) || $t('checkout.regionPh') }}</text>
          <text class="region-row__arrow">▸</text>
        </view>
        <input v-model="address.streetLine1" :placeholder="$t('checkout.detailPh')" class="input" />
        <input v-model="address.streetLine2" :placeholder="$t('checkout.detail2Ph')" class="input" />
        <view class="address-form__check">
          <text>{{ $t('checkout.setDefault') }}</text>
          <switch :checked="address.defaultShippingAddress" @change="address.defaultShippingAddress = $event.detail.value" />
        </view>
        <button class="address-form__save" @click="saveNewAddress">{{ $t('checkout.saveUse') }}</button>
      </view>
    </view>

    <!-- 地址选择/管理弹窗 -->
    <view v-if="showAddressPicker" class="addr-modal-mask" @click.self="showAddressPicker = false">
      <view class="addr-modal">
        <view class="addr-modal__head">
          <text class="addr-modal__title">{{ $t('checkout.pickerTitle') }}</text>
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
              <text v-if="addr.defaultShippingAddress" class="addr-option__tag">{{ $t('checkout.defaultTag') }}</text>
              <text v-if="addrLabel(addr.id)" class="addr-option__label">{{ addrLabel(addr.id) }}</text>
            </view>
            <text class="addr-option__detail">{{ addr.province }} {{ addr.city }} {{ addr.streetLine1 }}{{ addr.streetLine2 ? ' ' + addr.streetLine2 : '' }}</text>
            <view class="addr-option__actions">
              <text class="addr-option__edit" @click.stop="openEditForm(addr)">{{ $t('checkout.edit') }}</text>
              <text class="addr-option__del" @click.stop="deleteAddress(addr.id)">{{ $t('checkout.del') }}</text>
              <text v-if="!addr.defaultShippingAddress" class="addr-option__default" @click.stop="setDefaultAddress(addr)">{{ $t('checkout.setDefaultTag') }}</text>
            </view>
          </view>
          <view v-if="customerAddresses.length === 0" class="addr-modal__empty">
            <text>{{ $t('checkout.noAddr') }}</text>
          </view>
        </scroll-view>
        <view class="addr-modal__fab" @click="openAddForm">
          <text>{{ $t('checkout.addAddr') }}</text>
        </view>
      </view>
    </view>

    <!-- 地址新增/编辑表单弹窗 -->
    <view v-if="showAddressForm" class="addr-modal-mask" @click.self="showAddressForm = false">
      <view class="addr-modal">
        <view class="addr-modal__head">
          <text class="addr-modal__title">{{ editingAddressId ? $t('checkout.editAddr') : $t('checkout.addAddrTitle') }}</text>
          <text class="addr-modal__close" @click="showAddressForm = false">✕</text>
        </view>
        <scroll-view class="addr-modal__list" scroll-y>
          <input v-model="addressForm.fullName" :placeholder="$t('checkout.namePh')" class="input" />
          <input v-model="addressForm.phoneNumber" :placeholder="$t('checkout.phonePh')" type="number" class="input" />
          <view class="region-row" @click="openRegionPicker('modal')">
            <text :class="{ 'region-row__placeholder': !regionText(addressForm) }">{{ regionText(addressForm) || $t('checkout.regionPh') }}</text>
            <text class="region-row__arrow">▸</text>
          </view>
          <input v-model="addressForm.streetLine1" :placeholder="$t('checkout.detailPh')" class="input" />
          <input v-model="addressForm.streetLine2" :placeholder="$t('checkout.detail2Ph')" class="input" />
          <view class="address-form__check">
            <text>{{ $t('checkout.setDefault') }}</text>
            <switch :checked="addressForm.defaultShippingAddress" @change="addressForm.defaultShippingAddress = $event.detail.value" />
          </view>
        </scroll-view>
        <view class="addr-modal__fab addr-modal__fab--save" @click="saveAddressForm">
          <text>{{ $t('checkout.save') }}</text>
        </view>
      </view>
    </view>

    <!-- 自提点选择（自提方式显示） -->
    <view class="section" v-if="shippingCategory === 'store-pickup'">
      <text class="section__title">{{ $t('checkout.pickupTitle') }}</text>
      <!-- 已选自提点卡片 -->
      <view v-if="selectedPickupLocation" class="pickup-card" @click="showPickupSheet = true">
        <text class="pickup-card__name">{{ selectedPickupLocation.name }}</text>
        <text class="pickup-card__addr">{{ selectedPickupLocation.address }}</text>
        <view class="pickup-card__meta">
          <text v-if="selectedPickupLocation.businessHours" class="pickup-card__hours">{{ $t('checkout.hours').replace('{t}', selectedPickupLocation.businessHours) }}</text>
          <text v-if="pickupDistance" class="pickup-card__dist">{{ pickupDistance }}</text>
        </view>
        <text class="pickup-card__change">{{ $t('checkout.changePickup') }}</text>
      </view>
      <!-- 加载中状态 -->
      <view v-else-if="pickupLoading" class="pickup-empty">
        <text class="pickup-empty__loading">{{ $t('checkout.pickupLoading') }}</text>
      </view>
      <!-- 加载完成但无数据 -->
      <view v-else class="pickup-empty">
        <text>{{ $t('checkout.noPickup') }}</text>
        <text class="pickup-empty__hint">{{ $t('checkout.chooseOtherHint') }}</text>
      </view>
    </view>

    <!-- 自提点选择弹窗 -->
    <PickupLocationSheet
      v-model:visible="showPickupSheet"
      :locations="pickupLocations"
      :selected-id="selectedPickupLocation?.id"
      :user-location="userLocation"
      :title="$t('checkout.pickupSheetTitle')"
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
      <text class="section__title">{{ $t('checkout.payTitle') }}</text>
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
      <view class="summary-row"><text>{{ $t('checkout.goodsTotal') }}</text><text>¥{{ originalSubTotalYuan }}</text></view>
      <view class="summary-row" v-if="activeTab === 'campus' && deliveryFeeFen != null"><text>{{ $t('checkout.deliveryFee') }}</text><text>¥{{ (deliveryFeeFen / 100).toFixed(2) }}</text></view>
      <view class="summary-row" v-if="activeTab === 'campus' && minOrderFen != null"><text>{{ $t('checkout.minOrder') }}</text><text>{{ $t('checkout.minOrderText').replace('{c}', (minOrderFen / 100).toFixed(2)) }}</text></view>
      <!-- 打包费/餐盒费（P1）：店铺级配置 + 商品级覆盖，结算时由后端落一条 surcharge -->
      <view class="summary-row" v-if="showPackingFee"><text>{{ packingFeeLabel }}</text><text>¥{{ (packingFeeFen / 100).toFixed(2) }}</text></view>
      <!-- 加料费（P1-2）：行内只存加料引用，按商品配置预估；提交后由后端落 surcharge -->
      <view class="summary-row" v-if="showAddonFee"><text>{{ addonFeeLabel }}</text><text>¥{{ (addonFeeFen / 100).toFixed(2) }}</text></view>
      <view class="summary-row"><text>{{ $t('checkout.shipping') }}</text>
        <text v-if="freeShipOn"><text class="ship-orig">¥{{ shipOriginalYuan }}</text>¥0.00<text class="ship-tag">{{ $t('checkout.freeShipTag').replace('{c}', freeShipYuan) }}</text></text>
        <text v-else>¥{{ shipDisplayYuan }}</text>
      </view>
      <view class="ship-free-hint" v-if="freeShipShortYuan">{{ $t('checkout.freeShipHint').replace('{a}', freeShipYuan).replace('{b}', freeShipShortYuan) }}</view>
      <!-- 动态计价加价提示：高峰/供需/手动倍率，结算口径与 campusZones.price 一致 -->
      <view class="ship-free-hint" v-if="campusRouteSel && !freeShipOn && selectedZoneAddFeeFen > 0">{{ $t('checkout.dynAddFee').replace('{a}', (selectedZoneAddFeeFen / 100).toFixed(2)) }}</view>
      <!-- 满减凑单提示：promoText 解析「满X减Y」，未达标给差额，已达标给优惠 -->
      <view class="promo-hint" v-if="promoNotice">{{ promoNotice }}</view>
      <!-- 起送价硬校验提示（提交会被阻断，后端 min-order process 兜底） -->
      <view class="min-order-hint" v-if="belowMinOrder">{{ $t('checkout.minOrderGap').replace('{d}', minOrderGapYuan) }}</view>
      <!-- 凑单卡（第 33 轮）：差额内商品一键加购，加购后金额/运费减免实时刷新；template v-if（uni-view 的 v-if/v-show/:style patch 在 h5 均不生效） -->
      <template v-if="upsellCard.open">
        <view class="upsell-card">
        <view class="upsell-card__hd">
          <text class="upsell-card__t">{{ upsellCard.title }}</text>
          <text class="upsell-card__save" v-if="upsellCard.save">{{ upsellCard.save }}</text>
        </view>
        <view class="upsell-card__bar"><view class="upsell-card__fill" :style="{ width: upsellCard.pct + '%' }"></view></view>
        <text class="upsell-card__sub">{{ $t('checkout.upsellSub') }}</text>
        <scroll-view scroll-x class="upsell-card__row">
          <view v-for="it in upsellCard.items" :key="'up-' + it.p.id" class="up-item" @click="addUpsell(it)">
            <VImage :src="it.p.featuredAsset?.preview" width="96rpx" height="96rpx" class="up-item__img" />
            <text class="up-item__name">{{ it.p.name }}</text>
            <text class="up-item__price">¥{{ (it.priceFen / 100).toFixed(2) }}</text>
            <view class="up-item__add" :class="{ busy: upsellBusy === String(it.v.id) }">+</view>
          </view>
        </scroll-view>
        </view>
      </template>
      <view class="coupon-tip" v-if="switchSavingFen >= 100" @click="applyBestCoupon">
        {{ $t('checkout.couponBetter').replace('{d}', csYuan(switchSavingFen)) }} 一键换券 ›
      </view>
      <view class="summary-row summary-row--coupon" @click="openCouponSheet">
        <text>{{ $t('checkout.couponTitle') }}</text>
        <text :class="{ 'coupon-val': attachedCoupon }">
          {{ couponRowText }}
          <text class="coupon-arrow">›</text>
        </text>
      </view>
      <!-- 优惠明细：逐项展开 order.discounts（券/满减/活动），并给出已省合计 -->
      <view class="summary-row summary-row--saved" v-if="discountItems.length" @click="feeDetailOpen = !feeDetailOpen">
        <text>{{ $t('checkout.feeDetail') }}</text>
        <text class="fee-detail__toggle">{{ $t('checkout.feeSaved').replace('{d}', discountTotalYuan) }} {{ feeDetailOpen ? '▴' : '▾' }}</text>
      </view>
      <view class="fee-detail" v-if="feeDetailOpen && discountItems.length">
        <view class="fee-detail__row" v-for="(d, i) in discountItems" :key="'fd-' + i">
          <text class="fee-detail__desc">{{ d.description || $t('checkout.feeDetail') }}</text>
          <text class="fee-detail__amt">-¥{{ d.yuan }}</text>
        </view>
      </view>
      <view class="summary-row summary-row--total"><text>{{ $t('checkout.payable') }}</text><text class="checkout-page__total">¥{{ cart.formatPrice(payableFen) }}</text></view>
    </view>

    <!-- 整单备注（P1）：给商家留言，随单写入 Order customFields.note；常用模板一键填充 -->
    <view class="note-card">
      <view class="note-card__head">
        <text class="note-card__label">{{ $t('checkout.noteLabel') }}</text>
        <text class="note-card__manage" @click="noteManageOpen = true">{{ $t('checkout.noteManage') }}</text>
      </view>
      <!-- 我的口味：辣度/忌口/过敏原在「我的口味」页维护，下单自动并入备注 -->
      <view class="taste-entry" @click="goTasteProfile">
        <view class="taste-entry__body">
          <text class="taste-entry__label">{{ $t('taste.entryTitle') }}</text>
          <text class="taste-entry__value">{{ tasteSummary || $t('taste.entrySub') }}</text>
        </view>
        <text class="taste-entry__arrow">{{ $t('taste.manage') }} ›</text>
      </view>
      <text class="taste-hint">{{ $t('checkout.tasteHint') }}</text>
      <scroll-view scroll-x class="note-chips">
        <view
          v-for="t in quickNoteTemplates"
          :key="'nt-' + t"
          class="note-chip"
          :class="{ on: noteHas(t) }"
          @click="toggleNoteTemplate(t)"
        >{{ t }}</view>
        <view class="note-chip note-chip--add" @click="noteManageOpen = true">+ {{ $t('checkout.noteAdd') }}</view>
      </scroll-view>
      <textarea
        class="note-card__input"
        v-model="orderNote"
        :placeholder="$t('checkout.notePlaceholder')"
        :maxlength="200"
        auto-height
      />
      <view class="note-card__count" v-if="orderNote.length">{{ orderNote.length }}/200</view>
      <!-- 单品备注：购物车逐行标注，下单时并入整单备注 -->
      <view v-if="lineNotes.length" class="line-notes">
        <view class="line-notes__head">
          <text class="line-notes__title">{{ $t('checkout.lineNotesTitle').replace('{n}', String(lineNotes.length)) }}</text>
          <text class="line-notes__clear" @click="clearLineNotes">{{ $t('checkout.lineNotesClear') }}</text>
        </view>
        <text v-for="n in lineNotes" :key="'ln-' + n.variantId" class="line-notes__item">{{ n.name }}<text v-if="n.qty > 1">×{{ n.qty }}</text>：{{ n.note }}</text>
      </view>
    </view>

    <!-- 就餐设置：餐具份数 + 发票抬头，下单前随单写入 Order customFields -->
    <view class="setting-card">
      <view class="setting-row">
        <text class="setting-row__label">{{ $t('checkout.tablewareLabel') }}</text>
        <view class="chip-row setting-row__chips">
          <view
            v-for="n in tablewareOptions"
            :key="n"
            class="chip"
            :class="{ on: tablewareCount === n }"
            @click="pickTableware(n)"
          >
            {{ n === 0 ? $t('checkout.tablewareNone') : $t('checkout.tablewareCount').replace('{n}', String(n)) }}
          </view>
        </view>
      </view>
      <view class="setting-row">
        <view class="pref-head">
          <text class="setting-row__label">{{ $t('deliveryPrefs.pickLabel') }}</text>
          <text class="pref-head__manage" @click="goDeliveryPrefs">{{ $t('deliveryPrefs.manage') }} ›</text>
        </view>
        <view class="chip-row setting-row__chips">
          <view
            v-for="p in deliveryPrefOptions"
            :key="'dp-' + (p.key || 'none')"
            class="chip"
            :class="{ on: deliveryPref === p.key }"
            @click="pickDeliveryPref(p.key)"
          >{{ p.label }}</view>
        </view>
      </view>
      <view class="setting-row setting-row--link" @click="openInvoiceSheet">
        <text class="setting-row__label">{{ $t('checkout.invoiceLabel') }}</text>
        <view class="setting-row__value">
          <text class="setting-row__text" :class="{ 'setting-row__text--picked': selectedInvoiceTitle }">{{ invoiceRowText }}</text>
          <text class="setting-row__arrow">›</text>
        </view>
      </view>
    </view>

    <button class="checkout-page__submit" :disabled="submitting" @click="submitOrder">
      {{ submitting ? $t('checkout.processing') : $t('checkout.submitOrder') }}
    </button>

    <!-- 选券弹层（spec §3.3）：换券/不使用实时回显合计，门槛未过置灰 -->
    <view class="coupon-sheet-mask" v-if="showCouponSheet" @click="showCouponSheet = false">
      <view class="coupon-sheet" @click.stop>
        <view class="coupon-sheet__title">{{ $t('checkout.couponSheetTitle') }}</view>
        <scroll-view scroll-y class="coupon-sheet__list">
          <view class="cs-item" v-for="c in sheetCoupons" :key="c.id"
            :class="{ 'cs-item--on': attachedCouponCode === c.code, 'cs-item--off': !!unavailableReason(c) }"
            @click="pickCoupon(c)">
            <view class="cs-item__left">
              <text class="cs-item__amount">{{ csAmount(c) }}</text>
              <text class="cs-item__cond" v-if="c.template.type === 'FULL'">{{ $t('checkout.csCond').replace('{c}', csYuan(c.template.minSpend)) }}</text>
            </view>
            <view class="cs-item__right">
              <view class="cs-item__title-row">
                <text class="cs-item__name">{{ c.template.name }}</text>
                <text class="cs-item__best" v-if="c.code === bestCouponCode && !unavailableReason(c)">{{ $t('checkout.csBest') }}</text>
              </view>
              <text class="cs-item__save" v-if="!unavailableReason(c) && estimateOf(c) > 0">{{ $t('checkout.csSave').replace('{d}', csYuan(estimateOf(c))) }}</text>
              <text class="cs-item__expire" v-if="c.expiredAt">{{ $t('checkout.csExpire').replace('{t}', csDate(c.expiredAt)) }}</text>
              <text class="cs-item__reason" v-if="unavailableReason(c)">{{ unavailableReason(c) }}</text>
            </view>
          </view>
          <view class="cs-item cs-item--none" @click="clearCoupon">
            <text>{{ $t('checkout.noCouponBtn') }}</text>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- 发票抬头弹层：不开发票 / 已保存抬头单选（无抬头请先到发票抬头页添加） -->
    <view class="invoice-sheet-mask" v-if="showInvoiceSheet" @click="showInvoiceSheet = false">
      <view class="invoice-sheet" @click.stop>
        <view class="invoice-sheet__title">{{ $t('checkout.invoiceLabel') }}</view>
        <scroll-view scroll-y class="invoice-sheet__list">
          <view class="iv-item" :class="{ 'iv-item--on': selectedInvoiceIndex < 0 }" @click="chooseInvoice(-1)">
            <text class="iv-item__name">{{ $t('checkout.invoiceNone') }}</text>
            <text class="iv-item__check" v-if="selectedInvoiceIndex < 0">✓</text>
          </view>
          <view
            v-for="(t, i) in invoiceTitles"
            :key="i"
            class="iv-item"
            :class="{ 'iv-item--on': selectedInvoiceIndex === i }"
            @click="chooseInvoice(i)"
          >
            <view class="iv-item__main">
              <text class="iv-item__name">{{ t.name }}</text>
              <text class="iv-item__meta">{{ t.email }}</text>
            </view>
            <text class="iv-item__check" v-if="selectedInvoiceIndex === i">✓</text>
          </view>
        </scroll-view>
      </view>
    </view>
    <!-- 常用备注模板管理：内置 + 自定义（本地存储，最多 8 条） -->
    <view class="note-sheet-mask" v-if="noteManageOpen" @click="noteManageOpen = false">
      <view class="note-sheet" @click.stop>
        <view class="note-sheet__title">{{ $t('checkout.noteManageTitle') }}</view>
        <scroll-view scroll-y class="note-sheet__list">
          <view class="note-tpl" v-for="t in customNoteTemplates" :key="'ct-' + t">
            <text class="note-tpl__txt">{{ t }}</text>
            <text class="note-tpl__del" @click="removeCustomNote(t)">✕</text>
          </view>
          <view v-if="!customNoteTemplates.length" class="note-sheet__empty">{{ $t('checkout.noteEmpty') }}</view>
        </scroll-view>
        <view class="note-sheet__add">
          <input
            class="note-sheet__input"
            v-model="newNoteTpl"
            :maxlength="12"
            :placeholder="$t('checkout.noteAddPlaceholder')"
            confirm-type="done"
            @confirm="addCustomNote"
          />
          <view class="note-sheet__btn" @click="addCustomNote">{{ $t('checkout.noteAddBtn') }}</view>
        </view>
        <view class="note-sheet__done" @click="noteManageOpen = false">{{ $t('checkout.noteDone') }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import PickupLocationSheet from '../../components/PickupLocationSheet.vue';
import RegionPicker from '../../components/RegionPicker.vue';
import type { PickupLocation } from '../../types/pickup';
import { useCartStore } from '../../stores/cart';
import { useUIStore } from '../../stores/ui';
import { getActiveOrder, getEligibleShippingMethods, getOrderByCode } from '../../api/queries/order';
import { getActiveCustomer, getEligiblePaymentMethods } from '../../api/queries/user';
import { getPickupLocations } from '../../api/queries/pickup';
import { setOrderShippingAddress, setOrderShippingMethod, transitionOrderToState, addPaymentToOrder, setOrderPickupLocation, cancelPayment, setOrderCustomFields } from '../../api/mutations/checkout';
import { setDeliveryTarget, fetchZones, fetchBuildings, fetchSlots } from '../../api/mutations/campus';
import { createCustomerAddress, updateCustomerAddress, deleteCustomerAddress } from '../../api/mutations/address';
import { handlePayment, type PaymentMethod } from '../../composables/usePayment';
import { useTenantStore } from '../../stores/tenant';
import { fetchStoreList, fetchProductListForChannel } from '../../api/queries/waimai';
import { addItemToOrderInChannel } from '../../api/mutations/cart';
import { upsellGapFen, upsellPick, upsellPct, type UpsellItem } from '../../utils/upsell';
import { filterCampusRoutes } from '../../utils/errand';
import { pickDefaultCampusAddress, isValidCampusTarget, parseInvoiceTitles, type InvoiceTitle } from '../../utils/profile-mapping';
import { useAuthStore } from '../../stores/auth';
import { useLocaleStore } from '../../stores/locale';
import { ADDRESS_LABELS, addressLabelKey } from '../../utils/addressLabel';
import { useFavoritesStore } from '../../stores/favorites';
import { nextPromoHint, yuan } from '../../utils/promo';
import { readDeliveryPref, writeDeliveryPref, readDeliveryPrefNote, type DeliveryPrefKey } from '../../utils/delivery-prefs';
import { readTasteProfile, writeTasteProfile, tasteNoteParts, tasteLabels } from '../../utils/taste-profile';
import { getMyCoupons } from '../../api/queries/coupon';
import { applyCouponToOrder, clearCouponFromOrder } from '../../api/mutations/coupon';
import { estimateDiscountFen, pickBestCoupon, couponUnavailableReason, type CouponTemplateLike } from '../../utils/coupon-estimate';
import { lineNoteViews, lineNoteSegments, composeNote, clearStoreNotes, type LineNoteView } from '../../utils/line-notes';
import { etaRange, etaClockText } from '../../utils/delivery-eta';
import { ADDON_FEE_SKU, quoteAddonFeePerLine } from '../../utils/addon-fee';

type ShippingCategory = 'shipping' | 'store-pickup';
type TabKey = 'campus' | ShippingCategory;

const cart = useCartStore();
const ui = useUIStore();
const tenantStore = useTenantStore();
const authStore = useAuthStore();
const locale = useLocaleStore();

/** 地址标签文案（本地存储 address_labels，与地址簿页共用；无标签返回空串） */
function addrLabel(addressId: string | number): string {
    const key = addressLabelKey(addressId);
    const hit = ADDRESS_LABELS.find(l => l.key === key);
    return hit ? locale.t(hit.i18n) : '';
}
const favorites = useFavoritesStore();
const shippingMethods = ref<any[]>([]);
const paymentMethods = ref<any[]>([]);
const selectedShipping = ref('');
const selectedPayment = ref('');
const submitting = ref(false);
const orderNote = ref(''); // 整单备注（给商家留言，≤200 字）

// ── 常用备注模板：内置 5 条 + 用户自定义（本地存储，最多 8 条） ──
const NOTE_TPL_KEY = 'order_note_templates';
const NOTE_TPL_MAX = 8;
const noteManageOpen = ref(false);
const newNoteTpl = ref('');
const customNoteTemplates = ref<string[]>((() => {
  try {
    const raw = uni.getStorageSync(NOTE_TPL_KEY);
    const arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    return Array.isArray(arr) ? arr.map(String).filter(Boolean).slice(0, NOTE_TPL_MAX) : [];
  } catch {
    return [];
  }
})());
const builtinNoteTemplates = computed(() => [
  locale.t('checkout.noteTplNoSpicy'),
  locale.t('checkout.noteTplLessSalt'),
  locale.t('checkout.noteTplNoCoriander'),
  locale.t('checkout.noteTplMoreSauce'),
  locale.t('checkout.noteTplNoCutlery'),
]);
const quickNoteTemplates = computed(() => [...builtinNoteTemplates.value, ...customNoteTemplates.value]);

function persistNoteTemplates() {
  uni.setStorageSync(NOTE_TPL_KEY, JSON.stringify(customNoteTemplates.value));
}

// ── 我的口味偏好：在「我的口味」页维护，下单自动并入整单备注 ──
const tasteProfile = ref(readTasteProfile());
const tasteLabelSet = computed(() => tasteLabels((k: string) => locale.t(k)));
/** 备注里带入口味段（餐具另走 tablewareCount 字段，不重复写进备注） */
const tasteParts = computed(() => tasteNoteParts(tasteProfile.value, tasteLabelSet.value, { includeTableware: false }));
/** 卡片右侧摘要：与备注口径一致，额外带上餐具偏好 */
const tasteSummary = computed(() => tasteNoteParts(tasteProfile.value, tasteLabelSet.value).join('；'));

function goTasteProfile() {
  uni.navigateTo({ url: '/pkg-user/pages/taste-profile' });
}
/** 餐具在结算页也能改：写回口味偏好，保持单一数据源（备注不重复写餐具） */
function pickTableware(n: number) {
  tablewareCount.value = n;
  tasteProfile.value = writeTasteProfile({ ...tasteProfile.value, tableware: n });
}

// 从「我的口味」页返回时刷新（本机存储非响应式）
onShow(() => {
  const fresh = readTasteProfile();
  tasteProfile.value = fresh;
  tablewareCount.value = fresh.tableware;
  void ensureUpsellCatalog(currentChannelToken.value); // 凑单目录幂等拉取（第 33 轮）
});

function noteHas(t: string): boolean {
  return orderNote.value.includes(t);
}
/** 点模板：已包含则移除该段；未包含则追加（用「；」分隔，去重去空） */
function toggleNoteTemplate(t: string) {
  const segs = orderNote.value.split('；').map(s => s.trim()).filter(Boolean);
  if (segs.includes(t)) {
    orderNote.value = segs.filter(s => s !== t).join('；').slice(0, 200);
    return;
  }
  const next = [...segs, t].join('；');
  orderNote.value = next.slice(0, 200);
}
function addCustomNote() {
  const t = newNoteTpl.value.trim().slice(0, 12);
  if (!t) return;
  if (customNoteTemplates.value.includes(t) || builtinNoteTemplates.value.includes(t)) {
    uni.showToast({ title: locale.t('checkout.noteDuplicate'), icon: 'none' });
    return;
  }
  if (customNoteTemplates.value.length >= NOTE_TPL_MAX) {
    uni.showToast({ title: locale.t('checkout.noteMax'), icon: 'none' });
    return;
  }
  customNoteTemplates.value = [...customNoteTemplates.value, t];
  persistNoteTemplates();
  newNoteTpl.value = '';
}
function removeCustomNote(t: string) {
  customNoteTemplates.value = customNoteTemplates.value.filter(x => x !== t);
  persistNoteTemplates();
}

const tablewareOptions = [0, 1, 2, 3, 4, 5]; // 餐具份数选项：0=无需餐具
const tablewareCount = ref(0);               // 默认无需餐具

// ── 配送偏好：本地记忆（delivery_prefs 页可维护），下单时并入备注首段 ──
const deliveryPref = ref<DeliveryPrefKey | ''>(readDeliveryPref());
const deliveryPrefOptions = computed(() => [
  { key: '' as const, label: locale.t('deliveryPrefs.chipNone') },
  { key: 'door' as const, label: locale.t('deliveryPrefs.optDoor') },
  { key: 'reception' as const, label: locale.t('deliveryPrefs.optReception') },
  { key: 'call' as const, label: locale.t('deliveryPrefs.optCall') },
]);
function pickDeliveryPref(key: DeliveryPrefKey | '') {
  deliveryPref.value = deliveryPref.value === key ? '' : key;
  writeDeliveryPref(deliveryPref.value);
}
function goDeliveryPrefs() {
  uni.navigateTo({ url: '/pkg-user/pages/delivery-prefs' });
}
/** 备注首段拼装：配送偏好 → 自定义配送说明 → 用户备注 → 我的口味 → 单品备注（≤200） */
function composeOrderNote(): string | null {
  const prefKey = deliveryPref.value;
  const prefLabel = prefKey
    ? locale.t(prefKey === 'door' ? 'deliveryPrefs.optDoor' : prefKey === 'reception' ? 'deliveryPrefs.optReception' : 'deliveryPrefs.optCall')
    : '';
  const segs = lineNoteSegments(lineNotes.value);
  return composeNote([prefLabel, readDeliveryPrefNote(), orderNote.value.trim(), ...tasteParts.value], segs, 200) || null;
}
/** 当前店铺 token（单品备注按店铺隔离） */
const currentChannelToken = computed(() => storeMeta.value.channelToken || tenantStore.token || '');
/** 刷新计数：本机存储非响应式，清除后手动触发重算 */
const notesTick = ref(0);
const lineNotes = computed<LineNoteView[]>(() => {
    notesTick.value;
    return lineNoteViews(currentChannelToken.value, cart.order?.lines ?? []);
});
function clearLineNotes() {
    const token = currentChannelToken.value;
    if (!token) return;
    clearStoreNotes(token);
    notesTick.value++;
    uni.showToast({ title: locale.t('checkout.lineNotesCleared'), icon: 'none' });
}
const invoiceTitles = ref<InvoiceTitle[]>([]);
const selectedInvoiceIndex = ref(-1);        // -1=不开发票
const showInvoiceSheet = ref(false);
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
// 打包费/餐盒费（P1）：店铺配置 + 商品级覆盖，结算时由后端落一条 surcharge，这里只做预估展示
const packingCfg = ref<{ enabled: boolean; mode: string; amount: number; cap: number | null; label: string | null }>
    ({ enabled: false, mode: 'perItem', amount: 0, cap: null, label: null });
const promoText = ref('');                       // 店铺满减活动文案（promoText，解析「满X减Y」）
const defaultAddressSummary = ref('');           // 默认校园地址摘要（Task 10，可点击改选）
// 店铺标识（menu 透传 cid/shop）：下单成功后写「常买商品」，并按渠道隔离记录
const storeMeta = ref<{ channelId?: string; storeName?: string; channelToken?: string; routes?: string }>({});

// checkout 可选路线（R1/R2/R3 保序）；R2 二期加入轮换
const campusRouteOptions = computed(() => filterCampusRoutes(campusRoutes.value));
const canSwitchRoute = computed(() => campusRouteOptions.value.length > 1);
const routeText = computed(() => {
    if (!campusRoutes.value.length) return locale.t('checkout.routeDefault');
    if (routeChoice.value === 'R1') return locale.t('checkout.routeR1');
    if (routeChoice.value === 'R2') return locale.t('checkout.routeR2');
    return locale.t('checkout.routeR3');
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
    if (d === todayStr) return locale.t('checkout.today');
    if (d === tomorrowStr) return locale.t('checkout.tomorrow');
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
        const storeToken = storeMeta.value.channelToken || tenantStore.token;
        const store = stores.find((s: any) => s.channelToken === storeToken);
        freeShipFen.value = store?.freeShippingThreshold ?? null;
        promoText.value = store?.promoText ?? '';
        packingCfg.value = {
            enabled: !!store?.packingFeeEnabled,
            mode: store?.packingFeeMode === 'perOrder' ? 'perOrder' : 'perItem',
            amount: Number(store?.packingFeeAmount ?? 0),
            cap: store?.packingFeeCap == null ? null : Number(store.packingFeeCap),
            label: store?.packingFeeLabel ?? null,
        };
        // URL 未透传起送价时回填店铺配置（单位：分）
        if (store?.minOrderAmount != null && minOrderFen.value == null) {
            minOrderFen.value = Number(store.minOrderAmount);
        }
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

function scrollToZones() { uni.showToast({ title: locale.t('checkout.repickHint'), icon: 'none' }); }

async function chooseZone(z: any) {
    zoneId.value = z.id;
    buildingId.value = '';
    try {
        buildings.value = await fetchBuildings(z.id);
        if (buildings.value.length) buildingId.value = buildings.value[0].id;
    } catch (e) { buildings.value = []; }
    saveTargetOptions();
}

// ── 配送楼栋本地偏好（首页快捷切换用；zone/building 仍须属于当前店铺才生效） ──
function readLocalJSON(key: string): any {
    try {
        const raw = uni.getStorageSync(key);
        if (!raw) return null;
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch { return null; }
}

function saveTargetOptions() {
    uni.setStorageSync('delivery_target_options', JSON.stringify({
        zones: zones.value.map((z: any) => ({ id: String(z.id), name: z.name })),
        buildings: buildings.value.map((b: any) => ({ id: String(b.id), name: b.name, zoneId: String(zoneId.value) })),
    }));
}

async function loadCampusData() {
    zonesLoading.value = true;
    try {
        zones.value = await fetchZones();
        if (zones.value.length) {
            // 预选优先级：本地最近选的楼栋（命中本店配置）→ 默认校园地址 → 第一分区/首楼
            const local = readLocalJSON('delivery_target');
            const localZone = local?.zoneId
                ? zones.value.find((z: any) => String(z.id) === String(local.zoneId))
                : null;
            const hit = localZone
                ? { zoneId: String(local.zoneId), buildingId: String(local.buildingId ?? '') }
                : await applyDefaultAddress();
            const target = localZone || zones.value[0];
            await chooseZone(target);
            if (hit && buildings.value.some((b: any) => String(b.id) === String(hit.buildingId))) {
                buildingId.value = hit.buildingId; // chooseZone 默认选首楼，纠正回偏好/默认地址楼栋
            }
        }
        slots.value = await fetchSlots();
    } catch (e) { zones.value = []; }
    zonesLoading.value = false;
}

async function saveCampusTarget(): Promise<boolean> {
    if (!zoneId.value || !buildingId.value) {
        ui.showToast(locale.t('checkout.buildingRequired'));
        return false;
    }
    // 选了预约日期但没选具体时段 → 提示补全（或切回尽快送）
    if (slotDate.value && !slotId.value) {
        ui.showToast(locale.t('checkout.slotRequired'));
        return false;
    }
    await setDeliveryTarget({
        zoneId: zoneId.value,
        buildingId: buildingId.value,
        route: routeChoice.value,
        slotId: slotId.value ? Number(slotId.value) : undefined,
    });
    // 落本地偏好：首页「当前配送楼栋」条与快捷切换复用
    const zone = zones.value.find((z: any) => String(z.id) === String(zoneId.value));
    const building = buildings.value.find((b: any) => String(b.id) === String(buildingId.value));
    uni.setStorageSync('delivery_target', JSON.stringify({
        zoneId: String(zoneId.value),
        zoneName: zone?.name ?? '',
        buildingId: String(buildingId.value),
        buildingName: building?.name ?? '',
        at: Date.now(),
    }));
    saveTargetOptions();
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
    return z ? Number(zonePrice(z)) : null;   // 实时配送费（含高峰/供需加价，与结算同口径）
});
/** 分区实时价：优先 price（动态计价后），无该字段时退回基价 fee */
function zonePrice(z: any): number | null {
    if (!z) return null;
    if (z.price != null) return Number(z.price);
    return z.fee != null ? Number(z.fee) : null;
}
/** 当前分区加价额（分）：price - fee，0 表示未加价 */
const selectedZoneAddFeeFen = computed(() => {
    const z = zones.value.find(x => String(x.id) === String(zoneId.value));
    if (!z) return 0;
    const add = z.addFee != null ? Number(z.addFee) : (zonePrice(z) ?? 0) - Number(z.fee ?? 0);
    return add > 0 ? add : 0;
});
const goodsFen = computed(() => cart.order?.subTotalWithTax || 0);
// ===== 打包费/餐盒费（P1）：与后端 campusPackingFeeProcess 同口径（先清旧值再按最终件数落一条 surcharge）=====
const PACKING_FEE_SKU = 'campus-packing-fee';
/** 已落账的打包费（分）：transition 后 activeOrder 会带上本条 surcharge，优先用后端口径 */
const packedFeeFromOrder = computed(() => {
    const list = (cart.order as any)?.surcharges ?? [];
    const hit = list.find((s: any) => s?.sku === PACKING_FEE_SKU);
    return hit ? Number(hit.priceWithTax) || 0 : 0;
});
/** 打包费预估（分）：按店铺配置 + 商品级覆盖（waimaiPackingFee）逐行累加，perOrder 取每单固定值 */
const packingFeeEstimateFen = computed(() => {
    const c = packingCfg.value;
    if (!c.enabled) return 0;
    const amount = Math.max(0, Math.round(c.amount || 0));
    let fee = 0;
    if (c.mode === 'perOrder') {
        fee = amount;
    } else {
        for (const line of (cart.order?.lines ?? []) as any[]) {
            const qty = Number(line?.quantity || 0);
            if (qty <= 0) continue;
            const raw = line?.productVariant?.product?.customFields?.waimaiPackingFee;
            const unit = raw == null ? amount : Math.max(0, Math.round(Number(raw) || 0));
            fee += unit * qty;
        }
    }
    if (c.cap != null && c.cap > 0) fee = Math.min(fee, Math.round(c.cap));
    return fee;
});
/** 展示用打包费（分）：后端已落账则用落账值，否则用预估值 */
const packingFeeFen = computed(() => Math.max(packedFeeFromOrder.value, packingFeeEstimateFen.value));
const showPackingFee = computed(() => packingCfg.value.enabled && packingFeeFen.value > 0);
const packingFeeLabel = computed(() => (packingCfg.value.label || '').trim() || locale.t('checkout.packingFee'));
// ===== 加料费（P1-2）：与后端 campusAddonFeeProcess 同口径（行内只存引用，金额按商品当前配置解析）=====
/** 已落账的加料费（分） */
const packedAddonFeeFromOrder = computed(() => {
    const list = (cart.order as any)?.surcharges ?? [];
    const hit = list.find((s: any) => s?.sku === ADDON_FEE_SKU);
    return hit ? Number(hit.priceWithTax) || 0 : 0;
});
/** 加料费预估（分）：逐行按商品 waimaiAddonGroups 解析行内 waimaiAddons 引用 */
const addonFeeEstimateFen = computed(() => {
    let fee = 0;
    for (const line of (cart.order?.lines ?? []) as any[]) {
        fee += quoteAddonFeePerLine(
            line?.customFields?.waimaiAddons,
            line?.productVariant?.product?.customFields?.waimaiAddonGroups,
            Number(line?.quantity || 0),
        );
    }
    return fee;
});
/** 展示用加料费（分）：后端已落账则用落账值，否则用预估值 */
const addonFeeFen = computed(() => Math.max(packedAddonFeeFromOrder.value, addonFeeEstimateFen.value));
const showAddonFee = computed(() => addonFeeFen.value > 0);
const addonFeeLabel = computed(() => locale.t('checkout.addonFee'));
/** 应付合计（分）：order.totalWithTax 未含尚未落账的打包费/加料费时补上预估值，避免页面金额低于实付 */
const payableFen = computed(() => {
    const total = Number((cart.order as any)?.totalWithTax || 0);
    return total
        + Math.max(0, packingFeeFen.value - packedFeeFromOrder.value)
        + Math.max(0, addonFeeFen.value - packedAddonFeeFromOrder.value);
});
// 起送价硬拦截：未达标禁止提交（后端 campusMinOrderProcess 兜底同口径）
const belowMinOrder = computed(() => activeTab.value === 'campus' && minOrderFen.value != null && goodsFen.value < minOrderFen.value);
const minOrderGapYuan = computed(() => (minOrderFen.value == null ? '0' : yuan(minOrderFen.value - goodsFen.value)));
// 满减凑单提示（解析 store.promoText）
const promoNotice = computed(() => {
    const hint = nextPromoHint(promoText.value, goodsFen.value);
    if (!hint) return '';
    return hint.reached
        ? locale.t('checkout.promoReached').replace('{t}', yuan(hint.thresholdFen)).replace('{y}', yuan(hint.discountFen))
        : locale.t('checkout.promoGap').replace('{d}', yuan(hint.gapFen)).replace('{y}', yuan(hint.discountFen));
});
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

// ===== 第 33 轮 结算页凑单：差价内商品一键加购，加购后金额/运费减免实时刷新 =====
const upsellCatalog = ref<any[]>([]);
const upsellCatalogToken = ref('');
const upsellBusy = ref('');
/** 目录按店铺缓存，onShow 幂等拉取（失败后下次 onShow 重试） */
async function ensureUpsellCatalog(token: string) {
    if (!token || (upsellCatalogToken.value === token && upsellCatalog.value.length)) return;
    try {
        const products = await fetchProductListForChannel(token);
        upsellCatalog.value = Array.isArray(products) ? products : [];
        upsellCatalogToken.value = token;
    } catch { /* 静默失败：凑单卡依赖 items 空数组自动隐藏 */ }
}
const upsellGap = computed(() => {
    if (!cart.order) return null;
    const sub = Number(goodsFen.value) || 0;
    const hint = nextPromoHint(promoText.value, sub);
    return upsellGapFen(sub, {
        minOrderFen: activeTab.value === 'campus' && minOrderFen.value != null ? minOrderFen.value : null,
        tierGapFen: hint && !hint.reached ? hint.gapFen : null,
        tierDiscountFen: hint && !hint.reached ? hint.discountFen : null,
        freeShipFen: campusRouteSel.value && freeShipFen.value != null ? freeShipFen.value : null,
    });
});
/** 当前运费（分）：校园 R1/R3 提交前用分区运费预估，否则用 order 实价 —— ship 档「省 ¥Y」取该值 */
const upsellShipCostFen = computed(() => {
    if (campusRouteSel.value && selectedZoneFeeFen.value != null) return selectedZoneFeeFen.value;
    return Number(cart.order?.shippingWithTax) || 0;
});
/** 凑单卡单一数据源：open=false 时整卡隐藏（差额已达成或无候选）；避免多 computed 组合 v-if 在 h5 下的残留 */
const upsellCard = computed(() => {
    const g = upsellGap.value;
    if (!g) return { open: false, title: '', save: '', pct: 0, items: [] as UpsellItem[] };
    const d = yuan(g.fen);
    let title: string; let save = '';
    if (g.kind === 'min') title = locale.t('checkout.upsellMin').replace('{d}', d);
    else if (g.kind === 'tier') title = locale.t('checkout.upsellTier').replace('{d}', d).replace('{y}', yuan(g.discountFen ?? 0));
    else {
        title = locale.t('checkout.upsellShip').replace('{d}', d);
        if (upsellShipCostFen.value > 0) save = locale.t('checkout.upsellSave').replace('{d}', yuan(upsellShipCostFen.value));
    }
    const inCart = (cart.order?.lines ?? []).map((l: any) => String(l?.productVariant?.id ?? ''));
    return { open: true, title, save, pct: upsellPct(goodsFen.value, g.thresholdFen), items: upsellPick(upsellCatalog.value, inCart, g.fen, 6) };
});
/** 加购推荐规格：返回最新 order 直接 setOrder，差额/进度/运费减免随 goodsFen 自动重算 */
async function addUpsell(it: UpsellItem) {
    if (upsellBusy.value) return;
    const token = currentChannelToken.value;
    if (!token || !it?.v?.id) return;
    upsellBusy.value = String(it.v.id);
    try {
        const res: any = await addItemToOrderInChannel(token, String(it.v.id), 1);
        const order = res?.addItemToOrder;
        if (!order?.id) throw new Error(order?.message || '');
        cart.setOrder(order);
        uni.showToast({ title: locale.t('checkout.upsellAdded'), icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('checkout.upsellAddFail'), icon: 'none' });
    } finally {
        upsellBusy.value = '';
    }
}

// Tab = 校园配送（恒显置首）+ eligible 启用的自提/邮寄
const shippingTabs = computed(() => {
    const tabs: { key: TabKey; label: string; method?: any }[] = [{ key: 'campus', label: locale.t('checkout.tabCampus') }];
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

// PM 展示名：管理端 name 缺失或为原始 code 时按内置文案兜底（extra PM 如 wechatpay-yourbao-h5）
function getPaymentName(pm: any): string {
    if (pm.name && pm.name !== pm.code) return pm.name;
    const labelKeys: Record<string, string> = {
        'wechatpay': 'payWechat', 'wechatpay-yourbao-h5': 'payWechat', 'alipay': 'payAlipay',
        'cod': 'payCod', 'balance-pay': 'payBalance', 'aggregate-pay': 'payAggregate',
    };
    const k = labelKeys[pm.code];
    return k ? locale.t(`checkout.${k}`) : pm.code;
}

function categorizeShipping(sm: any): ShippingCategory {
    if (sm.code === 'store-pickup') return 'store-pickup';
    return 'shipping';
}

function tabLabel(cat: ShippingCategory): string {
    const labelKeys: Record<ShippingCategory, string> = {
        shipping: 'tabShipping',
        'store-pickup': 'tabPickup',
    };
    return locale.t(`checkout.${labelKeys[cat]}`) || locale.t('checkout.shippingTitle');
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
        ui.showToast(locale.t('checkout.addrIncomplete'));
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
        ui.showToast(locale.t('checkout.saved'), 'success');
        showAddressForm.value = false;
        await reloadCustomerAddresses();
    } catch (e: any) { ui.showToast(e.message); }
    ui.hideLoading();
}

// 保存内嵌新增表单并使用
async function saveNewAddress() {
    if (!address.value.fullName || !address.value.phoneNumber || !address.value.streetLine1) {
        ui.showToast(locale.t('checkout.addrIncomplete'));
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
        ui.showToast(locale.t('checkout.saved'), 'success');
    } catch (e: any) { ui.showToast(e.message); }
    ui.hideLoading();
}

// 删除地址
async function deleteAddress(id: string) {
    return new Promise<void>((resolve) => {
        uni.showModal({
            title: locale.t('checkout.delAddrTitle'),
            content: locale.t('checkout.delAddrConfirm'),
            success: async (r: any) => {
                if (r.confirm) {
                    try {
                        ui.showLoading();
                        await deleteCustomerAddress(id);
                        if (selectedAddress.value?.id === id) selectedAddress.value = null;
                        await reloadCustomerAddresses();
                        ui.showToast(locale.t('checkout.deleted'), 'success');
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
        ui.showToast(locale.t('checkout.setDefaultOk'), 'success');
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
    return myUnusedCoupons.value.length ? locale.t('checkout.couponsAvailable').replace('{n}', String(myUnusedCoupons.value.length)) : locale.t('checkout.noCoupon');
});

const attachedCoupon = computed(() => !!attachedCouponCode.value);

// —— 优惠明细：逐项展开 order.discounts（券/满减/活动等），并给出已省合计 ——
const feeDetailOpen = ref(false);
const discountItems = computed(() => (cart.order?.discounts ?? [])
    .map((x: any) => {
        const fen = Math.abs(Math.round(Number(x?.amountWithTax) || 0));
        return { description: String(x?.description ?? ''), fen, yuan: (fen / 100).toFixed(2) };
    })
    .filter(x => x.fen > 0));
const discountTotalFen = computed(() => discountItems.value.reduce((s, x) => s + x.fen, 0));
const discountTotalYuan = computed(() => (discountTotalFen.value / 100).toFixed(2));

const sheetCoupons = computed(() =>
    [...myUnusedCoupons.value].sort((a, b) =>
        estimateDiscountFen(b.template, subtotalFen.value, shippingFen.value) - estimateDiscountFen(a.template, subtotalFen.value, shippingFen.value)));

/** 单张券在当前小计下的估算优惠（分） */
function estimateOf(c: any): number {
    return estimateDiscountFen(c.template, subtotalFen.value, shippingFen.value);
}

/** 当前可用券中估算最优的一张（门槛未过的排除） */
const bestCoupon = computed(() => {
    const usable = myUnusedCoupons.value.filter(c => !unavailableReason(c));
    return pickBestCoupon(usable.map(c => ({ ...c.template, code: c.code })), subtotalFen.value, shippingFen.value);
});
const bestCouponCode = computed(() => (bestCoupon.value as any)?.code ?? '');

/** 已挂券但存在更优券时，换券可再省的分额（同额不提示） */
const switchSavingFen = computed(() => {
    const best = bestCoupon.value as any;
    if (!attachedCouponCode.value || !best?.code || best.code === attachedCouponCode.value) return 0;
    const current = myUnusedCoupons.value.find(c => c.code === attachedCouponCode.value);
    const currentFen = current ? estimateOf(current) : 0;
    return Math.max(0, estimateDiscountFen(best, subtotalFen.value, shippingFen.value) - currentFen);
});

function applyBestCoupon() {
    const target = myUnusedCoupons.value.find(c => c.code === bestCouponCode.value);
    if (target) void pickCoupon(target);
}

function unavailableReason(c: any): string | null {
    return couponUnavailableReason(c.template as CouponTemplateLike, subtotalFen.value);
}

function csAmount(c: any): string {
    const t = c.template;
    if (t.type === 'PERCENT') return `${(t.discountValue / 10).toFixed(1).replace(/\.0$/, '')}${locale.t('checkout.csPercentSuffix')}`;
    if (t.type === 'FREE_SHIPPING') return locale.t('checkout.csFreeShipping');
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
        uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('checkout.couponFail'), icon: 'none' });
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
        uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('checkout.opFail'), icon: 'none' });
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
        uni.showToast({ title: locale.t('checkout.couponUsed'), icon: 'none' });
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
        uni.showToast({ title: locale.t('checkout.couponAutoUsed'), icon: 'none' });
    } catch { /* 试挂失败静默，用户可手动选 */ }
}

// ===== 就餐设置：发票抬头选择（数据源 Customer customFields.invoiceTitles） =====
const selectedInvoiceTitle = computed(() =>
    selectedInvoiceIndex.value >= 0 ? invoiceTitles.value[selectedInvoiceIndex.value] || null : null);

const invoiceRowText = computed(() => {
    const t = selectedInvoiceTitle.value;
    return t ? `${t.name} ${locale.t('checkout.invoiceSelected')}` : locale.t('checkout.invoiceNone');
});

/** 登录态下拉取发票抬头（解析失败/请求失败均静默，不阻断结算）；传入已有 customFields 时不再重复请求 */
async function loadInvoiceTitles(customFields?: any) {
    if (!authStore.isLoggedIn) return;
    if (!customFields) {
        try {
            const res: any = await getActiveCustomer();
            customFields = res?.activeCustomer?.customFields;
        } catch { /* 静默 */ }
    }
    invoiceTitles.value = parseInvoiceTitles(customFields?.invoiceTitles);
    if (selectedInvoiceIndex.value >= invoiceTitles.value.length) selectedInvoiceIndex.value = -1;
}

function openInvoiceSheet() {
    // 无抬头：引导到发票抬头管理页新增，不在弹层内嵌表单
    if (!invoiceTitles.value.length) {
        uni.showToast({ title: locale.t('checkout.invoiceAddHint'), icon: 'none' });
        uni.navigateTo({ url: '/pkg-user/pages/invoice-titles' });
        return;
    }
    showInvoiceSheet.value = true;
}

function chooseInvoice(i: number) {
    selectedInvoiceIndex.value = i;
    showInvoiceSheet.value = false;
}

onMounted(async () => {
    // 我的口味（本机）→ 餐具默认值；备注在提交时由 composeOrderNote 并入
    tasteProfile.value = readTasteProfile();
    tablewareCount.value = tasteProfile.value.tableware;
    // Load saved addresses（发票抬头复用同一份 customFields，避免重复请求）
    let custFields: any = null;
    try { const custRes: any = await getActiveCustomer(); customerAddresses.value = custRes.activeCustomer?.addresses || []; custFields = custRes.activeCustomer?.customFields; if (customerAddresses.value.length > 0) { selectedAddress.value = customerAddresses.value.find((a: any) => a.defaultShippingAddress) || customerAddresses.value[0]; } } catch (e) {}
    await loadInvoiceTitles(custFields);
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
                ui.showToast(locale.t('checkout.addrRequired'));
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
            ui.showToast(locale.t('checkout.pickupRequired'));
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
    if (order?.errorCode) throw new Error(order.message || locale.t('checkout.payFail'));
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
    // 起送价硬拦截：未达标弹窗阻断（后端 min-order 硬校验同口径兜底）
    if (belowMinOrder.value) {
        uni.showModal({
            title: locale.t('checkout.minOrderBlockTitle'),
            content: locale.t('checkout.minOrderGap').replace('{d}', minOrderGapYuan.value),
            confirmText: locale.t('checkout.goAddMore'),
            cancelText: locale.t('checkout.thinkAgain'),
            success: (r) => { if (r.confirm) uni.navigateBack(); },
        });
        return;
    }
    submitting.value = true;
    try {
        ui.showLoading();
        const ok = await prepareOrderAddressAndShipping();
        if (!ok) return;
        // 整单备注 + 餐具份数 + 发票：transition 前写入（总是调用，空值清残留）
        const note = composeOrderNote();
        const invoiceTitle = selectedInvoiceTitle.value;
        const invoiceFields = invoiceTitle
            ? {
                invoiceApplied: true,
                invoiceInfo: JSON.stringify({
                    titleName: invoiceTitle.name,
                    titleType: invoiceTitle.type,
                    taxNo: invoiceTitle.taxNo ?? null,
                    email: invoiceTitle.email,
                    appliedAt: new Date().toISOString(),
                }),
            }
            : { invoiceApplied: false, invoiceInfo: null };
        await setOrderCustomFields({
            note,
            tablewareCount: tablewareCount.value,
            ...invoiceFields,
        });
        // Transition to ArrangingPayment
        await transitionOrderToState('ArrangingPayment');
        const pay = await payCurrentOrder(selectedPayment.value);
        // fail = 支付未完成（取消/失败/addPaymentToOrder 报错），不得伪装成功
        if (pay.status === 'fail' || !pay.code) { ui.showToast(locale.t('checkout.payIncomplete')); return; }
        recordRecentItems();
        uni.redirectTo({ url: `/pkg-order/pages/pay-result?code=${encodeURIComponent(pay.code)}&status=${pay.status}` });
    } catch (e: any) { ui.showToast(e?.response?.errors?.[0]?.message || e.message); }
    ui.hideLoading();
    submitting.value = false;
}

/** 下单成功（含已调起待回调）：把本单商品写入「常买商品」，首页可一键加购 */
function recordRecentItems() {
    const lines = cart.order?.lines ?? [];
    const channelToken = storeMeta.value.channelToken || tenantStore.token || '';
    if (!channelToken) return;
    // 单品备注已并入本单整单备注，下单成功后清空，避免带到下一单
    clearStoreNotes(channelToken);
    notesTick.value++;
    for (const line of lines) {
        const v = line.productVariant;
        if (!v?.id) continue;
        favorites.touchRecentItem({
            channelId: storeMeta.value.channelId,
            channelToken,
            variantId: String(v.id),
            productId: v.productId != null ? String(v.productId) : undefined,
            name: v.name,
            price: Number(line.unitPriceWithTax ?? v.priceWithTax ?? 0),
            image: v.featuredAsset?.preview,
            storeName: storeMeta.value.storeName,
            routes: storeMeta.value.routes,
        });
    }
}

// 页面参数：店铺 routesEnabled 透传（menu→checkout，决定校园配送 Tab 路线判定/切换）
onLoad((q: any) => {
    const routes = String(q?.routes || '').split(',').map(s => s.trim()).filter(Boolean);
    campusRoutes.value = routes;
    if (!routes.includes('R3') && routes.includes('R1')) routeChoice.value = 'R1';
    minOrderFen.value = q?.minOrder ? Number(q.minOrder) : null;
    deliveryFeeFen.value = q?.dfee ? Number(q.dfee) : null;
    storeMeta.value = {
        channelId: q?.cid ? String(q.cid) : undefined,
        storeName: q?.shop ? decodeURIComponent(String(q.shop)) : undefined,
        channelToken: q?.token ? decodeURIComponent(String(q.token)) : (tenantStore.token || ''),
        routes: routes.join(','),
    };
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
/* 地址标签（家/学校/公司）：与地址簿共用本地标签数据 */
.address-block__label, .addr-option__label { font-size: 20rpx; color: #3b7ddd; border: 1rpx solid #3b7ddd; border-radius: 6rpx; padding: 2rpx 10rpx; }
.address-block { position: relative; &__top { display: flex; align-items: center; gap: 16rpx; } &__name { font-size: 30rpx; font-weight: 600; } &__phone { font-size: 26rpx; color: $text-color-secondary; } &__tag { font-size: 20rpx; color: $brand-color; border: 1rpx solid $brand-color; border-radius: 6rpx; padding: 0 8rpx; } &__detail { display: block; font-size: 26rpx; color: $text-color-secondary; margin-top: 12rpx; line-height: 1.5; } &__change { display: block; text-align: right; font-size: 24rpx; color: $brand-color; margin-top: 8rpx; } }
.addr-modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 300; display: flex; align-items: flex-end; }
.addr-modal { width: 100%; max-height: 75vh; background: $surface; border-radius: 24rpx 24rpx 0 0; padding: 24rpx; box-sizing: border-box; display: flex; flex-direction: column; &__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; } &__title { font-size: 30rpx; font-weight: 600; } &__close { font-size: 32rpx; color: $text-color-placeholder; padding: 8rpx; } &__list { flex: 1; max-height: 55vh; } &__empty { text-align: center; padding: 60rpx 0; color: $text-color-placeholder; font-size: 26rpx; } &__fab { margin-top: 20rpx; height: 80rpx; line-height: 80rpx; text-align: center; border-radius: $radius-md; background: $brand-color-light; color: $brand-color; font-size: 28rpx; &--save { background: $brand-color; color: #fff; } } }
.addr-option { border: 1rpx solid $border-color; border-radius: $radius-md; padding: 20rpx; margin-bottom: 16rpx; &.selected { border-color: $brand-color; background: $brand-color-light; } &__top { display: flex; align-items: center; gap: 12rpx; } &__name { font-size: 28rpx; font-weight: 600; } &__phone { font-size: 24rpx; color: $text-color-secondary; } &__tag { font-size: 20rpx; color: $brand-color; border: 1rpx solid $brand-color; border-radius: 6rpx; padding: 0 8rpx; } &__detail { display: block; font-size: 24rpx; color: $text-color-secondary; margin-top: 8rpx; } &__actions { display: flex; gap: 24rpx; margin-top: 12rpx; font-size: 24rpx; } &__edit { color: $brand-color; } &__del { color: $text-color-placeholder; } &__default { color: $text-color-secondary; } }
.pickup-card { border: 1rpx solid $border-color; border-radius: $radius-md; padding: 20rpx; &__name { font-size: 28rpx; font-weight: 600; display: block; } &__addr { display: block; font-size: 24rpx; color: $text-color-secondary; margin-top: 8rpx; } &__meta { display: flex; gap: 16rpx; margin-top: 8rpx; } &__hours, &__dist { font-size: 22rpx; color: $text-color-placeholder; } &__change { display: block; text-align: right; font-size: 24rpx; color: $brand-color; margin-top: 8rpx; } }
.pickup-empty { text-align: center; padding: 30rpx 0; color: $text-color-secondary; font-size: 26rpx; &__loading { color: $text-color-placeholder; } &__hint { display: block; font-size: 22rpx; color: $text-color-placeholder; margin-top: 8rpx; } &__btn { margin-top: 16rpx; } &__btn--primary { background: $brand-color; color: #fff; } }
.radio-item { display: flex; justify-content: space-between; align-items: center; padding: 20rpx; border: 1rpx solid $border-color; border-radius: $radius-md; margin-bottom: 16rpx; font-size: 26rpx; &.active { border-color: $brand-color; background: $brand-color-light; } &__left { display: flex; align-items: center; gap: 12rpx; } &__icon { font-size: 32rpx; } &__balance { font-size: 24rpx; color: $text-color-secondary; } }
.checkout-page__summary { background: $surface; border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx; }
.summary-row { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 26rpx; color: $text-color-secondary; &--total { border-top: 1rpx solid $border-color; margin-top: 8rpx; padding-top: 16rpx; color: $text-color; font-size: 28rpx; } }
.note-card { background: #fff; border-radius: 16rpx; padding: 20rpx 24rpx; margin-top: 20rpx;
  .note-card__head { display: flex; align-items: center; justify-content: space-between; }
  .note-card__label { font-size: 26rpx; font-weight: 600; color: $text-color; }
  .note-card__manage { font-size: 22rpx; color: $brand-color; padding: 4rpx 8rpx; }
  .note-card__input { margin-top: 12rpx; width: 100%; min-height: 100rpx; font-size: 26rpx; color: $text-color; line-height: 1.6; }
  .note-card__count { text-align: right; font-size: 22rpx; color: $text-color-secondary; } }
// 单品备注摘要（来自购物车逐行标注）
.line-notes { margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx dashed $border-color;
  &__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
  &__title { font-size: 22rpx; font-weight: 600; color: #b45309; }
  &__clear { font-size: 21rpx; color: $text-color-placeholder; padding: 2rpx 8rpx; }
  &__item { display: block; font-size: 22rpx; color: $text-color-secondary; line-height: 1.7; }
}
.note-chips { margin-top: 12rpx; white-space: nowrap; }
/* 我的口味入口：摘要 + 去设置（跳「我的口味」页） */
.taste-entry { display: flex; align-items: center; gap: 16rpx; margin-top: 14rpx; padding: 16rpx 20rpx; border-radius: $radius-sm; background: $bg-color; }
.taste-entry__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
.taste-entry__label { font-size: 24rpx; font-weight: 600; color: $text-color; }
.taste-entry__value { font-size: 22rpx; color: $text-color-secondary; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.taste-entry__arrow { flex-shrink: 0; font-size: 22rpx; color: $brand-color; }
.taste-hint { display: block; margin-top: 6rpx; font-size: 20rpx; color: $text-color-placeholder; }
.note-chip { display: inline-block; padding: 8rpx 18rpx; margin-right: 12rpx; border-radius: 999rpx; font-size: 22rpx; background: $bg-color; color: $text-color-secondary; border: 1rpx solid transparent;
  &.on { color: $brand-color; border-color: $brand-color; background: $brand-color-light; }
  &--add { color: $brand-color; background: #fff; border: 1rpx dashed $brand-color; } }
// ===== 备注模板管理弹层 =====
.note-sheet-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 999; display: flex; align-items: flex-end; }
.note-sheet { width: 100%; background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 32rpx 24rpx calc(32rpx + env(safe-area-inset-bottom)); max-height: 70vh; box-sizing: border-box; display: flex; flex-direction: column;
  &__title { text-align: center; font-size: 30rpx; font-weight: 600; padding-bottom: 24rpx; }
  &__list { max-height: 40vh; }
  &__empty { text-align: center; padding: 40rpx 0; font-size: 24rpx; color: $text-color-placeholder; }
  &__add { display: flex; gap: 12rpx; margin-top: 16rpx; }
  &__input { flex: 1; height: 72rpx; background: $bg-color; border-radius: $radius-sm; padding: 0 20rpx; font-size: 26rpx; }
  &__btn { height: 72rpx; line-height: 72rpx; padding: 0 28rpx; border-radius: $radius-sm; background: $brand-color; color: #fff; font-size: 26rpx; }
  &__done { margin-top: 20rpx; height: 80rpx; line-height: 80rpx; text-align: center; border-radius: $radius-md; background: $bg-color; color: $text-color; font-size: 28rpx; } }
.note-tpl { display: flex; align-items: center; justify-content: space-between; padding: 20rpx 24rpx; border: 1rpx solid $border-color; border-radius: $radius-md; margin-bottom: 12rpx;
  &__txt { font-size: 26rpx; color: $text-color; }
  &__del { font-size: 26rpx; color: $text-color-placeholder; padding: 4rpx 10rpx; } }
// ===== 就餐设置：餐具份数 + 配送偏好 + 发票入口 =====
.pref-head { display: flex; align-items: center; justify-content: space-between;
  &__manage { font-size: 22rpx; color: $brand-color; } }
.setting-card { background: #fff; border-radius: 16rpx; padding: 20rpx 24rpx; margin-top: 20rpx;
  .setting-row { display: flex; flex-direction: column; gap: 12rpx;
    & + .setting-row { margin-top: 20rpx; padding-top: 20rpx; border-top: 1rpx solid $border-color; }
    &__label { font-size: 26rpx; font-weight: 600; color: $text-color; flex-shrink: 0; }
    &__chips { gap: 12rpx; .chip { padding: 10rpx 16rpx; font-size: 22rpx; } }
    &--link { flex-direction: row; align-items: center; justify-content: space-between; }
    &__value { display: flex; align-items: center; gap: 8rpx; max-width: 62%; }
    &__text { font-size: 26rpx; color: $text-color-secondary; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      &--picked { color: $brand-color; } }
    &__arrow { font-size: 30rpx; color: $text-color-placeholder; } } }
// ===== 发票抬头弹层 =====
.invoice-sheet-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 999; display: flex; align-items: flex-end; }
.invoice-sheet { width: 100%; background: #f5f5f5; border-radius: 24rpx 24rpx 0 0; padding: 32rpx 24rpx calc(32rpx + env(safe-area-inset-bottom)); max-height: 70vh; box-sizing: border-box; display: flex; flex-direction: column; }
.invoice-sheet__title { text-align: center; font-size: 30rpx; font-weight: bold; padding-bottom: 24rpx; }
.invoice-sheet__list { max-height: 56vh; }
.iv-item { display: flex; align-items: center; justify-content: space-between; background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; border: 1rpx solid transparent;
  &--on { border-color: $brand-color; background: $brand-color-light; }
  &__main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  &__name { font-size: 28rpx; color: $text-color; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__meta { font-size: 22rpx; color: $text-color-secondary; margin-top: 6rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__check { font-size: 30rpx; color: $brand-color; margin-left: 16rpx; } }
.checkout-page__total { color: $price-color; font-size: 36rpx; font-weight: bold; }
// plan 3.2 满X免配送费（方案A：运费行内减免）
.ship-orig { color: $text-color-placeholder; text-decoration: line-through; font-size: 24rpx; margin-right: 8rpx; }
.ship-tag { margin-left: 12rpx; font-size: 20rpx; color: $brand-color; background: $brand-color-light; border-radius: 6rpx; padding: 2rpx 10rpx; }
.ship-free-hint { padding: 4rpx 0 8rpx; font-size: 22rpx; color: $brand-color; }
.promo-hint { padding: 4rpx 0 8rpx; font-size: 22rpx; color: $price-color; }
/* 凑单卡（第 33 轮）：差额内商品一键加购 */
.upsell-card { margin: 10rpx 0 6rpx; padding: 16rpx; background: #fff8f3; border: 1rpx solid #ffe0c7; border-radius: 16rpx; }
.upsell-card__hd { display: flex; align-items: baseline; justify-content: space-between; }
.upsell-card__t { font-size: 24rpx; font-weight: 600; color: #e05f00; }
.upsell-card__save { font-size: 20rpx; color: #c0763f; }
.upsell-card__bar { height: 10rpx; margin: 12rpx 0 8rpx; background: #ffe6d2; border-radius: 6rpx; overflow: hidden; }
.upsell-card__fill { height: 100%; background: #ff6600; border-radius: 6rpx; transition: width .2s ease; }
.upsell-card__sub { font-size: 20rpx; color: #a06a44; }
.upsell-card__row { margin-top: 12rpx; white-space: nowrap; }
.up-item { display: inline-flex; flex-direction: column; width: 132rpx; margin-right: 12rpx; padding: 10rpx; background: #fff; border: 1rpx solid #f3e2d4; border-radius: 12rpx; vertical-align: top; }
.up-item__img { width: 96rpx; height: 96rpx; border-radius: 10rpx; background: #fff3ea; }
.up-item__name { max-width: 112rpx; margin-top: 8rpx; font-size: 20rpx; color: #4a4a4a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.up-item__price { margin-top: 4rpx; font-size: 22rpx; font-weight: 600; color: #ff6600; }
.up-item__add { width: 36rpx; height: 36rpx; margin-top: 8rpx; border-radius: 50%; background: #ff6600; color: #fff; font-size: 26rpx; line-height: 34rpx; text-align: center; }
.up-item__add.busy { opacity: .5; }
.min-order-hint { padding: 8rpx 16rpx; margin: 4rpx 0 8rpx; font-size: 22rpx; color: #d93025; background: #fdecea; border-radius: $radius-sm; }
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
// ===== 优惠明细（v14）：逐项展开 + 已省合计 =====
.summary-row--saved { cursor: pointer; }
.fee-detail__toggle { color: #ff4d4f; }
.fee-detail { padding: 4rpx 0 12rpx; border-bottom: 1rpx solid $border-color;
  &__row { display: flex; justify-content: space-between; align-items: center; font-size: 24rpx; color: $text-color-secondary; padding: 6rpx 0; }
  &__desc { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 16rpx; }
  &__amt { color: #ff4d4f; flex-shrink: 0; } }
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
.cs-item__title-row { display: flex; align-items: center; gap: 10rpx; }
.cs-item__best { font-size: 18rpx; color: #fff; background: #ff6600; border-radius: 6rpx; padding: 2rpx 8rpx; flex-shrink: 0; }
.cs-item__save { font-size: 22rpx; color: #ff6600; margin-top: 6rpx; }
/* 「换券可再省」提示条：位于优惠券行上方，点击直接切到最优券 */
.coupon-tip { display: flex; align-items: center; font-size: 22rpx; color: #b45309; background: #fff8ef; border: 1rpx solid #ffd9ad; border-radius: $radius-sm; padding: 10rpx 16rpx; margin: 4rpx 0 8rpx; }
.cs-item--none { justify-content: center; padding: 28rpx 0; color: #666; font-size: 26rpx; }
</style>
