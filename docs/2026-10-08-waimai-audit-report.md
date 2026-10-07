# waimai 全链路体检报告（2026-10-08）

> 方案：4 域并行扫描（学生端/骑手端/后端/管理后台）+ 主线逐条核实 + 生产实测（Playwright 390×844 dpr=2）。
> 基线：冒烟 17 步 PASS（e.joho.cn 基址）；子代理误报已核实剔除（web-admin 提现审核实际已有确认弹窗+驳回理由必填）。

## 一、生产实测数据（性能维度结论：健康，无 P0/P1）

| 指标 | 数值 | 评价 |
|---|---|---|
| 生产 /shop-api 探活 | HTTP 200 / 135ms | 正常 |
| 首页 TTFB / load / 传输 | 105ms / 325ms / 178KB（15 请求） | 良好 |
| 店铺页进店（点击→数据齐） | 1.57s | 可接受 |
| 订单页 load / 传输 | 61ms / 54KB | 良好 |
| 关键接口（storeList+zones） | 48ms | 良好 |
| H5 产物 | 主包 387KB（gzip 后约 120KB 级），总体 0.75MB / 93 文件 | 可接受 |
| 冒烟基线 | S1-S8 全 PASS（17 断言） | 起点全绿 |

## 二、发现清单（核实后）

### P1（3 条）

**F1 [骑手端/性能资损] 大厅轮询定时器泄漏**
- `src/pkg-rider/pages/rider-home.vue:63-66` 定时器只在 `onHide` 清理；`grab()` 成功后 `redirectTo`（:110）触发的是 `onUnload`，定时器不清 → 跳到配送页后轮询继续跑；返回大厅再 `onShow` 又叠一组（onShow 内未先 clear）。
- 影响：每完成一单泄漏一个轮询循环（每循环 = 1 店铺列表 + 27 渠道请求/10s），骑手越用越卡、流量与服务器负载持续放大；心跳同理。
- 修法：onUnload 一并清理 + onShow 开头先 clear 两个 timer。

**F2 [后端/资金竞态] riderWithdraw 防重非原子**
- `rider-wallet.service.ts:77-91`：PENDING 防重检查 → 余额检查 → 扣款 → 落库，全程无事务无锁；同骑手并发双请求可双双通过防重与余额校验 → 双重扣款/双 PENDING。
- 修法：包事务，事务内 `SELECT ... FOR UPDATE` 锁骑手行（或 PENDING 部分唯一索引兜底）。

**F3 [后端/资金竞态] adminReject 退回非原子**
- `rider-wallet.service.ts:119-136`：addBalance 成功但状态更新失败时，重试会再次 addBalance → 双倍退回。
- 修法：addBalance + 状态更新包同一事务（端口调用移入事务或先改状态再退回+失败补偿）。

### P2（7 条）

**F4 [后端/信息暴露] campusHall 无鉴权**：`hall-shop.resolver.ts:45-48` 匿名可查全渠道大厅单（单号/金额/楼栋/小费）。修法：加 `assertApprovedRider` 或至少要求登录。

**F5 [骑手端/性能] 大厅轮询 N+1 请求**：`api/queries/hall.ts:54-61` 每 10s = 1 店铺列表 + 27 渠道逐请求（当前 27 店）。修法：后端加 `campusHallAll` 聚合查询一次带回全渠道单。

**F6 [后端/性能] dispatch scan 全量无上限**：`dispatch-job.service.ts:96-102` 每分钟全量拉 hall 态订单，单量增长后拖累 1G 小机。修法：take 上限 + 分批处理。

**F7 [后端/健壮] 通知 fire-and-forget 无补发**：`campus-notify.service.ts` 发送失败仅日志，用户可能收不到「骑手已接单」通知。修法：失败落库，tick 补发或告警。

**F8 [管理后台/性能] 骑手审核列表全量返回**：`web-admin/src/pages/rider/audit/index.vue:69-77` 后端忽略 skip/take 一次取全。修法：resolver 补分页。

**F9 [金额精度/骑手端] toFen 浮点丢分**：`rider-withdraw.vue:51` `Math.floor(parseFloat*100)`，26.9 → 2689 分（少 1 分）。修法：`Math.round` 或字符串分位解析。

**F10 [运维] 冒烟基址与 nginx admin-api 301**：`waimai-e2e-smoke.cjs` 默认 e.joho.cn；`www.yourbao.cn/admin-api` 缺 location，POST 301→GET 丢 body，yourbao 基址冒烟必挂 admin 步。修法：nginx 补 `/admin-api` location（带 `/admin-api/` 转发）或脚本内置双基址。

### P3（3 条）

**F11 [i18n]** 前端文案全中文硬编码（骑手端各页、rider-home 等），按模板硬规范应走 i18n；waimai 现为单语产品，补 i18n 工作量大，需用户定夺是否立项。
**F12 [管理后台/代码质量]** `campus/dispatch.vue` 枚举映射硬编码 `Record<string,string>` + `any`（excTypeLabel/statusLabel 等），且全额退款外的处置操作无二次确认。
**F13 [注释债]** `client.ts:5` 注释含生产域名（仅注释，非硬编码风险）。

## 三、核实过但健康（无需动）

- 抢单并发：悲观锁 + 顺路组按 id 升序加锁防死锁（hall-grab.service.ts:29-64）✅
- 调度任务：running 防重入 + shutdown 清理 + 内存同步防同轮误处理 ✅
- 归属校验：start/deliver/reject 均校验 deliveryStaffId === rider.id ✅
- admin 权限：31 处 @Allow 全部细粒度权限 ✅
- 金额：后端全整数分；前端显示 fmt 用整数分除 100 ✅
- client.ts 租户闸门 + dedupe + 动态 origin ✅；console.log 零残留；硬编码域名零残留 ✅
- web-admin 提现审核：确认弹窗 + 驳回理由必填（子代理 P0 误报，已剔除）✅

## 四、建议实施顺序（待用户确认优先级）

1. F1 定时器泄漏（一处小改，收益最大）
2. F2/F3 提现事务化（资金安全）
3. F9 toFen 精度（一行修）
4. F4 campusHall 鉴权（一行加断言）
5. F10 nginx admin-api location（运维配置）
6. F5/F6/F7/F8 性能与健壮性（涉及新接口/分页，工作量中等）
7. F11-F13 酌情
