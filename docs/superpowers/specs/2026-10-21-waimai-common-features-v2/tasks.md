# 第二轮任务清单（执行顺序）

> 前置：spec 已确认。全部完成。

## ✅ T1 后端商品收藏
- 文件：`d:\zhao\vendure\packages\campus-delivery-plugin\src\migrations\create-campus-tables.ts`
  - 在 `campus_favorite_shop` 后追加 `campus_favorite_variant` 幂等建表（唯一 `customerId+variantId`）。
- 文件：`...\src\favorite-shop.resolver.ts`
  - 新增 `campusFavoriteVariants` query、`campusToggleFavoriteVariant` mutation（`@Allow(Permission.Authenticated)`）。
  - 校验 variant/channel 存在；复用 `DELETE ... RETURNING` + `INSERT ... ON CONFLICT` 模式。
- 文件：`...\src\campus-delivery.plugin.ts`
  - shop schema 加 `CampusFavoriteVariant` 类型与 Query/Mutation 字段。
- 验证：`cd d:\zhao\vendure\packages\campus-delivery-plugin; pnpm build`。

## ✅ T2 前端收藏数据层
- `d:\zhao\waimai\src\api\queries\favorite.ts`：加商品收藏 query/mutation + 两个方法。
- `d:\zhao\waimai\src\stores\favorites.ts`：
  - `variantItems`（键 `favorite_variants`）、`variantIdSet`、`isVariantFavorite`、`toggleVariant`；
  - `loadRemote()` 合并商品收藏；
  - `hydrateVariantMeta(stores)` 按渠道回填商品名/图/价；
  - `recentItems`（键 `recent_items`，最多 8）+ `touchRecentItem()`。
- 验证：`pnpm build:h5` 暂不要求通过（后续统一构建），TypeScript 无错。

## ✅ T3 商品收藏 UI
- `d:\zhao\waimai\src\pages\shop\menu.vue`：
  - 商品行右上心形（任一 variant 已收藏即实心）；toggle 代表 variant。
  - 记录完整元数据（channelId 来自 storeInfo，channelToken 来自 query）。
- `d:\zhao\waimai\src\pages\home\index.vue`：
  - 「收藏商品」横排（最多 8），点击带 `q=` 进店。
- 验证：登录后收藏 → 刷新首页仍在（远端）；游客本地生效。

## ✅ T4 搜索升级
- 新增 `d:\zhao\waimai\src\utils\search.ts`：历史读写、热词生成、商品命中过滤。
- `home/index.vue`：
  - 搜索面板（历史 + 热搜）在 focus 且空关键词时展示；
  - `@confirm` 写历史并触发 `searchProducts()`（并发 `fetchProductListForChannel`，过滤 name/description，每店 ≤6，总 ≤24）；
  - 「商品 / 店铺」分组渲染；商品点击进店带 `q=`；
  - 无结果展示热销店铺 top4。
- `menu.vue`：`q` 参数过滤商品 + 可清除 chip。
- 验证：搜索「奶茶」出现跨店商品；无结果出现推荐。

## ✅ T5 常买商品
- `menu.vue` `goCheckout()` URL 追加 `cid/shop`。
- `checkout.vue` 支付成功分支写 `recent_items`（每行一个，最多 8）。
- `home/index.vue` 「常买商品」横排；点击带 `add=<variantId>` 进店。
- `menu.vue` `onLoad` 消费 `add`：商品加载后加购 1 件并提示。
- 验证：下单成功 → 首页出现常买商品 → 点击进店自动加购。

## ✅ T6 订单中心增强
- `orders/index.vue`：
  - 搜索框本地过滤（订单号/店名/商品名）+ 空态；
  - 登录态拉 `fetchMyAfterSales()`，顶部聚合条「售后处理中 N 单」（点击切换仅看售后）；
  - 订单卡标签：售后处理中/已退款/配送异常，点击跳售后详情（有 id 时）；
  - 展示 `customFields.deliverySlotText`。
- 验证：下单预约时段 → 列表显示时段；有售后单 → 聚合条数量正确。

## ✅ T7 结算体验
- 新增 `d:\zhao\waimai\src\utils\promo.ts`：解析满减 + 下一档凑单提示。
- `checkout.vue`：
  - `belowMinOrder` 拦截：`showModal` → 确认返回加购，取消留页；提示行；
  - `loadStoreRoutes()` 回填 `minOrderFen` 与 `promoText`；
  - 合计区满减提示；
  - 保存/读取 `delivery_target`、`delivery_target_options`，预选优先级：本地目标 → 默认地址 → 第一分区。
- `menu.vue`：购物车栏起送不足置灰 + 满减提示。
- `home/index.vue`：当前楼栋条 + 切换弹层（z-index 1000），无数据 toast 引导。
- 验证：未达起送点提交被拦截；满减文案正确；首页切换楼栋后结算页能预选。

## ✅ T8 i18n 与构建
- `src/locale/zh-Hans.json` / `en.json` 补齐 §4 全部键（两文件同键）。
- `d:\zhao\waimai` `pnpm build:h5` 通过；后端插件已构建。

## ✅ T9 截图 + 手册
- Playwright 390×844 dpr=2 截图到 `docs/screenshots/`（首页搜索面板/商品结果/无结果/收藏商品/常买商品/楼栋弹层、菜单心标+q chip、订单搜索+售后条、结算起送拦截+满减）。
- 追加到 `docs/waimai-操作手册-常用功能.md`。

## ✅ T10 提交 → 推送 → 部署 → 线上回归
- waimai：commit/push；`node .secrets/deploy-waimai.mjs`。
- vendure：commit/push；`ssh joho "cd /www/apps/vendure && git pull --ff-only && pm2 restart vendure"`；等待后再验证。
- 线上回归：`campusFavoriteVariants` 未登录报错/登录可用；`https://www.yourbao.cn/waimai/` 200。
