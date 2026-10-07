# 优惠券 C 端 + 订单状态推送 设计文档

日期：2026-10-07
状态：设计已获用户确认（券页面版式 A 独立两页 + checkout 弹层/商品行券 chip + 推送 4 事件 + 待付款提醒超时取消）
范围：2026-10-07 拆分四项中的 2/4（优惠券 C 端）与 4/4（订单状态推送），合并一个 spec、两个里程碑（先券后推送）；1/4 售后退款、3/4 个人中心已上线。
Mockup：`docs/superpowers/mockups/2026-10-07-coupon/index.html`（本地 serve :52207，版式 A/B 对比，A 已定稿）

## 1. 背景与现状

**优惠券**：后端零工作量——vendure `coupon-plugin` shop-api 完整就绪（`couponCentre`/`myCoupons`/`claimCoupon`/`applyCouponToOrder`/`clearCouponFromOrder`/`claimProductCoupon` 等，见 `packages/coupon-plugin/src/coupon-shop.resolver.ts`）；vshop `src/api/queries/coupon.ts` 有完整查询封装可对齐；waimai 已有 `applyCouponCode` mutation 封装、Order fragment 已取 `couponCodes`+`discounts`、order-detail 已有优惠展示位。缺的只是 waimai 页面层。

**推送**：`campus-delivery-plugin/src/campus-notify.service.ts` 已实现公众号模板消息通道（fire-and-forget、`CampusFulfillmentConfig` 模板 ID 配置驱动、openid 缺失静默跳过），覆盖 5 个履约事件（接单/骑手分配/出餐/送达/异常）。增量 = 4 类新事件 + 待付款定时任务。

个人中心资产区「优惠券」灰态占位（`pages/profile/index.vue`）本期激活。

## 2. 需求决策记录（用户已确认）

| 决策点 | 结论 |
|---|---|
| 本轮范围 | 两个子项目都做，一个 spec 两个里程碑，先优惠券后推送 |
| 券功能范围 | 最小闭环（领券中心+我的券包+checkout 用券）+ 商品专属券；券商城/积分兑换/券码兑换不做 |
| 券页面版式 | 方案 A 独立两页（mockup A-1/A-2 定稿）；checkout 弹层与商品行券 chip 两案共用定稿 |
| 推送事件 | 下单成功 + 待付款提醒 + 取消通知 + 退款进度，四项全做 |
| 待付款策略 | 提醒（+10min）+ 超时自动取消（+15min） |
| 推送实现 | campus-notify 加法扩展（不新建插件、不迁移既有链路） |

## 3. 里程碑 1：优惠券 C 端（waimai，零后端改动）

### 3.1 新增分包 pkg-promotion（pages.json 注册，与 pkg-user 同级）

**coupon-centre.vue（领券中心）**
- tab：可领取 / 即将开始；券票据卡按 type 渲染：FIXED=¥x、PERCENT=x折、FULL=满x减y、FREE_SHIPPING=免配送费
- 领取调 `claimCoupon(templateId)`，成功转「已领取」；失败（领完/超限/未开始/新客限制）后端报错原样 toast + 刷新
- 数据 `couponCentre` 查询（startsAt/endsAt/totalCount/claimedCount/perUserLimit/newCustomerOnly 控制态）

**my-coupons.vue（我的券包）**
- tab：未使用 / 已使用 / 已过期（`myCoupons(status: UNUSED|USED|EXPIRED)`）
- 「去使用」→ 有进行中购物车跳 checkout 并预挂此券；无购物车回首页
- 底部次级引导「去领券中心逛逛 →」跳 coupon-centre

**API 层**：新增 `src/api/queries/coupon.ts` + `src/api/mutations/coupon.ts`，形态对齐 vshop 现成封装，走 waimai 既有 GraphQL client。

### 3.2 既有页面改造

- **pages/profile/index.vue**：资产区「优惠券」灰态 → 激活跳 my-coupons；登录态轻查询 `myCoupons(UNUSED)` 计数显示未使用数量角标
- **pages/shop/menu.vue**（waimai 无独立商详页，外卖形态）：商品专属券入口落在商品行——有绑定券的商品显示「¥x 券」chip（`productCoupons(productId)` 有数据才显示），点击直领 `claimProductCoupon`，成功转「已领取」
- **pkg-order/pages/checkout.vue**：费用区新增「优惠券」行 + 选券弹层（见 3.3）
- **pkg-order/pages/order-detail.vue**：既有优惠金额展示位直接生效，无改动

### 3.3 checkout 选券数据流

- **自动试挂最优**：进入 checkout 未挂券时，前端按口径估算：FIXED/FULL 按 `discountValue`、PERCENT 按 `subtotal×(1-value/100)`、FREE_SHIPPING 按当前配送费折算 → 取最大者 `applyCouponToOrder(code)`；弹层可换可不挂
- **弹层单选即生效**：选中即挂券实时回显新合计（Order fragment 已含 `couponCodes`+`discounts`）；「不使用优惠券」= `clearCouponFromOrder`
- 不可用券灰态带原因（按 `minSpend` 对比商品小计判定「未满 ¥x」）
- 单券约束：Vendure 一次一券码，弹层单选语义一致

### 3.4 i18n 与多店

- 全部文案走 i18n 字典（zh-CN/en-US 同步补充）
- 券模板按 channel 隔离，天然多店；无城市/配送耦合

## 4. 里程碑 2：订单状态推送（campus-notify 加法扩展）

### 4.1 新增 4 类用户侧事件

