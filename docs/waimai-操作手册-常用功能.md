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