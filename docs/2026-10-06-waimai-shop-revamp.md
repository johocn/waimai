# 外卖店铺内页改版（三 Tab + 版式 A 橙头浮卡）— 2026-10-06

参考美团外卖店铺内页三截图（商品/评论/商家），用户从交互式 mockup 的 A（橙头浮卡）/B（轻量平铺）两版式中选定 **方案 A**，并确认**三 Tab 全做**（评论页先 UI 空态，后端评价能力就绪后接数据）。同日首页已上线双主题（方案 A 橙头），店铺内页复用同一 `--w-*` token 体系。

## 改动点

| 区块 | 旧版 | 新版 |
|---|---|---|
| 页面结构 | 促销条 + 左分类右商品 + 购物车条 | 橙头 + 店铺信息卡（浮出压橙头）+ 三 Tab（商品/评论/商家）+ 购物车悬浮胶囊 |
| 店铺信息卡 | 无 | 店名 + 首字 logo + 配送方式文案（`routeText`）+ 优惠 tag（promoText）；导航栏标题改店铺名（`uni.setNavigationBarTitle`） |
| 商品卡 | 名称/描述/价格/圆形+ | 多规格显示「选规格」胶囊（单规格保持 +），价格行独立，token 化配色 |
| 分类 | 简单列表 | 保留交互；修复商品含「全部」collection 时分类栏重复「全部」（buildCats 过滤） |
| 评论 Tab | 无 | 空态「商家暂无评价，下单后评价将在这里展示」（EmptyState） |
| 商家 Tab | 无 | 店铺名/配送服务/营业时间 10:00–22:00/配送范围（校内宿舍楼与教学楼）+ 服务标签；promoText 作店铺公告卡（无则隐藏） |
| 购物车条 | 常规白底条 | 深色悬浮胶囊：凸出橙圆钮 + 白底徽标；空态「购物车空空如也~」，有货显示合计；点击跳结算逻辑不变 |
| 双主题 | 无 | `.menu-page` 定义亮色 `--w-*` token、`.dark` 覆盖（同首页体系）；`initTheme()` 恢复暗色 |

## 关联组件

- `src/utils/store-display.ts`：新增 `routeText()`（自首页内联提取共享；R1=商家自送+校内骑手接力，否则档口直送·校内骑手上楼，空=暂未开通配送）
- `src/components/SkuSheet.vue`：弹层写死颜色改 `var(--w-*, 原值)`，暗色下 SKU 弹层跟随（当前店铺无多规格商品，截图暂缺，逻辑已覆盖）
- `src/components/PriceTag.vue`：划线价颜色 var 化
- `scripts/_shot_shop.py`（新增）：首页进店 → 三 Tab → 暗色 → SKU 弹层（容错跳过）

## 测试用例

| # | 用例 | 预期 | 结果 |
|---|---|---|---|
| 1 | 首页点店铺卡进店 | 橙头 + 信息卡浮出，三 Tab 渲染，导航栏标题=店名 | ✅ |
| 2 | 商品 Tab | 左分类右商品、价格橙红、加购/选规格按钮 | ✅ |
| 3 | 分类含「全部」collection | 分类栏只出现一个「全部」 | ✅ |
| 4 | 配送方式文案 | 显示「商家自送 + 校内骑手接力」而非 R1,R3 原始 ID | ✅ |
| 5 | 评论 Tab | 空态文案正常 | ✅ |
| 6 | 商家 Tab | 店铺信息卡 + 服务标签（校内配送/校内骑手接力送达） | ✅ |
| 7 | 暗色主题 | 整页暗色、橙头/价格保留品牌色、购物车胶囊深色 | ✅ |
| 8 | 购物车胶囊 | 空态提示 + 去结算置灰；加购后显示合计（逻辑未动） | ✅ |
| 9 | vitest 回归 | 21/21 | ✅ |

## 截图（390×844 dpr=2，Playwright `scripts/_shot_shop.py`）

- `docs/screenshots/shop-revamp/1-shop-goods-light.png` 商品 Tab 亮色
- `docs/screenshots/shop-revamp/2-shop-reviews-light.png` 评论 Tab 空态
- `docs/screenshots/shop-revamp/3-shop-merchant-light.png` 商家 Tab
- `docs/screenshots/shop-revamp/4-shop-goods-dark.png` 商品 Tab 暗色
- `docs/screenshots/shop-revamp/5-shop-merchant-dark.png` 商家 Tab 暗色

## 后续待接（需后端字段）

- 评价数据（评分/内容/筛选）→ 评论 Tab 接真实数据替换空态
- 配送时长、起送费、配送费、店铺地址/电话/资质 → 信息卡与商家页补全（当前用静态文案：营业时间/配送范围与首页公告一致）

## 部署

本地构建 `pnpm build:h5` → `node .secrets/deploy-waimai.mjs` → 线上 https://www.yourbao.cn/waimai/ 验证。
