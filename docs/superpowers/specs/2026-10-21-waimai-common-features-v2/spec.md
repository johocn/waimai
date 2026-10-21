# 外卖常用功能增强 · 第二轮 Spec（搜索 / 商品收藏 / 常买商品 / 订单中心 / 结算补强）

## 1. 背景

上一轮已上线：商家收藏、常买店铺、首页排序筛选、真·再来一单。
本轮用户全选四项缺口：
1. 搜索升级（历史 + 热搜词 + 跨店商品搜索 + 无结果推荐）
2. 商品收藏 + 常买商品
3. 订单中心增强（搜索、售后聚合、预约时段/退款标记）
4. 结算体验补强（起送价硬拦截、满减凑单提示、首页楼栋快捷切换）

不含：新依赖、支付流程改造、订单状态机改造、商家端/骑手端页面改造。

## 2. 现状事实（已核对）

| 能力 | 现状 |
| --- | --- |
| 首页搜索 | `src/pages/home/index.vue`：`keyword` 即时经 `filterStores()` 过滤店铺，无历史/热词/商品搜索 |
| 商品接口 | `src/api/queries/waimai.ts`：`fetchProductList()`（当前渠道）、`fetchProductListForChannel(token)`（独立 GraphQLClient + `vendure-token`） |
| 商品收藏 | 仅有商家收藏 `src/stores/favorites.ts` + `src/api/queries/favorite.ts` + 后端 `favorite-shop.resolver.ts` |
| 常买 | 仅有常买店铺 `recent_stores`，无常买商品 |
| 订单列表 | `src/pages/orders/index.vue`：跨渠道拉单 + 状态 tabs，无搜索/售后聚合；订单 fragment 已含 `customFields.deliverySlotText/fulfillmentRoute/deliveryStatus/exceptionType` |
| 售后 | `src/api/queries/afterSale.ts`：`fetchMyAfterSales()` 返回 `orderId/state/refundAmount...` |
| 起送价 | 后端已有 `campusMinOrderProcess` 硬校验（`min-order.process.ts`）；前端 `checkout.vue` 仍为 toast 软提示 |
| 满减活动 | 店铺 `promoText` 为自由文本（如「满30减5」），前端未解析 |
| 楼栋 | `campusZones/campusBuildings` 按 `ctx.channelId` 隔离；结算页 `saveCampusTarget()` 已写单但未落本地偏好 |

## 3. 方案设计

### 3.1 搜索升级（纯前端）

文件：`src/pages/home/index.vue`、`src/pages/shop/menu.vue`、新增 `src/utils/search.ts`。

本地存储：
- `search_history`：`string[]`，最多 10 条，最新在前，去重，可清空。
- `recent_items`：见 3.3。

状态与交互：
- `searchFocused`：搜索框 `@focus` 置 true、`@blur` 延迟 150ms 置 false；`@confirm` 提交搜索。
- 当 `searchFocused && !keyword.trim()` 时展示搜索面板（盖住店铺列表，不跳页）：
  - 「搜索历史」chips（每条可点；右侧「清空」）；空历史隐藏整块。
  - 「热搜词」：由 `stores` 生成前 6 个：优先 `tags`（去重、排除「全部」），不足用店铺名补齐；点击即填入并提交搜索。
- `@confirm`（或点热词/历史）：
  - `submitSearch(kw)`：trim 后写 `search_history`（去重前置、slice 10）、`searchKeyword = kw`、触发跨店商品搜索。
  - 店铺结果继续用现有 `shown`（`filterStores` 按 `searchKeyword`）。
- 商品搜索：
  - `searchProducts(kw)`：对 `stores`（仅 `!paused`）逐个 `fetchProductListForChannel(s.channelToken)`，`Promise.allSettled` 并发；命中规则：商品 `name` 或 `plainDescription(description)` 包含 kw（不区分大小写）；每店最多 6 条，总上限 24 条。
  - 结果结构 `searchProductHits: Array<{ store, product, variant }>`；渲染「商品」分组，行内容：主图、商品名、店铺名、价格（`variants[0].priceWithTax`）。
  - 搜索中显示 loading 文案；失败店静默跳过。
