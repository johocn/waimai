# 外卖 C 端售后/退款流程 设计文档

日期：2026-10-07
状态：设计已获用户确认（后端方案 A + 售后创建页版式 A 清单勾选式）
范围：子项目 1/4（本轮 brainstorming 拆分的四项之一）；其余三项（优惠券 C 端、个人中心补齐、订单状态推送）后续各自走 spec → plan 循环。

## 1. 背景与目标

外卖 C 端（d:\zhao\waimai，uni-app H5）订单详情页的「申请售后」按钮目前是死链（`notOpen`）。用户漏餐/错餐/少餐/餐损无自主救济，只能线下找商家或等骑手异常上报触发 3.4 异常赔付。

本设计补齐 C 端售后闭环：**申请（整单 + 按商品行部分退）→ 商家审批（48h 未审自动退）→ 被拒可申诉 → 平台仲裁 → 原路退回**。

核心结论：vendure `after-sales-plugin` 已注册且能力完备（shop-api 创建/取消/凭证上传/留言，admin-api 审批/退款，`refundOrder` 原路退回，状态历史），本设计**全量复用该插件**，仅做加法式扩展与前端建设。

## 2. 需求决策记录（用户已确认）

| 决策点 | 结论 |
|---|---|
| 售后粒度 | 整单退款 + 按商品行选数量部分退款（金额自动计算，不可手填） |
| 售后窗口 | 确认收货/送达后 24h 内；未接单取消仍走现有 cancelOrder，两链路不交叉 |
| 处理流 | 商家审批（web-admin）→ 拒绝后用户可申诉 → 平台仲裁 |
| 超时兜底 | 商家 48h 未审批自动按用户申请金额原路退回（插件内建能力） |
| 实施方案 | 方案 A：全复用 after-sales-plugin + 状态机加法扩申诉 |
| 售后类型 | 固定 `refund_only`（外卖无退货）；`return_refund`/`exchange` 不暴露给 C 端 |
| 退款方式 | 原路退回（复用插件 `executeRefund` → `orderService.refundOrder` + `settleRefund`） |
| 创建页版式 | 版式 A 清单勾选式（美团风，mockup 已确认） |

## 3. 后端设计（vendure）

### 3.1 插件配置（dev-config.ts，一行改动）

```ts
AfterSalesPlugin.init({
    maxDaysAfterDelivery: 1,          // 售后窗口 24h（默认 15 天）
    afterSalesAutoApproveHours: 48,   // Pending 48h 未审自动同意并退款（0=关，内建定时任务）
    afterSalesRefundAutoRetry: 1,     // 退款失败自动重试 1 次（内建）
})
```

渠道级 customFields 覆盖（`afterSalesTimeoutHours` / `afterSalesAutoApproveHours` 等）为插件既有能力，本期不做渠道差异，全局统一。

### 3.2 状态机加法扩展（after-sales-plugin/src/types.ts）

现状：`Approved: ['Returning', 'Closed']`、`Rejected: []`。refund_only 场景存在断链：退款执行要求 `Received` 态，但无退货时无法从 `Approved` 直达。

改动（全部加法，不动既有语义）：

```
Approved:  ['Returning', 'Received', 'Closed']   // +Received：refund_only 免退货直达
Rejected:  ['Appealed', 'Closed']                // +Appealed：用户申诉入口
Appealed:  ['Approved', 'Closed']                // 新增态：仲裁同意退款 / 维持拒绝
```

新增 `Appealed` 加入 `AfterSalesState` 联合类型。`Appealed → Approved` 后走既有 `Received → Refunded` 退款链路。

### 3.3 仲裁接口（after-sales-plugin admin-api）

新增 1 个 mutation：

```graphql
arbitrateAfterSales(id: ID!, approve: Boolean!, note: String): AfterSalesRequest!
```

- 权限：仅平台管理员（新增 Permission 或复用 SuperAdmin，实现时按插件 permissions 现状对齐）
- `approve=true` → `Appealed → Approved`（note 记入 AfterSalesStateHistory），**同一事务内链式 `Approved → Received` 并触发 `executeRefund`**（最短路径，仲裁同意即退款，不需要管理端二次操作）
- `approve=false` → `Appealed → Closed`（维持拒绝，note 必填展示给用户）

### 3.4 商家侧权限

商家（merchant-admin 身份体系）可调用既有 `approveRequest` / `rejectRequest` / 留言接口。需在插件 permissions 与 merchant-admin 角色对齐（实现时确认现有 merchant 权限清单，加法授予售后审批权限）。

### 3.5 售后原因枚举（业务层约定，不改插件）

原因作为 `reason`/描述字段存储，前端枚举：`漏送 / 错送 / 少送 / 餐损洒漏 / 其他`。部分退款必传凭证 1-3 张（前端强校验 + 后端既有 `uploadEvidence` 白名单 MIME/5MB 限制），整单退款凭证可选。

## 4. C 端前端设计（waimai uni-app）

### 4.1 新增页面（pkg-order/pages/）

