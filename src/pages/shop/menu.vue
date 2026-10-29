<template>
    <view class="menu-page" :class="{ dark: theme === 'dark' }">
        <view class="hero"></view>
        <!-- 店铺信息卡（浮出压橙头） -->
        <view class="shopcard">
            <view class="shop-top">
                <view class="logo">{{ shopName.slice(0, 1) }}</view>
                <view class="shop-main">
                    <text class="sname">{{ shopName }}</text>
                    <text class="smeta">{{ routesText }}</text>
                </view>
                <view class="share-btn" @tap.stop="shareShop">
                    <text class="share-ico">↗</text>
                    <text class="share-txt">{{ $t('menu.share') }}</text>
                </view>
                <view class="fav-btn" :class="{ on: isFav, disabled: favChannelId == null }" @tap.stop="toggleFav">
                    <text class="fav-ico">{{ isFav ? '♥' : '♡' }}</text>
                    <text class="fav-txt">{{ isFav ? $t('menu.favRemove') : $t('menu.favAdd') }}</text>
                </view>
            </view>
            <view class="tags" v-if="promoText">
                <text class="tag">🔥 {{ promoText }}</text>
            </view>
            <!-- 阶梯满减：全部档位 + 已达成/下一档差额 -->
            <view class="promo-tiers" v-if="promoTierList.length">
                <view
                    v-for="t in promoTierList" :key="'tier-' + t.thresholdFen"
                    class="promo-tier" :class="{ hit: t.reached, next: t.next }"
                >
                    <text class="promo-tier__main">{{ $t('menu.tierLabel').replace('{t}', yuan(t.thresholdFen)).replace('{d}', yuan(t.discountFen)) }}</text>
                    <text v-if="t.next && t.gapFen > 0" class="promo-tier__gap">{{ $t('menu.tierGap').replace('{d}', yuan(t.gapFen)) }}</text>
                </view>
            </view>
            <!-- 食安公示条：证照 / 等级 / 明厨亮灶入口 -->
            <view v-if="hasFoodSafety" class="fs-bar" @tap.stop="openFoodSafety">
                <text class="fs-bar__ico">🛡</text>
                <text class="fs-bar__txt">{{ foodSafetyBrief }}</text>
                <text v-if="storeInfo?.kitchenLiveEnabled && storeInfo?.kitchenLiveUrl" class="fs-bar__live">● {{ $t('menu.kitchenLiveOn') }}</text>
                <text class="fs-bar__more">{{ $t('menu.noticeMore') }} ›</text>
            </view>
            <!-- 智能取餐柜入口（P2-4）：有启用柜机或无人配送已开通时展示 -->
            <view v-if="hasLocker" class="lk-bar" @tap.stop="openLocker">
                <text class="lk-bar__ico">🔒</text>
                <text class="lk-bar__txt">{{ lockerBrief }}</text>
                <text class="lk-bar__more">{{ $t('menu.noticeMore') }} ›</text>
            </view>
        </view>
        <!-- 商家投放：店铺页顶部广告（P2-3 广告位，审核通过且在投放窗口内才展示） -->
        <view v-if="shopAds.length" class="shop-ad">
            <view
                v-for="a in shopAds" :key="'sad-' + a.id" class="shop-ad__item"
                :class="{ 'no-img': !a.imageUrl }" @tap="openAdLink(a)"
            >
                <image v-if="a.imageUrl" class="shop-ad__img" :src="a.imageUrl" mode="aspectFill" />
                <view class="shop-ad__body">
                    <text class="shop-ad__tag">{{ $t('ad.sponsored') }}</text>
                    <text class="shop-ad__title">{{ a.title }}</text>
                    <text class="shop-ad__end">{{ $t('ad.ends').replace('{d}', a.endDate) }}</text>
                </view>
            </view>
        </view>
        <!-- 预计送达条（第 38 轮）：营业中展示 ETA 区间；打烊时由下方营业状态条接管 -->
        <view v-if="etaBarText" class="eta-bar">
            <text class="eta-bar__ico">⚡</text>
            <text class="eta-bar__txt">{{ etaBarText }}</text>
            <text class="eta-bar__hint">{{ $t('menu.etaHint') }}</text>
        </view>
        <!-- 营业状态提示：打烊/即将打烊（打烊仍可浏览加购，不可提交订单） -->
        <view v-if="storeStateText" class="shop-state" :class="storeClosed ? 'shop-state--closed' : 'shop-state--closing'">
            <text class="shop-state__ico">{{ storeClosed ? '🌙' : '⏰' }}</text>
            <text class="shop-state__txt">{{ storeStateText }}</text>
        </view>
        <!-- 店铺公告条：单行省略，点击查看完整公告（首次进店每日自动弹一次） -->
        <view v-if="storeNotice" class="notice-bar" @tap="openNotice">
            <text class="notice-bar__ico">📣</text>
            <text class="notice-bar__txt">{{ storeNotice }}</text>
            <text class="notice-bar__more">{{ $t('menu.noticeMore') }} ›</text>
        </view>
        <!-- 好友分享的菜品：定位并高亮，一键加购 -->
        <view v-if="sharedDish" class="dish-share">
            <view class="dish-share__info">
                <text class="dish-share__tag">{{ $t('menu.dishFromFriend') }}</text>
                <text class="dish-share__name">{{ sharedDish.name || sharedDishName }}</text>
                <text class="dish-share__hint">{{ $t('menu.dishFromFriendHint') }}</text>
            </view>
            <view class="dish-share__add" :class="{ disabled: sharedDishMissing }" @tap="addSharedDish">
                {{ sharedDishMissing ? $t('menu.dishNotFound') : $t('menu.dishAddNow') }}
            </view>
        </view>
        <!-- 常点搭配：按本店历史订单高频共现组合一键整组加购 -->
        <view v-if="combo" class="combo">
            <view class="combo__head">
                <text class="combo__title">🍱 {{ $t('menu.comboTitle') }}</text>
                <text class="combo__hint">{{ $t('menu.comboHint').replace('{n}', String(combo.orders)) }}</text>
            </view>
            <view class="combo__row">
                <view v-for="it in combo.items" :key="'combo-' + it.variantId" class="combo__item">
                    <image v-if="it.image" class="combo__img" :src="it.image" mode="aspectFill" />
                    <view v-else class="combo__img combo__img--txt">{{ (it.name || '?').slice(0, 1) }}</view>
                    <view class="combo__info">
                        <text class="combo__name">{{ it.name }}</text>
                        <text class="combo__price">¥{{ comboPrice(it.price) }}</text>
                    </view>
                </view>
            </view>
            <view class="combo__foot">
                <text class="combo__sum">¥{{ comboPrice(combo.total) }}</text>
                <view class="combo__btn" :class="{ busy: comboBusy }" @tap="addCombo">{{ $t('menu.comboAdd') }}</view>
            </view>
        </view>
        <!-- 店内热销榜：月售 Top6 横滑，⊕ 直接加购（在售热销 ≤3 个或全 0 月售时隐藏） -->
        <view v-if="hotShow" class="hot-sale">
            <view class="hot-sale__head">
                <text class="hot-sale__title">🔥 {{ $t('menu.hotTitle') }}</text>
                <text class="hot-sale__badge">{{ $t('menu.hotBadge') }}</text>
                <text class="hot-sale__more" @tap="hotJumpTo(hotList[0])">{{ $t('menu.hotMore') }} ›</text>
            </view>
            <scroll-view scroll-x class="hot-sale__row">
                <view v-for="d in hotList" :key="'hot-' + d.id" class="hot-item" @tap.stop="hotJumpTo(d)">
                    <view class="hot-item__imgwrap">
                        <VImage v-if="d.image" :src="d.image" width="152rpx" height="152rpx" class="hot-item__img" />
                        <view v-else class="hot-item__img hot-item__img--txt">{{ d.name.slice(0, 1) }}</view>
                        <text class="hot-item__rank" :class="'rk-' + d.rank">{{ d.rank }}</text>
                    </view>
                    <text class="hot-item__name">{{ d.name }}</text>
                    <text class="hot-item__sales">{{ $t('menu.hotSales').replace('{n}', String(d.sales)) }}</text>
                    <view class="hot-item__foot">
                        <text class="hot-item__price">¥{{ yuan(d.priceFen) }}</text>
                        <view class="hot-item__add" @tap.stop="hotAdd(d.id)">+</view>
                    </view>
                </view>
            </scroll-view>
        </view>
        <!-- 三 Tab -->
        <view class="tabs">
            <view class="tb" :class="{ on: tab === 'goods' }" @tap="switchTab('goods')">{{ $t('menu.tabGoods') }}</view>
            <view class="tb" :class="{ on: tab === 'reviews' }" @tap="switchTab('reviews')">{{ $t('menu.tabReviews') }}</view>
            <view class="tb" :class="{ on: tab === 'merchant' }" @tap="switchTab('merchant')">{{ $t('menu.tabMerchant') }}</view>
        </view>

        <!-- 商品：左分类右商品 -->
        <view class="panel" v-show="tab === 'goods'">
            <view class="body">
                <scroll-view scroll-y class="cats">
                    <view v-for="c in cats" :key="c.id" class="cat" :class="{ on: c.id === activeCat }" @tap="activeCat = c.id">
                        {{ c.id === 'all' ? $t('menu.catAll') : c.name }}
                    </view>
                </scroll-view>
                <scroll-view scroll-y class="goods" :scroll-into-view="scrollInto" scroll-with-animation>
                    <!-- 店内搜索：实时本地过滤 + 历史/热门词（纯前端，无额外请求） -->
                    <view class="shop-search">
                        <text class="shop-search__ico">🔍</text>
                        <input
                            class="shop-search__ipt" v-model="keyword" :placeholder="$t('menu.searchInShop')"
                            confirm-type="search" @confirm="commitKeyword"
                        />
                        <text v-if="keyword" class="shop-search__x" @tap="clearKeyword">✕</text>
                    </view>
                    <view class="suggest" v-if="!keyword && (searchHistory.length || hotWords.length)">
                        <view class="suggest__group" v-if="searchHistory.length">
                            <view class="suggest__head">
                                <text>{{ $t('menu.searchHistory') }}</text>
                                <text class="suggest__clear" @tap="clearSearchHistory">🗑</text>
                            </view>
                            <view class="suggest__chips">
                                <text v-for="w in searchHistory" :key="'h-' + w" class="suggest__chip" @tap="applyKeyword(w)">{{ w }}</text>
                            </view>
                        </view>
                        <view class="suggest__group" v-if="hotWords.length">
                            <view class="suggest__head"><text>{{ $t('menu.hotSearch') }}</text></view>
                            <view class="suggest__chips">
                                <text v-for="w in hotWords" :key="'t-' + w" class="suggest__chip suggest__chip--hot" @tap="applyKeyword(w)">{{ w }}</text>
                            </view>
                        </view>
                    </view>
                    <!-- 排序 chips：售罄始终置底，切换不重新请求接口 -->
                    <view class="good-sort">
                        <view class="sort-chip" :class="{ on: sortKey === 'default' }" @tap="setSort('default')">{{ $t('menu.sortDefault') }}</view>
                        <view class="sort-chip" :class="{ on: sortKey === 'sales' }" @tap="setSort('sales')">{{ $t('menu.sortSales') }}</view>
                        <view class="sort-chip" :class="{ on: sortKey === 'price' }" @tap="setSort('price')">{{ $t('menu.sortPrice') }} {{ priceAsc ? '↑' : '↓' }}</view>
                    </view>
                    <!-- 筛选 chips：与排序分行，避免 5 个 chip 挤在一起折行 -->
                    <view class="good-filter">
                        <view class="sort-chip" :class="{ on: onlyCoupon }" @tap="onlyCoupon = !onlyCoupon">{{ $t('menu.filterCoupon') }}</view>
                        <view class="sort-chip" :class="{ on: hideSoldOut }" @tap="hideSoldOut = !hideSoldOut">{{ $t('menu.filterInStock') }}</view>
                    </view>
                    <!-- 首页搜索/收藏/常买商品带 q 进店：只筛当前分类商品，可一键清除 -->
                    <view v-if="productQuery" class="good-search">
                        <text class="good-search__txt">{{ $t('menu.searchChip').replace('{q}', productQuery) }}</text>
                        <text class="good-search__x" @tap="clearProductQuery">✕</text>
                    </view>
                    <template v-for="g in goodsOf(activeCat)" :key="g.id">
                    <view
                        :id="'g-' + g.id"
                        class="good" :class="{ 'good--sold': goodSoldOut(g), 'good--hl': isSharedGood(g), 'good--top1': hotRank(g) === 1 }"
                        @tap="pickSku(g)"
                    >
                        <VImage :src="g.featuredAsset?.preview" width="140rpx" height="140rpx" class="good-img" />
                        <view class="good-info">
                            <view class="good-title">
                                <text v-if="hotRank(g)" class="hot-rank" :class="'hot-rank--' + hotRank(g)">TOP {{ hotRank(g) }}</text>
                                <text class="good-name">{{ g.name }}</text>
                                <text v-if="isNewGood(g)" class="good-tag good-tag--new">{{ $t('menu.newTag') }}</text>
                                <text v-if="isSharedGood(g)" class="good-tag good-tag--shared">{{ $t('menu.dishFromFriend') }}</text>
                                <text v-if="goodSoldOut(g)" class="good-tag good-tag--sold">{{ $t('menu.soldOut') }}</text>
                                <text v-else-if="goodLeft(g) != null" class="good-tag good-tag--left">{{ $t('menu.leftCount').replace('{n}', String(goodLeft(g))) }}</text>
                                <text v-else-if="goodLowStock(g)" class="good-tag good-tag--low">{{ $t('menu.lowStock') }}</text>
                            </view>
                            <text class="good-desc">{{ plainDescription(g.description) }}</text>
                            <!-- 口味偏好命中：忌口 / 过敏原（进店即提示，避免误点） -->
                            <text v-if="tasteTag(g)" class="good-taste" :class="{ warn: tasteTag(g).warn }">{{ tasteTag(g).text }}</text>
                            <view class="good-rate" v-if="g.customFields?.reviewCount > 0">
                                <text class="good-rate__star">★</text>
                                <text class="good-rate__num">{{ (g.customFields.reviewRating || 0).toFixed(1) }}</text>
                                <text class="good-rate__cnt">{{ $t('menu.reviewCount').replace('{n}', String(g.customFields.reviewCount)) }}</text>
                            </view>
                            <view class="good-coupon" v-if="couponOf(g)" @tap.stop="claimProduct(couponOf(g))">
                                <text class="good-coupon__txt">{{ couponChipText(couponOf(g)) }}</text>
                                <text class="good-coupon__action">{{ couponClaimed(g.id) ? $t('menu.claimed') : $t('menu.claim') }}</text>
                            </view>
                            <view class="price-row">
                                <PriceTag :price="g.variants[0]?.priceWithTax || 0" />
                                <text class="good-nearby" @tap.stop="openNearby(g)">📍 {{ $t('menu.nearbyStock') }}</text>
                            </view>
                        </view>
                        <view class="add-btn spec" :class="{ disabled: goodSoldOut(g) }" v-if="(g.variants?.length ?? 0) > 1" @tap.stop="pickSku(g)">{{ $t('menu.pickSpec') }}</view>
                        <view class="add-btn" :class="{ disabled: goodSoldOut(g) }" v-else @tap.stop="addToCart(g)">+</view>
                        <view class="good-share" @tap.stop="shareDish(g)">↗</view>
                        <view class="good-fav" :class="{ on: isGoodFav(g) }" @tap.stop="toggleGoodFav(g)">{{ isGoodFav(g) ? '♥' : '♡' }}</view>
                    </view>
                    <!-- 售罄智能替代（第 37 轮）：行内「换同款」→ 展开同店同价位可售替代 -->
                    <view v-if="showAltBar(g)" class="alt-bar" :class="{ open: altOpenId === String(g.id) }" @tap="toggleAlt(g)">
                        <text class="alt-bar__txt">{{ $t('menu.altBar').replace('{n}', String(altCandidates(g).length)) }}</text>
                        <text class="alt-bar__chev">{{ altOpenId === String(g.id) ? '⌃' : '⌄' }}</text>
                    </view>
                    <view v-if="showAltBar(g) && altOpenId === String(g.id)" class="alt-panel">
                        <scroll-view scroll-x class="alt-panel__scroll">
                            <view class="alt-panel__row">
                                <view v-for="it in altCandidates(g)" :key="'alt-' + it.product.id" class="alt-card" @tap="altPick(it)">
                                    <VImage :src="it.product.featuredAsset?.preview" width="116rpx" height="116rpx" class="alt-card__img" />
                                    <text class="alt-card__nm">{{ it.product.name }}</text>
                                    <text class="alt-card__why">{{ altReasonText(it) }}</text>
                                    <view class="alt-card__foot">
                                        <PriceTag :price="it.priceFen" />
                                        <text class="alt-card__plus" @tap.stop="altPick(it)">+</text>
                                    </view>
                                </view>
                            </view>
                        </scroll-view>
                    </view>
                    </template>
                    <view class="scroll-pad"></view>
                    <!-- 搜索无结果：空白态 + 热搜兜底，点词直接换关键词 -->
                    <view class="suggest" v-if="keyword.trim() && !goodsOf(activeCat).length && hotWords.length">
                        <view class="suggest__group">
                            <view class="suggest__head"><text>{{ $t('menu.hotSearch') }}</text></view>
                            <view class="suggest__chips">
                                <text v-for="w in hotWords" :key="'e-' + w" class="suggest__chip suggest__chip--hot" @tap="applyKeyword(w)">{{ w }}</text>
                            </view>
                        </view>
                    </view>
                    <EmptyState v-if="!goodsOf(activeCat).length" :text="keyword.trim() ? $t('menu.emptySearch').replace('{k}', keyword.trim()) : $t('menu.emptyCat')" />
                </scroll-view>
            </view>
        </view>

        <!-- 评论：A 版式（摘要卡 + 筛选 chips + 评论列表，首切加载） -->
        <scroll-view scroll-y class="panel solo" v-show="tab === 'reviews'" @scrolltolower="loadMoreReviews">
            <view class="rv-summary" v-if="reviewStats && reviewStats.totalCount > 0">
                <view class="rv-sum-top">
                    <view class="rv-score">
                        <text class="rv-score__num">{{ reviewStats.averageRating }}</text>
                        <text class="rv-score__lab">{{ $t('menu.overallScore') }}</text>
                    </view>
                    <view class="rv-dist">
                        <view v-for="d in reviewStats.ratingDistribution" :key="d.rating" class="rv-dist__row">
                            <text class="rv-dist__star">{{ d.rating }}★</text>
                            <view class="rv-dist__bar"><view class="rv-dist__fill" :style="{ width: distWidth(d.count) }"></view></view>
                            <text class="rv-dist__pct">{{ distPct(d.count) }}</text>
                        </view>
                    </view>
                </view>
                <view class="rv-sum-foot">
                    <text>{{ $t('menu.totalReviews').replace('{n}', String(reviewStats.totalCount)) }}</text>
                    <text>{{ $t('menu.goodRate').replace('{n}', String(reviewStats.goodRate)) }}</text>
                </view>
            </view>
            <view class="rv-chips">
                <view
                    v-for="f in reviewFilters" :key="f.key"
                    class="rv-chip" :class="{ on: reviewFilter === f.key }"
                    @tap="switchReviewFilter(f.key)"
                >{{ $t(f.label) }}</view>
            </view>
            <view v-for="r in reviewList" :key="r.id" class="rv-item">
                <view class="rv-head">
                    <view class="rv-avatar">{{ displayName(r) }}</view>
                    <view class="rv-who">
                        <text class="rv-name">{{ displayName(r, true) }}</text>
                        <text class="rv-stars">{{ '★'.repeat(r.rating) }}<text class="off">{{ '★'.repeat(5 - r.rating) }}</text></text>
                    </view>
                    <text class="rv-date">{{ formatDate(r.createdAt) }}</text>
                </view>
                <text class="rv-content">{{ r.content }}</text>
                <view v-if="r.images?.length" class="rv-imgs">
                    <VImage v-for="(img, i) in r.images" :key="i" :src="img" width="150rpx" height="150rpx" @tap="previewReviewImages(r.images, i)" />
                </view>
                <view v-if="r.tags?.length" class="rv-tags">
                    <text v-for="(t, i) in r.tags" :key="i" class="rv-tag">{{ t }}</text>
                </view>
                <view v-if="r.reply" class="rv-reply"><text class="rv-reply__who">{{ $t('menu.merchantReply') }}</text>{{ r.reply }}</view>
                <view v-for="fu in r.followUps ?? []" :key="fu.id" class="rv-reply">
                    <text class="rv-reply__who">{{ $t('menu.followUp') }}</text>{{ fu.content }}
                    <view v-if="fu.images?.length" class="rv-imgs">
                        <VImage v-for="(img, i) in fu.images" :key="i" :src="img" width="130rpx" height="130rpx" @tap="previewReviewImages(fu.images, i)" />
                    </view>
                </view>
            </view>
            <view v-if="reviewLoading" class="rv-more">{{ $t('menu.loading') }}</view>
            <view v-else-if="reviewList.length && !reviewHasMore" class="rv-more">{{ $t('menu.noMore') }}</view>
            <EmptyState v-if="!reviewLoading && !reviewList.length" :text="$t('menu.emptyReviews')" />
            <view class="scroll-pad"></view>
        </scroll-view>

        <!-- 商家：店铺信息 -->
        <scroll-view scroll-y class="panel solo" v-show="tab === 'merchant'">
            <view class="mcard">
                <view class="mrow"><text class="mico">🏪</text><text class="mval">{{ shopName }}</text></view>
                <view class="mrow"><text class="mico">🛵</text><text class="mlab">{{ $t('menu.deliveryService') }}</text><text class="mval">{{ routeDetailText }}</text></view>
                <view class="mrow"><text class="mico">🕐</text><text class="mlab">{{ $t('menu.businessHours') }}</text><text class="mval">{{ storeInfo?.businessHours || '10:00–22:00' }}</text></view>
                <view class="mrow"><text class="mico">📍</text><text class="mlab">{{ $t('menu.deliveryArea') }}</text><text class="mval">{{ $t('menu.deliveryAreaVal') }}</text></view>
                <view class="mrow" v-if="storeInfo?.storeAddress"><text class="mico">🏠</text><text class="mlab">{{ $t('menu.storeAddress') }}</text><text class="mval">{{ storeInfo.storeAddress }}</text></view>
                <view class="mrow" v-if="storeInfo?.storePhone"><text class="mico">📞</text><text class="mlab" @tap="callStore">{{ $t('menu.storePhone') }}</text><text class="mval" @tap="callStore">{{ storeInfo.storePhone }}</text></view>
                <view class="mrow" v-if="storeInfo?.foodLicenseNo"><text class="mico">🛡</text><text class="mlab">{{ $t('menu.foodLicenseNo') }}</text><text class="mval">{{ storeInfo.foodLicenseNo }}</text></view>
                <view class="mrow" v-if="foodGradeText"><text class="mico">⭐</text><text class="mlab">{{ $t('menu.foodSafetyGrade') }}</text><text class="mval">{{ foodGradeText }}</text></view>
                <view class="mrow" v-if="storeInfo?.kitchenLiveUrl"><text class="mico">📹</text><text class="mlab" @tap="openKitchenLive">{{ $t('menu.kitchenLive') }}</text><text class="mval" @tap="openKitchenLive">{{ $t('menu.noticeMore') }} ›</text></view>
            </view>
            <view class="mcard" v-if="promoText || storeInfo?.storeNotice">
                <view class="mrow" v-if="storeInfo?.storeNotice"><text class="mico">📣</text><text class="mlab">{{ $t('menu.storeNotice') }}</text><text class="mval">{{ storeInfo.storeNotice }}</text></view>
                <view class="mrow" v-if="promoText"><text class="mico">📢</text><text class="mlab">{{ $t('menu.storePromo') }}</text><text class="mval">{{ promoText }}</text></view>
            </view>
            <view class="mcard">
                <view class="msrv">
                    <text>{{ $t('menu.service') }}</text>
                    <text class="tag">{{ $t('menu.serviceDelivery') }}</text>
                    <text class="tag">{{ $t('menu.serviceRelay') }}</text>
                </view>
            </view>
        </scroll-view>

        <!-- 凑单推荐：购物车未达起送价/满减门槛时，推荐店内低价商品一键加购 -->
        <view class="cross-sell" v-if="crossSellProducts.length">
            <view class="cross-sell__head">
                <text class="cross-sell__title">{{ $t('menu.crossSellTitle') }}</text>
                <text class="cross-sell__gap">{{ crossSellHint }}</text>
            </view>
            <scroll-view scroll-x class="cross-sell__row">
                <view v-for="it in crossSellProducts" :key="'cs-' + it.p.id" class="cs-item" @tap.stop="crossSellAdd(it)">
                    <VImage :src="it.p.featuredAsset?.preview" width="132rpx" height="132rpx" class="cs-img" />
                    <text class="cs-name">{{ it.p.name }}</text>
                    <view class="cs-foot">
                        <PriceTag :price="it.price" />
                        <text class="cs-add">+</text>
                    </view>
                </view>
            </scroll-view>
        </view>
        <!-- 购物车悬浮胶囊 -->
        <view class="cart-bar" @tap="goCheckout">
            <view class="cart-btn">
                🛒
                <view class="cart-count" v-if="cartCount">{{ cartCount }}</view>
            </view>
            <view class="cart-total">
                <text class="empty-hint" v-if="!cartCount">{{ $t('menu.cartEmpty') }}</text>
                <block v-else>
                    <text class="sum">{{ $t('menu.total').replace('{v}', cart.formatPrice(cartTotal)) }}</text>
                    <text v-if="cartPromoText" class="cart-promo">{{ cartPromoText }}</text>
                </block>
            </view>
            <view class="checkout-btn" :class="{ disabled: !cartCount || belowMinOrder || storeClosed }">
                {{ storeClosed ? $t('menu.closedBtn') : belowMinOrder ? $t('menu.minOrderGap').replace('{d}', minGapYuan) : $t('menu.checkout') }}
            </view>
        </view>
        <SkuSheet v-model:visible="skuOpen" :product="skuProduct" :preferred-variant-id="skuPreferred" @action="onSkuAction" @share="shareProduct" />

        <!-- 附近有货弹层：跨仓/门店库存（按距离升序，仅可售 > 0） -->
        <view v-if="nearbyOpen" class="nearby-mask" @tap="closeNearby">
            <view class="nearby-sheet" @tap.stop>
                <view class="nearby-head">
                    <view class="nearby-head__col">
                        <text class="nearby-title">{{ $t('menu.nearbyTitle') }}</text>
                        <text class="nearby-sub">{{ nearbyProduct?.name }}</text>
                    </view>
                    <text class="nearby-close" @tap="closeNearby">✕</text>
                </view>
                <text v-if="!nearbyLocated" class="nearby-noloc">{{ $t('menu.nearbyNoLocation') }}</text>
                <scroll-view scroll-y class="nearby-body">
                    <view v-if="nearbyLoading" class="nearby-loading">{{ $t('menu.nearbyLoading') }}</view>
                    <EmptyState v-else-if="!nearbyList.length" :text="$t('menu.nearbyEmpty')" />
                    <template v-else>
                        <view v-for="it in nearbyList" :key="it.location.id" class="nearby-item">
                            <view class="nearby-item__top">
                                <text class="nearby-item__name">{{ it.location.name }}</text>
                                <text class="nearby-item__dist">{{ distanceText(it.distanceKm) }}</text>
                            </view>
                            <text v-if="it.location.description" class="nearby-item__desc">{{ it.location.description }}</text>
                            <view class="nearby-item__meta">
                                <text class="nearby-item__stock">{{ $t('menu.nearbyAvailable').replace('{n}', String(it.available)) }}</text>
                                <text v-if="it.location.serviceCities?.length" class="nearby-item__city">{{ it.location.serviceCities.join(' / ') }}</text>
                            </view>
                        </view>
                    </template>
                </scroll-view>
                <button class="nearby-refresh" :disabled="nearbyLoading" @tap="reloadNearby">{{ $t('menu.nearbyRefresh') }}</button>
            </view>
        </view>

        <!-- 店铺公告弹层 -->
        <view v-if="noticeOpen" class="notice-mask" @tap="noticeOpen = false">
            <view class="notice-sheet" @tap.stop>
                <view class="notice-sheet__head">
                    <text class="notice-sheet__ico">📣</text>
                    <text class="notice-sheet__title">{{ $t('menu.storeNoticeTitle') }}</text>
                </view>
                <scroll-view scroll-y class="notice-sheet__body">
                    <text class="notice-sheet__text">{{ storeNotice }}</text>
                </scroll-view>
                <button class="notice-sheet__btn" @tap="noticeOpen = false">{{ $t('menu.noticeOk') }}</button>
            </view>
        </view>

        <!-- 食安公示弹层：证照信息 + 明厨亮灶 -->
        <view v-if="foodSafetyOpen" class="notice-mask" @tap="foodSafetyOpen = false">
            <view class="notice-sheet fs-sheet" @tap.stop>
                <view class="notice-sheet__head">
                    <text class="notice-sheet__ico">🛡</text>
                    <text class="notice-sheet__title">{{ $t('menu.foodSafetyTitle') }}</text>
                </view>
                <scroll-view scroll-y class="notice-sheet__body">
                    <view class="fs-row" v-if="storeInfo?.foodSafetyGrade">
                        <text class="fs-lab">{{ $t('menu.foodSafetyGrade') }}</text>
                        <text class="fs-val fs-grade" :class="'g-' + foodGradeKey">{{ foodGradeText }}</text>
                    </view>
                    <view class="fs-row" v-if="storeInfo?.foodLicenseNo">
                        <text class="fs-lab">{{ $t('menu.foodLicenseNo') }}</text>
                        <text class="fs-val">{{ storeInfo.foodLicenseNo }}</text>
                    </view>
                    <view class="fs-row" v-if="storeInfo?.foodLicenseExpiry">
                        <text class="fs-lab">{{ $t('menu.foodLicenseExpiry') }}</text>
                        <text class="fs-val">{{ storeInfo.foodLicenseExpiry }}</text>
                    </view>
                    <view class="fs-actions">
                        <button v-if="storeInfo?.foodLicenseImage" class="fs-btn" @tap="previewFoodImage(storeInfo.foodLicenseImage)">{{ $t('menu.foodLicenseImage') }}</button>
                        <button v-if="storeInfo?.foodSafetyCommitmentImage" class="fs-btn" @tap="previewFoodImage(storeInfo.foodSafetyCommitmentImage)">{{ $t('menu.foodSafetyCommitmentImage') }}</button>
                        <button v-if="storeInfo?.kitchenLiveUrl" class="fs-btn fs-btn--live" @tap="openKitchenLive">{{ $t('menu.kitchenLive') }}</button>
                    </view>
                    <text v-if="storeInfo?.kitchenLiveEnabled && storeInfo?.kitchenLiveUrl" class="fs-tip">{{ $t('menu.kitchenLiveTip') }}</text>
                    <text class="fs-tip">{{ $t('menu.foodSafetyTip') }}</text>
                </scroll-view>
                <button class="notice-sheet__btn" @tap="foodSafetyOpen = false">{{ $t('menu.noticeOk') }}</button>
            </view>
        </view>

        <!-- 智能取餐柜 / 无人配送（P2-4） -->
        <view v-if="lockerOpen" class="notice-mask" @tap="lockerOpen = false">
            <view class="notice-sheet lk-sheet" @tap.stop>
                <view class="notice-sheet__head">
                    <text class="notice-sheet__ico">🔒</text>
                    <text class="notice-sheet__title">{{ $t('locker.title') }}</text>
                </view>
                <scroll-view scroll-y class="notice-sheet__body">
                    <view v-if="lockerLoading" class="lk-tip">{{ $t('locker.loading') }}</view>
                    <view v-else-if="!lockers.length" class="lk-tip">{{ $t('locker.empty') }}</view>
                    <view v-for="s in lockers" :key="'lk-' + s.id" class="lk-item">
                        <view class="lk-item__head">
                            <text class="lk-item__name">{{ s.name }}</text>
                            <text class="lk-item__cells">{{ $t('locker.cells').replace('{a}', String(s.availableCells)).replace('{t}', String(s.totalCells)) }}</text>
                        </view>
                        <text class="lk-item__loc">{{ s.location }}</text>
                        <view class="lk-item__meta">
                            <text class="lk-item__tag">{{ s.providerName }}</text>
                            <text v-if="s.openHours" class="lk-item__hours">{{ s.openHours }}</text>
                        </view>
                        <text v-if="s.pickupGuide" class="lk-item__guide">{{ s.pickupGuide }}</text>
                    </view>
                    <view v-if="unmanned && unmanned.enabled" class="lk-unmanned">
                        <text class="lk-unmanned__ico">🚗</text>
                        <text class="lk-unmanned__txt">{{ $t('locker.unmannedOn').replace('{p}', unmanned.providerName) }}</text>
                    </view>
                    <text class="fs-tip">{{ $t('locker.tip') }}</text>
                </scroll-view>
                <button class="notice-sheet__btn" @tap="lockerOpen = false">{{ $t('menu.noticeOk') }}</button>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { useTenantStore } from '../../stores/tenant';
