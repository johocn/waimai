# v15 任务清单

- [x] T1 ①收藏商品一键加购：cart.ts 增 `addItemToOrderInChannel`；favorites.vue 加「加购」按钮 + `addCart()` + `.fav-item__add` 样式
- [x] T2 ②足迹增强：footprint.ts 增 `removeFootprint`；history.vue 增 `fpMode` 切换、`fpDisplay` 聚合、行内删除 `removeOne`、组头/删除样式
- [x] T3 ④首页热销榜：home/index.vue 增 `hotSaleStores` computed + 常驻区块 + 前三排名角标样式
- [x] T4 ③联系骑手：rider-task.service.ts `orderRider` 增 phone；campus.ts 查询增 phone；order-detail.vue 增 `rider__ops` + `callRider()` + 类型
- [x] T5 i18n：zh-Hans.json / en.json 同步新增 10 个词条
- [x] T6 前端构建 + Playwright 截图 74-77 + 断言 + 部署（.secrets/deploy-waimai.mjs）
- [x] T7 后端插件构建 + deploy-pack 部署 + pm2 restart + 线上 phone 字段验证（受阻则降级并告知）
- [ ] T8 手册 §73-76 + 验收表；waimai（排除 address-book.vue）/ vendure 分别提交推送；线上回归；清临时脚本；中文汇报

执行顺序：T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8
