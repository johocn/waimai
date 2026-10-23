<template>
    <view class="page" :class="{ dark: theme === 'dark' }">
        <view class="head">
            <view class="loc-row">
                <text class="loc">{{ $t('home.locText') }}</text>
                <view class="head-right">
                    <view class="theme-btn" @tap="toggleTheme">{{ theme === 'dark' ? '☀️' : '🌙' }}</view>
                    <view class="bell-btn" @tap="goMessages">
                        <text class="bell-ico">🔔</text>
                        <text class="bell-badge" v-if="messages.unreadCount > 0">{{ messages.unreadCount > 99 ? '99+' : messages.unreadCount }}</text>
                    </view>
                    <text class="hlink" @tap="goOrders">{{ $t('home.myOrders') }}</text>
                </view>
            </view>
            <!-- 当前配送楼栋：取结算页最近保存的配送目标，点击可快捷切换 -->
            <view class="target-row" v-if="deliveryTarget" @tap="openTargetSheet">
                <text class="target-row__txt">📍 {{ deliveryTarget.zoneName }} · {{ deliveryTarget.buildingName }}</text>
                <text class="target-row__sw">{{ $t('home.switchTarget') }} ▸</text>
            </view>
            <input
                class="search" v-model="keyword" :placeholder="$t('home.searchPh')" confirm-type="search"
                @focus="onSearchFocus" @blur="onSearchBlur" @input="onKeywordInput" @confirm="submitSearch(keyword)"
            />
        </view>
        <view class="body">
            <!-- 运营位：公告条（后台 operations-plugin 发布内容，无配置时隐藏） -->
            <view v-if="cmsNotices.length" class="cms-notice" @tap="openNoticeItem">
                <text class="cms-notice__ico">📢</text>
                <text class="cms-notice__txt">{{ cmsNotices[0].data.content }}</text>
                <text class="cms-notice__more">{{ $t('cms.more') }} ›</text>
            </view>
            <!-- 运营位：轮播 Banner -->
            <scroll-view v-if="cmsBanners.length" scroll-x class="cms-banner" :show-scrollbar="false">
                <view
                    v-for="b in cmsBanners" :key="b.id" class="cms-banner__item"
                    @tap="openCmsLink(b.data?.link)"
                >
                    <image class="cms-banner__img" :src="b.data.imageUrl" mode="aspectFill" />
                    <view v-if="b.data.title" class="cms-banner__mask">
                        <text class="cms-banner__title">{{ b.data.title }}</text>
                        <text v-if="b.data.subtitle" class="cms-banner__sub">{{ b.data.subtitle }}</text>
                    </view>
                </view>
            </scroll-view>
            <!-- 开门提醒：关注过的打烊店铺现已营业（本机订阅，一次性提示） -->
            <view v-if="!loading && openedList.length" class="open-banner">
                <text class="open-banner__ico">🔔</text>
                <view class="open-banner__body">
                    <text class="open-banner__title">{{ $t('openWatch.opened').replace('{s}', openedList[0].name) }}</text>
                    <text v-if="openedList.length > 1" class="open-banner__sub">{{ $t('openWatch.more').replace('{n}', String(openedList.length - 1)) }}</text>
                </view>
                <text class="open-banner__go" @tap.stop="goOpened(openedList[0])">{{ $t('openWatch.go') }}</text>
                <text class="open-banner__close" @tap.stop="dismissOpen">✕</text>
            </view>
            <view class="quick">
                <view class="qk" @tap="goOrders">
                    <view class="qico">🧾</view>
                    <text class="qtxt">{{ $t('home.myOrders') }}</text>
                </view>
                <view class="qk" @tap="goRider">
                    <view class="qico">🛵</view>
                    <text class="qtxt">{{ $t('home.becomeRider') }}</text>
                </view>
                <view class="qk" @tap="goErrand">
                    <view class="qico">🏃</view>
                    <text class="qtxt">{{ $t('home.errand') }}</text>
                </view>
                <view class="qk" @tap="goCart">
                    <view class="qico">🛒</view>
                    <text class="qtxt">{{ $t('home.cart') }}</text>
                </view>
                <view class="qk" @tap="goGroup">
                    <view class="qico">🧩</view>
                    <text class="qtxt">{{ $t('home.quickGroup') }}</text>
                </view>
                <view class="qk" @tap="goRandom">
                    <view class="qico">🎲</view>
                    <text class="qtxt">{{ $t('home.quickRandom') }}</text>
                </view>
                <view class="qk" @tap="showNotice">
                    <view class="qico">📣</view>
                    <text class="qtxt">{{ $t('home.notice') }}</text>
                </view>
                <view class="qk" @tap="goCouponCentre">
                    <view class="qico">🎟️<text class="qk-badge" v-if="unusedCouponCount > 0">{{ unusedCouponCount > 99 ? '99+' : unusedCouponCount }}</text></view>
                    <text class="qtxt">{{ $t('home.couponCentre') }}</text>
                </view>
                <view class="qk" @tap="goCircle">
                    <view class="qico">📸</view>
                    <text class="qtxt">{{ $t('home.circle') }}</text>
                </view>
                <view class="qk" v-if="jianghuEntry" @tap="goJianghu">
                    <view class="qico">🗡️</view>
                    <text class="qtxt">江湖</text>
                </view>
            </view>
            <!-- 运营位：图标宫格（后台 IconGrid 优先，未配置时回落到内置活动宫格） -->
            <view v-if="cmsIcons.length" class="cms-grid">
                <view v-for="(it, i) in cmsIcons" :key="i" class="cms-grid__item" @tap="openCmsLink(it.link)">
                    <image v-if="isIconImage(it.icon)" class="cms-grid__img" :src="it.icon" mode="aspectFit" />
                    <text v-else class="cms-grid__ico">{{ it.icon || '✨' }}</text>
                    <text class="cms-grid__txt">{{ it.label || '' }}</text>
                </view>
            </view>
            <!-- 营销活动入口：秒杀 / 拼团 / 整点抢券 / 积分抽奖 -->
            <view class="acts" v-if="!cmsIcons.length">
                <view class="act" @tap="goFlashSale">
                    <view class="act-ico act-ico--flash">⚡</view>
                    <text class="act-txt">{{ $t('home.actFlash') }}</text>
                </view>
                <view class="act" @tap="goGroupBuy">
                    <view class="act-ico act-ico--group">👥</view>
                    <text class="act-txt">{{ $t('home.actGroup') }}</text>
                </view>
                <view class="act" @tap="goCouponFlash">
                    <view class="act-ico act-ico--cf">🎟️</view>
                    <text class="act-txt">{{ $t('home.actCouponFlash') }}</text>
                </view>
                <view class="act" @tap="goLottery">
                    <view class="act-ico act-ico--lottery">🎰</view>
                    <text class="act-txt">{{ $t('home.actLottery') }}</text>
                </view>
                <view class="act" @tap="goPreSale">
                    <view class="act-ico act-ico--presale">📦</view>
                    <text class="act-txt">{{ $t('home.actPreSale') }}</text>
                </view>
                <view class="act" @tap="goLive">
                    <view class="act-ico act-ico--live">📺</view>
                    <text class="act-txt">{{ $t('home.actLive') }}</text>
                </view>
            </view>
            <!-- 时段推荐：按当前时间（早餐/午餐/下午茶/晚餐/夜宵）推荐应景店铺 -->
            <view v-if="!keyword && !showSearchPanel && mealPicks.length" class="recent meal">
                <view class="sec">
                    <text class="sec-t">{{ $t('home.mealTitle').replace('{s}', mealSlotLabel) }}</text>
                    <text v-if="mealFilterable" class="sec-more" @tap="showMealAll">{{ $t('home.mealMore') }} ›</text>
                </view>
                <scroll-view scroll-x class="recent-row">
                    <view v-for="s in mealPicks" :key="'meal-' + s.channelId" class="recent-card" @tap="enterStore(s)">
                        <image v-if="s.logo" class="recent-logo" :src="s.logo" mode="aspectFill" />
                        <view v-else class="recent-logo recent-logo--text">{{ (s.name || '?').slice(0, 1) }}</view>
                        <text class="recent-name">{{ s.name }}</text>
                        <text class="recent-meta">{{ s.promoText || deliveryTag(s) || routeText(s.routesEnabled) }}</text>
                    </view>
                </scroll-view>
            </view>
            <!-- 搜索面板：聚焦且关键词为空时展示（历史 + 热搜），不发请求 -->
            <view v-if="showSearchPanel" class="search-panel">
                <view v-if="searchHistory.length" class="sp-group">
                    <view class="sp-head">
                        <text class="sp-title">{{ $t('home.searchHistory') }}</text>
                        <text class="sp-clear" @tap.stop="clearHistory">{{ $t('home.clearHistory') }}</text>
                    </view>
                    <view class="sp-chips">
                        <view v-for="h in searchHistory" :key="'h-' + h" class="sp-chip" @tap="pickWord(h)">{{ h }}</view>
                    </view>
                </view>
                <view v-if="hotWords.length" class="sp-group">
                    <view class="sp-head"><text class="sp-title">{{ $t('home.hotSearch') }}</text></view>
                    <view class="sp-chips">
                        <view v-for="w in hotWords" :key="'w-' + w" class="sp-chip sp-chip--hot" @tap="pickWord(w)">🔥 {{ w }}</view>
                    </view>
                </view>
                <view v-if="!searchHistory.length && !hotWords.length" class="sp-tip">{{ $t('home.emptySearch') }}</view>
            </view>
            <!-- 搜索联想：聚焦且有输入时展示（与历史/热搜面板互斥），纯本地推导不发请求 -->
            <scroll-view v-if="showSuggest" scroll-y class="search-panel suggest-panel">
                <view v-if="storeSuggestions.length" class="sp-group">
                    <view class="sp-head"><text class="sp-title">{{ $t('home.suggestStores') }}</text></view>
                    <view class="sg-list">
                        <view v-for="it in storeSuggestions" :key="'sg-' + it.store.channelId" class="sg-row" @tap="pickWord(it.store.name)">
                            <text class="sg-ico">🏪</text>
                            <text class="sg-name">{{ it.store.name }}</text>
                            <text v-if="it.meta" class="sg-meta">{{ it.meta }}</text>
                            <text class="sg-chev">›</text>
                        </view>
                    </view>
                </view>
                <view v-if="historySuggestions.length" class="sp-group">
                    <view class="sp-head"><text class="sp-title">{{ $t('home.suggestHistory') }}</text></view>
                    <view class="sg-list">
                        <view v-for="h in historySuggestions" :key="'sh-' + h" class="sg-row" @tap="pickWord(h)">
                            <text class="sg-ico">🕘</text>
                            <text class="sg-name">{{ h }}</text>
                        </view>
                    </view>
                </view>
                <view v-if="hotSuggestions.length" class="sp-group">
                    <view class="sp-head"><text class="sp-title">{{ $t('home.suggestHot') }}</text></view>
                    <view class="sg-list">
                        <view v-for="w in hotSuggestions" :key="'sw-' + w" class="sg-row" @tap="pickWord(w)">
                            <text class="sg-ico">🔥</text>
                            <text class="sg-name">{{ w }}</text>
                        </view>
                    </view>
                </view>
            </scroll-view>
            <template v-if="!showSearchPanel">
            <scroll-view scroll-x class="pills" v-if="!keyword">
                <view
                    v-for="t in tagList" :key="t"
                    class="pill" :class="{ on: t === activeTag }"
                    @tap="activeTag = t"
                ><text class="pico">{{ tagIcon(t) }}</text>{{ tagLabel(t) }}</view>
            </scroll-view>
            <scroll-view scroll-x class="sortbar" v-if="!keyword">
                <view class="sort-chip" :class="{ on: sortBy === 'default' }" @tap="sortBy = 'default'">{{ $t('home.sortDefault') }}</view>
                <view class="sort-chip" :class="{ on: sortBy === 'fastest' }" @tap="sortBy = 'fastest'">{{ $t('home.sortFastest') }}</view>
                <view class="sort-chip" :class="{ on: sortBy === 'minOrder' }" @tap="sortBy = 'minOrder'">{{ $t('home.sortMinOrder') }}</view>
                <view class="sort-chip" :class="{ on: sortBy === 'freeDelivery' }" @tap="sortBy = 'freeDelivery'">{{ $t('home.sortFreeDelivery') }}</view>
                <view class="sort-chip sort-chip--filter" :class="{ on: filterCount > 0 }" @tap="filterOpen = true">
                    ⚙ {{ $t('home.filterBtn') }}<text v-if="filterCount"> · {{ filterCount }}</text>
                </view>
            </scroll-view>
            <view v-if="promoStore" class="notice" @tap="enterStore(promoStore)">
                <text class="ntext">🔥 {{ promoStore.name }} · {{ promoStore.promoText }}</text>
                <text class="nmore">›</text>
            </view>
            <!-- 临期券提示：未使用券中 3 天内到期数量（与角标同一份 myCoupons 数据） -->
            <view v-if="expiringCouponCount > 0" class="coupon-expiring" @tap="goMyCoupons">
                <text class="ce-ico">⏰</text>
                <text class="ce-text">{{ $t('home.couponExpiring').replace('{n}', String(expiringCouponCount)) }}</text>
                <text class="ce-more">›</text>
            </view>
            <!-- 常买店铺：本地最近进店记录（无关键词时展示，失效店铺自动隐藏） -->
            <view v-if="recentStores.length" class="recent">
                <view class="sec"><text class="sec-t">{{ $t('home.recentTitle') }}</text></view>
                <scroll-view scroll-x class="recent-row">
                    <view v-for="s in recentStores" :key="'recent-' + s.channelId" class="recent-card" @tap="enterStore(s)">
                        <image v-if="s.logo" class="recent-logo" :src="s.logo" mode="aspectFill" />
                        <view v-else class="recent-logo recent-logo--text">{{ s.name.slice(0, 1) }}</view>
                        <text class="recent-name">{{ s.name }}</text>
                        <text class="recent-meta">{{ deliveryTag(s) || routeText(s.routesEnabled) }}</text>
                    </view>
                </scroll-view>
            </view>
            <!-- 收藏商品：收藏的 variant 按店铺进店定位（本地元数据，登录后远端同步） -->
            <view v-if="favoriteProducts.length" class="recent">
                <view class="sec"><text class="sec-t">{{ $t('home.favoriteProducts') }}</text></view>
                <scroll-view scroll-x class="recent-row">
                    <view v-for="p in favoriteProducts" :key="'favp-' + p.variantId" class="item-card" @tap="openFavoriteProduct(p)">
                        <image v-if="p.image" class="item-img" :src="p.image" mode="aspectFill" />
                        <view v-else class="item-img item-img--text">{{ (p.name || '?').slice(0, 1) }}</view>
                        <text class="item-name">{{ p.name || $t('home.itemPlaceholder') }}</text>
                        <text class="item-price" v-if="p.price != null">¥{{ fenText(p.price) }}</text>
                        <text class="item-store">{{ p.storeName || '' }}</text>
                    </view>
                </scroll-view>
            </view>
            <!-- 常买商品：下单成功后记录，点一下进店并自动加购 -->
            <view v-if="recentProducts.length" class="recent">
                <view class="sec"><text class="sec-t">{{ $t('home.recentProducts') }}</text></view>
                <scroll-view scroll-x class="recent-row">
                    <view v-for="it in recentProducts" :key="'item-' + it.variantId" class="item-card" @tap="openRecentProduct(it)">
                        <image v-if="it.image" class="item-img" :src="it.image" mode="aspectFill" />
                        <view v-else class="item-img item-img--text">{{ it.name.slice(0, 1) }}</view>
                        <text class="item-name">{{ it.name }}</text>
                        <text class="item-price">¥{{ fenText(it.price) }}</text>
                        <text class="item-store">{{ it.storeName || '' }}</text>
                    </view>
                </scroll-view>
            </view>
            <!-- 猜你喜欢：足迹+常买+店铺月售打分的个性化推荐（与常买/收藏去重） -->
            <view v-if="guessProducts.length" class="recent">
                <view class="sec"><text class="sec-t">{{ $t('home.guessTitle') }}</text></view>
                <scroll-view scroll-x class="recent-row">
                    <view v-for="p in guessProducts" :key="'guess-' + p.key" class="item-card" @tap="openGuessProduct(p)">
                        <image v-if="p.image" class="item-img" :src="p.image" mode="aspectFill" />
                        <view v-else class="item-img item-img--text">{{ p.name.slice(0, 1) }}</view>
                        <text class="item-name">{{ p.name }}</text>
                        <text class="item-price" v-if="p.price">¥{{ fenText(p.price) }}</text>
                        <text class="item-store">{{ p.storeName || '' }}</text>
                    </view>
                </scroll-view>
            </view>
            <!-- 热销榜：全平台月售 Top8 店铺常驻横滑（前三名排名角标），有搜索词时隐藏让位结果 -->
            <view v-if="!searchKeyword && hotSaleStores.length" class="recent">
                <view class="sec"><text class="sec-t">{{ $t('home.hotSaleTitle') }}</text></view>
                <scroll-view scroll-x class="recent-row">
                    <view v-for="(s, hi) in hotSaleStores" :key="'hs-' + s.channelId" class="recent-card recent-card--rank" @tap="enterStore(s)">
                        <view v-if="hi < 3" class="rank-badge" :class="'rank-' + (hi + 1)">{{ hi + 1 }}</view>
                        <image v-if="s.logo" class="recent-logo" :src="s.logo" mode="aspectFill" />
                        <view v-else class="recent-logo recent-logo--text">{{ s.name.slice(0, 1) }}</view>
                        <text class="recent-name">{{ s.name }}</text>
                        <text class="recent-meta">{{ $t('home.monthlySales').replace('{n}', String(s.monthlySales)) }}</text>
                    </view>
                </scroll-view>
            </view>
            <!-- 跨店商品搜索结果（仅在提交搜索后展示） -->
            <view v-if="searchKeyword && searching" class="sp-loading">{{ $t('home.searchLoading') }}</view>
            <template v-if="searchKeyword && searchProductHits.length">
                <view class="sec">
                    <text class="sec-t">{{ $t('home.searchProducts') }}</text>
                    <text class="sec-n">{{ searchProductHits.length }}</text>
                </view>
                <view class="phits">
                    <view v-for="hit in searchProductHits" :key="'hit-' + hit.store.channelId + '-' + hit.product.id" class="phit" @tap="openProductHit(hit)">
                        <image v-if="hit.product.featuredAsset?.preview" class="phit-img" :src="hit.product.featuredAsset.preview" mode="aspectFill" />
                        <view v-else class="phit-img phit-img--text">{{ hit.product.name.slice(0, 1) }}</view>
                        <view class="phit-info">
                            <text class="phit-name">{{ hit.product.name }}</text>
                            <text class="phit-store">{{ hit.store.name }}</text>
                        </view>
                        <text class="phit-price" v-if="hit.variant">¥{{ fenText(hit.variant.priceWithTax) }}</text>
                    </view>
                </view>
            </template>
            <!-- 无结果兜底：纠错近似词 / 换品类 / 猜你想吃 / 热门店铺，点击直达 -->
            <template v-if="searchNoResult">
                <view class="empty-search">
                    <text class="empty-search__ico">🍽️</text>
                    <text class="empty-search__t">{{ $t('home.searchNoResult').replace('{kw}', searchKeyword) }}</text>
                    <text class="empty-search__s">{{ $t('home.searchNoResultHint') }}</text>
                </view>
                <view v-if="fixWords.length" class="sec-block">
                    <view class="sec-block__head">
                        <text class="sec-t">{{ $t('home.searchMaybe') }}</text>
                        <text class="sec-badge">{{ $t('home.searchAutoFix') }}</text>
                    </view>
                    <view class="chips">
                        <text v-for="w in fixWords" :key="'fix-' + w" class="chip chip--fix" @tap="pickWord(w)">{{ w }}</text>
                    </view>
                </view>
                <view v-if="fallbackCats.length" class="sec-block">
                    <view class="sec-block__head"><text class="sec-t">{{ $t('home.searchOtherCat') }}</text></view>
                    <view class="chips">
                        <text v-for="c in fallbackCats" :key="'cat-' + c" class="chip" @tap="pickWord(c)">{{ c }}</text>
                    </view>
                </view>
                <view v-if="searchGuessProducts.length" class="recent">
                    <view class="sec"><text class="sec-t">{{ $t('home.searchGuess') }}</text></view>
                    <scroll-view scroll-x class="recent-row">
                        <view v-for="p in searchGuessProducts" :key="'sg-' + p.key" class="item-card" @tap="openGuessProduct(p)">
                            <image v-if="p.image" class="item-img" :src="p.image" mode="aspectFill" />
                            <view v-else class="item-img item-img--text">{{ p.name.slice(0, 1) }}</view>
                            <text class="item-name">{{ p.name }}</text>
                            <text class="item-price" v-if="p.price">¥{{ fenText(p.price) }}</text>
                            <text class="item-store">{{ p.storeName || '' }}</text>
                        </view>
                    </scroll-view>
                </view>
                <view v-if="hotStores.length" class="recent">
                    <view class="sec"><text class="sec-t">{{ $t('home.hotStores') }}</text></view>
                    <scroll-view scroll-x class="recent-row">
                        <view v-for="s in hotStores" :key="'hot-' + s.channelId" class="recent-card" @tap="enterStore(s)">
                            <image v-if="s.logo" class="recent-logo" :src="s.logo" mode="aspectFill" />
                            <view v-else class="recent-logo recent-logo--text">{{ s.name.slice(0, 1) }}</view>
                            <text class="recent-name">{{ s.name }}</text>
                            <text class="recent-meta">{{ $t('home.monthlySales').replace('{n}', String(s.monthlySales)) }}</text>
                        </view>
                    </scroll-view>
                </view>
            </template>
            <LoadingSkeleton v-if="loading" />
            <template v-else>
                <view class="sec" v-if="shown.length">
                    <text class="sec-t">{{ secTitle }}</text>
                    <text class="sec-n">{{ $t('home.nearbyCount').replace('{n}', String(shown.length)) }}</text>
                </view>
                <EmptyState v-if="!shown.length && !searchNoResult && !(searchKeyword && (searching || searchProductHits.length || hotStores.length))" :text="emptyText" />
                <view v-else class="cards">
                    <view v-for="s in shown" :key="s.channelId" class="card" @tap="enterStore(s)">
                        <image v-if="s.logo" class="logo" :src="s.logo" mode="aspectFill" />
                        <view v-else class="logo logo-text">{{ s.name.slice(0, 1) }}</view>
                        <view class="info">
                            <view class="name-row">
                                <text class="name">{{ s.name }}</text>
                                <text v-if="s.paused" class="paused">{{ $t('home.paused') }}</text>
                                <text v-else-if="storeStatusOf(s) === 'closed'" class="paused paused--closed">{{ $t('home.storeClosed') }}</text>
                                <text v-else-if="storeStatusOf(s) === 'closing'" class="paused paused--closing">{{ $t('home.storeClosing') }}</text>
                            </view>
                            <text class="meta">{{ $t('home.monthlySales').replace('{n}', String(s.monthlySales)) }}</text>
                            <view class="tags">
                                <text class="tag tag-route">{{ deliveryTag(s) || routeText(s.routesEnabled) }}</text>
                                <text v-if="s.promoText" class="tag tag-promo">{{ s.promoText }}</text>
                                <text v-if="isFreeDelivery(s)" class="tag tag-free">{{ $t('home.freeDeliveryTag') }}</text>
                                <text v-if="!s.paused && storeStatusOf(s) === 'closed'" class="tag tag-watch" :class="{ on: watched(s) }" @tap.stop="toggleWatch(s)">
                                    {{ watched(s) ? $t('openWatch.watched') : '🔔 ' + $t('openWatch.watch') }}
                                </text>
                            </view>
                        </view>
                        <view class="fav" :class="{ on: favorites.isFavorite(s.channelId) }" @tap.stop="toggleFav(s)">
                            <text>{{ favorites.isFavorite(s.channelId) ? '♥' : '♡' }}</text>
                        </view>
                        <text class="chev">›</text>
                    </view>
                </view>
            </template>
            </template>
        </view>
        <!-- 筛选弹层：即时生效，点「完成」关闭 -->
        <view v-if="filterOpen" class="filter-mask" @tap.self="filterOpen = false">
            <view class="filter-sheet">
                <view class="fs-head">
                    <text class="fs-title">{{ $t('home.filterTitle') }}</text>
                    <text class="fs-close" @tap="filterOpen = false">✕</text>
                </view>
                <view class="fs-group">
                    <text class="fs-label">{{ $t('home.filterCommon') }}</text>
                    <view class="fs-chips">
                        <view class="fs-chip" :class="{ on: filters.openOnly }" @tap="filters.openOnly = !filters.openOnly">{{ $t('home.filterOpenOnly') }}</view>
                        <view class="fs-chip" :class="{ on: filters.freeDelivery }" @tap="filters.freeDelivery = !filters.freeDelivery">{{ $t('home.filterFreeDelivery') }}</view>
                        <view class="fs-chip" :class="{ on: filters.hasPromo }" @tap="filters.hasPromo = !filters.hasPromo">{{ $t('home.filterPromo') }}</view>
                    </view>
                </view>
                <view class="fs-group">
                    <text class="fs-label">{{ $t('home.filterMinOrderLabel') }}</text>
                    <view class="fs-chips">
                        <view class="fs-chip" :class="{ on: filters.minOrderMax == null }" @tap="filters.minOrderMax = null">{{ $t('home.filterMinOrderAny') }}</view>
                        <view v-for="v in MIN_ORDER_OPTIONS" :key="v" class="fs-chip" :class="{ on: filters.minOrderMax === v }" @tap="filters.minOrderMax = v">≤ ¥{{ v }}</view>
                    </view>
                </view>
                <view class="fs-actions">
                    <view class="fs-reset" @tap="resetFilters">{{ $t('home.filterReset') }}</view>
                    <view class="fs-apply" @tap="filterOpen = false">{{ $t('home.filterApply') }}</view>
                </view>
            </view>
        </view>
        <!-- 配送楼栋快捷切换（数据源：结算页缓存的 zones/buildings，缺省回退渠道接口） -->
        <view v-if="targetOpen" class="target-mask" @tap.self="targetOpen = false">
            <view class="target-sheet">
                <view class="fs-head">
                    <text class="fs-title">{{ $t('home.targetTitle') }}</text>
                    <text class="fs-close" @tap="targetOpen = false">✕</text>
                </view>
                <view v-if="targetLoading" class="sp-tip">{{ $t('home.searchLoading') }}</view>
                <template v-else>
                    <view class="fs-group" v-if="targetZones.length">
                        <text class="fs-label">{{ $t('checkout.pickZone') }}</text>
                        <view class="fs-chips">
                            <view v-for="z in targetZones" :key="'tz-' + z.id" class="fs-chip" :class="{ on: String(targetZoneId) === String(z.id) }" @tap="pickTargetZone(z.id)">{{ z.name }}</view>
                        </view>
                    </view>
                    <view class="fs-group" v-if="targetBuildings.length">
                        <text class="fs-label">{{ $t('checkout.pickBuilding') }}</text>
                        <view class="fs-chips">
                            <view v-for="b in targetBuildings" :key="'tb-' + b.id" class="fs-chip" :class="{ on: String(targetBuildingId) === String(b.id) }" @tap="targetBuildingId = String(b.id)">{{ b.name }}</view>
                        </view>
                    </view>
                    <view v-if="!targetZones.length" class="sp-tip">{{ $t('home.noTargetOptions') }}</view>
                    <view class="fs-actions">
                        <view class="fs-apply" @tap="saveTarget">{{ $t('home.saveTarget') }}</view>
                    </view>
                </template>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { fetchStoreList, fetchProductListForChannel } from '../../api/queries/waimai';
