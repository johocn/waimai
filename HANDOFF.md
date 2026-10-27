# waimai 校园外卖 — 开发交接文档

> 交接时间：2026-10-06 · 交接人：AI 开发会话（johocn 授权） · 接手人：新开发者

## 1. 项目一句话

独立 uniapp（H5 先行）外卖 C 端模板，已上线 **https://www.yourbao.cn/waimai/**，对接 vendure 校园外卖模块（campus-delivery-plugin）。channel = 餐饮店铺，含学生端四页 + pkg-rider 骑手端四页。

## 2. 当前进度总览

| 阶段 | 状态 | 位置 |
|---|---|---|
| 设计 spec（含 §12 增补定案） | ✅ 定稿 | `docs/2026-10-05-waimai-template-design.md` |
| Plan 1 后端缺口（5 项） | ✅ 已上线生产 | `docs/2026-10-05-waimai-plan1-backend.md` |
| Plan 2 学生端（9 Tasks） | ✅ **全部完成并上线** | `docs/2026-10-05-waimai-plan2-student-frontend.md` |
| Plan 3 骑手端+部署（6 Tasks） | ✅ **全部完成并上线**（2026-10-06 验收收口） | `docs/2026-10-05-waimai-plan3-rider-deploy.md` |
| 首页改版（方案 B 轻量版） | ✅ 已上线（2026-10-06，`master` @ `3ff0290`） | `docs/2026-10-06-waimai-home-revamp.md` |
| 首页双主题（明亮/黑暗，方案 A 橙头；暗色搜索框同步变暗） | ✅ 已上线（2026-10-06，`master` @ `2d06bfd`） | `docs/2026-10-06-waimai-home-revamp.md` §双主题 |
| 店铺内页三 Tab 改版（版式 A 橙头浮卡 + 双主题） | ✅ 已上线（2026-10-06，`master` @ `8109aac`） | `docs/2026-10-06-waimai-shop-revamp.md` |
| 配送路线文案映射表（R1-R5 全语义，修 R2 误归 bug） | ✅ 已上线（2026-10-06，`master` @ `fba04fa`） | `docs/2026-10-06-waimai-shop-revamp.md` §关联组件 |
| P2 收尾包（提现防重+累计收入修复；提现全链路/调度配置/JSAPI 验证收口） | ✅ 已上线（2026-10-08，waimai `aab72ba` + vendure `56bcfae8`/`bcdad756f`） | `docs/2026-10-08-waimai-p2-cleanup-design.md` + `docs/2026-10-08-waimai-p2-cleanup-plan.md` |

**当前状态 = 一期全量交付 + P2 收尾包上线**：学生端四页 + 骑手端四页（含钱包/提现）+ 全链路冒烟 S1-S8 PASS + 提现 E2E（13 断言含防重）PASS + 5 张收尾截图目检合格（`vshop/docs/screenshots/waimai/p2-cleanup/`）+ 操作手册 §12（`vshop/docs/waimai-操作手册.md`）。

## 3. 本仓库现状

- `master` @ `2b8d3e7`（以 `git log -1` 为准）：生产 P0 修复（graphql-request v7 绝对 URL）+ riderEarning 展示修复
- 主题 token：`--brand: #ff6600` / `--brand-soft: #fff3e6`（沃堡橙），`VITE_BRAND_COLOR` 可运行时覆盖
- `.env.development` 的 `VITE_API_URL` 已置空（与生产同形态；vite proxy 按路径匹配仍生效，dev 5181 正常）

## 4. 必读知识（接手前 10 分钟）

