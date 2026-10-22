# 拾光达 外卖常用功能操作手册（收藏 / 常买 / 排序筛选 / 再来一单）

> 适用范围：顾客端 H5（`https://www.yourbao.cn/waimai/`，手机浏览器 / 微信内打开）
> 上线日期：2026-10-21
> 截图脚本：`node .secrets/common-features-shots.cjs`（Playwright 390×844 dpr=2）
> 后端接口：`campusFavoriteStores` / `campusToggleFavoriteStore`（campus-delivery-plugin，登录态）

## 1. 功能概览

| 功能 | 入口 | 说明 |
|---|---|---|
| 商家收藏 | 首页店铺卡右上角 ♡ / 店铺页店铺卡右侧「收藏」 | 登录用户云端保存；游客只存本机 |
| 常买店铺 | 首页「常买店铺」横排 | 本地记录最近进店的 6 家店，按当前店铺列表过滤失效店 |
| 排序 | 首页搜索下方 chips：综合 / 配送最快 / 起送价最低 / 配送费最低 | 收藏店铺始终置前；未配置值排最后 |
| 筛选 | 首页「⚙ 筛选」底部弹层 | 仅营业中、免配送费、有优惠、起送价上限（≤¥15/20/30） |
| 再来一单 | 订单详情底部「再来一单」 | 定位原店铺渠道 → 校验在售 → 加购 → 直达店铺菜单 |
| 预约送达（原有） | 结算页「校园配送」Tab | 选日期 + 时段，写入订单 `deliverySlotText/scheduledFor`，订单详情展示 |

## 2. 顾客操作

### 2.1 收藏店铺

1. 首页店铺卡右上角点 ♡（或进店后点店铺卡右侧「收藏」）；
2. 变成实心 ♥ 即已收藏，收藏店铺在「综合」排序中自动置前；
3. 再点一次取消收藏（提示「已取消收藏」）；
4. 未登录时收藏只保存在本机；登录后首次进入首页会把本机收藏补写到云端（仅当云端为空）。

![首页：排序 chips + 常买店铺 + 收藏心](screenshots/common-features/01-home-sort-fav-recent.png)
![店铺页：收藏按钮（已收藏）](screenshots/common-features/04-shop-favorite-btn.png)

### 2.2 排序与筛选

1. 搜索框下方横排排序：综合（默认）/ 配送最快 / 起送价最低 / 配送费最低；
2. 点「⚙ 筛选」打开底部弹层，可多选「仅营业中」「免配送费」「有优惠」，并限定起送价上限；
3. 条件即时生效，按钮显示「筛选 · N」角标；「重置」清空全部条件；
4. 无匹配店铺时显示「没有符合筛选条件的店铺」。

![筛选弹层](screenshots/common-features/02-home-filter-sheet.png)
![筛选生效（角标显示已选条件数）](screenshots/common-features/03-home-filtered.png)

### 2.3 再来一单

1. 「我的订单 → 订单详情 → 再来一单」；
2. 弹层显示原店铺与本单商品；已下架/无库存商品置灰标「已下架，将跳过」，底部提示跳过件数；
3. 点「加入购物车并进店」：系统自动切到原店铺渠道，逐件加购并跳到店铺菜单，购物车显示已加商品；
4. 全部商品不可售时提示「商品均已下架，无法再来一单」；原店铺下线时提示「店铺已下线，暂不支持再来一单」；
5. 未登录点「再来一单」会先跳登录页。

![再来一单确认弹层](screenshots/common-features/05-reorder-sheet.png)
![加购成功进入原店铺菜单](screenshots/common-features/06-reorder-landed-shop.png)

## 3. 预约送达（复核说明）

该能力在结算页已完整实现，本次未改动：

1. 结算页「校园配送」选择分区、宿舍楼后，日期 chips 默认「尽快送达」，可选未来日期；
2. 选日期后出现时段 chips（显示剩余容量），选中后提示「预约单将在时段开始前 30 分钟叫号」；
3. 提交订单写入 `deliverySlotId / deliverySlotText / scheduledFor`，订单状态为预约中；
4. 订单详情「商品信息」上方展示「预约送达：YYYY-MM-DD HH:mm-HH:mm」；
5. 未选时段时提交会被拦截并提示先选择时段。

## 4. 数据与接口

| 项 | 说明 |
|---|---|
| 收藏存储 | 表 `campus_favorite_shop`（`customerId + channelId` 唯一），与当前渠道无关，避免切渠道丢收藏 |
| 查询 `campusFavoriteStores` | 返回收藏渠道 ID 数组（收藏时间升序）；未登录返回 `NOT_LOGGED_IN` |
| 变更 `campusToggleFavoriteStore(channelId)` | 已收藏则取消，未收藏则收藏；返回最新完整数组；非法渠道返回 `CHANNEL_NOT_FOUND` |
| 前端本地键 | `favorite_stores`（收藏 ID 数组）、`recent_stores`（最近进店记录，最多 6 条） |
| 再来一单定位 | 遍历店铺列表 token 调 `getOrdersForChannel(token, { filter: { code } })`，命中即原渠道 |
| 可售校验 | 原渠道商品目录中变体存在、`enabled !== false` 且 `stockLevel` 为 `IN_STOCK/LOW_STOCK/空` |
| 配送费筛选口径 | 仅 `deliveryFee === 0` 算免配送费；`freeShippingThreshold`（满额免运）不计入 |

## 5. 验收记录（2026-10-21）

| 项 | 结果 |
|---|---|
| 插件编译 / vitest | 通过 |
| 未登录查询收藏 | `NOT_LOGGED_IN`（schema 已挂载） |
| 登录态 toggle 三次 | `["113"]` → `["113","114"]` → `["113"]` 正确翻转 |
| 非法渠道 ID | `CHANNEL_NOT_FOUND` |
| 首页点收藏（登录态） | 云端列表 `["114"]` → 点击 canteen-a → `["114","113"]` → 再点 → `["114"]` |
| 首页排序 / 常买 / 筛选 | 5 个排序 chips、2 条常买、筛选角标与结果正常 |
| 再来一单端到端 | 定位 canteen-a → 1 件在售加购成功 → 跳转店铺菜单，购物车 ¥2.05；测试后已清空测试账号购物车 |
| 手机视口截图 | 390×844 dpr=2，共 6 张（见上） |

## 6. 边界与已知限制

- 店铺列表无经纬度与评分字段，故不提供「距离/评分」排序；用配送时长、起送价、配送费替代。
- 「免配送费」只认配送费为 0；「满额免配送费」不是免配送费，避免误导。
- 收藏店铺下架后列表自动隐藏（云端记录保留，不做清理）。
- 游客收藏换设备不同步；登录后仅在云端为空时迁移本地收藏，避免覆盖云端数据。
- 再来一单不自动替换下架商品，只跳过并提示；加购失败会提示仍可手动进店选购。

---

# 第二轮常用功能（搜索 / 商品收藏 / 常买商品 / 订单中心 / 结算补强）

> 上线日期：2026-10-21（第二轮）
> 截图脚本：`node .secrets/common-features-v2-shots.cjs`（Playwright 390×844 dpr=2，输出 `docs/screenshots/common-features-v2/`）
> 后端接口：`campusFavoriteVariants` / `campusToggleFavoriteVariant`（campus-delivery-plugin，登录态）

## 7. 搜索升级

### 7.1 搜索面板（历史 + 热搜）

1. 首页点搜索框（关键词为空）即展开面板：
   - 「搜索历史」：本机最近 10 条，最新在前、自动去重，右侧「清空」可一键删除；
   - 「热搜」：由店铺标签与店铺名生成的 6 个热词，点一下直接搜索。
2. 键盘回车（`confirm-type=search`）提交搜索；点历史/热词等同提交并写入历史。

![首页搜索面板：历史 + 热搜](screenshots/common-features-v2/01-home-search-panel.png)

### 7.2 跨店商品搜索

1. 提交关键词后，除店铺过滤外，会并发搜索所有营业中店铺的商品目录（商品名/描述命中，每店最多 6 条、总计上限 24 条）；
2. 结果分「商品 / 店铺」两组：商品行显示主图、商品名、店铺名与价格；
3. 点商品行进入对应店铺菜单，并带 `q=` 关键词，商品区顶部显示「搜索：关键词」chip，可点 ✕ 恢复全量；
4. 无商品且无店铺命中时，展示「热销店铺推荐」（按月售取前 4）。

![跨店商品搜索结果](screenshots/common-features-v2/02-home-search-products.png)
![无结果：热销店铺推荐](screenshots/common-features-v2/03-home-search-empty.png)

## 8. 商品收藏与常买商品

### 8.1 商品收藏

1. 店铺菜单商品行右上角 ♡ / ♥：任一规格已收藏即显示实心；
2. 点 ♡ 收藏（记录代表规格）、点 ♥ 取消该商品全部已收藏规格，均有 toast；
3. 首页「收藏商品」横排（最多 8 个）展示本机/云端收藏商品，点一下进店并定位该商品；
4. 登录用户云端保存（表 `campus_favorite_variant`），游客仅存本机；登录后云端为空时会把本机收藏补写。

### 8.2 常买商品

1. 下单成功后自动记录本单商品（最多 8 条，按商品去重前置）；
2. 首页「常买商品」横排展示图片、名称、价格、店铺名；
3. 点一下进店并自动加购 1 件，提示「已加购」；商品下架/不可售时提示「加购失败」。

![店铺菜单：商品心标 + 搜索定位 chip + 购物车满减提示](screenshots/common-features-v2/06-shop-menu-heart-q.png)
![首页：收藏商品 + 常买商品](screenshots/common-features-v2/04-home-fav-recent-items.png)

## 9. 订单中心增强

1. 顶部搜索框：本地过滤已加载订单，支持订单号、店铺名、商品名（不额外请求）；
2. 售后聚合条：登录后拉取售后单，「售后处理中 N 单」>0 时展示；点一下只看有售后的订单，再点恢复全部；
3. 订单卡标记：`售后处理中` / `已退款` / `配送异常`，点售后标记直达售后详情；
4. 订单卡展示「送达时段：…」（预约单）；
5. 同一订单同时出现在平台与店铺渠道结果时自动去重，并优先显示店铺名。

![订单中心：搜索 + 售后聚合 + 售后标记](screenshots/common-features-v2/07-orders-search-aftersale.png)

> 说明：测试账号当前无真实售后单，该截图内的「售后处理中 1 单」为截图脚本模拟接口返回，仅用于验证聚合条/标记 UI；正式环境按真实 `myAfterSalesRequests` 数据显示。

## 10. 结算体验补强

### 10.1 起送价硬拦截

1. 结算页商品额 < 起送价时，合计区显示红色「还差 ¥D 起送」；
2. 点「提交订单」弹出「还差一点就起送」，可选「去加购」（返回上一页）或「再想想」（留在本页），**不会提交订单**；
3. 后端 `campusMinOrderProcess` 同口径兜底，绕过前端也无法提交；
4. 店铺菜单购物车栏在未达起送价时按钮显示「还差 ¥D 起送」并置灰，点了只提示。

### 10.2 满减凑单提示

1. 解析店铺 `promoText`（如「满20减4」「满 30 元减 5 元」）；
2. 未达门槛：结算页合计区与店铺购物车栏提示「再买 ¥D 可减 ¥Y」；
3. 已达门槛：提示「已满 ¥T 减 ¥Y」。

### 10.3 首页配送楼栋快捷切换

1. 结算页保存配送目标后，本机记录 `delivery_target`；首页头部显示「📍 分区 · 楼栋」；
2. 点「切换」打开底部弹层：选分区 → 选楼栋 → 保存；优先使用结算页缓存的楼栋数据，缺失时回退渠道接口；
3. 结算页再次进入时优先预选本机最近的楼栋（须属于当前店铺），其次默认校园地址，最后第一分区/首楼。

![结算页：满减凑单 + 起送价提示](screenshots/common-features-v2/08-checkout-minorder-promo.png)
![起送价拦截弹窗](screenshots/common-features-v2/09-checkout-minorder-block.png)
![首页楼栋快捷切换弹层](screenshots/common-features-v2/05-home-target-sheet.png)

## 11. 数据与接口（第二轮）

