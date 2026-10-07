# Waimai C端售后/退款流程 Implementation Plan

> **For agentic workers:** REQUIRED sub-skill: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐外卖 C 端售后闭环——整单/按行部分退款申请 → 商家审批（48h 未审自动同意）→ 被拒可申诉 → 平台仲裁 → 原路退回，全链路冒烟 + 手机截图 + 操作手册。

**Architecture:** 全量复用 vendure `after-sales-plugin`（已注册、shop/admin API 完备、web-admin 已有售后审批页）。插件仅做加法扩展：① 状态机加 `Appealed` 态与 `Approved→Received` 免退货直达；② 新增 3 个插件 options（24h 窗口 / 订单状态白名单 / deliveryStatus 送达门槛）适配外卖「全程 PaymentSettled」的状态现实；③ 新增 2 个 mutation（C 端 `appealAfterSalesRequest`、管理端 `arbitrateAfterSales`）+ refund_only「审批即退款」链。前端 waimai 新增 pkg-order 两页（创建/详情），order-detail 激活售后入口；web-admin 售后详情页加仲裁操作。

**Tech Stack:** vendure 3.x 插件（TypeORM/TypeGraphQL，vitest e2e harness sqljs）、uni-app H5（waimai）、uni-app 管理端（web-admin）、Playwright 冒烟（python，复用 `_smoke_exception.py` 骨架）。

**规范：**
- waimai 前端新页面写死中文；金额一律「分」存储，展示 ÷100 保留两位
- vendure 插件消费 `lib/` 编译产物（git 跟踪）：改 src 后必须 `npm run build` 再 commit src+lib
- vendure 部署 = push 后服务器 `git pull --ff-only` + `pm2 restart vendure`（启动 ~6 分钟，`ss -tln | grep 3020` 确认监听）；**服务器路径 `/www/apps/vendure`，绝不服务器构建**
- waimai 部署 = `node .secrets/deploy-waimai.mjs`（本地构建 → scp → 解压）；web-admin 部署 = vshop 仓库 `scripts/deploy.mjs`
- 关键事实（已核实）：waimai 订单送达后 **vendure state 仍为 PaymentSettled**（campusDeliverTask 只写 `customFields.deliveryStatus='delivered'` + `deliveredAt`，不转订单态）；确认收货后才转 `Delivered`
- 生产冒烟账号：学生 `smoke-order@yourbao.cn / Wm@Smoke123`（uid=160）、骑手 `smoke-rider@yourbao.cn / Wm@Smoke123`（customer 150）；admin `superadmin / z123123`（走 `https://e.joho.cn/admin-api`，本 fork 鉴权只认会话 cookie，脚本里用 admin login 拿 `vendure-auth-token`）

**spec：** `docs/superpowers/specs/2026-10-07-waimai-after-sale-design.md`

---

## File Structure

**vendure（d:\zhao\vendure）**
```
packages/after-sales-plugin/src/
  types.ts                        # +Appealed 态、+3 个插件 options
  plugin.ts                       # shop/admin SDL 增 2 个 mutation + 枚举加 Appealed
  after-sales.service.ts          # createRequest 门槛/窗口/整单查重；approveRequest 退款链；
                                  # +appealRequest / arbitrateRequest / refundOnlyChain
  after-sales-shop.resolver.ts    # +appealAfterSalesRequest
  after-sales-admin.resolver.ts   # +arbitrateAfterSales
packages/after-sales-plugin/e2e/
  after-sales-refund-only.e2e-spec.ts   # 新建：状态机/门槛/退款链/申诉/仲裁
packages/dev-server/
  dev-config.ts                   # AfterSalesPlugin.init({...}) 一处改动（生产即用此文件）
```

**waimai（d:\zhao\waimai）**
```
src/api/queries/afterSale.ts      # 新建：售后 API 层（查/建/撤/申诉/留言）
src/pkg-order/pages/after-sale-create.vue   # 新建：版式A清单勾选式创建页
src/pkg-order/pages/after-sale-detail.vue   # 新建：状态卡+步骤条+申诉+留言
src/pkg-order/pages/order-detail.vue        # 改造：激活售后入口+售后状态卡+修死查询
src/pages.json                    # pkg-order 注册两页
scripts/_smoke_aftersale.py       # 新建：生产全链路冒烟+截图
docs/waimai-操作手册-售后.md       # 新建：用户/商家/平台三方操作手册
```

**web-admin（d:\zhao\vshop\web-admin）**
```
src/constants/orderState.ts       # AFTER_SALE_STATES +Appealed
src/constants/afterSaleActions.ts # +arbitrate 可用性、+Appealed 页签
src/apis/afterSale.ts             # +arbitrateAfterSale mutation 封装
src/pages/after-sale/detail/index.vue  # 仲裁按钮+仲裁时间线节点
src/locale/zh-Hans.json / en.json # 新词条
```

---

### Task 1: 插件——状态机扩展 + 窗口/门槛选项 + 创建侧校验

**Files:**
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\types.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales.service.ts:193-253`
- Test: `d:\zhao\vendure\packages\after-sales-plugin\e2e\after-sales-refund-only.e2e-spec.ts`（新建）

- [ ] **Step 1: types.ts 全量替换**

```ts
export interface AfterSalesPluginOptions {
    /** Maximum days after delivery to allow after-sales request (default: 15) */
    maxDaysAfterDelivery?: number;
    /** 售后窗口小时数（>0 时覆盖 maxDaysAfterDelivery 逻辑：从送达时间起算，如 24 = 送达后 24h；默认 0 = 沿用 maxDaysAfterDelivery） */
    afterSalesWindowHours?: number;
    /** 允许售后的订单状态（默认 Shipped/Delivered/PartiallyDelivered/Completed/Cancelled；外卖单全程 PaymentSettled，需显式放行） */
    allowedOrderStates?: string[];
    /** 要求订单 customFields[field] === value 才允许售后（外卖场景 { field: 'deliveryStatus', value: 'delivered' }；不设置则仅按订单状态校验） */
    requireOrderCustomField?: { field: string; value: string };
    /** Pending 超时提醒商家小时数（默认 48；渠道 customFields afterSalesTimeoutHours 优先） */
    afterSalesTimeoutHours?: number;
    /** Pending 超时自动同意小时数（0 = 关闭，默认 0；渠道 customFields afterSalesAutoApproveHours 优先） */
    afterSalesAutoApproveHours?: number;
    /** RefundFailed 自动重试次数（0 = 关闭，默认 1；渠道 customFields afterSalesRefundAutoRetry 优先） */
    afterSalesRefundAutoRetry?: number;
}

export type AfterSalesType = 'return_refund' | 'refund_only' | 'exchange';
export type AfterSalesState =
    | 'Pending'
    | 'Approved'
    | 'Rejected'
    | 'Returning'
    | 'Received'
    | 'ExchangeShipped'
    | 'Refunded'
    | 'RefundFailed'
    | 'Appealed'
    | 'Closed';

export const STATE_TRANSITIONS: Record<AfterSalesState, AfterSalesState[]> = {
    Pending: ['Approved', 'Rejected'],
    Approved: ['Returning', 'Received', 'Closed'], // +Received：refund_only 免退货直达退款
    Rejected: ['Appealed', 'Closed'], // +Appealed：用户申诉入口
    Appealed: ['Approved', 'Closed'], // 仲裁：同意退款 / 维持拒绝
    Returning: ['Received', 'Closed'],
    Received: ['Refunded', 'RefundFailed', 'ExchangeShipped'],
    ExchangeShipped: ['Closed'], // 换货已发货 → 顾客确认收货即关闭
    RefundFailed: ['Refunded'], // 退款失败后可重试
    Refunded: [],
    Closed: [],
};
```

- [ ] **Step 2: service.ts createRequest 三处替换**

替换 1 —— 订单状态白名单（原 L193-199）：

旧：
```ts
        // 2. 校验订单状态（必须 Shipped/Delivered/PartiallyDelivered/Completed/Cancelled 才能售后）
        const allowedStates = ['Shipped', 'Delivered', 'PartiallyDelivered', 'Completed', 'Cancelled'];
```
新：
```ts
        // 2. 校验订单状态（白名单可配置；外卖单全程 PaymentSettled，由 dev-config 显式放行）
        const allowedStates = this.options?.allowedOrderStates?.length
            ? this.options.allowedOrderStates
            : ['Shipped', 'Delivered', 'PartiallyDelivered', 'Completed', 'Cancelled'];
```

替换 2 —— 窗口与送达门槛（原 L201-211）：

旧：
```ts
        // 3. 售后期窗口校验（默认 7 天无理由 + 15 天质量问题 = 22 天上限）。
        // 计时起点优先取交易完成时间 fulfillmentCompletedAt（阶段10 确认收货/自动完成落库），
        // 其次首次送达 fulfillmentDeliveredAt，最后回退订单 updatedAt。
        const maxDays = this.options?.maxDaysAfterDelivery ?? 7;
        const completedAt = (order.customFields as any)?.fulfillmentCompletedAt;
        const deliveredAt = (order.customFields as any)?.fulfillmentDeliveredAt;
        const orderDate = completedAt || deliveredAt || order.updatedAt || order.createdAt;
        const daysSince = (Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > maxDays + 15) {
            throw new UserInputError(`Cannot create after-sales: exceeded ${maxDays + 15} days limit`);
        }
```
新：
```ts
        // 3. 售后窗口校验：
        //    afterSalesWindowHours > 0 时按小时窗口（送达时间起算，外卖 24h 场景）；
        //    否则按 maxDays + 15 天质量问题延长逻辑。
        //    计时起点 fulfillmentCompletedAt → fulfillmentDeliveredAt → deliveredAt（外卖骑手送达落库）→ updatedAt。
        const cf: Record<string, any> = (order.customFields ?? {}) as any;
        const orderDate: Date = cf.fulfillmentCompletedAt || cf.fulfillmentDeliveredAt || cf.deliveredAt
            || order.updatedAt || order.createdAt;
        const windowHours = this.options?.afterSalesWindowHours ?? 0;
        if (windowHours > 0) {
            const hoursSince = (Date.now() - orderDate.getTime()) / (1000 * 60 * 60);
            if (hoursSince > windowHours) {
                throw new UserInputError(`Cannot create after-sales: exceeded ${windowHours}h window`);
            }
        } else {
            const maxDays = this.options?.maxDaysAfterDelivery ?? 7;
            const daysSince = (Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince > maxDays + 15) {
                throw new UserInputError(`Cannot create after-sales: exceeded ${maxDays + 15} days limit`);
            }
        }

        // 3.1 送达门槛（外卖场景）：requireOrderCustomField 指定的 customFields 字段必须等于指定值，
        //     防止未送达（deliveryStatus 空/assigned/in_progress）的已支付单走售后与取消链路双退款
        const gate = this.options?.requireOrderCustomField;
        if (gate?.field) {
            const actual = cf[gate.field];
            if (String(actual) !== String(gate.value)) {
                throw new UserInputError(
                    `Cannot create after-sales: order not eligible (${gate.field}=${actual ?? 'null'})`,
                );
            }
        }
