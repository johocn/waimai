# 骑手 GPS 轨迹 + 地图跟踪 — 任务清单

规格：[spec.md](./spec.md)

## T1 后端：楼栋坐标模型与接口
- [x] `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-building.entity.ts`
  - 新增 `@Column({ type: 'double precision', nullable: true }) lat: number;`
  - 新增 `@Column({ type: 'double precision', nullable: true }) lng: number;`
- [x] `src/migrations/create-campus-tables.ts`
  - 追加两条幂等 ALTER：`campus_building.lat`、`campus_building.lng`（`double precision`）。
- [x] `src/campus-config.service.ts`
  - `createBuilding(ctx, name, zoneId, detail?, lat?, lng?)` 写入坐标。
  - 新增 `updateBuilding(ctx, id, patch: { name?, detail?, lat?, lng? })`：不存在抛 `UserInputError('宿舍楼不存在')`。
- [x] `src/campus-config-admin.resolver.ts`
  - `campusCreateBuilding` 增加 `lat`、`lng` 可空参数。
  - 新增 `campusUpdateBuilding(id, input)`，`@Allow(CampusPermissions.CampusConfig)`。
- [x] `src/campus-delivery.plugin.ts`
  - admin `type CampusBuilding` 补 `lat: Float`、`lng: Float`。
  - admin 新增 `input CampusBuildingPatchInput { name detail lat lng }` 与 `campusUpdateBuilding(id: ID!, input: CampusBuildingPatchInput!): CampusBuilding!`。
- 验收：本地启动后 `campusCreateBuilding`/`campusUpdateBuilding` 可写读坐标；老楼栋 `lat/lng` 为 null 不报错。

## T2 后端：campusOrderRider 扩展（位置 + 目标 + 距离 + ETA）
- [x] `src/rider-task.service.ts` → `orderRider(ctx, orderId)`
  - 订单归属校验：`order.customer?.user?.id !== ctx.activeUserId` → `ForbiddenError`（`findOne` 带 `relations: ['customer', 'customer.user']`）。
  - 读取 `customFields.buildingId`，查 `CampusBuilding`；有 `lat/lng` 才返回 `destination: { name, detail, lat, lng }`。
  - 新增私有 haversine，`distanceMeters = Math.round(...)`。
  - `etaMinutes`：`distance < 30` → 0；否则 `Math.max(1, Math.ceil(distance / 4.2 / 60))`；缺坐标 → null。
  - `location` 保持仅 assigned/in_progress 返回；新增 `deliveryStatus`。
- [x] `src/campus-delivery.plugin.ts`（shopApiExtensions）
  - 新增 `type CampusRiderDestination { name: String! detail: String lat: Float! lng: Float! }`。
  - `type CampusOrderRider` 补 `destination`、`distanceMeters: Int`、`etaMinutes: Int`、`deliveryStatus: String`。
- [x] 编译并提交插件产物：`pnpm --filter @vendure/campus-delivery-plugin build`（若仓库跟踪 `lib/`，随提交入库）。
- 验收：见 spec §7 接口四项；非本人订单返回 Forbidden。

## T3 前端：地图 Key 注入
- [x] `d:\zhao\waimai\.env.development`、`.env.production` 增加 `VITE_QQMAP_KEY=`（空值占位）。
- [x] `src\main.ts`：`createApp()` 内 `#ifdef H5` 注入 `window.__uniConfig.qqMapKey` 与 `sdkConfigs.maps.qqmap.key`（值取 `import.meta.env.VITE_QQMAP_KEY`，空则不注入）。
- 验收：填入 key 后本地 `/waimai/` 打开任意 `<map>` 底图加载；置空时无脚本报错。

## T4 前端：全屏跟踪页
- [x] `src/pages.json` pkg-order 增加 `pages/rider-tracking`（`navigationStyle: custom`，标题 `%nav.riderTracking%`）。
- [x] 新建 `src/pkg-order/pages/rider-tracking.vue`：
  - 全屏 `<map>` + 骑手/楼栋 markers + 会话轨迹 polyline + 剩余虚线。
  - `includePoints` 自动缩放（跟随开关控制）。
  - 底部抽屉：骑手行、ETA、距离、更新时间、时间线、催单、联系门店。
  - 轮询 10s；`onShow/onHide/onUnload`；终态停止；失败保留旧数据并提示。
  - 降级矩阵（spec §5）逐项实现：无 key 提示、无楼栋坐标、无骑手、无位置、已送达。
- [x] `src/api/mutations/campus.ts`：`CAMPUS_ORDER_RIDER` 增加 `destination { name detail lat lng } distanceMeters etaMinutes deliveryStatus`。
- 验收：本地 dev (`localhost:5181/waimai/#/pkg-order/pages/rider-tracking?code=...`) 渲染正常；抽屉可收起展开。

## T5 前端：入口与 i18n
- [x] `src/pkg-order/pages/order-detail.vue` 骑手卡增加「实时跟踪 ›」入口（有骑手且配送中时显示），跳转跟踪页；保留原内嵌小地图。
- [x] `src/locale/zh-Hans.json`、`src/locale/en.json` 同步新增 `nav.riderTracking` 与 `riderTracking.*`（清单见 spec §4.4，双语齐全，禁止写死中文）。
- 验收：切换语言后页面全部文案即时变化，无 `riderTracking.xxx` 原样输出。

## T6 验证
- [x] `cd d:\zhao\waimai; pnpm build:h5` 通过。
- [x] 后端接口回归脚本（沿用 `.secrets/*.cjs` 模式）：构造/选取一个 assigned 订单，骑手上报位置，断言 `campusOrderRider` 的 destination/distance/eta；delivered 后 `location=null`。
- [x] Playwright 手机视口 390×844 dpr=2 截图 4 张：配送中、等待定位/无骑手、已送达、未配置 key 提示；存入 `docs/` 对应手册目录。
- [x] 轮询启停验证：切后台后 Network 无 `campusOrderRider` 请求，回前台恢复。
- 验收：以上全部通过，截图路径写入手册。

## T7 文档与收尾
- [x] 更新操作手册：Key 配置、腾讯控制台域名白名单、楼栋坐标维护 mutation 示例、四张截图。
- [x] 生产 DB：确认 `campus_building.lat/lng` 列存在（启动迁移或手工 ALTER）。
- [x] 提交 → 推送 → 部署（vendure `git pull` + `pm2 restart`；waimai `node .secrets/deploy-waimai.mjs`）。
- 验收：线上跟踪页可打开，底图加载（key 已配前提下），订单接口返回 ETA。

## 风险与备注
- 腾讯 Key 属于前端可见凭据，必须配置域名白名单；未拿到 key 时功能按降级矩阵可用，但无底图。
- `includePoints` 在 H5 的兼容性以实测为准，失败不影响 marker/polyline 与抽屉数据。
- 楼栋坐标需业务方按 GCJ-02 标定；坐标错误会导致路线/ETA 偏差，属于数据问题而非代码问题。