| 项 | 说明 |
|---|---|
| 商品收藏表 | `campus_favorite_variant`（`customerId + variantId` 唯一，另存 `channelId` 便于分组） |
| 查询 `campusFavoriteVariants` | 返回 `[{ variantId, channelId }]`（收藏时间升序）；未登录 `NOT_LOGGED_IN` |
| 变更 `campusToggleFavoriteVariant(variantId, channelId)` | 已收藏则取消，未收藏则收藏；校验渠道/商品存在，返回最新完整列表 |
| 前端本地键 | `search_history`（≤10）、`favorite_variants`（含展示元数据）、`recent_items`（≤8）、`delivery_target`、`delivery_target_options` |
| 商品搜索 | 店铺 token 并发 `fetchProductListForChannel` + `Promise.allSettled`，单店失败静默跳过 |
| 满减解析 | `src/utils/promo.ts`，正则 `满\s*X\s*元?\s*减\s*Y\s*元?`，多档按门槛升序 |
| 常买商品写入 | 支付成功跳转前遍历订单行写本机（含 `channelId/channelToken/storeName`） |

## 12. 验收记录（第二轮，2026-10-21）

| 项 | 结果 |
|---|---|
| 插件编译 / vitest | 通过 |
| 未登录 `campusFavoriteVariants` | `FORBIDDEN`（未授权，符合预期） |
| 登录态 toggle（variant 87 / channel 113） | `[{87,113}]` → 再 toggle 返回 `[]`，幂等翻转正常，测试数据已清理 |
| 非法 variant | `VARIANT_NOT_FOUND` |
| 搜索面板 | 历史 2 条、热搜 4 个正常展示 |
| 跨店商品搜索「鸡排」 | 命中 2 家店各 1 条（canteen-a / canteen-b） |
| 无结果搜索 | 0 商品 + 热销店铺 2 家推荐 |
| 收藏/常买横排 | 各 1 条展示，名称与价格正确 |
| 店铺菜单 | `搜索：鸡排` chip、商品心标 1 个、购物车「再买 ¥17.95 可减 ¥4」 |
| 订单中心 | 搜索框正常；模拟售后 1 单聚合条正常；3 单（去重后）展示正常 |
| 结算拦截 | 「还差 ¥12.95 起送」提示 + 弹窗「再想想 / 去加购」，不提交 |
| 满减提示 | 「再买 ¥17.95 可减 ¥4」结算页与菜单一致 |
| 楼栋切换 | 首页显示「东区 · 桂2栋」，弹层分区/楼栋选中正确 |
| 手机视口截图 | 390×844 dpr=2，共 9 张（见上） |
| 测试数据清理 | 测试账号购物车与临时商品收藏已清理 |

## 13. 边界与已知限制（第二轮）

- 商品搜索按店铺逐个拉取整店商品，店铺较多时请求数随之增加；当前单校区店铺规模（2 家）体验良好，后续可后端化统一检索。
- 搜索结果为纯前端过滤，不含拼写纠错/同义词。
- 热搜词由店铺标签与店名生成，非真实搜索热度统计。
- 收藏商品云端只存 `variantId/channelId`，展示元数据（名称/图/价）存本机；换设备后首次进入首页会按渠道商品目录回填（商品下架则显示占位）。
- 常买商品为纯本机记录，换设备不同步。
- 满减提示仅解析 `promoText` 文本，实际优惠仍以平台优惠券/活动计算为准。
- 首页楼栋切换仅写本机偏好；实际下单仍以结算页所选分区/楼栋为准。

---

# 第三轮常用功能（售罄库存 / 领券入口 / 餐具发票 / 待评价与状态刷新）

> 上线日期：2026-10-21（第三轮）
> 截图脚本：`node .secrets/common-features-v3-shots.cjs`（Playwright 390×844 dpr=2，输出 `docs/screenshots/common-features-v3/`）
> 后端变更：Order customField 新增 `tablewareCount`（int，可空）

## 14. 商品售罄 / 库存展示

1. 店铺菜单商品行按 `stockLevel` 展示状态：
   - `OUT_OF_STOCK`（所有规格均售罄）：整行置灰，价格旁显示「售罄」标签，右侧 `+` 置灰；
   - `LOW_STOCK`（存在低库存规格）：显示「仅剩少量」标签，仍可正常加购；
   - `null`（不跟踪库存）/ `IN_STOCK`：不展示标签。
2. 售罄商品点 `+` 只提示「该商品已售罄」，不打开规格弹层、不写入购物车；`addToCart` 内部亦做不可售守卫，防止并发/缓存导致误加。
3. 规格弹层（SkuSheet）同步兼容枚举库存：
   - 售罄规格不可选、按钮禁用，库存文案显示「暂无库存」；
   - 低库存显示「仅剩少量」；数字库存显示「库存 N」，不再出现 `NaN`。

![店铺菜单：售罄置灰 + 仅剩少量标签](screenshots/common-features-v3/03-shop-soldout.png)

> 说明：测试校区当前商品均为 `IN_STOCK`，截图中「仅剩少量 / 售罄」为截图脚本对接口返回的 `stockLevel` 注入枚举值，用于验证 UI 分支；真实库存由商家后台设置。

## 15. 领券中心入口 + 券角标

1. 首页快捷区新增「领券中心」（🎟️），点击进入 `/pkg-promotion/pages/coupon-centre`；
2. 个人中心资产区新增「领券中心」入口，与「优惠券（我的券包）」并列；
3. 首页入口右上角显示未使用券数量角标（登录态 `myCoupons(status: UNUSED)`，>99 显示 `99+`）；未登录不请求、不显示，请求失败静默置 0，不阻塞店铺列表加载；
4. 首页每次 `onShow`（切回 tab / 从领券中心返回）刷新角标。

![首页：领券中心入口 + 券角标](screenshots/common-features-v3/01-home-coupon-entry.png)
![个人中心：资产区领券中心入口](screenshots/common-features-v3/02-profile-coupon-entry.png)

> 说明：测试账号当前未使用券为 0，截图中角标「3」为脚本模拟券数量，用于验证角标样式与位置；真实数量按接口返回。

## 16. 结算页餐具份数 + 发票抬头

### 16.1 餐具份数

1. 结算页「订单备注」下方新增「餐具份数」卡片：无需餐具 / 1–5 份，默认「无需餐具」；
2. 选中项高亮，随订单写入 `Order.customFields.tablewareCount`（int，0=无需餐具）；
3. 商家工作台/小票可按该字段配餐。

### 16.2 发票抬头

1. 「发票」行显示当前选择（默认「不开发票」）；点击打开底部弹层单选；
2. 抬头数据来自顾客 `customFields.invoiceTitles`（与「我的-发票抬头」同一数据源）；
3. 无抬头时点击发票行：提示「暂无发票抬头，请先到「我的-发票抬头」添加」并跳转发票抬头管理页（弹层内不嵌新增表单）；
4. 提交订单前写入：
   - 未选抬头：`invoiceApplied=false, invoiceInfo=null`；
   - 已选抬头：`invoiceApplied=true, invoiceInfo={"titleName","titleType","taxNo","email","appliedAt"}`；
5. 写入与备注、餐具份数在同一次 `setOrderCustomFields` 中完成，位于 `transitionOrderToState(ArrangingPayment)` 之前。

![结算页：餐具份数 + 发票行](screenshots/common-features-v3/04-checkout-tableware-invoice.png)
![发票抬头弹层](screenshots/common-features-v3/05-checkout-invoice-sheet.png)
![选中抬头后回显](screenshots/common-features-v3/06-checkout-invoice-picked.png)

> 说明：测试账号当前无发票抬头，抬头列表为截图脚本注入的模拟数据；接口写入能力已用真实 `setOrderCustomFields` 回归（见 §18）。

## 17. 订单待评价提醒 + 状态自动刷新

### 17.1 待评价聚合

1. 登录后订单页拉取 `myReviews` 构建「已评价 orderLineId 集合」（剔除 deleted）；
2. 已送达（`state=Delivered`）且仍有未评价商品行的订单计入「待评价 N 单」；
3. 顶部绿色聚合条「待评价 N 单 / 只看待评价」：点击只看待评价订单，切换时自动关闭售后筛选（两筛选互斥）；
4. 订单卡底部显示「去评价」按钮，取第一条未评价商品行跳评价页（带 productId/lineId/variantId/名称/图片）；
5. 从评价页返回（`onShow`）重新拉取评价集合，已评价订单按钮即时消失。

### 17.2 状态自动刷新

1. 订单页 `onShow` 启动 30 秒轮询，`onHide/onUnload` 停止；
2. 每轮对各店铺渠道拉取最近 10 单（不带 tab 过滤），仅同步本地订单 `state`，不触发 loading、不改变分页游标；
3. 检测到状态变化时提示「订单状态已更新」（同一轮多次变化只提示一次）；请求失败静默。

![订单中心：待评价聚合条 + 去评价按钮](screenshots/common-features-v3/07-orders-pending-review.png)
![只看待评价](screenshots/common-features-v3/08-orders-pending-filter.png)

> 说明：测试账号当前无已送达订单，截图脚本将首单 `state` 模拟为 `Delivered` 以验证聚合条/按钮；真实判定按订单状态与评价记录。

## 18. 验收记录（第三轮，2026-10-21）

| 项 | 结果 |
|---|---|
| 后端插件 `pnpm build` | 通过，`lib` 产物已提交 |
| `tablewareCount` 字段上线 | shop-api introspection `OrderCustomFields` 已含 `tablewareCount: Int` |
| `setOrderCustomFields` 写入 | 真实写入 `note/tablewareCount=2/invoiceApplied=true/invoiceInfo` 成功，随后重置为 `null/0/false/null` |
| 商品售罄 UI | 注入 `OUT_OF_STOCK` 后整行置灰、标签「售罄」、`+` 禁用；`LOW_STOCK` 显示「仅剩少量」 |
| 首页领券入口 + 角标 | 快捷区 5 项均分不溢出，角标「3」显示在右上角 |
| 个人中心入口 | 资产区 5 项：优惠券 / 领券中心 / 常用地址 / 发票抬头 / 邀请好友 |
| 结算餐具 | 选「2 份」高亮，默认「无需餐具」 |
| 结算发票 | 弹层含「不开发票 + 2 条抬头」，选中回显「张同学 已选择」 |
| 订单待评价 | 聚合条「待评价 1 单」，首单出现「去评价」；点击后仅剩 1 单 |
| 前端构建/部署 | `pnpm build:h5` 通过（产物 2546 KB），线上入口已更新 |
| 测试数据清理 | 测试账号购物车已清空，`tablewareCount/invoice*` 已重置 |
| 手机视口截图 | 390×844 dpr=2，共 8 张（见上） |

## 19. 边界与已知限制（第三轮）

- 售罄判定以 `stockLevel` 枚举为主，商城未启用库存跟踪（`null`）时无法区分售罄，需商家自行下架商品。
- 售罄商品的「已加购」历史行不会被自动移除，提交时由后端库存校验拦截。
- 发票仅记录抬头快照，不生成/上传 PDF，开票流程仍走商家侧（订单 `invoiceApplied` 后不再重复申请）。
- 餐具份数仅写订单字段，商家工作台打印/展示需另行支持该字段。
- 待评价判定依赖 `myReviews` 全量返回；评价量很大时后续改为后端分页/按订单查询。
- 订单状态轮询为 30 秒固定间隔，仅在订单页可见时运行；退到后台即停止，不消耗流量。
- 「去评价」每次跳转第一条未评价商品行，一单多商品需多次进入评价页。

## 20. 运维记录（2026-10-21）

- 现象：线上 `shop-api` 返回 502，首页正常但接口不可用。
- 根因：`/home/admin/.pm2/logs/vendure-out.log` 增长至 13G，磁盘使用率 100%，PostgreSQL 容器 `could not write lock file postmaster.pid: No space left on device` 后崩溃重启循环，pm2 进程列表同时丢失。
- 处置：
  1. 截断 `vendure-out.log` / `strapi-out.log`（释放 13G），`journalctl --vacuum-size=500M` 再释放 1.8G；
  2. 重启 PostgreSQL 容器，`pm2 resurrect` 恢复 `vendure / nshop / strapi` 三个进程；
  3. 安装并配置 `pm2-logrotate`（`max_size=100M`、`retain=5`、`compress=true`、每日轮转），防止日志再次撑满磁盘。
- 验证：`shop-api` 恢复 200；`activeChannel` 正常返回；磁盘占用回落至 62%。
- 说明：13G 日志源自历史上某次以 `SQL_LOG=1` 启动的进程（TypeORM query 日志），当前进程环境无 `SQL_LOG`，重启后不再刷查询日志。

---

# 第四轮常用功能（商品排序 / 搜索联想 / 营业时间公告 / 订单统计与临期券）

