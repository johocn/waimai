# 第 28 轮 · 外卖常用功能完善 Spec

范围：多人拼单点餐、帮我选（随机点餐）、打烊店铺开门提醒、单品备注。
后端约束：线上 shop-api 实测 `OrderLineCustomFields` 无 note 字段，**本轮不新增后端字段**；单品备注存本机，结算时合并进已有整单备注 `order.customFields.note`。

---

## 1. 多人拼单点餐（纯前端，链接携带清单）

### 文件
- 新增 `src/utils/group-order.ts`
- 新增 `src/pkg-order/pages/group-order.vue`
- 改 `src/pkg-order/pages/cart.vue`（店铺卡头「拼单」入口）
- 改 `src/pages/home/index.vue`（快捷入口「拼单」→ 拼单页）
- 改 `src/pages.json`（pkg-order 下登记 `pages/group-order`）

### 数据模型（本机）
```ts
interface GroupItem { variantId: string; name: string; image?: string; price: number; qty: number; from: string }
interface GroupSession {
  id: string;            // 随机 10 位
  host: string;          // 发起人昵称（本机 profile 或「我」）
  token: string;         // 店铺 channelToken
  channelId?: string;
  shop: string;
  routes: string;
  items: GroupItem[];    // 我方已合并清单
  participants: string[];
  createdAt: number;
  closed?: boolean;
}
```
- 存储：`group_order_sessions`（数组，最多保留 5 条，新的在前）、`group_order_active`（当前进行中 id）。
- 纯函数：`encodeGroupInvite(session)` / `decodeGroupInvite(str)`、`encodeGroupPick(payload)` / `decodeGroupPick(str)`；base64url（先 `encodeURIComponent` + `btoa`，H5 可用 `window.btoa`，失败返回 ''）。

### 路由形态
- 邀请：`/pkg-order/pages/group-order?g=<base64>`（payload：id/host/token/cid/shop/routes/ts）
- 好友回传：`/pkg-order/pages/group-order?pick=<base64>`（payload：gid/from/token/shop/items[{v,n,q,p}]）
- 无参数：我的拼单列表页

### 页面行为
1. **无参数（列表）**：展示本机拼单会话（进行中置顶），每张卡：店铺名、发起人、已合并 N 件 / ¥合计、「复制邀请链接」「查看清单」「结束拼单」。空态提示「从购物车店铺卡点『拼单』发起」。
2. **`?g=` 受邀方**：
   - 展示发起人 + 店铺 + 已有清单；
   - 「去这家店点餐」→ `/pages/shop/menu?token&name&routes&cid`；
   - 「用我在本店的购物车提交」：调用 `getActiveOrderForChannel(token)` 取本店 activeOrder（不切换 tenant），把 lines 转成 items，生成 `pick` 链接并复制/分享，提示「把链接发回给发起人」；
   - 本店无购物车内容时提示先点餐。
3. **`?pick=` 发起方**：解析好友清单 → 逐项勾选（默认全选）→「一键合并加购」：
   - `await tenant.switchTenant(token)`；逐项 `addItemToOrderInChannel(token, variantId, qty)`（失败项收集跳过）；
   - 合并进本机 session.items（同 variantId 累加 qty，`from` 记好友名），刷新 `group_order_active`；
   - 成功后 toast + `uni.navigateTo('/pkg-order/pages/cart')`。
4. **分享**：优先 `sharePage({ title, desc, path })`（微信卡片），否则复制链接；两者都给出 toast。

### 购物车入口
`cart.vue` 店铺卡头右侧（`cart-card__head-right`）加「拼单」文字 chip，点击：
- 读 `group_order_sessions` 中同 token 的进行中会话，有则追加/更新本店清单（用当前 order.lines 写入 items，`from=我`）；
- 无则新建 session（`host` 取 `uni.getStorageSync('user_nickname')` || 「我」）；
- `uni.navigateTo('/pkg-order/pages/group-order?g=' + encode(...))` 进入邀请视图，页面自动复制邀请链接。

---

## 2. 帮我选（随机点餐）

### 文件
- 新增 `src/utils/random-pick.ts`（纯函数）
- 新增 `src/pkg-order/pages/random-pick.vue`
- 改 `src/pages/home/index.vue`（快捷入口「帮我选」）
- 改 `src/pages.json`

### 纯函数
```ts
export interface PickOption { budgetFen: number | null; category: string }
export function eligibleStores(stores: any[], budgetFen: number | null): any[]  // 过滤 paused/closed/minOrder>budget
export function pickStore(stores: any[], rnd: () => number): any | null
export function pickCombo(products: any[], budgetFen: number | null, rnd: () => number, maxItems = 3): { p: any; v: any }[]
```
- 可售判定与购物车一致：`enabled !== false && stockLevel !== 'OUT_OF_STOCK' && priceWithTax > 0`。
- `pickCombo`：先随机挑 1 件「主力」（价格 ≤ 剩余预算），再以剩余预算随机补 1–2 件低价菜，总价不超预算；预算为空则随机 1–3 件。

### 页面
- 顶部预算 chips：20 / 30 / 50 / 不限（分）；分类 chips：全部 + 本店商品一级分类（取已选店铺 products 的 collections，兜底「全部」）；
- 摇一摇区：店铺卡（logo/名/起送/配送费/营业状态）+ 菜品清单（图/名/规格/价）+ 合计；
- 按钮：「再摇一次」「进店点餐」（`enterStore`）「一键加购」（switchTenant → 逐项 `addItemToOrderInChannel` → 跳 menu）；
- 空态：无符合店铺（预算过低/全部打烊）提示放宽条件。