- 结果分组渲染（`searchKeyword` 非空时）：
  - 先「商品」分组（有命中才显示），再「店铺」分组（现有卡片）。
  - 商品行点击：`uni.navigateTo('/pages/shop/menu?token=&name=&routes=&cid=&q=<商品名>')`。
  - 店铺卡点击维持 `enterStore()`（带 cid）。
- 无结果：`shown.length === 0 && searchProductHits.length === 0` 时，展示「热销店铺推荐」（`!!`；取 `stores` 按 `monthlySales` 降序前 4，横向卡片），点击进店；同时保留空态文案。
- 清空关键词（`@input` 变为空）：复位 `searchKeyword`/`searchProductHits`，回到常规列表。

商品页关键词定位（menu.vue）：
- `onLoad` 读取 `q`，`productQuery`。
- 有值时商品区顶部显示 chip「搜索：{q} ✕」；`goodsOf()` 叠加 `productQuery` 过滤（name/描述包含）。点 ✕ 清空并恢复全量。
- 不改变分类/加购逻辑。

### 3.2 商品收藏（后端 + 前端）

后端（`d:\zhao\vendure\packages\campus-delivery-plugin`）：
- 迁移 `migrations/create-campus-tables.ts` 末尾追加幂等建表：
```sql
CREATE TABLE IF NOT EXISTS campus_favorite_variant (
  id SERIAL PRIMARY KEY, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(),
  "customerId" int NOT NULL, "channelId" int NOT NULL, "variantId" int NOT NULL,
  UNIQUE ("customerId", "variantId"));
```
- `favorite-shop.resolver.ts` 扩展（保留已有商家收藏方法）：
  - `type FavoriteVariant = { variantId: string; channelId: string }`
  - `@Query() campusFavoriteVariants(ctx): Promise<FavoriteVariant[]>`：`SELECT "variantId","channelId" ... ORDER BY "createdAt" ASC`，返回字符串化。
  - `@Mutation() campusToggleFavoriteVariant(ctx, variantId, channelId): Promise<FavoriteVariant[]>`：
    - 校验 `variantId/channelId` 为正整数；`Channel` 存在；`ProductVariant` 存在（`dataSource.getRepository(ProductVariant)`）。
    - 同商家收藏模式：`DELETE ... RETURNING id` 判存在，再 `INSERT ... ON CONFLICT DO NOTHING`；`DELETE` 的 raw 结果按上一轮已验证的 `[rows, affected]` 兼容处理。
    - 返回最新完整列表。
- `campus-delivery.plugin.ts`：
  - shop schema 增加 `type CampusFavoriteVariant { variantId: ID! channelId: ID! }`；
  - Query 加 `campusFavoriteVariants: [CampusFavoriteVariant!]!`；
  - Mutation 加 `campusToggleFavoriteVariant(variantId: ID!, channelId: ID!): [CampusFavoriteVariant!]!`；
  - resolver 仍注册 `FavoriteShopResolver`（已注册，无需新增）。
- 均为 `@Allow(Permission.Authenticated)`；未登录 `NOT_LOGGED_IN`。

