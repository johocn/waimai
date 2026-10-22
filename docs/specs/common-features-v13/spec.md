# 外卖常用功能第十三轮 Spec（消费统计 / 收藏降价 / 店铺公告 / 时段推荐）

## 1. 背景与目标

延续「继续完善外卖常用功能」迭代。第十三轮经用户多选确认，一次性交付四项纯前端能力（无后端改动）：

1. **消费统计账单**：跨店铺渠道聚合历史订单，展示累计消费、订单数、客单价、本月消费、近 6 个月趋势、常点店铺 TOP3。
2. **收藏商品降价提醒**：收藏时记录价格快照，收藏页刷新当前价，展示「降价 ¥X」与原价划线。
3. **店铺公告与信息卡**：店铺页新增公告条 + 公告弹层；首次进店每日自动弹一次；商家 Tab 信息卡（已有）保持。
4. **时段推荐店铺**：首页按当前时段（早餐/午餐/下午茶/晚餐/夜宵）推荐应景店铺，支持一键切到对应类目筛选。

硬性交付：i18n 中英双语 → 本地构建 → 部署 → 手机视口截图（390×844 dpr=2）→ 操作手册追加章节 → 提交推送 → 线上回归。部署一律本地构建，服务器只解压/重启。

## 2. 现状调研结论（已确认）

- `src/pages.json`：`pkg-user` 分包已注册 favorites/history/help 等页面，新增页面沿用此结构，标题用 `%nav.xxx%`。
- `src/pages/profile/index.vue`：菜单区已有一串 `menu-item`，登录态用 `v-if="logged"`，`nav()` 已内置未登录拦截。
- `src/stores/favorites.ts`：`VariantFavorite` 已含 `variantId/channelId/channelToken/productId/name/image/price/storeName/at`；`toggleVariant()` 增删收藏，`hydrateVariantMeta()` 会按渠道回填缺失元数据。
- `src/pkg-user/pages/favorites.vue`：`itemList = favorites.variantItems`，商品卡已有图/名/店/价/取消收藏；`stores` 来自 `fetchStoreList()`。
- `src/pages/shop/menu.vue`：`storeInfo` 来自 `fetchStoreList()` 按 token 匹配，含 `storeNotice/storeAddress/storePhone/businessHours`；商家 Tab 已展示公告行；`onLoad` 中 `fetchStoreList().then(...)` 可直接挂弹窗判断。
- `src/pages/home/index.vue`：已有 `tagList/activeTag/enterStore/recent-card` 样式与 `getStoreStatus()`；店铺数据在 `stores`。
- 跨渠道订单聚合参考 `src/pkg-user/pages/history.vue#loadFrequent`：`fetchStoreList()` → 平台渠道 + 各店 `channelToken` → `getOrdersForChannel(token, { take, skip, sort })` → 按订单 id 去重。
- 价格格式化参考 `src/utils/promo.ts#yuan`（整数优先）与各页 `fen()`。
- 已知问题：上一轮遗留后台部署任务失败日志为 `[deploy] 失败: Command failed: pnpm build:h5`，本轮需重新本地构建并确认成功后再部署。

## 3. 功能规格

### 3.1 消费统计账单

**新增页面** `src/pkg-user/pages/spending.vue`

- 数据加载（`onShow` 触发，登录态才请求；失败静默展示空态）：
  1. `fetchStoreList()` 得到店铺列表；
  2. 渠道集合 = 平台渠道 `VITE_CHANNEL_TOKEN || '__default_channel__'` + 各店 `channelToken`（去重）；
  3. 每渠道调用 `getOrdersForChannel(token, { take: 50, skip: 0, sort: { createdAt: 'DESC' } })`；
  4. 按订单 `id` 去重合并，店铺名按 token 映射（平台渠道用 `orders.platform` 文案）。
- 统计口径：
  - 计入订单：`state` ∈ `PaymentAuthorized | PaymentSettled | Shipped | PartiallyShipped | Delivered | PartiallyDelivered`（排除 `Cancelled`、`AddingItems`、`ArrangingPayment` 等未支付/无效单）；
  - 金额：`totalWithTax`（分）；
  - 累计消费、订单数、客单价（累计/订单数）、本月消费/本月单量（按 `createdAt` 年月）；
  - 近 6 个月趋势（含本月）：每月金额、柱高按最大值归一化（最大柱 100%）；
  - 常点店铺 TOP3：按渠道聚合订单数与金额，排序「单量降序 → 金额降序」；
  - 最近 5 笔订单静态展示（店铺、时间、订单号、金额，不做跳转，避免依赖 order-detail 入参约定）。