```

替换 3 —— 整单查重（原 L232-243，`// 5. 重复售后校验` 起至 `const repo` 声明行）：

旧：
```ts
        // 5. 重复售后校验（同一 orderLineId 不能有未关闭的售后单）
        if (entityOrderLineId != null) {
            const repo = this.connection.getRepository(ctx, AfterSalesRequest);
            const existing = await repo.findOne({
                where: { orderLineId: entityOrderLineId as any, state: Not('Closed' as any) },
            });
            if (existing) {
                throw new UserInputError(`After-sales already exists for order line ${input.orderLineId}`);
            }
        }

        const repo = this.connection.getRepository(ctx, AfterSalesRequest);
```
新：
```ts
        // 5. 重复售后校验：整单售后（无 orderLineId）按订单查重；指定行按行查重（均排除 Closed，
        //    Rejected 也算占用——被拒单必须走申诉，不允许绕开仲裁重新提单）
        const repo = this.connection.getRepository(ctx, AfterSalesRequest);
        if (entityOrderLineId != null) {
            const existing = await repo.findOne({
                where: { orderLineId: entityOrderLineId as any, state: Not('Closed' as any) },
            });
            if (existing) {
                throw new UserInputError(`After-sales already exists for order line ${input.orderLineId}`);
            }
        } else {
            const existing = await repo.findOne({
                where: { orderId: entityOrderId as any, state: Not('Closed' as any) },
            });
            if (existing) {
                throw new UserInputError(`After-sales already exists for order ${input.orderId}`);
            }
        }
```

- [ ] **Step 3: 新建 e2e spec（创建侧用例）**

新建 `d:\zhao\vendure\packages\after-sales-plugin\e2e\after-sales-refund-only.e2e-spec.ts`：

```ts
import { createTestEnvironment, registerInitializer, SqljsInitializer } from '@vendure/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import gql from 'graphql-tag';
import { mergeConfig } from '@vendure/core';
import { initialData } from '../../../e2e-common/e2e-initial-data';
import { TEST_SETUP_TIMEOUT_MS, testConfig } from '../../../e2e-common/test-config';
import { AfterSalesPlugin } from '../src/plugin';
import { STATE_TRANSITIONS } from '../src/types';
import { InventoryPlugin } from '@vendure/inventory-plugin';
import { LogisticsPlugin } from '@vendure/logistics-plugin';
import { addPaymentToOrder, proceedToArrangingPayment } from '../../core/e2e/utils/test-order-utils';
import { singleStageRefundablePaymentMethod } from '../../core/e2e/fixtures/test-payment-methods';

registerInitializer('sqljs', new SqljsInitializer(path.join(__dirname, '__data__')));

const CREATE_REQ = gql`
    mutation($i: CreateAfterSalesRequestInput!) {
        createAfterSalesRequest(input: $i) { id state type refundAmount orderId }
    }
`;
const MY_REQS = gql`
    query { myAfterSalesRequests(options: { take: 10 }) { totalItems items { id state orderId } } }
`;

describe('AfterSalesPlugin · refund_only 外卖链路', () => {
    const { server, adminClient, shopClient } = createTestEnvironment(
        mergeConfig(testConfig(), {
            plugins: [
                AfterSalesPlugin.init({
                    allowedOrderStates: ['PaymentSettled'],
                    afterSalesWindowHours: 24,
                }),
                InventoryPlugin.init(),
                LogisticsPlugin.init(),
            ],
            paymentOptions: {
                // 单段可退款处理器：refundOrder 直接 Settled（真实网关主路径）
                paymentMethodHandlers: [singleStageRefundablePaymentMethod],
            },
        }),
    );

    let orderId: string;
    let orderTotal: number;

    beforeAll(async () => {
        await server.init({
            initialData: {
                ...initialData,
                paymentMethods: [
                    { name: singleStageRefundablePaymentMethod.code, handler: { code: singleStageRefundablePaymentMethod.code, arguments: [] } },
                ],
            },
            productsCsvPath: path.join(__dirname, '../../core/e2e/fixtures/e2e-products-minimal.csv'),
            customerCount: 1,
        });
        await adminClient.asSuperAdmin();
        await shopClient.asUserWithCredentials('hayden.zieme12@hotmail.com', 'test');
    }, TEST_SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await server.destroy();
    });

    it('状态机：Appealed/Approved→Received 转移合法', () => {
        expect(STATE_TRANSITIONS.Approved).toContain('Received');
        expect(STATE_TRANSITIONS.Rejected).toContain('Appealed');
        expect(STATE_TRANSITIONS.Appealed).toEqual(expect.arrayContaining(['Approved', 'Closed']));
        expect(STATE_TRANSITIONS.Appealed).not.toContain('Rejected');
    });

    it('下单（PaymentSettled 即可售后）', async () => {
        const { search } = await shopClient.query(gql`query { search(input: { take: 1 }) { items { productVariantId } } }`);
        const variantId = search.items[0].productVariantId;
        await shopClient.query(gql`mutation($v: ID!) { addItemToOrder(productVariantId: $v, quantity: 2) { ... on Order { id } } }`, { v: variantId });
        await proceedToArrangingPayment(shopClient);
        await addPaymentToOrder(shopClient, singleStageRefundablePaymentMethod);
        const { activeOrder } = await shopClient.query(gql`query { activeOrder { id state totalWithTax } }`);
        expect(activeOrder.state).toBe('PaymentSettled');
        orderId = activeOrder.id;
        orderTotal = activeOrder.totalWithTax;
    });

    it('创建整单 refund_only 售后 → Pending', async () => {
        const { createAfterSalesRequest: req } = await shopClient.query(CREATE_REQ, {
            i: { orderId, type: 'refund_only', reason: '少送', refundAmount: 500 },
        });
        expect(req.state).toBe('Pending');
        expect(req.type).toBe('refund_only');
    });

    it('同订单进行中重复创建被拒', async () => {
        await expect(
            shopClient.query(CREATE_REQ, { i: { orderId, type: 'refund_only', reason: '少送', refundAmount: 100 } }),
        ).rejects.toThrow(/already exists/);
    });

    it('退款金额超上限被拒（第二单）', async () => {
        const { search } = await shopClient.query(gql`query { search(input: { take: 1 }) { items { productVariantId } } }`);
        const variantId = search.items[0].productVariantId;
        await shopClient.query(gql`mutation($v: ID!) { addItemToOrder(productVariantId: $v, quantity: 1) { ... on Order { id } } }`, { v: variantId });
        await proceedToArrangingPayment(shopClient);
        await addPaymentToOrder(shopClient, singleStageRefundablePaymentMethod);
        const { activeOrder } = await shopClient.query(gql`query { activeOrder { id state totalWithTax } }`);
        await expect(
            shopClient.query(CREATE_REQ, {
                i: { orderId: activeOrder.id, type: 'refund_only', reason: '其他', refundAmount: activeOrder.totalWithTax + 100000 },
            }),
        ).rejects.toThrow(/exceeds max/);
    });
});
```

- [ ] **Step 4: 跑测试验证**

Run: `cd d:\zhao\vendure\packages\after-sales-plugin && npm test`
Expected: 新 spec 全 PASS（`npm test` = vitest run，include `**/*.e2e-spec.ts`，sqljs 内存库无需外部服务）。首次跑会下载/解压 sqljs 数据，属正常。

- [ ] **Step 5: Commit**

```bash
cd d:\zhao\vendure
git add packages/after-sales-plugin/src packages/after-sales-plugin/e2e/after-sales-refund-only.e2e-spec.ts
git commit -m "feat(after-sales): 状态机+Appealed 与 Approved→Received；外卖窗口/状态白名单/送达门槛选项；整单查重"
```

---

### Task 2: 插件——refund_only 审批即退款链 + C端申诉 + 平台仲裁

**Files:**
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales.service.ts:432-434`（approveRequest）
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\plugin.ts:45,132-142,253-266`（SDL）
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-shop.resolver.ts`
- Modify: `d:\zhao\vendure\packages\after-sales-plugin\src\after-sales-admin.resolver.ts`
- Test: `e2e\after-sales-refund-only.e2e-spec.ts`（追加用例）

- [ ] **Step 1: service——approveRequest 退款链 + refundOnlyChain**

替换（原 L432-434）：

旧：
```ts
    async approveRequest(ctx: RequestContext, id: ID): Promise<AfterSalesRequest> {
        return this.transitionState(ctx, id, 'Approved');
    }
```
新：
```ts
    async approveRequest(ctx: RequestContext, id: ID): Promise<AfterSalesRequest> {
        const repo = this.connection.getRepository(ctx, AfterSalesRequest);
        const request = await repo.findOne({ where: { id: id as any } });
        if (!request) throw new Error('Request not found');
        const saved = await this.transitionState(ctx, id, 'Approved');
        // refund_only（外卖）无需退货：审批通过（含 48h 自动同意）即链式 Received → 退款
        if ((request.type as string) === 'refund_only') {
            return this.refundOnlyChain(ctx, id);
        }
        return saved;
    }

    /** refund_only 退款链：Approved → Received（免退货直达）→ executeRefund。
     *  退款失败由 executeRefund 内部落 RefundFailed 可重试，不回滚已到达的 Received。 */
    private async refundOnlyChain(ctx: RequestContext, id: ID): Promise<AfterSalesRequest> {
        await this.transitionState(ctx, id, 'Received');
        const repo = this.connection.getRepository(ctx, AfterSalesRequest);
        const request = await repo.findOne({
            where: { id: id as any },
            relations: ['order', 'order.payments'] as any,
        });
        if (!request) throw new EntityNotFoundError('AfterSalesRequest', id);
        return this.executeRefund(ctx, request);
    }
