# 外卖常用功能增强 Spec（收藏 / 常买 / 搜索筛选 / 再来一单）

## 1. 背景与目标

用户要求「继续增加外卖常用功能」，确认四项：真·再来一单、商家收藏 + 常买店铺、预约送达时间、首页搜索与筛选。
经现状核对：**预约送达时间已完整实现**（结算页可选日期/时段，订单写入 `deliverySlotId/deliverySlotText/scheduledFor`，订单详情已展示），本轮不重复开发，仅做回归验证与交付说明。
本轮实际开发范围：

1. 商家收藏（登录用户远端持久化，游客本地镜像）
2. 首页「常买店铺」横排（本地最近进店记录）
3. 首页排序 + 筛选（配送最快 / 起送价最低 / 免配送费 / 仅营业中 / 有优惠 / 起送价上限）
4. 真·再来一单（定位原订单渠道 → 校验商品可售 → 加购 → 直达该店菜单）

## 2. 现状关键位置

| 能力 | 现状 |
| --- | --- |
| 店铺列表 | `src/api/queries/waimai.ts` `fetchStoreList()`，返回 `channelId/channelToken/name/tags/monthlySales/promoText/paused/routesEnabled/deliveryMinutes/minOrderAmount/deliveryFee/freeShippingThreshold` 等 |
| 首页 | `src/pages/home/index.vue` 已有搜索框 + 分类 pills + `filterStores()`（`src/utils/store-filter.ts`），无收藏/排序/筛选/常买 |
| 店铺页 | `src/pages/shop/menu.vue` 店铺卡无收藏入口；`onLoad` 从 query 取 token/name/routes/promo |
| 订单详情 | `src/pkg-order/pages/order-detail.vue` `reorder()` 仅 `switchTab` 回首页；订单行含 `productVariant.id/name/stockLevel/enabled` |
| 跨渠道查单 | `src/api/queries/order.ts` `getOrdersForChannel(channelToken, options)`（独立 GraphQLClient + `vendure-token`） |
| 预约送达 | `src/pkg-order/pages/checkout.vue` L20-65/L451/L462-470；`order-detail.vue` L42-44/L280-281 —— 已完成 |
| 后端插件 | `d:\zhao\vendure\packages\campus-delivery-plugin`（customFields / 幂等迁移 / shop schema 字符串扩展） |

## 3. 数据与接口设计

### 3.1 收藏存储

- Customer 新增 customField：`favoriteStores: string`，内容为 **渠道 ID 的 JSON 数组**（如 `["1","5"]`）；`null` 表示未设置。
- 列名按 Vendure 规则（参考迁移注释「首字母大写 + 其余小写」）：`customFieldsFavoritestores`。
- 游客收藏只写本地存储 `favorite_stores`；登录后以远端为准，并把本地多出的 ID 逐个补写远端（合并收藏），随后回写本地镜像。
- 取消收藏：登录用户调用远端 toggle；游客仅改本地。

### 3.2 GraphQL（shop-api）

```graphql
extend type Query {
    campusFavoriteStores: [String!]!
}
extend type Mutation {
    campusToggleFavoriteStore(channelId: ID!): [String!]!
}
```

- 均要求 `Permission.Authenticated`；未登录返回 `UserInputError('NOT_LOGGED_IN')`。
- `campusToggleFavoriteStore` 先校验渠道存在（`Channel` repo），再读改写 `Customer.customFields.favoriteStores`，返回最新完整 ID 列表。
- 归属：`ctx.activeUserId` → `customerService.findOneByUserId(ctx, userId)`（Customer 无 userId 标量，禁止按 id 猜测）。

### 3.3 排序 / 筛选规则（纯函数）

`src/utils/store-filter.ts` 新增：

```ts
export type StoreSort = 'default' | 'fastest' | 'minOrder' | 'freeDelivery';

export interface StoreFilterOptions {
    openOnly?: boolean;         // 仅营业中（!paused）
    freeDelivery?: boolean;     // 免配送费（deliveryFee === 0，null 不视为免费）
    minOrderMax?: number | null; // 起送价上限（元），比较 minOrderAmount/100 ≤ 值；null 不过滤
    hasPromo?: boolean;         // 有优惠（promoText 非空）
}

export function applyStoreFilters(list, opts): StoreLike[]
export function sortStores(list, sort, favoriteIds: string[]): StoreLike[]
```