- 页面结构：品牌色汇总卡（累计消费/订单数/客单价/本月）→ 月度趋势柱状卡 → 常点店铺卡 → 最近订单卡 → 底部统计口径说明。
- 空态：无有效订单时展示 `spending.empty`，隐藏趋势与最近订单块。

**路由与入口**

- `src/pages.json` 的 `pkg-user` 分包新增：`{ "path": "pages/spending", "style": { "navigationBarTitleText": "%nav.spending%" } }`。
- `src/pages/profile/index.vue` 菜单新增「消费统计」入口（`v-if="logged"`，`nav('/pkg-user/pages/spending')`），位置放在「我的收藏」之前。

### 3.2 收藏商品降价提醒

**新增工具** `src/utils/fav-price.ts`

- 存储键 `fav_price_snapshots`，结构 `Record<variantId, priceFen>`，上限 300 条（超出丢弃最早写入）。
- 导出：
  - `priceSnapshot(variantId): number | null`
  - `rememberFavPrice(variantId, price): void`
  - `forgetFavPrice(variantId): void`
  - `priceDrop(variantId, currentPrice): { original, diff } | null`（当前价 > 0 且严格小于快照价才返回）
- 读写沿用 `sku-memory.ts` 的 `uni.getStorageSync/setStorageSync` + JSON 兼容模式，失败静默。

**`src/stores/favorites.ts` 改造**

- `toggleVariant()`：加入收藏且 `record.price` 有效时 `rememberFavPrice`；取消收藏时 `forgetFavPrice`；远端失败回滚时同步恢复快照（回滚分支重新 `rememberFavPrice`）。
- `hydrateVariantMeta()`：首次回填价格时若快照不存在，以当前价建立基线（避免老收藏误报降价）。
- 新增 action `refreshVariantPrices(prices: Map<string, number>)`：更新本地 `price`，缺失快照的以当前价建基线，变更后 `persistVariants()`。

**`src/pkg-user/pages/favorites.vue` 改造**

- `onShow` 中在 `fetchStoreList()` 后调用 `refreshPrices()`：按收藏条目所属 token 分组，每渠道一次 `fetchProductListForChannel(token)`，构建 `variantId → priceWithTax` Map，交给 `refreshVariantPrices()`；失败静默保留旧价。
- 商品卡展示：
  - 有降价：当前价 + 原价划线（`fav-item__old`）+ 角标「降价 ¥X」（`fav-item__drop`）；
  - 无降价：维持现有单价格式。
- 「收藏商品」Tab 标题追加降价数量角标（`fav-tab__n--drop`），数量为 `itemList` 中 `priceDrop` 非空条数。

### 3.3 店铺公告与信息卡

**`src/pages/shop/menu.vue` 改造**

- 店铺卡下方、营业状态条之后新增公告条（`v-if="storeInfo?.storeNotice"`）：
  - 单行省略公告文本 + 「查看 ›」，点击打开公告弹层。
- 新增公告弹层（自定义遮罩 `.notice-mask` / `.notice-sheet`，z-index 高于 Tab 与购物车条）：
  - 标题「店铺公告」、完整公告正文、关闭按钮「知道了」；点遮罩关闭。
- 首次进店每日弹一次：
  - key：`store_notice_seen_${channelToken || channelId}_${YYYY-M-D}`；
  - 在 `onLoad` 的 `fetchStoreList().then(hit => ...)` 中，若公告非空且当日未标记，则自动打开弹层并写入标记；
  - 公告为空/店铺列表失败时不弹。
- 商家 Tab 现有公告/活动信息卡保持不变。

### 3.4 时段推荐店铺

**新增工具** `src/utils/time-slot.ts`

- 时段定义（本地时间）：
  - 早餐 06:00–10:00，图标 🥣，匹配 tags `面食/米饭快餐`，筛选 tag `面食`；
  - 午餐 10:00–14:00，🍚，tags `米饭快餐/面食`，筛选 `米饭快餐`；
  - 下午茶 14:00–17:00，🧋，tags `奶茶甜品`，筛选 `奶茶甜品`；
  - 晚餐 17:00–21:00，🍱，tags `米饭快餐/面食`，筛选 `米饭快餐`；
  - 夜宵 21:00–02:00，🌙，tags `夜宵`，筛选 `夜宵`。
- `currentMealSlot(now = new Date())` 返回当前时段（夜宵跨零点判断）。
- `recommendStores(stores, slot, max = 4)`：
  - 打分：命中 tags +100；有 `promoText` +20；`monthlySales/100`；`getStoreStatus(businessHours).state === 'closed'` -50；`paused` -100；
  - 降序取前 `max` 家，保留 `channelId/channelToken/name/logo/promoText` 等原字段。

**`src/pages/home/index.vue` 改造**

