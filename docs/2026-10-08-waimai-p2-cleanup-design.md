# waimai 二期收尾包设计 v2（提现收口 / JSAPI 验证 / 调度核验）

> 日期：2026-10-08 · 状态：设计定稿 v2（v1 起草后经代码核实改版：提现/调度/0 分成均已实现上线，本 spec 转为收口口径）· 前置：一期全量交付（HANDOFF.md）

## 1. 背景与范围

v1 按「四项待开发」起草。2026-10-08 代码核实（记录见 §8）：四项中三项已在 10-07 前后完成并上线生产，仅剩一处代码缺口。本收尾包随之改为：

1. **骑手提现**：补齐防重申请缺口（唯一代码改动）+ 全流程端到端验证收口
2. **微信 JSAPI 支付真实验证**（纯验证，代码已就绪）
3. **滞留加急 + 强派调度**：生产配置核验 + 观察收口（已默认开启）
4. ~~0 分成单 addBalance 修复~~（已完成：`5fa63c726` + 单测覆盖，仅回归确认）

**非目标**：评价体系、商家自助端（独立子项目，后续 spec）、自动转账到零钱。

## 2. 骑手提现收口

### 2.1 已实现现状（核实确认，勿重复开发）

- 后端（vendure campus-delivery-plugin）：实体 `RiderWithdrawalRequest`（customerId/amount/channel/account/status=PENDING|PAID|REJECTED/remark/reviewedBy/reviewedAt）；shop-api `riderWithdraw(amount≥¥10, channel, account)`（申请即 `deductBalance` 冻结）、`riderWithdrawRequests`（本人记录）、`myRiderWallet`（available/frozen/totalEarned）、`riderBalanceHistory`；admin-api `riderWithdrawals(status)` 列表 + `approveRiderWithdraw`（PAID 留痕）/ `rejectRiderWithdraw`（退回 `addBalance`）；资金固定默认渠道上下文（`62d7a9cdb`，107/107 测试）
- 骑手端（waimai pkg-rider，单一分包无双包问题）：收入页「去提现」入口（rider-earning.vue L17-23）→ 钱包页 rider-wallet（余额/审核中/累计 + 收入明细/提现记录双 tab）→ 申请页 rider-withdraw（金额/支付宝|微信/账号）
- 管理后台（vshop 仓库 web-admin）：`pages/rider/withdraw` 审核页（PENDING/PAID/REJECTED/ALL 四 tab + 通过/驳回弹窗 + i18n，`9377688`，api `apis/rider-withdraw.ts`）
- 生产 schema 已含全部接口（2026-10-08 introspection 探测确认）
- E2E 脚本已存在：`waimai/.secrets/rider-withdraw-e2e.cjs`（注入余额 → 申请冻结 → 越界拒 → 驳回退回 → 通过留痕 → 记录可查）

### 2.2 待补缺口（唯一代码改动）

- **防重申请**：`riderWithdraw` 申请前查同骑手是否已有 `PENDING` 单，存在则抛「您有审核中的提现申请，请等待审核完成」（v1 §7 风险项落地；现状余额充足时可重复申请建多笔 PENDING）
- 前端无需改动（错误 toast 已透传后端 message）

### 2.3 验证收口（无代码）

- 生产全流程：`rider-withdraw-e2e.cjs`（扩防重用例后）PASS + waimai 冒烟 PASS
- 手机截图（390×844 dpr=2 逐张目检）：收入页入口 / 钱包页 / 提现记录状态标签 / 申请页 / web-admin 审核页
- web-admin 线上核验：提现审核页可访问可用；若线上为旧版则补部署（web-admin 自有 scripts/deploy.mjs 机制）

## 3. 微信 JSAPI 支付真实验证

