# 个人中心补齐 设计文档

日期：2026-10-07
状态：设计已获用户确认（范围 A-G 全量 + 发票轻量版 + 版式 B 外卖资产区）
范围：子项目 3/4（2026-10-07 brainstorming 拆分四项之一）；其余三项中售后/退款（1/4）已有独立 spec+plan，优惠券 C 端（2/4）、订单状态推送（4/4）后续各自走 spec → plan 循环。

## 1. 背景与目标

waimai 个人中心（`pages/profile/index.vue`）现状仅有 3 个菜单项（我的订单/我的评价/成为传信者）+ 退出登录，头部仅姓名+邮箱，无头像、无电话、无任何管理页入口；order-detail「开发票」为 `notOpen` 死链，login 页「注册」为死链（SSO 接管后遗留），pkg-campus 跑腿单页无入口。

本设计补齐个人中心：**常用送餐地址簿（下单自动带出默认值）+ 资料编辑 + 发票（轻量版）+ 邀请好友 + 联系客服 + 关于/协议 + 死链修复**，落地为版式 B「外卖资产区」（mockup 已确认）。

## 2. 需求决策记录（用户已确认）

| 决策点 | 结论 |
|---|---|
| 本期范围 | A 地址簿 + B 资料编辑 + C 发票 + D 客服 + E 关于协议 + F 邀请 + G 死链修复，全量 |
| 发票深度 | 轻量版：抬头管理 + 订单提交开票申请（customFields 留痕），商家线下人工开票，B 端零改动 |
| 个人中心版式 | 版式 B 外卖资产区（美团风：橙头部 → 资产区四宫格 → 订单四态快捷条 → 菜单组），mockup 已确认 |
| 地址簿模型 | 复用 Vendure Address 实体 + Address customFields 扩展（shop-api 原生 CRUD，零新接口） |
| 优惠券入口 | 资产区留灰态占位（「即将上线」），归子项目 2，本期不实现 |

## 3. 页面设计（waimai uni-app）

### 3.1 pages/profile/index.vue（改版，版式 B）

结构自上而下：
1. **橙头部**（`--brand: #ff6600`）：头像圆 + 昵称 + 电话（未填显示「未绑定电话」）+「编辑资料」入口；未登录态显示「点击登录」。
2. **资产区四宫格卡**：优惠券（灰态「即将上线」）/ 常用地址 / 发票抬头 / 邀请好友。
3. **订单四态快捷条卡**：待付款 / 待送达 / 待评价 / 退款售后 → 跳订单列表页（`pages/orders/index`）携带状态筛选参数（待送达=配送中态、待评价=已完成未评）；「退款售后」接子项目 1 售后链路（**并行实施中，已激活订单详情售后入口**，其列表入口可用后即挂本快捷条，未可用前临时跳订单列表全部态）。
4. **菜单组卡**：我的评价 / 我的跑腿单（`pkg-campus/pages/errand/list`）/ 联系客服 / 关于拾光达 / 成为传信者（保留现有骑手分流逻辑）。
5. **退出登录**按钮。

### 3.2 新增页面（pkg-user/pages/，均需 pages.json 注册）

**profile-edit.vue（资料编辑）**
- 头像：点击换图（`uni.chooseImage` 走**既有上传通道** `src/api/mutations/upload.ts`，可复用 `src/components/ImageUpload.vue`）→ 存 `Customer.customFields.avatarUrl`；无上传动作时回显 SSO 头像（activeCustomer 现有字段链）。
- 昵称（firstName）、电话（phoneNumber）：`updateCustomer` 既有 mutation。
- 保存后返回上一页刷新。

**address-book.vue（地址列表）**
- 列表项：联系人 + 电话 + 「分区 · 楼栋 · 房号」+ 默认徽标（`defaultShippingAddress`）。
- 操作：点击编辑（address-edit）、列表项右侧「删除」按钮（`deleteCustomerAddress`，二次确认弹窗）、「设为默认」（`updateCustomerAddress` set defaultShipping）、底部「新增地址」。
- 失效地址（zone/building 已删/停用）：置灰标记「待更新」，不可设默认、不可供 checkout 选用，点击仅可进编辑页修正。
- 空态：引导新增。

**address-edit.vue（地址编辑）**
- 字段：联系人（fullName，必填）、电话（phoneNumber，必填，11 位手机校验）、分区（campusZones 单选）、楼栋（campusBuildings 级联单选，数据源与 checkout 同源 `fetchZones/fetchBuildings`）、房号（与楼栋名拼入 streetLine1，选填）、存为默认地址开关。
- 编辑态入参带 addressId 回填（含 customFields zoneId/buildingId）。
- 提交：新建走 `createCustomerAddress`，编辑走 `updateCustomerAddress`。

**invoice-titles.vue（发票抬头管理）**
- 数据存 `Customer.customFields.invoiceTitles`（JSON 数组，≤5 条，前端裁剪）。
- 抬头结构：`{ type: 'personal' | 'company', name, taxNo?, email }`；个人抬头必填 name+email；企业抬头必填 name+taxNo+email（税号 15-20 位字母数字校验）。
- 操作：新增（表单弹层）/ 编辑 / 删除 / 默认标记（数组首位为默认）。

