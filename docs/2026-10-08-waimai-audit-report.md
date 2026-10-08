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

> **实施进度（2026-10-08）**：
> - F1 已修复上线（waimai `8f5de0b`：rider-home/rider-delivering stopTimers 挂 onHide+onUnload + onShow 防叠加；vitest 81/81；生产截图目检合格 `docs/screenshots/audit-f1-fix/`）。学生端 after-sale-detail/order-detail 轮询已用 Vue onUnmounted 且终态自停，无泄漏，无需改。
> - F2/F3 已修复上线（vendure `61fcfb178` + `9b014c863`：withdraw 用 rawConnection 独立事务 + 裸 SQL 行锁 `SELECT id FROM customer WHERE id=$1 FOR UPDATE` 串行化（实体 findOne+lock 会 LEFT JOIN 触发 PG "nullable side of outer join" 限制，生产实测发现后改裸 SQL）；reject/approve 条件 UPDATE 原子认领 + 退回失败补偿恢复 PENDING；插件单测 181/181；生产提现定向冒烟 9 项全绿 `vshop/docs/verify/waimai-withdraw-smoke.cjs`）。
> - 新增 F14（P2 测试基建）：全链路冒烟时段敏感——订单落在 30min 进厅窗口（dispatch-job.service.ts:122 scheduledFor 前 30min 放量）之外时 hallStatus 停在 scheduled，S5 必挂；应筛选窗口内时段或 scheduled 时降级跳过 S6-S8。
> - F9/F4 已修复上线（waimai `6dcd5c9` + vendure `06059db3b`，双仓单测 81+181 全绿；F4 生产探针：匿名 campusHall 被拒 `You are not currently authorized`、骑手会话正常返回；提现冒烟部署后重跑全绿）。
> - F10/F14 已修复（2026-10-08）：F10 nginx `location /admin-api/` 带尾斜杠致裸 `/admin-api` 落 SPA 回退 301 丢 body——改为前缀 `location /admin-api`（1Panel openresty 为 docker 容器 `1Panel-openresty-3I6S`，容器内 `nginx -t`+`-s reload`；备份 `.bak_f10_*`），生产 POST /admin-api 返回 JSON 200，yourbao 基址冒烟 admin 步恢复；F14 冒烟脚本条件断言（vshop `252d94d`），yourbao 基址全链路冒烟 partial PASS（S1-S5，调度流因窗口外跳过）。
> - F5-F8 已修复上线（2026-10-08，vendure `e85dfa138` + waimai `243bca9` + vshop `3d72a1b`）：
>   - **F5 聚合大厅**：后端新增 shop 端 `campusHallAll`（hall-grab.service.ts，范围=有履约配置+非默认渠道+未暂停，上限 500 单超限告警，排序同单渠道 hall：滞留>5min 置顶→小费降序→入厅升序），每单附 channelId/channelToken/channelName；前端 hall.ts `fetchHall` 改单请求聚合，N+1 轮询清零。
>   - **F6 扫描上限**：dispatch scan `SCAN_LIMIT=200` + createdAt 升序 + 超限告警。
>   - **F7 通知重试**：sendOnce 10s 超时，最多 3 次尝试（2s/8s 退避），全失败告警；dedupe_key 幂等保证重发安全。
>   - **F8 审核分页**：listApplications 支持 skip/take（默认 0/200），SDL 返回 `RiderApplicationList{items,total}`；web-admin 接入分页传参。
>   - 验证：插件单测 188/188（新增 hallAll 3 例 / notify 重试 2 例 / listApplications 2 例）+ waimai vitest 81/81；e2e 冒烟 partial PASS（S1-S5）+ 提现冒烟 W1-W6b 全绿；生产探针 6 项全 PASS——匿名 `campusHallAll` 被拒（鉴权生效）、骑手会话返回 200 且 channelToken/channelName/customFields 字段齐全、admin `riderApplications(skip:0,take:5)` 返回 `{total:1}` 分页生效。
> - F11-F13 已修复上线（2026-10-08，waimai `83a3bf7` + vshop `8c17177`）：
>   - **F11 骑手端 i18n**：从零搭 i18n 基建（移植 vshop web-admin 的 localeStore 模式：自研 t() 嵌套点键解析，当前 locale→zh-Hans 兜底→原 key，无 vue-i18n 依赖）；`src/locale/zh-Hans.json` + `en.json` 双包各约 120 词条；`main.ts` 全局注入 `$t` + 启动 `uni.setLocale` 同步内置文案。pkg-rider 6 页（home/delivering/earning/wallet/join/withdraw）文案全量进字典；业务值与展示分离——提现渠道提交值保持中文常量（后端审核可见），展示走 channelLabel 映射；抢单错误 `includes('已被抢')` 匹配后端中文原文（后端非多语言，不随语言切换）。验证：vitest 81/81、build:h5 通过、生产 5 页手机视口截图目检无 key 残留/无排版错乱（`docs/screenshots/f11-i18n/`）。边界：pages.json 导航栏标题未 i18n 化（需 uni 内置 %key% 机制，后续处理）；语言切换 UI 暂不做（单语产品，学生端迁移 i18n 后统一加）。
>   - **F12 调度台处置二次确认**：报告原文「枚举映射硬编码 Record<string,string>」已过时——plan 3.4（`dd3e342`）枚举映射即已 i18n 化；实质残留是退差价/补偿券/重派无确认，已补 `confirmHandle()`（uni.showModal 二次确认）+ campusDispatch 双语词条 4 条；vshop build:h5 通过、e2e 冒烟 S6-S8 调度流 PASS。
>   - **F13 注释债**：`client.ts:5` 注释去生产域名（改为「同源反代下」，1 行）。