import { fetchZones, fetchBuildings } from '../../api/mutations/campus';
import { getMyCoupons } from '../../api/queries/coupon';
import { getPublishedContent, type ContentItemPublic } from '../../api/queries/operations';
import { readSearchHistory, pushSearchHistory, clearSearchHistory, buildHotWords, matchesProduct, similarKeywords, fallbackCategories, cleanKeyword } from '../../utils/search';
import { filterStores, applyStoreFilters, sortStores, type StoreSort, type StoreFilterOptions } from '../../utils/store-filter';
import { storeDisplayName, routeText, deliveryTag } from '../../utils/store-display';
import { getStoreStatus, type StoreOpenState } from '../../utils/store-status';
import { isWatched, watchStore, unwatchStore, openedWatched, type OpenedStore } from '../../utils/open-watch';
import { currentMealSlot, recommendStores } from '../../utils/time-slot';
import { readFootprint } from '../../utils/footprint';
import { theme, initTheme, toggleTheme } from '../../utils/theme';
import { useLocaleStore } from '../../stores/locale';
import { useFavoritesStore } from '../../stores/favorites';
import { useAuthStore } from '../../stores/auth';
import { useMessagesStore } from '../../stores/messages';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
import EmptyState from '../../components/EmptyState.vue';

const TAGS = ['全部', '米饭快餐', '奶茶甜品', '面食', '夜宵'];
const TAG_ICONS: Record<string, string> = { 全部: '🍽️', 米饭快餐: '🍚', 奶茶甜品: '🧋', 面食: '🍜', 夜宵: '🌙' };
const MIN_ORDER_OPTIONS = [15, 20, 30];
const locale = useLocaleStore();
const favorites = useFavoritesStore();
const authStore = useAuthStore();
const messages = useMessagesStore();
const unusedCouponCount = ref(0);
const expiringCouponCount = ref(0);
const keyword = ref('');
const activeTag = ref('全部');
const loading = ref(true);
const stores = ref<any[]>([]);
const sortBy = ref<StoreSort>('default');
const filterOpen = ref(false);
const filters = ref<StoreFilterOptions>({});

