# 第二轮验收清单（2026-10-21）

- [x] 后端商品收藏接口已上线：`campusFavoriteVariants` / `campusToggleFavoriteVariant`，未登录返回 `FORBIDDEN`，非法 variant 返回 `VARIANT_NOT_FOUND`，登录 toggle 幂等翻转
- [x] 迁移 `campus_favorite_variant` 幂等建表（`customerId + variantId` 唯一），插件 `pnpm build` 通过
- [x] 前端收藏数据层：`variantItems`（`favorite_variants`）、乐观更新 + 失败回滚、云端空时补写本地、按渠道 `hydrateVariantMeta` 回填元数据
- [x] 商品收藏 UI：菜单商品行心标（任一规格已收藏即实心）、首页「收藏商品」横排（≤8）
- [x] 搜索升级：历史（≤10 去重前置、可清空）+ 热搜面板；跨店商品搜索（每店 ≤6、总 ≤24）；无结果热销店铺推荐；菜单 `q=` 过滤 chip
- [x] 常买商品：支付成功写 `recent_items`（≤8），首页横排展示，点击带 `add=` 进店自动加购 1 件并提示
- [x] 订单中心：订单号/店名/商品名本地搜索、售后聚合条与售后/异常标记、送达时段展示、跨渠道同 `code` 去重并优先店铺名、分页终止条件修正
- [x] 结算体验：起送价未达硬拦截（前端弹窗 + 后端兜底）、满减凑单提示（未达「再买 ¥D 可减 ¥Y」/已达「已满 ¥T 减 ¥Y」）、首页楼栋快捷切换与结算页预选
- [x] i18n：`zh-Hans.json` / `en.json` 新增键齐全（`searchHistory`/`hotSearch`/`favoriteProducts`/`recentProducts`/`minOrderGap`/`promoGap`/`afterSaleOnly`/`deliverySlot` 等两文件均存在）
- [x] 构建：waimai `pnpm build:h5` 通过（入口 `assets/index-BlAndL9s.js`），后端内嵌插件产物已构建
- [x] 截图：`docs/screenshots/common-features-v2/` 共 9 张（390×844 dpr=2）
- [x] 手册：`docs/waimai-操作手册-常用功能.md` 已追加第二轮 §7–§13（功能说明、接口表、验收记录、已知限制、截图引用）
- [x] 交付：waimai 提交并推送（`fef6772`、`eb7e013`、`c943927`），Vendure 提交并推送（`f3259441b`）并 `pm2 restart`
- [x] 线上回归：`https://www.yourbao.cn/waimai/` 返回 200；线上入口 bundle 与本地一致且包含第二轮功能字符串；生产 `shop-api` 收藏接口按预期鉴权