1. ~~F1 定时器泄漏~~ ✅ 已上线
2. ~~F2/F3 提现事务化（资金安全）~~ ✅ 已上线
3. ~~F9 toFen 精度（一行修）~~ ✅ 已上线
4. ~~F4 campusHall 鉴权（一行加断言）~~ ✅ 已上线
5. ~~F10 nginx admin-api location（运维配置）~~ ✅ 已上线 + ~~F14 冒烟时段适配~~ ✅ 已上线
6. ~~F5/F6/F7/F8 性能与健壮性~~ ✅ 已上线（2026-10-08）
7. ~~F11-F13 酌情~~ ✅ 已上线（2026-10-08）——至此 F1-F14 全部清零

## 五、F11-F13 收口质检（2026-10-08，brainstorming 全面质检）

> 结论：**无卡点，8 项全绿**；4 个非阻塞观察项，当场处置 1 项、留痕 3 项。

| # | 检查项 | 结果 |
|---|---|---|
| 1 | 三仓推送同步 | waimai `5617402` / vshop `8c17177`（F12）均已推送，0 未推提交 |
| 2 | 未提交变更分类 | waimai 剩余 4 文件（+38 行）全部为 pkg-jianghu WIP（`VITE_JIANGHU_MOCK` 等），非 F11 遗留，符合不碰铁律 |
| 3 | i18n 键完整性 | zh-Hans 135 键 = en 135 键双语对齐；pkg-rider 6 页全部 `$t`/`locale.t` 静态引用零缺失（脚本校验） |
| 4 | 动态键来源 | delivering `labelKey`、wallet `TYPE_LABELS` 映射值全部命中字典 |
| 5 | 硬编码中文扫描 | 仅剩注释 / 业务值（支付宝/微信，刻意保留）/ 后端原文匹配（已被抢）/「江」字装饰图标，均有注释或属设计元素 |
| 6 | 部署一致性 | 生产 `/waimai/` index chunk `index-BUnRxzYQ.js` 与本地 dist 一致 → 线上即 F11 构建产物 |
| 7 | F12 落位 | 确认词条 ×4 双语落位 locale JSON:2583-2586；退差价/补偿券/重派三 handler 全部经 `confirmHandle` 二次确认 |
| 8 | 交付物 | 截图 5/5 已入库（debug 误入件已移除）、报告 F11-F13 条目已提交、vshop 工作区仅剩他会话截图（未触碰） |

观察项处置：