**after-sale-create.vue**（版式 A 清单勾选式，mockup 已定稿）
- 订单商品清单：每行 checkbox + 缩略图 + 名称/规格 + 单价 + 数量 stepper；勾选行参与退款计算
- 预计退款金额实时计算（`Σ 行单价 × 行数量`），不可手填
- 原因 chips 单选（漏送/错送/少送/餐损洒漏/其他）+ 问题描述（选填）
- 凭证上传 1-3 张（部分退款必传，走既有 `uploadAfterSalesEvidence`）
- 底部提示「48 小时内商家未处理，将自动原路退回」
- 提交 → `createAfterSalesRequest`（type=refund_only，携带行明细与金额）

**after-sale-detail.vue**（跟随版式 A 风格，mockup 已定稿）
- 状态卡：当前状态大字 + 四段步骤条（提交申请 → 商家审核 → 平台仲裁 → 完成）
- 被拒态展示拒绝理由；申诉按钮（`Rejected` 态显示，调申诉 mutation）
- 退款信息卡：商品行明细、申请编号、预计退款金额、凭证缩略图
- 留言卡：商家/用户气泡流（复用插件消息接口），用户可回复
- 操作按钮随状态切换：`Pending` → 撤销申请；`Rejected` → 申请平台仲裁 + 联系商家；`Refunded` → 展示退款到账信息

**售后详情页状态映射**（插件态 → C 端文案）：
Pending=商家审核中 / Approved=商家已同意 / Received=待退款 / Refunded=已退款 / RefundFailed=退款失败处理中 / Rejected=商家已拒绝 / Appealed=平台仲裁中 / Closed=已关闭（区分「商家撤销关闭」与「仲裁维持拒绝」按 history 判定）。

### 4.2 既有页面改造

**order-detail.vue**
- 「申请售后」按钮 `notOpen` 死链 → `uni.navigateTo` 售后创建页（带 orderId）；`canAfterSale` = 确认收货/送达后 24h 内 且 无进行中售后单
- 新增售后状态卡：订单存在售后单时显示状态摘要 + 点击跳详情；进行中售后单隐藏「取消订单」按钮
- 保留既有异常赔付提示条（3.4），与售后卡共存不互斥

**my-reviews / orders 列表**：不加售后入口（保持入口单一，实现简单）。

### 4.3 数据流

```
C端创建售后单(lines/金额/原因/凭证)
  → 商家 web-admin 审批（同意/拒绝/留言）
  → [48h 未审自动同意 → 自动退款]（插件定时任务）
  → 被拒 → 用户申诉 → 平台仲裁 mutation
  → executeRefund → orderService.refundOrder(+settleRefund) 原路退回
  → 状态历史 + order.customFields.afterSalesStatus 回写（插件既有逻辑）
  → C 端轮询可见
```

## 5. B 端设计（web-admin）

- **商家侧**：售后审批列表（Pending）+ 详情（订单/商品行/凭证/留言）+ 同意/拒绝（拒绝理由必填）+ 留言回复。若插件自带 admin UI 可用则直接挂菜单；否则新增精简列表页（实现 plan 时确认，不重写插件已有能力）
- **平台侧**：仲裁列表（Appealed）+ 同意退款/维持拒绝（note）+ 退款失败单（RefundFailed）手动重试入口
- 商家/平台菜单按现有 web-admin 权限体系区分

## 6. 错误处理

| 场景 | 处理 |
|---|---|
| 窗口外提交（24h 外 / 未送达） | 前端按钮置灰 + 提示；后端既有校验兜底（UserInputError） |
| 重复售后单（同订单进行中） | 插件既有校验拒绝；前端隐藏入口 |
| 部分退款金额超额 | 金额由行明细自动计算（上限=实付），插件 `refundOrder` 超额拒绝 → `RefundFailed` 留痕 |
| 退款失败 | `RefundFailed` 自动重试 1 次（内建）；管理端手动重试；失败原因落 `refundError` |
| 恶意/频繁售后 | 本期不做风控（YAGNI），依赖 24h 窗口 + 单订单单售后单约束 |

## 7. 测试与交付

- **单测**：状态机新增转移合法性（Approved→Received、Rejected→Appealed、Appealed→Approved/Closed）；部分退款金额计算；窗口校验
- **e2e 全链路脚本**：创建售后 → 商家拒绝 → 用户申诉 → 平台仲裁同意 → 退款到账（mock 支付场景用既有冒烟脚本模式）
- **手机截图**（硬规范）：售后创建页 / 详情页（审核中/被拒/已退款三态）/ 订单详情售后卡，390×844 dpr=2，Playwright
- **操作手册**：用户售后指引 + 商家审批操作 + 平台仲裁操作，补截图
- 交付定义 = 实现 + API/e2e 回归 + 手机截图 + 操作手册

## 8. 明确不做（本期）

- 微信订阅消息推送（归子项目 4「订单状态推送」）
- 补送/换货类型、退货物流（外卖场景不需要）
- 售后风控/黑名单
- checkout 过期日期 chips 过滤小 bug：与本设计无关，实现 plan 时可顺手带上（一行过滤），不阻塞
