# 第 28 轮 · 任务清单（tasks.md）

## T1 工具层
- [x] `src/utils/group-order.ts`：类型 + 本地读写 + base64url 编解码（invite / pick）+ 合并工具
- [x] `src/utils/random-pick.ts`：`eligibleStores` / `pickStore` / `pickCombo`
- [x] `src/utils/line-notes.ts`：读写 / 清理 / 摘要 / 合并进整单备注
- [x] `src/utils/open-watch.ts`：关注读写 / `openedWatched`

## T2 页面
- [x] `src/pkg-order/pages/group-order.vue`：列表 / 受邀 / 回传三种模式
- [x] `src/pkg-order/pages/random-pick.vue`：预算 + 分类 + 摇一摇 + 一键加购

## T3 既有页面改造
- [x] `cart.vue`：店铺卡「拼单」chip；行备注入口 + 弹层；`applyOrder`/`clearGroup` 清理备注
- [x] `checkout.vue`：单品备注摘要块 + `composeOrderNote` 合并 + 下单后清空
- [x] `home/index.vue`：快捷入口「拼单 / 帮我选」；打烊店铺「开门提醒」chip；开门横幅
- [x] `pkg-user/pages/favorites.vue`：开门横幅

## T4 配置
- [x] `src/pages.json` 登记 2 个页面
- [x] `zh-Hans.json` / `en.json` / `uni-app*.json` 三件套 nav 同步

## T5 构建与验收
- [x] `pnpm build:h5` 通过
- [x] `node .secrets/deploy-waimai.mjs` 部署
- [x] `.secrets/common-features-v28-shots.cjs` 截图 192–202 → `docs/screenshots/common-features-v28/`
- [x] 断言脚本：base64 round-trip、预算约束、开门判定、备注摘要（30/30 PASS）
- [x] 手册 §135
- [x] 提交/推送/线上回归（只 add 本轮文件）
