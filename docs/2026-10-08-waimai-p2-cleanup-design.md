# waimai 二期收尾包设计（提现 / JSAPI 验证 / 加急调度 / 0 分成修复）

> 日期：2026-10-08 · 状态：设计定稿（用户已确认） · 前置：一期全量交付（HANDOFF.md）

## 1. 背景与范围

一期已交付学生端四页 + 骑手端四页 + 冒烟 S1-S8 PASS。本收尾包补齐 HANDOFF.md §9 二期待办中的四项，使一期功能完整闭环：

1. 骑手提现（人工审核打款）
2. 微信 JSAPI 支付真实验证
3. 滞留加急 + 强派调度开启
4. 0 分成单 addBalance 容错修复

**非目标**：评价体系、商家自助端（独立子项目，后续 spec）、自动转账到零钱。

## 2. 骑手提现（人工审核打款）

### 后端（campus-delivery-plugin）

- 新实体 `campus_withdrawal`：
  - `rider`（关联 customer）、`amount`（decimal）、`status`（`pending` / `paid` / `rejected`）
  - `applyAt`、`reviewAt`、`reviewNote`
- Mutation `campusRequestWithdrawal(amount)`：
  - 校验：`amount ≥ 10`（最低提现额）且 `amount ≤ riderBalance`（现有 credited 累计余额）
  - 通过后**申请即冻结**：可用余额立即扣减，建 `pending` 单
  - 校验失败抛业务错误（金额不足 / 低于最低额）
- Mutation `campusReviewWithdrawal(id, approve, reviewNote)`（admin 权限）：
  - `approve` → status=`paid`（语义：管理员已在微信线下转账完成）
  - `reject` → status=`rejected`，冻结金额**退回**骑手可用余额
- Query：骑手本人 `campusMyWithdrawals`；admin 侧分页列表（含骑手信息）

### 骑手端（waimai pkg-rider 收入页）

- 余额卡新增「提现」按钮 → 金额输入弹窗（校验最低额/余额上限，错误 toast 沿用现有风格）
- 新增提现记录列表：金额 + 状态标签（审核中=橙 / 已打款=绿 / 已驳回=红）+ 申请/审核时间
- 抢单页等其余页面不动

### 管理后台（web-admin）

- 提现审核页：列表（骑手/金额/申请时间/状态）+ 操作（通过 / 驳回+备注）
- 与现有骑手管理入口同级

## 3. 微信 JSAPI 支付真实验证

- 前置（用户操作）：微信商户平台为 JSAPI 支付追加 `/waimai/` 授权目录
- 验证：真实微信环境完成一笔 JSAPI 支付全链路（下单 → 拉起支付 → 支付成功 → 订单状态流转）
- 异常处理：如遇签名/目录/回调问题，按 verify 排障流程定位修复；代码侧预期无改动

## 4. 滞留加急 + 强派调度

- 开启 DispatchJobService T2/T3（>5 分钟滞留自动加急置顶，配置项默认关闭 → 生产开启）
- 骑手大厅：加急单置顶展示 + 「加急」标签（如前端已有排序支持则仅配置，无前端改动则补标签）

## 5. 0 分成单 addBalance 修复

- 现状：shipping=0 且 tip=0 的单送达写库成功但 `addBalance(0)` 抛错
- 修复：金额为 0 时跳过入账（不建 balance 流水），保证 `campusDeliverTask` 全流程成功
- 回归：补一条 0 分成送达的单测

## 6. 验收口径（每项）

实现 + vitest/冒烟回归（`waimai-e2e-smoke.cjs` 幂等通过）+ 手机截图（390×844 dpr=2 逐张目检）+ 操作手册补充（`vshop/docs/waimai-操作手册.md`）→ 本地构建部署（`deploy-waimai.mjs`，插件改动走 vendure 部署）→ 提交推送。三仓库（waimai / vendure / web-admin 涉及处）独立提交。

## 7. 风险与边界

- 冻结语义的账务一致性：申请冻结与驳回退回必须同事务/幂等，防双击重复申请（按钮乐观锁，同 rider 有 pending 单时拒绝再申请）
- JSAPI 验证依赖用户商户平台操作，代码侧不阻塞其他三项
- 调度开启后观察一晚大厅滞留表现，可随时配置回退