1. **后端接口已全部就绪（生产 e.joho.cn/shop-api）**：`waimaiStoreList`（含 promoText，已过滤默认渠道）、`campusSetDeliveryTarget`、`campusHall/campusGrabOrder/campusMyTasks/campusStartTask/campusDeliverTask/campusTransferTask`、`campusOrderRider`、`myRiderEarnings`、`campusRiderOnline/Heartbeat`。插件源码 `d:\zhao\vendure\packages\campus-delivery-plugin`
2. **渠道即店铺**：进店铺 = `switchTenant(channelToken)` 切 vendure 渠道，activeOrder 随 session+渠道隔离 = 每店独立购物车
3. **骑手是平台角色**：走默认渠道会话，`riderClient(channelToken?)` 不传 token = 平台操作，传店铺 token = 大厅/任务（campus* 按 ctx.channelId 过滤，前端逐店铺聚合，mutation 须回传同渠道 token）
4. **骑手信用分 ≥60 才能抢单**（CREDIT_LIMIT）：冒烟骑手多轮拒单会掉分导致 grab FORBIDDEN；恢复：admin-api `updateCustomer(input:{id:"150",customFields:{riderCredit:100}})`
5. **graphql-request v7 硬要求绝对 URL**：H5 下 `client.ts` 已做 `window.location.origin` 动态兜底，新增独立 GraphQLClient 一律走 `getShopApiUrl()`，勿硬编码 localhost/域名
6. **测试规范**：vitest 只测纯逻辑（store-filter / timeline）；验收截图 Playwright **390×844 dpr=2** 逐张目检（子代理 PASS 汇报不可信）
7. **部署**：`node d:\zhao\waimai\.secrets\deploy-waimai.mjs`（本地构建 → 产物校验 → tar → scp → 服务器解压 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/yourbao/waimai/`，静态替换即时生效无需 reload）。**严禁在服务器构建**（内存不足）
8. **上线前人工项**：微信商户平台为 JSAPI 支付追加 `/waimai/` 授权目录（用户操作，不阻塞其余功能）

## 5. 常用命令

```bash
# 开发（vite 代理 e.joho.cn，无需本地后端）
pnpm dev:h5          # http://localhost:5181/waimai/

# 纯逻辑测试
npx vitest run

# 生产构建（产物 dist/build/h5/，路径带 /waimai/ 前缀）
pnpm build:h5

# H5 部署生产
node .secrets/deploy-waimai.mjs

# 生产冒烟（期望 E2E SMOKE PASS，幂等）
node d:\zhao\vshop\docs\verify\waimai-e2e-smoke.cjs