- **dist 退出 git 跟踪（本批执行）**：原「dist/build/h5 入库 + 服务器 git pull」约定已过时——生产 chunk 与本地构建一致、而 master 内 dist 为旧产物，证实部署实为本地构建 + scp 服务器解压。`.gitignore` 改为 `dist/` 全忽略 + `git rm -r --cached`（93 文件退出跟踪），scp 部署不受影响。
- ~~pages.json 骑手页导航栏标题未 i18n~~ ✅ 已随 i18n 深化完成（见第六章，%key% 机制覆盖全部非 pkg-jianghu 页）。
- rider-home「江」字水墨图标：装饰字形非文案；英文版上线时可换中性图形（极低优先级）。
- 早期后台冒烟 job（07:27 启动即 FATAL，HTML 当 JSON）：与交付无关，收口前台重跑全绿（e2e 17 步 + 提现 W1-W6b）为准。

## 六、i18n 深化：用户端全量迁移（2026-10-08，用户确认全量 B1–B5）

F11 只迁移了骑手端；本批把学生端硬编码中文全量迁入字典并补齐导航/TabBar 的 uni `%key%` 机制与语言切换 UI。

### 范围与产出

| 批次 | 范围 | 词条数 |
|---|---|---|
| B1 | 主包入口 pages/ 5 页 + components 4 组件 | ~173 |
| B2 | 交易链路 pkg-order 7 页（checkout/order-detail/pay-result/售后×2/评价×2） | ~328 |
| B3 | 用户+营销 pkg-user 6 页 + pkg-promotion 2 页 | ~119 |
| B4 | pages.json `%key%` 机制：非 pkg-jianghu 全部 navigationBarTitleText + tabBar text（30 nav.* + 3 tab.*） | 33 键 |
| B5 | 「我的」页语言切换入口（ActionSheet 中文/English） | 3 |

- 字典规模：`zh-Hans.json` = `en.json` = 30 命名空间 / 764 键双语对齐；导航键在 `uni-app{,.zh-Hans,.en}.json` 三件套。
- 迁移模式：状态/枚举映射改「值存 i18n 键」（如 order-detail statusMap、after-sale STATE_MAP `{labelKey,hintKey}`、errand KIND_KEYS），展示层映射；业务值中文保留（店铺 tags、满减文案为后端数据）。

### 关键技术点（uni `%key%` 机制三坑，后续项目直接复用结论）

1. **uni-app.*.json 词条必须包在 `common` 子对象**：`uni:json` vite 插件与 `parseLocaleJson` 对 `uni-app.*.json` 均只取 `jsonObj.common || {}`（构建期剥离）。
2. **`uni.setLocale` 在 `createApp()` 阶段无效**：其实现开头 `getApp()` 为空即 `return false`（不写 `UNI_LOCALE`、不更新 `$locale`）。而 `ensure()` 里调 `uni.getLocale()` 又会**提前创建 useI18n 单例**，使 `$locale` 钉死在 `navigator.language`。解法：`apply()` 里直接裸写 `localStorage['UNI_LOCALE']`（uni-shared `UNI_STORAGE_LOCALE`，注意键名不是 'uni_locale'），冷加载 `initAppVm → useI18n()` 即读到正确值；`uni.setLocale` 保留给运行时切换（app 已建，响应式联动导航栏/TabBar）。
3. **Playwright headless 的 `navigator.language` 继承宿主系统**（本机 zh-CN）——测试 en 场景必须注入存储键后 reload，不能指望浏览器默认英文。

### 验证（生产 https://www.yourbao.cn/waimai/）

- vitest 81/81 全绿；build:h5 通过（PickupLocationSheet defineProps 引 setup 变量的编译错误已修）。
- 冷加载探针：zh TabBar=`首页/订单/我的`、en TabBar=`Home/Orders/Profile`，`UNI_LOCALE`/`wm_locale` 双键同步。
- 运行时切换探针：我的页 → 语言 → English → TabBar/导航栏即时切换 + 存储双键变 en，PASS；ActionSheet（中文/English/取消）截图正常。
- 手机视口截图 9 张入库 `docs/screenshots/i18n-deepening/`（zh/en 首页+我的+登录页、ActionSheet、切换后、回切 zh）。

### 遗留（非阻塞）

- 店铺 tags（商家自提+拾光达接力 等4种方式）与「满20减4」为后端业务数据中文，不属静态文案范围。
- about.vue 协议长文 body 本期保留中文（UI 壳已 i18n）。
- pkg-jianghu 7 页标题维持中文（WIP 不碰铁律，随江湖版收口统一处理）。