**invite.vue（邀请好友）**
- 展示当前用户 `referralCode`（既有，与 SSO 自有码对齐）大字号卡片。
- 「复制邀请链接」：拼当前 origin 分享链接（含 `?invite_code=<referralCode>`），`uni.setClipboardData` + toast。

**about.vue（关于拾光达）**
- 版本号（打包常量）、用户协议、隐私政策（静态文案页或复用 `pages/webview/index` 加载约定 URL）、平台客服电话展示。

### 3.3 既有页面改造

**checkout.vue**
- onMounted 取 `activeCustomer.addresses`，若有 `defaultShippingAddress` 且 customFields 含 zoneId/buildingId、且二者命中当前店铺 `campusZones/campusBuildings` 配置 → 自动预选分区与楼栋（**送达时段仍需用户手选，不预存**）；未命中则静默忽略（跨店铺防脏数据）。
- 校园配送面板「选择分区」上方加一行已选默认地址摘要（可点击改选）。

**order-detail.vue（发票轻量闭环）**
> 协调约束：本页正由售后子项目（并行会话）改造中，发票改动必须**基于其落地后的最新代码**实施（实施 plan 排期放在售后收口之后），`pages.json` 同理。
- `canInvoice` = 订单已支付（PaymentSettled 及之后）且 `customFields.invoiceApplied !== true`。
- 「开发票」按钮 → 底部弹层：选抬头（invoice-titles 数据单选）+ 接收邮箱（默认带抬头 email）→ 提交 `updateOrderCustomFields`（先确认该 mutation 对 C 端可用性，若无则用插件加法：shop-api `applyOrderInvoice(titleId 无关, snapshot JSON)` 单 mutation，实现 plan 时定夺，优先零后端方案）写 `invoiceApplied=true` + `invoiceInfo`（抬头快照+邮箱+时间）。
- `invoiceApplied=true` 态：按钮区显示「已提交开票申请」只读条，展示快照摘要。

**login/index.vue**
- 「注册」`notOpen` 死链 → 隐藏入口（注册由星枢通行 SSO 承接）。

## 4. 后端设计（vendure，全部加法）

customFields 注册集中在 `campus-delivery-plugin/src/custom-fields.ts`（既有 Customer 字段先例 riderCredit 等），**物理列开机自动建，零 migration**：

| 实体 | 字段 | 类型 | 用途 |
|---|---|---|---|
| Address | `zoneId` / `buildingId` / `route` | string, nullable | 校园地址映射（route 备用） |
| Customer | `avatarUrl` | string, nullable | 头像 URL |
| Customer | `invoiceTitles` | JSON, nullable | 发票抬头列表（≤5） |
| Order | `invoiceApplied` | boolean, default false | 开票申请留痕 |
| Order | `invoiceInfo` | JSON, nullable | 申请快照（抬头+邮箱+时间） |

- shop-api 暴露性：Address/Customer customFields 随 `activeCustomer` 默认可读写（Vendure 原生）；Order customFields 经 `updateOrderCustomFields` 原生 mutation 对已登录顾客开放（实现 plan 时以生产 introspection 复核，缺则插件加一个 shop mutation 兜底）。
- 零新实体、零新 resolver（理想路径）；B 端 web-admin 本期不动。

## 5. 错误处理

| 场景 | 处理 |
|---|---|
| 默认地址 zone/building 失效 | 标记「待更新」置灰；checkout 预选静默忽略 |
| 跨店铺 zone/building 不匹配 | 预选忽略，不报错 |
| 抬头超 5 条 | 前端禁新增并提示删除后再加 |
| 税号/邮箱格式错 | 前端表单校验，后端 JSON 字段不做强校验（轻量版边界） |
| 重复开票申请 | `invoiceApplied` 幂等闸，按钮转只读 |
| 未登录访问子页 | 复用 `authStore.requireLogin()` 分流 |
| 头像上传失败 | toast 报错保留原头像 |

## 6. 明确不做（本期）

- 优惠券（子项目 2），仅留灰态占位
- 退款/售后列表接（子项目 1 落地后接快捷条末位态）
- 发票 B 端流转、第三方自动开票、抬头服务端强校验
- 收货地址多租户差异（校园分区数据本就按渠道隔离，地址跨店仅存 ID 引用）

## 7. 测试与交付

- **vitest 纯逻辑**：地址 ↔ zone/building 命中映射纯函数；抬头结构校验（个人/企业必填项、税号格式）。
- **生产冒烟脚本**：登录 → 新增地址（含默认）→ checkout 预选生效 → 下单 → 订单提交开票申请留痕 → 重复申请被幂等拦截；幂等可重复跑。
- **手机截图（硬规范）**：390×844 dpr=2 Playwright——profile 改版页 / profile-edit / address-book / address-edit / invoice-titles / invite / about / checkout 预选态 / 订单详情开票态，逐张目检。
- **操作手册**：`vshop/docs/waimai-操作手册.md` 补「个人中心」章节（含截图）。
- 交付定义 = 实现 + API/冒烟回归 + 手机截图 + 操作手册，收尾一气呵成（提交 → 推送 → 部署）。