> 上线日期：2026-10-21（第四轮）
> 截图脚本：`node .secrets/common-features-v4-shots.cjs`（Playwright 390×844 dpr=2，输出 `docs/screenshots/common-features-v4/`）
> 后端变更：`Channel.customFields.waimaiBusinessHours`（string）、`Product.customFields.waimaiMonthlySales`（int）；`waimaiStoreList` 透出 `businessHours`

## 21. 店铺菜单商品排序 + 售罄置底

1. 店铺菜单「商品」Tab 顶部新增排序 chips：`综合 / 销量 / 价格 ↑↓`，默认综合（保持后台排序）；
2. **销量**：按 `Product.customFields.waimaiMonthlySales` 降序，未配置按 0 处理；
3. **价格**：取该商品可售规格的最低 `priceWithTax` 升序；再次点击价格切换为降序（箭头同步 `↑ / ↓`）；
4. **售罄恒置底**：所有排序模式下，售罄商品（`stockLevel=OUT_OF_STOCK`）一律排在可售商品之后，且组内仍按当前排序键排序；
5. 首次触发排序且存在售罄商品时，Toast 提示「售罄商品已置底」；
6. 排序为纯本地内存计算，不重新请求接口、不打断滚动位置。

![店铺菜单：排序 chips + 价格升序](screenshots/common-features-v4/03-menu-sort.png)

> 说明：`waimaiMonthlySales` 由商家后台（渠道商品 customFields）维护，测试环境已配置 328 / 156 / 12 用于演示。

## 22. 首页搜索联想

1. 搜索框聚焦且已输入关键词时，在原历史/热搜面板位置展示**联想面板**（两者互斥，不会重叠）；
2. 分组规则（均为本地计算，不发请求）：
   - **店铺**：店铺名包含关键词的店铺（最多 4 条），右侧展示配送时长 / 起送价等 meta；
   - **历史**：本地搜索历史中包含关键词的词条（最多 3 条）；
   - **热搜**：本地热搜词中包含关键词的词条（最多 3 条）；
3. 点击任意联想行即用该词直接提交搜索；
4. 无任何匹配时不展示空面板，保持原有店铺列表；
5. 清空输入或失焦后恢复历史/热搜面板与正常列表。

![首页：搜索联想面板](screenshots/common-features-v4/01-home-search-suggest.png)

## 23. 店铺营业时间 + 店铺公告

1. 营业时间由渠道配置下发：`Channel.customFields.waimaiBusinessHours` → `waimaiStoreList.businessHours`；
2. 店铺菜单「商家」Tab 展示动态营业时间，未配置时回退文案 `10:00–22:00`（不再是硬编码唯一值）；
3. 店铺公告沿用 `campus_fulfillment_config.storeNotice`，仅在有值时展示「📣 店铺公告」行；
4. 演示数据：`canteen-a` = `10:00-22:00`，`canteen-b` = `11:00-21:30`。

![店铺菜单：营业时间 + 店铺公告](screenshots/common-features-v4/04-menu-hours.png)

## 24. 个人中心订单统计 + 券临期提醒

### 24.1 个人中心订单角标

1. 「我的」订单快捷区（待付款 / 待送达 / 待评价）右上角显示未处理订单数，>99 显示 `99+`；
2. 统计口径与订单入口 Tab 一致：
   - 待付款：`ArrangingPayment`；
   - 待送达：`PaymentAuthorized` / `PaymentSettled`（与入口 Tab 过滤条件相同）；
   - 待评价：`Delivered` 且存在未评价订单行（剔除已删除评价）；
3. 跨渠道聚合：按 `waimaiStoreList` 的渠道 token 逐店拉取最近 20 单，按订单 id 去重；单店失败不影响其他店，整体失败静默置 0；
4. 每次 `onShow` 刷新，未登录不请求、不展示角标。

![个人中心：待付款 / 待送达 / 待评价角标](screenshots/common-features-v4/05-profile-order-badges.png)

### 24.2 首页临期券提示 + 券包临期标记

1. 首页在优惠横幅下方新增「⏰ N 张券即将过期」提示条（3 天内到期的未使用券），点击直达「我的优惠券」；
2. 数量与首页「领券中心」角标复用同一份 `myCoupons(status: UNUSED)` 数据，避免重复请求；
3. 券包「未使用」Tab 按 `expiredAt` 升序排列（无到期时间排最后）；
4. 3 天内到期的券卡片右上角显示「即将过期」角标。

![首页：临期券提示条](screenshots/common-features-v4/02-home-coupon-expiring.png)
![券包：即将过期标记 + 到期时间升序](screenshots/common-features-v4/06-my-coupons-expiring.png)

## 25. 验收记录（第四轮，2026-10-21）

| 项 | 结果 |
|---|---|
| 后端插件 `pnpm build` | 通过，提交 `6fdf5c1f2`（字段 + 透出）、`401619c91`（Product customFields 合并修复） |
| `waimaiStoreList.businessHours` | 线上返回 `canteen-a=10:00-22:00`、`canteen-b=11:00-21:30` |
| `Product.customFields.waimaiMonthlySales` | introspection 可见，线上商品查询返回 `null`（未配置商品）不报错 |
| 菜单排序 | chips `综合 / 销量 / 价格 ↑` 均展示；点价格后商品顺序变化（¥0.00 → ¥2.05 → ¥3.05） |
| 售罄置底 | 逻辑内置（当前测试商品无售罄，售罄分支由 `OUT_OF_STOCK` 判定） |
| 搜索联想 | 输入「麻」后面板展开，分组「历史」含「麻辣拌面」，点击可搜索 |
| 营业时间/公告 | 商家 Tab 显示 `10:00-22:00`，公告「新店开业，满20减4，欢迎光临」 |
| 个人中心角标 | 待付款 1 / 待送达 1 / 待评价 1 |
| 首页临期券 | 提示条「2 张券即将过期」，领券中心角标 2 |
| 券包临期 | 「即将过期」2 张，按到期时间升序 |
| 前端构建/部署 | `pnpm build:h5` 通过，产物校验 2556 KB，线上入口 `index-DcL6Ph0B.js` 已更新 |
| 线上回归 | 首页 200；`assets/index-BqSorris.js`、`pages-shop-menu.CaOE8lIz.js`、`waimai.BZrkQLRO.js` 均含新功能代码 |
| 数据修正 | 演示店铺公告/地址/电话由测试乱码改为正式文案（仅演示渠道 113/114） |
| 手机视口截图 | 390×844 dpr=2，共 6 张（见上） |

## 26. 边界与已知限制（第四轮）

- `waimaiMonthlySales` 为手工维护的静态月销，不随订单实时累加；如需实时销量需在订单完成后回写商品字段。
- 排序仅作用于当前已加载的商品列表（单店商品量为单页全量），不做服务端分页排序。
- 搜索联想为本地匹配，依赖已加载的店铺列表与本地历史/热搜；未加载的店铺不会出现在联想中。
- 营业时间为单段字符串展示，不解析多时段（如午市/晚市分开），也不参与「营业中/休息中」判定（该判定沿用原配置）。
- 订单角标最多统计各渠道最近 20 单，历史积压的未付款旧单可能不计入。
- 临期券阈值固定 3 天，暂未做成后台可配。




---

# 第五轮常用功能（商品详情 / 订单进度与费用 / 分享 / 凑单推荐）

> 上线日期：2026-10-21（第五轮）
> 截图脚本：`node .secrets/common-features-v5-shots.cjs`（Playwright 390×844 dpr=2，输出 `docs/screenshots/common-features-v5/`）
> 前端改动文件：`src/components/SkuSheet.vue`、`src/pages/shop/menu.vue`、`src/pkg-order/pages/order-detail.vue`、`src/utils/share.ts`（新增）、`src/locale/zh-Hans.json`、`src/locale/en.json`
> 无后端改动（复用现有 shop-api 字段）

## 27. 商品详情弹层

1. 店铺菜单点击任意商品（单规格 / 多规格一致）先打开详情弹层，不再直接加购；
2. 弹层内容：
   - 左上商品主图（200rpx）、商品名；
   - 标签行：评分 `★ 4.0`、评价数、`月售 328`（无数据自动隐藏）；
   - 价格（当前规格）、库存/售罄状态、已选提示；
   - **商品详情**：`description` 纯文本化展示（剥离 HTML 标签，避免富文本注入）；
   - 规格分组、数量加减、底部「加入购物车 / 立即购买」；
3. 右上角 `↗` 分享商品、`✕` 关闭；
4. 售罄商品点击仍走原「已售罄」Toast，不打开弹层。

![商品详情弹层](screenshots/common-features-v5/07-product-detail.png)

## 28. 订单详情增强：订单进度 + 费用明细

### 28.1 订单进度时间轴（非校园路线订单）

- 四步节点：`提交订单 → 支付成功 → 商家备餐 / 配送中 → 已送达`；
- 推导规则：
  - 提交订单：始终完成，时间取 `createdAt`；
  - 支付成功：`PaymentAuthorized / PaymentSettled / Shipped / PartiallyDelivered / Delivered / Completed`，时间取首笔支付 `payments[0].createdAt`；
  - 配送中：上述状态或 `customFields.deliveryStatus ∈ {assigned, in_progress, delivered}`；
  - 已送达：`Delivered / PartiallyDelivered / Completed` 或 `deliveryStatus = delivered`；
- 已取消 / 修改中订单改为两步：`提交订单 → 订单已取消`；
- 校园路线订单（`campusRoute` 有值）继续使用原有校园 R2 时间轴，不重复展示。

### 28.2 费用明细

- 商品总额、配送费（0 元显示「免配送费」）；
- **逐条优惠**：`order.discounts[]` 按 `description` 展示（如「满20减4」），金额右对齐绿色；
- 实付金额（`totalWithTax`）；
- 底部「共优惠 ¥4.00」（优惠合计 > 0 时展示）；
- 保留原优惠券码、订单编号、下单时间、支付方式。

![订单进度](screenshots/common-features-v5/09-order-progress.png)
![费用明细](screenshots/common-features-v5/10-order-fee-detail.png)

## 29. 分享店铺 / 商品 / 订单

1. 新增 `src/utils/share.ts`：
   - `absoluteUrl(path)`：站内路由 → 当前站点绝对地址（hash 路由，兼容子路径部署）；
   - `sharePage({title, desc, path, image})`：微信内调用 JS-SDK（`updateAppMessageShareData` / `updateTimelineShareData`，旧版 API 兜底）；非微信环境复制链接并提示「链接已复制」；返回实际渠道 `wechat | copy`；
2. 店铺菜单店铺卡片新增 `↗ 分享`（与收藏并排）：分享标题=店铺名，链接带 `token/name/routes/cid`，好友打开直达该店；
3. 商品详情弹层右上 `↗`：分享标题=商品名，描述=「来自 XX 的推荐」，直达店铺；
4. 订单详情底部「分享订单」：标题=「我的外卖订单 {code}」，链接直达订单详情；
5. JS-SDK 签名失败（非公众号域名/未授权）自动降级为复制链接，不阻断交互。

![店铺分享（复制链接兜底）](screenshots/common-features-v5/11-share-shop.png)

## 30. 凑单推荐

1. 触发条件（购物车非空且满足其一）：
   - 未达起送价：`cartTotal < minOrderAmount`，优先展示「还差 ¥X 起送」；
   - 已达起送但未满足下一档满减：解析店铺 `promoText`，展示「还差 ¥X 可减 ¥Y」；
2. 位置：店铺页底部购物车条上方悬浮卡片，标题「凑单推荐」+ 右侧差额提示；
3. 推荐商品：当前已加载商品中，可售且价格 > 0，取最低价规格、排除已在购物车的商品、按价格升序取前 8 个；
4. 点击卡片即加购 1 件并 Toast「已加入购物车」，差额实时重算；达成门槛后卡片自动消失；
5. 购物车为空或无门槛时不展示。

![凑单推荐](screenshots/common-features-v5/08-cross-sell.png)

## 31. 验收记录与边界（第五轮，2026-10-21）