- 空值排序兜底：`deliveryMinutes` / `minOrderAmount` 为 null 时排最后（`Infinity`）。
- `default`：收藏店稳定置前，其余保持接口原顺序。
- 搜索/分类仍先经过现有 `filterStores()`，再筛选、排序。
- 首页同时叠加「收藏置前」，收藏状态变化后即时重排。

## 4. 后端改动（vendure 插件）

| 文件 | 改动 |
| --- | --- |
| `packages/campus-delivery-plugin/src/custom-fields.ts` | `Customer` 追加 `{ name: 'favoriteStores', type: 'string', nullable: true }` |
| `packages/campus-delivery-plugin/src/migrations/create-campus-tables.ts` | 末尾追加幂等 `ALTER TABLE customer ADD COLUMN IF NOT EXISTS "customFieldsFavoritestores" text;` |
| `packages/campus-delivery-plugin/src/favorite-shop.resolver.ts`（新增） | `@Resolver()`：`@Query() campusFavoriteStores(ctx)`、`@Mutation() campusToggleFavoriteStore(ctx, channelId)`，均 `@Allow(Permission.Authenticated)`；JSON 解析失败按空数组处理；更新用 `customerService.update(ctx, { id, customFields: { favoriteStores } })` |
| `packages/campus-delivery-plugin/src/campus-delivery.plugin.ts` | import 新 resolver；`shopApiExtensions.schema` 追加上述 `extend type`；`shopApiExtensions.resolvers` 注册 `FavoriteShopResolver` |

不改 admin schema；不做批量设置接口。

## 5. 前端改动（waimai）

| 文件 | 改动 |
| --- | --- |
| `src/api/queries/favorite.ts`（新增） | `CAMPUS_FAVORITE_STORES` / `CAMPUS_TOGGLE_FAVORITE_STORE` + `fetchFavoriteStores()` / `toggleFavoriteStore(channelId)` |
| `src/api/queries/waimai.ts` | 新增 `fetchProductListForChannel(channelToken)`：独立 `GraphQLClient`（`vendure-token` + Bearer），查询与 `fetchProductList()` 相同的商品字段；供再来一单校验可售 |
| `src/stores/favorites.ts`（新增） | Pinia：`ids: string[]`（本地镜像 `favorite_stores`）、`recents`（`recent_stores`，最多 6 条，字段 `{ channelId, channelToken, name, routes, at }`）；`isFavorite(channelId)`、`toggle(channelId): Promise<boolean>`、`touchRecent(store)`、`loadRemote()`；登录态下 toggle 远端失败则回滚并返回 false |
| `src/pages/home/index.vue` | ① 店铺卡右上收藏心（`@tap.stop`），已收藏实心；② 新增「常买店铺」横排（仅无关键词且有记录时，按 channelId/token 匹配当前店铺列表，失效记录隐藏，点击进店）；③ 搜索框下新增排序 chips（综合/配送最快/起送价最低/免配送费）+「筛选」按钮；④ 筛选底部弹层：仅营业中、免配送费、起送价 ≤15/20/30 元、有优惠，重置/完成；⑤ `shown` 组合 `filterStores → applyStoreFilters → sortStores`，空结果用筛选空态文案；⑥ `enterStore()` URL 追加 `&cid=` |
| `src/pages/shop/menu.vue` | ① 店铺卡右侧收藏心（`storeInfo?.channelId`，未加载完成时禁用点击）；② `onLoad` 记录常买（优先 query `cid`，否则等 `fetchStoreList()` 匹配到 `channelId` 后记录），并清洗 query `name` 参数（现有 `decodeURIComponent` 保留） |
| `src/pkg-order/pages/order-detail.vue` | ① `reorder()` 重写：登录校验 → 并行 `getOrdersForChannel(store.channelToken, { take: 1, filter: { code: { eq: order.code } } })` 定位原渠道 → `fetchProductListForChannel()` 校验每个 `line.productVariant.id` 是否存在/启用/有库存 → 弹层列商品与「已下架将跳过」→ 确认后 `tenant.switchTenant(token)`、逐行 `addItemToOrder(variantId, quantity)`、`cart.setOrder()`，失败行计数提示 → `navigateTo('/pages/shop/menu?token=&name=&routes=&cid=')`；全部失败则 `tenant.backToDefault()`；定位失败提示「店铺已下线」；② 弹层显示「正在定位店铺…」加载态 |
| `src/utils/store-filter.ts` | 3.3 所述纯函数 |
| `src/locale/zh-Hans.json` / `src/locale/en.json` | 同步新增全部文案（见 §6） |