| 事件 | 触发源 | 模板配置字段（customField） | thing1 文案 |
|---|---|---|---|
| orderPlaced | `OrderPlacedEvent`（插件已订阅，处理链加一次 notify 调用） | `notifyTemplateOrderPlaced` | 订单支付成功，商家接单中 |
| paymentPending | 定时任务（4.3） | `notifyTemplatePaymentPending` | 订单待支付，请尽快完成 |
| orderCancelled | `OrderStateTransitionEvent` to=`Cancelled` | `notifyTemplateCancelled` | 订单已取消 |
| afterSales | 订阅 `AfterSalesStateTransitionEvent`（import 事件类，EventBus 运行时匹配） | `notifyTemplateAfterSales`（单模板，文案区分） | 审核通过/退款已到账/退款失败 |

改动落点：
- `CampusNotifyEvent` 联合类型 + `TEMPLATE_FIELD` + `STATUS_TEXT` 三处对齐扩展（campus-notify.service.ts）
- `campus-delivery-plugin/src/custom-fields.ts`：CampusFulfillmentConfig 加 4 个 nullable string 模板字段（物理列自动建，零 migration）
- **B 端 web-admin**（唯一 B 端改动）：campus 配置页补 4 个模板 ID 输入框
- **落地页增强**：`sendTemplate` 增加可选 `page` 参数，模板消息点击跳 H5 订单详情 `/#/pkg-order/pages/order-detail?code=xxx`；既有 5 事件顺带带上
- 取消通知过滤：C 端用户主动取消（`ctx.activeUserId` 即本人）不推；商家/系统超时取消才推

### 4.2 售后进度通知节点

订阅 `AfterSalesStateTransitionEvent`，用户侧关键节点过滤：`Approved`（审核通过）/ `Refunded`（退款已到账）/ `RefundFailed`（退款失败），其余状态不推。

### 4.3 待付款定时任务（campus-delivery-plugin 新增 payment-timeout.job.ts）

参照 `after-sales-timeout.job.ts` ScheduledTask 模式：

```
订单进入 ArrangingPayment → 登记 2 个定时任务：+10min 提醒 / +15min 取消（时长常量，不做配置）
订单离开 ArrangingPayment → 注销对应任务
任务到点：复查订单仍处 ArrangingPayment 才执行
  10min → 发 paymentPending 模板消息
  15min → OrderService.transitionTo(Cancelled) + 发 orderCancelled（文案注明超时未支付）
```

- 到点复查是竞态防线：防止到点瞬间用户刚付完
- 超时取消走 Vendure 正常 FSM 转换，库存释放等语义由核心保证；transitionTo 失败只记日志，不重试不抛出
- 下单成功锚点 = `OrderPlacedEvent`（与进大厅逻辑同源：waimai 流程下单成功即支付完成）

## 5. 错误处理

| 场景 | 处理 |
|---|---|
| 领券失败（领完/超限/未开始/新客限制） | 后端报错原样 toast，前端刷新券列表 |
| checkout 挂券失败（并发用掉/订单态变化） | toast + 刷新弹层券列表 + 重算费用，不阻塞下单 |
| 券模板 disabled/无券可领 | 领券中心空态引导；checkout 优惠行「暂无可用」 |
| 未知 CouponType | 通用券面「优惠券」兜底，金额区显示 discountValue 原值 |
| 重复点击领取/挂券 | 按钮防抖 + loading，失败可重试 |
| 未登录访问券页 | 复用 `authStore.requireLogin()` 分流（与 pkg-user 同策略） |
| 推送模板未配置/无 openid/微信接口失败 | 既有 fire-and-forget，只记日志 |
| 定时任务到点订单已支付/已取消 | 到点复查，仅 ArrangingPayment 才动作 |
| 超时取消 transitionTo 失败 | 只记日志，不重试不抛出 |

## 6. 明确不做（本期）

- 券商城购买、积分兑换、券码兑换、券包出售（coupon-plugin 能力保留，C 端不做页面）
- 券与配送费叠加规则改造（沿用 coupon-plugin 既有 minSpend 语义）
- 通知渠道扩展（短信/站内信/uniPush——message-plugin 个推通道保持现状）
- 推送频率控制/用户订阅偏好设置

## 7. 测试与交付

**vitest 纯逻辑（waimai）**：最优券估算纯函数（四类口径 + minSpend 判断 + 并列取大）；不可用原因文案生成。
**vitest（campus-delivery-plugin）**：payment-timeout 到点复查三态分支；新事件 TEMPLATE_FIELD 映射 + 文案截断（对齐 campus-notify.service.spec 模式）；取消通知过滤。
**生产冒烟（幂等可重跑）**：领券 → checkout 自动试挂 → 换券/不使用 → 支付 → 券转 USED → profile 角标减少；推送链路（测试单 ArrangingPayment → 收提醒 → 超时取消收通知，需公众号配置 4 个新模板 ID）。
**手机截图（硬规范 390×844 dpr=2 Playwright）**：券中心 / 券包 / checkout 选券弹层 / 商品行券 chip / profile 资产区激活态，逐张目检入库操作手册。
**操作手册**：`vshop/docs/waimai-操作手册.md` 补「优惠券」「订单通知」章节（含截图 + 公众号模板 ID 配置指引）。
**收尾一气呵成**：实现 → 回归 → 截图 → 手册 → 提交 → 推送 → 部署（vendure git pull + pm2 restart；waimai/web-admin 走 deploy.mjs）。