- 前置（用户操作）：微信商户平台为 JSAPI 支付追加 `/waimai/` 授权目录
- 链路已就绪：前端 `usePayment.ts`（H5 redirect h5Url / mp-weixin JSAPI 签名参数）+ 后端 wechatpay-plugin（paySign）
- 验证：真实微信环境完成一笔 JSAPI 支付全链路（下单 → 拉起 → 成功 → 订单状态流转）；异常按 verify 排障流程（`vshop/docs/verify/2026-10-waimai-e2e.md`）定位，代码侧预期无改动

## 4. 滞留加急 + 强派调度（改为核验收口）

核实结论：**已实现且默认开启**——`DispatchJobService.start()` 插件启动即每分钟 tick（campus-delivery.plugin.ts L666，无开关）；大厅排序 滞留>5min 置顶 → 小费降序 → 入厅时间升序（hall-grab.service.ts `hall()` L105-124）；前端加急徽标（rider-home.vue `isUrgent`）；T2 强派 `autoAssignMinutes` 默认 10min、T4 自动退款 `autoRefundMinutes` 默认 30min、T3 SLA `inProgressSlaMinutes` 默认 45（CampusFulfillmentConfig）。

- 核验：admin-api `campusConfig` 查生产渠道 `autoAssignMinutes` / `autoRefundMinutes` / `paused` 值，确认非 paused、阈值符合预期（调整走 `campusUpdateConfig` / web-admin 配置页）
- 观察：观察一晚大厅滞留表现，可配置回退

## 5. 0 分成单修复（已完成，回归确认）

- `5fa63c726`「0 分成单跳过余额入账避免抛错」（rider-task.service.ts L166-184）+ 单测「0 分成单（0 运费 0 小费）不入账不写 earning 且不抛错」（rider-task.service.spec.ts L53）
- 收口：插件 vitest 全绿 + 生产冒烟 PASS 即确认

## 6. 验收口径（每项）

实现 + vitest/冒烟回归（`waimai-e2e-smoke.cjs` 幂等 PASS）+ 手机截图（390×844 dpr=2 逐张目检）+ 操作手册补充（`vshop/docs/waimai-操作手册.md` 增「骑手提现与审核」章节）→ 部署（防重改动走 vendure 服务器 git pull + pm2 restart；waimai/web-admin 无代码改动则按核验结果决定）→ 提交推送。三仓库独立提交。

## 7. 风险与边界

- 防重申请为业务级约束：驳回/打款后即可再次申请，与前端「提交后余额即冻结」文案自洽
- JSAPI 验证依赖用户商户平台操作，不阻塞其他项
- web-admin 部署状态运行时才能确认，验证步骤中先探测后补部署

## 8. 核实记录（2026-10-08）

| 项 | 结论 | 证据 |
|---|---|---|
| 提现后端 | 已完成并上线生产 | vendure `67b8297dd`/`d2d4bf611`/`5fa63c726`/`62d7a9cdb` 已推送；生产 shop-api introspection 含 `riderWithdraw`/`riderWithdrawRequests`/`myRiderWallet` |
| 提现骑手端 | 已完成 | waimai `76d0bf7`/`714d60e` 已推送；pages.json 单一 pkg-rider 包（无双包问题） |
| 提现 web-admin | 代码已完成（线上部署待核验） | vshop `9377688` 已推送；web-admin/src/pages.json L30 路由已注册 |
| 0 分成修复 | 已完成 | `5fa63c726` + rider-task.service.spec.ts L53 单测 |
| 加急+强派 | 已默认开启 | campus-delivery.plugin.ts L666 `start()`；hall-grab.service.ts `hall()` 排序；rider-home.vue 徽标 |
| 防重申请 | **未实现（唯一代码缺口）** | rider-wallet.service.ts `riderWithdraw` 无 PENDING 检查 |
| JSAPI | 代码就绪待真实验证 | waimai usePayment.ts + vendure wechatpay-plugin |
| 提现 E2E | 脚本已存在，缺防重用例 | waimai/.secrets/rider-withdraw-e2e.cjs（gitignore 不入库） |
