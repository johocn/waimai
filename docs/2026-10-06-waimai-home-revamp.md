# 外卖首页改版（方案 B 轻量版）— 2026-10-06

参考美团式外卖首页长图做布局升级，用户从 A（完整版）/B（轻量版）mockup 中选定 **方案 B**。只调前端 `src/pages/home/index.vue`，未加后端字段。

## 改动点

| 区块 | 旧版 | 新版 |
|---|---|---|
| 头部 | 📍 定位 + 搜索 | 定位行右侧新增「我的订单」快捷链接（switchTab） |
| 快捷入口 | 无 | 一行三入口卡片：我的订单 / 骑手加入 / 校园公告 |
| 分类 | 文字胶囊横滑 | 带图标胶囊（🍽️全部 🍚米饭快餐 🧋奶茶甜品 🍜面食 🌙夜宵），仍按店铺 tags 过滤空类目 |
| 通知条 | 无 | 动态取第一家有 promoText 的营业店铺：「🔥 {店名} · {promoText}」，点击进店；无数据自动隐藏 |
| 店铺卡 | 月售 + 配送文字 + 优惠标签 | 新增区块标题（全部店铺/搜索词/当前分类 + 附近 N 家）、配送方式改灰色标签、优惠改橙色标签、右侧箭头 |
| 校园公告 | 无 | uni.showModal 静态文案（`NOTICE_TEXT` 常量，纯前端，无后端字段） |

## 交互与路由

- 我的订单：`uni.switchTab('/pages/orders/index')`
- 骑手加入：`uni.navigateTo('/pkg-rider/pages/rider-join')`（需登录，未登录由路由守卫带去 SSO 登录页，属预期）
- 通知条/店铺卡：进店逻辑不变（token/name/routes 传参）
- 分类胶囊、搜索、下拉刷新逻辑不变

## 回归与测试

- vitest 21/21 通过（store-filter / order-badge / timeline）
- 手机视口截图（390×844 dpr=2，Playwright `scripts/_shot_home.py`）：
  - `docs/screenshots/home-revamp/1-home-default.png` 首页默认态
  - `docs/screenshots/home-revamp/2-home-full.png` 首页整页
  - `docs/screenshots/home-revamp/3-home-notice-modal.png` 校园公告弹窗
  - `docs/screenshots/home-revamp/4-quick-rider-join.png` 骑手加入入口 → SSO 登录守卫

## 测试用例

| # | 用例 | 预期 | 结果 |
|---|---|---|---|
| 1 | 打开首页 | 头部+快捷入口+分类胶囊+店铺卡正常渲染 | ✅ |
| 2 | 点「校园公告」 | 弹出公告 Modal，点「知道了」关闭 | ✅ |
| 3 | 点「骑手加入」 | 跳 rider-join（未登录先进 SSO 登录） | ✅ |
| 4 | 点「我的订单」 | switchTab 到订单页 | ✅ |
| 5 | 通知条 | 有 promoText 店铺时显示并可点击进店；无则隐藏 | ✅ |
| 6 | 店铺无 tags | 只显示「全部」胶囊，不出现空类目 | ✅ |
| 7 | 搜索关键词 | 区块标题变「搜索"xxx"」，结果过滤 | ✅（filterStores 单测覆盖） |
| 8 | 店铺休息中 | 点击 toast「店铺休息中」 | ✅（逻辑未动） |

## 部署

本地构建 `pnpm build:h5` → `node .secrets/deploy-waimai.mjs`（scp 解压到 openresty 站点目录，静态替换即时生效）→ 线上 https://www.yourbao.cn/waimai/ 验证。