import { useCartStore } from '../../stores/cart';
import { useAuthStore } from '../../stores/auth';
import { useFavoritesStore } from '../../stores/favorites';
import { useLocaleStore } from '../../stores/locale';
import { fetchProductList, fetchStoreList, fetchDailyStock } from '../../api/queries/waimai';
import { getProductCoupons } from '../../api/queries/coupon';
import { getChannelReviews, getChannelReviewStats } from '../../api/queries/review';
import { plainDescription, routeText, routeDetail } from '../../utils/store-display';
import { matchesProduct, readSearchHistory, pushSearchHistory, clearSearchHistory as clearHistoryStorage } from '../../utils/search';
import { nextPromoHint, promoTiers, yuan } from '../../utils/promo';
import { topDishes, hotVisible, hotRankOf, type HotDish } from '../../utils/hot-sale';
import { naAgeDays, NEW_WINDOW_DAYS } from '../../utils/new-arrivals';
import { saAlternatives, saReason, saAvailableVariants, type SaItem } from '../../utils/soldout-alternative';
import { getStoreStatus } from '../../utils/store-status';
import { etaRange, etaClockText } from '../../utils/delivery-eta';
import { theme, initTheme } from '../../utils/theme';
import { sharePage } from '../../utils/share';
import { addItemToOrder } from '../../api/mutations/cart';
import { claimProductCoupon } from '../../api/mutations/coupon';
import { getActiveOrder, getOrdersForChannel } from '../../api/queries/order';
import { fetchNearbyStock, isDistanceKnown } from '../../api/queries/nearby-stock';
import { fetchActiveAds, type ShopAd } from '../../api/queries/ads';
import { fetchLockerInfo, type LockerStation, type UnmannedChannel } from '../../api/queries/locker';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import EmptyState from '../../components/EmptyState.vue';
import SkuSheet from '../../components/SkuSheet.vue';
import { recordFootprint } from '../../utils/footprint';
import { rememberVariant, resolvePreferredVariant } from '../../utils/sku-memory';
import { readTasteProfile, tasteHits, tasteLabels, hasTaste } from '../../utils/taste-profile';
import { decodeDish, encodeDish, dishQuery } from '../../utils/share-dish';