```

- [ ] **Step 2: service——appealRequest 与 arbitrateRequest**

加在 `rejectRequest` 方法之后（L447 附近）：

```ts
    /** C 端申诉：Rejected → Appealed（仅本人售后单）；申诉说明落入协商留言流（customer），商家/平台可见 */
    async appealRequest(ctx: RequestContext, id: ID, note: string): Promise<AfterSalesRequest> {
        const customerId = await this.resolveCustomerId(ctx);
        if (!customerId) throw new UnauthorizedError();
        const repo = this.connection.getRepository(ctx, AfterSalesRequest);
        const request = await repo.findOne({ where: { id: id as any, customerId } });
        if (!request) throw new UserInputError(`After-sales request ${id} not found`);
        if (request.state !== 'Rejected') {
            throw new UserInputError(`Cannot appeal request in state: ${request.state}`);
        }
        if (note?.trim()) {
            await this.addMessage(ctx, id, 'customer', note.trim().slice(0, 1000));
        }
        return this.transitionState(ctx, id, 'Appealed');
    }

    /** 平台仲裁：Appealed → Approved（同意；refund_only 链式退款）| Closed（维持拒绝，note 必填写入 rejectReason） */
    async arbitrateRequest(ctx: RequestContext, id: ID, approve: boolean, note?: string): Promise<AfterSalesRequest> {
        const repo = this.connection.getRepository(ctx, AfterSalesRequest);
        const request = await repo.findOne({ where: { id: id as any } });
        if (!request) throw new Error('Request not found');
        if (request.state !== 'Appealed') {
            throw new Error(`Cannot arbitrate request in state: ${request.state}`);
        }
        if (!approve) {
            const text = (note ?? '').trim();
            if (!text) throw new UserInputError('维持拒绝必须填写仲裁说明');
            request.rejectReason = text;
            await repo.save(request);
            return this.transitionState(ctx, id, 'Closed');
        }
        if (note?.trim()) {
            // 仲裁说明落入协商留言流（admin 侧），C 端留言卡可见
            await this.addMessage(ctx, id, 'admin', note.trim().slice(0, 1000));
        }
        const saved = await this.transitionState(ctx, id, 'Approved');
        if ((request.type as string) === 'refund_only') {
            return this.refundOnlyChain(ctx, id);
        }
        return saved;
    }
```

- [ ] **Step 3: shop SDL + resolver——申诉 mutation**

`plugin.ts` shop SDL 枚举（原 L45）：

旧：
```ts
            enum AfterSalesState { Pending Approved Rejected Returning Received ExchangeShipped Refunded RefundFailed Closed }
```
新：
```ts
            enum AfterSalesState { Pending Approved Rejected Appealed Returning Received ExchangeShipped Refunded RefundFailed Closed }
```

shop SDL `extend type Mutation`（原 L141 `exchangeReceiveAfterSalesRequest` 之后）追加：

```ts
                """被拒后申诉：Rejected → Appealed（申诉说明进入协商留言流）"""
                appealAfterSalesRequest(id: ID!, note: String!): AfterSalesRequest!
```

`after-sales-shop.resolver.ts` —— 在 `cancelAfterSalesRequest` handler 之后镜像新增（装饰器风格与相邻 handler 一致）：

```ts
    @Mutation()
    @Allow(Permission.Authenticated)
    async appealAfterSalesRequest(
        @Ctx() ctx: RequestContext,
        @Arg('id', () => ID) id: ID,
        @Arg('note', () => String) note: string,
    ): Promise<AfterSalesRequest> {
        return this.afterSalesService.appealRequest(ctx, id, note);
    }
```

- [ ] **Step 4: admin SDL + resolver——仲裁 mutation**

admin SDL `extend type Mutation`（原 L265 `exchangeShipAfterSalesRequest` 之后）追加：

```ts
                """平台仲裁：Appealed → Approved（同意，refund_only 即退款）| Closed（维持拒绝，note 必填）"""
                arbitrateAfterSales(id: ID!, approve: Boolean!, note: String): AfterSalesRequestAdmin!
```

`after-sales-admin.resolver.ts` —— 在 `rejectAfterSalesRequest` handler 之后镜像新增（`@Allow` 与相邻审批 mutation 一致，用 `Permission.UpdateOrder`）：

```ts
    @Mutation()
    @Allow(Permission.UpdateOrder)
    async arbitrateAfterSales(
        @Ctx() ctx: RequestContext,
        @Arg('id', () => ID) id: ID,
        @Arg('approve', () => Boolean) approve: boolean,
        @Arg('note', () => String, { nullable: true }) note?: string,
    ): Promise<AfterSalesRequest> {
        return this.afterSalesService.arbitrateRequest(ctx, id, approve, note);
    }
```

- [ ] **Step 5: e2e 追加用例**

在 `after-sales-refund-only.e2e-spec.ts` 的 describe 末尾追加：

```ts
    const APPROVE = gql`mutation($i: ID!) { approveAfterSalesRequest(id: $i) { id state actualRefundAmount refundTransactionId } }`;
    const REJECT = gql`mutation($i: ID!, $r: String!) { rejectAfterSalesRequest(id: $i, reason: $r) { id state } }`;
    const APPEAL = gql`mutation($i: ID!, $n: String!) { appealAfterSalesRequest(id: $i, note: $n) { id state } }`;
    const ARBITRATE = gql`mutation($i: ID!, $a: Boolean!, $n: String) { arbitrateAfterSales(id: $i, approve: $a, note: $n) { id state rejectReason actualRefundAmount } }`;

    async function newPaidOrder(): Promise<string> {
        const { search } = await shopClient.query(gql`query { search(input: { take: 1 }) { items { productVariantId } } }`);
        const { addItemToOrder } = await shopClient.query(gql`mutation($v: ID!) { addItemToOrder(productVariantId: $v, quantity: 1) { ... on Order { id } } }`, { v: search.items[0].productVariantId });
        void addItemToOrder;
        await proceedToArrangingPayment(shopClient);
        await addPaymentToOrder(shopClient, singleStageRefundablePaymentMethod);
        const { activeOrder } = await shopClient.query(gql`query { activeOrder { id state } }`);
        return activeOrder.id;
    }

    it('商家审批 refund_only → 链式退款直达 Refunded', async () => {
        const oid = await newPaidOrder();
        const { createAfterSalesRequest: req } = await shopClient.query(CREATE_REQ, {
            i: { orderId: oid, type: 'refund_only', reason: '餐损洒漏', refundAmount: 300 },
        });
        const { approveAfterSalesRequest } = await adminClient.query(APPROVE, { i: req.id });
        expect(approveAfterSalesRequest.state).toBe('Refunded');
        expect(approveAfterSalesRequest.actualRefundAmount).toBe(300);
    });

    it('商家拒绝 → 申诉 Appealed → 仲裁同意 → Refunded', async () => {
        const oid = await newPaidOrder();
        const { createAfterSalesRequest: req } = await shopClient.query(CREATE_REQ, {
            i: { orderId: oid, type: 'refund_only', reason: '错送', refundAmount: 200 },
        });
        const rejected = await adminClient.query(REJECT, { i: req.id, r: '已足量出餐' });
        expect(rejected.rejectAfterSalesRequest.state).toBe('Rejected');
        const appealed = await shopClient.query(APPEAL, { i: req.id, n: '收到的与下单不符，有照片' });
        expect(appealed.appealAfterSalesRequest.state).toBe('Appealed');
        const arbitrated = await adminClient.query(ARBITRATE, { i: req.id, a: true, n: '凭证有效，同意退款' });
        expect(arbitrated.arbitrateAfterSales.state).toBe('Refunded');
    });

    it('仲裁维持拒绝：无 note 报错；带 note → Closed 且 rejectReason 更新', async () => {
        const oid = await newPaidOrder();
        const { createAfterSalesRequest: req } = await shopClient.query(CREATE_REQ, {
            i: { orderId: oid, type: 'refund_only', reason: '其他', refundAmount: 100 },
        });
        await adminClient.query(REJECT, { i: req.id, r: '出餐记录正常' });
        await shopClient.query(APPEAL, { i: req.id, n: '不认可' });
        await expect(adminClient.query(ARBITRATE, { i: req.id, a: false, n: '' })).rejects.toThrow(/必须填写/);
        const closed = await adminClient.query(ARBITRATE, { i: req.id, a: false, n: '双方凭证不足以支持退款' });
        expect(closed.arbitrateAfterSales.state).toBe('Closed');
        expect(closed.arbitrateAfterSales.rejectReason).toBe('双方凭证不足以支持退款');
    });

    it('非 Rejected 态申诉被拒', async () => {
        const oid = await newPaidOrder();
        const { createAfterSalesRequest: req } = await shopClient.query(CREATE_REQ, {
            i: { orderId: oid, type: 'refund_only', reason: '少送', refundAmount: 100 },
        });
        await expect(shopClient.query(APPEAL, { i: req.id, n: 'x' })).rejects.toThrow(/Cannot appeal/);
    });
```

- [ ] **Step 6: 跑测试 + 构建 + 提交**

Run: `npm test`（插件目录）。Expected: 上一 Task 用例 + 新 4 例全 PASS。
Run: `npm run build`。Expected: `lib/` 重建无报错。

```bash
cd d:\zhao\vendure
git add packages/after-sales-plugin/src
git commit -m "feat(after-sales): refund_only 审批即退款链 + C端申诉 appealAfterSalesRequest + 平台仲裁 arbitrateAfterSales"
```

---

### Task 3: dev-config 接线 + vendure 部署上线

**Files:**
- Modify: `d:\zhao\vendure\packages\dev-server\dev-config.ts:463`

- [ ] **Step 1: dev-config 修改 init 参数**

旧：
```ts
        AfterSalesPlugin.init(),
