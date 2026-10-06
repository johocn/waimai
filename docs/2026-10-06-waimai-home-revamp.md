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

## 双主题（明亮/黑暗，方案 A「橙头」）

同日追加：首页支持明亮/黑暗双主题。用户从两版 mockup 中选定**方案 A「橙头」**——暗色下头部保持品牌橙不换肤，页面背景、卡片、文字、标签、tabBar 跟随主题。范围首页先行，其余页面后续按同一 token 体系接入。（同日二次调整：**搜索框内颜色一同变暗**，`--w-search-bg` 暗色取 `#2a2a2f`，placeholder 跟随 `--w-text-muted`。）

### 实现机制

- `src/utils/theme.ts`（新增）：模块级单例 `theme = ref<'light'|'dark'>`，初始读 `uni.getStorageSync('waimai_theme')`；`toggleTheme()` 翻转 + 持久化 + H5 下 `document.documentElement.classList.toggle('dark-html')` + `uni.setTabBarStyle` 切 tabBar 样式；`initTheme()` 供页面 onMounted 调用（刷新/直达也能恢复暗色）。
- `src/pages/home/index.vue`：根节点 `:class="{ dark: theme === 'dark' }"`；头部定位行右侧新增圆形主题按钮（亮色显 🌙 / 暗色显 ☀️）；样式全部改为 `var(--w-*)`，`.page` 定义亮色 token、`.page.dark` 覆盖暗色 token。
- `src/App.vue`：全局样式追加 `html.dark-html` / `html.dark-html page` 暗色背景，防 overscroll 露白。
- `src/components/LoadingSkeleton.vue` / `EmptyState.vue`：写死颜色改 `var(--w-xxx, 原值)` fallback 形式，随页面主题自动跟随。

### 暗色 token 对照表

| token | 亮色 | 暗色 | 用途 |
|---|---|---|---|
| `--w-bg` | `#f5f5f5` | `#161618` | 页面背景 |
| `--w-surface` | `#ffffff` | `#242428` | 卡片/胶囊底 |
| `--w-surface-muted` | `#f0f0f0` | `#1e1e21` | 次级面 |
| `--w-text` | `#1a1a1a` | `#ececf0` | 主文字 |
| `--w-text-muted` | `#999999` | `#9a9aa3` | 次文字 |
| `--w-border` | `#ececec` | `#35353a` | 边框 |
| `--w-brand-soft` | `#fff3e6` | `rgba(255,102,0,.16)` | 品牌浅底 |
| `--w-brand-text` | `#ff6600` | `#ff8a3d` | 品牌浅底上的文字 |
| `--w-search-bg` | `#ffffff` | `#2a2a2f` | 搜索框底色 |
| `--w-skel-from/-to` | `#f0f0f0/#e0e0e0` | `#2a2a2f/#34343a` | 骨架屏渐变 |

tabBar：暗色 `bg #202024 / 文字 #9a9aa3 / 选中 #ff6600`；亮色保持 pages.json 原值。

### 截图（390×844 dpr=2，scripts/_shot_home.py 已扩展暗色步骤）

- `docs/screenshots/home-revamp/5-home-dark.png` 暗色首页默认态
- `docs/screenshots/home-revamp/6-home-dark-full.png` 暗色整页
- `docs/screenshots/home-revamp/7-dark-toggle-to-light.png` 暗色点 ☀️ 切回亮色
- `docs/screenshots/home-revamp/8-live-light.png` / `9-live-dark.png` 线上明暗两态核对（yourbao.cn/waimai）

### 测试用例（双主题追加）

| # | 用例 | 预期 | 结果 |
|---|---|---|---|
| 9 | 首页点 🌙 | 切暗色：背景/卡片/文字/tabBar 变暗，头部仍品牌橙，按钮变 ☀️ | ✅ |
| 10 | 暗色刷新页面 | localStorage 恢复暗色（initTheme 同步 html 类与 tabBar） | ✅ |
| 11 | 暗色点 ☀️ | 切回亮色，storage 变 light | ✅ |
| 12 | 骨架屏/空态在暗色下 | 颜色跟随 `--w-*`，无白块残留 | ✅ |

## 部署

本地构建 `pnpm build:h5` → `node .secrets/deploy-waimai.mjs`（scp 解压到 openresty 站点目录，静态替换即时生效）→ 线上 https://www.yourbao.cn/waimai/ 验证。
