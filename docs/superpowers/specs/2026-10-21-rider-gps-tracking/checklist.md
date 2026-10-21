# 骑手 GPS 跟踪 — 验收清单

规格：[spec.md](./spec.md) ｜ 任务：[tasks.md](./tasks.md)

## 接口
- [x] `campusOrderRider` 未登录 / 非本人订单返回 `ForbiddenError`（e2e `security.foreign.read` PASS）
- [x] assigned 订单 + 骑手上报 + 楼栋有坐标 → `location` / `destination` / `distanceMeters>0` / `etaMinutes>=1`（e2e：300m / 2 分钟 PASS）
- [x] 楼栋无坐标 → `destination=null`、`distanceMeters/etaMinutes=null`（单测 `rider-task-extra.spec.ts` 覆盖）
- [x] `deliveryStatus=delivered` → `location=null`，目标楼栋保留（e2e `deliver` PASS）
- [x] `campusUpdateBuilding` 更新坐标后 `campusBuildings` 可读回（e2e `building.coords` PASS）
- [x] 生产库 `campus_building.lat/lng` 列存在（启动迁移 + 手工 ALTER 已验证）

## 前端
- [x] `pnpm build:h5` 通过（产物 2480 KB）
- [x] 手机视口 390×844 dpr=2 截图 4 张：配送中 / 等待定位 / 已送达 / 未配置 Key（`docs/screenshots/rider-tracking/`）
- [x] 骑手与楼栋标记同屏、轨迹虚线、底部抽屉 ETA/距离/时间线正常
- [x] 10s 轮询可用；切后台停止（22s 内 0 请求）；回前台恢复（12s 内 2 请求）
- [x] 催单提示与频控生效（第二次催单返回「已收到催单，请耐心等待」）
- [x] 未配置 Key 时仅提示、不白屏，抽屉数据照常
- [x] zh-Hans / en 文案齐全，无 `riderTracking.*` 原样输出

## 文档与发布
- [x] 操作手册补充 Key 配置、域名白名单、楼栋坐标 mutation、四张截图（`docs/waimai-操作手册-骑手跟踪.md`）
- [x] vendure 提交（含 `lib/` 产物）+ 服务器 `git pull` + `pm2 restart`
- [x] waimai 提交 / 推送 / 部署（`node .secrets/deploy-waimai.mjs`，线上 `/waimai/` 200）