约束：不加新依赖；不改购物车数据结构；不改订单号/支付流程；不改预约送达既有逻辑。

### 5.1 再来一单 UI 细节

- 底部弹层：标题「再来一单」；店铺名；商品行（图/名/×数量）；不可售行置灰 + 「已下架」；底部主按钮「加入购物车并进店」。
- 按钮触发时先 toast/loading 防重复；弹层内不显示登录按钮，未登录直接跳登录页。
- 加入成功提示：`已加入购物车（跳过 N 件）`；N=0 时不显示括号。
- 跳转参数 `routes` 取定位到的店铺 `routesEnabled.join(',')`。

## 6. i18n 文案键

- `home`：`recentTitle`、`sortDefault`、`sortFastest`、`sortMinOrder`、`sortFreeDelivery`、`filterBtn`、`filterTitle`、`filterOpenOnly`、`filterFreeDelivery`、`filterMinOrderLabel`、`filterPromo`、`filterReset`、`filterApply`、`favAdded`、`favRemoved`、`freeDeliveryTag`、`filteredEmpty`
- `menu`：`favAdd`、`favRemove`
- `orderDetail`：`reorderTitle`、`reorderLocating`、`reorderUnavailable`、`reorderSkipHint`、`reorderConfirm`、`reorderAdded`、`reorderSkipped`、`reorderAllSkipped`、`reorderNoShop`、`reorderLoading`
- zh-Hans 与 en 必须同时补齐；`home.tagAll` 等既有键不改。

## 7. 验收与验证

1. **后端编译**：`packages/campus-delivery-plugin` `pnpm build` 通过；`pnpm test`（vitest）通过。
2. **接口回归**（部署后线上）：
   - 未带 token 调 `campusFavoriteStores` → 返回 `NOT_LOGGED_IN`（证明 schema 已挂载）。
   - 登录测试账号：toggle → 查询列表包含/不包含该渠道 ID；重复 toggle 幂等翻转；非法渠道 ID 报错。
   - 部署重启后 `customer` 表存在列 `customFieldsFavoritestores`。
3. **前端构建**：`d:\zhao\waimai` `pnpm build:h5` 通过（若 pnpm 依赖状态检查失败，先修复本地 node_modules/pnpm 状态，不改业务代码）。
4. **手机视口截图**（Playwright 390×844，dpr=2）：
   - 首页：排序 chips + 筛选弹层展开 + 收藏心实心/空心 + 常买横排；
   - 店铺页：收藏心状态切换；
   - 订单详情：再来一单弹层（含下架行置灰）。
5. **回归**：预约送达（结算页选日期/时段 → 下单 → 订单详情显示时段）仍正常；首页搜索/分类不受新排序影响；进店/加购/结算主流程无回归。
6. **操作手册**：新增 `docs/waimai-操作手册-常用功能.md`（含上述截图与预约送达验证说明）。

## 8. 发布

- vendure：本地构建 → commit/push → 服务器 `cd /www/apps/vendure && git pull --ff-only && pm2 restart vendure`（等待 6-8s 后验证）。
- waimai：`node .secrets/deploy-waimai.mjs`（本地构建产物，服务器只解压）。
- 按「一气呵成」：完成 → 提交 → 推送 → 部署 → 线上回归，一次收口。

## 9. 风险与边界

- 店铺列表无经纬度/评分字段：排序仅用 `deliveryMinutes/minOrderAmount/deliveryFee`，不臆造「距离/评分排序」。
- `freeShippingThreshold` 是「满额免配送」门槛，不等同「免配送费」；免配送费筛选只认 `deliveryFee === 0`。
- 再来一单依赖订单行 `productVariant.id` 在当前渠道仍可售；商品被删除/换规格会跳过并提示，不自动替换。
- 收藏渠道被删除后，列表渲染时按现有店铺过滤，不显示幽灵店铺；远端列表仍保留 ID（不做清理）。
- 未登录用户收藏只在本机有效，换设备不同步（符合预期，文案不承诺云同步）。