```
新：
```ts
        AfterSalesPlugin.init({
            afterSalesWindowHours: 24,         // 外卖售后窗口：送达后 24h
            afterSalesAutoApproveHours: 48,    // Pending 48h 未审自动同意并退款
            afterSalesRefundAutoRetry: 1,      // 退款失败自动重试 1 次
            allowedOrderStates: ['PaymentSettled', 'Delivered'], // 外卖单全程 PaymentSettled，确认收货后 Delivered
            requireOrderCustomField: { field: 'deliveryStatus', value: 'delivered' }, // 仅骑手送达后可售后
        }),
```

- [ ] **Step 2: 构建 + 提交推送**

Run: `cd d:\zhao\vendure\packages\after-sales-plugin && npm run build`
Run（vendure 根目录）：

```bash
git add packages/dev-server/dev-config.ts
git commit -m "chore(after-sales): 外卖售后接线——24h窗口/48h自动同意/送达门槛"
git push
```

- [ ] **Step 3: 服务器部署**

```bash
ssh joho "cd /www/apps/vendure && sudo -u <运行用户> git pull --ff-only && pm2 restart vendure"
```
（运行用户以服务器现状为准；若直接 root 操作则去 sudo。pm2 restart 后启动需 ~6 分钟，期间无日志属正常。）

- [ ] **Step 4: 探针验证新接口上线**

Run:
```powershell
'{"query":"query { __schema { mutationType { name } } }"}' | Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as_p.json"; curl.exe -s -X POST "https://www.yourbao.cn/shop-api" -H "Content-Type: application/json" -H "vendure-token: canteen-a-token" --data-binary "@$env:TEMP\as_p.json"
```
等待 3020 监听（`ssh joho "ss -tln | grep 3020"`）后，探针：
```powershell
'{"query":"mutation { appealAfterSalesRequest(id:\"0\", note:\"x\") { id } }"}' | Set-Content -Encoding utf8 -NoNewline "$env:TEMP\as_p2.json"; curl.exe -s -X POST "https://www.yourbao.cn/shop-api" -H "Content-Type: application/json" -H "vendure-token: canteen-a-token" --data-binary "@$env:TEMP\as_p2.json"
```
Expected: 返回 FORBIDDEN/未登录类错误（说明 mutation 已注册），**不能**是 "Cannot query field"。

- [ ] **Step 5: Commit（waimai 仓库无需变更；本 Task 全部在 vendure 仓库）**

---

### Task 4: waimai API 层 + pages.json 注册

**Files:**
- Create: `d:\zhao\waimai\src\api\queries\afterSale.ts`
- Modify: `d:\zhao\waimai\src\pages.json:14-19`

- [ ] **Step 1: 新建 src/api/queries/afterSale.ts**

```ts
import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

const FIELDS = `
    id orderId orderLineId type state reason description evidenceImages
    refundAmount rejectReason refundTransactionId actualRefundAmount refundedAt refundError
    createdAt updatedAt messageCount
    order { id code totalWithTax }
`;

const MY_REQUESTS = gql`
    query myAfterSalesRequests($options: AfterSalesRequestListOptions) {
        myAfterSalesRequests(options: $options) { totalItems items { ${FIELDS} } }
    }
`;
const REQUEST_DETAIL = gql`
    query afterSalesRequest($id: ID!) { afterSalesRequest(id: $id) { ${FIELDS} } }
`;
const REQUEST_MESSAGES = gql`
    query afterSalesMessages($id: ID!, $options: AfterSalesMessageListOptions) {
        afterSalesMessages(id: $id, options: $options) { totalItems items { id senderType senderName content images createdAt } }
    }
`;
const CREATE = gql`
    mutation createAfterSalesRequest($input: CreateAfterSalesRequestInput!) {
        createAfterSalesRequest(input: $input) { ${FIELDS} }
    }
`;
const CANCEL = gql`
    mutation cancelAfterSalesRequest($id: ID!) { cancelAfterSalesRequest(id: $id) { ${FIELDS} } }
`;
const APPEAL = gql`
    mutation appealAfterSalesRequest($id: ID!, $note: String!) {
        appealAfterSalesRequest(id: $id, note: $note) { ${FIELDS} }
    }
`;
const ADD_MESSAGE = gql`
    mutation addAfterSalesMessage($id: ID!, $content: String!, $images: [String!]) {
        addAfterSalesMessage(id: $id, content: $content, images: $images) { id content createdAt }
    }
`;

export interface AfterSaleRequest {
    id: string;
    orderId: string;
    state: string;
    type: string;
    reason: string;
    description?: string | null;
    evidenceImages?: string[] | null;
    refundAmount: number;
    rejectReason?: string | null;
    refundTransactionId?: string | null;
    actualRefundAmount?: number | null;
    refundedAt?: string | null;
    refundError?: string | null;
    createdAt: string;
    updatedAt: string;
    messageCount?: number;
    order?: { id: string; code: string; totalWithTax: number };
}

export async function fetchMyAfterSales(): Promise<AfterSaleRequest[]> {
    const r = await getGraphQLClient().request(MY_REQUESTS, { options: { skip: 0, take: 20 } });
    return r?.myAfterSalesRequests?.items ?? [];
}
export async function fetchAfterSaleDetail(id: string): Promise<AfterSaleRequest | null> {
    const r = await getGraphQLClient().request(REQUEST_DETAIL, { id });
    return r?.afterSalesRequest ?? null;
}
export async function fetchAfterSaleMessages(id: string): Promise<any[]> {
    const r = await getGraphQLClient().request(REQUEST_MESSAGES, { id, options: { skip: 0, take: 50 } });
    return r?.afterSalesMessages?.items ?? [];
}
export async function createAfterSale(input: {
    orderId: string; type: string; reason: string; description?: string;
    evidenceImages?: string[]; refundAmount: number;
}): Promise<AfterSaleRequest> {
    const r = await getGraphQLClient().request(CREATE, { input });
    return r?.createAfterSalesRequest;
}
export async function cancelAfterSale(id: string): Promise<AfterSaleRequest> {
    const r = await getGraphQLClient().request(CANCEL, { id });
    return r?.cancelAfterSalesRequest;
}
export async function appealAfterSale(id: string, note: string): Promise<AfterSaleRequest> {
    const r = await getGraphQLClient().request(APPEAL, { id, note });
    return r?.appealAfterSalesRequest;
}
export async function addAfterSaleMessage(id: string, content: string, images?: string[]): Promise<any> {
    const r = await getGraphQLClient().request(ADD_MESSAGE, { id, content, images: images ?? null });
    return r?.addAfterSalesMessage;
}
```

- [ ] **Step 2: pages.json pkg-order 注册**

`src/pages.json` pkg-order pages 数组（L14-19）末尾追加两行：

```json
                { "path": "pages/after-sale-create", "style": { "navigationBarTitleText": "申请售后" } },
                { "path": "pages/after-sale-detail", "style": { "navigationBarTitleText": "售后详情" } }
```

- [ ] **Step 3: Commit**

```bash
cd d:\zhao\waimai
git add src/api/queries/afterSale.ts src/pages.json
git commit -m "feat(after-sale): C端售后 API 层 + 页面注册"
```

---

### Task 5: after-sale-create.vue（版式 A 清单勾选式）

**Files:**
- Create: `d:\zhao\waimai\src\pkg-order\pages\after-sale-create.vue`

- [ ] **Step 1: 页面实现**

```vue
<template>
  <view class="as-create" v-if="order">
    <!-- 退款方式切换 -->
    <view class="mode-tabs">
      <view class="mode-tab" :class="{ on: mode === 'order' }" @tap="mode = 'order'">整单退款</view>
      <view class="mode-tab" :class="{ on: mode === 'lines' }" @tap="mode = 'lines'">部分退款</view>
    </view>

    <!-- 商品清单（部分退款：勾选 + 数量步进） -->
    <view class="section" v-if="mode === 'lines'">
      <text class="section__title">选择退款商品</text>
      <view v-for="line in order.lines" :key="line.id" class="line">
        <view class="line__check" :class="{ on: checked[line.id] > 0 }" @tap="toggleLine(line)">
          <text v-if="checked[line.id] > 0">✓</text>
        </view>
        <VImage :src="line.featuredAsset?.preview || ''" width="120rpx" height="120rpx" />
        <view class="line__info">
          <text class="line__name">{{ line.productVariant?.name }}</text>
          <text class="line__price">¥{{ (line.unitPriceWithTax / 100).toFixed(2) }}</text>
        </view>
        <view class="stepper" v-if="checked[line.id] > 0">
          <view class="stepper__btn" @tap="stepQty(line, -1)">−</view>
          <text class="stepper__num">{{ checked[line.id] }}</text>
          <view class="stepper__btn" @tap="stepQty(line, 1)">＋</view>
        </view>
      </view>
    </view>

    <!-- 金额 -->
    <view class="section amount">
      <text class="section__title">预计退款金额</text>
      <text class="amount__num">¥{{ (refundAmount / 100).toFixed(2) }}</text>
      <text class="amount__tip">{{ mode === 'order' ? '整单退款（含配送费），提交后不可修改' : '按所选商品行自动计算，不可手填' }}</text>
    </view>

    <!-- 原因 -->
    <view class="section">
      <text class="section__title">售后原因</text>
      <view class="chips">
        <text
          v-for="r in REASONS" :key="r"
          class="chip" :class="{ on: reason === r }"
          @tap="reason = r"
        >{{ r }}</text>
      </view>
      <textarea class="desc" v-model="userDesc" placeholder="补充说明（选填）：如缺少的商品、损坏情况" maxlength="200" />
    </view>

    <!-- 凭证（部分退款必传 1-3 张；整单可选） -->
    <view class="section">
      <text class="section__title">凭证照片{{ mode === 'lines' ? '（必传 1-3 张）' : '（选填）' }}</text>
      <view class="evidence">
        <view v-for="(img, i) in evidence" :key="img" class="evidence__item">
          <image :src="img" mode="aspectFill" class="evidence__img" />
          <text class="evidence__del" @tap="evidence.splice(i, 1)">×</text>
        </view>
        <view v-if="evidence.length < 3" class="evidence__add" @tap="chooseEvidence">＋</view>
      </view>
    </view>

    <view class="notice">提交后商家将在 48 小时内处理；超时未处理将自动原路退回</view>
    <view class="footbar">
      <button class="submit" :disabled="submitting" @tap="submit">{{ submitting ? '提交中…' : '提交申请' }}</button>
    </view>
  </view>
  <LoadingSkeleton v-else type="card" :count="2" />