| 项 | 结果 |
|---|---|
| 商品详情弹层 | 名称「可乐鸡排饭」，标签 `★ 4.0` / `1条评价` / `月售328`，详情「冒烟测试商品」，分享按钮存在 |
| 订单进度 | 四步齐全「提交订单/支付成功/商家备餐·配送中/已送达」，时间正常 |
| 费用明细 | 商品 ¥30.00、免配送费、满20减4 -¥4.00、实付 ¥26.00、共优惠 ¥4.00 |
| 凑单推荐 | 模拟购物车 ¥8（起送 ¥15）→ 提示「还差 ¥7 起送」，推荐可乐鸡排饭 / 麻辣拌面 |
| 分享 | 分享按钮存在，非微信环境弹出「链接已复制」 |
| i18n | `zh-Hans.json` / `en.json` 均补齐新增词条并通过 JSON 校验 |
| 前端构建/部署 | `pnpm build:h5` 通过，产物校验 2569 KB，已部署 |
| 手机视口截图 | 390×844 dpr=2，共 5 张（07–11） |

边界与已知限制：
- 商品详情描述为纯文本（后端为 HTML 描述），图片详情/富文本图文暂不渲染；
- 订单进度时间轴基于订单状态推导，未接入骑手实时轨迹（校园路线订单另有跟踪页）；
- 分享在非微信环境走复制链接；微信内卡片需公众号 JS 安全域名与签名服务可用；
- 凑单推荐只从当前店铺已加载商品中挑选，不跨店推荐；满减门槛解析自 `promoText` 文案，非结构化配置；
- 单规格商品也进入详情弹层（原为直接加购），交互多一步，已在手册注明。

---

# 第六轮常用功能（消息中心 / 跨店购物车 / 备注模板 / 收藏管理）

> 上线日期：2026-10-21（第六轮）
> 截图脚本：`node .secrets/common-features-v6-shots.cjs`（Playwright 390×844 dpr=2，输出 `docs/screenshots/common-features-v6/`）
> 新增页面：`src/pkg-user/pages/messages.vue`、`src/pkg-order/pages/cart.vue`、`src/pkg-user/pages/favorites.vue`
> 新增 store：`src/stores/messages.ts`
> 修改文件：`src/pages/home/index.vue`、`src/pages/profile/index.vue`、`src/pkg-order/pages/checkout.vue`、`src/api/queries/order.ts`、`src/api/mutations/cart.ts`、`src/pages.json`、`src/locale/zh-Hans.json`、`src/locale/en.json`、`src/locale/uni-app.zh-Hans.json`、`src/locale/uni-app.en.json`
> 后端：无改动，全部复用现有 shop-api（`waimaiStoreList`、`myOrders`、`myCoupons`、`myReviews`、`activeOrder`、`removeAllOrderLines`）

## 32. 消息通知中心

### 32.1 入口

- 首页右上角铃铛 `🔔`，未读数红色角标（> 99 不截断，最多展示三位）；
- 「我的」页面菜单新增「消息中心」，右侧红色未读数；
- 首页 / 我的页每次 `onShow` 都会刷新消息（不轮询、无推送）。

### 32.2 聚合口径（不新增后端接口）

| 消息类型 | 来源 | 判定条件 | 点击跳转 |
|---|---|---|---|
| 待付款 | 各店铺渠道 `myOrders` | `state = ArrangingPayment` | 订单详情 |
| 配送中 | 同上 | `state ∈ {PaymentAuthorized, PaymentSettled}` | 订单详情 |
| 待评价 | 同上 + `myReviews` | `state = Delivered` 且存在未评价 `orderLine` | 订单详情 |
| 券即将过期 | `myCoupons(UNUSED)` | `expiredAt` 距今 ≤ 3 天且未过期 | 券包（我的券） |

- 订单按**店铺渠道逐个查询**（会话全局 + `vendure-token` 隔离），按订单 `id` 去重；
- 展示顺序按时间倒序（订单取 `updatedAt`，券取 `expiredAt`），最多 50 条；
- 每店取最近 20 单，历史积压的老单可能不出现。

### 32.3 已读管理

- 消息 key：订单 `order-{id}-{state}`、券 `coupon-{id}`；订单状态变化后会生成新 key → 重新变为未读；
- 点击卡片：标记已读 + 跳转；右上「全部已读」一键清空未读；
- 已读 key 存本地 `waimai_msg_read`，不跨设备同步；
- 未登录：空态「登录后查看消息」+ 去登录按钮。

![首页铃铛角标 + 购物车快捷入口](screenshots/common-features-v6/12-home-bell-cart.png)
![消息中心](screenshots/common-features-v6/13-messages.png)

## 33. 跨店购物车管理页

1. 入口：首页快捷区「🛒 购物车」、「我的」菜单「购物车」；
2. 数据口径：Vendure `activeOrder` 按渠道隔离，页面用**独立 GraphQLClient 逐店读取**（`getActiveOrderForChannel`），只展示当前有商品行的店铺；
3. 每张店铺卡片：
   - 店铺头：logo / 店名 / 件数 / 「清空」；
   - 商品行：缩略图、名称、规格、行小计、数量；
   - 底部：商品合计（`subTotalWithTax`）、差额提示（`还差 ¥X 起送` / `已达起送价`）；
4. 操作：
   - 「继续加购」→ 带 `token/name/routes/cid` 回店铺菜单；
   - 「清空」→ 二次确认后调用 `removeAllOrderLinesForChannel`（仅清该店，不影响其他店）；
   - 「去结算」→ 未达起送价 Toast 拦截；达成则 `switchTenant(token)` + `cart.setOrder(order)` 后跳结算页（携带 `routes/minOrder/dfee/cid/shop/token`）；
5. 离开页面自动 `backToDefault()` 恢复站点默认渠道，避免影响订单/个人中心聚合。

![跨店购物车](screenshots/common-features-v6/14-cart-groups.png)

## 34. 订单备注模板

1. 结算页「订单备注」卡片新增常用模板 chips：
   - 内置 5 条：`不要辣 / 少盐 / 不要香菜 / 多放酱 / 不需要餐具`（走 i18n）；
   - 自定义模板：最多 8 条，存本地 `order_note_templates`，与内置文案去重；
2. 交互：
   - 点 chip 追加到备注（多条以「；」拼接），已存在的再点即移除；总长上限 200 字；
   - chip 右侧「+ 添加」打开「常用备注」管理弹层：自定义列表可删除、输入框 + 「添加」、「完成」关闭；
   - 顶部「管理常用」也可打开同一弹层；
3. 兼容：不使用模板时可直接手输，模板为空时输入区不受影响；自定义模板不跨设备同步。

![备注模板 chips](screenshots/common-features-v6/15-checkout-note-templates.png)
![常用备注管理弹层](screenshots/common-features-v6/16-note-manage-sheet.png)

## 35. 收藏管理页

1. 入口：「我的」→「我的收藏」；
2. 两个 tab 带计数：`收藏店铺 N` / `收藏商品 N`；
3. 收藏店铺：
   - 用 `waimaiStoreList` 与本地收藏 `channelId` 取交集，只展示仍在营业列表中的店；
   - 展示店名、营业时间/配送方式（`businessHours` + routes 摘要）、起送价；休息中显示「休息中」；
   - 「取消收藏」即时移除；点击卡片进店；
4. 收藏商品：
   - 两列卡片：名称、店铺名、价格快照；点击进店并带 `&q=商品名` 定位搜索；
   - 「取消收藏」即时移除；空态引导回首页；
5. 数据仍沿用本地 `favorite_stores` / `favorite_variants`，登录后由 `favorites.loadRemote()` 与云端收藏合并。

![我的收藏-店铺](screenshots/common-features-v6/17-favorites.png)
![我的收藏-商品](screenshots/common-features-v6/18-favorites-items.png)

## 36. 验收记录与边界（第六轮，2026-10-21）

| 项 | 结果 |
|---|---|
| 首页入口 | `{"bell":true,"badge":"4","quick":["我的订单","传信者加入","校内拾光达","购物车","校园公告","领券中心"]}` |
| 消息中心 | 4 张卡片（1 张临期券 + 3 张配送中订单），头部「未读 4」；点击/全部已读逻辑正常 |
| 跨店购物车 | `{"cards":1,"store":"canteen-a","lines":["可乐鸡排饭","冰可乐"],"gap":"还差 ¥7.00 起送","total":"¥8.00"}` |
| 备注模板 | chips = 内置 5 条 + `+ 添加`；点选后 `active=["不要辣","少盐"]`、备注「不要辣；少盐」、字数 6/200 |
| 备注管理弹层 | `{"open":true,"title":"常用备注"}`，空态文案「还没有自定义备注」+ 输入框 + 添加/完成 |
| 收藏管理 | 店铺 tab `["收藏店铺1","收藏商品2"]`、店铺 `canteen-b`；商品 tab `["可乐鸡排饭","麻辣拌面"]` |
| i18n | `zh-Hans.json` / `en.json` / `uni-app.*.json` 四份均补齐并通过 `JSON.parse` 校验 |
| 前端构建/部署 | `pnpm build:h5` 通过（产物 2608 KB），`node .secrets/deploy-waimai.mjs` 部署成功 |
| 线上回归 | 首页 200；入口 `assets/index-BBFQCqd0.js`；新页面 chunk `pkg-user-pages-messages.4fN8WEwA.js` / `pkg-user-pages-favorites.CfFMTJCd.js` / `pkg-order-pages-cart.CNUui-Kr.js` 均含新增 i18n key；首页 chunk 含 `bell-badge`，我的页 chunk 含三条新菜单路由，结算 chunk 含 `note-sheet` |
| 手机视口截图 | 390×844 dpr=2，共 7 张（12–18） |

边界与已知限制：
- 消息为**拉取式聚合**，无系统推送/订阅消息；已读状态仅存本地，换设备会重新显示未读；
- 订单类消息每店只取最近 20 单、总条数上限 50，历史老单可能不出现；`Shipped / PartiallyDelivered` 状态暂未归入「配送中」；
- 购物车差额按**商品小计**对比起送价（不含运费与优惠），与实际结算门槛可能有差异；
- 购物车页按店铺数逐店请求（并行），店铺较多时首屏请求数相应增加；
- 备注自定义模板上限 8 条、本机存储；备注总长 200 字由前端截断；
- 收藏商品卡片的价格/名称是收藏时的本地快照，实时价格以进店后为准；已下架商品仍会展示快照，点进店后由店铺页面兜底。

---

# 第七轮常用功能（售后中心 / 开票闭环 / 评价增强 / 帮助中心）

> 上线日期：2026-10-21（第七轮）
> 截图脚本：`node .secrets/common-features-v7-shots.cjs`（Playwright 390×844 dpr=2，输出 `docs/screenshots/common-features-v7/`）
> 新增页面：`src/pkg-order/pages/after-sales.vue`、`src/pkg-user/pages/help.vue`
> 修改文件：`src/pkg-order/pages/order-detail.vue`、`src/pkg-order/pages/my-reviews.vue`、`src/pages/profile/index.vue`、`src/pages.json`、`src/locale/zh-Hans.json`、`src/locale/en.json`、`src/locale/uni-app.zh-Hans.json`、`src/locale/uni-app.en.json`
> 后端：无改动，复用 `myAfterSalesRequests` / `orderByCode` / `activeCustomer(invoiceTitles)` / `myReviews`

## 37. 售后中心（我的售后）

### 37.1 入口与角标

- 「我的 → 我的售后」；菜单右侧红色角标 = 处理中单量（`Pending / Approved / Received / Appealed`），失败静默不展示；
- 进入页面即刷新，按 `createdAt` 倒序展示最近 20 条（与 `fetchMyAfterSales` 的 take 一致）。

### 37.2 状态筛选

| Tab | 口径 |
|---|---|
| 全部 | 全部售后单 |
| 处理中 | `Pending / Approved / Received / Appealed` |
| 已退款 | `Refunded` |
| 已结束 | `Rejected / Closed / RefundFailed` |

- 每个 tab 带计数；空列表文案区分「还没有售后申请」与「该状态下暂无记录」。

### 37.3 卡片信息

- 状态标签（商家审核中 / 已同意 / 已收货 / 已退款 / 商家已拒绝 / 申诉中 / 已关闭）、申请时间；
- 「仅退款」类型、退款原因、关联订单号、申请描述首行（超 26 字截断）；
- 退款金额、沟通条数；有凭证时展示前 3 张缩略图；
- 已退款卡片显示「退款完成于 {时间}」；点击整卡进售后详情。

![我的页售后入口与角标](screenshots/common-features-v7/19-profile-after-sales-entry.png)
![我的售后列表](screenshots/common-features-v7/20-after-sales-list.png)
![已退款筛选](screenshots/common-features-v7/21-after-sales-filter-refunded.png)

## 38. 订单开票闭环