const tenant = useTenantStore();
const cart = useCartStore();
const authStore = useAuthStore();
const favorites = useFavoritesStore();
const locale = useLocaleStore();
const shopToken = ref('');
const shopRoutes = ref('');
const shopName = ref(locale.t('menu.defaultShop'));
const routesText = ref(locale.t('menu.defaultDelivery'));
const promoText = ref('');
const storeInfo = ref<any>(null);
// 店铺页顶部广告（P2-3）：切渠道后按本店 token 拉取在投广告
const shopAds = ref<ShopAd[]>([]);
/** 店铺公告（storeInfo 的 storeNotice，空则整块不显示） */
const storeNotice = computed(() => String(storeInfo.value?.storeNotice || '').trim());
const noticeOpen = ref(false);
// 食安公示：证照 / 等级 / 明厨亮灶（店铺级配置，随 waimaiStoreList 下发）
const foodSafetyOpen = ref(false);
// 智能取餐柜（P2-4）：渠道级数据，进店时拉一次，点入口开弹层
const lockerOpen = ref(false);
const lockerLoading = ref(false);
const lockers = ref<LockerStation[]>([]);
const unmanned = ref<UnmannedChannel | null>(null);
const hasLocker = computed(() => lockers.value.length > 0 || !!unmanned.value?.enabled);
const lockerBrief = computed(() =>
    lockers.value.length
        ? locale.t('locker.brief').replace('{n}', String(lockers.value.length))
        : locale.t('locker.briefUnmanned')
);
const foodGradeKey = computed(() => {
    const g = String(storeInfo.value?.foodSafetyGrade || '').trim().toUpperCase();
    return ['A', 'B', 'C'].includes(g) ? g : 'none';
});
const foodGradeText = computed(() => (storeInfo.value?.foodSafetyGrade ? locale.t(`menu.foodGrade${foodGradeKey.value}`) : ''));
const hasFoodSafety = computed(() =>
    !!(storeInfo.value?.foodLicenseNo || storeInfo.value?.foodSafetyGrade || storeInfo.value?.foodLicenseImage || storeInfo.value?.foodSafetyCommitmentImage || storeInfo.value?.kitchenLiveUrl)
);
const foodSafetyBrief = computed(() =>
    foodGradeText.value ? locale.t('menu.foodSafetyBriefGrade').replace('{g}', foodGradeText.value) : locale.t('menu.foodSafetyBrief')
);
// 附近有货：商品卡入口 → 弹层按定位查跨仓库存
const nearbyOpen = ref(false);
const nearbyLoading = ref(false);
const nearbyProduct = ref<any>(null);
const nearbyList = ref<any[]>([]);
const nearbyLocated = ref(false);
const nearbyCoords = ref<{ lat: number; lng: number } | null>(null);
const tab = ref<'goods' | 'reviews' | 'merchant'>('goods');
const cats = ref([{ id: 'all', name: '全部' }]);
const activeCat = ref('all');
const products = ref<any[]>([]);
const skuOpen = ref(false);
const skuProduct = ref<any>(null);
const skuPreferred = ref('');
// 首页搜索/收藏商品带 q 进店：仅筛商品（不改分类），✕ 可清除
const productQuery = ref('');
// 商品排序：综合（接口原序）/ 销量 / 价格（再次点击切升/降）；售罄始终置底
type SortKey = 'default' | 'sales' | 'price';
const sortKey = ref<SortKey>('default');
const priceAsc = ref(true);
const soldOutTipShown = ref(false);
// 好友分享进店：解析出的菜品（variantId / 名称），命中后高亮并定位
const sharedDish = ref<{ variantId: string; name: string } | null>(null);
const scrollInto = ref('');
// 我的口味偏好：只读，用于菜品忌口/过敏原提示（弹层、菜单行共用）
const tasteProfile = ref(readTasteProfile());
const sharedDishName = computed(() => sharedDish.value?.name || '');
/** 链接里的菜在本店已下架/售罄 */
const sharedDishMissing = computed(() => {
    const id = sharedDish.value?.variantId;
    if (!id) return false;
    const v = findVariant(id);
    return !v || !variantAvailable(v);
});

const cartCount = computed(() => cart.totalQuantity);
const cartTotal = computed(() => cart.totalPrice);
// 收藏（店铺 = 渠道）：storeInfo 由 fetchStoreList 按 token 匹配后才有 channelId
const favChannelId = computed(() => storeInfo.value?.channelId ?? null);
const isFav = computed(() => favorites.isFavorite(favChannelId.value));

/** 打开公告弹层（点公告条） */
function openNotice() {
    if (storeNotice.value) noticeOpen.value = true;
}

/** 店铺页顶部广告：失败静默（不占位、不阻塞商品加载） */
async function loadShopAds() {
    try { shopAds.value = await fetchActiveAds('shopTop'); } catch { shopAds.value = []; }
}

/** 打开食安公示弹层 */
function openFoodSafety() {
    foodSafetyOpen.value = true;
}

/** 取餐柜/无人配送：失败静默（不占位、不阻塞商品加载） */
async function loadLockerInfo() {
    lockerLoading.value = true;
    try {
        const info = await fetchLockerInfo();
        lockers.value = info.stations;
        unmanned.value = info.unmanned;
    } catch {
        lockers.value = [];
        unmanned.value = null;
    } finally {
        lockerLoading.value = false;
    }
}

/** 打开取餐柜弹层：首次打开时补拉（进店时已拉过一次，命中缓存不重复请求） */
function openLocker() {
    lockerOpen.value = true;
    if (!lockers.value.length && !lockerLoading.value && !unmanned.value) void loadLockerInfo();
}