前端：
- `src/api/queries/favorite.ts`：新增 `CAMPUS_FAVORITE_VARIANTS`、`CAMPUS_TOGGLE_FAVORITE_VARIANT`、`fetchFavoriteVariants(): Promise<{variantId,channelId}[]>`、`toggleFavoriteVariant(variantId, channelId)`。
- `src/stores/favorites.ts` 扩展：
  - 本地键 `favorite_variants`，结构 `VariantFavorite = { variantId, channelId, channelToken, productId, name, image, price, storeName, at }`。
  - `variantItems`、`variantIdSet`、`isVariantFavorite(id)`、`toggleVariant(record)`：
    - 游客：仅本地增删；登录：乐观更新 + 远端 toggle，失败回滚，返回操作后状态。
  - `loadRemote()` 同时拉商家收藏与商品收藏；商品收藏合并策略：远端列表为准，保留已有本地元数据，远端新增项先以占位元数据保存。
  - `hydrateVariantMeta(stores)`：对 `variantItems` 中缺少 `name` 或 `image` 的渠道（按 channelToken 匹配），并发 `fetchProductListForChannel(token)` 一次，按 variantId 回填并持久化；失败静默。
  - `touchRecentItem(item)`：见 3.3，与商品收藏共用 store。
- `src/pages/shop/menu.vue`：
  - 商品行右上角心形按钮（`@tap.stop`），状态 = 该商品任一 variant 已收藏。
  - 点击收藏：取 `g.variants[0]` 作为代表；若已收藏（任一 variant），逐个取消已收藏 variant；否则收藏首个 variant。记录字段：`variantId/channelId(storeInfo)/channelToken(shopToken)/productId(g.id)/name(g.name)/image(g.featuredAsset?.preview)/price(g.variants[0].priceWithTax)/storeName(shopName)`。
  - 登录态远端失败 toast `menu.favFail`。
- `src/pages/home/index.vue`：
  - 无关键词时，在「常买店铺」之后展示「收藏商品」横排（`favoriteVariantItems`，最多 8）：商品图、名称（单行省略）、价格、店铺名。
  - 点击：带 `q=<商品名>` 进店；进店后商品区自动按关键词过滤（复用 3.1）。
  - 进入首页/`onShow` 调 `favorites.hydrateVariantMeta(storeList)`，回填远端收藏元数据。

### 3.3 常买商品（本地）

- 键 `recent_items`，最多 8 条，结构 `{ channelId, channelToken, variantId, productId, name, price, image, storeName, routes, at }`。
- 写入时机：`src/pkg-order/pages/checkout.vue` 支付成功分支（`pay.status !== 'fail'`）跳转前，遍历 `cart.order.lines`：
  - 每行取 `productVariant.id/productId/name`、`featuredAsset.preview`、`unitPriceWithTax`；
  - `channelId/channelToken/storeName/routes` 来自 URL 参数（见下）。
- 店铺页 `goCheckout()` URL 追加 `&cid=<channelId>&shop=<encodeURIComponent(shopName)>`（`routes` 已有）。
- `checkout.vue` `onLoad` 读取 `cid/shop` 存入 `storeMeta`；成功时 `favorites.touchRecentItem({...})`。
- 首页「常买商品」横排（无关键词时，「常买店铺」之后）：
  - 卡片：图、名称、价格、店铺名。
  - 点击：`navigateTo('/pages/shop/menu?token=&cid=&name=&routes=&add=<variantId>')`。
- `menu.vue` `onLoad` 读 `add`；在渠道切换 + 商品加载完成后 `doAddItem(add, 1)`，成功 toast `menu.added`，失败 toast `menu.addFail`；URL 消费后不再重复执行（仅 onLoad 内一次）。

### 3.4 订单中心增强

文件：`src/pages/orders/index.vue`。

- 顶部搜索框：`orderKeyword`；本地过滤已加载订单：`code`、`channelName`、`lines[].productVariant.name`。
- 售后聚合：
  - 登录态 `onShow` 调 `fetchMyAfterSales()`（失败静默），构建 `afterSaleByOrderId: Map<orderId, {state, refundAmount}>`。
  - 顶部聚合条：统计「处理中」数量（state ∈ PENDING/APPROVED/RECEIVED/REFUND_FAILED/APPEALED），大于 0 时展示；点击切换 `onlyAfterSale` 过滤（再次点击取消）。
  - 订单卡标签：`售后处理中` / `已退款`；异常单（`customFields.exceptionType` 且未 `exceptionHandledNote`）显示「配送异常」。
  - 标签点击（`.stop`）跳 `pkg-order/pages/after-sale-detail?id=<afterSale.id>`（已存在页面）；无售后对象时跳订单详情。
