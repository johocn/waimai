# 任务清单（第十三轮）

> 依赖顺序执行；每完成一项即勾选。规范见同目录 `spec.md`。

## T1 基础设施

- [x] 新增 `src/utils/fav-price.ts`（价格快照读写 / 降价计算 / 上限 300）
- [x] 新增 `src/utils/time-slot.ts`（时段判定 + 店铺推荐打分）
- [x] `src/stores/favorites.ts`：toggleVariant 快照读写、hydrateVariantMeta 建基线、新增 `refreshVariantPrices`
- [x] `src/pages.json`：`pkg-user` 注册 `pages/spending`（`%nav.spending%`）
- [x] `src/locale/uni-app.zh-Hans.json` / `uni-app.en.json`：`nav.spending`

## T2 消费统计账单

- [x] 新建 `src/pkg-user/pages/spending.vue`：跨渠道订单聚合并去重；汇总卡 / 月度趋势 / 常点店铺 TOP3 / 最近 5 单 / 空态
- [x] `src/pages/profile/index.vue`：新增「消费统计」菜单入口（登录态）
- [x] `zh-Hans.json` / `en.json`：新增 `spending` 段与 `profile.spending`

## T3 收藏商品降价提醒

- [x] `src/pkg-user/pages/favorites.vue`：`refreshPrices`（按 token 拉商品刷新价）、降价角标 + 原价划线、Tab 降价数量角标
- [x] `zh-Hans.json` / `en.json`：`favorites.priceDrop`、`favorites.oldPrice`
- [x] 验证：收藏后改 mock 价低于快照 → 展示降价；首次刷新无快照不误报

## T4 店铺公告与信息卡

- [x] `src/pages/shop/menu.vue`：公告条（单行省略 + 查看）、公告弹层、每日一次自动弹（localStorage key）
- [x] `zh-Hans.json` / `en.json`：`menu.storeNoticeTitle/noticeMore/noticeOk`
- [x] 验证：首次进店自动弹、同日二次进店不弹、点公告条可再次打开

## T5 时段推荐店铺

- [x] `src/pages/home/index.vue`：`nowTick` + `mealSlot` + `mealPicks`、时段推荐横滑区、「查看全部」切类目、搜索时隐藏
- [x] `zh-Hans.json` / `en.json`：`home.mealTitle/mealMore/mealBreakfast/mealLunch/mealTea/mealDinner/mealNight`
- [x] 验证：修改系统时间或 mock 时段，标题与推荐标签匹配；「查看全部」生效

## T6 构建与验证

- [x] `pnpm build:h5` 成功；确认 dist 含 spending 页面 chunk
- [x] 编写 `.secrets/common-features-v13-shots.cjs`（Playwright 390×844 dpr=2），产出 7 张截图到 `docs/screenshots/common-features-v13/`
- [x] 断言：统计页数字/趋势、降价角标、公告弹层、时段推荐标题
- [x] 部署 `node .secrets/deploy-waimai.mjs`

## T7 文档与收口

- [x] `docs/waimai-操作手册-常用功能.md` 追加 §63–§66 + 验收表 + 截图引用
- [ ] 提交（排除 address-book.vue 换行差异）→ push
- [x] 线上 chunk/页面回归
- [x] 删除临时截图脚本
- [x] 中文汇报（功能点、截图、部署地址）