1. **申请入口**：订单详情底部「开发票」（未申请时）→ 弹层选择已存抬头、填写接收邮箱后提交，写回 `invoiceApplied / invoiceInfo`（沿用订单 customFields，无新接口）；
2. **抬头来源**：`activeCustomer.customFields.invoiceTitles`（与「发票抬头」管理页同一份数据）；弹层内新增「管理抬头」入口，跳转抬头管理后返回可重新选择；
3. **已申请展示**：订单详情新增发票信息卡，逐行展示发票类型（企业/个人）、抬头名称、税号、接收邮箱、申请时间，右上「复制」可一键复制整段信息；
4. **完成态提示**：信息卡底部固定提示「电子发票将在 3 个工作日内发送至上述邮箱」；
5. 兼容：历史订单 `invoiceInfo` 为 JSON 字符串或对象均可解析，缺字段自动隐藏对应行。

![订单详情-已提交开票申请](screenshots/common-features-v7/22-order-invoice-applied.png)
![开发票弹层-管理抬头](screenshots/common-features-v7/23-invoice-sheet-manage.png)

## 39. 评价晒单增强（我的评价）

1. 新增状态筛选：`全部 / 审核中 / 已通过 / 未通过`，带计数；
2. 评价卡片增强：
   - 匿名评价显示「匿名评价」标记；
   - 新增标签行（如「口味赞 / 分量足 / 配送快」）；
   - 图片最多展示 3 张，超出显示「+N 张」；点击图片调用 `uni.previewImage` 大图预览；
   - 追评中的图片同样支持缩略图与预览；
   - 保留商家回复、追评、删除评价（未删除且非追评才可删）。
3. 评价创建页未改动，仍为星级 + 文案 + 图片 + 匿名开关。

![我的评价-筛选与标签](screenshots/common-features-v7/24-my-reviews-filters.png)

## 40. 帮助与客服中心

1. 入口：「我的 → 帮助与客服」（登录与否均可访问）；原「联系客服」菜单项由本页替代；
2. 顶部为客服区：
   - 配置了 `VITE_SERVICE_PHONE` 时显示「客服热线 + 号码」，点击 `uni.makePhoneCall` 拨号；
   - 未配置时展示兜底提示「如需紧急处理，请在订单详情联系商家或平台客服」，不显示空号码按钮；
3. 四个快捷入口：我的售后 / 我的评价 / 发票抬头 / 我的订单；
4. 常见问题 5 组共 10 条（支付与优惠、配送与订单、退款与售后、发票、账号），手风琴展开，单条展开互斥；
5. 全部文案走 i18n（`help.*`），支持中英文切换。

![帮助与客服](screenshots/common-features-v7/25-help-center.png)

## 41. 验收记录与边界（第七轮，2026-10-21）

| 项 | 结果 |
|---|---|
| 我的页入口 | `{"help":true,"afterSales":true,"badge":true}`，售后角标「1」，客服热线菜单已替换为「帮助与客服」 |
| 售后列表 | tab 计数「全部 3 / 处理中 1 / 已退款 1 / 已结束 1」；三张卡片金额 `¥5.00 / ¥3.00 / ¥8.00`；凭证缩略图 2 张 |
| 售后筛选 | 已退款 tab 仅剩「少送商品」卡片（`onlyRefunded=true`） |
| 开票信息卡 | 类型/抬头/税号/邮箱/申请时间/复制全部命中，`{"applied":true,"title":true,"tax":true,"email":true,"copy":true}` |
| 开发票弹层 | 弹层可见，含「管理抬头」，抬头列表含企业抬头与「个人」 |
| 我的评价 | 四个筛选 tab 命中；标签、匿名标记、商家回复、追评图片均正常；图片超出显示「+N 张」 |
| 帮助与客服 | 5 个 FAQ 分组命中，展开答案命中；四个快捷入口中文文案正常；未配置热线时展示兜底提示 |
| i18n | `zh-Hans.json` / `en.json` / `uni-app.*.json` 补齐 `afterSalesList` / `help` / `myReviews` 新键 / `orderDetail` 发票键 / `profile.myAfterSales` / `nav.afterSales` / `nav.help` |
| 前端构建/部署 | `pnpm build:h5` 通过（产物 2633 KB），`node .secrets/deploy-waimai.mjs` 部署成功 |
| 手机视口截图 | 390×844 dpr=2，共 7 张（19–25） |

边界与已知限制：
- 售后列表只取最近 20 条，历史单需从订单详情进入；
- 售后状态文案为前端映射，后端新增状态会原样显示英文枚举；
- 开票仅记录申请（`invoiceApplied/invoiceInfo`），开票状态与发票文件仍由后台线下处理，前端不展示进度；
- 抬头管理为跳转页面，返回后需重新打开开票弹层；
- 「+N 张」只作提示，点击缩略图预览的是全部图片（含未展示的）；
- 帮助中心 FAQ 为内置文案，后台暂不可配置；客服热线依赖构建期 `VITE_SERVICE_PHONE`；
- 我的页用户名兜底：无 `firstName` 时显示邮箱前缀，避免已登录仍显示「未登录」。

---

# 第八轮常用功能（地址标签 / 券包增强 / 骑手信息 / 店内搜索）

> 上线日期：2026-10-21（第八轮）
> 截图脚本：`node .secrets/common-features-v8-shots.cjs`（Playwright 390×844 dpr=2，输出 `docs/screenshots/common-features-v8/`）
> 新增文件：`src/utils/addressLabel.ts`
> 修改文件：`src/pkg-user/pages/address-book.vue`、`src/pkg-order/pages/checkout.vue`、`src/pkg-promotion/pages/my-coupons.vue`、`src/pkg-order/pages/order-detail.vue`、`src/pages/shop/menu.vue`、`src/locale/zh-Hans.json`、`src/locale/en.json`
> 后端：无改动，复用 `activeCustomer.addresses` / `campusZones` / `campusBuildings` / `myCoupons` / `campusOrderRider`

## 42. 地址簿标签与复制

1. 标签来源：本地 `address_labels`（`{ addressId: 'home' | 'school' | 'company' }`），不写后端，不跨设备同步；
2. 地址卡片标题行新增标签 chip：
   - 已设置：显示「家 / 学校 / 公司」（当前语言）；
   - 未设置：显示虚线「＋标签」，点击弹出 ActionSheet 选择家/学校/公司或「清除标签」；
3. 操作行新增「复制」：复制「姓名 电话 完整地址（含分区 + 楼栋 + 房间）」，便于发给骑手或填表；
4. 结算页地址卡与地址选择弹层同步展示同一标签（读同一份本地数据）；
5. 分区/楼栋失效的地址仍标「待更新」，不展示标签操作。

![地址簿标签与复制](screenshots/common-features-v8/26-address-labels.png)

## 43. 券包增强（分类计数 + 临期提醒）

1. Tab 计数：未使用 / 已使用 / 已过期的 tab 标题右侧显示数量（按已加载列表计算，切 tab 后补齐）；
2. 临期横幅：未使用 tab 下，若有券 3 天内到期，顶部展示「N 张券将在 3 天内到期，尽快使用」；
3. 券卡片新增：
   - 「还剩 N 天」/「今天到期」提示（仅未使用且未过期）；
   - 3 天内到期的券保留「即将过期」角标；
   - 已使用/已过期券仍为灰度卡、无「去使用」按钮；
4. 口径：`isExpiringSoon` = 未过期且到期时间距现在 ≤ 3 天（按当天 0 点比较下限）。

![券包分类与临期提醒](screenshots/common-features-v8/27-coupons-expiring.png)
![券包已使用 tab](screenshots/common-features-v8/28-coupons-used-tab.png)

## 44. 骑手信息与催单

1. 订单详情骑手卡在原有「姓名 + 信用分 + 联系商家」基础上新增：
   - 「距你 {距离}」：< 1km 用米（取整），否则公里保留 1 位；
   - 「约 N 分钟送达」：取 `campusOrderRider.etaMinutes`；
   - 两项均来自 `campusOrderRider` 的 `distanceMeters / etaMinutes`，缺失自动隐藏；
2. 催单区新增提示文案「催单后骑手会收到提醒，请耐心等待」，位于催单按钮下方；
3. 已催单仍显示「已催单」红色标签，按钮隐藏；催单逻辑沿用原实现（`urgeOrder` 写 `urged`）。

![骑手信息与催单提示](screenshots/common-features-v8/29-order-rider-meta.png)

## 45. 店内搜索与筛选

1. 商品面板顶部新增搜索框（`搜索店内商品`），输入即本地过滤，不发请求；
2. 搜索建议（输入为空时展示）：
   - 搜索历史：复用 `search_history`（与首页搜索共用，最多 10 条，可一键清空）；
   - 热门搜索：店内销量前 6 的商品名，名额不足用分类名补齐；
   - 点击词条直接填入并写入历史；
3. 筛选 chips（与排序分行）：
   - 「有优惠」：仅展示带可领/专属券的商品；
   - 「仅看有货」：隐藏全部规格售罄的商品；
4. 与既有能力叠加：`q` 参数（首页搜索/收藏进店定位）、分类、排序（综合/销量/价格升降）同时生效；
5. 空结果沿用「该分类下暂无商品」空态。

![店内搜索与建议词](screenshots/common-features-v8/30-shop-search-suggest.png)
![搜索「可乐」结果](screenshots/common-features-v8/31-shop-search-result.png)
![仅看有货筛选](screenshots/common-features-v8/32-shop-filter-instock.png)

## 46. 验收记录与边界（第八轮，2026-10-21）

| 项 | 结果 |
|---|---|
| 地址标签 | `{"home":true,"school":true,"copy":true,"defaultTag":true}`；两条地址分别显示「家 / 学校」chip，复制入口在操作行 |
| 券包 | `{"counts":true,"banner":true,"days":true}`；未使用 3 张、横幅「1 张券将在 3 天内到期」、卡片「还剩 2 天」 |
| 券包切 tab | 已使用 tab 命中「满15减2」卡片，临期横幅消失 |
| 骑手信息 | `{"name":true,"distance":true,"eta":true,"urge":true,"hint":true}`；显示「距你 620 m」「约 7 分钟送达」与催单提示 |
| 店内搜索 | 搜索框、历史、热门三块命中，历史 3 条、热门 3 条；筛选 chips 正常 |
| 搜索过滤 | 输入「可乐」后建议区收起，列表仅剩含关键词商品，清除按钮可用 |
| 仅看有货 | 切换后列表不再出现「已售罄」商品 |
| i18n | `zh-Hans.json` / `en.json` 补齐 `addressBook`（7 键）、`myCoupons`（3 键）、`orderDetail`（3 键）、`menu`（5 键） |
| 前端构建/部署 | `pnpm build:h5` 通过（产物 2642 KB），`node .secrets/deploy-waimai.mjs` 部署成功 |
| 手机视口截图 | 390×844 dpr=2，共 7 张（26–32） |

边界与已知限制：
- 地址标签仅存本机，换设备/清缓存后丢失；删除地址后标签残留（不影响展示）；
- 复制内容含分区与楼栋，若地址失效则复制的是「地址已失效」提示文案；
- 券 tab 计数基于已加载列表，首次进入只加载当前 tab，其余 tab 显示 0 直到切换；
- 骑手距离/ETA 依赖后端实时字段，未上报定位时仅显示姓名与信用分；
- 催单为单次写入 `urged`，前端不做频率限制（后端已幂等）；
- 店内搜索为前端过滤（已在店铺页加载的 100 个商品内），不调用搜索接口；
- 热门搜索按店内销量推导，不含跨店热搜。

# 第九轮常用功能（订单追踪 / 再来一单 / 预约单 / 店铺动态）

## 43 订单列表：预约单聚合与快捷操作

入口：底部 Tab「订单」。

- 列表顶部新增「预约单 N 单」聚合条，展示带送达时段且未完成的订单；点击只看预约单，再次点击恢复全部（与「待评价」「售后中」互斥）。
- 订单卡新增快捷操作：
  - 配送中（`deliveryStatus = assigned / in_progress` 且有配送路线）→「追踪骑手」，直达全屏骑手地图；
  - 已送达 / 已取消 →「再来一单」，进入订单详情并自动打开复购弹层。
- 订单卡内「送达时段：…」沿用 `customFields.deliverySlotText`。

截图：[33-orders-scheduled-quick.png](screenshots/common-features-v9/33-orders-scheduled-quick.png)

## 44 订单追踪地图

入口：订单列表「追踪骑手」，或订单详情「实时追踪 ›」。