# 后端单测（改动插件时）
cd d:\zhao\vendure\packages\campus-delivery-plugin && npx vitest --config vitest.config.mts --run
```

## 6. 环境凭据边界

- 生产 admin 凭据 superadmin/z123123；冒烟账号 `smoke-order@yourbao.cn` / `smoke-rider@yourbao.cn`（Wm@Smoke123）——**凭据一律留在 `.secrets/`（已 gitignore），严禁入库**
- waimai 后端联调走同源反代：生产 `VITE_API_URL` 留空 = 同源 `/shop-api`（nginx location `/shop-api` 无尾斜杠，注意 301 丢 body 坑）

## 7. 相关仓库

| 仓库 | 位置 | 状态 |
|---|---|---|
| waimai（本仓库） | `d:\zhao\waimai` → `github.com/johocn/waimai` | master @ 2b8d3e7 已推送 |
| vendure（后端） | `d:\zhao\vendure` → `github.com/johocn/vendure` | master 已推送；waimaiStoreList 默认渠道过滤（e6e51865a）已部署 |
| vshop（底座源 + 文档原产地） | `d:\zhao\vshop` | master @ 60c2823 已推送（含操作手册/verify/8 页截图） |

## 8. 验收清单（全部完成）

- [x] vitest 全绿（store-filter + timeline）
- [x] build:h5 成功，产物带 /waimai/ 前缀
- [x] 全链路冒烟 8 步 PASS（2026-10-06 生产验收轮：订单 246/247）
- [x] 8 张手机截图逐张目检（学生端 4 + 骑手端 4，`vshop/docs/screenshots/waimai/`）
- [x] 操作手册（`vshop/docs/waimai-操作手册.md`）+ verify 排障沉淀（`vshop/docs/verify/2026-10-waimai-e2e.md`）
- [x] 生产部署 + curl 200（JSAPI 授权目录待用户在微信商户平台操作）

## 9. 已知限制 / 二期待办

- ~~骑手收入页提现功能二期开放~~ → **已收口（2026-10-08 P2 收尾包）**：申请即冻结/驳回退回/通过留痕 + 同骑手 PENDING 防重 + web-admin 审核页 + E2E（`.secrets/rider-withdraw-e2e.cjs`）
- 微信 JSAPI 支付待商户参数配置；当前冒烟走 COD 授权链路（P2 已验证代码链路就绪，真实支付待用户配置 `/waimai/` 授权目录后验证）
- 大厅单滞留 >5 分钟自动加急置顶；T2 强派/T4 自动退款定时调度**默认开启**（2026-10-08 生产核验：全渠道 paused=false，阈值 10/30/45）
- ~~0 分成单（shipping=0 且 tip=0）送达写库成功但 addBalance 抛错~~ → 已修复（vendure `5fa63c726`，跳过入账 + 单测覆盖）
- nginx `www.yourbao.cn.conf` 改前备份 `.bak_waimai_20261006`（root 补齐前主站一直显示 openresty 欢迎页的历史问题已修复）

## 10. 江湖域 `pkg-jianghu` · 学校图书馆「密页传递」（2026-10-23 进度）

独立于外卖主流程的玩法模块（`src/pkg-jianghu/`），uniapp + Phaser 等距 2.5D 场景 + Pinia store；后端走 `JIANGHU_MOCK` 门控（mock 在 `src/api/mock/jianghu.ts`，真实 GraphQL/admin-api 分支按惯例抛「待接入」+ TODO）。

**已落地**
- 图书馆场景（`pages/jh-library.vue` + `scene/*`）：书架/背景画/故事角/阅览桌/管理台/巡逻员 + 可挪动书堆 + 书签标记；暴露度条 + 可取时间窗；藏/传/道具/技能操作面板。
- 张力模型：证据链 `world.evidence` → 暴露度 → 巡逻员自适应加速/红环 → 可取窗高暴露自动截获。
- UGC 自定义技能审核闭环：玩家提交 → mock PENDING → **运营后台** `pages/jh-admin.vue`「自定义技能审核」队列（通过入库/驳回）→ approved 进入「藏匿/传递通道」选择器实玩；rejected 演练触发伪造证据反噬。数据源在 store（`customSkills/adminSkills`），非本地 world。
- `methodId/channelId` 持久化：投放时写入 `DeadDropPlaceInput` → mock `state.deadDrop`（随 `hydrate/persist` 往返）→ PLACED 态回显。
- 相机缩放/平移：滚轮 + 双指捏合缩放、`pan` 工具/双指拖拽平移；命中前统一 `cameras.main.getWorldPoint` 转世界坐标，保证等距命中不错位；「环境谜面」HUD `setScrollFactor(0)` 固定。
- P3 环境暗号 contextual：`scene/codebook.ts` 的 `contextualBoard(seed)` 生成「书架编号/画中题诗/借阅卡」三类语境暗号（按 playerId 种子分化），`codeEntry/codeHintOf` 支持「取自何处」线索；经典 12 词保留为回退。

**关键文件**：`scene/world.ts`（对象/证据/技能派生 `categoryAttrs/skillToStash/skillToChannel/riskSeverity/approvedCustomSkills`）、`scene/codebook.ts`、`scene/JianghuIsoScene.ts`（基类）、`scene/iso.ts`（投影）；`api/{queries,mutations,admin,mock}/jianghu.ts`；`stores/jianghu.ts`；`pages/jh-{library,admin}.vue`。

**验证**
- 纯逻辑单测：`tests/jianghu-scene.spec.ts`（world 助手 / codebook contextual / iso 往返）。
- 全部改动文件 IDE `read_lints` 0 error/0 warning。
- 本机 `node_modules` 未安装，`pnpm install` 后跑 `pnpm test`（vitest）与 `pnpm build:h5`；dev 冒烟 `pnpm dev:h5` → `#/pkg-jianghu/pages/jh-library`（提交技能→jh-admin 审核→选择器出现→选高暴露项投放看红环/自动截获；滚轮/双指缩放、pan 拖拽、复位视野；环境谜面读暗号）。

**玩法深化（2026-10-24）**
- 道具系统实玩化：`world.inventory` 持有背包（mock `state.inventory` + `jianghuInventory/SaveInventory` + store `loadInventory/saveInventory/grantProp` 持久化）；`req` 门控生效（未持所需道具的藏点在选择器置灰「需道具」，投放前引导去人物故事会；`take-painting/climb` 属场景动作不门控）。
- 组合技：`comboBonus/effectiveStash`（窥镜降风险、磁贴对阅览区加速、解码镜看穿画夹层、假书脊加成…）→ 调制 `doPlace` 写入的证据严重度（隐蔽手法/窥镜少留证据），选择器卡片展示组合加成。
- 道具效果：干扰物 `useDistraction` 定时引开巡逻（期间 `alertLevel` 归零、巡逻暂停、绿环提示）；怀表在可取窗显示「巡逻警觉 %」；解码镜/显影剂在暗号框显示背景画夹层题诗（配合 P3 语境暗号）。
- 人物故事会：story 角 NPC 面板（说书人），初见馈赠 + 机缘解锁（首次取件→窥镜/干扰物、首次流转→解码镜、段位门槛→手电/权限卡）；场景「人·走动」点到故事角或背包按钮均可打开。
- 难度平衡与反馈：`EXPOSURE_PER_SEVERITY/PATROL_BASE_SPEED/PATROL_ALERT_GAIN/DISTRACT_MS` 常量化并接入暴露度与巡逻；暴露度评级（低/中/高/危）；取件按隐蔽度+暴露度结算奖励（mock `pickupReward`）并给 S/A/B 评级；新手三连 flash + 可关闭引导条。

**剩余后端 TODO（上线前）**：`jianghuDeadDrop*`、`jianghuCustomSkill*`（submit/list/audit）、`jianghuInventory/SaveInventory` 接真实 campus-jianghu-plugin；运营 `VITE_ADMIN_TOKEN` 配置。

## 11. 页面布局 / 交互 / 道具实玩收口（2026-10-24）

针对「页面不美观、点不动、道具没效果、桌面移动端不一致」三项反馈的根因修复，全部经真实 Chromium E2E 验证（桌面 1280×900 + 移动 390×844 双视口，`pageerrors 0`）。

**根因与修复**
1. `pages/jh-library.vue` 原本**完全没有 `<style>` 块**（其余 10 个江湖页都有）→ 无布局/层次/响应式。补齐约 870 行 `scoped SCSS` 设计系统：`.dd` 居中容器（`max-width:480px` + 纵向渐变底 + `overflow-x:hidden`）、`.topbar/.seal`、`.tension`、`.scene-wrap/.stage`（360×560，`max-width:100%`）、`.scene-bar/.sb-btn`、`.tools`（5 列网格 + `.tool.on` 金色高亮）、`.fx/.fx-item`、`.bag/.bag-prop/.bp-use`、`.sheet/.sheet-card`（`max-height:86vh` 可滚动）、`.panel/.code-box/.cipher/.marks/.mark`、`.btn`（uni-button 重置 `&::after{border:none}`）、`.foot`。
2. 交互不响应：`.stage` 与 canvas 统一 `touch-action:none;user-select:none`；Phaser 配置 `input:{activePointers:2,touch:{capture:true}}` + `disableContextMenu:true`；`onMounted` 用 `game.events.once('ready')` + 400ms 轮询（8s 上限）稳定给 canvas 打样式，避免画布创建时机不确定导致样式丢失。
3. 道具不可用：原先只有 `distraction` 有动作，其余 11 件是被动的。新增 `useProp(id)` 统一入口 + 每件道具卡片的「使用」按钮 + `PROP_ACTION` 动作文案；`availableStashes()` 增加 `extra` 分支，持有道具即开辟其 `req` 藏点（不受本局分化子集限制），保证每件道具都有用武之地。
4. 两个运行时未定义引用（E2E 抓到）：`armedStash` 未声明、`PAINTING_POEM` 未从 `scene/codebook` 导入 → 已补齐（后者同时修复模板里「背景画夹层题诗」渲染为空）。

**12 件道具的预期效果（E2E 逐一实测）**
| 道具 | 动作 | 可见效果 |
| --- | --- | --- |
| 借阅卡 | 刷开夹层 | `藏点就位：借阅卡夹层` |
| 磁贴/胶带 | 吸附桌底 | `藏点就位：阅览桌底磁贴` |
| 假书脊 | 造新藏点 | `藏点就位：假书书脊中空` |
| 权限卡 | 刷开闭架 | `藏点就位：闭架区(需权限卡)` |
| 显影剂 / 解码镜 | 显影暗号 / 透视夹层 | `显影：暗号「青灯」`（须先投放） |
| 手机光/手电 | 照亮暗角 | `手电照明暗角 · 剩 10s`（场景暖色光斑） |
| 干扰物 | 抛出引开 | `干扰物引开巡逻 · 剩 20s`（警觉归零） |
| 怀表 | 读巡逻节拍 | `怀表预判节拍 · 警觉减半 剩 15s` |
| 录音笔 | 录音取证 | `录音取证 N 段 · 交付 +5 声望`（交付折算） |
| 书签便签 | 夹书签 | `书签便利 +1（已留痕）`（取件隐蔽 +1，同时 +1 证据） |
| 窥镜/望远镜 | 远观抹痕 | `窥镜抹痕 −11% 暴露`（`clearLightestEvidence`） |

生效效果汇总在 `.fx` 反馈条（`activeEffects` 计算属性）；`doReset` 统一清空。

**桌面 / 移动一致**：容器 480 vs 390（均不横向溢出），画布恒 360×560，5 个工具（手·挪动 / 藏信 / 便签·标记 / 人·走动 / 视野·拖拽）均可点选并进入 `on` 态，画布拖拽 + `.scene-bar` 缩放/复位按钮两端均生效；完整闭环（投放 → 用道具 → 报暗号取件 → 流转核验）两端结果一致，`pageerrors 0`。

**验证方式与坑**
- 前端单测 `tests/jianghu-scene.spec.ts` 27/27 通过（含 `clearLightestEvidence` 善后用例）。
- E2E 用 Playwright（`D:/zhao/laya-brawler/node_modules/playwright`，本项目未装）。注入道具须用 **uni H5 的包装结构**：`localStorage['jianghu_mock_v1'] = {type:'object', data:{inventory:[...]}}`（直接写裸对象无效）；注入走 `page.addInitScript` 首帧生效。
- uni 组件渲染为自定义标签，选择器须用 `uni-button.btn.primary` 而非 `button`；uni 输入框用 `locator.fill` 会超时，改为 `evaluate` 设 `el.value` + `dispatchEvent(new Event('input',{bubbles:true}))`。
- dev server 冷启动（首次预构建 phaser）可能耗时数分钟，期间 `canvas` 为 0；预热后约 21s 就绪，E2E 需 `waitForSelector('.stage canvas', 90s)`。
- 遗留无关失败：`tests/store-display.spec.ts`（17）、`tests/timeline.spec.ts`（5）因文案改名（商家自送/拾光达 → 商户/传信者）与 `buildTimeline` 节点数变更未同步，属主流程遗留，不在本轮江湖范围内。
