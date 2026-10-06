# 外卖体系扩展开发计划（2026-10-06）

> 排除项（用户明示）：评论体系、跑腿分账、后台数据看板。
> 已确认决策：商家端 = waimai 内 `pkg-merchant` 分包；商家身份 = Customer-渠道绑定识别。

## 现状基线（已实现，不重复开发）

- 用户端（d:\zhao\waimai）：校园配送下单（分区/楼栋/时段/路线R1R2）、起送价/配送费、支付、订单时间线、骑手卡片、轮询
- 骑手端（pkg-rider）：大厅/抢单/开始/送达/异常/转单/送达拍照
- 后端（vendure campus-delivery-plugin）：分区/楼栋/时段/门店配置实体、自动调度（超时回大厅/强派/无人接单自动退款+补偿券）、admin 调度 API（dispatch-admin.resolver）
- 运营后台：campus/config.vue（门店配置）
- 微信通知基础设施（wechat-auth-plugin）：模板消息列表/发送、渠道凭证回落——外卖通知直接复用

## 阶段一：跑通营业闭环（P0）

### 1.1 商家接单/出餐端（pkg-merchant 分包）
- 身份：微信号登录后，后端按 Customer 绑定渠道（customFields）识别商家店铺；未绑定则引导绑定流程（输店铺绑定码 → 写 Customer customFields.merchantChannelToken）
- 页面：
  - merchant-home：今日待处理（新单红点）/配送中/已完成、营业中开关
  - merchant-orders：新单列表+接单确认、已接单列表+「开始出餐/出餐完成」（驱动 leg1Status）
  - merchant-order-detail：单品明细、配送目标（宿舍楼/时段）、打印小票按钮（蓝牙对接后续轮）
- 后端（campus-delivery-plugin 新增）：
  - merchantOrders(channelToken)：本店新单/进行中（shop-api）
  - merchantAcceptOrder / merchantCookingDone：写 hallStatus（进入抢单大厅）与 leg1Status='ready'
  - 商家身份 guard：customer.customFields.merchantChannelToken 与订单渠道一致性校验
  - 新单通知：来单→公众号模板消息推商家 openid（复用 wechat-auth-plugin sendTemplate；商家绑定码流程中存 openid）
- 前端：pages.json 注册 pkg-merchant 三页；apis/merchant.ts；渠道隔离同骑手端模式

### 1.2 调度操作台（web-admin 页面，零后端改动）
- 位置：工作台→配送管理→调度中心（menus.ts 注册，超管可见）
- 功能：
  - 实时订单墙：按 hallStatus 分列（待接/已抢/配送中/异常/终态），10s 自动刷新
  - 单卡操作：回大厅/强派指定骑手/取消退款（复用 dispatch-admin.resolver 既有 mutation）
  - 告警条：alerts 置顶（超时未接/无人接单预警）
  - 在线骑手列表+手中任务数（强派选人）
- 文件：web-admin/src/pages/campus/dispatch.vue + apis/campus.ts 扩展

## 阶段二：通知与骑手运营（P1）

### 2.1 订单节点微信通知（用户侧）
- 触点：商家接单/骑手接单/出餐完成/送达 → 公众号模板消息推下单用户 openid
- 前提：下单用户需公众号 openid——下单页引导关注（未关注用户静默跳过）
- 实现：campus-delivery-plugin 各状态写入点调用 wechat-auth-plugin 的 sendTemplate（事件订阅模式，避免插件间硬依赖：wechat-auth 暴露 EventBus 事件或直接 service import）

### 2.2 骑手位置上报 + 地图追踪
- 骑手端：pkg-rider 配送中页面定时（10s）上报经纬度（wx.getLocation）→ 写 Order customFields.riderLat/riderLng
- 用户端：order-detail 轮询时带出骑手位置，内嵌腾讯地图（qqmap-wx-jssdk）显示骑手 Marker 与目标楼栋
- 隐私：仅配送中状态可见，送达后清除

### 2.3 骑手注册/审核流程
- pkg-rider 增注册页：姓名/手机号/学号(校园)/健康证照片上传
- 后端：riderApplications 实体（status: pending/approved/rejected）+ admin 审核 API
- web-admin：骑手管理页（列表/审核/停用）
- 通过后写 rider customFields.riderApproved=true，解锁接单大厅

### 2.4 催单/联系骑手
- 用户端订单详情「催单」按钮：超预计送达时间可点 → 通知骑手（模板消息）+ 订单标记 urged=true
- 联系骑手：虚拟号回拨（阿里隐私号）暂缓，先做「平台客服转接」按钮（拨门店电话），虚拟号留待下一轮

## 阶段三：效率与营销（P2）

### 3.1 预约单
- 下单页送达时段支持「未来日期」；Order customFields.scheduledFor 写入
- 调度 job 到点前 30min 才放入大厅（dispatch-job 过滤条件加时间窗）

### 3.2 满减/配送费减免
- 复用现有促销/券体系；campus-delivery-plugin 增「满 X 元免配送费」规则（门店配置字段），结算页展示减免明细
- 券：无人接单补偿券机制已有，扩展为通用营销券发放

### 3.3 多单顺路合并
- 调度 job：同楼栋+同时段多单打包为一条「路线任务」推大厅；骑手一次接多单
- 骑手端任务列表支持子单勾选送达

### 3.4 异常赔付流程
- reportException 后：admin 侧「异常处理」视图（赔付金额/重派/退单三选一）
- 赔付=退差价（Vendure refund）或发券；重派=回大厅；留操作记录 customFields

## 实施顺序与验证

1→2 阶段一（先商家端后调度台）→ 阶段二按 2.1→2.3→2.2→2.4（通知价值最高先做）→ 阶段三按 3.1→3.2→3.4→3.3
- 每阶段：本地构建→提交推送→部署（服务器只解压/restart）→ 390×844 dpr=2 手机截图→测试用例/操作手册补充
- 涉及仓库：vendure（插件）、waimai（用户/骑手/商家端）、vshop/web-admin（调度台、骑手审核）

## 风险与依赖

- 商家通知/用户通知依赖公众号模板消息：需在公众号后台申请订单类模板（提醒用户操作）
- 骑手位置 wx.getLocation 需小程序端已申请「位置信息」权限类目
- 多单合并与现有强派逻辑有交互，实现时以「路线任务」为调度单元需回归调度 job 全部场景