- 页面展示腾讯地图 + 骑手实时位置、配送目的地、骑行轨迹连线；
- 顶部为订单编号与「跟随中」状态，底部面板展示骑手姓名、信用分、预计送达、距你距离与配送节点（骑手已接单 → 已取餐 → 配送中 → 已送达）；
- 定位数据来自 `campusOrderRider`，前端 10s 轮询（送达后自动停止）。

截图：[37-rider-tracking.png](screenshots/common-features-v9/37-rider-tracking.png)

## 45 再来一单（复购）

入口：订单列表「再来一单」或订单详情「再来一单」。

- 跨店铺定位原订单所属店铺（按 `code` 逐渠道查询）；
- 拉取该店在售商品，逐一核对原订单商品：可售行正常展示，下架/售罄行置灰并标注「已下架，将跳过」；
- 底部汇总提示「有 N 件商品已下架，将跳过」；点击「加入购物车并进店」后切店、批量加购并进入店铺菜单。
- 全部商品不可售时提示「商品均已下架」，不执行加购。

截图：[35-order-reorder-modal.png](screenshots/common-features-v9/35-order-reorder-modal.png)

## 46 定时配送 / 预约单

入口：结算页「配送目标 → 送达时段」。

- 时段分两行：第一行「尽快送 / 明天 / 后天…」日期 chip，第二行具体时段 chip（含余量「剩 N 位」）；
- 选择未来日期与具体时段后，底部出现预约提示「预约单将在送达时段前 30 分钟自动进入配送调度」；
- 提交时 `campusSetDeliveryTarget(zoneId, buildingId, route, slotId)` 写入 `deliverySlotId / deliverySlotText / scheduledFor`；
- 订单详情顶部展示蓝色「预约配送 · 时段」提醒卡，配送进度首节点体现预约态；订单列表展示送达时段并支持预约单聚合筛选。

截图：[38-checkout-slot.png](screenshots/common-features-v9/38-checkout-slot.png)、[34-order-detail-scheduled.png](screenshots/common-features-v9/34-order-detail-scheduled.png)

## 47 店铺关注与动态

入口：我的 → 我的收藏 →「店铺动态」Tab。

- Tab 带计数，动态中的新品数量以红点角标展示；
- 逐个拉取已关注店铺商品，与本地 `follow_seen_products` 基线比对：首见店铺只建基线不误报，之后新增商品标记「新品」；
- 每家店铺展示「上新 N 件」+ 新品卡（红色「新品」角标）与销量前 3 的热销卡（「热销」角标）；
- 「全部已读」将当前商品写入基线并清空新品角标；点击店铺或商品卡片可带关键词进店。

截图：[36-favorites-dynamics.png](screenshots/common-features-v9/36-favorites-dynamics.png)

## 48 验收记录与边界

验收方式：Playwright 390×844 dpr=2 移动视口，mock `shop-api`（店铺、订单、骑手、券包、时段、收藏商品）。

| 项目 | 结果 |
|---|---|
| 订单列表 | `{"cards":2,"slotBar":"预约单 1 单只看预约单 ▸","trackBtn":true,"reorderBtn":true}` |
| 订单详情预约卡 | 横幅「预约配送 今天 19:00-19:30」+ 提示文案，时间线 5 节点、骑手「张小骑」 |
| 再来一单 | 弹层店铺「川味小馆」、2 行商品、1 行下架、「有 1 件商品已下架，将跳过」 |
| 店铺动态 | tab「收藏店铺2 / 收藏商品0 / 店铺动态2」，2 家店、2 个新品角标、「上新 1 件」、「全部已读」 |
| 骑手追踪 | 地图页正常，骑手「张小骑」、ETA「约 7 分钟」、节点 4 个 |
| 结算预约 | 日期 3 chip、时段 2 chip，选中「11:00-11:30 剩8位」，预约提示正常 |
| i18n | `orders`（5 键）、`orderDetail`（2 键）、`favorites`（7 键）中英双语补齐 |
| 构建/部署 | `pnpm build:h5` 通过（产物 2654 KB），`node .secrets/deploy-waimai.mjs` 部署成功 |
| 手机视口截图 | 390×844 dpr=2，共 6 张（33–38） |

边界与已知限制：
- 预约时段来自店铺 `campusShopSlots`，店铺未配置时仅显示「尽快送」；
- 预约单 `scheduledFor` 前 30 分钟才放量入厅，期间商家看板单独归入「预约单」栏；
- 再来一单仅处理商品下架/售罄，不处理价格变动与规格变更（加购按原变体）；
- 追踪地图依赖后端骑手定位上报，无定位时沿用订单详情骑手卡；
- 店铺动态基于本机基线，换设备后首轮只建基线不显示新品；
- 动态商品最多取 12 家关注店铺、每家 4 个新品 + 3 个热销，超出部分暂不展示。

# 第十轮常用功能（券码兑换 / 地址粘贴识别 / 口味偏好 / 足迹与常买）

## 49 优惠券兑换码

入口：我的 → 我的优惠券（券包顶部「有券码？去兑换 ›」）。

- 弹层输入券码（自动转大写、最长 32 位），点「立即兑换」调用后端 `redeemCouponByCode(claimCode)`；
- 成功：关闭弹层、清空输入、自动切回「未使用」并重新拉取券列表，toast「兑换成功，已放入券包」；
- 失败：后端英文错误统一映射为中文提示（券码无效 / 非本店券码 / 已兑换 / 已领完 / 已过期 / 未开始 / 暂不可兑换），弹层不关闭便于改码重试；
- 兑换限领与库存沿用券模板配置，由后端校验，前端不重复拦截。

截图：[39-coupons-redeem-entry.png](screenshots/common-features-v10/39-coupons-redeem-entry.png)、[40-coupons-redeem-error.png](screenshots/common-features-v10/40-coupons-redeem-error.png)

## 50 地址粘贴智能识别

入口：我的 → 常用地址 → 新增/编辑地址（顶部橙色「粘贴地址自动识别」卡）。

- 复制「姓名 电话 地址」后点「粘贴识别」，自动读剪贴板并拆分：联系人、手机号、门牌；
- 手机号支持带空格/横线（如 `139-1234-5678`），姓名取号码前最后一段并去掉「收货人/电话」等前缀；
- 地址文本按当前校区分区/楼栋名称匹配，命中后自动选中分区、加载并选中楼栋，剩余文本写入房号（最长 60 字）；
- 浏览器拒绝读剪贴板或内容为空时，弹出「手动粘贴」面板兜底，粘贴后点「识别并填写」；
- 只填识别到的字段，未识别字段保持原值；填充完成 toast「已识别并填写，请核对」，保存仍需用户手动点击。

截图：[41-address-paste-parse.png](screenshots/common-features-v10/41-address-paste-parse.png)

## 51 口味与忌口偏好

入口：结算页 → 订单备注 →「口味偏好」chips。

- 四个偏好：不要辣 / 少辣 / 不要香菜 / 不要葱蒜，单选/多选即时生效；
- 「不要辣」与「少辣」互斥，后选的自动替换，避免备注出现矛盾要求；
- 选择结果写入本地 `taste_preferences`，下次结算自动回填并同步进订单备注；
- 同步规则：先移除备注中已有口味段，再按选中顺序前置，其余自由输入与常用备注保留；总长仍受 200 字限制；
- 口味段随下单写入 `customFields.note`，商家端订单备注可见。

截图：[42-checkout-taste.png](screenshots/common-features-v10/42-checkout-taste.png)

## 52 浏览足迹与常买清单

入口：我的 → 足迹与常买。

- 「浏览足迹」：本地记录 `browse_footprint`，在店铺菜单点商品或加购时写入（商品/规格/价格/店铺/渠道/路线），同商品去重置顶，最多保留 40 条；
- 点击足迹行带 `q=商品名` 回到对应店铺菜单并定位商品；「清空」二次确认后清空本地记录；
- 「常买清单」：按平台 + 各店铺渠道逐渠道拉取我的订单（每渠道 20 单），按变体聚合购买次数与最近购买时间，跳过已取消订单，按次数倒序取前 20；
- 行内展示「买过 N 次」与最近时间，点「加购」切店并带 `add=变体ID` 进店加购；「刷新」强制重算。

截图：[43-history-footprint.png](screenshots/common-features-v10/43-history-footprint.png)、[44-history-frequent.png](screenshots/common-features-v10/44-history-frequent.png)

## 53 验收记录与边界（第十轮，2026-10-22）

验收方式：Playwright 390×844 dpr=2 移动视口，mock `shop-api`（店铺、券包、兑换、校区、订单、结算）。

| 项目 | 结果 |
|---|---|
| 券包兑换入口 | 入口文案「有券码？去兑换」，tab「未使用2 / 已使用 / 已过期」 |
| 兑换失败提示 | 输入 `BAD999` → 「券码无效，请检查后重试」，弹层保持打开 |
| 兑换成功 | 输入 `GOOD123` → 弹层关闭、券列表重载（2 张） |
| 地址粘贴识别 | 联系人「李雷」、电话「13912345678」、分区「东区」、楼栋「图书馆」、房号「302」 |
| 口味偏好 | 默认「不要辣」且备注为「不要辣」；点「少辣」后仅「少辣」，备注同步「少辣」 |
| 浏览足迹 | tab「浏览足迹2 / 常买清单」，2 行，首行「藤椒鸡腿饭」 |
| 常买清单 | 3 行，首行「珍珠鲜奶茶 · 买过 3 次」，提示「按历史订单购买次数排序」 |
| i18n | `addressEdit`（9 键）、`myCoupons`（19 键）、`checkout`（6 键）、`history`（17 键）、`profile.history`、`nav.history` 中英双语补齐 |
| 构建/部署 | `pnpm build:h5` 通过（产物 2680 KB），`node .secrets/deploy-waimai.mjs` 部署成功 |
| 手机视口截图 | 390×844 dpr=2，共 6 张（39–44） |

边界与已知限制：
- 券码兑换依赖券模板已配置 `claimCode` 且处于可领状态，本店券码才可兑换；
- 地址识别为规则解析（手机号 + 关键词匹配），不含地图/POI 校验；无手机号且无姓名时视为无法识别，转手动粘贴；
- 口味偏好仅存本机，换设备不同步；写入的是备注文本，不做商家端结构化忌口字段；
- 浏览足迹按商品（变体）去重，最多 40 条；清空后不可恢复；
- 常买清单依赖历史订单接口，跨渠道串行查询失败时跳过该渠道；仅统计已下单商品，不含购物车与取消单。

# 第十一轮常用功能（营业状态 / 凑单 / 最优券 / 预计送达）

## 54 营业状态与打烊提醒

入口：首页店铺列表、店铺菜单页、购物车。

- 首页按店铺 `businessHours` 实时计算，店名旁显示「已打烊」（红）或「即将打烊」（橙，打烊前 30 分钟内）；
- 店铺菜单页在店铺卡下方显示状态条：打烊「本店已打烊 · 今日/明日 HH:mm 开始营业，可先加购」；即将打烊「还有 N 分钟打烊，请尽快下单」；
- 打烊仅拦截提交：菜单页底部按钮变「已打烊」，购物车该店「去结算」置灰并 toast 提示，仍可浏览与加购；
- 营业时间解析支持多时段（`10:00–14:00, 17:00–21:00`）、全角冒号/波浪线/「至」等写法与跨零点时段（`18:00-02:00`）；未配置营业时间按营业处理，不误伤；
- 首页「只看营业中」筛选同步排除打烊店铺。

截图：[45-home-store-status.png](screenshots/common-features-v11/45-home-store-status.png)、[46-menu-closed-banner.png](screenshots/common-features-v11/46-menu-closed-banner.png)

## 55 凑单助手

入口：购物车、店铺菜单页购物车条。

- 购物车每家店展示凑单进度：未达起送价显示「还差 ¥X 起送」，按钮变「去凑单」；已达起送价但未达免配送费门槛时显示进度条与「再买 ¥X 免配送费」，达标转绿「已免配送费」；
- 店铺菜单页购物车条按「起送差额 → 满减差额 → 免配送费差额」优先级提示，商家无门槛配置时不占位；
- 打烊店铺的结算按钮同时置灰，凑单与浏览不受影响。

截图：[47-cart-topup-progress.png](screenshots/common-features-v11/47-cart-topup-progress.png)

## 56 最优优惠券智能推荐

入口：结算页 → 优惠券。

- 结算页在优惠券行上方提示「换用最优券可再省 ¥X 一键换券」，点击直接切换到估算优惠最大的券；
- 选券弹层按当前小计 + 运费估算每张券的「可省 ¥X」并降序排列，最优券打「最优」橙色标签；
- 已挂券与最优券同额时不提示，差额不足 ¥1 不提示，避免打扰；
- 门槛未达的券保留在列表中并显示原因，不参与最优推荐；未登录或无可用券时提示行不渲染。

