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

**当前状态 = 一期全量交付**：学生端四页 + 骑手端四页 + 全链路冒烟 S1-S8 PASS + 8 页手机截图目检合格 + 操作手册（`vshop/docs/waimai-操作手册.md`）+ verify 排障沉淀（`vshop/docs/verify/2026-10-waimai-e2e.md`）。

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

- 骑手收入页提现功能二期开放（分成随送达实时入账 status=credited）
- 微信 JSAPI 支付待商户参数配置；当前冒烟走 COD 授权链路
- 大厅单滞留 >5 分钟自动加急置顶；强派调度（DispatchJobService T2/T3）已具备，默认关闭
- 0 分成单（shipping=0 且 tip=0）送达写库成功但 addBalance 抛错（真实跑腿单不触发）
- nginx `www.yourbao.cn.conf` 改前备份 `.bak_waimai_20261006`（root 补齐前主站一直显示 openresty 欢迎页的历史问题已修复）