</template>
<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getOrderByCode } from '../../api/queries/order';
import { createAfterSale } from '../../api/queries/afterSale';
import { uploadCustomerAsset } from '../../api/mutations/upload';
import VImage from '../../components/VImage.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';

const REASONS = ['漏送', '错送', '少送', '餐损洒漏', '其他'];
const order = ref<any>(null);
const mode = ref<'order' | 'lines'>('order');
const checked = reactive<Record<string, number>>({});
const reason = ref('');
const userDesc = ref('');
const evidence = ref<string[]>([]);
const submitting = ref(false);

const refundAmount = computed(() => {
    if (!order.value) return 0;
    if (mode.value === 'order') return order.value.totalWithTax;
    return order.value.lines.reduce((s: number, l: any) => {
        const qty = checked.value ? checked[l.id] || 0 : 0;
        if (!qty) return s;
        // 按行实付均摊（proratedLinePrice 含行级优惠分摊），防整数溢出用 floor
        return s + Math.floor((l.proratedLinePrice * qty) / l.quantity);
    }, 0);
});

onLoad(async (options: any) => {
    if (!options?.code) return;
    try {
        const res: any = await getOrderByCode(options.code);
        order.value = res.orderByCode;
    } catch (e) {
        uni.showToast({ title: '订单加载失败', icon: 'none' });
    }
});

function toggleLine(line: any) {
    if (checked[line.id] > 0) checked[line.id] = 0;
    else checked[line.id] = line.quantity;
}
function stepQty(line: any, d: number) {
    const next = (checked[line.id] || 0) + d;
    checked[line.id] = Math.max(0, Math.min(line.quantity, next));
}

async function chooseEvidence() {
    const res: any = await uni.chooseImage({ count: 3 - evidence.value.length });
    const paths: string[] = res.tempFilePaths || [];
    for (const p of paths) {
        try {
            const asset = await uploadCustomerAsset(p);
            evidence.value.push(asset.preview);
        } catch (e: any) {
            uni.showToast({ title: e?.message || '上传失败', icon: 'none' });
        }
    }
}