截图：[48a-checkout-coupon-tip.png](screenshots/common-features-v11/48a-checkout-coupon-tip.png)、[48b-checkout-coupon-best.png](screenshots/common-features-v11/48b-checkout-coupon-best.png)

## 57 预计送达倒计时

入口：订单列表（待发货/待收货订单卡）、订单详情。

- 待配送（PaymentAuthorized）/配送中（PaymentSettled）订单按「下单时间 + 店铺 deliveryMinutes」估算，展示「预计 HH:mm 送达 · 还有 N 分钟」，每 30 秒刷新；
- 超过预计时间转红「预计送达已超时 N 分钟」，详情页显示「配送超时，可联系商家或点击催单」；
- 预约单（含 `deliverySlotText`）与已送达/已取消/待付款订单不显示倒计时，避免与预约时段冲突；
- 店铺未配置配送时长时按 40 分钟兜底；订单列表按店铺名映射配送时长，详情页优先按渠道匹配。

截图：[49-orders-eta.png](screenshots/common-features-v11/49-orders-eta.png)、[50-order-detail-eta.png](screenshots/common-features-v11/50-order-detail-eta.png)

## 58 验收记录与边界（第十一轮，2026-10-22）

验收方式：Playwright 390×844 dpr=2 移动视口，测试学生登录，店铺/购物车/订单/券为脚本注入的模拟响应（手册已注明）。

| 项目 | 结果 |
|---|---|
| 首页营业状态 | 徽标「已打烊」「即将打烊」各 1 个，样式区分红/橙 |
| 店铺打烊提示 | 状态条「本店已打烊 · 明日 00:00 开始营业，可先加购」，结算按钮「已打烊」 |
| 购物车凑单 | 2 家店：川味小馆「还差 ¥10.00 起送 / 去凑单 / 已打烊」；青柠奶茶「已免配送费 / 去结算」 |
| 最优券提示 | 「换用最优券可再省 ¥14 一键换券」 |
| 选券弹层 | 3 张券排序 满60减18 / 8.5折 / 满20减4，分别「可省 ¥18 / ¥9 / ¥4」，首张带「最优」 |
| 订单倒计时 | 「预计 07:22 送达 · 还有 7 分钟」；超时单「预计送达已超时 41 分钟」红色 |
| 订单详情 | 「预计 07:37 送达 · 还有 22 分钟」+ 估算说明 |
| i18n | `home`（2）、`menu`（5）、`cart`（5）、`checkout`（3）、`orders`（4）、`orderDetail`（4）中英双语补齐 |
| 构建/部署 | `pnpm build:h5` 通过（产物 2692 KB），`node .secrets/deploy-waimai.mjs` 部署成功 |
| 手机视口截图 | 390×844 dpr=2，共 7 张（45–50，含 48a/48b） |

边界与已知限制：
- 营业状态依赖后台填写 `businessHours` 文本，格式不合法时按未配置处理（视为营业）；
- 打烊状态只在前端计算，未与服务器时间校验，手机时间明显偏差时提示可能不准；
- 凑单门槛取店铺配置（`minOrderAmount`/`freeShippingThreshold`），两者都未配置时不显示进度；
- 最优券为本地估算（满减/折扣按门槛与上限计），最终以提交订单时后端核销结果为准；
- 预计送达为估算值，无骑手实时位置参与；预约单、已送达与取消单不显示；未配置配送时长按 40 分钟。

# 第十二轮常用功能（阶梯满减 / 失效巡查 / 规格记忆）

## 59 阶梯满减面板

入口：店铺菜单页店铺卡、购物车每家店卡片。

- 解析店铺 `promoText` 中全部「满 X 减 Y」档位（支持中文逗号/顿号/斜杠分隔），逐档展示为 chip；
- 已达成档位置亮（品牌色实线）；未达成的最近一档显示虚线边框并标注「再买 ¥X」；
- 购物车按当前小计实时计算，切换档位无需刷新接口；无满减配置的店铺不显示该面板；
- 金额展示整数优先（满30减5），避免小数为 0 时出现「满30.00减5.00」。

截图：[51-menu-promo-tiers.png](screenshots/common-features-v12/51-menu-promo-tiers.png)

## 60 购物车失效巡查

入口：购物车 → 商品行角标 + 店铺卡「清理失效 N 件」。

- 三种失效：已下架（变体 `enabled=false`）、已售罄（`stockLevel=OUT_OF_STOCK`）、已变价（与上次打开购物车时的单价快照比对）；
- 下架/售罄行置灰并划线，若存在则「去结算」拦截并提示「请先清理失效商品」；
- 变价行保留可结算，展示当前价与划线原价（原 ¥X），仅提示不自动移除；
- 点击「清理失效 N 件」二次确认后逐行调用 `removeOrderLine` 移除，全部成功后重载购物车并 toast；
- 单价快照存本地 `cart_line_prices`（`token:variantId`），每次打开购物车刷新为当前价。

截图：[53-cart-invalid-inspect.png](screenshots/common-features-v12/53-cart-invalid-inspect.png)

## 61 规格记忆

入口：店铺菜单页 → 点商品「选规格」。

- 记录每件商品上次选择的变体（本地 `sku_memory`，最多 200 条，超限淘汰最早记录）；
- 再次打开规格弹层时默认选中上次规格（如「加量份」），价格、已选文案同步；
- 上次规格已下架/售罄（`enabled=false` 或 `OUT_OF_STOCK`）时回退为第一个可用规格；
- 加入购物车 / 立即购买成功后写入记忆；菜单商品查询补充 `optionGroups`，使单规格店也能显示规格选项。

截图：[52-menu-sku-memory.png](screenshots/common-features-v12/52-menu-sku-memory.png)

## 62 验收记录与边界（第十二轮，2026-10-22）

验收方式：Playwright 390×844 dpr=2 移动视口，测试学生登录，店铺/购物车/商品为脚本注入的模拟响应。

| 项目 | 结果 |
|---|---|
| 阶梯满减（店铺页） | 3 档：满30减5（达成）、满50减12（达成）、满80减25「再买 ¥9」（虚线） |
| 阶梯满减（购物车） | 同 3 档，金额格式与店铺页一致 |
| 失效标记 | 4 行：已售罄 / 已下架 / 已变价 各 1，正常行 1 |
| 清理入口 | 「清理失效 2 件」（只计下架/售罄，变价不计） |
| 变价提示 | 小食拼盘 ¥8.00 + 划线「原 ¥6.00」 |
| 结算拦截 | 存在失效行时主按钮置灰，点击提示「请先清理失效商品」 |
| 规格记忆 | 弹层默认选中「加量份」，价格 ¥32.00，文案「已选：加量份 · 1 件」 |
| i18n | `menu`（2）、`cart`（10）中英双语补齐 |
| 构建/部署 | `pnpm build:h5` 通过（产物 2701 KB），`node .secrets/deploy-waimai.mjs` 部署成功 |
| 手机视口截图 | 390×844 dpr=2，共 3 张（51–53） |

边界与已知限制：
- 满减档位依赖 `promoText` 文本格式，无法解析的文案只作为普通标签展示；
- 变价判断基于本地单价快照，首次打开购物车时没有快照，不会提示；清缓存后需重新积累一次；
- 清理失效仅移除下架/售罄行，变价行需用户自行确认；清理失败（网络/权限）会 toast 并保留原状；
- 规格记忆存本机，换设备不同步；商品删除或多规格组合不可售时会回退默认规格。

# 第十三轮常用功能（消费统计 / 收藏降价 / 店铺公告 / 时段推荐）

## 63 消费统计账单

入口：我的 → 消费统计（登录后可见）。

- 跨渠道聚合：平台渠道 + 店铺列表里每个店铺渠道并行查询订单，按订单 id 去重合并（每渠道取最近 50 单）；
- 统计口径：仅计入已支付 / 配送中 / 已完成的订单（`PaymentAuthorized`、`PaymentSettled`、`Shipped`、`PartiallyShipped`、`Delivered` 等），排除已取消与待付款；金额取订单 `totalWithTax`；
- 汇总卡：累计消费、订单数、客单价（累计 ÷ 单数）、本月消费；
- 近 6 个月趋势：按月汇总，柱高按最大值归一（最高柱 100%），柱顶展示金额（千元取 k）；
- 常点店铺 TOP3：按渠道聚合，单量降序 → 金额降序；
- 最近订单：最近 5 单，展示店铺、日期、订单号、金额（静态展示，不跳转）；
- 未登录展示登录提示；无有效订单展示空态；接口失败静默空态，不阻塞页面。

截图：[63-profile-spending-entry.png](screenshots/common-features-v13/63-profile-spending-entry.png)、[64-spending-summary.png](screenshots/common-features-v13/64-spending-summary.png)、[65-spending-top.png](screenshots/common-features-v13/65-spending-top.png)

## 64 收藏商品降价提醒

入口：我的收藏 → 收藏商品。

- 收藏时记录价格快照到本地 `fav_price_snapshots`（最多 300 条，超出淘汰最早）；
- 打开收藏页时按渠道拉取商品，用最新 `priceWithTax` 覆盖本地价，与快照对比；
- 当前价低于快照价时：价格后展示划线原价，卡片底部展示橙色「降价 ¥X」角标；Tab 标题追加「· ↓N」角标；
- 老收藏首次打开时以当前价建立基线，避免误报降价；取消收藏同时清除快照；
- 接口失败保留旧价，不误报；降价判断在本地完成，无服务端推送。

截图：[66-favorites-price-drop.png](screenshots/common-features-v13/66-favorites-price-drop.png)

## 65 店铺公告与信息卡

入口：店铺菜单页 → 公告条 / 自动弹层。

- 店铺有 `storeNotice` 时，店铺卡下方展示公告条：单行省略 + 「查看 ›」；
- 点击公告条打开公告弹层（标题「店铺公告」、完整正文、全宽「知道了」按钮，点遮罩可关闭）；
- 首次进店每日自动弹一次：本地 key `store_notice_seen_<token>_<年-月-日>`，当日已读不再弹，次日再进店会再弹；
- 公告为空时不展示公告条、不弹窗；商家 Tab 现有店铺信息卡（地址 / 电话 / 营业时间 / 活动）保持不变。

截图：[67-shop-notice-bar.png](screenshots/common-features-v13/67-shop-notice-bar.png)、[68-shop-notice-modal.png](screenshots/common-features-v13/68-shop-notice-modal.png)

## 66 时段推荐店铺

入口：首页搜索框下方（快捷入口与类目之间）。

- 按本地时间分五段：早餐 06–10、午餐 10–14、下午茶 14–17、晚餐 17–21、夜宵 21–02（跨零点）；
- 标题「现在适合吃 · {早餐|午餐|下午茶|晚餐|夜宵}」，横滑展示最多 4 家推荐店铺，副文案优先店铺活动，其次配送信息；
- 打分：命中该时段标签 +100、有活动 +20、月售/100、已打烊 -50、暂停营业 -100，降序取前 4；
- 「查看全部 ›」在首页类目里有对应标签时出现，点击切到该类目并滚到店铺列表；
- 每分钟刷新时段；输入关键词或打开搜索面板时该区块自动隐藏。

截图：[69-home-meal.png](screenshots/common-features-v13/69-home-meal.png)

## 67 验收记录与边界（第十三轮，2026-10-22）

验收方式：Playwright 390×844 dpr=2 移动视口，测试账号登录，订单/店铺/商品为脚本注入的模拟响应；构建产物本地 serve 后截图，部署后再核对线上 chunk。