- 订单卡展示 `customFields.deliverySlotText`（存在时，前缀「送达时段」）；`stateLabel` 逻辑不变。
- 空态：搜索结果为空显示「未找到相关订单」。

### 3.5 结算体验补强

文件：`src/pkg-order/pages/checkout.vue`、`src/pages/shop/menu.vue`、`src/pages/home/index.vue`、新增 `src/utils/promo.ts`。

1) 起送价硬拦截
- `belowMinOrder` computed：`activeTab==='campus' && minOrderFen!=null && goodsFen < minOrderFen`。
- `submitOrder()` 开头：若 `belowMinOrder` → `uni.showModal({ title, content: '还差 ¥D 起送', confirmText: '去加购', cancelText: '再想想' })`，确认执行 `uni.navigateBack()`；始终 `return`，不提交。
- 结算页合计下方显示红色提示行「还差 ¥D 起送」。
- `loadStoreRoutes()` 同时回填 `minOrderFen = store.minOrderAmount`（URL 无值时）。
- 菜单购物车栏：`cartTotal < minOrder` 时按钮文案改「还差 ¥D 起送」并置灰不可点击（阻止直点结算），点击给 toast。`minOrder` 来自 `storeInfo.minOrderAmount`。

2) 满减凑单提示（`src/utils/promo.ts`）
```ts
export interface PromoRule { thresholdFen: number; discountFen: number }
export function parsePromoRules(text?: string | null): PromoRule[]
export function nextPromoHint(text: string | null | undefined, goodsFen: number):
  { gapFen: number; discountFen: number; thresholdFen: number; reached: boolean } | null
```
- 解析形如 `满30减5`、`满30元减5元`、`满 30 减 5`（多规则取全部，`\u6ee1\s*(\d+(?:\.\d+)?)\s*元?\s*减\s*(\d+(?:\.\d+)?)`）。
- 语义：取大于当前商品额的最近门槛；若已过某门槛返回 `reached: true`（discount 为该门槛优惠）。无匹配返回 null。
- 结算页：`promoText` 来自 `loadStoreRoutes()` 匹配到的 `store.promoText`；合计区提示「再买 ¥D 可减 ¥Y」/「已满 ¥X 减 ¥Y」。
- 菜单购物车栏提示同样文案（`promoText` 已有），有提示时按钮上方小字。

3) 首页楼栋快捷切换
- 存储键 `delivery_target`：`{ zoneId, zoneName, buildingId, buildingName, at }`；`delivery_target_options`：`{ zones: [{id,name}], buildings: [{id,name,zoneId}] }`。
- 结算页：`saveCampusTarget()` 成功后写 `delivery_target`；`loadCampusData()` 成功后写 `delivery_target_options`（仅存必要字段）。
- 结算页预选优先级：本地 `delivery_target`（zone/building 在当前店 zones/buildings 中均存在）→ 现有默认地址 → 第一分区/楼栋。
- 首页头部 `loc-row` 下新增 `target-row`（有 `delivery_target` 时）：`📍 {zoneName} · {buildingName}` +「切换 ▸」。
- 点击打开底部弹层：
  - 数据：优先 `delivery_target_options`；无则 `fetchZones()`（当前默认渠道）。
  - 分区 chips → 楼栋 chips（`fetchBuildings(zoneId)`，优先本地 options 过滤）。
  - 「保存」写 `delivery_target` 并关闭；无数据时 toast「暂无可选楼栋，请在结算页选择」。
- 弹层 `z-index: 1000`（高于 tabbar 998）。

## 4. i18n 键（zh-Hans / en 同步）