// ── 搜索：焦点面板（历史/热搜）+ 提交后跨店商品搜索 ──
const searchFocused = ref(false);
const searchHistory = ref<string[]>(readSearchHistory());
const searchKeyword = ref('');
const searching = ref(false);
const searchProductHits = ref<Array<{ store: any; product: any; variant: any }>>([]);
const showSearchPanel = computed(() => searchFocused.value && !keyword.value.trim());
const hotWords = computed(() => buildHotWords(stores.value, 6));
/** 联想关键词（小写）；空则无面板 */
const suggestKey = computed(() => keyword.value.trim().toLowerCase());
/** 店铺联想：店名 / tags 包含关键词，最多 4 条 */
const storeSuggestions = computed(() => {
    const kw = suggestKey.value;
    if (!kw) return [] as Array<{ store: any; meta: string }>;
    return stores.value
        .filter((s: any) =>
            String(s.name ?? '').toLowerCase().includes(kw) ||
            (s.tags ?? []).some((t: any) => String(t).toLowerCase().includes(kw)))
        .slice(0, 4)
        .map((s: any) => {
            const sales = s.monthlySales != null ? locale.t('home.monthlySales').replace('{n}', String(s.monthlySales)) : '';
            const meta = [sales, deliveryTag(s) || ''].filter(Boolean).join(' · ');
            return { store: s, meta };
        });
});
/** 历史联想：历史记录包含关键词，最多 3 条 */
const historySuggestions = computed(() => {
    const kw = suggestKey.value;
    if (!kw) return [] as string[];
    return searchHistory.value.filter(h => String(h).toLowerCase().includes(kw)).slice(0, 3);
});
/** 热搜联想：热词包含关键词（去掉已在历史组出现的），最多 3 条 */
const hotSuggestions = computed(() => {
    const kw = suggestKey.value;
    if (!kw) return [] as string[];
    return hotWords.value
        .filter(w => String(w).toLowerCase().includes(kw) && !historySuggestions.value.includes(w))
        .slice(0, 3);
});
/** 有任意联想才显示面板，避免空白浮层 */
const showSuggest = computed(() => searchFocused.value && !!suggestKey.value &&
    (storeSuggestions.value.length + historySuggestions.value.length + hotSuggestions.value.length > 0));