---

## 3. 打烊店铺「开门提醒我」

### 文件
- 新增 `src/utils/open-watch.ts`
- 改 `src/pages/home/index.vue`（打烊店铺卡 chip + 顶部横幅）
- 改 `src/pkg-user/pages/favorites.vue`（同横幅 + 店铺卡 chip，若结构简单）
- 复用 `src/utils/store-status.ts`

### 数据模型
```ts
interface WatchEntry { token: string; channelId?: string; name: string; businessHours?: string; addedAt: number; notifiedAt?: number }
```
- key `store_open_watch`，最多 30 条。
- API：`readWatched()`、`isWatched(token)`、`watchStore(entry)`、`unwatchStore(token)`、`openedWatched(stores)`（把关注项与最新店铺列表按 token 合并后 `getStoreStatus(businessHours).state !== 'closed'` 的返回，带最新 logoid/name）。

### UI
- 首页店铺卡：`storeStatusOf(s) === 'closed'` 时在 name-row 后追加「🔔 开门提醒」（`Watched` 已关注显示「🔕 已提醒」），`@tap.stop` 切换。
- 首页顶部（店铺列表之前）横幅：`openedWatched(stores)` 非空时显示「🟢 「店铺名」已开门」+「去点餐」+「知道了」（知道了则 `unwatchStore`，一次性）。
- 收藏页同样横幅（只做横幅，不改卡片布局，降低风险）。

---

## 4. 单品备注（本机 + 合并进整单备注）

### 文件
- 新增 `src/utils/line-notes.ts`
- 改 `src/pkg-order/pages/cart.vue`（每行备注入口 + 弹层 + 清理）
- 改 `src/pkg-order/pages/checkout.vue`（展示 + `composeOrderNote` 合并）

### 数据模型
- key `cart_line_notes`：`Record<token, Record<variantId, string>>`，单条 ≤ 20 字。
- API：`readLineNotes(token)`、`setLineNote(token, variantId, text)`、`clearLineNote(token, variantId)`、`pruneLineNotes(token, variantIds)`、`lineNoteSummary(token, lines)`（返回 `餐名:备注` 数组）。

### 购物车
- 每行 `cart-line__foot` 上方/价格行右侧加备注入口：无备注显示「＋备注」，有备注显示「备注：xxx」（单行省略）；
- 点击打开底部弹层（textarea 20 字 + 保存/清除/取消），保存后即时更新本机并回写列表；
- `applyOrder` 后用 `pruneLineNotes` 清掉已不在购物车的 variant 备注；`clearGroup` 清空该店备注。

### 结算
- 备注卡内加「单品备注」只读摘要块（显示各条 `餐名:备注` + 数量），点击可清空；
- `composeOrderNote()` 改为：`[配送偏好, 自定义配送说明, 用户备注, ...单品备注段].filter(Boolean).join('；').slice(0,200)`；单品备注段格式 `餐品：宫保鸡丁少辣`，总长超 200 优先截断单品段（保留用户备注）。
- 下单成功后（`recordRecentItems` 之后）清空当前店铺 `cart_line_notes`。

---

## 5. i18n / 路由 / 入口

- `src/locale/zh-Hans.json` + `src/locale/en.json` 新增命名空间：`groupOrder.*`、`randomPick.*`、`openWatch.*`、`cart.lineNote*`、`checkout.lineNotes*`、`home.quickGroup`、`home.quickRandom`。
- `src/locale/uni-app.json` / `uni-app.zh-Hans.json` / `uni-app.en.json` 的 `nav` 增加 `groupOrder`、`randomPick`。
- `src/pages.json`：pkg-order 增加
  `{ "path": "pages/group-order", "style": { "navigationBarTitleText": "%nav.groupOrder%" } }`、
  `{ "path": "pages/random-pick", "style": { "navigationBarTitleText": "%nav.randomPick%" } }`。
- 首页快捷区新增两个 `qk`：🧩 拼单、🎲 帮我选（保持现有 4 列栅格）。

---

## 6. 验收

1. `pnpm build:h5` 通过（无 TS/模板编译错误）。
2. 部署 `node .secrets/deploy-waimai.mjs`。
3. Playwright 390×844 dpr=2 手机截图，存 `docs/screenshots/common-features-v28/`，覆盖：
   - 拼单列表 / 受邀视图 / 回传链接解析合并；
   - 帮我选初始 + 再摇一次；
   - 首页打烊店铺「开门提醒」chip + 横幅（用本地构造 businessHours 的会话数据验证）；
   - 购物车单品备注弹层 + 结算页备注摘要。
4. 断言：生成/解析 base64 链接 round-trip 一致；`pickCombo` 总价 ≤ 预算；`openedWatched` 判定正确；`lineNoteSummary` 输出格式正确。
5. 手册 `docs/waimai-操作手册-常用功能.md` 追加 §135（四项功能操作说明 + 截图引用）。
6. 提交仅本轮文件（不碰 `src/pkg-jianghu/**`、`src/pkg-user/pages/address-book.vue`、`devlog.err/txt`），推送并线上回归。

## 7. 已知取舍
- 单品备注不改后端 `OrderLineCustomFields`（线上实测无该字段，新增需 prod migration）。故备注在结算时合并进整单备注，商家工作台/小票可见，但无法按行打标。
- 拼单纯链接流转，无服务端房间状态：清单位于链接与本机，链接可转发给多人分别回传。