/** 店铺页顶部广告跳转：http(s) 走站内 webview，站内路径直接跳转（失败回退 switchTab） */
function openAdLink(a: ShopAd) {
    const raw = String(a?.linkUrl || '').trim();
    if (!raw) return;
    if (/^https?:\/\//.test(raw)) {
        uni.navigateTo({ url: '/pages/webview/index?url=' + encodeURIComponent(raw) });
        return;
    }
    let path = raw.replace(/^#/, '');
    if (!path.startsWith('/')) path = '/' + path;
    uni.navigateTo({ url: path, fail: () => uni.switchTab({ url: path }) });
}

/** 证照/承诺书大图预览 */
function previewFoodImage(url: string) {
    const u = String(url || '');
    if (!u) return;
    uni.previewImage({ urls: [u], current: u });
}

/** 明厨亮灶：H5 新窗口打开，其余端复制直播链接 */
function openKitchenLive() {
    const url = String(storeInfo.value?.kitchenLiveUrl || '');
    if (!url) return;
    // #ifdef H5
    window.open(url, '_blank');
    return;
    // #endif
    // #ifndef H5
    uni.setClipboardData({
        data: url,
        success: () => uni.showToast({ title: locale.t('menu.kitchenLiveCopied'), icon: 'none' }),
    });
    // #endif
}

/** 首次进店每日自动弹一次公告：同店同一天只弹一次 */
function maybeAutoNotice() {
    if (!storeNotice.value) return;
    const d = new Date();
    const key = `store_notice_seen_${shopToken.value || storeInfo.value?.channelId || shopName.value}_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    try {
        if (uni.getStorageSync(key)) return;
        uni.setStorageSync(key, '1');
    } catch {
        /* 存储不可用时仍弹一次 */
    }
    noticeOpen.value = true;
}

// 起送价（后端配置单位为分）与满减凑单提示
const minOrderFen = computed(() => {
    const n = Number(storeInfo.value?.minOrderAmount);
    return storeInfo.value?.minOrderAmount == null || !Number.isFinite(n) || n <= 0 ? null : Math.round(n);
});
const belowMinOrder = computed(() => !!cartCount.value && minOrderFen.value != null && cartTotal.value < minOrderFen.value);
const minGapYuan = computed(() => (minOrderFen.value == null ? '' : yuan(minOrderFen.value - cartTotal.value)));

// —— 营业状态：以后端 openNow（营业时间内且未暂停）为准，缺失时按 businessHours 兜底；
//    打烊仍可浏览加购，仅拦截提交 ——
const storeStatus = computed(() => getStoreStatus(storeInfo.value?.businessHours));
/** 后端营业状态（null=接口未返回，前端按营业时间兜底） */
const backendOpen = computed<boolean | null>(
    () => (typeof storeInfo.value?.openNow === 'boolean' ? storeInfo.value.openNow : null),
);
/** 今日休业（§70 营业日历）：后端 closedToday 为准，当日禁止下单 */
const storeClosedToday = computed(() => !!storeInfo.value?.closedToday);
const storeClosureNote = computed(() => storeInfo.value?.closureNote || '');
/** 营业时间内但后端判打烊 = 商家手动暂停营业（今日休业走单独文案） */
const storePaused = computed(
    () => !storeClosedToday.value && backendOpen.value === false && storeStatus.value.state !== 'closed',
);
const storeClosed = computed(
    () => (backendOpen.value === null ? storeStatus.value.state === 'closed' : !backendOpen.value),
);
const storeStateText = computed(() => {
    if (storeClosedToday.value) {
        return locale.t('menu.closedTodayByCalendar')
            .replace('{note}', storeClosureNote.value ? `（${storeClosureNote.value}）` : '');
    }
    if (storePaused.value) return locale.t('menu.storePaused');
    const st = storeStatus.value;
    if (storeClosed.value || st.state === 'closed') {
        const key = st.nextOpenDayOffset === 1 ? 'menu.closedTomorrow' : 'menu.closedToday';
        return locale.t(key).replace('{t}', st.nextOpenHM);
    }
    if (st.state === 'closing') return locale.t('menu.closingSoon').replace('{n}', String(st.closesInMin ?? 0));
    return '';
});
// —— 预计送达（第 38 轮）：营业中按「当前时刻 + 配送时长」给出送达区间，30 秒刷新 ——
const nowTick = ref(Date.now());
let etaTimer: ReturnType<typeof setInterval> | null = null;
/** 上一次营业状态类别（open/closing 视为「营业中」，closed 单独）：跨边界时回读后端 openNow */
let lastClosedState: boolean | null = null;
/** 上一次校园日（UTC+8）：跨天时回读，休业日历在 0 点切换 */
let lastDayKey: string | null = null;
/** 营业时间自动开关门：门店停留期间跨过开门/打烊边界时回读店铺状态，避免仍显示旧状态 */
async function refreshStoreInfo(): Promise<void> {
    try {
        const list: any[] = await fetchStoreList();
        const hit = list.find((s: any) => s.channelToken === shopToken.value) ?? null;
        if (hit) storeInfo.value = hit;
    } catch { /* 静默重试下一轮 */ }
}
onLoad(() => {
    etaTimer = setInterval(() => {
        nowTick.value = Date.now();
        const closed = getStoreStatus(storeInfo.value?.businessHours).state === 'closed';
        const dayKey = new Date(nowTick.value + 8 * 3600_000).toISOString().slice(0, 10);
        if ((lastClosedState !== null && closed !== lastClosedState)
            || (lastDayKey !== null && dayKey !== lastDayKey)) void refreshStoreInfo();
        lastClosedState = closed;
        lastDayKey = dayKey;
    }, 30000);
});
onUnload(() => {
    if (etaTimer) {
        clearInterval(etaTimer);
        etaTimer = null;
    }
});
const etaInfo = computed(() => etaRange({
    now: new Date(nowTick.value),
    deliveryMinutes: storeInfo.value?.deliveryMinutes,
    businessHours: storeInfo.value?.businessHours,
}));
const etaBarText = computed(() => {
    if (storeClosed.value) return '';
    const r = etaInfo.value;
    const key = r.nextDay ? 'menu.etaBarNextDay' : 'menu.etaBar';
    return locale.t(key).replace('{t}', etaClockText(r)).replace('{n}', String(r.minutes));
});

// 免配送费门槛（后端配置单位为分）
const freeShippingFen = computed(() => {
    const n = Number(storeInfo.value?.freeShippingThreshold);
    return storeInfo.value?.freeShippingThreshold == null || !Number.isFinite(n) || n <= 0 ? null : Math.round(n);
});
const freeShippingGapFen = computed(() => {
    if (!cartCount.value || freeShippingFen.value == null) return 0;
    return Math.max(0, freeShippingFen.value - cartTotal.value);
});
// 阶梯满减面板：按当前购物车金额标出已达成与下一档差额
const promoTierList = computed(() => promoTiers(storeInfo.value?.promoText || promoText.value, cartTotal.value));
const cartPromoText = computed(() => {
    if (!cartCount.value) return '';
    const hint = nextPromoHint(storeInfo.value?.promoText || promoText.value, cartTotal.value);
    if (!hint) return '';
    return hint.reached
        ? locale.t('menu.promoReached').replace('{t}', yuan(hint.thresholdFen)).replace('{y}', yuan(hint.discountFen))
        : locale.t('menu.promoGap').replace('{d}', yuan(hint.gapFen)).replace('{y}', yuan(hint.discountFen));
});

// 凑单推荐：起送价差额 > 满减差额 > 免配送费差额；无门槛差额不展示
const crossSellGapFen = computed(() => {
    if (!cartCount.value) return 0;
    if (belowMinOrder.value) return (minOrderFen.value ?? 0) - cartTotal.value;
    const hint = nextPromoHint(storeInfo.value?.promoText || promoText.value, cartTotal.value);
    if (hint && !hint.reached) return hint.gapFen;
    return freeShippingGapFen.value;
});
const crossSellHint = computed(() => {
    if (crossSellGapFen.value <= 0) return '';
    if (belowMinOrder.value) {
        return locale.t('menu.minOrderGap').replace('{d}', yuan(crossSellGapFen.value));
    }
    const hint = nextPromoHint(storeInfo.value?.promoText || promoText.value, cartTotal.value);
    if (hint && !hint.reached) {
        return locale.t('menu.promoGap').replace('{d}', yuan(hint.gapFen)).replace('{y}', yuan(hint.discountFen));
    }
    return locale.t('menu.freeShipGap').replace('{d}', yuan(crossSellGapFen.value));
});
// —— 店内搜索 / 筛选（纯前端）——
const keyword = ref('');
const searchHistory = ref<string[]>(readSearchHistory());
/** 热门搜索：取店内销量前 6 的商品名，名额不足用分类名补齐 */
const hotWords = computed(() => {
    const words: string[] = [];
    const push = (w?: string) => {
        const v = String(w ?? '').trim();
        if (v && !words.includes(v)) words.push(v);
    };
    [...products.value]
        .sort((a: any, b: any) => goodSales(b) - goodSales(a))
        .forEach((p: any) => push(p.name));
    cats.value.filter((c: any) => c.id !== 'all').forEach((c: any) => push(c.name));
    return words.slice(0, 6);
});
const onlyCoupon = ref(false);
const hideSoldOut = ref(false);

function commitKeyword() {
    if (!keyword.value.trim()) return;
    searchHistory.value = pushSearchHistory(keyword.value);
}
function applyKeyword(w: string) {
    keyword.value = w;
    searchHistory.value = pushSearchHistory(w);
}
function clearKeyword() {
    keyword.value = '';
}
function clearSearchHistory() {
    clearHistoryStorage();
    searchHistory.value = [];
}

const crossSellProducts = computed(() => {
    if (crossSellGapFen.value <= 0) return [];
    const inCart = new Set(cart.lines.map((l: any) => String(l.productVariant?.id ?? '')));
    return products.value
        .map((p: any) => {
            const vs = (p.variants ?? []).filter((v: any) => variantAvailable(v) && Number(v.priceWithTax) > 0);
            if (!vs.length) return null;
            const v = vs.reduce((a: any, b: any) => (Number(b.priceWithTax) < Number(a.priceWithTax) ? b : a));
            return { p, v, price: Number(v.priceWithTax) || 0 };
        })
        .filter((it: any) => it && !inCart.has(String(it.v.id)))
        .sort((a: any, b: any) => a.price - b.price)
        .slice(0, 8);
});
async function crossSellAdd(it: { v: any }) {
    const ok = await doAddItem(it.v.id, 1);
    if (ok) uni.showToast({ title: locale.t('menu.crossSellAdded'), icon: 'none' });
}

// —— 店内热销榜：月售 Top6 横滑 + 菜品行 TOP 角标（纯前端排序，无额外请求）——
const hotList = computed<HotDish[]>(() => topDishes(products.value, 6));
const hotShow = computed(() => hotVisible(hotList.value));
/** 行内角标：榜内前三返回 1..3，否则 0 */
function hotRank(g: any): number {
    return hotRankOf(String(g?.id ?? ''), hotList.value);
}
/** 新品尝鲜（第 34 轮）：上架 ≤30 天标「新」角标，与新品聚合页同口径 */
function isNewGood(g: any): boolean {
    const age = naAgeDays(g?.createdAt, Date.now());
    return age != null && age <= NEW_WINDOW_DAYS;
}
/** 横滑卡 ⊕ 直接加购：榜单条目按 id 回查商品（榜单已滤售罄，正常必有货） */
async function hotAdd(id: string) {
    const g = products.value.find((p: any) => String(p?.id) === id);
    if (g) await addToCart(g);
}
/** 点卡片/查看全部：切回商品 Tab、回到全部分类并定位到该菜（空位默认热销第一名） */
function hotJumpTo(d?: HotDish) {
    const target = d ?? hotList.value[0];
    if (!target) return;
    switchTab('goods');
    activeCat.value = 'all';
    scrollInto.value = '';
    nextTick(() => { scrollInto.value = 'g-' + target.id; });
}

/** 店铺分享：微信内走 JS-SDK 卡片，其它环境复制带店铺 token 的链接 */
async function shareShop() {
    const path = `/pages/shop/menu?token=${encodeURIComponent(shopToken.value)}&name=${encodeURIComponent(shopName.value)}&routes=${encodeURIComponent(shopRoutes.value)}${favChannelId.value != null ? `&cid=${favChannelId.value}` : ''}`;
    const how = await sharePage({
        title: shopName.value,
        desc: locale.t('menu.shareShopDesc'),
        path,
        image: storeInfo.value?.logo || '',
    });
    if (how === 'copy') uni.showToast({ title: locale.t('menu.shareCopied'), icon: 'none' });
}

/** 商品分享：商品详情弹层右上角 ↗ */
async function shareProduct(p: any) {
    if (!p) return;
    const how = await sharePage({
        title: p.name,
        desc: locale.t('menu.shareProductDesc').replace('{s}', shopName.value),
        path: `/pages/shop/menu?token=${encodeURIComponent(shopToken.value)}&name=${encodeURIComponent(shopName.value)}&routes=${encodeURIComponent(shopRoutes.value)}${favChannelId.value != null ? `&cid=${favChannelId.value}` : ''}`,
        image: p.featuredAsset?.preview || '',
    });
    if (how === 'copy') uni.showToast({ title: locale.t('menu.shareCopied'), icon: 'none' });
}

/**
 * 单品分享：把本店 + 这道菜（规格）编进链接，好友打开直达本店菜单页，
 * 自动高亮定位该菜并提供一键加购，省去在菜单里翻找。
 */
async function shareDish(g: any) {
    const variant = resolvePreferredVariant(g?.id, g?.variants) || g?.variants?.[0];
    if (!variant) { toastSoldOut(); return; }
    const enc = encodeDish({ token: shopToken.value, variantId: String(variant.id), name: String(g?.name || '') });
    const base = `/pages/shop/menu?token=${encodeURIComponent(shopToken.value)}&name=${encodeURIComponent(shopName.value)}&routes=${encodeURIComponent(shopRoutes.value)}${favChannelId.value != null ? `&cid=${favChannelId.value}` : ''}`;
    const how = await sharePage({
        title: locale.t('menu.shareDishTitle').replace('{n}', String(g?.name || '')),
        desc: locale.t('menu.shareDishDesc'),
        path: `${base}${dishQuery(enc)}`,
        image: g?.featuredAsset?.preview || '',
    });
    if (how === 'copy') uni.showToast({ title: locale.t('menu.shareCopied'), icon: 'none' });
}

/** 本行商品是否为好友分享的那道菜（按 variantId 归属商品判定，多规格一并高亮） */
function isSharedGood(g: any): boolean {
    const id = sharedDish.value?.variantId;
    if (!id) return false;
    return (g?.variants ?? []).some((v: any) => String(v.id) === String(id));
}

/** 选项 key → 中文名（用于菜品命中提示拼接） */
function tasteNames(keys: string[], kind: 'avoid' | 'allergen'): string {
    const L = tasteLabels((k: string) => locale.t(k));
    return keys.map((k) => (kind === 'avoid' ? L.avoid(k as any) : L.allergen(k as any))).join('、');
}

/** 菜名/描述命中忌口或过敏原 → 提示行（过敏原优先，红字更醒目） */
function tasteTag(g: any): { text: string; warn: boolean } | null {
    if (!hasTaste(tasteProfile.value)) return null;
    const text = `${g?.name || ''} ${plainDescription(g?.description)}`;
    const hits = tasteHits(text, tasteProfile.value);
    if (!hits.length) return null;
    const allergen = hits.filter((h) => h.kind === 'allergen').map((h) => h.key);
    if (allergen.length) {
        return { text: locale.t('menu.tasteAllergen').replace('{n}', tasteNames(allergen, 'allergen')), warn: true };
    }
    const avoid = hits.filter((h) => h.kind === 'avoid').map((h) => h.key);
    return { text: locale.t('menu.tasteAvoid').replace('{n}', tasteNames(avoid, 'avoid')), warn: false };
}

/** 好友分享进店：定位到该菜所属分类并滚动高亮；已下架则只提示 */
function applySharedDish() {
    const d = sharedDish.value;
    if (!d) return;
    const hit = products.value.find((p: any) => (p.variants ?? []).some((v: any) => String(v.id) === String(d.variantId)));
    if (!hit) return;
    const cat = hit.collections?.find((c: any) => c.parent?.name === '__root_collection__')?.name
        || hit.collections?.[0]?.name || '全部';
    if (cats.value.some((c) => c.id === cat)) activeCat.value = cat;
    nextTick(() => { scrollInto.value = 'g-' + hit.id; });
    if (!d.name) sharedDish.value = { ...d, name: hit.name || '' };
}

/** 分享条「加入购物车」：走常规加购（已下架给出提示） */
async function addSharedDish() {
    const d = sharedDish.value;
    if (!d || sharedDishMissing.value) return;
    const v = findVariant(d.variantId);
    if (!v || !variantAvailable(v)) { toastSoldOut(); return; }
    const ok = await doAddItem(d.variantId, 1);
    if (ok) {
        const owner = products.value.find((p: any) => (p.variants ?? []).some((x: any) => String(x.id) === String(d.variantId)));
        rememberVariant(owner?.id, d.variantId);
        uni.showToast({ title: locale.t('menu.added'), icon: 'none' });
    }
}

/** 商品收藏：任一 variant 已收藏即显示实心（多规格商品用首个 variant 作为代表） */
function isGoodFav(g: any): boolean {
    return (g.variants ?? []).some((v: any) => favorites.isVariantFavorite(v.id));
}

async function toggleGoodFav(g: any) {
    const variants = g.variants ?? [];
    if (!variants.length) return;
    const recorded = variants.filter((v: any) => favorites.isVariantFavorite(v.id));
    const willAdd = !recorded.length;
    const channelId = favChannelId.value != null ? String(favChannelId.value) : undefined;
    try {
        if (willAdd) {
            const target = variants[0];
            await favorites.toggleVariant({
                variantId: String(target.id),
                channelId,
                channelToken: shopToken.value,
                productId: String(g.id),
                name: g.name,
                image: g.featuredAsset?.preview,
                price: target?.priceWithTax,
                storeName: shopName.value,
            });
        } else {
            for (const v of recorded) {
                await favorites.toggleVariant({ variantId: String(v.id), channelId });
            }
        }
        uni.showToast({ title: willAdd ? locale.t('menu.favProductAddOk') : locale.t('menu.favProductRemoveOk'), icon: 'none' });
    } catch {
        uni.showToast({ title: locale.t('menu.favFail'), icon: 'none' });
    }
}

async function toggleFav() {
    if (favChannelId.value == null) return;
    try {
        const on = await favorites.toggle(favChannelId.value);
        uni.showToast({ title: on ? locale.t('menu.favAddOk') : locale.t('menu.favRemoveOk'), icon: 'none' });
    } catch {
        uni.showToast({ title: locale.t('menu.favFail'), icon: 'none' });
    }
}
const routeDetailText = computed(() =>
    routeDetail(shopRoutes.value.split(',').filter(Boolean)).join('、') || locale.t('menu.noDelivery')
);

// ── 评论 tab（A 版式：摘要卡 + chips + 列表，首切 tab 才拉取） ──
type ReviewFilterKey = 'all' | 'images' | 'good' | 'bad';
const REVIEW_PAGE_SIZE = 10;
const reviewFilters: { key: ReviewFilterKey; label: string }[] = [
    { key: 'all', label: 'menu.filterAll' },
    { key: 'images', label: 'menu.filterImages' },
    { key: 'good', label: 'menu.filterGood' },
    { key: 'bad', label: 'menu.filterBad' },
];
const reviewFilter = ref<ReviewFilterKey>('all');
const reviewList = ref<any[]>([]);
const reviewTotal = ref(0);
const reviewStats = ref<any>(null);
const reviewLoading = ref(false);
const reviewLoadingMore = ref(false);
const reviewLoaded = ref(false);
const reviewHasMore = computed(() => reviewList.value.length < reviewTotal.value);

function switchTab(t: 'goods' | 'reviews' | 'merchant') {
    tab.value = t;
    if (t === 'reviews' && !reviewLoaded.value) {
        reviewLoaded.value = true;
        loadReviewStats();
        loadReviews(true);
    }
}

function reviewOptions(key: ReviewFilterKey) {
    if (key === 'images') return { hasImages: true };
    if (key === 'good') return { ratingMin: 4 };
    if (key === 'bad') return { ratingMax: 3 };
    return {};
}

async function loadReviews(reset: boolean) {
    if (reset) reviewLoading.value = true;
    else reviewLoadingMore.value = true;
    try {
        const options = {
            skip: reset ? 0 : reviewList.value.length,
            take: REVIEW_PAGE_SIZE,
            ...reviewOptions(reviewFilter.value),
        };
        const res: any = await getChannelReviews(options);
        const items = res?.channelReviews?.items ?? [];
        reviewTotal.value = res?.channelReviews?.totalItems ?? 0;
        reviewList.value = reset ? items : [...reviewList.value, ...items];
    } catch {
        if (reset) { reviewList.value = []; reviewTotal.value = 0; }
    } finally {
        reviewLoading.value = false;
        reviewLoadingMore.value = false;
    }
}

async function loadReviewStats() {
    try {
        const res: any = await getChannelReviewStats();
        reviewStats.value = res?.channelReviewStats ?? null;
    } catch { reviewStats.value = null; }
}

function switchReviewFilter(key: ReviewFilterKey) {
    if (reviewFilter.value === key) return;
    reviewFilter.value = key;
    loadReviews(true);
}

function loadMoreReviews() {
    if (!reviewHasMore.value || reviewLoadingMore.value || reviewLoading.value) return;
    loadReviews(false);
}

function displayName(r: any, nameOnly = false) {
    if (r.isAnonymous) return nameOnly ? locale.t('menu.anon') : locale.t('menu.anonShort');
    return r.customerName?.slice(0, 1) || locale.t('menu.anonAvatar');
}

function formatDate(d: string) {
    return d ? new Date(d).toLocaleDateString('zh-CN') : '';
}

/** 评价图片大图预览（第 39 轮）：主评与追评共用，index 决定初始图 */
function previewReviewImages(images: string[], index: number) {
    const urls = (images || []).filter(Boolean);
    if (!urls.length) return;
    const current = urls[index] ?? urls[0];
    uni.previewImage({ urls, current });
}

function distWidth(count: number) {
    const dist: number[] = (reviewStats.value?.ratingDistribution ?? []).map((d: any) => d.count);
    const max = Math.max(...dist, 1);
    return `${Math.round((count / max) * 100)}%`;
}

function distPct(count: number) {
    const total = reviewStats.value?.totalCount ?? 0;
    return total ? `${Math.round((count / total) * 100)}%` : '0%';
}

onLoad(async (q: any) => {
    initTheme();
    tasteProfile.value = readTasteProfile();
    shopToken.value = q?.token ?? '';
    shopRoutes.value = decodeURIComponent(q?.routes ?? '');
    shopName.value = decodeURIComponent(q?.name ?? '') || locale.t('menu.defaultShop');
    routesText.value = routeText(shopRoutes.value.split(',').filter(Boolean));
    promoText.value = decodeURIComponent(q?.promo ?? '');
    productQuery.value = decodeURIComponent(q?.q ?? '');
    // 好友分享的菜品：解码后待商品加载完成再定位高亮
    const dish = decodeDish(q?.d ?? '');
    sharedDish.value = dish ? { variantId: dish.variantId, name: dish.name } : null;
    const pendingAdd = q?.add ? String(q.add) : '';
    // 常买店铺：首页会带 cid 直接记；直接进店时等 storeInfo 匹配到 channelId 再记（下方 then）
    const cid = q?.cid ? String(q.cid) : '';
    if (cid) {
        favorites.touchRecent({ channelId: cid, channelToken: shopToken.value, name: shopName.value, routes: shopRoutes.value });
    }
    // 店铺配置（地址/电话/公告/时长）：waimaiStoreList 按渠道 token 找本店；无配置行 → null 走页面兜底
    fetchStoreList().then((list: any[]) => {
        const hit = list.find((s: any) => s.channelToken === shopToken.value) ?? null;
        storeInfo.value = hit;
        if (hit) {
            favorites.touchRecent({ channelId: hit.channelId, channelToken: shopToken.value, name: shopName.value, routes: shopRoutes.value });
            maybeAutoNotice();
        }
    }).catch(() => { storeInfo.value = null; });
    uni.setNavigationBarTitle({ title: shopName.value });
    // 关键：切到店铺渠道（activeOrder 随 session+渠道隔离 = 每店独立购物车）
    await tenant.switchTenant(shopToken.value);
    void loadShopAds();
    void loadLockerInfo();
    try {
        // 恢复本店已加购的 activeOrder（切渠道后 session 内该渠道购物车）
        const active: any = await getActiveOrder().catch(() => null);
        if (active?.activeOrder) cart.setOrder(active.activeOrder);
        products.value = await fetchProductList();
        menuReady = true;
        void loadDailyStock();
        cats.value = buildCats(products.value);
        loadProductCoupons(goodsOf(activeCat.value));
        void loadCombo();
        applySharedDish();
        // 首页「常买商品」点进来的 add 参数：加载完成后自动加购 1 件（仅消费一次）
        if (pendingAdd) {
            const ok = await doAddItem(pendingAdd, 1);
            uni.showToast({ title: ok ? locale.t('menu.added') : locale.t('menu.addFail'), icon: 'none' });
        }
    } catch (e: any) {
        // 切渠道失败（token 无效）→ 提示并返回首页
        uni.showToast({ title: locale.t('menu.shopNotFound'), icon: 'none' });
        setTimeout(() => uni.redirectTo({ url: '/pages/home/index' }), 800);
    }
});

// 返回站点默认渠道：orders/profile 等聚合页不受店铺 token 影响（各店购物车由 session+渠道隔离保留）
onUnload(() => { void tenant.backToDefault(); });
onUnmounted(() => { void tenant.backToDefault(); });

function buildCats(list: any[]) {
    const names: string[] = [];
    list.forEach(p => {
        const name = p.collections?.find((c: any) => c.parent?.name === '__root_collection__')?.name
            || p.collections?.[0]?.name || '全部';
        // 「全部」已作为内置首项，避免分类列表出现重复项
        if (name !== '全部' && !names.includes(name)) names.push(name);
    });
    return [{ id: 'all', name: '全部' }, ...names.map(n => ({ id: n, name: n }))];
}

function goodsOf(catId: string) {
    let list = catId === 'all' ? products.value : products.value.filter(p => p.collections?.some((c: any) => c.name === catId));
    if (productQuery.value) list = list.filter(p => matchesProduct(p, productQuery.value));
    if (keyword.value.trim()) list = list.filter(p => matchesProduct(p, keyword.value));
    if (onlyCoupon.value) list = list.filter(p => !!couponOf(p));
    if (hideSoldOut.value) list = list.filter(p => !goodSoldOut(p));
    return sortGoods(list);
}

/** 销量缺失按 0；价格取可售 variants 最低 priceWithTax（全售罄时退回首个 variant） */
function goodSales(g: any): number {
    return Number(g?.customFields?.waimaiMonthlySales) || 0;
}

function goodMinPrice(g: any): number {
    const prices = (g?.variants ?? [])
        .filter((v: any) => variantAvailable(v))
        .map((v: any) => Number(v?.priceWithTax) || 0);
    if (prices.length) return Math.min(...prices);
    return Number(g?.variants?.[0]?.priceWithTax) || 0;
}

/** 稳定排序（数组 sort 稳定）：售罄恒在组外末尾，组内依当前排序规则 */
function sortGoods(list: any[]): any[] {
    const arr = list.slice();
    const soldRank = (g: any) => (goodSoldOut(g) ? 1 : 0);
    if (sortKey.value === 'default') return arr.sort((a, b) => soldRank(a) - soldRank(b));
    arr.sort((a, b) => {
        const rank = soldRank(a) - soldRank(b);
        if (rank) return rank;
        if (sortKey.value === 'sales') return goodSales(b) - goodSales(a);
        const diff = goodMinPrice(a) - goodMinPrice(b);
        return priceAsc.value ? diff : -diff;
    });
    return arr;
}

function setSort(key: SortKey) {
    if (key === 'price') {
        if (sortKey.value === 'price') priceAsc.value = !priceAsc.value;
        else sortKey.value = 'price';
    } else {
        sortKey.value = key;
    }
    if (!soldOutTipShown.value && goodsOf(activeCat.value).some(g => goodSoldOut(g))) {
        soldOutTipShown.value = true;
        uni.showToast({ title: locale.t('menu.soldOutLast'), icon: 'none' });
    }
}

function clearProductQuery() {
    productQuery.value = '';
    loadProductCoupons(goodsOf(activeCat.value));
}

// —— 附近有货：定位（3s 超时）→ 跨仓库存查询 → 仅展示可售 > 0，按距离升序 ——
function getLocationFixed(ms = 3000): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
        let done = false;
        const finish = (v: { lat: number; lng: number } | null) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(v);
        };
        const timer = setTimeout(() => finish(null), ms);
        uni.getLocation({
            type: 'gcj02',
            success: (r: any) => finish({ lat: r.latitude, lng: r.longitude }),
            fail: () => finish(null),
        } as any);
    });
}

async function openNearby(g: any) {
    nearbyProduct.value = g;
    nearbyOpen.value = true;
    nearbyList.value = [];
    nearbyLoading.value = true;
    try {
        if (!nearbyCoords.value) nearbyCoords.value = await getLocationFixed();
        nearbyLocated.value = !!nearbyCoords.value;
        await loadNearby(g);
    } finally {
        nearbyLoading.value = false;
    }
}

async function loadNearby(g: any) {
    const firstVariant = g?.variants?.[0];
    const c = nearbyCoords.value;
    try {
        const list = await fetchNearbyStock({
            productId: String(g.id),
            variantId: firstVariant?.id ? String(firstVariant.id) : undefined,
            lat: c?.lat,
            lng: c?.lng,
        });
        nearbyList.value = list
            .map((it) => ({
                ...it,
                available: (it.variants ?? []).reduce((sum, v) => sum + (Number(v.stockAvailable) || 0), 0),
            }))
            .filter((it) => it.available > 0)
            .sort((a, b) => a.distanceKm - b.distanceKm);
    } catch (e) {
        nearbyList.value = [];
        uni.showToast({ title: locale.t('menu.nearbyFail'), icon: 'none' });
    }
}

async function reloadNearby() {
    const g = nearbyProduct.value;
    if (!g || nearbyLoading.value) return;
    nearbyLoading.value = true;
    try {
        if (!nearbyCoords.value) nearbyCoords.value = await getLocationFixed();
        nearbyLocated.value = !!nearbyCoords.value;
        await loadNearby(g);
    } finally {
        nearbyLoading.value = false;
    }
}

function closeNearby() {
    nearbyOpen.value = false;
}

function distanceText(km: number): string {
    return isDistanceKnown(km) ? `${Number(km).toFixed(1)} km` : locale.t('menu.nearbyUnknown');
}

// ===== 商品专属券 chip：按当前分类商品拉绑定，productId → 绑定（取首个启用项） =====
const productCouponMap = ref(new Map<string, any>());
const claimedProductIds = ref(new Set<string>());
const claimingProductId = ref('');

function couponOf(g: any): any | null {
    const b = productCouponMap.value.get(String(g.id));
    return b && b.enabled && b.template?.enabled !== false ? b : null;
}

function couponChipText(b: any): string {
    const t = b.template;
    if (t.type === 'FIXED' || t.type === 'FULL') {
        const yuan = t.discountValue / 100;
        const y = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
        return locale.t('menu.couponFixed').replace('{v}', y);
    }
    if (t.type === 'PERCENT') return locale.t('menu.couponPercent').replace('{v}', (t.discountValue / 10).toFixed(1).replace(/\.0$/, ''));
    return locale.t('menu.couponFreeShip');
}

function couponClaimed(productId: string): boolean {
    return claimedProductIds.value.has(String(productId));
}

async function loadProductCoupons(goods: any[]) {
    const ids = goods.map(g => String(g.id)).filter(id => !productCouponMap.value.has(id));
    if (!ids.length) return;
    await Promise.all(ids.map(async id => {
        try {
            const res = await getProductCoupons(id);
            const binding = (res?.productCoupons ?? []).filter((b: any) => b.enabled)[0] ?? null;
            productCouponMap.value.set(id, binding);
        } catch { productCouponMap.value.set(id, null); }
    }));
    productCouponMap.value = new Map(productCouponMap.value); // 触发响应式
}

async function claimProduct(binding: any) {
    if (claimedProductIds.value.has(String(binding.productId)) || claimingProductId.value) return;
    if (!authStore.requireLogin()) return;
    claimingProductId.value = String(binding.productId);
    try {
        await claimProductCoupon(binding.id);
        claimedProductIds.value.add(String(binding.productId));
        uni.showToast({ title: locale.t('menu.claimOk'), icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || locale.t('menu.claimFail'), icon: 'none' });
    } finally {
        claimingProductId.value = '';
    }
}

watch(activeCat, () => { loadProductCoupons(goodsOf(activeCat.value)); });

/** shop-api stockLevel 枚举：IN_STOCK / LOW_STOCK / OUT_OF_STOCK / null（不跟踪库存） */
function variantAvailable(v: any): boolean {
    return !!v && v.enabled !== false && v.stockLevel !== 'OUT_OF_STOCK';
}

/** 售罄 = 商家一键沽清（waimaiSoldOut）、当日限量售完（remaining=0）或全部规格无可售库存 */
function goodSoldOut(g: any): boolean {
    if (g?.customFields?.waimaiSoldOut === true) return true;
    const rem = goodRemaining(g);
    if (rem != null && rem <= 0) return true;
    const variants: any[] = g?.variants ?? [];
    return !variants.some(v => variantAvailable(v));
}

// —— 每日限量/每人限购（§68）：按商品 id 索引当日额度，仅「有限量配置」的商品有数据 ——
const dailyStock = ref<Map<string, any>>(new Map());
let dailyBusy = false;
async function loadDailyStock(): Promise<void> {
    if (dailyBusy) return;
    dailyBusy = true;
    try {
        const list = await fetchDailyStock();
        const m = new Map<string, any>();
        (list ?? []).forEach((it: any) => m.set(String(it.productId), it));
        dailyStock.value = m;
    } catch {
        // 静默：额度展示失败不影响点单，下单闸门仍有服务端兜底
    } finally {
        dailyBusy = false;
    }
}
function stockOf(g: any): any | null {
    return dailyStock.value.get(String(g?.id ?? '')) || null;
}
/** 全店剩余份数；null=不限 */
function goodRemaining(g: any): number | null {
    const s = stockOf(g);
    return s && s.remaining != null ? Number(s.remaining) : null;
}
/** 「仅剩 N 份」标签的展示阈值：剩余不多才提示，避免大额限量也刷成噪音 */
const LEFT_TAG_MAX = 10;
function goodLeft(g: any): number | null {
    const rem = goodRemaining(g);
    return rem != null && rem > 0 && rem <= LEFT_TAG_MAX ? rem : null;
}
/** 加购前本地额度校验（服务端闸门仍会在结算时二次校验） */
function limitBlocked(g: any, qty: number): boolean {
    const s = stockOf(g);
    if (!s) return false;
    const mine = s.myRemaining != null ? Number(s.myRemaining) : null;
    if (mine != null && qty > mine) {
        uni.showToast({
            title: locale.t('menu.perLimitToast')
                .replace('{n}', String(s.perUserLimit ?? 0))
                .replace('{m}', String(mine)),
            icon: 'none',
        });
        return true;
    }
    const rem = s.remaining != null ? Number(s.remaining) : null;
    if (rem != null && qty > rem) {
        uni.showToast({ title: locale.t('menu.leftToast').replace('{n}', String(rem)), icon: 'none' });
        return true;
    }
    return false;
}
/** 加购成功后本地扣减额度，避免连点超出剩余份数 */
function consumeStock(g: any, qty: number): void {
    const s = stockOf(g);
    if (!s) return;
    if (s.remaining != null) s.remaining = Math.max(0, Number(s.remaining) - qty);
    if (s.myRemaining != null) s.myRemaining = Math.max(0, Number(s.myRemaining) - qty);
    dailyStock.value = new Map(dailyStock.value);
}

// —— 售罄实时同步：商家沽清/恢复后，回到菜单或加购被拒时静默回填，不重建分类、不打断滚动 ——
let menuReady = false;
let syncBusy = false;
async function syncSoldOut(): Promise<void> {
    if (!menuReady || syncBusy) return;
    syncBusy = true;
    try {
        const list = await fetchProductList();
        const byId = new Map<string, any>();
        (list ?? []).forEach((p: any) => byId.set(String(p.id), p));
        products.value.forEach((p: any) => {
            const next = byId.get(String(p.id));
            if (!next) return;
            p.customFields = { ...(p.customFields || {}), waimaiSoldOut: !!next?.customFields?.waimaiSoldOut };
            const vMap = new Map<string, any>();
            (next.variants ?? []).forEach((v: any) => vMap.set(String(v.id), v));
            (p.variants ?? []).forEach((v: any) => {
                const nv = vMap.get(String(v.id));
                if (!nv) return;
                v.stockLevel = nv.stockLevel;
                v.enabled = nv.enabled;
            });
        });
        // 额度随时间/下单变化，回前台顺带刷新一次「仅剩 N 份」
        void loadDailyStock();
    } catch {
        // 静默失败：下次回前台/下次加购被拒时再试
    } finally {
        syncBusy = false;
    }
}
// 从购物车/详情返回、切后台再回来时同步一次售罄状态
onShow(() => { void syncSoldOut(); });

function goodLowStock(g: any): boolean {
    const variants: any[] = g?.variants ?? [];
    return variants.some(v => variantAvailable(v)) && variants.some(v => variantAvailable(v) && v.stockLevel === 'LOW_STOCK');
}

// —— 售罄智能替代（第 37 轮）：售罄商品 → 同店同价位可售替代，行内展开 ——
const altOpenId = ref('');
/** 售罄商品 id → 替代列表（只算售罄商品，最多 3 款） */
const altMap = computed(() => {
    const map = new Map<string, SaItem[]>();
    products.value.forEach((p: any) => {
        if (!goodSoldOut(p)) return;
        const list = saAlternatives(products.value, p, { max: 3 });
        if (list.length) map.set(String(p.id), list);
    });
    return map;
});

function altCandidates(g: any): SaItem[] {
    return altMap.value.get(String(g?.id ?? '')) || [];
}

/** 有替代才显示「换同款」条，避免空入口 */
function showAltBar(g: any): boolean {
    return goodSoldOut(g) && altCandidates(g).length > 0;
}

function toggleAlt(g: any) {
    const id = String(g?.id ?? '');
    altOpenId.value = altOpenId.value === id ? '' : id;
}

function altReasonText(it: SaItem): string {
    const r = saReason(it);
    return locale.t(r === 'sameCat' ? 'menu.altSameCat' : r === 'nearPrice' ? 'menu.altNearPrice' : 'menu.altHot');
}

/** 点替代卡：单规格直接加购，多规格打开详情弹层选规格 */
async function altPick(it: SaItem) {
    if (!it?.product) return;
    if (saAvailableVariants(it.product) > 1) { pickSku(it.product); return; }
    await addToCart(it.product);
}

function findVariant(variantId: string): any {
    for (const p of products.value) {
        const hit = (p.variants ?? []).find((v: any) => String(v.id) === String(variantId));
        if (hit) return hit;
    }
    return null;
}

/** 由规格 id 反查所属商品，供限量/限购校验使用 */
function findProductByVariant(variantId: string): any {
    for (const p of products.value) {
        if ((p.variants ?? []).some((v: any) => String(v.id) === String(variantId))) return p;
    }
    return null;
}

function toastSoldOut() {
    uni.showToast({ title: locale.t('menu.soldOutToast'), icon: 'none' });
    // 加购被拒多为商家刚沽清：顺手同步一次，避免用户反复点同一个已售罄商品
    void syncSoldOut();
}

/** 点商品：统一打开详情弹层（大图/描述/月销/规格/收藏/加购），单规格也可先看清详情 */
function pickSku(g: any) {
    if (goodSoldOut(g)) { toastSoldOut(); return; }
    rememberView(g);
    skuProduct.value = g;
    const preferred = resolvePreferredVariant(g?.id, g?.variants);
    skuPreferred.value = preferred ? String(preferred.id) : '';
    skuOpen.value = true;
}

/** 浏览足迹：记录商品 + 店铺信息，供「我的足迹」页回访 */
function rememberView(g: any) {
    const variant = g?.variants?.[0];
    recordFootprint({
        productId: String(g?.id ?? ''),
        variantId: variant?.id ? String(variant.id) : '',
        name: g?.name || '',
        image: g?.featuredAsset?.preview || '',
        price: Number(variant?.priceWithTax ?? 0),
        storeName: shopName.value,
        channelToken: shopToken.value,
        channelId: storeInfo.value?.channelId != null ? String(storeInfo.value.channelId) : (favChannelId.value != null ? String(favChannelId.value) : ''),
        routes: shopRoutes.value,
    });
}

async function doAddItem(variantId: string, quantity: number, addons?: { g: string; n: string }[]) {
    const target = findVariant(variantId);
    if (target && !variantAvailable(target)) { toastSoldOut(); return false; }
    const p = findProductByVariant(variantId);
    if (p && limitBlocked(p, quantity)) return false;
    const res: any = await addItemToOrder(variantId, quantity, addons);
    if (res?.addItemToOrder?.errorCode) {
        const msg = String(res.addItemToOrder.message || '');
        // 服务端额度兜底拦截：刷新额度，让「仅剩 N 份」立刻反映真实余量
        if (/限量|限购|left today|Limit/i.test(msg)) void loadDailyStock();
        uni.showToast({ title: res.addItemToOrder.message || locale.t('menu.addFail'), icon: 'none' });
        return false;
    }
    cart.setOrder(res.addItemToOrder);
    if (p) consumeStock(p, quantity);
    return true;
}

async function addToCart(g: any) {
    // 商家一键沽清：即使规格仍有库存也不可加购
    if (g?.customFields?.waimaiSoldOut === true) { toastSoldOut(); return false; }
    const variant = resolvePreferredVariant(g?.id, g?.variants) || g?.variants?.[0];
    if (!variant || !variantAvailable(variant)) { toastSoldOut(); return false; }
    rememberView(g);
    const ok = await doAddItem(variant.id, 1);
    if (ok) {
        rememberVariant(g?.id, variant.id);
        uni.showToast({ title: locale.t('menu.added'), icon: 'none' });
    }
    return ok;
}

async function onSkuAction(v: { action: 'cart' | 'buy'; variantId: string; quantity: number; addons?: { g: string; n: string }[] }) {
    const ok = await doAddItem(v.variantId, v.quantity, v.addons);
    if (ok) {
        rememberVariant(skuProduct.value?.id, v.variantId);
        skuOpen.value = false;
        if (v.action === 'buy') goCheckout();
    }
}

// ── 常点搭配：近 20 单中本店高频共现的一对在售商品，一键整组加购 ──
interface ComboItem { variantId: string; name: string; image?: string; price: number }
const combo = ref<{ items: ComboItem[]; total: number; orders: number } | null>(null);
const comboBusy = ref(false);

function comboPrice(v: number): string {
    return (Number(v || 0) / 100).toFixed(2);
}

async function loadCombo() {
    combo.value = null;
    if (!authStore.isLoggedIn) return;
    try {
        const res: any = await getOrdersForChannel(shopToken.value, { take: 20, skip: 0 });
        const orders = (res?.myOrders?.items ?? []).filter((o: any) => !!o && String(o.state) !== 'Cancelled');
        if (!orders.length) return;
        // variantId → 当前在售商品信息（下架/售罄不参与搭配）
        const map = new Map<string, ComboItem>();
        for (const p of products.value) {
            for (const v of p.variants ?? []) {
                if (!variantAvailable(v) || Number(v.priceWithTax) <= 0) continue;
                map.set(String(v.id), {
                    variantId: String(v.id),
                    name: p.name || v.name || '',
                    image: p.featuredAsset?.preview || '',
                    price: Number(v.priceWithTax),
                });
            }
        }
        const pairFreq = new Map<string, number>();
        for (const o of orders) {
            const ids = Array.from(new Set(
                (o.lines ?? []).map((l: any) => String(l?.productVariant?.id ?? '')).filter((id: string) => map.has(id)),
            ));
            for (let i = 0; i < ids.length; i++) {
                for (let j = i + 1; j < ids.length; j++) {
                    const k = [ids[i], ids[j]].sort().join('|');
                    pairFreq.set(k, (pairFreq.get(k) || 0) + 1);
                }
            }
        }
        let bestKey = '';
        let bestCount = 0;
        for (const [k, c] of pairFreq) if (c > bestCount) { bestCount = c; bestKey = k; }
        if (!bestKey) return;
        const [a, b] = bestKey.split('|');
        const ia = map.get(a);
        const ib = map.get(b);
        if (!ia || !ib) return;
        combo.value = { items: [ia, ib], total: ia.price + ib.price, orders: bestCount };
    } catch {
        combo.value = null;
    }
}

async function addCombo() {
    if (!combo.value || comboBusy.value) return;
    comboBusy.value = true;
    const items = combo.value.items;
    let ok = 0;
    try {
        for (const it of items) {
            if (await doAddItem(it.variantId, 1)) ok++;
        }
    } finally {
        comboBusy.value = false;
    }
    const title = ok === items.length ? locale.t('menu.comboAdded') : ok ? locale.t('menu.comboPartAdded') : locale.t('menu.addFail');
    uni.showToast({ title, icon: 'none' });
}

function callStore() {
    const p = storeInfo.value?.storePhone;
    if (p) uni.makePhoneCall({ phoneNumber: p });
}

function goCheckout() {
    if (!cartCount.value) return;
    if (storeClosed.value) {
        uni.showToast({ title: storeStateText.value || locale.t('menu.closedBtn'), icon: 'none' });
        return;
    }
    if (belowMinOrder.value) {
        uni.showToast({ title: locale.t('menu.minOrderGap').replace('{d}', minGapYuan.value), icon: 'none' });
        return;
    }
    const routes = encodeURIComponent(shopRoutes.value);
    const mo = storeInfo.value?.minOrderAmount ?? '';
    const fee = storeInfo.value?.deliveryFee ?? '';
    const cid = favChannelId.value != null ? `&cid=${favChannelId.value}` : '';
    const shop = `&shop=${encodeURIComponent(shopName.value)}`;
    const token = `&token=${encodeURIComponent(shopToken.value)}`;
    const dmin = storeInfo.value?.deliveryMinutes != null ? `&dmin=${storeInfo.value.deliveryMinutes}` : '';
    const hours = storeInfo.value?.businessHours ? `&hours=${encodeURIComponent(storeInfo.value.businessHours)}` : '';
    uni.navigateTo({ url: `/pkg-order/pages/checkout?routes=${routes}&minOrder=${mo}&dfee=${fee}${cid}${shop}${token}${dmin}${hours}` });
}
</script>

<style scoped lang="scss">
/* ── 双主题 token（同首页 --w-* 体系） ── */
.menu-page {
    --w-bg: #f5f5f5;
    --w-surface: #ffffff;
    --w-surface-muted: #f0f0f0;
    --w-text: #1a1a1a;
    --w-text-muted: #999999;
    --w-border: #ececec;
    --w-brand-soft: #fff3e6;
    --w-brand-text: #ff6600;
    --w-cart: #1f1f23;

    position: relative;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--w-bg);
}
/* #ifdef H5 */
/* uni H5 页头 44px 占位，否则整页可滚 44px、购物车条被顶出视口 */
.menu-page { height: calc(100vh - 44px); }
/* #endif */
.menu-page.dark {
    --w-bg: #161618;
    --w-surface: #242428;
    --w-surface-muted: #1e1e21;
    --w-text: #ececf0;
    --w-text-muted: #9a9aa3;
    --w-border: #35353a;
    --w-brand-soft: rgba(255, 102, 0, 0.16);
    --w-brand-text: #ff8a3d;
    --w-cart: #0d0d0f;
}
/* ── 橙头 + 浮出信息卡（版式 A） ── */
.hero { height: 96rpx; background: $brand; flex-shrink: 0; }
.shopcard { margin: -72rpx 24rpx 0; background: var(--w-surface); border-radius: $radius-card; padding: 24rpx; position: relative; flex-shrink: 0; box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.08); }
.shop-top { display: flex; gap: 20rpx; align-items: flex-start; }
.logo { width: 88rpx; height: 88rpx; border-radius: $radius; background: var(--w-brand-soft); color: var(--w-brand-text); display: flex; align-items: center; justify-content: center; font-size: 40rpx; font-weight: 600; flex-shrink: 0; }
.shop-main { flex: 1; min-width: 0; }
.sname { display: block; font-size: 32rpx; font-weight: 600; color: var(--w-text); line-height: 1.3; }
.smeta { display: block; font-size: 22rpx; color: var(--w-brand-text); margin-top: 8rpx; }
.share-btn { display: flex; flex-direction: column; align-items: center; gap: 4rpx; padding: 4rpx 8rpx; flex-shrink: 0; }
.share-ico { font-size: 34rpx; line-height: 1.1; color: var(--w-text-muted); }
.share-txt { font-size: 20rpx; color: var(--w-text-muted); }
.fav-btn { display: flex; flex-direction: column; align-items: center; gap: 4rpx; padding: 4rpx 8rpx; flex-shrink: 0; }
.fav-btn.disabled { opacity: 0.4; }
.fav-ico { font-size: 40rpx; line-height: 1; color: var(--w-text-muted); }
.fav-btn.on .fav-ico { color: #ff4d6d; }
.fav-txt { font-size: 20rpx; color: var(--w-text-muted); }
.fav-btn.on .fav-txt { color: #ff4d6d; }
.smeta em { font-style: normal; color: var(--w-text-muted); }
.tags { display: flex; gap: 12rpx; margin-top: 16rpx; flex-wrap: wrap; }
.tag { font-size: 20rpx; color: var(--w-brand-text); background: var(--w-brand-soft); border-radius: 8rpx; padding: 4rpx 12rpx; }
/* 阶梯满减：达成置亮、下一档描边并提示差额 */
.promo-tiers { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 12rpx; }
.promo-tier { display: flex; align-items: center; gap: 8rpx; font-size: 20rpx; padding: 4rpx 12rpx; border-radius: 8rpx; border: 1rpx solid var(--w-border); color: var(--w-text-muted); background: var(--w-surface);
  &__main { color: inherit; }
  &__gap { font-size: 18rpx; color: #b45309; }
  &.hit { border-color: var(--w-brand); background: var(--w-brand-soft); color: var(--w-brand-text); }
  &.next { border-style: dashed; border-color: #ffb27a; color: #b45309; }
}
/* 食安公示条 + 弹层（证照、等级、明厨亮灶） */
.fs-bar { display: flex; align-items: center; gap: 10rpx; margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx dashed var(--w-border); }
.fs-bar__ico { font-size: 24rpx; flex-shrink: 0; }
.fs-bar__txt { flex: 1; min-width: 0; font-size: 22rpx; color: var(--w-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fs-bar__live { flex-shrink: 0; font-size: 20rpx; color: #16a34a; }
.fs-bar__more { flex-shrink: 0; font-size: 22rpx; color: var(--w-brand-text); }
.fs-sheet { max-height: 76vh; }
.fs-row { display: flex; align-items: center; gap: 16rpx; padding: 16rpx 0; border-bottom: 1rpx solid var(--w-border); font-size: 26rpx; }
.fs-row:last-child { border-bottom: 0; }
.fs-lab { width: 160rpx; flex-shrink: 0; font-size: 24rpx; color: var(--w-text-muted); }
.fs-val { flex: 1; min-width: 0; color: var(--w-text); word-break: break-all; }
.fs-grade { font-weight: 600; }
.fs-grade.g-A { color: #16a34a; }
.fs-grade.g-B { color: #d97706; }
.fs-grade.g-C { color: #dc2626; }
.fs-grade.g-none { color: var(--w-text-muted); font-weight: 400; }
.fs-actions { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 20rpx; }
.fs-btn { margin: 0; padding: 0 26rpx; height: 64rpx; line-height: 64rpx; font-size: 24rpx; border-radius: 32rpx; color: var(--w-brand-text); background: var(--w-brand-soft); border: 1rpx solid var(--w-border); }
.fs-btn::after { border: none; }
.fs-btn--live { color: #fff; background: #16a34a; border-color: #16a34a; }
.fs-tip { display: block; margin-top: 16rpx; font-size: 22rpx; line-height: 1.6; color: var(--w-text-muted); }
.menu-page.dark .fs-sheet { background: var(--w-surface); }
.menu-page.dark .fs-sheet .notice-sheet__title { color: var(--w-text); }
/* 智能取餐柜入口条 + 弹层（P2-4） */
.lk-bar { display: flex; align-items: center; gap: 10rpx; margin-top: 12rpx; padding-top: 12rpx; border-top: 1rpx dashed var(--w-border); }
.lk-bar__ico { font-size: 24rpx; flex-shrink: 0; }
.lk-bar__txt { flex: 1; min-width: 0; font-size: 22rpx; color: var(--w-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lk-bar__more { flex-shrink: 0; font-size: 22rpx; color: var(--w-brand-text); }
.lk-sheet { max-height: 76vh; }
.lk-tip { display: block; padding: 40rpx 0; text-align: center; font-size: 24rpx; color: var(--w-text-muted); }
.lk-item { padding: 20rpx 0; border-bottom: 1rpx solid var(--w-border); }
.lk-item:last-of-type { border-bottom: 0; }
.lk-item__head { display: flex; align-items: center; gap: 12rpx; }
.lk-item__name { flex: 1; min-width: 0; font-size: 28rpx; font-weight: 600; color: var(--w-text); }
.lk-item__cells { flex-shrink: 0; font-size: 20rpx; color: var(--w-brand-text); background: var(--w-brand-soft); border-radius: 8rpx; padding: 4rpx 12rpx; }
.lk-item__loc { display: block; margin-top: 8rpx; font-size: 24rpx; color: var(--w-text-muted); }
.lk-item__meta { display: flex; align-items: center; gap: 12rpx; margin-top: 8rpx; }
.lk-item__tag { font-size: 20rpx; color: var(--w-brand-text); border: 1rpx solid var(--w-brand); border-radius: 6rpx; padding: 0 10rpx; }
.lk-item__hours { font-size: 20rpx; color: var(--w-text-muted); }
.lk-item__guide { display: block; margin-top: 10rpx; padding: 12rpx 16rpx; border-radius: 10rpx; background: var(--w-surface-2, var(--w-brand-soft)); font-size: 22rpx; line-height: 1.6; color: var(--w-text-muted); }
.lk-unmanned { display: flex; align-items: center; gap: 10rpx; margin-top: 20rpx; padding: 14rpx 18rpx; border-radius: 10rpx; background: var(--w-brand-soft); }
.lk-unmanned__ico { font-size: 26rpx; }
.lk-unmanned__txt { flex: 1; min-width: 0; font-size: 22rpx; color: var(--w-brand-text); }
.menu-page.dark .lk-sheet { background: var(--w-surface); }
.menu-page.dark .lk-sheet .notice-sheet__title { color: var(--w-text); }
/* 营业状态条：打烊红、即将打烊橙，均贴在店铺卡下方 */
.shop-state { display: flex; align-items: center; gap: 10rpx; margin: 16rpx 24rpx 0; padding: 14rpx 20rpx; border-radius: 12rpx; flex-shrink: 0; }
.shop-state--closed { background: #fff2f0; border: 1rpx solid #f3b6b0; }
.shop-state--closing { background: #fff8ef; border: 1rpx solid #ffd9ad; }
.shop-state__ico { font-size: 26rpx; }
.shop-state__txt { font-size: 24rpx; line-height: 1.4; flex: 1; }
.shop-state--closed .shop-state__txt { color: #b42318; }
.shop-state--closing .shop-state__txt { color: #b45309; }
/* 预计送达条（第 38 轮）：品牌色横条，与营业状态条二选一展示 */
.eta-bar { display: flex; align-items: center; gap: 10rpx; margin: 16rpx 24rpx 0; padding: 14rpx 20rpx; border-radius: 12rpx; background: var(--w-brand-soft); border: 1rpx solid var(--w-brand); flex-shrink: 0; }
.eta-bar__ico { font-size: 26rpx; color: var(--w-brand-text); }
.eta-bar__txt { font-size: 24rpx; line-height: 1.4; font-weight: 600; color: var(--w-brand-text); flex: 1; }
.eta-bar__hint { font-size: 20rpx; color: var(--w-brand-text); opacity: 0.75; flex-shrink: 0; }
/* 商家投放：店铺页顶部广告（P2-3 广告位，无图时文字卡跟随主题色） */
.shop-ad { display: flex; gap: 16rpx; margin: 12rpx 24rpx 0; flex-shrink: 0; overflow-x: auto; }
.shop-ad__item {
    position: relative; flex: 0 0 640rpx; height: 180rpx; border-radius: 14rpx; overflow: hidden;
    background: var(--w-surface); border: 1rpx solid var(--w-border);
}
.shop-ad__img { width: 100%; height: 100%; }
.shop-ad__body {
    position: absolute; left: 0; right: 0; bottom: 0; padding: 12rpx 18rpx;
    display: flex; flex-direction: column; gap: 4rpx;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.55) 100%);
}
.shop-ad__tag {
    align-self: flex-start; font-size: 18rpx; line-height: 1; padding: 4rpx 10rpx;
    border-radius: 6rpx; color: #fff; background: rgba(0, 0, 0, 0.35);
}
.shop-ad__title { font-size: 26rpx; font-weight: 700; color: #fff; }
.shop-ad__end { font-size: 20rpx; color: rgba(255, 255, 255, 0.85); }
.shop-ad__item.no-img { background: var(--w-brand-soft); }
.shop-ad__item.no-img .shop-ad__body {
    position: static; height: 100%; box-sizing: border-box; justify-content: center;
    padding: 20rpx 22rpx; background: none;
}
.shop-ad__item.no-img .shop-ad__tag { color: var(--w-brand-text); background: var(--w-surface); }
.shop-ad__item.no-img .shop-ad__title { color: var(--w-text); }
.shop-ad__item.no-img .shop-ad__end { color: var(--w-text-muted); }
/* 店铺公告条 + 公告弹层 */
.notice-bar { display: flex; align-items: center; gap: 10rpx; margin: 12rpx 24rpx 0; padding: 14rpx 20rpx; border-radius: 12rpx; background: #fff8ef; border: 1rpx solid #ffe2c2; flex-shrink: 0; }
.notice-bar__ico { font-size: 24rpx; flex-shrink: 0; }
.notice-bar__txt { flex: 1; min-width: 0; font-size: 24rpx; color: #8a5a1f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notice-bar__more { flex-shrink: 0; font-size: 22rpx; color: #ff6600; }
/* 好友分享的菜品：定位条（高亮该菜 + 一键加购） */
.dish-share { display: flex; align-items: center; gap: 16rpx; margin: 12rpx 24rpx 0; padding: 18rpx 20rpx; border-radius: 14rpx; background: var(--w-brand-soft); border: 1rpx solid $brand; flex-shrink: 0; }
.dish-share__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
.dish-share__tag { align-self: flex-start; font-size: 20rpx; line-height: 1; padding: 4rpx 10rpx; border-radius: 6rpx; color: #fff; background: $brand; }
.dish-share__name { font-size: 28rpx; font-weight: 600; color: var(--w-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dish-share__hint { font-size: 20rpx; color: var(--w-text-muted); }
.dish-share__add { flex-shrink: 0; height: 60rpx; padding: 0 26rpx; border-radius: 999rpx; background: $brand; color: #fff; font-size: 24rpx; display: flex; align-items: center; justify-content: center; }
.dish-share__add.disabled { background: var(--w-surface-muted); color: var(--w-text-muted); }
/* 常点搭配：历史高频组合一键加购 */
.combo { margin: 12rpx 24rpx 0; padding: 18rpx 20rpx; border-radius: 14rpx; background: #fff8ef; border: 1rpx solid #ffe2c2; flex-shrink: 0; }
.combo__head { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.combo__title { font-size: 26rpx; font-weight: 600; color: #8a5a1f; }
.combo__hint { font-size: 20rpx; color: #b07a3c; }
.combo__row { display: flex; gap: 14rpx; margin-top: 12rpx; }
.combo__item { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12rpx; background: #fff; border-radius: 10rpx; padding: 10rpx; }
.combo__img { width: 64rpx; height: 64rpx; border-radius: 8rpx; flex-shrink: 0; background: #fff1e2;
  &--txt { display: flex; align-items: center; justify-content: center; font-size: 28rpx; color: #ff6600; } }
.combo__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
.combo__name { font-size: 22rpx; color: #1f2329; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.combo__price { font-size: 22rpx; color: #ff6600; font-weight: 600; }
.combo__foot { display: flex; align-items: center; justify-content: space-between; margin-top: 12rpx; }
.combo__sum { font-size: 28rpx; font-weight: 600; color: #ff6600; }
.combo__btn { padding: 10rpx 32rpx; border-radius: 999rpx; background: #ff6600; color: #fff; font-size: 24rpx; font-weight: 600;
  &.busy { opacity: 0.5; } }
/* ── 附近有货弹层 ── */
.nearby-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 270; display: flex; align-items: flex-end; }
.nearby-sheet { width: 100%; max-height: 76vh; background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 32rpx 28rpx calc(28rpx + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 18rpx; box-sizing: border-box; }
.nearby-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16rpx; }
.nearby-head__col { display: flex; flex-direction: column; gap: 6rpx; min-width: 0; }
.nearby-title { font-size: 32rpx; font-weight: 700; color: #222; }
.nearby-sub { font-size: 24rpx; color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nearby-close { font-size: 32rpx; color: #999; padding: 0 8rpx; }
.nearby-noloc { font-size: 22rpx; color: #b26a00; background: #fff7e6; border-radius: 12rpx; padding: 14rpx 18rpx; line-height: 1.5; }
.nearby-body { max-height: 50vh; }
.nearby-loading { text-align: center; font-size: 24rpx; color: #999; padding: 40rpx 0; }
.nearby-item { padding: 22rpx 0; border-bottom: 1rpx solid #f0f0f0; display: flex; flex-direction: column; gap: 8rpx; }
.nearby-item:last-child { border-bottom: none; }
.nearby-item__top { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.nearby-item__name { font-size: 27rpx; font-weight: 600; color: #222; }
.nearby-item__dist { flex-shrink: 0; font-size: 22rpx; color: #ff6600; }
.nearby-item__desc { font-size: 22rpx; color: #999; }
.nearby-item__meta { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.nearby-item__stock { font-size: 22rpx; color: #1f8a4c; }
.nearby-item__city { font-size: 20rpx; color: #bbb; }
.nearby-refresh { width: 100%; height: 84rpx; line-height: 84rpx; border-radius: 42rpx; background: #ff6600; color: #fff; font-size: 28rpx; border: none; }
.nearby-refresh::after { border: none; }
.nearby-refresh[disabled] { background: #ccc; }
/* ── 店铺公告弹层 ── */
.notice-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 260; display: flex; align-items: center; justify-content: center; padding: 0 60rpx; }
.notice-sheet { width: 100%; max-height: 70vh; background: #fff; border-radius: 24rpx; padding: 36rpx 32rpx 28rpx; display: flex; flex-direction: column; gap: 20rpx; box-sizing: border-box; }
.notice-sheet__head { display: flex; align-items: center; gap: 12rpx; }
.notice-sheet__ico { font-size: 34rpx; }
.notice-sheet__title { font-size: 32rpx; font-weight: 600; color: #222; }
.notice-sheet__body { max-height: 44vh; }
.notice-sheet__text { font-size: 26rpx; line-height: 1.7; color: #555; white-space: pre-wrap; }
.notice-sheet__btn { width: 100%; margin-top: 8rpx; height: 88rpx; line-height: 88rpx; border-radius: 44rpx; background: #ff6600; color: #fff; font-size: 30rpx; border: none; }
.notice-sheet__btn::after { border: none; }
/* ── Tab 行 ── */
.tabs { display: flex; gap: 48rpx; padding: 0 32rpx; border-bottom: 1rpx solid var(--w-border); flex-shrink: 0; }
.tb { padding: 20rpx 0; font-size: 28rpx; color: var(--w-text-muted); border-bottom: 4rpx solid transparent; margin-bottom: -1rpx; }
.tb.on { color: var(--w-text); font-weight: 600; border-bottom-color: $brand; }
/* ── 商品面板 ── */
.panel { flex: 1; min-height: 0; }
.body { display: flex; height: 100%; }
.cats { width: 176rpx; background: var(--w-surface-muted); height: 100%; flex-shrink: 0; }
.cat { padding: 28rpx 16rpx; font-size: 26rpx; color: var(--w-text-muted); }
.cat.on { background: var(--w-surface); color: var(--w-text); font-weight: 600; border-left: 6rpx solid $brand; }
.goods { flex: 1; min-width: 0; background: var(--w-surface); padding: 8rpx 24rpx 0; box-sizing: border-box; height: 100%; }
.good { display: flex; gap: 16rpx; padding: 20rpx 0; border-bottom: 1rpx solid var(--w-border); position: relative; }
.good-img { flex-shrink: 0; background: var(--w-surface-muted); border-radius: $radius; overflow: hidden; }
.good-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; padding-right: 120rpx; }
.good-title { display: flex; align-items: center; gap: 8rpx; min-width: 0; }
.good-name { flex: 1; min-width: 0; font-size: 28rpx; font-weight: 600; color: var(--w-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.good-tag { flex-shrink: 0; font-size: 20rpx; line-height: 1; padding: 4rpx 10rpx; border-radius: 6rpx; }
.good-tag--sold { color: var(--w-surface); background: var(--w-text-muted); }
.good-tag--low { color: var(--w-brand-text); background: var(--w-brand-soft); }
.good-tag--left { color: var(--w-warn-text, #b45309); background: var(--w-warn-soft, #fef3c7); }
.good-tag--shared { color: #fff; background: $brand; }
.good-tag--new { color: #fff; background: linear-gradient(135deg, #ff6600, #ff9500); }
.good--hl { background: var(--w-brand-soft); border-radius: $radius; box-shadow: inset 0 0 0 2rpx $brand; }
/* 热销 TOP 角标：金 #f5a623 / 银 #9aa5b1 / 铜 #c98a5e；TOP1 行描边高亮 */
.hot-rank { flex-shrink: 0; font-size: 18rpx; line-height: 1; font-weight: 700; color: #fff; border-radius: 6rpx; padding: 4rpx 10rpx; }
.hot-rank--1 { background: #f5a623; }
.hot-rank--2 { background: #9aa5b1; }
.hot-rank--3 { background: #c98a5e; }
.good--top1 { background: var(--w-brand-soft); border-radius: $radius; box-shadow: inset 0 0 0 2rpx $brand; }
.good-taste { font-size: 20rpx; line-height: 1.4; color: var(--w-brand-text); background: var(--w-brand-soft); border-radius: 6rpx; padding: 4rpx 10rpx; align-self: flex-start; }
.good-taste.warn { color: #b42318; background: #fff2f0; }
.good--sold .good-img, .good--sold .good-info { opacity: 0.5; }
.good-desc { font-size: 22rpx; color: var(--w-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.good-rate { display: flex; align-items: center; gap: 6rpx; font-size: 22rpx; }
.good-rate__star { color: #f59e0b; font-size: 22rpx; }
.good-rate__num { color: #f59e0b; font-weight: 600; }
.good-rate__cnt { color: var(--w-text-muted); }
.price-row { margin-top: 4rpx; display: flex; align-items: center; gap: 16rpx; }
.good-nearby { font-size: 20rpx; color: var(--w-brand-text); background: var(--w-brand-soft); border-radius: 999rpx; padding: 6rpx 14rpx; white-space: nowrap; }
.good-coupon { display: inline-flex; align-items: center; gap: 8rpx; margin-top: 8rpx; padding: 2rpx 12rpx; border: 1rpx solid #ff6600; border-radius: 6rpx; background: #fff7f0; }
.good-coupon__txt { font-size: 20rpx; color: #ff6600; }
.good-coupon__action { font-size: 20rpx; color: #fff; background: #ff6600; border-radius: 4rpx; padding: 0 8rpx; }
.add-btn { position: absolute; right: 0; bottom: 20rpx; min-width: 56rpx; height: 56rpx; border-radius: 999rpx; background: $brand; color: #fff; font-size: 36rpx; display: flex; align-items: center; justify-content: center; }
.add-btn.spec { font-size: 22rpx; padding: 0 20rpx; font-weight: 600; }
.add-btn.disabled { background: var(--w-surface-muted); color: var(--w-text-muted); }
/* 售罄智能替代（第 37 轮）：行内换同款条 + 横滑替代卡 */
.alt-bar { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin: 0 0 12rpx; padding: 12rpx 20rpx; border-radius: $radius; background: var(--w-brand-soft); }
.alt-bar__txt { font-size: 22rpx; color: var(--w-brand-text); }
.alt-bar__chev { font-size: 24rpx; color: var(--w-brand-text); }
.alt-panel { margin: 0 0 16rpx; min-width: 0; max-width: 100%; overflow: hidden; }
.alt-panel__scroll { width: 100%; max-width: 100%; white-space: nowrap; }
.alt-panel__row { display: inline-flex; gap: 16rpx; padding: 4rpx 0; }
.alt-card { width: 210rpx; flex: 0 0 auto; box-sizing: border-box; background: var(--w-surface-muted); border-radius: $radius; padding: 12rpx; display: flex; flex-direction: column; gap: 6rpx; }
.alt-card__img { border-radius: 8rpx; }
.alt-card__nm { font-size: 22rpx; color: var(--w-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.alt-card__why { font-size: 20rpx; line-height: 1.4; color: var(--w-brand-text); background: var(--w-surface); border-radius: 999rpx; padding: 2rpx 10rpx; align-self: flex-start; }
.alt-card__foot { display: flex; align-items: center; justify-content: space-between; margin-top: 2rpx; }
.alt-card__plus { width: 44rpx; height: 44rpx; border-radius: 999rpx; background: $brand; color: #fff; font-size: 28rpx; display: flex; align-items: center; justify-content: center; }
/* 商品收藏心标 + 搜索定位 chip（复用 --w-* 主题 token） */
.good-fav { position: absolute; right: 0; top: 16rpx; width: 56rpx; height: 56rpx; display: flex; align-items: center; justify-content: center; font-size: 36rpx; color: var(--w-text-muted); }
.good-fav.on { color: #ff4d6d; }
/* 单品分享：跟在加购按钮左侧的圆形「↗」（不动加购原始位置） */
.good-share { position: absolute; right: 72rpx; bottom: 20rpx; width: 56rpx; height: 56rpx; border-radius: 999rpx; border: 1rpx solid var(--w-border); color: var(--w-text-muted); font-size: 28rpx; display: flex; align-items: center; justify-content: center; }
.good-sort { display: flex; gap: 12rpx; padding: 16rpx 0 0; flex-wrap: wrap; }
.good-filter { display: flex; gap: 12rpx; padding: 12rpx 0 0; flex-wrap: wrap; }
.sort-chip { font-size: 22rpx; line-height: 1; color: var(--w-text-muted); background: var(--w-surface-muted); border-radius: 999rpx; padding: 12rpx 22rpx; white-space: nowrap; }
.sort-chip.on { color: var(--w-brand-text); background: var(--w-brand-soft); font-weight: 600; }
.shop-search { display: flex; align-items: center; gap: 10rpx; margin-top: 16rpx; padding: 0 20rpx; height: 68rpx; border-radius: 999rpx; background: var(--w-surface-muted); }
.shop-search__ico { font-size: 24rpx; }
.shop-search__ipt { flex: 1; font-size: 24rpx; height: 68rpx; color: var(--w-text); }
.shop-search__x { font-size: 24rpx; color: var(--w-text-muted); padding: 8rpx; }
.suggest { margin-top: 16rpx; display: flex; flex-direction: column; gap: 14rpx; }
.suggest__group { display: flex; flex-direction: column; gap: 10rpx; }
.suggest__head { display: flex; justify-content: space-between; align-items: center; font-size: 22rpx; color: var(--w-text-muted); }
.suggest__clear { font-size: 22rpx; padding: 4rpx 8rpx; }
.suggest__chips { display: flex; flex-wrap: wrap; gap: 12rpx; }
.suggest__chip { font-size: 22rpx; color: var(--w-text); background: var(--w-surface-muted); border-radius: 999rpx; padding: 10rpx 20rpx; }
.suggest__chip--hot { color: var(--w-brand-text); background: var(--w-brand-soft); }
.good-search { display: flex; align-items: center; gap: 12rpx; margin: 16rpx 0 0; padding: 10rpx 20rpx; background: var(--w-brand-soft); border-radius: 999rpx; }
.good-search__txt { flex: 1; min-width: 0; font-size: 22rpx; color: var(--w-brand-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.good-search__x { font-size: 24rpx; color: var(--w-text-muted); padding: 0 8rpx; }
.scroll-pad { height: 150rpx; }
/* ── 评论 / 商家面板 ── */
.solo { padding-bottom: 160rpx; box-sizing: border-box; }
/* ── 评论 A 版式 ── */
.rv-summary { background: var(--w-surface); border-radius: $radius-card; margin: 20rpx 24rpx 0; padding: 24rpx; }
.rv-sum-top { display: flex; gap: 32rpx; align-items: center; }
.rv-score { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 4rpx; }
.rv-score__num { font-size: 64rpx; font-weight: 700; color: var(--w-text); line-height: 1.1; }
.rv-score__lab { font-size: 22rpx; color: var(--w-text-muted); }
.rv-dist { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8rpx; }
.rv-dist__row { display: flex; align-items: center; gap: 12rpx; }
.rv-dist__star { font-size: 20rpx; color: var(--w-text-muted); flex-shrink: 0; width: 44rpx; }
.rv-dist__bar { flex: 1; height: 12rpx; border-radius: 999rpx; background: var(--w-surface-muted); overflow: hidden; }
.rv-dist__fill { height: 100%; border-radius: 999rpx; background: #f59e0b; }
.rv-dist__pct { font-size: 20rpx; color: var(--w-text-muted); flex-shrink: 0; width: 64rpx; text-align: right; }
.rv-sum-foot { display: flex; justify-content: space-between; margin-top: 20rpx; padding-top: 20rpx; border-top: 1rpx solid var(--w-border); font-size: 24rpx; color: var(--w-text-muted); }
.rv-chips { display: flex; gap: 16rpx; padding: 24rpx 24rpx 0; flex-wrap: wrap; }
.rv-chip { font-size: 24rpx; color: var(--w-text-muted); background: var(--w-surface); border: 1rpx solid var(--w-border); border-radius: 999rpx; padding: 10rpx 28rpx; }
.rv-chip.on { color: var(--w-brand-text); background: var(--w-brand-soft); border-color: transparent; font-weight: 600; }
.rv-item { background: var(--w-surface); border-radius: $radius-card; margin: 20rpx 24rpx 0; padding: 24rpx; display: flex; flex-direction: column; gap: 16rpx; }
.rv-head { display: flex; align-items: center; gap: 16rpx; }
.rv-avatar { width: 64rpx; height: 64rpx; border-radius: 999rpx; background: var(--w-brand-soft); color: var(--w-brand-text); font-size: 26rpx; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.rv-who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx; }
.rv-name { font-size: 26rpx; color: var(--w-text); font-weight: 500; }
.rv-stars { font-size: 22rpx; color: #f59e0b; .off { color: var(--w-border); } }
.rv-date { font-size: 22rpx; color: var(--w-text-muted); flex-shrink: 0; }
.rv-content { font-size: 26rpx; color: var(--w-text); line-height: 1.6; }
.rv-imgs { display: flex; gap: 12rpx; flex-wrap: wrap; }
.rv-tags { display: flex; gap: 12rpx; flex-wrap: wrap; }
.rv-tag { font-size: 20rpx; color: var(--w-brand-text); background: var(--w-brand-soft); border-radius: 8rpx; padding: 4rpx 12rpx; }
.rv-reply { background: var(--w-surface-muted); border-radius: 12rpx; padding: 16rpx; font-size: 24rpx; color: var(--w-text-muted); line-height: 1.5; }
.rv-reply__who { color: var(--w-brand-text); margin-right: 12rpx; font-weight: 500; }
.rv-reply .rv-imgs { margin-top: 10rpx; }
.rv-more { text-align: center; font-size: 24rpx; color: var(--w-text-muted); padding: 32rpx 0 0; }
.mcard { background: var(--w-surface); border-radius: $radius-card; margin: 20rpx 24rpx 0; padding: 8rpx 24rpx; }
.mrow { display: flex; gap: 12rpx; align-items: flex-start; padding: 24rpx 0; border-bottom: 1rpx solid var(--w-border); font-size: 26rpx; }
.mrow:last-child { border-bottom: 0; }
.mico { flex-shrink: 0; }
.mlab { color: var(--w-text-muted); flex-shrink: 0; }
.mval { color: var(--w-text); flex: 1; }
.msrv { display: flex; gap: 12rpx; align-items: center; padding: 20rpx 0; font-size: 24rpx; color: var(--w-text-muted); flex-wrap: wrap; }
/* ── 店内热销榜（大家都在点）：月售 Top6 横滑卡 ── */
.hot-sale { margin: 16rpx 24rpx 0; background: var(--w-surface); border-radius: $radius-card; padding: 20rpx 20rpx 16rpx; }
.hot-sale__head { display: flex; align-items: center; gap: 12rpx; margin-bottom: 16rpx; }
.hot-sale__title { font-size: 28rpx; font-weight: 700; color: var(--w-text); }
.hot-sale__badge { font-size: 20rpx; line-height: 1; color: #fff; background: linear-gradient(90deg, #ff6600, #ff9500); border-radius: 999rpx; padding: 6rpx 14rpx; }
.hot-sale__more { margin-left: auto; font-size: 22rpx; color: var(--w-brand-text); }
.hot-sale__row { white-space: nowrap; }
.hot-item { display: inline-block; vertical-align: top; width: 152rpx; margin-right: 16rpx; }
.hot-item:last-child { margin-right: 0; }
.hot-item__imgwrap { position: relative; width: 152rpx; height: 152rpx; }
.hot-item__img { width: 152rpx; height: 152rpx; border-radius: $radius-sm; background: var(--w-surface-muted); overflow: hidden; }
.hot-item__img--txt { display: flex; align-items: center; justify-content: center; font-size: 48rpx; font-weight: 600; color: var(--w-brand-text); }
.hot-item__rank { position: absolute; left: 0; top: 0; min-width: 40rpx; height: 36rpx; border-radius: $radius-sm 0 12rpx 0; padding: 0 8rpx; font-size: 20rpx; font-weight: 700; color: #fff; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
.hot-item__rank.rk-1 { background: #f5a623; }
.hot-item__rank.rk-2 { background: #9aa5b1; }
.hot-item__rank.rk-3 { background: #c98a5e; }
.hot-item__rank.rk-4, .hot-item__rank.rk-5, .hot-item__rank.rk-6 { background: var(--w-surface-muted); color: var(--w-text-muted); }
.hot-item__name { display: block; margin-top: 8rpx; font-size: 24rpx; font-weight: 600; color: var(--w-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hot-item__sales { display: block; margin-top: 2rpx; font-size: 20rpx; color: var(--w-text-muted); }
.hot-item__foot { display: flex; align-items: center; justify-content: space-between; margin-top: 6rpx; }
.hot-item__price { font-size: 26rpx; font-weight: 700; color: var(--w-brand-text); }
.hot-item__add { width: 44rpx; height: 44rpx; border-radius: 999rpx; background: $brand; color: #fff; font-size: 30rpx; display: flex; align-items: center; justify-content: center; }
/* ── 购物车悬浮胶囊 ── */
.cross-sell { position: absolute; left: 24rpx; right: 24rpx; bottom: calc(136rpx + env(safe-area-inset-bottom)); z-index: 49; background: var(--w-surface, #fff); border-radius: $radius; padding: 16rpx 16rpx 12rpx; box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.12); }
.cross-sell__head { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; margin-bottom: 12rpx; }
.cross-sell__title { font-size: 24rpx; font-weight: 600; color: var(--w-text, #333); }
.cross-sell__gap { font-size: 22rpx; color: var(--w-brand-text, #ff6600); }
.cross-sell__row { white-space: nowrap; }
.cs-item { display: inline-block; vertical-align: top; width: 132rpx; margin-right: 16rpx; }
.cs-img { border-radius: $radius-sm; background: var(--w-surface-muted, #f5f5f5); }
.cs-name { display: block; font-size: 22rpx; color: var(--w-text, #333); margin-top: 6rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 4rpx; }
.cs-add { width: 34rpx; height: 34rpx; border-radius: 999rpx; background: $brand; color: #fff; font-size: 26rpx; line-height: 34rpx; text-align: center; }
.cart-bar { position: absolute; left: 24rpx; right: 24rpx; bottom: calc(24rpx + env(safe-area-inset-bottom)); height: 96rpx; background: var(--w-cart); border-radius: 999rpx; display: flex; align-items: center; padding-right: 8rpx; box-shadow: 0 12rpx 32rpx rgba(0, 0, 0, 0.28); z-index: 50; }
.cart-btn { width: 96rpx; height: 96rpx; border-radius: 999rpx; background: $brand; display: flex; align-items: center; justify-content: center; font-size: 40rpx; margin-top: -36rpx; border: 6rpx solid var(--w-bg); position: relative; flex-shrink: 0; }
.cart-count { position: absolute; top: -10rpx; right: -10rpx; min-width: 36rpx; height: 36rpx; border-radius: 999rpx; background: $surface; color: $brand; font-size: 20rpx; display: flex; align-items: center; justify-content: center; font-weight: 600; padding: 0 6rpx; }
.cart-total { flex: 1; padding-left: 20rpx; min-width: 0; }
.empty-hint { font-size: 26rpx; color: rgba(255, 255, 255, 0.75); }
.sum { display: block; font-size: 32rpx; font-weight: 600; color: #fff; }
.cart-promo { display: block; font-size: 20rpx; color: #ffd08a; margin-top: 2rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.checkout-btn { background: $brand; color: #fff; border-radius: 999rpx; padding: 20rpx 44rpx; font-size: 26rpx; font-weight: 600; flex-shrink: 0; }
.checkout-btn.disabled { opacity: 0.4; }
</style>