/** 无结果兜底：热销店铺（月售降序前 4，含休息中的店，点进去有休息提示） */
const hotStores = computed(() => [...stores.value].sort((a: any, b: any) => (b.monthlySales || 0) - (a.monthlySales || 0)).slice(0, 4));
// ── 热销榜：全平台月售 Top8 店铺常驻区块（v15，与搜索无结果兜底 hotStores 并存） ──
const hotSaleStores = computed(() =>
    stores.value
        .filter((s: any) => (Number(s.monthlySales) || 0) > 0)
        .sort((a: any, b: any) => (b.monthlySales || 0) - (a.monthlySales || 0))
        .slice(0, 8),
);
let blurTimer: any = null;

function onSearchFocus() {
    if (blurTimer) clearTimeout(blurTimer);
    searchFocused.value = true;
}
/** 延迟收起：让面板里的点击先命中，避免 blur 先关面板 */
function onSearchBlur() {
    blurTimer = setTimeout(() => { searchFocused.value = false; }, 200);
}
function onKeywordInput(e: any) {
    const val = String(e?.detail?.value ?? '').trim();
    if (!val) {
        searchKeyword.value = '';
        searchProductHits.value = [];
    }
}
function pickWord(w: string) {
    keyword.value = w;
    submitSearch(w);
}
function clearHistory() {
    clearSearchHistory();
    searchHistory.value = [];
}

/** 搜索无结果：已提交搜索、非加载中、店铺与商品都没命中 */
const searchNoResult = computed(() =>
    !!searchKeyword.value && !searching.value && !shown.value.length && !searchProductHits.value.length,
);
/** 纠错词库：店铺标签 + 店名 + 已搜到的商品名，供同词根近似推荐 */
const searchVocab = computed(() => {
    const vocab: string[] = [];
    for (const s of stores.value ?? []) {
        for (const t of s.tags ?? []) vocab.push(String(t));
        vocab.push(String(s.name || ''));
    }
    for (const p of favorites.recentItems ?? []) vocab.push(String(p.name || ''));
    return vocab.filter(Boolean);
});
const fixWords = computed(() => (searchNoResult.value ? similarKeywords(searchKeyword.value, searchVocab.value, 4) : []));
const fallbackCats = computed(() => (searchNoResult.value ? fallbackCategories(stores.value, searchKeyword.value, 6) : []));

/** 提交搜索：写历史 → 店铺即时过滤（keyword）→ 跨店并发搜商品 */
async function submitSearch(raw: string) {
    const kw = cleanKeyword(raw);
    keyword.value = kw;
    searchFocused.value = false;
    if (!kw) return;
    searchHistory.value = pushSearchHistory(kw);
    searchKeyword.value = kw;
    searchProductHits.value = [];
    searching.value = true;
    try {
        const targets = stores.value.filter((s: any) => !s.paused && s.channelToken);
        const results = await Promise.allSettled(targets.map((s: any) =>
            fetchProductListForChannel(s.channelToken).then((list: any[]) => {
                const hits: Array<{ store: any; product: any; variant: any }> = [];
                for (const p of list) {
                    if (!matchesProduct(p, kw)) continue;
                    hits.push({ store: s, product: p, variant: p.variants?.[0] });
                    if (hits.length >= 6) break;
                }
                return hits;
            }),
        ));
        // 关键词在 await 期间被改掉：丢弃过期结果
        if (searchKeyword.value !== kw) return;
        const merged: Array<{ store: any; product: any; variant: any }> = [];
        for (const r of results) {
            if (r.status === 'fulfilled') merged.push(...r.value);
            if (merged.length >= 24) break;
        }
        searchProductHits.value = merged.slice(0, 24);
    } finally {
        searching.value = false;
    }
}