| 项目 | 结果 |
|---|---|
| 消费统计入口 | 我的页「消费统计」位于「我的收藏」上方，登录后可见 |
| 消费统计汇总 | 累计 ¥180.00 / 订单数 5 / 客单价 ¥36.00 / 本月 ¥90.00（断言通过） |
| 月度趋势 | 5–10 月 6 根柱，8–10 月有值（¥42 / ¥48 / ¥90），柱高与最大值归一 |
| 常点店铺 TOP3 | 食堂A窗口 3 单 ¥102.00 → 平台 2 单 ¥78.00（断言首位为食堂A窗口） |
| 最近订单 | 5 条，日期/订单号/金额正确 |
| 收藏降价 | 当前 ¥15.00 + 划线 ¥20.00 + 角标「降价 ¥5.00」（断言通过）；Tab 角标「· ↓1」 |
| 店铺公告条 | 展示完整公告首行并省略，右侧「查看 ›」 |
| 公告弹层 | 首次进店自动弹出（当日未读），标题/正文/「知道了」全宽按钮正常 |
| 时段推荐 | 标题「现在适合吃 · 早餐」，4 家店铺横滑；当前时段由运行时间决定 |
| i18n | `nav.spending`、`home`（7）、`menu`（3）、`profile`（1）、`favorites`（2）、`spending`（15）中英双语补齐 |
| 构建/部署 | `pnpm build:h5` 通过（产物 2723 KB），`node .secrets/deploy-waimai.mjs` 部署成功 |
| 线上回归 | `index-BDsloY4W.js` 含 `pkg-user/pages/spending`、「现在适合吃」「店铺公告」「降价 ¥」；`pages-shop-menu.CPafKL8Q.js` 含 `store_notice_seen_` |
| 手机视口截图 | 390×844 dpr=2，共 7 张（63–69） |

边界与已知限制：
- 消费统计每渠道只取最近 50 单，超长历史（>50 单/店）不会全量计入；订单详情页不做跳转（仅静态展示）；
- 统计按订单支付金额 `totalWithTax` 计，退款单若状态仍为已完成会计入，未做退款抵扣；
- 降价提醒存本机，换设备/清缓存后重新建立基线；价格以打开收藏页时的最新商品价为准，不主动推送；
- 店铺公告每日一次的标记也存本机，清缓存后会再弹一次；
- 时段推荐按设备本地时间判断，跨时区/修改系统时间会影响结果；无匹配标签的店铺仍可能因活动/月售进入推荐。

## 68 收藏店铺置顶

入口：我的收藏 → 收藏店铺。

- 店铺卡右侧新增「置顶 / 取消置顶」按钮（取消收藏按钮左侧），置顶后店名旁显示橙色「置顶」小标签，按钮高亮为橙色；
- 置顶店铺按点击顺序排在收藏列表最前，其余店铺保持原顺序；
- 置顶关系存本地 `fav_store_pins`（channelId 数组），不进云端收藏，换设备/清缓存后不保留；
- 取消收藏店铺时置顶标记残留但无副作用（仅对收藏列表生效）；店铺动态 Tab 的前 12 家取自同一列表，置顶店动态也靠前。

截图：[70-favorites-pin.png](screenshots/common-features-v14/70-favorites-pin.png)

## 69 结算页优惠明细

入口：确认订单 → 汇总区（优惠券行与应付行之间）。

- 当前订单存在优惠（`order.discounts`：店铺券、满减、立减等活动）时，显示「优惠明细」行，右侧红字「已省 ¥X」；
- 点击「优惠明细」行展开/收起逐项明细：左侧优惠描述，右侧红色「-¥X」；
- 「已省 ¥X」为全部优惠项金额合计；无优惠时整块隐藏，不影响其他行。

截图：[71-checkout-fee-detail.png](screenshots/common-features-v14/71-checkout-fee-detail.png)

## 70 支付结果页订单分享

入口：支付结果页 → 「分享订单」按钮（「查看订单」下方，生成过订单才显示）。

- 点击后拉取订单详情，组装摘要文本并复制到剪贴板，提示「订单信息已复制，快去粘贴分享吧」；
- 摘要包含：订单号、商品清单（品名 × 数量）、实付金额、送达时段（有 `deliverySlotText` 时）；
- 订单详情拉取失败或多笔订单场景退化为仅复制订单号，不阻塞。

分享文本示例：

```
【有宝外卖】订单分享
订单号: WM261022090001
商品：香辣鸡腿堡 x1、黄金鸡块 x2
实付：¥43.00
送达时段：11:00-11:30
```

截图：[72-pay-result-share.png](screenshots/common-features-v14/72-pay-result-share.png)

## 71 首页猜你喜欢

入口：首页「常买商品」区块下方。

- 基于浏览足迹（我的足迹同一份数据 `browse_footprint`）+ 常买记录 + 店铺月售综合打分的个性化商品推荐，横滑展示最多 8 张商品卡（图/名/价/店名）；
- 打分：常买基础分 3 > 足迹基础分 1，均乘近期衰减（约 3 天半衰期），叠加店铺月售/100 热度加成；同商品多来源分数累加；
- 与「收藏商品」「常买商品」区块自动去重：已在其中展示的 variant 不再出现在猜你喜欢；
- 点击商品卡进店：有 variantId 直接定位并自动加购，否则带商品名搜索进店；店铺已打烊/下线时静默忽略；
- 无足迹或候选全部去重后为空时整块隐藏；输入搜索关键词时自动隐藏，返回首页（onShow）时重读足迹刷新。

截图：[73-home-guess.png](screenshots/common-features-v14/73-home-guess.png)

## 72 验收记录与边界（第十四轮，2026-10-22）

验收方式：Playwright 390×844 dpr=2 移动视口，店铺/商品/订单为脚本注入的模拟响应；构建产物本地 serve 后截图，部署后再核对线上 chunk。

| 项目 | 结果 |
|---|---|
| 收藏置顶排序 | 注入 3 家收藏 + 置顶 9002，首卡为「茶茶铺」（断言通过） |
| 置顶标识 | 店名旁「置顶」标签渲染，按钮态文案「取消置顶」 |
| 置顶持久化 | `fav_store_pins` 写入 `["9002"]`（断言通过） |
| 优惠明细行 | 汇总区显示「优惠明细 已省 ¥3.00」，点击展开 |
| 逐项明细 | 2 条：「店铺券 · 满20减2 -¥2.00」「新人立减1元 -¥1.00」（断言通过） |
| 订单分享按钮 | 支付结果页「分享订单」按钮渲染并可点击 |
| 分享剪贴板 | 含订单号/商品/实付 ¥43.00/送达时段 11:00-11:30（断言通过） |
| 猜你喜欢 | 区块渲染，含足迹商品「招牌珍珠奶茶」「牛肉板面」 |
| 猜你喜欢去重 | 常买中的「香辣鸡腿堡」未在猜你喜欢出现（断言通过） |
| i18n | `home.guessTitle`、`checkout.feeDetail/feeSaved`、`payResult.share*`（6 条）、`favorites.pin*`（5 条）中英双语补齐 |
| 构建/部署 | `pnpm build:h5` 通过（产物 2731 KB），`node .secrets/deploy-waimai.mjs` 部署成功 |
| 手机视口截图 | 390×844 dpr=2，共 4 张（70–73） |

边界与已知限制：
- 置顶关系仅存本机，不随账号云端同步；取消收藏后置顶标记残留但无副作用；
- 优惠明细数据来自订单 `discounts` 快照，金额以服务端计算为准，本地仅做展示与求和；
- 订单分享复制的是纯文本摘要，不含图片/小程序卡片；多笔订单仅展开首笔详情，其余以订单号列出；
- 猜你喜欢依赖本机浏览足迹，换设备/清缓存后从零积累；打分为端上启发式，不涉及服务端推荐算法；
- 猜你喜欢候选最多取足迹 40 条 + 常买 8 条，全部被收藏/常买去重命中时区块隐藏。

# 第十五轮常用功能（收藏一键加购 / 足迹增强 / 热销榜 / 联系骑手）

## 73 收藏商品一键加购

入口：我的 → 收藏 → 商品收藏卡。

- 每张收藏商品卡新增「加购」实心胶囊按钮（价格行右侧，与「删除」并排）；
- 一键将 1 份商品加入其所属店铺购物车：跨店请求固定 `vendure-token` 指向商品店铺渠道（`addItemToOrderInChannel`），与当前所在店铺无关；
- 加购成功：全局购物车角标即时刷新（`useCartStore().setOrder`），toast「已加入购物车」；失败 toast 展示服务端原因（如售罄/下架）；
- 店铺信息缺失（channelToken 拿不到）时 toast「该店铺信息已失效」，不发请求。

截图：[74a-favorites-add-cart.png](screenshots/common-features-v15/74a-favorites-add-cart.png)、[74b-favorites-add-cart-toast.png](screenshots/common-features-v15/74b-favorites-add-cart-toast.png)

## 74 足迹管理增强（单条删除 + 按店铺聚合）

入口：我的 → 我的足迹。

- 视图切换：足迹列表顶部新增「按店铺 / 按时间」胶囊切换按钮，默认按时间（与原行为一致）；
- 按店铺聚合：同一店铺的足迹归入一组，组头显示店铺名 + 条数徽标，组按组内最新浏览时间排序；聚合视图下行内不再重复显示店名；
- 单条删除：每条足迹行尾新增「×」按钮，点击立即删除该条（`removeFootprint` 按 productId+variantId 精确移除）并 toast「已删除」，无需确认；
- 「清空」按钮行为不变（仍二次确认）。

截图：[75a-history-footprint-delete.png](screenshots/common-features-v15/75a-history-footprint-delete.png)、[75b-history-footprint-by-store.png](screenshots/common-features-v15/75b-history-footprint-by-store.png)

## 75 首页热销榜

入口：首页「猜你喜欢」下方常驻区块。

- 全平台店铺按月售 Top8 横滑展示（复用猜你喜欢卡片样式），显示店名 + 「月售 {n}」；
- 前三名左上角金/银/铜圆形排名角标（1 橙红 / 2 橙 / 3 琥珀）；
- 输入搜索关键词时区块自动隐藏，清空搜索后恢复；与搜索无结果兜底「热销店铺推荐」（Top4）并存互不影响。

截图：[76-home-hot-sale.png](screenshots/common-features-v15/76-home-hot-sale.png)

## 76 订单联系骑手

入口：订单详情页骑手卡（配送中订单）。

- 骑手卡操作区改为纵向双按钮：有骑手电话时显示「联系骑手」，点击直接拨号（`uni.makePhoneCall`）；「联系商家」按钮保持原位；
- 后端 `campusOrderRider` 新增返回 `phone`（骑手 Customer 的 phoneNumber，脱敏策略不变）；schema 增加可空 `phone: String` 字段；
- 兼容性：骑手电话为空或后端未升级时按钮自动隐藏，前端无需与后端同版本发布。

截图：[77-order-detail-contact-rider.png](screenshots/common-features-v15/77-order-detail-contact-rider.png)

## 77 验收记录与边界（第十五轮，2026-10-22）

验收方式：Playwright 390×844 dpr=2 移动视口，登录走线上测试账号，收藏/足迹/购物车/骑手为脚本注入或模拟响应；构建产物本地 serve 后截图，前端部署后核对线上 chunk。

| 项目 | 结果 |
|---|---|
| 收藏加购按钮 | 商品收藏卡渲染「加购」实心胶囊（断言通过） |
| 一键加购成功 | toast「已加入购物车」，跨店请求固定 vendure-token，购物车角标刷新 |
| 足迹单条删除 | 点「×」后行数 5→4，toast「已删除」（断言通过） |
| 按店铺聚合 | 切换后组头「川味小馆 3件 / 青柠奶茶 2件」，按钮态翻转为「按时间」（断言通过） |
| 首页热销榜 | 常驻区块渲染，月售 Top8 横滑，前三角标 1/2/3（断言通过） |
| 联系骑手 | 骑手卡双按钮「联系骑手 / 联系商家」，mock phone 拨号（断言通过） |
| 后端 schema | 线上 `campusOrderRider` 已接受 `phone` 字段（匿名 FORBIDDEN 为预期鉴权响应） |
| i18n | `favorites.addCart*`（3）、`history.groupByStore/byTime/removed/itemCount/unknownStore`（5）、`home.hotSaleTitle`、`orderDetail.contactRider` 中英双语补齐 |
| 构建/部署 | `pnpm build:h5` 通过，`deploy-waimai.mjs` 部署成功；插件 `tsc` 通过，lib 替换 + pm2 restart 成功 |
| 手机视口截图 | 390×844 dpr=2，共 5 张（74a/74b/75a/75b/76/77） |

边界与已知限制：
- 一键加购固定数量 1；已加购同规格再次点击由服务端默认叠加数量（与店内加购一致）；
- 足迹单条删除仅删本机记录，不影响常买清单（常买来自历史订单聚合）；
- 按店铺聚合按 `channelToken` 分店，历史足迹缺失 token 时归入「其他店铺」组；
- 热销榜排序依据店铺 `monthlySales` 快照，与店铺详情页月售数可能存在分钟级时差；
- 骑手电话以骑手注册 Customer 的 `phoneNumber` 为准，未登记手机号的骑手不显示「联系骑手」按钮。
