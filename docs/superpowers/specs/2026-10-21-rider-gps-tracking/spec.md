# 骑手 GPS 轨迹 + 地图跟踪（顾客端）— 规格

日期：2026-10-21
决策来源：用户选定「B 全屏跟踪页 / 腾讯地图 Key / 仅实时最新点 / 仅顾客端」

## 1. 目标与非目标

### 目标
- 校园履约单配送中，顾客可进入全屏地图页看到骑手实时位置、配送路线、目标楼栋、剩余距离与预计送达时间。
- 位置每 10s 刷新；页面退出/切后台自动停轮询；订单终态自动停止。
- 不新增轨迹表，只展示「本次会话内」累积的点连成的轨迹线 + 骑手到楼栋的剩余直线。
- 地图 Key 走构建期环境变量注入，不在代码中硬编码。

### 非目标
- 不做轨迹入库、回放、历史取证（后续需要时另立规格）。
- 不做骑手端跨页持续上报改造、商家看板地图。
- 不接入路径规划/路网算路（腾讯路线 API），ETA 为直线距离估算。
- 不新增后台楼栋坐标管理页面（通过 GraphQL mutation / SQL 维护）。

## 2. 现状与约束（已核实）

| 事实 | 位置 |
|---|---|
| Order 已有 `riderLat` / `riderLng`（gcj02，仅最新点）、`deliveryStaffId`、`deliveryStatus`、`buildingId`、`campusZone` | [custom-fields.ts](file:///d:/zhao/vendure/packages/campus-delivery-plugin/src/custom-fields.ts) |
| 骑手端每 ~10s 上报 `campusRiderReportLocation`，仅 assigned/in_progress 可写 | [rider-task.service.ts](file:///d:/zhao/vendure/packages/campus-delivery-plugin/src/rider-task.service.ts#L49-L60) |
| `campusOrderRider` 已返回 `realName / credit / location`，但无归属校验、无目标楼栋、无距离/ETA | [rider-task.service.ts](file:///d:/zhao/vendure/packages/campus-delivery-plugin/src/rider-task.service.ts#L29-L47) |
| `CampusBuilding` 只有 name/detail/zoneId/channelId，**无坐标** | [campus-building.entity.ts](file:///d:/zhao/vendure/packages/campus-delivery-plugin/src/campus-building.entity.ts) |
| 生产可能 `synchronize:false`，新列需幂等启动迁移 | [create-campus-tables.ts](file:///d:/zhao/vendure/packages/campus-delivery-plugin/src/migrations/create-campus-tables.ts) |
| 前端订单页已有骑手卡 + 内嵌 `<map>`（scale 16），10s 轮询 `fetchOrderRider` | [order-detail.vue](file:///d:/zhao/waimai/src/pkg-order/pages/order-detail.vue#L74-L98) |
| `manifest.json` 未配置任何地图 key；uni-app H5 从全局 `__uniConfig.qqMapKey` 读取（运行时读取） | `node_modules/@dcloudio/uni-h5/dist-x/uni-h5.es.js` `getMapInfo()` |
| waimai 无 web-admin 楼栋配置页（仓库内无 `campusBuildings` 引用） | d:\zhao\web-admin |

**关键结论**：H5 的 `<map>` 底图依赖腾讯地图 key；key 在组件挂载时才读取，因此可在 `main.ts` 启动阶段用 `VITE_QQMAP_KEY` 注入 `window.__uniConfig.qqMapKey`，无需写死、也无需修改 manifest。

## 3. 数据模型与接口

### 3.1 CampusBuilding 增加坐标
- `lat: number | null`、`lng: number | null`（gcj02，与骑手上报坐标系一致）。
- 类型：`double precision`，可空（历史楼栋无坐标，页面降级）。
- 迁移：`ALTER TABLE campus_building ADD COLUMN IF NOT EXISTS lat double precision;`、`lng` 同理（幂等）。
- 不做 Order 新列：位置新鲜度由客户端收到时间计算（展示「刚刚 / N 秒前」），避免生产 ALTER 未知列名风险。

### 3.2 GraphQL（admin API）
```graphql
type CampusBuilding {
  id: ID!
  name: String!
  detail: String
  zoneId: ID!
  channelId: ID!
  lat: Float
  lng: Float
}
input CampusBuildingPatchInput {
  name: String
  detail: String
  lat: Float
  lng: Float
}
extend type Mutation {
  campusCreateBuilding(name: String!, zoneId: ID!, detail: String, lat: Float, lng: Float): CampusBuilding!
  campusUpdateBuilding(id: ID!, input: CampusBuildingPatchInput!): CampusBuilding!
}
```
- `campusUpdateBuilding` 仅更新传入字段，`lat/lng` 传入 `null` 表示清除。

### 3.3 GraphQL（shop API）campusOrderRider 扩展
```graphql
type CampusRiderDestination {
  name: String!
  detail: String
  lat: Float!
  lng: Float!
}
type CampusOrderRider {
  realName: String!
  credit: Int!
  location: CampusLatLng        # 仅 assigned/in_progress 返回，否则 null
  destination: CampusRiderDestination   # 楼栋无坐标时为 null
  distanceMeters: Int
  etaMinutes: Int
  deliveryStatus: String
}
```
计算规则（后端 `RiderTaskService.orderRider`）：
- 归属校验：订单 `customer.user.id !== ctx.activeUserId` → `ForbiddenError`（修复现存越权读取位置问题）。
- `destination`：按 `customFields.buildingId` 查 `CampusBuilding`；`lat/lng` 均有值才返回。
- `distanceMeters`：骑手坐标与楼栋坐标的 haversine 直线距离，四舍五入取整；任一缺失为 null。
- `etaMinutes`：`ceil(distance / 4.2 m/s / 60)`，最小 1；距离 < 30m 返回 0（UI 显示「即将送达」）；缺失为 null。
- 隐私不变：`delivered` / `exception` / 非配送中不返回 `location`，但 `destination` 仍返回（属于用户自己的地址）。

## 4. 前端实现

### 4.1 地图 Key 注入（构建期可配置）
- `.env.development` / `.env.production` 新增 `VITE_QQMAP_KEY=`（默认空）。
- `src/main.ts` 在 `createApp()` 内、返回 app 前：
  ```ts
  // #ifdef H5
  const qqKey = (import.meta as any).env?.VITE_QQMAP_KEY;
  if (qqKey) {
      const cfg = (window as any).__uniConfig ?? ((window as any).__uniConfig = {});
      cfg.qqMapKey = qqKey;
      cfg.sdkConfigs = { ...(cfg.sdkConfigs || {}), maps: { ...((cfg.sdkConfigs || {}).maps || {}), qqmap: { key: qqKey } } };
  }
  // #endif
  ```
- 未配置 key：页面仍可用（底部抽屉正常），地图区顶部显示提示「地图未配置 Key，仅显示距离与预计时间」，不静默白屏。

### 4.2 新页面 `src/pkg-order/pages/rider-tracking.vue`
注册于 `pages.json` pkg-order：`{ "path": "pages/rider-tracking", "style": { "navigationBarTitleText": "%nav.riderTracking%", "navigationStyle": "custom" } }`。

布局（版式 B）：
- 全屏 `<map>`（`enable-scroll` 允许拖动，`show-location=false`）。
- 顶部悬浮：返回、订单号 `#code`、跟随开关（「跟随中 / 自由查看」）。
- 底部抽屉（默认展开 62% 高，`safe-area-inset-bottom`）：
  - 骑手行：头像、`realName`、`信用分`、联系门店按钮（复用订单页 `callStore` 逻辑）。
  - ETA 主值（`约 N 分钟` / `即将送达` / `等待骑手定位`）+ `距你 Xm` + 更新徽标（`刚刚 / N 秒前`）。
  - 时间线：已接单 → 已取餐 → 配送中 → 已送达（按 `deliveryStatus` 高亮；复用现有 `timeline` 规则）。
  - 催单按钮：复用 `urgeOrder`，成功后展示「已提醒」；服务端 10min 频控。
  - 抽屉收起仅保留一行摘要（ETA + 骑手名），点击展开。

地图要素：
- `markers`：骑手 `id=1`（label「骑手」，默认图标）、楼栋 `id=2`（label `campusZone`/`buildingName`）。
- `polyline`：
  - `id=1` 会话轨迹：轮询点位累积，相邻点距离 > 8m 才入栈，上限 60 点；`color: '#FF6600'`、`width: 6`、`arrowLine: false`、圆角。
  - `id=2` 剩余段：骑手当前位置 → 楼栋，`dashedLine: true`、`width: 4`、`color: '#FF6600'`。无楼栋坐标时省略。
- 自动缩放：`uni.createMapContext(mapId).includePoints({ points, padding: [60,60,60,60] })`；跟随开启时在「首次拿到数据、骑手移动 > 50m、手动点跟随」三个时机调用；失败静默（不阻断）。
- 中心点：`rider.location ?? destination ?? 订单 campusZone 默认`；无任何坐标时展示空态卡。

数据与轮询：
- 进入页面：`getOrderByCode(code)` 取 `id / customFields`；随后 `fetchOrderRider(orderId)` 每 10s。
- 终止条件：`deliveryStatus ∈ {delivered, exception}`、订单 `state` 为 `Cancelled`、`hallStatus` 终态 → 停轮询并展示终态文案。
- `onShow` 启动 / `onHide` 停止 / `onUnmount` 清理；避免切后台耗电。
- 网络失败：保留上一次数据，标「更新失败，重试中」，不弹 toast。
- 无骑手：`rider=null` 且配送未开始 → 展示「正在为你匹配骑手」。

### 4.3 入口
`order-detail.vue` 骑手卡新增一行入口按钮「实时跟踪 ›」，仅在有骑手且 `assigned/in_progress` 时显示，跳转：
`/pkg-order/pages/rider-tracking?code=${order.code}`。
现有内嵌小地图保留（无坐标时自然不显示）。

### 4.4 i18n
`src/locale/zh-Hans.json` 与 `en.json` 同步新增：
- `nav.riderTracking`
- `riderTracking.title / back / follow / free / rider / credit / contactStore / etaMinutes / etaSoon / etaWaiting / distance / updatedJustNow / updatedSecondsAgo / timelineAssigned / timelinePicked / timelineDelivering / timelineDelivered / urge / urged / urgeFail / matching / noLocation / terminalDelivered / terminalException / terminalCancelled / keyMissing / refreshFailed`
- 文案占位符统一 `{n}` / `{t}`，与现有 key 风格一致。

## 5. 降级矩阵

| 场景 | 行为 |
|---|---|
| 未配置 `VITE_QQMAP_KEY` | 地图可能空白；顶部提示 key 缺失；抽屉 ETA/距离/时间线照常 |
| 楼栋无坐标 | 不显示楼栋 marker 与剩余线，ETA/距离显示「—」，地图仅跟随骑手 |
| 骑手尚未上报位置 | 中心定位到楼栋；提示「等待骑手定位」 |
| 订单已送达 | 停轮询，抽屉展示「已送达」；不再展示骑手位置 |
| 无骑手 / 调度中 | 展示「正在匹配骑手」；不渲染骑手 marker |
| 接口报错 | 保留旧数据 + 「更新失败，重试中」 |

## 6. 运维与发布

1. `.env.production` 填 `VITE_QQMAP_KEY=<腾讯位置服务 WebService/JSAPI Key>`，并在腾讯位置服务控制台把生产域名加入白名单。
2. 服务器 PostgreSQL 执行（或依赖启动迁移）：
   ```sql
   ALTER TABLE campus_building ADD COLUMN IF NOT EXISTS lat double precision;
   ALTER TABLE campus_building ADD COLUMN IF NOT EXISTS lng double precision;
   ```
3. 用 `campusUpdateBuilding` 批量写入楼栋坐标（GCJ-02）。
4. vendure：本地 build → 提交（含 `lib/` 编译产物）→ 服务器 `git pull` + `pm2 restart`。
5. waimai：本地 `pnpm build:h5` → `node .secrets/deploy-waimai.mjs`。

## 7. 验收标准

### 接口
- `campusOrderRider` 对未登录/非本人订单返回 `ForbiddenError`。
- assigned 订单 + 骑手上报 `(lat,lng)` + 楼栋有坐标 → 返回 `location`、`destination`、`distanceMeters>0`、`etaMinutes>=1`。
- 楼栋无坐标 → `destination=null`，`distanceMeters/etaMinutes=null`。
- delivered → `location=null`。
- `campusUpdateBuilding` 更新坐标后 `campusBuildings` 可读回。

### 前端
- `pnpm build:h5` 通过。
- 手机视口（390×844，dpr=2，Playwright）截图 4 张：配送中跟踪页、无骑手/等待定位、已送达终态、未配置 key 提示。
- 10s 轮询可用；切后台停止（Network 无请求）；返回页面恢复。
- 催单提示与频控生效。

### 文档
- 操作手册补充：Key 配置、域名白名单、楼栋坐标维护 mutation、四张截图。
