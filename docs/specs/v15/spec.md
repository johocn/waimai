# 外卖常用功能第十五轮（v15）规格

用户已确认本轮 4 项（AskUserQuestion 全选）：①收藏商品一键加购 ②足迹管理增强 ③订单联系骑手 ④首页热销榜。

## ① 收藏商品一键加购

### d:\zhao\waimai\src\api\mutations\cart.ts
- 新增 `addItemToOrderInChannel(channelToken: string, productVariantId: string, quantity: number)`。
- 实现仿 `fetchProductListForChannel`（api/queries/waimai.ts L46-54）：独立 `new GraphQLClient(getShopApiUrl(), { headers })`，`headers['vendure-token']=channelToken`，bearer=`useAuthStore().token || getSessionToken()` 时加 `Authorization`。
- mutation 复用现有 AddToCart 文本 + 已 import 的 `CART_FRAGMENT`。

### d:\zhao\waimai\src\pkg-user\pages\favorites.vue
- items 卡 `fav-item__foot`（L54-60）加「加购」按钮 `fav-item__add`（`@click.stop`）。
- 新增 `async addCart(p)`：
  - token = `p.channelToken || stores.value.find(channelId 匹配)?.channelToken`，无则 toast `history.noStore`。
  - 调 `addItemToOrderInChannel(token, String(p.variantId), 1)`。
  - `res?.addItemToOrder?.id` 存在 → `useCartStore().setOrder(res.addItemToOrder)`（stores/cart.ts L68 setOrder 刷角标）+ toast `favorites.addCartOk`；否则 toast `favorites.addCartFail`（带 ErrorResult.message）。
- import 增：`addItemToOrderInChannel`（../../api/mutations/cart）、`useCartStore`（../../stores/cart）。
- 样式：`.fav-item__add` 实心品牌色胶囊按钮（对照 `__del` 的 22rpx 描边样式）。

## ② 足迹管理增强（单条删除 + 按店铺聚合）

### d:\zhao\waimai\src\utils\footprint.ts
- 新增 `removeFootprint(productId: string, variantId?: string): boolean`：readFootprint 后按 `productId+variantId` 过滤，长度有变化才 setStorageSync 并返回 true。

### d:\zhao\waimai\src\pkg-user\pages\history.vue
- `hist-top`（L14-17）加视图切换：`fpMode = ref<'time'|'store'>('time')`，tap 切换，文案 `history.groupByStore`（time 态）/ `history.byTime`（store 态）。
- 聚合 computed `fpDisplay`：
  - time 模式 → `[{ key:'__all__', name:'', items: footprint }]`（组头不渲染，行为与现状一致）。
  - store 模式 → 按 `channelToken || storeName || 其他` 分组，组名 `storeName || history.unknownStore`，组头显示条数 `history.itemCount`，组按组内最新 `at` 降序。
- 足迹行加单条删除 `hist-row__del`（「×」，`@tap.stop` → `removeOne(it)`）：`removeFootprint(it.productId, it.variantId)` → 重读 footprint → toast `history.removed`。
- 样式：`.hist-group__head`、`.hist-group__name`、`.hist-group__n`、`.hist-top__ops`、`.hist-row__del`（命名沿用本页 BEM 风格）。

## ③ 订单联系骑手（跨前后端）

### 后端 d:\zhao\vendure\packages\campus-delivery-plugin\src\rider-task.service.ts
- `orderRider` 返回对象（L90-98）增 `phone: rider.phoneNumber ?? null`（rider 为 Customer 实体，自带 phoneNumber 字段）。纯增字段，schema 向后兼容。

### 前端 d:\zhao\waimai\src\api\mutations\campus.ts
- `CAMPUS_ORDER_RIDER`（L32-44）查询字段加 `phone`。

### d:\zhao\waimai\src\pkg-order\pages\order-detail.vue
- rider ref 类型（L290）增 `phone?: string | null`。
- 骑手卡 L122：现有 `rider__contact` 外包 `view.rider__ops`；`v-if="rider.phone"` 时其上方加「联系骑手」按钮（同 `rider__contact` 样式）→ 新增 `callRider()`：`uni.makePhoneCall({ phoneNumber: String(rider.value.phone) })`。
- 样式 `.rider__ops { display:flex; flex-direction:column; align-items:flex-end; gap:12rpx; }`。
- 兼容：旧后端无 phone 字段 → 按钮不渲染，无需发版强绑。

## ④ 首页热销榜

### d:\zhao\waimai\src\pages\home\index.vue
- 猜你喜欢区块（L187-199）之后、跨店搜索区（L200）之前，新增常驻区块 `v-if="!searchKeyword && hotSaleStores.length"`。
- computed `hotSaleStores`：`stores.value` 过滤 `monthlySales>0` → 按 monthlySales 降序 → Top8（与 L404 `hotStores` 搜索兜底 Top4 并存，不冲突）。
- 模板复用 `recent-card`/`recent-row` 结构，卡片加 `recent-card--rank`；前三名左上角排名角标 `rank-badge rank-1/2/3`（金/银/铜：#ff4d2d/#ff8a00/#ffb020，圆形带折角）。
- 样式：`.recent-card--rank{position:relative}`、`.rank-badge` 及三档配色。

## i18n（src/locale/zh-Hans.json + en.json，2 空格缩进，双语言同步）

| key | zh-Hans | en |
|---|---|---|
| favorites.addCart | 加购 | Add |
| favorites.addCartOk | 已加入购物车 | Added to cart |
| favorites.addCartFail | 加购失败 | Failed to add |
| history.groupByStore | 按店铺 | By store |
| history.byTime | 按时间 | By time |
| history.removed | 已删除 | Removed |
| history.itemCount | {n}件 | {n} items |
| history.unknownStore | 其他店铺 | Other stores |
| home.hotSaleTitle | 热销榜 | Top Sellers |
| orderDetail.contactRider | 联系骑手 | Contact rider |

## 验证与交付

1. 前端 `pnpm build:h5` 通过。
2. Playwright 手机视口（390×844，dpr=2，mock shop-api）截图 74-77 存 `docs/screenshots/common-features-v15/`：
   - 74：收藏 items 卡「加购」按钮 + 点击成功后 toast 与角标；
   - 75：足迹单条删除 + 按店铺聚合视图（含组头）；
   - 76：首页热销榜区块 + 前三排名角标；
   - 77：订单详情骑手卡「联系骑手」按钮（mock phone）。
3. 后端：插件目录 tsc/pnpm build → `node deploy-pack.js` → 上传解压 → pm2 restart（服务器配置复用 d:\zhao\waimai\.secrets\deploy-waimai.mjs）；验证线上 campusOrderRider 返回 phone。若后端链路受阻：前端按降级交付（按钮 v-if phone 天然兼容），并明确告知用户。
4. 前端部署：`node .secrets/deploy-waimai.mjs`（线上 https://www.yourbao.cn/waimai/）。
5. 手册 `docs/waimai-操作手册-常用功能.md` 追加 §73-76 + 验收表；补充第 74-77 手机截图。
6. 提交推送：waimai 仓库**排除 src/pkg-user/pages/address-book.vue**（工作树既有换行差异，勿提交）；vendure 仓库单独提交推送。
7. 线上 chunk 回归 → 清理临时脚本 → 中文汇报（含截图 computer:// 链接）。

## 约束
- 任务收尾直接 提交→推送→部署（用户工作流硬规范），不逐项征询。
- i18n 双语言同步，禁止单语写死；文案走 locale.t。
- 不引入新依赖，不改动既有无关逻辑。
