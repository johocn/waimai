# waimai 全链路体检设计（2026-10-08）

> 目标：对学生端 / 骑手端 / 后端插件 / 管理后台做四维度体检，产出 P0-P3 分级优化清单；用户确认优先级后逐项实施。

## 1. 范围与定级

**范围**（排除：`src/pkg-jianghu` 未提交模块、`.secrets/` 凭据、`dist/` 产物）：

| 域 | 代码位置 |
|---|---|
| 学生端 | `waimai/src`（pages/components/composables/stores/api/utils、pkg-campus/pkg-order/pkg-promotion/pkg-user） |
| 骑手端 | `waimai/src/pkg-rider` + 骑手相关 api/stores |
| 后端 | `vendure/packages/campus-delivery-plugin` |
| 管理后台 | `vshop/web-admin/src/pages` 中 waimai 相关页（rider withdraw、券配置、调度配置等） |

**四维度**：性能与加载体验 / UX 体验与交互 / 代码质量与可维护性 / 安全健壮性与运维。

**定级**（每条发现必须带证据 `文件:行号` + 一句话影响）：

- P0：资金/安全风险、生产事故隐患（越权、竞态、调度失控、支付链路缺陷）
- P1：明显影响体验或性能（首屏慢、重复请求、缺错误兜底导致白屏）
- P2：代码质量与可维护性（超长文件、重复逻辑、类型缺失、测试缺口）
- P3：锦上添花（文案、视觉一致性、注释）

主线程对子代理报的 P0/P1 逐条抽查核实源码后才入报告。

## 2. 执行方式（方案 A + 生产实测）

四个并行 Explore 子代理分域扫描 → 主线去重合并、抽查核实、定级 → 内联可视化呈现报告 → 完整清单落 `docs/2026-10-08-waimai-audit-report.md`。

**生产实测**（P0 证据补强，Playwright 390×844 dpr=2 移动视口）：

1. 首屏计时：首页/店铺页/订单页 load + 首屏时间（3 次取中位数），`scripts/_audit_timing.py`
2. 接口耗时：`/shop-api` 关键查询网络耗时
3. 包体积：dist/build/h5 chunk 尺寸 Top10（本地）
4. 冒烟回归基线：`vshop/docs/verify/waimai-e2e-smoke.cjs` 确认起点全绿

## 3. 实施流程（报告确认后）

1. 按确认优先级逐项修复，遵循既有规范（i18n 多语言、动态 origin、防重幂等）
2. 回归：vitest + 插件单测（涉后端）+ 收尾冒烟
3. 界面改动项补手机视口截图目检
4. 收口「一气呵成」：提交 → 推送 → 部署（waimai 走 `deploy-waimai.mjs`；vendure 走 git pull + pm2 restart，本地构建）

## 4. 边界

不碰 pkg-jianghu；若优化必须动其关联文件（pages.json/App.vue 等），先说明再动手。