- 新增 `nowTick`（60 秒刷新，`onUnmounted` 清理），`mealSlot = currentMealSlot(new Date(nowTick))`，`mealPicks = recommendStores(stores, mealSlot, 4)`。
- 展示位置：快捷入口行之后、类目 pills 之前；条件 `!keyword && !showSearchPanel && mealPicks.length`。
- 结构：标题「现在适合吃 · {时段}」+ 「查看全部 ›」+ 横滑店铺卡（复用 `recent-card` 样式，副文案优先 `promoText`，否则配送标签）。
- 「查看全部」：若 `tagList` 含该时段的筛选 tag，则 `activeTag = 该 tag`（同时滚动到列表）；否则隐藏该按钮。
- 刷新时机：`onShow` 重置 `nowTick`；关键词/搜索面板出现时自动隐藏。

## 4. i18n（中英同步，2 空格缩进，禁止改动缩进风格）

**`src/locale/uni-app.zh-Hans.json` / `uni-app.en.json`**（`common` 内）

- `nav.spending`: 消费统计 / Spending

**`src/locale/zh-Hans.json` / `en.json`**

- `home`：
  - `mealTitle`: "现在适合吃 · {s}" / "Good for now · {s}"
  - `mealMore`: "查看全部" / "See all"
  - `mealBreakfast|mealLunch|mealTea|mealDinner|mealNight`: 早餐/午餐/下午茶/晚餐/夜宵 对应英文
- `menu`：
  - `storeNoticeTitle`: "店铺公告" / "Store notice"
  - `noticeMore`: "查看" / "View"
  - `noticeOk`: "知道了" / "Got it"
- `profile`：
  - `spending`: "消费统计" / "Spending"
- `favorites`：
  - `priceDrop`: "降价 ¥{d}" / "Down ¥{d}"
  - `oldPrice`: "原价" / "Was"
- 新增 `spending` 段：
  - `totalLabel`: "累计消费" / "Total spent"
  - `orders`: "订单数" / "Orders"
  - `avg`: "客单价" / "Avg. order"
  - `thisMonth`: "本月消费" / "This month"
  - `loading`: "统计中…" / "Calculating…"
  - `trendTitle`: "近 6 个月消费" / "Last 6 months"
  - `trendSub`: "按月汇总" / "By month"
  - `monthLabel`: "{m}月" / "{m}"
  - `topTitle`: "常点店铺 TOP3" / "Top 3 shops"
  - `topSub`: "按订单数排序" / "By order count"
  - `times`: "{n} 单" / "{n} order(s)"
  - `recentTitle`: "最近订单" / "Recent orders"
  - `dateFmt`: "{m}月{d}日" / "{m}/{d}"
  - `tip`: "统计包含已支付与已完成的订单，不含已取消/待付款订单" / "Includes paid and completed orders; cancelled or unpaid orders are excluded"
  - `empty`: "暂无可统计的订单" / "No orders to summarize yet"
  - `loginTip`: "登录后查看消费统计" / "Log in to view spending"

## 5. 验收与验证

1. `pnpm build:h5` 本地构建成功（确认上一轮后台构建失败已消除），产物含新增页面 chunk。
2. 部署：`node .secrets/deploy-waimai.mjs`；线上 `https://www.yourbao.cn/waimai/`。
3. Playwright 手机视口截图（390×844，dpr=2），输出到 `docs/screenshots/common-features-v13/`：
   - 63-profile-spending-entry.png：我的页「消费统计」入口；
   - 64-spending-summary.png：统计页汇总 + 趋势（mock 订单数据）；
   - 65-spending-top.png：常点店铺 + 最近订单；
   - 66-favorites-price-drop.png：收藏商品降价角标/原价划线；
   - 67-shop-notice-bar.png：店铺页公告条；
   - 68-shop-notice-modal.png：公告弹层；
   - 69-home-meal.png：首页时段推荐横滑。
   断言：导航标题正确、降价条目存在 `.fav-item__old`/`.fav-item__drop`、公告弹层可见、时段标题包含午餐/晚餐等文案。
4. 操作手册 `docs/waimai-操作手册-常用功能.md` 追加 §63–§66 与验收表。
5. `git add` 相关文件（勿动 `src/pkg-user/pages/address-book.vue` 的纯换行差异）→ commit（中文说明）→ push。
6. 线上回归：curl 首页 chunk 含 `spending` 路由；手机视口复查四项功能。
7. 清理临时截图脚本（`.secrets/common-features-v13-shots.cjs`）。

## 6. 非目标

- 不做后端/插件改动；不新增订单查询入参。
- 不改造商家 Tab 已有信息卡布局。
- 不做服务端价格变动推送；降价提醒仅收藏页打开时本地对比。
- 不实现订单详情跳转（统计页最近订单为静态展示）。