async function submit() {
    if (!order.value) return;
    if (!reason.value) return uni.showToast({ title: '请选择售后原因', icon: 'none' });
    if (refundAmount.value <= 0) return uni.showToast({ title: '请先选择退款商品', icon: 'none' });
    if (mode.value === 'lines' && evidence.value.length === 0) {
        return uni.showToast({ title: '部分退款需上传 1-3 张凭证', icon: 'none' });
    }
    const linesDesc = mode.value === 'lines'
        ? '部分退款：' + order.value.lines
              .filter((l: any) => checked[l.id] > 0)
              .map((l: any) => `${l.productVariant?.name}×${checked[l.id]}`)
              .join('；') + '\n'
        : '整单退款\n';
    submitting.value = true;
    try {
        const req = await createAfterSale({
            orderId: String(order.value.id),
            type: 'refund_only',
            reason: reason.value,
            description: linesDesc + (userDesc.value || ''),
            evidenceImages: evidence.value.length ? evidence.value : undefined,
            refundAmount: refundAmount.value,
        });
        uni.redirectTo({ url: `/pkg-order/pages/after-sale-detail?id=${req.id}` });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || e?.message || '提交失败', icon: 'none' });
    } finally {
        submitting.value = false;
    }
}
</script>
<style lang="scss" scoped>
.as-create { padding: 20rpx 20rpx 200rpx; }
.mode-tabs { display: flex; gap: 16rpx; margin-bottom: 20rpx;
  .mode-tab { flex: 1; text-align: center; padding: 20rpx 0; border-radius: $radius-md; background: #fff; font-size: 28rpx; color: $text-color-secondary; border: 2rpx solid $border-color;
    &.on { color: $brand-color; border-color: $brand-color; background: #fff7f2; font-weight: bold; } } }
.section { background: #fff; border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx;
  &__title { font-size: 28rpx; font-weight: bold; display: block; margin-bottom: 16rpx; } }
.line { display: flex; align-items: center; gap: 16rpx; padding: 16rpx 0; border-bottom: 1rpx solid #f5f5f5;
  &:last-child { border-bottom: none; }
  &__check { width: 40rpx; height: 40rpx; border-radius: 8rpx; border: 2rpx solid #ddd; display: flex; align-items: center; justify-content: center; font-size: 24rpx; color: #fff; flex-shrink: 0;
    &.on { background: $brand-color; border-color: $brand-color; } }
  &__info { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
  &__name { font-size: 26rpx; }
  &__price { font-size: 24rpx; color: $price-color; } }
.stepper { display: flex; align-items: center; gap: 16rpx;
  &__btn { width: 48rpx; height: 48rpx; border-radius: 8rpx; background: #f5f5f5; display: flex; align-items: center; justify-content: center; font-size: 28rpx; }
  &__num { font-size: 26rpx; min-width: 40rpx; text-align: center; } }
.amount { display: flex; flex-direction: column;
  &__num { font-size: 48rpx; font-weight: bold; color: $price-color; }
  &__tip { font-size: 22rpx; color: $text-color-secondary; margin-top: 8rpx; } }
.chips { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 16rpx;
  .chip { font-size: 26rpx; padding: 12rpx 28rpx; border-radius: 999rpx; background: #f5f5f5; color: $text-color-secondary;
    &.on { background: #fff7f2; color: $brand-color; border: 1rpx solid $brand-color; } } }
.desc { width: 100%; box-sizing: border-box; min-height: 140rpx; background: #f8f8f8; border-radius: $radius-md; padding: 16rpx; font-size: 26rpx; }
.evidence { display: flex; gap: 16rpx; flex-wrap: wrap;
  &__item { position: relative; }
  &__img { width: 160rpx; height: 160rpx; border-radius: $radius-md; }
  &__del { position: absolute; top: -12rpx; right: -12rpx; width: 40rpx; height: 40rpx; background: rgba(0,0,0,.6); color: #fff; border-radius: 50%; text-align: center; line-height: 40rpx; font-size: 24rpx; }
  &__add { width: 160rpx; height: 160rpx; border: 2rpx dashed #ddd; border-radius: $radius-md; display: flex; align-items: center; justify-content: center; font-size: 48rpx; color: #ccc; } }
.notice { font-size: 22rpx; color: $text-color-secondary; text-align: center; padding: 8rpx 0 20rpx; }
.footbar { position: fixed; left: 0; right: 0; bottom: 0; padding: 16rpx 20rpx calc(16rpx + env(safe-area-inset-bottom)); background: #fff;
  .submit { background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 30rpx;
    &:disabled { opacity: .5; } } }
</style>
```

- [ ] **Step 2: 本地构建验证**

Run: `cd d:\zhao\waimai && pnpm build:h5`
Expected: 构建成功，`dist/build/h5` 出现 after-sale-create chunk。

- [ ] **Step 3: Commit**

```bash
cd d:\zhao\waimai
git add src/pkg-order/pages/after-sale-create.vue
git commit -m "feat(after-sale): 售后创建页——整单/部分双模式清单勾选+金额自动计算+凭证上传"
```

---

### Task 6: after-sale-detail.vue（状态卡 + 步骤条 + 申诉 + 留言）

**Files:**
- Create: `d:\zhao\waimai\src\pkg-order\pages\after-sale-detail.vue`

- [ ] **Step 1: 页面实现**

```vue
<template>
  <view class="as-detail" v-if="req">
    <!-- 状态卡 -->
    <view class="status-card">
      <text class="status-card__state">{{ stateLabel }}</text>
      <text class="status-card__hint">{{ stateHint }}</text>
      <text class="status-card__amount" v-if="req.state === 'Refunded'">¥{{ ((req.actualRefundAmount ?? req.refundAmount) / 100).toFixed(2) }} 已原路退回</text>
    </view>

    <!-- 四段步骤条：提交申请 → 商家审核 → 平台仲裁 → 完成 -->
    <view class="section">
      <view class="steps">
        <view v-for="(s, i) in steps" :key="s.key" class="step" :class="{ 'step--done': s.done, 'step--active': i === activeStep }">
          <view class="step__dot"><text v-if="s.done">✓</text></view>
          <text class="step__label">{{ s.label }}</text>
        </view>
      </view>
    </view>

    <!-- 被拒理由 / 申诉 -->
    <view class="section reject" v-if="req.state === 'Rejected' || req.state === 'Closed' && req.rejectReason">
      <text class="section__title">商家拒绝理由</text>
      <text class="reject__text">{{ req.rejectReason }}</text>
      <template v-if="req.state === 'Rejected'">
        <textarea v-if="appealOpen" class="reject__input" v-model="appealNote" placeholder="填写申诉说明：为什么您认为应该退款（必填）" maxlength="200" />
        <button v-if="!appealOpen" class="btn ghost" @tap="appealOpen = true">申请平台仲裁</button>
        <button v-else class="btn" :disabled="appealing" @tap="doAppeal">{{ appealing ? '提交中…' : '提交仲裁申请' }}</button>
      </template>
    </view>

    <!-- 退款信息 -->
    <view class="section">
      <text class="section__title">退款信息</text>
      <view class="kv"><text>申请编号</text><text>售后 #{{ req.id }}</text></view>
      <view class="kv"><text>售后原因</text><text>{{ req.reason }}</text></view>
      <view class="kv"><text>预计退款</text><text class="money">¥{{ (req.refundAmount / 100).toFixed(2) }}</text></view>
      <view class="kv" v-if="req.refundedAt"><text>退款时间</text><text>{{ fmtTime(req.refundedAt) }}</text></view>
      <view class="kv" v-if="req.refundTransactionId"><text>退款单号</text><text>{{ req.refundTransactionId }}</text></view>
      <view class="kv" v-if="req.refundError"><text>失败原因</text><text class="err">{{ req.refundError }}</text></view>
      <text class="desc" v-if="req.description">{{ req.description }}</text>
      <view class="evidence" v-if="req.evidenceImages?.length">
        <image v-for="img in req.evidenceImages" :key="img" :src="img" mode="aspectFill" class="evidence__img" @tap="preview(img)" />
      </view>
    </view>

    <!-- 留言卡 -->
    <view class="section">
      <text class="section__title">协商留言</text>
      <view v-if="!messages.length" class="msg-empty">暂无留言</view>
      <view v-for="m in messages" :key="m.id" class="msg" :class="{ 'msg--mine': m.senderType === 'customer' }">
        <text class="msg__name">{{ m.senderType === 'customer' ? '我' : m.senderName }}</text>
        <text class="msg__content">{{ m.content }}</text>
        <text class="msg__time">{{ fmtTime(m.createdAt) }}</text>
      </view>
      <view class="msg-input" v-if="req.state !== 'Closed'">
        <input v-model="msgContent" placeholder="输入留言…" confirm-type="send" @confirm="sendMsg" />
        <button class="btn small" :disabled="msgSending || !msgContent" @tap="sendMsg">发送</button>
      </view>
      <text v-else class="msg-closed">售后单已关闭，无法继续留言</text>
    </view>

    <!-- 操作区 -->
    <view class="footbar" v-if="req.state === 'Pending'">
      <button class="btn ghost" @tap="doCancel">撤销申请</button>
    </view>
  </view>
  <LoadingSkeleton v-else type="card" :count="2" />
</template>
<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
    fetchAfterSaleDetail, fetchAfterSaleMessages, cancelAfterSale,
    appealAfterSale, addAfterSaleMessage, AfterSaleRequest,
} from '../../api/queries/afterSale';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';

const req = ref<AfterSaleRequest | null>(null);
const messages = ref<any[]>([]);
const appealOpen = ref(false);
const appealNote = ref('');
const appealing = ref(false);
const msgContent = ref('');
const msgSending = ref(false);

const STATE_MAP: Record<string, { label: string; hint: string }> = {
    Pending:      { label: '商家审核中', hint: '商家将在 48 小时内处理，超时自动同意退款' },
    Approved:     { label: '商家已同意', hint: '退款处理中，将原路退回' },
    Received:     { label: '待退款', hint: '退款处理中，将原路退回' },
    Refunded:     { label: '已退款', hint: '退款已原路退回，请留意到账' },
    RefundFailed: { label: '退款失败处理中', hint: '系统将自动重试退款' },
    Rejected:     { label: '商家已拒绝', hint: '如不认可拒绝理由，可申请平台仲裁' },
    Appealed:     { label: '平台仲裁中', hint: '平台将根据双方凭证尽快仲裁' },
    Closed:       { label: '已关闭', hint: '售后单已关闭' },
};
const stateLabel = computed(() => STATE_MAP[req.value?.state ?? '']?.label ?? req.value?.state ?? '');
const stateHint = computed(() => STATE_MAP[req.value?.state ?? '']?.hint ?? '');

// 四段步骤条：提交申请 → 商家审核 → 平台仲裁 → 完成
const steps = computed(() => {
    const st = req.value?.state ?? '';
    const done = (k: string) => ({
        key: k,
        label: k === 'submit' ? '提交申请' : k === 'review' ? '商家审核' : k === 'arbitrate' ? '平台仲裁' : '完成',
        done: false,
    });
    const list = [done('submit'), done('review'), done('arbitrate'), done('finish')];
    list[0].done = true;
    list[1].done = ['Approved', 'Received', 'Refunded', 'RefundFailed', 'Rejected', 'Appealed', 'Closed'].includes(st);
    list[2].done = ['Refunded', 'Closed'].includes(st) || st === 'Appealed';
    list[3].done = ['Refunded', 'Closed'].includes(st);
    return list;
});
const activeStep = computed(() => {
    const idx = steps.value.findIndex(s => !s.done);
    return idx === -1 ? steps.value.length - 1 : idx;
});

let timer: ReturnType<typeof setInterval> | null = null;
const TERMINAL = ['Refunded', 'Closed', 'Rejected'];

onLoad(async (options: any) => {
    if (!options?.id) return;
    await refresh();
    timer = setInterval(refresh, 8000); // 非终态 8s 轮询
});
onUnmounted(() => { if (timer) clearInterval(timer); });

async function refresh() {
    try {
        req.value = await fetchAfterSaleDetail(String(req.value?.id ?? getCurrentPageId()));
        if (TERMINAL.includes(req.value?.state ?? '')) { if (timer) { clearInterval(timer); timer = null; } }
        messages.value = await fetchAfterSaleMessages(String(req.value.id)).catch(() => messages.value);
    } catch (e) { /* 网络抖动静默重试 */ }
}
function getCurrentPageId(): string {
    const pages = getCurrentPages(); const page = pages[pages.length - 1] as any;
    return page?.options?.id ?? '';
}

function fmtTime(t?: string | null) { return t ? new Date(t).toLocaleString('zh-CN') : ''; }
function preview(url: string) { uni.previewImage({ urls: [url] }); }

function doCancel() {
    uni.showModal({
        title: '撤销申请', content: '确定撤销本次售后申请？',
        success: async (r: any) => {
            if (!r.confirm) return;
            try {
                req.value = await cancelAfterSale(String(req.value!.id));
                uni.showToast({ title: '已撤销', icon: 'success' });
            } catch (e: any) {
                uni.showToast({ title: e?.response?.errors?.[0]?.message || e?.message || '撤销失败', icon: 'none' });
            }
        },
    });
}
async function doAppeal() {
    if (!appealNote.value.trim()) return uni.showToast({ title: '请填写申诉说明', icon: 'none' });
    appealing.value = true;
    try {
        req.value = await appealAfterSale(String(req.value!.id), appealNote.value.trim());
        appealOpen.value = false;
        uni.showToast({ title: '已提交平台仲裁', icon: 'success' });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || e?.message || '申诉失败', icon: 'none' });
    } finally { appealing.value = false; }
}
async function sendMsg() {
    if (!msgContent.value.trim()) return;
    msgSending.value = true;
    try {
        const m = await addAfterSaleMessage(String(req.value!.id), msgContent.value.trim());
        messages.value.push(m);
        msgContent.value = '';
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || e?.message || '发送失败', icon: 'none' });
    } finally { msgSending.value = false; }
}
</script>
<style lang="scss" scoped>
.as-detail { padding: 20rpx 20rpx 160rpx; }
.status-card { background: linear-gradient(135deg, $brand-color, #ff9966); border-radius: $radius-md; padding: 40rpx 30rpx; color: #fff; margin-bottom: 20rpx;
  &__state { font-size: 36rpx; font-weight: bold; display: block; }
  &__hint { font-size: 24rpx; opacity: .85; margin-top: 8rpx; display: block; }
  &__amount { font-size: 30rpx; margin-top: 12rpx; display: block; font-weight: bold; } }
.section { background: #fff; border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx;
  &__title { font-size: 28rpx; font-weight: bold; display: block; margin-bottom: 16rpx; } }
.steps { display: flex;
  .step { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx;
    &__dot { width: 40rpx; height: 40rpx; border-radius: 50%; background: #eee; color: #fff; font-size: 22rpx; display: flex; align-items: center; justify-content: center; }
    &__label { font-size: 22rpx; color: #999; }
    &--done .step__dot { background: $brand-color; }
    &--done .step__label { color: $text-color; }
    &--active .step__dot { background: $brand-color; box-shadow: 0 0 0 8rpx rgba(255,102,0,.15); }
    &--active .step__label { color: $brand-color; font-weight: bold; } } }
.reject__text { font-size: 26rpx; color: #e02020; display: block; margin-bottom: 16rpx; }
.reject__input { width: 100%; box-sizing: border-box; min-height: 120rpx; background: #f8f8f8; border-radius: $radius-md; padding: 16rpx; font-size: 26rpx; margin-bottom: 16rpx; }
.kv { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 26rpx; color: $text-color-secondary;
  .money { color: $price-color; font-weight: bold; }
  .err { color: #e02020; } }
.desc { font-size: 24rpx; color: $text-color-secondary; display: block; margin-top: 8rpx; white-space: pre-wrap; }
.evidence { display: flex; gap: 16rpx; flex-wrap: wrap; margin-top: 16rpx;
  &__img { width: 140rpx; height: 140rpx; border-radius: $radius-md; } }
.msg { margin-bottom: 16rpx; display: flex; flex-direction: column; gap: 4rpx; align-items: flex-start;
  &--mine { align-items: flex-end; }
  &__name { font-size: 20rpx; color: #999; }
  &__content { font-size: 26rpx; background: #f7f7f7; border-radius: 12rpx; padding: 12rpx 20rpx; max-width: 80%; }
  &--mine .msg__content { background: #fff7f2; }
  &__time { font-size: 20rpx; color: #ccc; }
  &-empty { font-size: 24rpx; color: #999; }
  &-closed { font-size: 22rpx; color: #999; } }
.msg-input { display: flex; gap: 16rpx; margin-top: 8rpx;
  input { flex: 1; background: #f7f7f7; border-radius: 999rpx; padding: 12rpx 24rpx; font-size: 26rpx; } }
.btn { background: $brand-color; color: #fff; border-radius: 999rpx; font-size: 28rpx; margin-top: 8rpx;
  &.ghost { background: #fff; color: $brand-color; border: 1rpx solid $brand-color; }
  &.small { margin-top: 0; font-size: 26rpx; padding: 0 28rpx; }
  &:disabled { opacity: .5; } }
.footbar { position: fixed; left: 0; right: 0; bottom: 0; padding: 16rpx 20rpx calc(16rpx + env(safe-area-inset-bottom)); background: #fff; }
</style>
```

- [ ] **Step 2: 构建 + Commit**

Run: `pnpm build:h5` 验证无编译错误。

```bash
cd d:\zhao\waimai
git add src/pkg-order/pages/after-sale-detail.vue
git commit -m "feat(after-sale): 售后详情页——四段步骤条+申诉仲裁入口+退款信息+协商留言"
```

---

### Task 7: order-detail.vue 改造——激活售后入口 + 售后状态卡

**Files:**
- Modify: `d:\zhao\waimai\src\pkg-order\pages\order-detail.vue:133-140,202-210,258-269,385-386`

- [ ] **Step 1: 模板——按钮与售后状态卡**

L133-140 actions 区，替换 L135 申请售后按钮：

旧：
```html
      <button v-if="canAfterSale" class="action-btn" @click="notOpen">申请售后</button>
```
新：
```html
      <button v-if="canAfterSale" class="action-btn" @click="goAfterSale">申请售后</button>
```

在异常赔付提示条（L8-17 `exc-banner` view）之后插入售后状态卡：

```html
    <!-- 售后状态卡：存在售后单时展示摘要，点击进详情；进行中售后单隐藏「申请售后」入口 -->
    <view class="section as-card" v-if="afterSale" @tap="goAfterSaleDetail">
      <view class="as-card__row">
        <text class="as-card__title">售后 {{ asStateLabel }}</text>
        <text class="as-card__amount">¥{{ ((afterSale.actualRefundAmount ?? afterSale.refundAmount) / 100).toFixed(2) }}</text>
      </view>
      <text class="as-card__sub">{{ afterSale.reason }} · 提交于 {{ formatTime(afterSale.createdAt) }}，点击查看详情 ›</text>
    </view>
```

- [ ] **Step 2: 脚本——import、状态、computed、方法**

import 区（L146 附近）追加：

```ts
import { fetchMyAfterSales, AfterSaleRequest } from '../../api/queries/afterSale';
```

`canAfterSale`（L207）替换 + 新增售后状态逻辑（插在异常赔付 computed 块之后）：

旧：
```ts
const canAfterSale = computed(() => ['Delivered','PaymentSettled','PaymentAuthorized'].includes(order.value?.state));
```
新：
```ts
// —— 售后（送达后 24h 内，整单/按行部分退）——
const afterSale = ref<AfterSaleRequest | null>(null);
const asStateLabels: Record<string, string> = {
    Pending: '商家审核中', Approved: '商家已同意', Received: '退款处理中', Refunded: '已退款',
    RefundFailed: '退款失败处理中', Rejected: '商家已拒绝', Appealed: '平台仲裁中', Closed: '已关闭',
};
const asStateLabel = computed(() => asStateLabels[afterSale.value?.state ?? ''] ?? '');
const deliveredAt = computed(() => order.value?.customFields?.deliveredAt ?? null);
const withinAfterSaleWindow = computed(() => {
    if (!deliveredAt.value) return false;
    return Date.now() - new Date(deliveredAt.value).getTime() <= 24 * 60 * 60 * 1000;
});
// 有售后单（非 Closed）→ 展示状态卡并隐藏入口；无单且送达 24h 内 → 显示入口
const canAfterSale = computed(() =>
    order.value?.customFields?.deliveryStatus === 'delivered'
    && withinAfterSaleWindow.value
    && !afterSale.value);
```

onMounted（L258-269）替换死查询块：

旧（L262-266）：
```ts
    try {
        const client = getGraphQLClient();
        const tRes: any = await client.request(`query { afterSalesRequest(id: "${order.value?.id}") { returnTrackingNo } }`);
        if (tRes?.afterSalesRequest?.returnTrackingNo) trackingNo.value = tRes.afterSalesRequest.returnTrackingNo;
    } catch (e) {}
```
新：
```ts
    // 售后单查询（整单维度，client-side 按 orderId 过滤）；旧 returnTrackingNo 死查询已移除
    try {
        const mine = await fetchMyAfterSales();
        afterSale.value = mine.find(r => String(r.orderId) === String(order.value?.id))
            ?? mine.find(r => r.order?.id === order.value?.id) ?? null;
    } catch (e) { /* 未登录等场景静默 */ }
```

L385-386 `notOpen` 注释与方法替换（保留 notOpen 给「开发票」）：

旧：
```ts
// 死链兜底：售后/发票目标页面本模板未建
function notOpen() { uni.showToast({ title: '暂未开放', icon: 'none' }); }
```
新：
```ts
// 死链兜底：发票目标页面本模板未建
function notOpen() { uni.showToast({ title: '暂未开放', icon: 'none' }); }
// 售后：入口创建页 / 状态卡详情页
function goAfterSale() {
    if (!order.value?.code) return;
    uni.navigateTo({ url: `/pkg-order/pages/after-sale-create?code=${order.value.code}` });
}
function goAfterSaleDetail() {
    if (!afterSale.value?.id) return;
    uni.navigateTo({ url: `/pkg-order/pages/after-sale-detail?id=${afterSale.value.id}` });
}
```

- [ ] **Step 3: 样式**

style 区追加：

```scss
.as-card { &__row { display: flex; justify-content: space-between; align-items: center; } &__title { font-size: 28rpx; font-weight: bold; } &__amount { font-size: 28rpx; color: $price-color; font-weight: bold; } &__sub { font-size: 24rpx; color: $text-color-secondary; margin-top: 8rpx; display: block; } }
```

- [ ] **Step 4: 构建 + Commit**

Run: `pnpm build:h5` 验证。

```bash
cd d:\zhao\waimai
git add src/pkg-order/pages/order-detail.vue
git commit -m "feat(after-sale): 订单详情激活售后入口——送达24h门槛+售后状态卡+移除死查询"
```

---

### Task 8: web-admin——仲裁操作与 Appealed 支持

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\constants\orderState.ts:23-33`
- Modify: `d:\zhao\vshop\web-admin\src\constants\afterSaleActions.ts`
- Modify: `d:\zhao\vshop\web-admin\src\apis\afterSale.ts`
- Modify: `d:\zhao\vshop\web-admin\src\pages\after-sale\detail\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json` / `en.json`

- [ ] **Step 1: orderState.ts——AFTER_SALE_STATES 加 Appealed**

在 `Rejected` 行后插入：

```ts
  Appealed:     { label: '仲裁中', color: '#f59e0b' },
```

- [ ] **Step 2: afterSaleActions.ts**

接口（L9-17）加字段：

```ts
export interface AfterSaleActionAvailability {
  approve: boolean;
  reject: boolean;
  receive: boolean;
  refund: boolean;
  retry: boolean;
  /** 换货发货（仅 exchange 单 Received 态；三期新增） */
  exchangeShip: boolean;
  /** 平台仲裁（Appealed 态；外卖售后四期新增） */
  arbitrate: boolean;
}
```

`afterSaleActions` 返回体加一行：

```ts
    arbitrate: s === 'Appealed',
```

`hasAfterSaleActions` 的 return 表达式追加 `|| a.arbitrate`。

`AFTER_SALE_TABS`（L41-50）在 `{ key: 'Pending', ... }` 后插入：

```ts
  { key: 'Appealed', label: 'tabAppealed' },
```

- [ ] **Step 3: apis/afterSale.ts——仲裁 mutation 封装**

在 `rejectAfterSale` 导出函数之后追加：

```ts
/** 平台仲裁：approve=true 同意退款（refund_only 链式原路退回）；false 维持拒绝（note 必填） */
export async function arbitrateAfterSale(id: string, approve: boolean, note?: string): Promise<AfterSaleRow> {
  const { arbitrateAfterSales } = await getAdminClient().request<{ arbitrateAfterSales: AfterSaleRow }>(
    `mutation ArbitrateAfterSale($id: ID!, $approve: Boolean!, $note: String) {
      arbitrateAfterSales(id: $id, approve: $approve, note: $note) { ${AFTER_SALE_FIELDS} }
    }`,
    { id, approve, note: note || null },
  );
  return arbitrateAfterSales;
}
```

- [ ] **Step 4: detail/index.vue——仲裁 UI**

import 区（L146-158）`from '../../../apis/afterSale'` 的导入列表追加 `arbitrateAfterSale`。

`primaryLabel` computed（L183-191）在 `if (c.approve)` 之前插入：

```ts
  if (c.arbitrate) return locale.t('afterSale.detail.arbitrateApprove');
```

`onRetry` 函数（L329-335）之后追加：

```ts
// ---- 平台仲裁（四期）：同意退款 / 维持拒绝（说明必填） ----
function onArbitrateApprove() {
  uni.showModal({
    title: locale.t('afterSale.detail.arbitrateApproveTitle'),
    content: locale.t('afterSale.detail.arbitrateApproveContent').replace('{amount}', money(detail.value?.refundAmount)),
    success: (res) => { if (res.confirm && detail.value) void run(() => arbitrateAfterSale(detail.value!.id, true), locale.t('afterSale.detail.arbitrateApproved')); },
  });
}

function onArbitrateReject() {
  uni.showModal({
    title: locale.t('afterSale.detail.arbitrateRejectTitle'),
    editable: true,
    placeholderText: locale.t('afterSale.detail.arbitrateNotePlaceholder'),
    success: (res) => {
      if (!res.confirm || !detail.value) return;
      const note = (res.content || '').trim();
      if (!note) { toast(locale.t('afterSale.detail.arbitrateNoteRequired')); return; }
      void run(() => arbitrateAfterSale(detail.value!.id, false, note), locale.t('afterSale.detail.arbitrateRejected'));
    },
  });
}
```

`secondaryAction()`（footbar 用，位于 primaryLabel 附近）：在该函数现有 `can.reject` 分支**之前**插入：

```ts
  if (can.value.arbitrate) return onArbitrateReject;
```

footbar 次按钮文案（template L138）改为动态：

旧：
```html
      <button v-if="secondaryAction()" class="op" @tap="secondaryAction()!()">{{ $t('afterSale.detail.reject') }}</button>
```
新：
```html
      <button v-if="secondaryAction()" class="op" @tap="secondaryAction()!()">{{ $t(secondaryKey()) }}</button>
```
并在 `primaryLabel` 旁新增：

```ts
const secondaryKey = computed(() => (can.value.arbitrate ? 'afterSale.detail.arbitrateReject' : 'afterSale.detail.reject'));
```
（若 template 处不便改函数调用形态，把 L138 的 `{{ $t('afterSale.detail.reject') }}` 换成 `{{ $t(secondaryKey) }}`。）

时间线（timeline computed，L235-242 的 push 链）在 `r.state === 'Rejected'` 分支后追加：

```ts
  } else if (r.state === 'Appealed') {
    list.push({ key: 'Appealed', label: locale.t('afterSale.detail.statusAppealed'), time: (() => { const rows = (r.history ?? []).filter((h) => h.toState === 'Appealed'); return rows.length ? fmtTime(rows[rows.length - 1].createdAt) : fmtTime(r.updatedAt); })(), reached: true, current: true, failed: false, detail: null });
```

- [ ] **Step 5: locale 词条**

`src/locale/zh-Hans.json` 的 `afterSale.detail` 对象（L1108 起）追加：

```json
      "arbitrateApprove": "仲裁同意退款",
      "arbitrateApproveTitle": "仲裁同意退款",
      "arbitrateApproveContent": "将向用户原路退回 ¥{amount}，确认执行？",
      "arbitrateApproved": "已同意退款",
      "arbitrateReject": "维持拒绝",
      "arbitrateRejectTitle": "维持拒绝",
      "arbitrateNotePlaceholder": "仲裁说明（必填，将展示给用户）",
      "arbitrateNoteRequired": "请填写仲裁说明",
      "arbitrateRejected": "已维持拒绝",
      "statusAppealed": "平台仲裁中"
```

`afterSale.list` 对象追加：

```json
      "tabAppealed": "仲裁中"
```

`src/locale/en.json` 对应位置追加：

```json
      "arbitrateApprove": "Arbitrate: Refund",
      "arbitrateApproveTitle": "Arbitrate: Approve Refund",
      "arbitrateApproveContent": "Refund ¥{amount} to the customer via original payment. Continue?",
      "arbitrateApproved": "Refund approved",
      "arbitrateReject": "Uphold Rejection",
      "arbitrateRejectTitle": "Arbitrate: Uphold Rejection",
      "arbitrateNotePlaceholder": "Arbitration note (required, visible to customer)",
      "arbitrateNoteRequired": "Note is required",
      "arbitrateRejected": "Rejection upheld",
      "statusAppealed": "Under arbitration"
```
```json
      "tabAppealed": "Arbitration"
```

- [ ] **Step 6: 构建 + Commit**

Run: `cd d:\zhao\vshop\web-admin && pnpm build`（或项目实际 build 脚本）验证。

```bash
cd d:\zhao\vshop
git add web-admin/src
git commit -m "feat(web-admin): 售后平台仲裁——Appealed 页签/状态/仲裁同意退款与维持拒绝"
```

---

### Task 9: 生产冒烟 + 手机截图 + 操作手册

**Files:**
- Create: `d:\zhao\waimai\scripts\_smoke_aftersale.py`
- Create: `d:\zhao\waimai\docs\waimai-操作手册-售后.md`

- [ ] **Step 1: 冒烟脚本**

骨架复用 `scripts/_smoke_exception.py`（登录/下单/settlePayment/骑手指派与送达/admin_gql/rider_gql 全套已验证，直接拷贝其头部常量、`page_gql`、`admin_gql`、`rider_gql`、`ensure_rider`、`create_order`、`assign_and_report` 等函数）。新增流程（main）：

```
S1  学生下单（variant 87 ×1，R1，cod-payment-template，admin settlePayment）→ PaymentSettled
S2  admin campusAssignOrder 指派 smoke-rider → rider campusDeliverTask(photos:['/static/x.webp']) 
    → 断言订单 customFields deliveryStatus='delivered' 且 deliveredAt 非空
S3  学生（page_gql）uploadAfterSalesEvidence(images:[1px png base64 data URL]) → 返回 URL 数组
S4  学生 createAfterSalesRequest(input:{orderId, type:"refund_only", reason:"少送",
    description:"部分退款：可乐鸡排饭×1", evidenceImages:[S3 URL], refundAmount: 100})（1 元部分退）
    → 断言 state=Pending
S5  学生重复创建 → 断言报错 contains "already exists"
S6  admin rejectAfterSalesRequest(id, reason:"出餐记录正常") → 断言 Rejected
S7  学生 appealAfterSalesRequest(id, note:"收到的餐品数量不对") → 断言 Appealed
S8  admin arbitrateAfterSales(id, approve:true, note:"凭证有效") → 断言 state=Refunded 
    且 actualRefundAmount=100；断言 order.customFields.afterSalesStatus="Refunded"
S9  截图段（390x844 dpr=2）：
    - after-sale-create：goto /waimai/?tenant=canteen-a-token#/pkg-order/pages/after-sale-create?code=<orderCode> 
      截 docs/screenshots/aftersale/wa-as-create.png
    - after-sale-detail：goto #/pkg-order/pages/after-sale-detail?id=<reqId> 截 wa-as-detail-refunded.png
    - order-detail：goto #/pkg-order/pages/order-detail?code=<orderCode> 截 wa-as-order-card.png
    - web-admin 售后详情（Appealed 单现场造：第二单 S1-S7 后停在 Appealed）：
      goto /guani/#/pages/after-sale/detail/index?id=<reqId2> 截 wa-as-admin-appealed.png
输出 AFTER-SALE SMOKE PASS
```

关键实现要点（从 _smoke_exception.py 照抄的姿势）：
- `page_gql(pa, q, v)` 页面上下文 fetch（会话 cookie 生效唯一通道）
- admin 用 `admin_gql`（login 拿 token 头；本 fork 校验 Authorization 头对 admin-api 有效——以 _smoke_exception.py 实际代码为准，若其 admin 也是 cookie 通道则照抄）
- `rider_upload_asset()` 已有 1px 图上传姿势可复用
- 断言失败立即 raise，最后打印 PASS

- [ ] **Step 2: 执行冒烟**

前置：Task 3 已部署后端、Task 8 已部署 web-admin（或本 Task 先冒烟后端链路、web-admin 截图段跳过待 Task 10 后补跑）。

Run: `python scripts/_smoke_aftersale.py`
Expected: `AFTER-SALE SMOKE PASS`。

- [ ] **Step 3: 主窗口逐张 Read 目检截图**

`docs/screenshots/aftersale/` 下 4 张逐张 Read 检查（冒烟铁律：不信任 PASS 汇报）：创建页清单勾选/金额、详情已退款态、订单详情售后卡、admin 仲裁页。

- [ ] **Step 4: 操作手册**

`docs/waimai-操作手册-售后.md` 内容：
1. 用户侧：入口（订单详情送达 24h 内）→ 整单/部分退 → 凭证要求 → 状态含义表（8 态）→ 申诉时机
2. 商家侧：web-admin 售后列表（Pending 页签）→ 审批/拒绝（理由必填）→ 留言；48h 未审自动同意并退款提醒
3. 平台侧：Appealed 仲裁页签 → 同意退款/维持拒绝（说明必填）；RefundFailed 重试入口
4. 已知边界：仅骑手送达单（deliveryStatus=delivered）可售后；被拒单只能申诉不可重提；24h 窗口以骑手送达落库时间为准
5. 冒烟复跑：`python scripts/_smoke_aftersale.py`

- [ ] **Step 5: Commit**

```bash
cd d:\zhao\waimai
git add scripts/_smoke_aftersale.py docs/screenshots/aftersale docs/waimai-操作手册-售后.md
git commit -m "test(after-sale): 生产全链路冒烟（下单→送达→售后→拒绝→申诉→仲裁退款）+截图+操作手册"
```

---

### Task 10: 三仓库收口——推送 + 部署 + 生产验证

- [ ] **Step 1: 推送三仓库**

```bash
cd d:\zhao\vendure && git push
cd d:\zhao\waimai && git push
cd d:\zhao\vshop && git push
```
（vendure 若 Task 3 已推送则跳过；确认 `git status` 干净——vendure 需 src+lib 同提交。）

- [ ] **Step 2: 部署**

```bash
cd d:\zhao\vshop\web-admin && node ..\scripts\deploy.mjs   # web-admin（vshop scripts/deploy.mjs，cwd 以脚本实际要求为准）
cd d:\zhao\waimai && node .secrets\deploy-waimai.mjs       # waimai H5
```
vendure 已在 Task 3 部署；若 Task 3 之后 vendure 又有提交，重复其部署步骤。

- [ ] **Step 3: 生产验证**

```powershell
curl.exe -s -o NUL -w "%{http_code}" "https://www.yourbao.cn/waimai/"          # 期望 200
curl.exe -s -o NUL -w "%{http_code}" "https://e.joho.cn/guanli/"               # 期望 200
```
复跑 `python scripts/_smoke_aftersale.py`（Task 9 若已有 web-admin 截图段则本轮含其全 PASS）。

- [ ] **Step 4: 项目记忆沉淀**

更新 `c:\Users\lenovo\.trae-cn\memory\projects\-d-zhao--p2-cd6bb1a37c153a452cb2\project_memory.md`：
- 外卖售后链路一段：插件 options 语义（windowHours/allowedOrderStates/requireOrderCustomField）、refund_only 审批即退款链、外卖单全程 PaymentSettled 的现实与门槛设计
- 冒烟账号/脚本位置

---

## Self-Review 结论

- **Spec 覆盖**：§3.1 插件配置 → Task 3（用 options 而非渠道覆盖，窗口精确 24h——`maxDaysAfterDelivery:1` 实为 16 天窗口故弃用，新增 `afterSalesWindowHours`）；§3.2 状态机 → Task 1；§3.3 仲裁（approve 链式退款 / reject note 必填）→ Task 2；§3.4 商家权限 → 复用既有 approve/reject（web-admin 已上线，无需改权限）；§3.5 原因枚举+凭证校验 → Task 5（前端强校验 + 后端既有 asset 白名单）；§4.1 两页 → Task 5/6；§4.2 order-detail 改造（canAfterSale 送达 24h+无进行中售后）→ Task 7，「进行中售后单隐藏取消订单」天然成立（canCancel 仅未支付态，与送达后互斥，无需改码）；§4.3 数据流 → Task 2/3/9；§5 B 端 → Task 8（仲裁走平台管理员，复用 UpdateOrder 权限与现有菜单）；§7 测试 → Task 1/2 e2e + Task 9 冒烟/截图/手册；§8 明确不做 → 未引入
- **决策对齐说明**：多行部分退款按 spec「提交一份售后单」实现为单笔聚合单（orderLineId=null，行明细写入 description，金额=Σ行实付均摊），避免一笔申请产生 N 张审批单；后端整单查重保证单订单单售后单
- **占位符扫描**：无 TBD/TODO；resolver 代码段标注「镜像相邻 handler 装饰器风格」属于对既有文件的风格对齐指令，代码本体完整
- **类型一致性**：`refundOnlyChain/approveRequest/arbitrateRequest/appealRequest` 签名与 resolver 调用一致；前端 `fetchMyAfterSales/fetchAfterSaleDetail/...` 与两页使用一致；web-admin `arbitrateAfterSale(id, approve, note)` 与 detail 调用一致；SDL 入参名（appealAfterSalesRequest(id, note)/arbitrateAfterSales(id, approve, note)）三端一致
