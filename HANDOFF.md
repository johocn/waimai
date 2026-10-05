# waimai 校园外卖 — 开发交接文档

> 交接时间：2026-10-05 · 交接人：AI 开发会话（johocn 授权） · 接手人：新开发者

## 1. 项目一句话

独立 uniapp（H5 先行）外卖 C 端模板，部署于 `www.yourbao.cn/waimai/`，对接 vendure 校园外卖模块（campus-delivery-plugin）。channel = 餐饮店铺，含学生端四页 + pkg-rider 骑手端四页。

## 2. 当前进度总览

| 阶段 | 状态 | 位置 |
|---|---|---|
| 设计 spec（含 §12 增补定案） | ✅ 定稿 | `docs/2026-10-05-waimai-template-design.md` |
| Plan 1 后端缺口（5 项） | ✅ **已上线生产** | `docs/2026-10-05-waimai-plan1-backend.md` |
| Plan 2 学生端（9 Tasks） | 🔄 **Task 1 骨架完成**，Task 2-9 未做 | `docs/2026-10-05-waimai-plan2-student-frontend.md` |
| Plan 3 骑手端+部署（6 Tasks） | ❌ 未开始 | `docs/2026-10-05-waimai-plan3-rider-deploy.md` |

**下一步 = Plan 2 Task 2（交易底座复制）**，按计划文档逐 Task TDD 执行即可，文档自包含。

## 3. 本仓库现状

- `master` @ `c0845d4`：Task 1 项目骨架（package.json / vite.config / manifest / pages.json / env / uni.scss / App.vue / main.ts / tsconfig / .gitignore），`pnpm install` 已跑过（pnpm-lock.yaml 在库）
- App.vue 的品牌色注入比计划多了 `#ifdef H5` 条件编译（合理偏离，保留）
- 主题 token：`--brand: #ff6600` / `--brand-soft: #fff3e6`，已定案**沃堡橙**（三方案 mockup 对比后用户选定），`VITE_BRAND_COLOR` 可运行时覆盖

## 4. 必读知识（接手前 10 分钟）

1. **后端接口已全部就绪（生产 e.joho.cn/shop-api）**：`waimaiStoreList`（含 promoText）、`campusSetDeliveryTarget(zoneId, buildingId, route?, slotId?)`（R1/R3 + 时段写入+服务端校验）、`campusOrderRider`、`campusZones/campusBuildings/campusShopSlots`。插件源码在 `e:\zhao\vendure\packages\campus-delivery-plugin`（本地），gql 字段名以其 `lib/src/*.js` schema 定义为准
2. **渠道即店铺**：进店铺 = `switchTenant(channelToken)` 切 vendure 渠道，activeOrder 随 session+渠道隔离 = 每店独立购物车，无需自己做购物车隔离
3. **vshop 是底座复制源**：`e:\zhao\vshop\src\`（api/stores/components/login/webview/checkout/order-detail）；复制时删 i18n、以编译报错为清单迭代。注意 vshop 本地有 dev server 停止状态，只需要读源码
4. **测试规范**：vitest 只测纯逻辑（store-filter / timeline）；时间线映射的 hallStatus 枚举拼写先 Grep 插件 lib（`hall.service` 状态推进）校准
5. **验收截图规范**：Playwright 手机视口 **390×844, dpr=2**，逐张目检（子代理的 PASS 汇报不可信，历史多次实证）
6. **部署**（Plan 3 Task 6 才做）：本地 `pnpm build:h5` → tar → scp → 解压 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/yourbao/waimai/`；nginx `location /waimai/` try_files + index no-cache 需先加；**严禁在服务器构建**（内存不足）
7. **上线前人工项**：微信商户平台为 JSAPI 支付追加 `/waimai/` 授权目录（用户操作，不阻塞开发）

## 5. 常用命令

```bash
# 开发（vite 代理 e.joho.cn，无需本地后端）
pnpm dev:h5          # http://localhost:5181/waimai/

# 纯逻辑测试
npx vitest run

# 生产构建（产物 dist/build/h5/，路径带 /waimai/ 前缀）
pnpm build:h5

# 后端单测（改动插件时）
cd e:\zhao\vendure\packages\campus-delivery-plugin && npx vitest --config vitest.config.mts --run   # 当前基线 59 全绿
```

## 6. 环境凭据边界

- 生产 admin 凭据 superadmin/z123123；测试客户 etao（native 登录，凭据见 vshop `.secrets/verify-paymode.cjs`）——**凭据一律留在 `.secrets/`（已 gitignore），严禁入库**
- waimai 后端联调走同源反代：生产 `VITE_API_URL` 留空 = 同源 `/shop-api`；本地 dev 走 5181 代理

## 7. 相关仓库

| 仓库 | 位置 | 状态 |
|---|---|---|
| waimai（本仓库） | `e:\zhao\waimai` → `github.com/johocn/waimai` | master c0845d4 |
| vendure（后端） | `e:\zhao\vendure` → `github.com/johocn/vendure` | master 4925a1291 已推送，plan1 增补已部署 |
| vshop（底座源 + 文档原产地） | `e:\zhao\vshop` | master b166562（含计划/手册原版） |

## 8. 验收清单（Plan 3 收口时逐项打勾）

- [ ] vitest 全绿（store-filter + timeline）
- [ ] build:h5 成功，产物带 /waimai/ 前缀
- [ ] 全链路冒烟 8 步 PASS（waimai-e2e-smoke.cjs，Plan 3 Task 5 编写）
- [ ] 8 张手机截图逐张目检（学生端 4 + 骑手端 4）
- [ ] 操作手册 + 验收手册提交 vshop docs
- [ ] 生产部署 + curl 200 + JSAPI 授权目录确认