/** 分 → 元字符串（整数不带小数） */
function fenText(fen?: number | null): string {
    const v = Math.max(0, Number(fen) || 0) / 100;
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function openProductHit(hit: { store: any; product: any }) {
    const s = hit.store;
    const cid = s.channelId != null ? `&cid=${s.channelId}` : '';
    const routes = (s.routesEnabled || []).join(',');
    uni.navigateTo({ url: `/pages/shop/menu?token=${s.channelToken}&name=${encodeURIComponent(s.name)}&routes=${encodeURIComponent(routes)}${cid}&q=${encodeURIComponent(hit.product.name)}` });
}

/** 收藏商品：补齐渠道后带 q 进店定位；缺 token 时静默忽略（关机/下线店） */
const favoriteProducts = computed(() => favorites.variantItems.filter(v => !!v.name).slice(0, 8));
const recentProducts = computed(() => (keyword.value || searchKeyword.value ? [] : favorites.recentItems.slice(0, 8)));

function storeOfVariant(v: any): any {
    return stores.value.find((s: any) =>
        (v.channelToken && s.channelToken === v.channelToken) ||
        (v.channelId != null && String(s.channelId) === String(v.channelId)));
}

function openFavoriteProduct(p: any) {
    const s = storeOfVariant(p);
    const token = p.channelToken || s?.channelToken;
    if (!token) return uni.showToast({ title: locale.t('home.shopPaused'), icon: 'none' });
    const cidVal = p.channelId ?? s?.channelId;
    const cid = cidVal != null ? `&cid=${cidVal}` : '';
    const routes = (s?.routesEnabled || []).join(',');
    uni.navigateTo({ url: `/pages/shop/menu?token=${token}&name=${encodeURIComponent(s?.name || p.storeName || '')}&routes=${encodeURIComponent(routes)}${cid}&q=${encodeURIComponent(p.name || '')}` });
}

function openRecentProduct(it: any) {
    const s = storeOfVariant(it);
    const token = it.channelToken || s?.channelToken;
    if (!token) return uni.showToast({ title: locale.t('home.shopPaused'), icon: 'none' });
    const cidVal = it.channelId ?? s?.channelId;
    const cid = cidVal != null ? `&cid=${cidVal}` : '';
    const routes = (s?.routesEnabled || it.routes || '').toString();
    uni.navigateTo({ url: `/pages/shop/menu?token=${token}&name=${encodeURIComponent(s?.name || it.storeName || '')}&routes=${encodeURIComponent(routes)}${cid}&add=${it.variantId}` });
}

// ── 猜你喜欢：足迹 + 常买 + 店铺月售打分的个性化推荐（v14） ──
const guessTick = ref(0);
/** 打分池构建：excludeShown=false 时用于搜索无结果兜底（此时不受搜索词限制） */
function computeGuess(excludeShown: boolean): any[] {
    guessTick.value; // 依赖 onShow 自增，返回首页时重读足迹
    if (excludeShown && (keyword.value || searchKeyword.value)) return [] as any[];
    // 收藏/常买区已展示的 variant 不重复出现
    const favIds = new Set(favorites.variantItems.map(v => String(v.variantId)));
    const recentIds = new Set(favorites.recentItems.map(v => String(v.variantId)));
    const now = Date.now();
    const DAY = 24 * 3600 * 1000;
    const pool = new Map<string, any>();
    const add = (it: any, base: number) => {
        if (!it?.name) return;
        const vid = it.variantId != null ? String(it.variantId) : '';
        if (vid && (favIds.has(vid) || recentIds.has(vid))) return;
        const key = vid || String(it.productId ?? '') || String(it.name);
        const ageDays = Math.max(0, (now - (Number(it.at) || now)) / DAY);
        const decay = Math.exp(-ageDays / 3); // 近期衰减：3 天量级半衰
        const store = storeOfVariant(it);
        const hotBonus = (Number(store?.monthlySales) || 0) / 100; // 店铺热度加成（量级远小于基础权重）
        const score = base * decay + hotBonus;
        const prev = pool.get(key);
        if (prev) {
            prev.score += score;
            if (!prev.image && it.image) prev.image = it.image;
            if (!prev.price && it.price) prev.price = Number(it.price);
            return;
        }
        pool.set(key, {
            key,
            variantId: vid,
            productId: it.productId != null ? String(it.productId) : '',
            name: String(it.name),
            image: it.image ? String(it.image) : '',
            price: Number(it.price) || 0,
            storeName: it.storeName ? String(it.storeName) : '',
            channelToken: it.channelToken ? String(it.channelToken) : '',
            channelId: it.channelId != null ? String(it.channelId) : undefined,
            routes: it.routes ? String(it.routes) : '',
            score,
        });
    };
    for (const it of favorites.recentItems) add(it, 3);   // 常买权重高
    for (const it of readFootprint()) add(it, 1);          // 足迹权重次之
    return Array.from(pool.values()).sort((a, b) => b.score - a.score).slice(0, 8);
}
const guessProducts = computed(() => computeGuess(true));
/** 搜索无结果时的「猜你想吃」：忽略搜索词限制，兜底展示历史偏好 */
const searchGuessProducts = computed(() => (searchNoResult.value ? computeGuess(false) : []));

/** 猜你喜欢点击：有 variantId 直接进店自动加购，否则带关键词定位 */
function openGuessProduct(p: any) {
    const s = storeOfVariant(p);
    const token = p.channelToken || s?.channelToken;
    if (!token) return;
    const cidVal = p.channelId ?? s?.channelId;
    const cid = cidVal != null ? `&cid=${cidVal}` : '';
    const routes = (s?.routesEnabled || p.routes || '').toString();
    const pos = p.variantId ? `&add=${p.variantId}` : `&q=${encodeURIComponent(p.name)}`;
    uni.navigateTo({ url: `/pages/shop/menu?token=${token}&name=${encodeURIComponent(s?.name || p.storeName || '')}&routes=${encodeURIComponent(routes)}${cid}${pos}` });
}

// ── 当前配送楼栋（结算页保存）与快捷切换 ──
interface DeliveryTargetLocal { zoneId: string; zoneName: string; buildingId: string; buildingName: string; at?: number }
function readLocalJSON(key: string): any {
    try {
        const raw = uni.getStorageSync(key);
        if (!raw) return null;
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch { return null; }
}
const deliveryTarget = ref<DeliveryTargetLocal | null>(readLocalJSON('delivery_target'));
const targetOpen = ref(false);
const targetLoading = ref(false);
const targetZones = ref<any[]>([]);
const targetBuildings = ref<any[]>([]);
const targetZoneId = ref('');
const targetBuildingId = ref('');
let targetOptionsCache: { zones: any[]; buildings: any[] } = { zones: [], buildings: [] };

async function openTargetSheet() {
    targetOpen.value = true;
    const opts = readLocalJSON('delivery_target_options');
    targetOptionsCache = {
        zones: Array.isArray(opts?.zones) ? opts.zones : [],
        buildings: Array.isArray(opts?.buildings) ? opts.buildings : [],
    };
    if (targetOptionsCache.zones.length) {
        targetZones.value = targetOptionsCache.zones;
        await pickTargetZone(deliveryTarget.value?.zoneId || targetZones.value[0].id);
        return;
    }
    targetLoading.value = true;
    try {
        targetZones.value = await fetchZones();
        await pickTargetZone(deliveryTarget.value?.zoneId || targetZones.value[0]?.id);
    } catch {
        targetZones.value = [];
        targetBuildings.value = [];
    }
    targetLoading.value = false;
}

async function pickTargetZone(zoneId: string | number) {
    if (zoneId == null || zoneId === '') return;
    targetZoneId.value = String(zoneId);
    const local = targetOptionsCache.buildings.filter((b: any) => String(b.zoneId ?? '') === String(zoneId));
    if (local.length) {
        targetBuildings.value = local;
    } else {
        try {
            targetBuildings.value = await fetchBuildings(String(zoneId));
        } catch {
            targetBuildings.value = [];
        }
    }
    const prefer = deliveryTarget.value?.buildingId;
    targetBuildingId.value = targetBuildings.value.some((b: any) => String(b.id) === String(prefer))
        ? String(prefer)
        : String(targetBuildings.value[0]?.id ?? '');
}

function saveTarget() {
    const z = targetZones.value.find((x: any) => String(x.id) === targetZoneId.value);
    const b = targetBuildings.value.find((x: any) => String(x.id) === targetBuildingId.value);
    if (!z || !b) {
        uni.showToast({ title: locale.t('home.noTargetOptions'), icon: 'none' });
        return;
    }
    const target: DeliveryTargetLocal = {
        zoneId: String(z.id), zoneName: z.name, buildingId: String(b.id), buildingName: b.name, at: Date.now(),
    };
    uni.setStorageSync('delivery_target', JSON.stringify(target));
    deliveryTarget.value = target;
    targetOpen.value = false;
}

const tagList = computed(() => {
    // 店铺未配置 tag 时不出现空类目：固定类目里只保留有店铺的
    const used = new Set(stores.value.flatMap((s: any) => s.tags ?? []));
    return TAGS.filter(t => t === '全部' || used.has(t));
});
const filterCount = computed(() => [
    filters.value.openOnly, filters.value.freeDelivery, filters.value.hasPromo, filters.value.minOrderMax != null,
].filter(Boolean).length);
const shown = computed(() => sortStores(
    applyStoreFilters(filterStores(stores.value, keyword.value, activeTag.value), filters.value),
    sortBy.value,
    favorites.ids,
));
const emptyText = computed(() => filterCount.value ? locale.t('home.filteredEmpty') : locale.t('home.emptySearch'));
/** 店铺营业状态：按 businessHours 实时计算（未配置返回 unknown，不额外标注） */
function storeStatusOf(s: any): StoreOpenState {
    return getStoreStatus(s?.businessHours).state;
}
// ── 开门提醒：本机订阅打烊店铺，营业后首页横幅提示一次 ──
const watchTick = ref(0);
const openedList = computed<OpenedStore[]>(() => {
    watchTick.value;
    return openedWatched(stores.value);
});
function watched(s: any): boolean {
    watchTick.value;
    return isWatched(s?.channelToken || '');
}
function toggleWatch(s: any) {
    const token = String(s?.channelToken || '');
    if (!token) return;
    if (isWatched(token)) {
        unwatchStore(token);
        uni.showToast({ title: locale.t('openWatch.removed'), icon: 'none' });
    } else {
        watchStore({
            token,
            channelId: s?.channelId != null ? String(s.channelId) : undefined,
            name: s?.name || '',
            businessHours: s?.businessHours,
        });
        uni.showToast({ title: locale.t('openWatch.added'), icon: 'none' });
    }
    watchTick.value++;
}
function goOpened(o: OpenedStore) {
    if (!o) return;
    const cid = o.channelId ? `&cid=${o.channelId}` : '';
    uni.navigateTo({
        url: `/pages/shop/menu?token=${encodeURIComponent(o.token)}&name=${encodeURIComponent(o.name || '')}&routes=${encodeURIComponent(o.routes || '')}${cid}`,
    });
}
/** 关闭横幅：一次性提示，点过即取消关注对应店铺 */
function dismissOpen() {
    for (const o of openedList.value) unwatchStore(o.token);
    watchTick.value++;
}
/** 常买店铺：本地记录 → 匹配当前店铺列表（已下线/休息不隐藏，点进店有休息提示） */
const recentStores = computed(() => {
    if (keyword.value) return [] as any[];
    return favorites.recents
        .map((r: any) => {
            const hit = stores.value.find((s: any) =>
                (r.channelId && String(s.channelId) === String(r.channelId)) || s.channelToken === r.channelToken);
            return hit ? { ...hit, recentAt: r.at } : null;
        })
        .filter((s: any) => !!s)
        .slice(0, 6);
});
const secTitle = computed(() => {
    if (keyword.value) return locale.t('home.searchResult').replace('{kw}', keyword.value);
    return activeTag.value === '全部' ? locale.t('home.allStores') : tagLabel(activeTag.value);
});
const promoStore = computed(() => stores.value.find((s: any) => s.promoText && !s.paused));

// —— 时段推荐：每分钟刷新一次当前时段，按店铺标签/活动/月售/营业状态打分 ——
const nowTick = ref(Date.now());
let mealTimer: any = 0;
const mealSlot = computed(() => currentMealSlot(new Date(nowTick.value)));
const mealSlotLabel = computed(() => {
    const key = mealSlot.value.key;
    return locale.t(`home.meal${key.charAt(0).toUpperCase()}${key.slice(1)}`);
});
const mealPicks = computed(() => (keyword.value ? [] : recommendStores(stores.value, mealSlot.value, 4)));
const mealFilterable = computed(() => tagList.value.includes(mealSlot.value.filterTag));
/** 查看全部：切到该时段对应类目并滚到店铺列表 */
function showMealAll() {
    if (!mealFilterable.value) return;
    activeTag.value = mealSlot.value.filterTag;
    uni.pageScrollTo({ selector: '.cards', duration: 200 });
}
// 本地测试版入口：仅当 .env 配置 VITE_JIANGHU_ENTRY=true 时显示（prod 默认隐藏，避免产品级入口决策前置）
const jianghuEntry = String(import.meta.env.VITE_JIANGHU_ENTRY) === 'true';

function tagIcon(t: string): string {
    return TAG_ICONS[t] ?? '🍴';
}

function isFreeDelivery(s: any): boolean {
    return Number(s.deliveryFee) === 0;
}

function resetFilters() {
    filters.value = {};
}

async function toggleFav(s: any) {
    if (s.channelId == null) return;
    try {
        const on = await favorites.toggle(s.channelId);
        uni.showToast({ title: on ? locale.t('home.favAdded') : locale.t('home.favRemoved'), icon: 'none' });
    } catch {
        uni.showToast({ title: locale.t('home.favFail'), icon: 'none' });
    }
}

// 类目值为业务值（匹配店铺 tags），仅展示层翻译
function tagLabel(t: string): string {
    if (t === '全部') return locale.t('home.tagAll');
    if (t === '米饭快餐') return locale.t('home.tagRice');
    if (t === '奶茶甜品') return locale.t('home.tagTea');
    if (t === '面食') return locale.t('home.tagNoodle');
    if (t === '夜宵') return locale.t('home.tagNight');
    return t;
}

function goOrders() {
    uni.switchTab({ url: '/pages/orders/index' });
}
function goRider() {
    uni.navigateTo({ url: '/pkg-rider/pages/rider-join' });
}
function goErrand() { uni.navigateTo({ url: '/pkg-campus/errand/create' }); }
function goCouponCentre() { uni.navigateTo({ url: '/pkg-promotion/pages/coupon-centre' }); }
function goFlashSale() { uni.navigateTo({ url: '/pkg-promotion/pages/flash-sale' }); }
function goGroupBuy() { uni.navigateTo({ url: '/pkg-promotion/pages/group-buy' }); }
function goCouponFlash() { uni.navigateTo({ url: '/pkg-promotion/pages/coupon-flash' }); }
function goLottery() { uni.navigateTo({ url: '/pkg-user/pages/lottery' }); }
function goPreSale() { uni.navigateTo({ url: '/pkg-promotion/pages/pre-sale' }); }
function goLive() { uni.navigateTo({ url: '/pkg-promotion/pages/live-list' }); }
function goCircle() { uni.navigateTo({ url: '/pkg-user/pages/circle' }); }
function goMyCoupons() { uni.navigateTo({ url: '/pkg-promotion/pages/my-coupons' }); }
function goJianghu() { uni.navigateTo({ url: '/pkg-jianghu/pages/jh-hall' }); }
function goMessages() { uni.navigateTo({ url: '/pkg-user/pages/messages' }); }
function goCart() { uni.navigateTo({ url: '/pkg-order/pages/cart' }); }
function goGroup() { uni.navigateTo({ url: '/pkg-order/pages/group-order' }); }
function goRandom() { uni.navigateTo({ url: '/pkg-order/pages/random-pick' }); }

// ─── 运营位（operations-plugin publishedContent）──────────────────
// Banner / Notice / IconGrid 均为后台发布内容；未配置或接口异常时静默回落到内置入口。
const cmsBanners = ref<ContentItemPublic[]>([]);
const cmsNotices = ref<ContentItemPublic[]>([]);
const cmsGrids = ref<ContentItemPublic[]>([]);
const cmsIcons = computed<Array<{ icon?: string; label?: string; link?: string }>>(() => {
    const items = cmsGrids.value[0]?.data?.items;
    if (!Array.isArray(items)) return [];
    return items.filter((it: any) => it && (it.icon || it.label));
});

async function loadCms() {
    try {
        const [banners, notices, grids] = await Promise.all([
            getPublishedContent('Banner'),
            getPublishedContent('Notice'),
            getPublishedContent('IconGrid'),
        ]);
        cmsBanners.value = banners.filter(b => !!b.data?.imageUrl);
        cmsNotices.value = notices.filter(n => !!n.data?.content);
        cmsGrids.value = grids;
    } catch { /* 运营位异常不影响首页主体 */ }
}

function isIconImage(icon?: string) {
    return !!icon && /^(https?:\/\/|\/)/.test(icon);
}

function openCmsLink(link?: string) {
    const raw = String(link || '').trim();
    if (!raw) return;
    if (/^https?:\/\//.test(raw)) {
        uni.navigateTo({ url: '/pages/webview/index?url=' + encodeURIComponent(raw) });
        return;
    }
    let path = raw.replace(/^#/, '');
    if (!path.startsWith('/')) path = '/' + path;
    uni.navigateTo({ url: path, fail: () => uni.switchTab({ url: path }) });
}

function openNoticeItem() {
    const first = cmsNotices.value[0];
    if (!first) return;
    if (first.data?.link) { openCmsLink(first.data.link); return; }
    uni.showModal({
        title: first.data?.title || locale.t('home.notice'),
        content: String(first.data?.content || ''),
        showCancel: false,
        confirmText: locale.t('home.noticeOk'),
    });
}

/** 未使用券角标 + 临期券提示：同一次 myCoupons 返回计算两项；未登录不请求；失败静默置 0，不阻塞首页店铺加载 */
async function loadCouponBadge() {
    if (!authStore.isLoggedIn) { unusedCouponCount.value = 0; expiringCouponCount.value = 0; return; }
    try {
        const res = await getMyCoupons('UNUSED');
        const list: any[] = res?.myCoupons ?? [];
        unusedCouponCount.value = list.length;
        const now = Date.now();
        const deadline = now + 3 * 24 * 60 * 60 * 1000;
        expiringCouponCount.value = list.filter((c: any) => {
            if (!c?.expiredAt) return false;
            const t = typeof c.expiredAt === 'number' ? c.expiredAt : new Date(c.expiredAt).getTime();
            return Number.isFinite(t) && t >= now && t <= deadline;
        }).length;
    } catch { unusedCouponCount.value = 0; expiringCouponCount.value = 0; }
}
function showNotice() {
    uni.showModal({ title: locale.t('home.notice'), content: locale.t('home.noticeText'), showCancel: false, confirmText: locale.t('home.noticeOk') });
}

async function load() {
    loading.value = true;
    try {
        const list = await fetchStoreList();
        stores.value = list.map((s: any) => ({ ...s, name: storeDisplayName(s.name) }));
        // 远端商品收藏只存 id：用渠道商品列表回填名称/图/价（失败静默，不阻塞首页）
        void favorites.hydrateVariantMeta(stores.value);
    } finally { loading.value = false; }
}

function enterStore(s: any) {
    if (s.paused) return uni.showToast({ title: locale.t('home.shopPaused'), icon: 'none' });
    favorites.touchRecent({ channelId: s.channelId, channelToken: s.channelToken, name: s.name, routes: (s.routesEnabled || []).join(',') });
    const routes = (s.routesEnabled || []).join(',');
    const cid = s.channelId != null ? `&cid=${s.channelId}` : '';
    uni.navigateTo({ url: `/pages/shop/menu?token=${s.channelToken}&name=${encodeURIComponent(s.name)}&routes=${encodeURIComponent(routes)}${cid}` });
}

onMounted(() => {
    initTheme();
    void favorites.loadRemote();
    void loadCms();
    load();
    mealTimer = setInterval(() => { nowTick.value = Date.now(); }, 60000);
});
onUnmounted(() => {
    if (mealTimer) clearInterval(mealTimer);
    mealTimer = 0;
});
// 登录/退出后回到首页：同步云端收藏（登录时会把游客收藏补写到云端）；同时刷新结算页刚保存的楼栋
onShow(() => {
    nowTick.value = Date.now();
    guessTick.value++; // 重读浏览足迹（localStorage 非响应式，onShow 时刷新猜你喜欢）
    watchTick.value++; // 重算开门提醒（返回首页时可能已到开门时间）
    void favorites.loadRemote();
    void loadCouponBadge();
    void messages.load();
    deliveryTarget.value = readLocalJSON('delivery_target');
});
onPullDownRefresh(async () => { await load(); await favorites.loadRemote(); uni.stopPullDownRefresh(); });
</script>

<style scoped lang="scss">
/* ── 双主题 token（亮色默认，.dark 覆盖；头部保持品牌橙不换肤=方案A「橙头」） ── */
.page {
    --w-bg: #f5f5f5;
    --w-surface: #ffffff;
    --w-surface-muted: #f0f0f0;
    --w-text: #1a1a1a;
    --w-text-muted: #999999;
    --w-border: #ececec;
    --w-brand-soft: #fff3e6;
    --w-brand-text: #ff6600;
    --w-search-bg: #ffffff;
    --w-skel-from: #f0f0f0;
    --w-skel-to: #e0e0e0;

    background: var(--w-bg);
    min-height: 100vh;
    padding-bottom: 24rpx;
}
.page.dark {
    --w-bg: #161618;
    --w-surface: #242428;
    --w-surface-muted: #1e1e21;
    --w-text: #ececf0;
    --w-text-muted: #9a9aa3;
    --w-border: #35353a;
    --w-brand-soft: rgba(255, 102, 0, 0.16);
    --w-brand-text: #ff8a3d;
    --w-search-bg: #2a2a2f;
    --w-skel-from: #2a2a2f;
    --w-skel-to: #34343a;
}
.head { padding: 24rpx 24rpx 28rpx; background: $brand; }
.loc-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.loc { color: #fff; font-size: 28rpx; font-weight: 600; }
.head-right { display: flex; align-items: center; gap: 8rpx; }
.theme-btn { width: 56rpx; height: 56rpx; border-radius: 999rpx; background: rgba(255, 255, 255, 0.22); display: flex; align-items: center; justify-content: center; font-size: 28rpx; }
.bell-btn { position: relative; width: 56rpx; height: 56rpx; border-radius: 999rpx; background: rgba(255, 255, 255, 0.22); display: flex; align-items: center; justify-content: center; }
.bell-ico { font-size: 26rpx; line-height: 1; }
.bell-badge { position: absolute; top: -6rpx; right: -8rpx; min-width: 30rpx; height: 30rpx; line-height: 30rpx; padding: 0 6rpx; border-radius: 999rpx; background: #ff3b30; color: #fff; font-size: 18rpx; text-align: center; }
.hlink { color: #fff; font-size: 24rpx; opacity: .92; padding: 4rpx 0 4rpx 8rpx; }
.search { background: var(--w-search-bg); color: var(--w-text); border-radius: 999rpx; padding: 12rpx 24rpx; font-size: 26rpx; }
.search :deep(.uni-input-placeholder) { color: var(--w-text-muted); }
.body { padding: 0 24rpx; }
.quick { margin-top: 20rpx; background: var(--w-surface); border-radius: $radius-card; padding: 24rpx 8rpx 18rpx;
    display: grid; grid-template-columns: repeat(5, 1fr); row-gap: 22rpx; }
.qk { min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 8rpx; }
/* 运营位：公告条 / 轮播 Banner / 图标宫格（后台发布内容驱动） */
.cms-notice {
    display: flex; align-items: center; gap: 10rpx; margin-top: 20rpx;
    background: var(--w-surface); border-radius: $radius-card; padding: 18rpx 22rpx;
}
.cms-notice__ico { font-size: 28rpx; flex-shrink: 0; }
.cms-notice__txt {
    flex: 1; min-width: 0; font-size: 24rpx; color: var(--w-text);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cms-notice__more { font-size: 22rpx; color: var(--w-text-muted); flex-shrink: 0; }
.cms-banner { white-space: nowrap; margin-top: 20rpx; }
.cms-banner__item {
    position: relative; display: inline-block; width: 640rpx; height: 240rpx; margin-right: 16rpx;
    border-radius: $radius-card; overflow: hidden; background: var(--w-surface);
}
.cms-banner__img { width: 100%; height: 100%; }
.cms-banner__mask {
    position: absolute; left: 0; right: 0; bottom: 0; padding: 18rpx 22rpx;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.55) 100%);
    display: flex; flex-direction: column; gap: 4rpx; white-space: normal;
}
.cms-banner__title { font-size: 28rpx; font-weight: 700; color: #fff; }
.cms-banner__sub { font-size: 22rpx; color: rgba(255, 255, 255, 0.85); }
.cms-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 16rpx 8rpx;
    margin-top: 16rpx; background: var(--w-surface); border-radius: $radius-card; padding: 24rpx 12rpx;
}
.cms-grid__item { display: flex; flex-direction: column; align-items: center; gap: 10rpx; }
.cms-grid__ico { width: 76rpx; height: 76rpx; border-radius: 24rpx; background: var(--w-brand-soft); display: flex; align-items: center; justify-content: center; font-size: 34rpx; }
.cms-grid__img { width: 76rpx; height: 76rpx; border-radius: 24rpx; }
.cms-grid__txt { font-size: 22rpx; color: var(--w-text); text-align: center; }
.qk { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 8rpx; }
.qico { position: relative; flex-shrink: 0; width: 76rpx; height: 76rpx; border-radius: 999rpx; background: var(--w-brand-soft); display: flex; align-items: center; justify-content: center; font-size: 38rpx; }
.qtxt { max-width: 100%; font-size: 22rpx; color: var(--w-text); text-align: center; }
.qk-badge { position: absolute; top: -8rpx; right: -12rpx; min-width: 32rpx; height: 32rpx; line-height: 32rpx; padding: 0 6rpx; border-radius: 16rpx; background: #ff4d4f; color: #fff; font-size: 20rpx; font-weight: 600; text-align: center; }
.acts { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8rpx; margin-top: 16rpx; background: var(--w-surface); border-radius: $radius-card; padding: 22rpx 8rpx; }
.act { display: flex; flex-direction: column; align-items: center; gap: 10rpx; }
.act-ico { width: 68rpx; height: 68rpx; border-radius: 24rpx; display: flex; align-items: center; justify-content: center; font-size: 32rpx; color: #fff; }
.act-ico--flash { background: linear-gradient(135deg, #ff4d2e, #ff8a3d); }
.act-ico--group { background: linear-gradient(135deg, #7b4dff, #b06bff); }
.act-ico--cf { background: linear-gradient(135deg, #ff8a00, #ff5f6d); }
.act-ico--lottery { background: linear-gradient(135deg, #ffb300, #ff7a00); }
.act-ico--presale { background: linear-gradient(135deg, #5b6ef5, #8f6cf0); }
.act-ico--live { background: linear-gradient(135deg, #e0397a, #f0634c); }
.act-txt { font-size: 22rpx; color: var(--w-text); text-align: center; }
.pills { white-space: nowrap; padding: 20rpx 0 4rpx; }
.pill { display: inline-flex; align-items: center; gap: 6rpx; padding: 10rpx 24rpx; margin-right: 16rpx; border-radius: 999rpx; font-size: 24rpx; color: var(--w-text-muted); background: var(--w-surface); border: 1rpx solid var(--w-border); }
.pill.on { background: $brand; border-color: $brand; color: #fff; }
.pico { font-size: 24rpx; }
.notice { margin-top: 20rpx; display: flex; align-items: center; background: var(--w-brand-soft); color: var(--w-brand-text); border-radius: 999rpx; padding: 14rpx 24rpx; font-size: 24rpx; }
.ntext { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nmore { margin-left: 8rpx; flex-shrink: 0; }
.sec { display: flex; justify-content: space-between; align-items: baseline; padding: 28rpx 4rpx 8rpx; }
.sec-t { font-size: 32rpx; font-weight: 600; color: var(--w-text); }
.sec-n { font-size: 22rpx; color: var(--w-text-muted); }
.sec-more { font-size: 22rpx; color: var(--w-brand-text); }
/* 搜索无结果兜底：提示 + 纠错词 + 换品类 */
.empty-search { display: flex; flex-direction: column; align-items: center; gap: 10rpx; padding: 40rpx 30rpx; background: var(--w-surface); border-radius: $radius-card; margin-top: 16rpx; }
.empty-search__ico { font-size: 56rpx; }
.empty-search__t { font-size: 28rpx; font-weight: 600; color: var(--w-text); text-align: center; }
.empty-search__s { font-size: 22rpx; color: var(--w-text-muted); text-align: center; line-height: 1.5; }
.sec-block { background: var(--w-surface); border-radius: $radius-card; padding: 22rpx; margin-top: 16rpx; }
.sec-block__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
.sec-badge { font-size: 20rpx; line-height: 1; padding: 6rpx 12rpx; border-radius: 999rpx; background: var(--w-brand-soft); color: var(--w-brand-text); }
.chips { display: flex; flex-wrap: wrap; gap: 14rpx; }
.chip { font-size: 24rpx; line-height: 1; padding: 16rpx 26rpx; border-radius: 999rpx; background: var(--w-bg, #f5f5f5); color: var(--w-text-secondary, #666); border: 1rpx solid transparent; }
.chip--fix { color: var(--w-brand-text); border-color: $brand; font-weight: 600; }
.cards { display: flex; flex-direction: column; gap: 16rpx; padding-bottom: 8rpx; }
.card { display: flex; align-items: center; gap: 20rpx; background: var(--w-surface); border-radius: $radius-card; padding: 24rpx; }
.logo { width: 120rpx; height: 120rpx; border-radius: $radius; flex-shrink: 0; }
.logo-text { background: var(--w-brand-soft); color: var(--w-brand-text); font-size: 48rpx; text-align: center; line-height: 120rpx; }
.info { flex: 1; min-width: 0; }
.name-row { display: flex; align-items: center; gap: 12rpx; }
.name { font-size: 30rpx; font-weight: 600; color: var(--w-text); }
.paused { font-size: 20rpx; color: var(--w-text-muted); border: 1rpx solid var(--w-border); border-radius: 6rpx; padding: 0 8rpx; }
.paused--closed { color: #b42318; border-color: #f3b6b0; background: #fff2f0; }
.paused--closing { color: #b45309; border-color: #ffd9ad; background: #fff8ef; }
.meta { display: block; font-size: 24rpx; color: var(--w-text-muted); margin-top: 6rpx; }
.tags { display: flex; flex-wrap: wrap; gap: 8rpx; margin-top: 12rpx; }
.tag { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; }
.tag-route { color: var(--w-text-muted); background: var(--w-bg); }
.tag-promo { color: var(--w-brand-text); background: var(--w-brand-soft); }
.chev { color: var(--w-text-muted); font-size: 32rpx; margin-left: 8rpx; flex-shrink: 0; }
/* 排序 chips */
.sortbar { white-space: nowrap; padding: 16rpx 0 0; }
.sort-chip { display: inline-flex; align-items: center; gap: 4rpx; padding: 8rpx 20rpx; margin-right: 12rpx; border-radius: 999rpx; font-size: 22rpx; color: var(--w-text-muted); background: var(--w-surface); border: 1rpx solid var(--w-border); }
.sort-chip.on { color: var(--w-brand-text); border-color: $brand; background: var(--w-brand-soft); }
/* 常买店铺横排 */
.recent { margin-top: 8rpx; }
.recent-row { white-space: nowrap; padding-bottom: 8rpx; }
.recent-card { display: inline-flex; flex-direction: column; align-items: center; width: 148rpx; margin-right: 16rpx; background: var(--w-surface); border-radius: $radius-card; padding: 16rpx 12rpx; vertical-align: top; }
.recent-card--rank { position: relative; }
.rank-badge { position: absolute; top: -8rpx; left: -8rpx; z-index: 2; width: 40rpx; height: 40rpx; line-height: 40rpx; text-align: center; border-radius: 50% 50% 50% 8rpx; color: #fff; font-size: 22rpx; font-weight: 600;
  &.rank-1 { background: #ff4d2d; }
  &.rank-2 { background: #ff8a00; }
  &.rank-3 { background: #ffb020; } }
.recent-logo { width: 88rpx; height: 88rpx; border-radius: 999rpx; }
.recent-logo--text { background: var(--w-brand-soft); color: var(--w-brand-text); font-size: 38rpx; line-height: 88rpx; text-align: center; }
.recent-name { width: 100%; font-size: 22rpx; color: var(--w-text); margin-top: 10rpx; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-meta { font-size: 20rpx; color: var(--w-text-muted); margin-top: 4rpx; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 收藏心（卡片右上角） */
.card { position: relative; }
.name-row { padding-right: 48rpx; }
.fav { position: absolute; top: 14rpx; right: 18rpx; font-size: 34rpx; color: var(--w-text-muted); padding: 6rpx; line-height: 1; }
.fav.on { color: #ff4d6d; }
.tag-free { color: #0a9d58; background: #ecfaf1; }
/* 打烊店铺「开门提醒我」 */
.tag-watch { color: #b45309; background: #fff8ef; border: 1rpx solid #ffd9ad;
  &.on { color: var(--w-brand-text); background: var(--w-brand-soft); border-color: var(--w-brand-text); } }
.open-banner { display: flex; align-items: center; gap: 12rpx; margin: 16rpx 0; padding: 16rpx 18rpx;
  background: #ecfaf1; border: 1rpx solid #b7e8cd; border-radius: 16rpx;
  &__ico { font-size: 28rpx; }
  &__body { flex: 1; min-width: 0; }
  &__title { display: block; font-size: 25rpx; color: #0a7d46; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__sub { display: block; margin-top: 4rpx; font-size: 20rpx; color: #3b8f63; }
  &__go { flex-shrink: 0; font-size: 23rpx; color: #fff; background: #0a9d58; border-radius: 999rpx; padding: 6rpx 18rpx; }
  &__close { flex-shrink: 0; font-size: 24rpx; color: #6b9a7f; padding: 4rpx 6rpx; }
}
/* 筛选弹层 */
/* z-index 需高于 uni tabbar（998），否则底部按钮被 tab 栏拦截点击 */
.filter-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); z-index: 1000; display: flex; align-items: flex-end; }
.filter-sheet { width: 100%; background: var(--w-surface); border-radius: 28rpx 28rpx 0 0; padding: 28rpx 28rpx calc(28rpx + env(safe-area-inset-bottom)); }
.fs-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
.fs-title { font-size: 32rpx; font-weight: 600; color: var(--w-text); }
.fs-close { font-size: 30rpx; color: var(--w-text-muted); padding: 8rpx; }
.fs-group { margin-top: 20rpx; }
.fs-label { font-size: 24rpx; color: var(--w-text-muted); display: block; margin-bottom: 12rpx; }
.fs-chips { display: flex; flex-wrap: wrap; gap: 14rpx; }
.fs-chip { padding: 12rpx 26rpx; border-radius: 999rpx; font-size: 24rpx; color: var(--w-text); background: var(--w-bg); border: 1rpx solid var(--w-border); }
.fs-chip.on { color: var(--w-brand-text); background: var(--w-brand-soft); border-color: $brand; }
.fs-actions { display: flex; gap: 20rpx; margin-top: 32rpx; }
.fs-reset { flex: 1; height: 84rpx; line-height: 84rpx; text-align: center; border-radius: 999rpx; font-size: 28rpx; color: var(--w-text-muted); background: var(--w-surface-muted); }
.fs-apply { flex: 2; height: 84rpx; line-height: 84rpx; text-align: center; border-radius: 999rpx; font-size: 28rpx; font-weight: 600; color: #fff; background: $brand; }
/* 当前配送楼栋条（头部品牌底色上） */
.target-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; padding: 8rpx 20rpx; border-radius: 999rpx; background: rgba(255, 255, 255, .18); }
.target-row__txt { font-size: 24rpx; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.target-row__sw { flex-shrink: 0; margin-left: 12rpx; font-size: 22rpx; color: #fff; opacity: .92; }
/* 搜索面板（历史 / 热搜） */
.search-panel { margin-top: 20rpx; background: var(--w-surface); border-radius: $radius-card; padding: 8rpx 24rpx 24rpx; }
.sp-group { padding-top: 20rpx; }
.sp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
.sp-title { font-size: 26rpx; font-weight: 600; color: var(--w-text); }
.sp-clear { font-size: 22rpx; color: var(--w-text-muted); padding: 4rpx 8rpx; }
.sp-chips { display: flex; flex-wrap: wrap; gap: 14rpx; }
.sp-chip { max-width: 100%; padding: 10rpx 24rpx; border-radius: 999rpx; font-size: 24rpx; color: var(--w-text); background: var(--w-bg); border: 1rpx solid var(--w-border); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-chip--hot { color: var(--w-brand-text); background: var(--w-brand-soft); border-color: transparent; }
.sp-tip { padding: 28rpx 0 8rpx; font-size: 24rpx; color: var(--w-text-muted); text-align: center; }
.sp-loading { padding: 20rpx 4rpx; font-size: 24rpx; color: var(--w-text-muted); }
/* 搜索联想（店铺 / 历史 / 热搜）：沿用搜索面板底色与圆角，最多约 8 行后滚动 */
.suggest-panel { max-height: 680rpx; }
.sg-row { display: flex; align-items: center; gap: 12rpx; padding: 16rpx 4rpx; border-bottom: 1rpx solid var(--w-border); }
.sg-list .sg-row:last-child { border-bottom: none; }
.sg-ico { flex-shrink: 0; font-size: 24rpx; }
.sg-name { flex: 1; min-width: 0; font-size: 26rpx; color: var(--w-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sg-meta { flex-shrink: 0; max-width: 46%; font-size: 22rpx; color: var(--w-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sg-chev { flex-shrink: 0; font-size: 28rpx; color: var(--w-text-muted); }
/* 临期券提示条：紧凑橙色描边，位于搜索区与店铺列表之间 */
.coupon-expiring { margin-top: 16rpx; display: flex; align-items: center; gap: 8rpx; background: var(--w-brand-soft); color: var(--w-brand-text); border: 1rpx solid rgba(255, 102, 0, 0.35); border-radius: 999rpx; padding: 10rpx 24rpx; font-size: 22rpx; }
.ce-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ce-ico, .ce-more { flex-shrink: 0; }
/* 商品横排（收藏商品 / 常买商品） */
.item-card { display: inline-flex; flex-direction: column; width: 168rpx; margin-right: 16rpx; background: var(--w-surface); border-radius: $radius-card; padding: 12rpx; vertical-align: top; }
.item-img { width: 144rpx; height: 144rpx; border-radius: $radius; }
.item-img--text { display: flex; align-items: center; justify-content: center; background: var(--w-brand-soft); color: var(--w-brand-text); font-size: 48rpx; }
.item-name { width: 100%; margin-top: 10rpx; font-size: 22rpx; color: var(--w-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-price { margin-top: 4rpx; font-size: 24rpx; font-weight: 600; color: var(--w-brand-text); }
.item-store { width: 100%; margin-top: 2rpx; font-size: 20rpx; color: var(--w-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 跨店商品搜索结果 */
.phits { background: var(--w-surface); border-radius: $radius-card; padding: 0 20rpx; }
.phit { display: flex; align-items: center; gap: 16rpx; padding: 18rpx 0; border-bottom: 1rpx solid var(--w-border); }
.phit:last-child { border-bottom: none; }
.phit-img { width: 96rpx; height: 96rpx; border-radius: $radius; flex-shrink: 0; }
.phit-img--text { display: flex; align-items: center; justify-content: center; background: var(--w-brand-soft); color: var(--w-brand-text); font-size: 36rpx; }
.phit-info { flex: 1; min-width: 0; }
.phit-name { display: block; font-size: 26rpx; color: var(--w-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.phit-store { display: block; margin-top: 4rpx; font-size: 22rpx; color: var(--w-text-muted); }
.phit-price { flex-shrink: 0; font-size: 26rpx; font-weight: 600; color: var(--w-brand-text); }
/* 楼栋切换弹层（z-index 高于 tabbar 998） */
.target-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); z-index: 1000; display: flex; align-items: flex-end; }
.target-sheet { width: 100%; max-height: 70vh; overflow-y: auto; background: var(--w-surface); border-radius: 28rpx 28rpx 0 0; padding: 28rpx 28rpx calc(28rpx + env(safe-area-inset-bottom)); }
</style>