- `home`：`searchHistory`、`clearHistory`、`hotSearch`、`searchProducts`、`searchLoading`、`noProductHit`、`hotStores`、`favoriteProducts`、`recentProducts`、`deliveryTo`、`switchTarget`、`targetTitle`、`saveTarget`、`noTargetOptions`、`minOrderGap`（「还差 ¥{d} 起送」）、`promoGap`（「再买 ¥{d} 可减 ¥{y}」）、`promoReached`（「已满 ¥{t} 减 ¥{y}」）、`searchItemTip`
- `menu`：`favProductAddOk`、`favProductRemoveOk`、`favFail`（已有）、`searchChip`（「搜索：{q}」）、`minOrderGap`
- `orders`：`searchPh`、`searchEmpty`、`afterSaleProcessing`、`afterSaleRefunded`、`afterSaleOnly`、`afterSaleBar`（「售后处理中 {n} 单」）、`deliverySlot`（「送达时段：{t}」）、`exceptionTag`
- `checkout`：`minOrderGap`（「还差 ¥{d} 起送」）、`minOrderBlockTitle`、`goAddMore`、`thinkAgain`、`promoGap`、`promoReached`

## 5. 文件改动清单

| 文件 | 改动 |
| --- | --- |
| `vendure/.../migrations/create-campus-tables.ts` | 追加 `campus_favorite_variant` 建表 |
| `vendure/.../favorite-shop.resolver.ts` | 商品收藏 query/mutation + 校验 |
| `vendure/.../campus-delivery.plugin.ts` | schema 类型/字段追加 |
| `waimai/src/api/queries/favorite.ts` | 商品收藏 GraphQL + 方法 |
| `waimai/src/stores/favorites.ts` | `variantItems`、`toggleVariant`、`hydrateVariantMeta`、`recentItems`、`touchRecentItem` |
| `waimai/src/utils/search.ts`（新增） | 历史/热词纯函数、商品命中过滤 |
| `waimai/src/utils/promo.ts`（新增） | 满减解析与凑单提示 |
| `waimai/src/pages/home/index.vue` | 搜索面板/商品搜索/无结果推荐/收藏商品/常买商品/楼栋切换 |
| `waimai/src/pages/shop/menu.vue` | 商品心标、q 过滤 chip、购物车起送/满减提示、`add` 参数加购、goCheckout 追加参数 |
| `waimai/src/pages/orders/index.vue` | 搜索、售后聚合、卡标签、预约时段 |
| `waimai/src/pkg-order/pages/checkout.vue` | 起送硬拦截、满减提示、本地楼栋读写、常买商品写入 |
| `waimai/src/locale/zh-Hans.json` / `en.json` | §4 全部键 |

## 6. 验收

1. 后端：`packages/campus-delivery-plugin` `pnpm build`、`pnpm test` 通过；线上未登录调 `campusFavoriteVariants` 返回 `NOT_LOGGED_IN`；登录后 toggle 幂等翻转。
2. 前端：`waimai` `pnpm build:h5` 通过。
3. 手机视口截图（Playwright 390×844 dpr=2，输出 `docs/screenshots/`）：首页搜索面板/商品搜索结果/无结果推荐、收藏商品横排、常买商品横排、楼栋切换弹层；菜单商品心标 + q chip；订单搜索 + 售后聚合；结算起送拦截弹窗 + 满减凑单提示。
4. 回归：首页常规列表/排序筛选、进店、加购、结算、支付、再来一单不回归。
5. 操作手册：追加到 `docs/waimai-操作手册-常用功能.md`。

## 7. 发布

- vendure：本地 build → commit/push → `ssh joho "cd /www/apps/vendure && git pull --ff-only && pm2 restart vendure"`。
- waimai：`node .secrets/deploy-waimai.mjs`（本地构建，服务器仅解压）。
- 顺序：实现 → 构建 → 截图/手册 → 提交 → 推送 → 部署 → 线上回归，一次收口。
