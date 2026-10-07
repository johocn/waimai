# 优惠券 C 端 + 订单状态推送 Implementation Plan

> **For agentic workers:** REQUIRED sub-skill: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 里程碑 1 交付 waimai 优惠券 C 端闭环（领券中心 + 我的券包 + checkout 选券 + 商品专属券 chip + 个人中心激活）；里程碑 2 交付订单状态推送（campus-notify 加法扩展 4 事件 + 待付款提醒/超时取消定时任务 + web-admin 配置页 + 落地页跳转）。

**Architecture:** 里程碑 1 纯前端（coupon-plugin shop-api 已就绪，waimai 加 pkg-promotion 分包 + API 层 + 既有页面改造）；里程碑 2 campus-delivery-plugin 加法扩展（campus-notify 事件映射三表对齐 + CampusFulfillmentConfig 实体列 + payment-timeout 任务实体/Job/补偿扫描 + EventBus 订阅接线）+ coupon-plugin 加一个 `couponCentreUpcoming` 查询 + web-admin 配置页补输入框。

**Tech Stack:** vendure 3.x 插件（TypeGraphQL/TypeORM，vitest，lib 产物 git 跟踪）、uni-app H5（waimai，Pinia + graphql-request）、vitest 纯逻辑测试、Playwright 生产冒烟（python 390×844 dpr=2）。

**spec：** `docs/superpowers/specs/2026-10-07-waimai-coupon-notify-design.md`

**关键事实（已核实，勿再查证）：**

- waimai vitest：include `tests/**/*.spec.ts`，environment=node（`vitest.config.ts`）；**waimai 全仓无 i18n 基建**，文案硬编码中文（与 profile/after-sale 子项目一致）→ spec §3.4 的「i18n 字典」条款在此仓库不适用，按仓库惯例硬编码
- shop-api 券接口全就绪（`coupon-shop.resolver.ts`）：`couponCentre` / `myCoupons(status)` / `productCoupons(productId)` / `claimCoupon(templateId)` / `claimProductCoupon(bindingId)` / `applyCouponToOrder(code)` / `clearCouponFromOrder`；SDL 见 `coupon-plugin/src/plugin.ts` L522-545；`CouponStatus = UNUSED|USED|RETURNED|EXPIRED|INVALID`
- 券估算口径以 `coupon-plugin/src/coupon-promotion-condition.ts` 为唯一权威：PERCENT `discountValue` 为折数（8.5折=85），优惠 = 小计×(100-value)/100；FREE_SHIPPING 优惠 = 配送费；FIXED/FULL = min(discountValue, 小计)；门槛 `minSpend > 商品小计` 即不可用
- `couponCentre` 只返回**已开始**的券（startsAt <= now）→「即将开始」tab 无数据源，计划把 `couponCentreUpcoming` 查询加入里程碑 2 的 coupon-plugin 改动（waimai tab 同步落在里程碑 2）
- 金额单位：Vendure 分（fen）；waimai `cart.formatPrice(cents)` 出元字符串；购物车行 `linePriceWithTax`
- waimai cart store（`src/stores/cart.ts`）：`setOrder(newOrder)` 直接整体更新（mutation 返回 Order 后调用）；`cart.order.shippingWithTax` 可用（checkout L425 在用）
- 登录分流：`useAuthStore().requireLogin(redirect)`（`src/stores/auth.ts` L61-68，未登录跳 login 并带 redirect）
- **campus notify 模板 ID 是实体列不是 customFields**：`campus-fulfillment-config.entity.ts` @Column + `migrations/create-campus-tables.ts` 启动幂等 ALTER（spec「零 migration」说法不准）+ `waimai-store.service.ts` CRUD + `campus-delivery.plugin.ts` SDL（CampusStoreConfigWithChannel / CampusStoreConfigInput，L246-281）
- `wechat-auth-plugin` 的 `sendTemplate` **已支持 `url` 参数**（`wechat-auth.service.ts` L191）→ 落地页跳转只需 campus-notify 传 url，无需动 wechat-auth-plugin；H5 站点域名新增配置列 `h5BaseUrl`（禁硬编码域名）
- `AfterSalesStateTransitionEvent`（`after-sales-plugin/src/after-sales.events.ts`，index.ts 已导出）：构造参数含 `orderId`/`orderCode`/`toState`，直接可推
- **OrderTimeoutPlugin 已在生产链路**（`dev-config.ts` L442，PAYMENT 超时默认 30min 自动取消）→ 本计划 +15min 取消任务与之共存：两边都有到点状态复查（非 ArrangingPayment 即作废），先到先得、后者幂等跳过
- **库存释放坑**：`order-timeout.job.ts` L139-178 明确——active 订单（ArrangingPayment）取消**不会自动释放库存分配**，须先 `StockMovementService.createReleasesForOrderLines`。spec §4.3「库存释放由核心保证」的说法有误，本计划的取消路径按 order-timeout 先例先释放再取消
- campus-notify 既有模式：fire-and-forget、`CampusNotifyEvent`/`TEMPLATE_FIELD`/`STATUS_TEXT` 三表对齐、无 openid/未配置模板静默跳过（`campus-notify.service.ts`）；单测模式见 `campus-notify.service.spec.ts`
- after-sales-timeout 模式（`after-sales-timeout.job.ts`）：任务实体（PENDING→EXECUTED/CANCELLED/FAILED）+ JobQueue + 补偿 ScheduledTask（SQL JobQueue 忽略 delay，靠补偿扫描重入队）+ 到点 `expectedState` 复查；`MAX_RETRY = 3`
- 售后通知节点：`Approved` / `Refunded` / `RefundFailed`（其余状态不推）
- 取消通知过滤：`ctx.activeUserId` 存在 = 用户本人主动取消 → 不推；商家/系统/超时取消才推
- web-admin campus 配置页：`vshop/web-admin/src/pages/campus/config.vue`（vue-i18n `$t('campusConfig.*')`）+ `web-admin/src/apis/campus.ts`
- PowerShell 环境：不支持 `&&`（用 `;` 分隔）；无 heredoc（提交信息单行 `-m` 多段）
- vendure 插件消费 `lib/` 编译产物（git 跟踪）：改 src 后必须 `npm run build`，commit src+lib
- 部署：vendure = push 后服务器 `git pull --ff-only` + `pm2 restart vendure`（启动 ~6 分钟，`ss -tln | grep 3020` 确认）；waimai/web-admin = `node .secrets/deploy-waimai.mjs`（本地构建）
- 生产冒烟账号：`smoke-order@yourbao.cn / Wm@Smoke123`（登录走页面上下文 fetch `/shop-api`）
- **并行会话在途**：waimai 工作区有其他会话变更（dist/、App.vue、theme.ts 等），提交时**只 add 本计划相关文件**

---

## File Structure

**waimai（d:\zhao\waimai）— 里程碑 1**
```
tests/coupon-estimate.spec.ts             # 新：纯函数测试（先写，TDD）
src/utils/coupon-estimate.ts              # 新：券估算/选优/不可用原因纯函数
src/api/queries/coupon.ts                 # 新：couponCentre/myCoupons/productCoupons 封装
src/api/mutations/coupon.ts               # 新：claim/claimProduct/apply/clear 封装
src/pages.json                            # 改：注册 pkg-promotion 分包 2 页
src/pkg-promotion/pages/coupon-centre.vue # 新：领券中心（tab 可领取/即将开始）
src/pkg-promotion/pages/my-coupons.vue    # 新：我的券包（tab 未使用/已使用/已过期）
src/pages/profile/index.vue               # 改：优惠券入口激活 + 未使用角标
src/pages/shop/menu.vue                   # 改：商品行专属券 chip
src/pkg-order/pages/checkout.vue          # 改：优惠券行 + 选券弹层 + 自动试挂最优
```

**vendure（d:\zhao\vendure）— 里程碑 2**
```
packages/coupon-plugin/src/coupon.service.ts          # 改：加 couponCentreUpcoming
packages/coupon-plugin/src/coupon-shop.resolver.ts    # 改：加 query
packages/coupon-plugin/src/plugin.ts                  # 改：SDL 加 couponCentreUpcoming
packages/coupon-plugin/lib/**                         # build 产物
packages/campus-delivery-plugin/src/campus-notify.service.ts        # 改：4 事件 + url 落地页
packages/campus-delivery-plugin/src/campus-notify.service.spec.ts   # 改：新事件单测
packages/campus-delivery-plugin/src/campus-fulfillment-config.entity.ts  # 改：5 新列
packages/campus-delivery-plugin/src/migrations/create-campus-tables.ts   # 改：5 条 ALTER
packages/campus-delivery-plugin/src/waimai-store.service.ts         # 改：CRUD 补字段
packages/campus-delivery-plugin/src/campus-delivery.plugin.ts       # 改：SDL + 事件订阅 + 任务注册
packages/campus-delivery-plugin/src/payment-timeout.entity.ts       # 新：待付款任务实体
packages/campus-delivery-plugin/src/payment-timeout.job.ts          # 新：提醒/取消 Job + 补偿
packages/campus-delivery-plugin/src/payment-timeout.job.spec.ts     # 新：单测
packages/campus-delivery-plugin/lib/**                # build 产物
```

**vshop（d:\zhao\vshop）**
```
web-admin/src/pages/campus/config.vue     # 改：4 模板 ID + h5BaseUrl 输入框
web-admin/src/apis/campus.ts              # 改：类型补字段
web-admin/src/locales/**                  # 改：campusConfig.* 词条（zh+en）
docs/waimai-操作手册.md                   # 改：追加「优惠券」「订单通知」章节
docs/screenshots/waimai/                  # 新截图落此目录
```

---

# 里程碑 1：优惠券 C 端（waimai 纯前端）

### Task 1: 券估算纯函数（TDD）

**Files:**
- Create: `d:\zhao\waimai\src\utils\coupon-estimate.ts`
- Test: `d:\zhao\waimai\tests\coupon-estimate.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { estimateDiscountFen, pickBestCoupon, couponUnavailableReason } from '../src/utils/coupon-estimate';

/** 估算口径镜像 coupon-plugin/src/coupon-promotion-condition.ts（唯一权威） */
describe('estimateDiscountFen', () => {
    it('FIXED：直减，不超过小计', () => {
        expect(estimateDiscountFen({ type: 'FIXED', discountValue: 2000, minSpend: 0 }, 10000, 500)).toBe(2000);
        expect(estimateDiscountFen({ type: 'FIXED', discountValue: 20000, minSpend: 0 }, 10000, 500)).toBe(10000);
    });
    it('FULL：直减但需过门槛', () => {
        expect(estimateDiscountFen({ type: 'FULL', discountValue: 1500, minSpend: 5000 }, 10000, 500)).toBe(1500);
        expect(estimateDiscountFen({ type: 'FULL', discountValue: 1500, minSpend: 20000 }, 10000, 500)).toBe(0);
    });
    it('PERCENT：discountValue 为折数（8.5折=85），优惠=小计×(100-85)%', () => {
        expect(estimateDiscountFen({ type: 'PERCENT', discountValue: 85, minSpend: 0 }, 20000, 500)).toBe(3000);
        expect(estimateDiscountFen({ type: 'PERCENT', discountValue: 80, minSpend: 0 }, 13333, 500)).toBe(2667); // 四舍五入
    });
    it('FREE_SHIPPING：优惠=当前配送费；无配送费为 0', () => {
        expect(estimateDiscountFen({ type: 'FREE_SHIPPING', discountValue: 0, minSpend: 0 }, 10000, 500)).toBe(500);
        expect(estimateDiscountFen({ type: 'FREE_SHIPPING', discountValue: 0, minSpend: 0 }, 10000, null)).toBe(0);
    });
    it('未知类型兜底：按 discountValue 原值直减', () => {
        expect(estimateDiscountFen({ type: 'WEIRD', discountValue: 800, minSpend: 0 }, 10000, 500)).toBe(800);
    });
});

describe('pickBestCoupon', () => {
    const fixed = { id: '1', type: 'FIXED', discountValue: 2000, minSpend: 0 };
    const pct = { id: '2', type: 'PERCENT', discountValue: 80, minSpend: 0 };
    const full = { id: '3', type: 'FULL', discountValue: 5000, minSpend: 60000 };
    const ship = { id: '4', type: 'FREE_SHIPPING', discountValue: 0, minSpend: 0 };
    it('取估算最大者', () => {
        expect(pickBestCoupon([fixed, pct], 20000, 500)?.id).toBe('2'); // 20%off=4000 > 2000
        expect(pickBestCoupon([fixed, pct], 5000, 500)?.id).toBe('1');  // 1000 < 2000
        expect(pickBestCoupon([full, ship], 5000, 800)?.id).toBe('4');  // full 门槛未过=0
    });
    it('空列表/全不可用 → null', () => {
        expect(pickBestCoupon([], 10000, 500)).toBeNull();
        expect(pickBestCoupon([full], 5000, 500)).toBeNull();
    });
    it('并列取先（稳定）', () => {
        const a = { id: 'a', type: 'FIXED', discountValue: 1000, minSpend: 0 };
        const b = { id: 'b', type: 'FIXED', discountValue: 1000, minSpend: 0 };
        expect(pickBestCoupon([a, b], 10000, 500)?.id).toBe('a');
    });
});

describe('couponUnavailableReason', () => {
    it('门槛未过 → 未满文案', () => {
        expect(couponUnavailableReason({ type: 'FULL', discountValue: 500, minSpend: 3000 }, 2000)).toBe('未满 ¥30');
        expect(couponUnavailableReason({ type: 'FULL', discountValue: 500, minSpend: 3333 }, 2000)).toBe('未满 ¥33.33');
    });
    it('门槛已过/无门槛 → null', () => {
        expect(couponUnavailableReason({ type: 'FIXED', discountValue: 500, minSpend: 0 }, 100)).toBeNull();
        expect(couponUnavailableReason({ type: 'FIXED', discountValue: 500, minSpend: 1000 }, 1000)).toBeNull();
    });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd d:\zhao\waimai; npx vitest run tests/coupon-estimate.spec.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 最小实现**

```ts
/**
 * 券估算纯函数 —— 口径镜像 coupon-plugin/src/coupon-promotion-condition.ts（唯一权威，勿自造）。
 * 金额一律分（fen）。PERCENT 的 discountValue 是折数（8.5折=85）。
 */
export interface CouponTemplateLike {
    type: string;
    discountValue: number;
    minSpend: number;
}

/** 估算一张券在当前小计/配送费下的优惠额（分）；门槛未过 → 0 */
export function estimateDiscountFen(tpl: CouponTemplateLike, subtotalFen: number, shippingFeeFen: number | null): number {
    if (!tpl || (tpl.minSpend ?? 0) > subtotalFen) return 0;
    switch (tpl.type) {
        case 'PERCENT':
            return Math.round(subtotalFen * ((100 - tpl.discountValue) / 100));
        case 'FREE_SHIPPING':
            return shippingFeeFen ?? 0;
        case 'FIXED':
        case 'FULL':
            return Math.max(0, Math.min(tpl.discountValue, subtotalFen));
        default:
            return Math.max(0, Math.min(tpl.discountValue, subtotalFen)); // 未知类型兜底（spec §5）
    }
}

/** 从候选中选估算最优；并列取先；全不可用返回 null */
export function pickBestCoupon<T extends CouponTemplateLike & { id: string }>(
    tpls: T[], subtotalFen: number, shippingFeeFen: number | null,
): T | null {
    let best: T | null = null;
    let bestVal = 0;
    for (const t of tpls) {
        const v = estimateDiscountFen(t, subtotalFen, shippingFeeFen);
        if (v > bestVal) { best = t; bestVal = v; }
    }
    return best;
}

/** 门槛未过时的人话原因（如「未满 ¥30」）；可用返回 null */
export function couponUnavailableReason(tpl: CouponTemplateLike, subtotalFen: number): string | null {
    if ((tpl.minSpend ?? 0) <= subtotalFen) return null;
    const yuan = tpl.minSpend / 100;
    const text = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
    return `未满 ¥${text}`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd d:\zhao\waimai; npx vitest run tests/coupon-estimate.spec.ts`
Expected: PASS（全绿）

- [ ] **Step 5: 提交**

```powershell
cd d:\zhao\waimai
git add tests/coupon-estimate.spec.ts src/utils/coupon-estimate.ts
git commit -m "feat(coupon): 券估算纯函数（口径镜像 coupon-promotion-condition）"
```

---

### Task 2: API 层封装

**Files:**
- Create: `d:\zhao\waimai\src\api\queries\coupon.ts`
- Create: `d:\zhao\waimai\src\api\mutations\coupon.ts`

- [ ] **Step 1: 新建 queries/coupon.ts（完整文件）**

```ts
import { getGraphQLClient } from '../client';

// CouponTemplate 字段（对齐 vshop/src/api/queries/coupon.ts）。
// type: FIXED | PERCENT | FULL | FREE_SHIPPING；discountValue：FIXED/FULL 为分，PERCENT 为折数（85=8.5折）
const COUPON_TEMPLATE_FIELDS = `
    id name description type discountValue minSpend
    startsAt endsAt totalCount claimedCount perUserLimit
    scope categoryId variantId enabled usageScene
    claimable claimCode validDays newCustomerOnly
`;

/** 领券中心：当前可领取的券模板（仅已开始的；即将开始走 couponCentreUpcoming，里程碑 2 接入） */
export async function getCouponCentre() {
    const client = getGraphQLClient();
    const query = `query CouponCentre { couponCentre { ${COUPON_TEMPLATE_FIELDS} } }`;
    return client.request(query);
}

/** 我的券包，status: UNUSED | USED | RETURNED | EXPIRED | INVALID */
export async function getMyCoupons(status?: string) {
    const client = getGraphQLClient();
    const query = `query MyCoupons($status: CouponStatus) {
        myCoupons(status: $status) {
            id code status issuedAt usedAt expiredAt
            template { ${COUPON_TEMPLATE_FIELDS} }
        }
    }`;
    return client.request(query, { status: status ?? null });
}

/** 商品专属券绑定列表（含模板详情） */
export async function getProductCoupons(productId: string) {
    const client = getGraphQLClient();
    const query = `query ProductCoupons($productId: ID!) {
        productCoupons(productId: $productId) {
            id productId couponTemplateId enabled
            template { ${COUPON_TEMPLATE_FIELDS} }
        }
    }`;
    return client.request(query, { productId });
}
```

- [ ] **Step 2: 新建 mutations/coupon.ts（完整文件）**

```ts
import { getGraphQLClient } from '../client';
import { CART_FRAGMENT } from '../fragments';

/**
 * 领券/挂券 mutation 返回非 union（CustomerCoupon! / Order!），失败直接抛 GraphQL error。
 * 调用方 catch 后取 e?.response?.errors?.[0]?.message 原样 toast（后端报错即人话：已领完/超出限领/未开始/仅限新客）。
 */

export async function claimCoupon(templateId: string) {
    const client = getGraphQLClient();
    const mutation = `mutation ClaimCoupon($templateId: ID!) { claimCoupon(templateId: $templateId) { id code status } }`;
    return client.request(mutation, { templateId });
}

export async function claimProductCoupon(bindingId: string) {
    const client = getGraphQLClient();
    const mutation = `mutation ClaimProductCoupon($bindingId: ID!) { claimProductCoupon(bindingId: $bindingId) { id code status } }`;
    return client.request(mutation, { bindingId });
}

export async function applyCouponToOrder(code: string) {
    const client = getGraphQLClient();
    const mutation = `${CART_FRAGMENT}
        mutation ApplyCouponToOrder($code: String!) { applyCouponToOrder(code: $code) { ...CartInfo } }`;
    return client.request(mutation, { code });
}

export async function clearCouponFromOrder() {
    const client = getGraphQLClient();
    const mutation = `${CART_FRAGMENT}
        mutation ClearCouponFromOrder { clearCouponFromOrder { ...CartInfo } }`;
    return client.request(mutation);
}
```

- [ ] **Step 3: 提交**

```powershell
cd d:\zhao\waimai
git add src/api/queries/coupon.ts src/api/mutations/coupon.ts
git commit -m "feat(coupon): shop-api 券查询/领取/挂券封装"
```

---

### Task 3: pages.json 注册 + 领券中心页

**Files:**
- Modify: `d:\zhao\waimai\src\pages.json`（subPackages 数组，pkg-user 块之后）
- Create: `d:\zhao\waimai\src\pkg-promotion\pages\coupon-centre.vue`

- [ ] **Step 1: pages.json 注册分包**

在 `subPackages` 数组内、`pkg-user` 块之后追加：

```json
,
{
    "root": "pkg-promotion",
    "pages": [
        { "path": "pages/coupon-centre", "style": { "navigationBarTitleText": "领券中心" } },
        { "path": "pages/my-coupons", "style": { "navigationBarTitleText": "我的优惠券" } }
    ]
}
```

- [ ] **Step 2: 新建 coupon-centre.vue（完整文件，版式 A-1 对齐 mockup）**

```vue
<template>
  <view class="cc-page">
    <view class="cc-tabs">
      <text class="cc-tab" :class="{ on: tab === 'claimable' }" @tap="switchTab('claimable')">可领取</text>
      <text class="cc-tab" :class="{ on: tab === 'upcoming' }" @tap="switchTab('upcoming')">即将开始</text>
    </view>

    <scroll-view scroll-y class="cc-list">
      <view v-for="t in list" :key="t.id" class="ticket" :class="{ 'ticket--off': !claimableNow(t) }">
        <view class="ticket__left">
          <view class="ticket__amount">
            <text class="ticket__symbol" v-if="t.type === 'FIXED' || t.type === 'FULL'">¥</text>
            <text class="ticket__num">{{ amountText(t) }}</text>
            <text class="ticket__unit" v-if="t.type === 'PERCENT'">折</text>
          </view>
          <text class="ticket__cond">{{ condText(t) }}</text>
        </view>
        <view class="ticket__right">
          <text class="ticket__name">{{ t.name }}</text>
          <text class="ticket__window" v-if="t.endsAt">{{ windowText(t) }}</text>
          <button class="ticket__btn" :class="{ 'ticket__btn--done': claimedIds.has(t.id) }"
            :disabled="claimingId === t.id" @tap="claim(t)">
            {{ claimBtnText(t) }}
          </button>
        </view>
      </view>
      <view class="empty-wrap" v-if="!loading && list.length === 0">
        <EmptyState text="暂无可领取的优惠券" />
      </view>
      <view class="scroll-pad"></view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { getCouponCentre } from '../../api/queries/coupon';
import { claimCoupon } from '../../api/mutations/coupon';
import { couponUnavailableReason } from '../../utils/coupon-estimate';

type TabKey = 'claimable' | 'upcoming';

const auth = useAuthStore();
const tab = ref<TabKey>('claimable');
const claimableList = ref<any[]>([]);
const upcomingList = ref<any[]>([]); // couponCentreUpcoming（里程碑 2 上线接口后接入；此前恒空）
const loading = ref(false);
const claimingId = ref('');
const claimedIds = ref(new Set<string>());

const list = computed(() => (tab.value === 'claimable' ? claimableList.value : upcomingList.value));

function claimableNow(t: any): boolean {
    // 即将开始的券整体不可点；可领取 tab 的券后端已保证在有效窗口内
    return tab.value === 'claimable';
}

function amountText(t: any): string {
    if (t.type === 'PERCENT') return (t.discountValue / 10).toFixed(1).replace(/\.0$/, '');
    if (t.type === 'FREE_SHIPPING') return '免';
    const yuan = t.discountValue / 100;
    return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

function condText(t: any): string {
    if (t.type === 'FULL') {
        const yuan = t.minSpend / 100;
        const y = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
        return `满 ${y} 可用`;
    }
    if (t.type === 'PERCENT') return '折扣券';
    if (t.type === 'FREE_SHIPPING') return '免配送费';
    return '无门槛';
}

function windowText(t: any): string {
    if (!t.endsAt) return '长期有效';
    return `${fmtDate(t.startsAt)} 至 ${fmtDate(t.endsAt)}`;
}

function fmtDate(s: string | null): string {
    if (!s) return '';
    const d = new Date(s);
    return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
}

function claimBtnText(t: any): string {
    if (claimedIds.value.has(t.id)) return '已领取';
    if (tab.value === 'upcoming') return '未开始';
    if ((t.totalCount ?? 0) > 0 && t.claimedCount >= t.totalCount) return '已领完';
    return '立即领取';
}

function switchTab(k: TabKey) {
    tab.value = k;
}

async function claim(t: any) {
    if (claimBtnText(t) !== '立即领取') return;
    if (!auth.requireLogin('/pkg-promotion/pages/coupon-centre')) return;
    claimingId.value = t.id;
    try {
        await claimCoupon(t.id);
        claimedIds.value.add(t.id);
        uni.showToast({ title: '领取成功', icon: 'none' });
    } catch (e: any) {
        // 后端报错原样 toast（已领完/超出限领/未开始/仅限新客）
        const msg = e?.response?.errors?.[0]?.message || '领取失败';
        uni.showToast({ title: msg, icon: 'none' });
        load(); // 刷新券列表状态
    } finally {
        claimingId.value = '';
    }
}

async function load() {
    loading.value = true;
    try {
        const res = await getCouponCentre();
        claimableList.value = res?.couponCentre ?? [];
    } catch {
        claimableList.value = [];
    } finally {
        loading.value = false;
    }
}

onMounted(load);
</script>

<style lang="scss" scoped>
.cc-page { min-height: 100vh; background: #f5f5f5; display: flex; flex-direction: column; }
.cc-tabs { display: flex; background: #fff; padding: 0 24rpx; }
.cc-tab { padding: 24rpx 0; margin-right: 48rpx; font-size: 30rpx; color: #666; &.on { color: #ff6600; font-weight: bold; border-bottom: 4rpx solid #ff6600; } }
.cc-list { flex: 1; height: 0; padding: 24rpx; box-sizing: border-box; }
.ticket { display: flex; background: #fff; border-radius: 16rpx; margin-bottom: 24rpx; overflow: hidden; }
.ticket__left { width: 220rpx; background: #ff6600; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 28rpx 0; }
.ticket--off .ticket__left { background: #ccc; }
.ticket__amount { display: flex; align-items: baseline; }
.ticket__symbol { font-size: 28rpx; }
.ticket__num { font-size: 52rpx; font-weight: bold; }
.ticket__unit { font-size: 24rpx; margin-left: 4rpx; }
.ticket__cond { font-size: 22rpx; margin-top: 8rpx; opacity: 0.9; }
.ticket__right { flex: 1; padding: 24rpx; display: flex; flex-direction: column; }
.ticket__name { font-size: 28rpx; color: #333; font-weight: bold; }
.ticket__window { font-size: 22rpx; color: #999; margin-top: 6rpx; }
.ticket__btn { margin-top: auto; align-self: flex-end; background: #ff6600; color: #fff; font-size: 24rpx; padding: 0 28rpx; height: 56rpx; line-height: 56rpx; border-radius: 28rpx; &--done { background: #eee; color: #999; } }
.empty-wrap { padding-top: 120rpx; }
.scroll-pad { height: 40rpx; }
</style>
```

- [ ] **Step 3: 提交**

```powershell
cd d:\zhao\waimai
git add src/pages.json src/pkg-promotion/pages/coupon-centre.vue
git commit -m "feat(coupon): pkg-promotion 分包 + 领券中心页（版式A）"
```

---

### Task 4: 我的券包页

**Files:**
- Create: `d:\zhao\waimai\src\pkg-promotion\pages\my-coupons.vue`

- [ ] **Step 1: 新建 my-coupons.vue（完整文件，版式 A-2 对齐 mockup）**

```vue
<template>
  <view class="mc-page">
    <view class="mc-tabs">
      <text v-for="k in TABS" :key="k.key" class="mc-tab" :class="{ on: tab === k.key }" @tap="switchTab(k.key)">{{ k.label }}</text>
    </view>

    <scroll-view scroll-y class="mc-list">
      <view v-for="c in list" :key="c.id" class="ticket" :class="{ 'ticket--used': c.status !== 'UNUSED' }">
        <view class="ticket__left">
          <view class="ticket__amount">
            <text class="ticket__symbol" v-if="c.template.type === 'FIXED' || c.template.type === 'FULL'">¥</text>
            <text class="ticket__num">{{ amountText(c.template) }}</text>
            <text class="ticket__unit" v-if="c.template.type === 'PERCENT'">折</text>
          </view>
          <text class="ticket__cond">{{ condText(c.template) }}</text>
        </view>
        <view class="ticket__right">
          <text class="ticket__name">{{ c.template.name }}</text>
          <text class="ticket__expire" v-if="c.expiredAt">有效期至 {{ fmtDate(c.expiredAt) }}</text>
          <text class="ticket__state">{{ stateText(c.status) }}</text>
          <button v-if="c.status === 'UNUSED'" class="ticket__btn" @tap="useCoupon(c)">去使用</button>
        </view>
      </view>
      <view class="empty-wrap" v-if="!loading && list.length === 0">
        <EmptyState :text="emptyText" />
      </view>

      <view class="mc-footer" v-if="tab === 'unused'" @tap="goCentre">
        <text>去领券中心逛逛 →</text>
      </view>
      <view class="scroll-pad"></view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useAuthStore } from '../../stores/auth';
import { getMyCoupons } from '../../api/queries/coupon';

const TABS = [
    { key: 'UNUSED', label: '未使用' },
    { key: 'USED', label: '已使用' },
    { key: 'EXPIRED', label: '已过期' },
] as const;

const auth = useAuthStore();
const tab = ref<string>('UNUSED');
const data = ref<Record<string, any[]>>({ UNUSED: [], USED: [], EXPIRED: [] });
const loading = ref(false);

const list = computed(() => data.value[tab.value] ?? []);
const emptyText = computed(() => (tab.value === 'UNUSED' ? '暂无可用优惠券' : tab.value === 'USED' ? '暂无已使用记录' : '暂无已过期优惠券'));

function amountText(t: any): string {
    if (t.type === 'PERCENT') return (t.discountValue / 10).toFixed(1).replace(/\.0$/, '');
    if (t.type === 'FREE_SHIPPING') return '免';
    const yuan = t.discountValue / 100;
    return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

function condText(t: any): string {
    if (t.type === 'FULL') {
        const yuan = t.minSpend / 100;
        const y = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
        return `满 ${y} 可用`;
    }
    if (t.type === 'PERCENT') return '折扣券';
    if (t.type === 'FREE_SHIPPING') return '免配送费';
    return '无门槛';
}

function stateText(s: string): string {
    return s === 'USED' ? '已使用' : s === 'EXPIRED' ? '已过期' : '';
}

function fmtDate(s: string | null): string {
    if (!s) return '';
    const d = new Date(s);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

async function load(status: string) {
    if (data.value[status]?.length) return; // 已加载过不重复拉
    loading.value = true;
    try {
        const res = await getMyCoupons(status);
        data.value[status] = res?.myCoupons ?? [];
    } catch {
        data.value[status] = [];
    } finally {
        loading.value = false;
    }
}

function switchTab(k: string) {
    tab.value = k;
    load(k);
}

function goCentre() {
    uni.navigateTo({ url: '/pkg-promotion/pages/coupon-centre' });
}

function useCoupon(c: any) {
    // 有进行中购物车 → 回 checkout 并预挂此券；无购物车 → 回首页
    const order = uni.getStorageSync('cart_has_order');
    if (order) {
        uni.setStorageSync('checkout_prefill_coupon', c.code);
        uni.switchTab({ url: '/pages/home/index' });
    } else {
        uni.switchTab({ url: '/pages/home/index' });
    }
}

onMounted(() => load('UNUSED'));
onShow(() => { data.value = { UNUSED: [], USED: [], EXPIRED: [] }; load(tab.value); }); // 每次进入刷新（领取/用券后回来状态要新）
</script>

<style lang="scss" scoped>
.mc-page { min-height: 100vh; background: #f5f5f5; display: flex; flex-direction: column; }
.mc-tabs { display: flex; background: #fff; padding: 0 32rpx; }
.mc-tab { flex: 1; text-align: center; padding: 24rpx 0; font-size: 30rpx; color: #666; &.on { color: #ff6600; font-weight: bold; border-bottom: 4rpx solid #ff6600; } }
.mc-list { flex: 1; height: 0; padding: 24rpx; box-sizing: border-box; }
.ticket { display: flex; background: #fff; border-radius: 16rpx; margin-bottom: 24rpx; overflow: hidden; }
.ticket__left { width: 220rpx; background: #ff6600; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 28rpx 0; }
.ticket--used .ticket__left { background: #ccc; }
.ticket__amount { display: flex; align-items: baseline; }
.ticket__symbol { font-size: 28rpx; }
.ticket__num { font-size: 52rpx; font-weight: bold; }
.ticket__unit { font-size: 24rpx; margin-left: 4rpx; }
.ticket__cond { font-size: 22rpx; margin-top: 8rpx; opacity: 0.9; }
.ticket__right { flex: 1; padding: 24rpx; display: flex; flex-direction: column; }
.ticket__name { font-size: 28rpx; color: #333; font-weight: bold; }
.ticket__expire { font-size: 22rpx; color: #999; margin-top: 6rpx; }
.ticket__state { font-size: 22rpx; color: #999; margin-top: 6rpx; }
.ticket__btn { margin-top: 12rpx; align-self: flex-end; background: #ff6600; color: #fff; font-size: 24rpx; padding: 0 28rpx; height: 56rpx; line-height: 56rpx; border-radius: 28rpx; }
.mc-footer { text-align: center; padding: 32rpx 0; font-size: 26rpx; color: #999; }
.empty-wrap { padding-top: 120rpx; }
.scroll-pad { height: 40rpx; }
</style>
```

- [ ] **Step 2: 核对「去使用」跳转语义**

spec §3.1：「有进行中购物车跳 checkout 并预挂此券；无购物车回首页」。checkout 是非 tabBar 页可带参 navigateTo；`useCoupon` 里用 `uni.getStorageSync('cart_has_order')` 判断——**执行时核对 cart store 是否有更可靠的在店判断**（`src/stores/cart.ts` 的 `order`/`isEmpty`）。落地实现：从 store 取（`useCartStore().isEmpty` 取反），预挂券改走 storage `checkout_prefill_coupon`（Task 7 checkout onLoad 读取消费）。上方代码若 store 判断可用则替换 storage 判断。

- [ ] **Step 3: 提交**

```powershell
cd d:\zhao\waimai
git add src/pkg-promotion/pages/my-coupons.vue
git commit -m "feat(coupon): 我的券包页（三态 tab + 去使用）"
```

---

### Task 5: 个人中心激活优惠券入口 + 角标

**Files:**
- Modify: `d:\zhao\waimai\src\pages\profile\index.vue`（L17-26 资产区）

- [ ] **Step 1: 模板——优惠券卡片激活**

把 L18：

```html
<view class="asset-item asset-item--off" @click="comingSoon('优惠券')">
  <text class="asset-item__ico">券</text><text class="asset-item__lbl">优惠券</text><text class="asset-item__hint">即将上线</text>
</view>
```

替换为：

```html
<view class="asset-item" @click="nav('/pkg-promotion/pages/my-coupons')">
  <text class="asset-item__ico">券</text><text class="asset-item__lbl">优惠券</text>
  <text class="asset-item__badge" v-if="unusedCouponCount > 0">{{ unusedCouponCount > 99 ? '99+' : unusedCouponCount }}</text>
</view>
```

- [ ] **Step 2: 脚本——角标计数**

script setup 内（登录态才查）：

```ts
import { getMyCoupons } from '../../api/queries/coupon';

const unusedCouponCount = ref(0);

async function loadCouponBadge() {
    if (!authStore.isLoggedIn) { unusedCouponCount.value = 0; return; }
    try {
        const res = await getMyCoupons('UNUSED');
        unusedCouponCount.value = (res?.myCoupons ?? []).length;
    } catch { unusedCouponCount.value = 0; }
}
```

在既有 `onShow`（若无则 `onMounted`）里调用 `loadCouponBadge()`。执行时按该文件既有的登录态刷新钩子挂载（profile 已有 logged 判断逻辑，跟随其现有 onShow 结构）。

- [ ] **Step 3: 样式——角标**

style 内追加：

```scss
.asset-item__badge { position: absolute; top: 8rpx; right: 8rpx; min-width: 32rpx; height: 32rpx; line-height: 32rpx; padding: 0 8rpx; border-radius: 16rpx; background: #ff4d4f; color: #fff; font-size: 20rpx; text-align: center; }
```

（`.asset-item` 需 `position: relative`，已有则不动。）

- [ ] **Step 4: 手工验证 + 提交**

Run: `cd d:\zhao\waimai; npm run dev:h5`，浏览器 390×844 视口看 profile 页入口与角标。
```powershell
cd d:\zhao\waimai
git add src/pages/profile/index.vue
git commit -m "feat(coupon): 个人中心激活优惠券入口 + 未使用角标"
```

---

### Task 6: 商品行专属券 chip

**Files:**
- Modify: `d:\zhao\waimai\src\pages\shop\menu.vue`（L33-49 商品行 + 脚本）

- [ ] **Step 1: 模板——good-info 内、price-row 之前插入 chip**

L43 `price-row` 之前：

```html
<view class="good-coupon" v-if="couponOf(g)" @tap.stop="claimProduct(couponOf(g))">
  <text class="good-coupon__txt">{{ couponChipText(couponOf(g)) }}</text>
  <text class="good-coupon__action">{{ couponClaimed(g.id) ? '已领取' : '领取' }}</text>
</view>
```

- [ ] **Step 2: 脚本——按需拉取 + 缓存 + 直领**

script setup 内追加（import 区补 `import { getProductCoupons } from '../../api/queries/coupon';` 和 `import { claimProductCoupon } from '../../api/mutations/coupon';`）：

```ts
// ===== 商品专属券 chip：按当前分类商品拉绑定，productId → 绑定（取 displayOrder 首个启用项） =====
const productCouponMap = ref(new Map<string, any>());
const claimedProductIds = ref(new Set<string>());
const claimingProductId = ref('');

function couponOf(g: any): any | null {
    const b = productCouponMap.value.get(String(g.id));
    return b && b.enabled && b.template?.enabled !== false ? b : null;
}

function couponChipText(b: any): string {
    const t = b.template;
    if (t.type === 'FIXED' || t.type === 'FULL') {
        const yuan = t.discountValue / 100;
        const y = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
        return `¥${y} 券`;
    }
    if (t.type === 'PERCENT') return `${(t.discountValue / 10).toFixed(1).replace(/\.0$/, '')}折券`;
    return '免配送费券';
}

function couponClaimed(productId: string): boolean {
    return claimedProductIds.value.has(String(productId));
}

async function loadProductCoupons(goods: any[]) {
    const ids = goods.map(g => String(g.id)).filter(id => !productCouponMap.value.has(id));
    if (!ids.length) return;
    await Promise.all(ids.map(async id => {
        try {
            const res = await getProductCoupons(id);
            const binding = (res?.productCoupons ?? []).filter((b: any) => b.enabled)[0] ?? null;
            productCouponMap.value.set(id, binding);
        } catch { productCouponMap.value.set(id, null); }
    }));
    productCouponMap.value = new Map(productCouponMap.value); // 触发响应式
}

async function claimProduct(binding: any) {
    if (claimedProductIds.value.has(String(binding.productId)) || claimingProductId.value) return;
    if (!authStore.requireLogin()) return;
    claimingProductId.value = String(binding.productId);
    try {
        await claimProductCoupon(binding.id);
        claimedProductIds.value.add(String(binding.productId));
        uni.showToast({ title: '领取成功', icon: 'none' });
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '领取失败', icon: 'none' });
    } finally {
        claimingProductId.value = '';
    }
}
```

在商品列表加载完成处（既有 `goodsOf` 数据源就绪后、本分类渲染时机）调用 `loadProductCoupons(goodsOf(activeCat.value))`——执行时找该文件加载商品/切分类的收口点（`activeCat` watch 或列表加载函数末尾）挂上，并 watch `activeCat` 变更时对新分类商品补拉。

- [ ] **Step 3: 样式**

```scss
.good-coupon { display: inline-flex; align-items: center; gap: 8rpx; margin-top: 8rpx; padding: 2rpx 12rpx; border: 1rpx solid #ff6600; border-radius: 6rpx; background: #fff7f0; }
.good-coupon__txt { font-size: 20rpx; color: #ff6600; }
.good-coupon__action { font-size: 20rpx; color: #fff; background: #ff6600; border-radius: 4rpx; padding: 0 8rpx; }
```

- [ ] **Step 4: 手工验证 + 提交**

Run: dev:h5 进入店铺菜单页，确认有绑定券的商品行显示 chip、点击领取转「已领取」。
```powershell
cd d:\zhao\waimai
git add src/pages/shop/menu.vue
git commit -m "feat(coupon): 商品行专属券 chip（直领）"
```

---

### Task 7: checkout 优惠券行 + 选券弹层 + 自动试挂

**Files:**
- Modify: `d:\zhao\waimai\src\pkg-order\pages\checkout.vue`

- [ ] **Step 1: 模板——费用区插入优惠券行**

L224 `ship-free-hint` 之后、L225 `summary-row--total` 之前插入：

```html
<view class="summary-row summary-row--coupon" @click="openCouponSheet">
  <text>优惠券</text>
  <text :class="{ 'coupon-val': attachedCoupon }">
    {{ couponRowText }}
    <text class="coupon-arrow">›</text>
  </text>
</view>
```

页面底部（template 根内最后）加选券弹层：

```html
<view class="coupon-sheet-mask" v-if="showCouponSheet" @click="showCouponSheet = false">
  <view class="coupon-sheet" @click.stop>
    <view class="coupon-sheet__title">选择优惠券</view>
    <scroll-view scroll-y class="coupon-sheet__list">
      <view class="cs-item" v-for="c in sheetCoupons" :key="c.id"
        :class="{ 'cs-item--on': currentCouponCode === c.code, 'cs-item--off': !!unavailableReason(c) }"
        @click="pickCoupon(c)">
        <view class="cs-item__left">
          <text class="cs-item__amount">{{ csAmount(c) }}</text>
          <text class="cs-item__cond" v-if="c.template.type === 'FULL'">满 {{ csYuan(c.template.minSpend) }} 可用</text>
        </view>
        <view class="cs-item__right">
          <text class="cs-item__name">{{ c.template.name }}</text>
          <text class="cs-item__expire" v-if="c.expiredAt">有效期至 {{ csDate(c.expiredAt) }}</text>
          <text class="cs-item__reason" v-if="unavailableReason(c)">{{ unavailableReason(c) }}</text>
        </view>
      </view>
      <view class="cs-item cs-item--none" @click="clearCoupon">
        <text>不使用优惠券</text>
      </view>
    </scroll-view>
  </view>
</view>
```

- [ ] **Step 2: 脚本——状态 + 自动试挂 + 弹层逻辑**

script setup 追加（import 区补 coupon API 与估算函数）：

```ts
import { getMyCoupons } from '../../api/queries/coupon';
import { applyCouponToOrder, clearCouponFromOrder } from '../../api/mutations/coupon';
import { estimateDiscountFen, pickBestCoupon, couponUnavailableReason, type CouponTemplateLike } from '../../utils/coupon-estimate';

// ===== 优惠券（spec §3.3）=====
const myUnusedCoupons = ref<any[]>([]);
const showCouponSheet = ref(false);
const couponApplying = ref(false);
const autoTried = ref(false); // 每次进入 checkout 只自动试挂一次

const attachedCouponCode = computed(() => cart.order?.couponCodes?.[0] ?? '');

const subtotalFen = computed(() => cart.order?.subTotalWithTax ?? 0);
const shippingFen = computed(() => {
    if (cart.order?.shippingWithTax != null) return cart.order.shippingWithTax;
    return null; // FREE_SHIPPING 估不到配送费时按 0
});

const couponRowText = computed(() => {
    if (attachedCouponCode.value) {
        const d = (cart.order?.discounts ?? []).reduce((s: number, x: any) => s + (x.amountWithTax ?? 0), 0);
        return d > 0 ? `-¥${cart.formatPrice(d)}` : attachedCouponCode.value;
    }
    return myUnusedCoupons.value.length ? `${myUnusedCoupons.value.length} 张可用` : '暂无可用';
});

const attachedCoupon = computed(() => !!attachedCouponCode.value);

const sheetCoupons = computed(() =>
    [...myUnusedCoupons.value].sort((a, b) =>
        estimateDiscountFen(b.template, subtotalFen.value, shippingFen.value) - estimateDiscountFen(a.template, subtotalFen.value, shippingFen.value)));

function unavailableReason(c: any): string | null {
    return couponUnavailableReason(c.template as CouponTemplateLike, subtotalFen.value);
}

function csAmount(c: any): string {
    const t = c.template;
    if (t.type === 'PERCENT') return `${(t.discountValue / 10).toFixed(1).replace(/\.0$/, '')}折`;
    if (t.type === 'FREE_SHIPPING') return '免运费';
    const yuan = t.discountValue / 100;
    return `¥${Number.isInteger(yuan) ? yuan : yuan.toFixed(2)}`;
}

function csYuan(fen: number): string {
    const yuan = fen / 100;
    return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

function csDate(s: string): string {
    const d = new Date(s);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

async function loadMyCoupons() {
    if (!authStore.isLoggedIn) return; // checkout 必然已登录，防御
    try {
        const res = await getMyCoupons('UNUSED');
        myUnusedCoupons.value = res?.myCoupons ?? [];
    } catch { myUnusedCoupons.value = []; }
}

function openCouponSheet() {
    showCouponSheet.value = true;
}

async function pickCoupon(c: any) {
    if (couponApplying.value || unavailableReason(c)) return;
    if (currentCouponCode.value === c.code) { showCouponSheet.value = false; return; }
    couponApplying.value = true;
    try {
        const res = await applyCouponToOrder(c.code);
        cart.setOrder(res.applyCouponToOrder); // 实时回显新合计（Order fragment 已含 couponCodes+discounts）
        showCouponSheet.value = false;
    } catch (e: any) {
        // 并发用掉/订单态变化：toast + 刷新弹层券列表 + 重算费用，不阻塞下单
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '用券失败', icon: 'none' });
        await loadMyCoupons();
    } finally {
        couponApplying.value = false;
    }
}

async function clearCoupon() {
    if (couponApplying.value || !attachedCouponCode.value) { showCouponSheet.value = false; return; }
    couponApplying.value = true;
    try {
        const res = await clearCouponFromOrder();
        cart.setOrder(res.clearCouponFromOrder);
        showCouponSheet.value = false;
    } catch (e: any) {
        uni.showToast({ title: e?.response?.errors?.[0]?.message || '操作失败', icon: 'none' });
    } finally {
        couponApplying.value = false;
    }
}

/** 自动试挂最优（spec §3.3）：进入 checkout 未挂券时按口径取最大者 */
async function tryAutoApplyBest() {
    if (autoTried.value || attachedCouponCode.value || !myUnusedCoupons.value.length) return;
    autoTried.value = true;
    const best = pickBestCoupon(
        myUnusedCoupons.value.map(c => ({ ...c.template, code: c.code })),
        subtotalFen.value, shippingFen.value,
    );
    if (!best) return;
    try {
        const res = await applyCouponToOrder((best as any).code);
        cart.setOrder(res.applyCouponToOrder);
        uni.showToast({ title: '已自动使用最优优惠券', icon: 'none' });
    } catch { /* 试挂失败静默，用户可手动选 */ }
}
```

挂载点：在既有取数收口（购物车已就绪、`cart.order` 非空的时机，通常 onMounted 链尾或 `getActiveOrder` 成功回调后）依次 `await loadMyCoupons(); await tryAutoApplyBest();`。消费「去使用」预挂：onLoad 读 `uni.getStorageSync('checkout_prefill_coupon')`，购物车就绪后若有值且未挂券则 `applyCouponToOrder(该码)` 后 `uni.removeStorageSync` 清掉。

**注意**：`currentCouponCode` 即 `attachedCouponCode`（模板里弹层选中态用它；如命名不一致以实现为准统一为 `attachedCouponCode`）。

- [ ] **Step 3: 样式**

```scss
.summary-row--coupon { cursor: pointer; }
.coupon-val { color: #ff6600; }
.coupon-arrow { color: #c0c0c0; margin-left: 8rpx; }
.coupon-sheet-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 999; display: flex; align-items: flex-end; }
.coupon-sheet { width: 100%; background: #f5f5f5; border-radius: 24rpx 24rpx 0 0; padding: 32rpx 0 calc(32rpx + env(safe-area-inset-bottom)); max-height: 70vh; display: flex; flex-direction: column; }
.coupon-sheet__title { text-align: center; font-size: 30rpx; font-weight: bold; padding-bottom: 24rpx; }
.coupon-sheet__list { max-height: 56vh; padding: 0 24rpx; box-sizing: border-box; }
.cs-item { display: flex; background: #fff; border-radius: 16rpx; margin-bottom: 20rpx; overflow: hidden; &--on { outline: 2rpx solid #ff6600; } &--off { opacity: 0.55; } }
.cs-item__left { width: 200rpx; background: #ff6600; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24rpx 0; }
.cs-item--off .cs-item__left, .cs-item--none .cs-item__left { background: #ccc; }
.cs-item__amount { font-size: 40rpx; font-weight: bold; }
.cs-item__cond { font-size: 20rpx; margin-top: 6rpx; }
.cs-item__right { flex: 1; padding: 20rpx 24rpx; display: flex; flex-direction: column; }
.cs-item__name { font-size: 26rpx; color: #333; }
.cs-item__expire { font-size: 22rpx; color: #999; margin-top: 6rpx; }
.cs-item__reason { font-size: 22rpx; color: #ff4d4f; margin-top: 6rpx; }
.cs-item--none { justify-content: center; padding: 28rpx 0; color: #666; font-size: 26rpx; }
```

- [ ] **Step 4: 手工验证 + 提交**

Run: dev:h5 加购 → checkout：确认自动试挂、弹层换券/不使用实时回显合计、门槛未过券灰态。
```powershell
cd d:\zhao\waimai
git add src/pkg-order/pages/checkout.vue
git commit -m "feat(coupon): checkout 优惠券行 + 选券弹层 + 自动试挂最优"
```

---

### Task 8: 里程碑 1 回归 + 手机截图

- [ ] **Step 1: vitest 全量回归**

Run: `cd d:\zhao\waimai; npx vitest run`
Expected: 全绿（含既有 6 个 spec）

- [ ] **Step 2: 手机视口截图（硬规范 390×844 dpr=2 Playwright）**

用 dev:h5 + Playwright 移动视口截：券中心（可领取/即将开始空态）/ 券包三 tab / checkout 弹层 / 商品行 chip / profile 激活态。脚本仿 `scripts/_smoke_profile.py` 先例，落 `scripts/_smoke_coupon.py`，截图存 `vshop/docs/screenshots/waimai/`。

- [ ] **Step 3: 提交截图脚本**

```powershell
cd d:\zhao\waimai
git add scripts/_smoke_coupon.py
git commit -m "test(coupon): 生产冒烟截图脚本"
```

---

# 里程碑 2：订单状态推送（vendure + web-admin + waimai 收尾）

### Task 9: campus-notify 4 事件扩展 + url 落地页（TDD）

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-notify.service.ts`
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-notify.service.spec.ts`

- [ ] **Step 1: 先加失败测试（追加进既有 describe）**

`campus-notify.service.spec.ts` 的 makeSvc getConfig mock 里补 4 个新字段（`notifyTemplateOrderPlaced/notifyTemplatePaymentPending/notifyTemplateCancelled/notifyTemplateAfterSales: opts.templateId ?? null`），并追加用例：

```ts
it('orderPlaced：映射 thing1=订单支付成功，商家接单中', async () => {
    const { svc, sendTemplate } = makeSvc({ templateId: 'TID', openid: 'o-123' });
    svc.user(makeCtx(), 1, 'orderPlaced');
    await vi.waitFor(() => expect(sendTemplate).toHaveBeenCalled());
    expect(sendTemplate.mock.calls[0][0].data.thing1.value).toBe('订单支付成功，商家接单中');
});

it('paymentPending / orderCancelled / afterSales 文案映射', async () => {
    const { svc, sendTemplate } = makeSvc({ templateId: 'TID', openid: 'o-123' });
    svc.user(makeCtx(), 1, 'paymentPending');
    svc.user(makeCtx(), 1, 'orderCancelled', '订单超时未支付，已自动取消');
    svc.user(makeCtx(), 1, 'afterSales', '退款已到账');
    await vi.waitFor(() => expect(sendTemplate).toHaveBeenCalledTimes(3));
    const things = sendTemplate.mock.calls.map(c => c[0].data.thing1.value);
    expect(things).toContain('订单待支付，请尽快完成');
    expect(things).toContain('订单超时未支付，已自动取消');
    expect(things).toContain('退款已到账');
});

it('配置 h5BaseUrl → url 指向 H5 订单详情（跳转落地页）', async () => {
    const { svc, sendTemplate } = makeSvc({ templateId: 'TID', openid: 'o-123' });
    (svc as any).user(makeCtx(), 1, 'orderPlaced', undefined, 'https://www.yourbao.cn');
    await vi.waitFor(() => expect(sendTemplate).toHaveBeenCalled());
    expect(sendTemplate.mock.calls[0][0].url).toBe('https://www.yourbao.cn/#/pkg-order/pages/order-detail?code=ORD1');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd d:\zhao\vendure; npx vitest run packages/campus-delivery-plugin/src/campus-notify.service.spec.ts`
Expected: FAIL（事件类型/文案不存在）

- [ ] **Step 3: 实现——三表对齐扩展 + url 参数**

`campus-notify.service.ts`：

```ts
/** 用户侧节点通知触点（履约 5 + 用户订单域 4） */
export type CampusNotifyEvent =
    | 'orderAccepted' | 'riderAssigned' | 'cookingDone' | 'orderDelivered' | 'exceptionHandled'
    | 'orderPlaced' | 'paymentPending' | 'orderCancelled' | 'afterSales';

const TEMPLATE_FIELD: Record<CampusNotifyEvent, string> = {
    orderAccepted: 'notifyTemplateAccepted',
    riderAssigned: 'notifyTemplateRiderAssigned',
    cookingDone: 'notifyTemplateCookingDone',
    orderDelivered: 'notifyTemplateDelivered',
    exceptionHandled: 'notifyTemplateExceptionHandled',
    orderPlaced: 'notifyTemplateOrderPlaced',
    paymentPending: 'notifyTemplatePaymentPending',
    orderCancelled: 'notifyTemplateCancelled',
    afterSales: 'notifyTemplateAfterSales',
};

const STATUS_TEXT: Record<CampusNotifyEvent, string> = {
    orderAccepted: '商家已接单，备餐中',
    riderAssigned: '骑手已接单，待取货',
    cookingDone: '出餐完成，等待取货',
    orderDelivered: '订单已送达',
    exceptionHandled: '异常已处理',
    orderPlaced: '订单支付成功，商家接单中',
    paymentPending: '订单待支付，请尽快完成',
    orderCancelled: '订单已取消',
    afterSales: '售后进度更新',
};
```

`user()` 签名加可选 `h5BaseUrl`，`sendTemplate` 调用处带 url：

```ts
user(ctx: RequestContext, orderId: number | string, event: CampusNotifyEvent, text?: string, h5BaseUrl?: string): void {
    // ...（原逻辑不变，仅 sendTemplate 调用改为）
    const res = await wx.sendTemplate({
        touser: openid,
        template_id: templateId,
        data: this.buildData(order.code, event, text),
        ...(h5BaseUrl ? { url: `${h5BaseUrl.replace(/\/$/, '')}/#/pkg-order/pages/order-detail?code=${order.code}` } : {}),
    });
    // ...
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd d:\zhao\vendure; npx vitest run packages/campus-delivery-plugin/src/campus-notify.service.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src/campus-notify.service.ts packages/campus-delivery-plugin/src/campus-notify.service.spec.ts
git commit -m "feat(notify): 订单域 4 事件扩展 + 模板消息 url 落地页"
```

---

### Task 10: 配置链路——实体列 + migration + CRUD + SDL + web-admin

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-fulfillment-config.entity.ts`（L31 之后）
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\migrations\create-campus-tables.ts`（L50 之后）
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\waimai-store.service.ts`（type/input/assign/read 四处）
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-delivery.plugin.ts`（SDL L246-281 两处）
- Modify: `d:\zhao\vshop\web-admin\src\apis\campus.ts`、`src\pages\campus\config.vue`、web-admin 语言包

- [ ] **Step 1: 实体列**

`campus-fulfillment-config.entity.ts` 在 `notifyTemplateExceptionHandled` 之后追加：

```ts
// 订单域通知（spec §4.1）：4 个模板 ID + H5 落地页域名（禁硬编码域名，per-channel 配置）
@Column({ type: 'varchar', nullable: true }) notifyTemplateOrderPlaced: string | null; // 下单成功
@Column({ type: 'varchar', nullable: true }) notifyTemplatePaymentPending: string | null; // 待付款提醒
@Column({ type: 'varchar', nullable: true }) notifyTemplateCancelled: string | null; // 取消通知
@Column({ type: 'varchar', nullable: true }) notifyTemplateAfterSales: string | null; // 售后进度
@Column({ type: 'varchar', nullable: true }) h5BaseUrl: string | null; // C 端 H5 站点 origin，如 https://www.yourbao.cn
```

- [ ] **Step 2: 启动幂等 migration**

`create-campus-tables.ts` SQL 串末尾（L50 之后、riderLat 注释之前）追加：

```sql
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "notifyTemplateOrderPlaced" varchar;
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "notifyTemplatePaymentPending" varchar;
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "notifyTemplateCancelled" varchar;
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "notifyTemplateAfterSales" varchar;
ALTER TABLE campus_fulfillment_config ADD COLUMN IF NOT EXISTS "h5BaseUrl" varchar(255);
```

- [ ] **Step 3: waimai-store.service.ts CRUD 补字段**

四处对称追加（`CampusStoreConfig` 接口 L36-40 区、input 接口 L117-121 区、update 赋值 L146-148 区、读映射 L206-208 区）：

```ts
// 接口/input 各加：
notifyTemplateOrderPlaced: string | null;   // input 侧为 string | null | undefined
notifyTemplatePaymentPending: string | null;
notifyTemplateCancelled: string | null;
notifyTemplateAfterSales: string | null;
h5BaseUrl: string | null;
// update 赋值：
cfg.notifyTemplateOrderPlaced = input.notifyTemplateOrderPlaced ?? null;
cfg.notifyTemplatePaymentPending = input.notifyTemplatePaymentPending ?? null;
cfg.notifyTemplateCancelled = input.notifyTemplateCancelled ?? null;
cfg.notifyTemplateAfterSales = input.notifyTemplateAfterSales ?? null;
cfg.h5BaseUrl = input.h5BaseUrl ?? null;
// 读映射：
notifyTemplateOrderPlaced: cfg?.notifyTemplateOrderPlaced ?? null,
notifyTemplatePaymentPending: cfg?.notifyTemplatePaymentPending ?? null,
notifyTemplateCancelled: cfg?.notifyTemplateCancelled ?? null,
notifyTemplateAfterSales: cfg?.notifyTemplateAfterSales ?? null,
h5BaseUrl: cfg?.h5BaseUrl ?? null,
```

（若既有 spec `waimai-store.service.spec.ts` 的 stub 需补字段以过类型，一并补。）

- [ ] **Step 4: SDL 两处**

`campus-delivery.plugin.ts` 的 `CampusStoreConfigWithChannel`（L259-263 之后）与 `CampusStoreConfigInput`（L276-280 之后）各追加：

```graphql
notifyTemplateOrderPlaced: String
notifyTemplatePaymentPending: String
notifyTemplateCancelled: String
notifyTemplateAfterSales: String
h5BaseUrl: String
```

（Input 类型同字段，可空。）

- [ ] **Step 5: web-admin 配置页**

`vshop/web-admin/src/apis/campus.ts`：类型补 5 字段（与 Step 3 同名）。
`vshop/web-admin/src/pages/campus/config.vue`：
- `CardForm` 接口（L115-126 区）补 5 字段 `: string;`
- `toForm`（L147-151 区）补 `notifyTemplateOrderPlaced: c.notifyTemplateOrderPlaced ?? '',` 等 5 行
- 提交 payload（L209-213 区）补 `notifyTemplateOrderPlaced: f.notifyTemplateOrderPlaced.trim() || null,` 等 5 行
- 通知分区模板（L62-66 之后）补 4 个 cell：

```html
<view class="cell">
  <text class="lbl">{{ $t('campusConfig.notifyOrderPlaced') }}</text>
  <input v-model="card.form.notifyTemplateOrderPlaced" :placeholder="$t('campusConfig.notifyPh')" />
</view>
<view class="cell">
  <text class="lbl">{{ $t('campusConfig.notifyPaymentPending') }}</text>
  <input v-model="card.form.notifyTemplatePaymentPending" :placeholder="$t('campusConfig.notifyPh')" />
</view>
<view class="cell">
  <text class="lbl">{{ $t('campusConfig.notifyCancelled') }}</text>
  <input v-model="card.form.notifyTemplateCancelled" :placeholder="$t('campusConfig.notifyPh')" />
</view>
<view class="cell">
  <text class="lbl">{{ $t('campusConfig.notifyAfterSales') }}</text>
  <input v-model="card.form.notifyTemplateAfterSales" :placeholder="$t('campusConfig.notifyPh')" />
</view>
<view class="cell">
  <text class="lbl">{{ $t('campusConfig.h5BaseUrl') }}</text>
  <input v-model="card.form.h5BaseUrl" :placeholder="$t('campusConfig.h5BaseUrlPh')" />
</view>
```

- 语言包（执行时 `Grep 'notifyAccepted'` 定位 web-admin 语言文件）：zh 补

```ts
notifyOrderPlaced: '下单成功模板ID', notifyPaymentPending: '待付款提醒模板ID',
notifyCancelled: '取消通知模板ID', notifyAfterSales: '售后进度模板ID',
h5BaseUrl: 'H5站点域名', h5BaseUrlPh: '如 https://www.yourbao.cn（用于模板消息跳转）',
```

en 同步补英文对应词条（`Order placed template ID` 等）。

- [ ] **Step 6: vendure 单测 + 构建 + 提交**

Run: `cd d:\zhao\vendure; npx vitest run packages/campus-delivery-plugin`，Expected: 全绿
Run: `cd d:\zhao\vendure; npm run build`（lib 产物刷新）
```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src packages/campus-delivery-plugin/lib packages/coupon-plugin 2>$null
git commit -m "feat(campus): 订单域通知配置 5 字段（4 模板ID + h5BaseUrl）全链路"
cd d:\zhao\vshop
git add web-admin/src
git commit -m "feat(campus-config): 订单域通知模板 ID + H5 域名配置项"
```

---

### Task 11: coupon-plugin 加 couponCentreUpcoming（即将开始 tab 数据源）

**Files:**
- Modify: `d:\zhao\vendure\packages\coupon-plugin\src\coupon.service.ts`（couponCentre 之后 L365）
- Modify: `d:\zhao\vendure\packages\coupon-plugin\src\coupon-shop.resolver.ts`
- Modify: `d:\zhao\vendure\packages\coupon-plugin\src\plugin.ts`（SDL L523 旁）

- [ ] **Step 1: service**

`coupon.service.ts` 紧跟 `couponCentre` 方法后追加（复用其渠道/scene 过滤，时间窗反向）：

```ts
/** 领券中心「即将开始」：enabled 且 startsAt 在未来的券模板（与 couponCentre 同渠道/scene 口径） */
async couponCentreUpcoming(ctx: RequestContext): Promise<CouponTemplate[]> {
    const repo = this.connection.getRepository(ctx, CouponTemplate);
    const now = new Date();
    const own = await repo
        .createQueryBuilder('tpl')
        .innerJoin('tpl.channels', 'channel', 'channel.id = :channelId', { channelId: ctx.channelId })
        .where('tpl.enabled = :enabled', { enabled: true })
        .andWhere('tpl.startsAt > :now', { now })
        .getMany();
    return filterTemplatesByChannelAndScene(own, 'CENTRE', 'ONLINE');
}
```

（默认商城租户券合并逻辑与 couponCentre L342-364 相同的 extra 追加可省——即将开始券按本渠道展示即可，YAGNI。）

- [ ] **Step 2: resolver + SDL**

`coupon-shop.resolver.ts`：

```ts
@Query()
async couponCentreUpcoming(@Ctx() ctx: RequestContext) {
    return this.couponService.couponCentreUpcoming(ctx);
}
```

`plugin.ts` SDL Query 块（L523 旁）加：`couponCentreUpcoming: [CouponTemplate!]!`

- [ ] **Step 3: 构建 + 提交**

Run: `cd d:\zhao\vendure; npm run build`
```powershell
cd d:\zhao\vendure
git add packages/coupon-plugin/src packages/coupon-plugin/lib
git commit -m "feat(coupon): couponCentreUpcoming 查询（即将开始 tab 数据源）"
```

---

### Task 12: payment-timeout 任务实体 + Job + 补偿扫描

**Files:**
- Create: `d:\zhao\vendure\packages\campus-delivery-plugin\src\payment-timeout.entity.ts`
- Create: `d:\zhao\vendure\packages\campus-delivery-plugin\src\payment-timeout.job.ts`
- Test: `d:\zhao\vendure\packages\campus-delivery-plugin\src\payment-timeout.job.spec.ts`

- [ ] **Step 1: 任务实体**

```ts
import { Column, Entity } from 'typeorm';
import { DeepPartial, ID, VendureEntity } from '@vendure/core';

export enum PaymentTimeoutType { REMIND = 'REMIND', CANCEL = 'CANCEL' }
export enum PaymentTimeoutStatus { PENDING = 'PENDING', EXECUTED = 'EXECUTED', CANCELLED = 'CANCELLED', FAILED = 'FAILED' }

/** 待付款定时任务：订单进入 ArrangingPayment 时登记 +10min 提醒 / +15min 取消（时长常量，spec §4.3） */
@Entity()
export class PaymentTimeoutTask extends VendureEntity {
    [key: string]: any;
    @Column('int') orderId: ID;
    @Column('int') channelId: ID;
    @Column({ type: 'varchar' }) type: PaymentTimeoutType;
    @Column({ type: 'timestamptz' }) dueAt: Date;
    @Column({ type: 'varchar', default: PaymentTimeoutStatus.PENDING }) status: PaymentTimeoutStatus;
    @Column({ type: 'varchar' }) expectedState: string; // 登记 时订单状态（到点复查）
    @Column({ type: 'int', default: 0 }) retryCount: number;
    @Column({ type: 'varchar', nullable: true }) lastError: string | null;
    constructor(input?: DeepPartial<PaymentTimeoutTask>) { super(input); }
}
```

- [ ] **Step 2: 先写失败测试（核心：到点复查三态 + 取消先释放库存）**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PaymentTimeoutJob, PAYMENT_REMIND_MS, PAYMENT_CANCEL_MS } from './payment-timeout.job';
import { PaymentTimeoutStatus, PaymentTimeoutType } from './payment-timeout.entity';

describe('PaymentTimeoutJob', () => {
    function makeJob(opts: { orderState: string; dueAtPast?: boolean }) {
        const task = {
            id: 1, orderId: 11, channelId: 7, type: PaymentTimeoutType.CANCEL,
            dueAt: new Date(Date.now() - (opts.dueAtPast === false ? 60_000 : -1)),
            status: PaymentTimeoutStatus.PENDING, expectedState: 'ArrangingPayment', retryCount: 0, lastError: null,
        };
        const taskRepo = {
            findOne: vi.fn().mockResolvedValue(task),
            save: vi.fn().mockImplementation(async (t: any) => t),
            find: vi.fn().mockResolvedValue([]),
        };
        const order = { id: 11, code: 'ORD1', state: opts.orderState, lines: [{ id: 'L1', quantity: 1 }] };
        const orderService = {
            findOne: vi.fn().mockResolvedValue(order),
            cancelOrder: vi.fn().mockResolvedValue(order),
        };
        const stockMovementService = { createReleasesForOrderLines: vi.fn().mockResolvedValue([]) };
        const notify = { user: vi.fn() };
        const job = new PaymentTimeoutJob(
            { getRepository: () => taskRepo } as any,
            { findOne: vi.fn().mockResolvedValue({}) } as any, // channelService
            orderService, stockMovementService, notify,
        );
        return { job, taskRepo, task, orderService, stockMovementService, notify, order };
    }

    beforeEach(() => vi.clearAllMocks());

    it('到点订单已支付（非 ArrangingPayment）→ 任务 CANCELLED，不取消订单', async () => {
        const { job, taskRepo, orderService } = makeJob({ orderState: 'PaymentSettled' });
        await job.process({ taskId: 1 } as any);
        expect(taskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: PaymentTimeoutStatus.CANCELLED }));
        expect(orderService.cancelOrder).not.toHaveBeenCalled();
    });

    it('到点仍在 ArrangingPayment（CANCEL 型）→ 先释放库存分配再 cancelOrder + 发取消通知', async () => {
        const { job, taskRepo, stockMovementService, orderService, notify } = makeJob({ orderState: 'ArrangingPayment' });
        await job.process({ taskId: 1 } as any);
        expect(stockMovementService.createReleasesForOrderLines).toHaveBeenCalledWith(
            expect.anything(), [{ orderLineId: 'L1', quantity: 1 }],
        );
        expect(orderService.cancelOrder).toHaveBeenCalled();
        expect(notify.user).toHaveBeenCalledWith(expect.anything(), 11, 'orderCancelled', '订单超时未支付，已自动取消', undefined);
        expect(taskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: PaymentTimeoutStatus.EXECUTED }));
    });

    it('REMIND 型到点仍在待支付 → 发提醒，不动订单', async () => {
        const { job, task, notify, orderService } = makeJob({ orderState: 'ArrangingPayment' });
        task.type = PaymentTimeoutType.REMIND;
        await job.process({ taskId: 1 } as any);
        expect(notify.user).toHaveBeenCalledWith(expect.anything(), 11, 'paymentPending');
        expect(orderService.cancelOrder).not.toHaveBeenCalled();
    });

    it('未到 dueAt → 跳过保持 PENDING（SQL JobQueue 忽略 delay 兜底语义）', async () => {
        const { job, taskRepo } = makeJob({ orderState: 'ArrangingPayment', dueAtPast: false });
        await job.process({ taskId: 1 } as any);
        expect(taskRepo.save).not.toHaveBeenCalled();
    });

    it('常量：提醒 10 分钟 / 取消 15 分钟', () => {
        expect(PAYMENT_REMIND_MS).toBe(10 * 60 * 1000);
        expect(PAYMENT_CANCEL_MS).toBe(15 * 60 * 1000);
    });
});
```

Run: `cd d:\zhao\vendure; npx vitest run packages/campus-delivery-plugin/src/payment-timeout.job.spec.ts` → Expected: FAIL（模块不存在）

- [ ] **Step 3: Job 实现**

```ts
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
    ChannelService, Injector, JobQueue, JobQueueService, Logger,
    Order, OrderService, RequestContext, StockMovementService, TransactionalConnection,
} from '@vendure/core';

import { CampusNotifyService } from './campus-notify.service';
import { PaymentTimeoutStatus, PaymentTimeoutTask, PaymentTimeoutType } from './payment-timeout.entity';

export interface PaymentTimeoutJobData { taskId: number; }

/** 待付款提醒 / 超时取消（时长常量，不做配置，spec §4.3） */
export const PAYMENT_REMIND_MS = 10 * 60 * 1000;
export const PAYMENT_CANCEL_MS = 15 * 60 * 1000;
const MAX_RETRY = 3;
const loggerCtx = 'PaymentTimeout';

/**
 * 到点复查是竞态防线：任务执行时订单已离开 ArrangingPayment（已支付/已取消）→ 任务作废。
 * 取消路径按 order-timeout-plugin 先例：先显式释放库存分配（active 订单 cancelOrder 不释放），
 * 再 cancelOrder。与 OrderTimeoutPlugin（渠道 30min 兜底）共存，幂等无害。
 */
@Injectable()
export class PaymentTimeoutJob {
    private jobQueue!: JobQueue<PaymentTimeoutJobData>;
    private taskRepo = this.connection.rawConnection.getRepository(PaymentTimeoutTask);
    private injector = new Injector(this.moduleRef);

    constructor(
        private connection: TransactionalConnection,
        private moduleRef: ModuleRef,
        private orderService: OrderService,
        private stockMovementService: StockMovementService,
        private notify: CampusNotifyService,
    ) {}

    async init(): Promise<void> {
        this.jobQueue = await this.jobQueueService.createQueue({
            name: 'payment-timeout',
            process: async (job) => { await this.process(job.data); },
        });
    }

    async process(data: PaymentTimeoutJobData): Promise<void> {
        const task = await this.taskRepo.findOne({ where: { id: data.taskId as any } });
        if (!task || task.status !== PaymentTimeoutStatus.PENDING) return;
        if (new Date() < new Date(task.dueAt)) return; // SQL JobQueue 忽略 delay → 补偿扫描兜底

        try {
            const ctx = await this.buildCtx(task.channelId);
            if (!ctx) throw new Error(`Channel ${task.channelId} not found`);
            const order = await this.orderService.findOne(ctx, task.orderId as any);
            if (!order || order.state !== task.expectedState) {
                task.status = PaymentTimeoutStatus.CANCELLED;
                await this.taskRepo.save(task);
                Logger.info(`Task ${task.id} stale (order state=${order?.state}), CANCELLED`, loggerCtx);
                return;
            }
            if (task.type === PaymentTimeoutType.REMIND) {
                this.notify.user(ctx, order.id, 'paymentPending', undefined, await this.h5Base(ctx));
            } else {
                // 先释放库存分配再取消（order-timeout.job.ts 先例），失败即抛走重试
                const lines = (order.lines ?? []).map((l: any) => ({ orderLineId: l.id, quantity: l.quantity }));
                if (lines.length) await this.stockMovementService.createReleasesForOrderLines(ctx, lines as any);
                await this.orderService.cancelOrder(ctx, { orderId: order.id as any });
                this.notify.user(ctx, order.id, 'orderCancelled', '订单超时未支付，已自动取消', await this.h5Base(ctx));
            }
            task.status = PaymentTimeoutStatus.EXECUTED;
            task.lastError = null;
            await this.taskRepo.save(task);
        } catch (e: any) {
            task.retryCount += 1;
            task.lastError = String(e?.message ?? e);
            if (task.retryCount >= MAX_RETRY) task.status = PaymentTimeoutStatus.FAILED;
            await this.taskRepo.save(task);
            Logger.warn(`Task ${task.id} failed (${task.retryCount}/${MAX_RETRY}): ${task.lastError}`, loggerCtx);
            if (task.status !== PaymentTimeoutStatus.FAILED) throw e; // 未耗尽才重抛触发队列重试
        }
    }

    /** 登记：进入 ArrangingPayment 时调用（提醒 + 取消两个任务） */
    async scheduleForOrder(ctx: RequestContext, orderId: number, channelId: number, expectedState: string): Promise<void> {
        for (const [type, delayMs] of [[PaymentTimeoutType.REMIND, PAYMENT_REMIND_MS], [PaymentTimeoutType.CANCEL, PAYMENT_CANCEL_MS]] as const) {
            const task = await this.taskRepo.save(this.taskRepo.create({
                orderId, channelId, type, expectedState,
                dueAt: new Date(Date.now() + delayMs),
                status: PaymentTimeoutStatus.PENDING, retryCount: 0,
            }));
            await this.jobQueue.add({ taskId: Number(task.id) }, { delay: delayMs, retries: MAX_RETRY } as any);
        }
        Logger.info(`payment timeout scheduled for order ${orderId} (+10min remind / +15min cancel)`, loggerCtx);
    }

    /** 离开 ArrangingPayment → 作废该订单全部 PENDING 任务 */
    async cancelForOrder(orderId: number): Promise<void> {
        const pending = await this.taskRepo.find({ where: { orderId, status: PaymentTimeoutStatus.PENDING } as any });
        for (const t of pending) {
            t.status = PaymentTimeoutStatus.CANCELLED;
            await this.taskRepo.save(t);
        }
    }

    /** 补偿扫描：捡起 dueAt 已过的 PENDING 任务重新入队 */
    async runCompensation(): Promise<void> {
        const now = new Date();
        const overdue = await this.taskRepo.createQueryBuilder('t')
            .where('t.status = :status', { status: PaymentTimeoutStatus.PENDING })
            .andWhere('t.dueAt < :now', { now })
            .andWhere('t.retryCount < :max', { max: MAX_RETRY })
            .getMany();
        for (const t of overdue) {
            await this.jobQueue.add({ taskId: Number(t.id) }, { retries: MAX_RETRY } as any);
        }
    }

    private async h5Base(ctx: RequestContext): Promise<string | undefined> {
        try {
            const cfg = await (this.injector.get(await import('./campus-config.service')).CampusConfigService as any)?.getConfig?.(ctx);
            return undefined; // 见下方说明：h5Base 由 plugin 接线层取 config 后传入，此处恒 undefined
        } catch { return undefined; }
    }

    private async buildCtx(channelId: number): Promise<RequestContext | null> {
        const channelService = this.injector.get(ChannelService);
        const channel = await channelService.findOne(RequestContext.empty(), channelId as any);
        if (!channel) return null;
        return new RequestContext({ apiType: 'admin', channel, isAuthorized: true, authorizedAsOwnerOnly: false });
    }
}
```

**执行修正说明（写代码时落实，不留坑）**：`h5Base` 上面的占位实现是错的——正确做法是构造器注入 `CampusConfigService`（campus-delivery-plugin 内部 provider，无循环依赖），`h5Base` 改为：

```ts
constructor(
    private connection: TransactionalConnection,
    private moduleRef: ModuleRef,
    private orderService: OrderService,
    private stockMovementService: StockMovementService,
    private notify: CampusNotifyService,
    private campusConfig: CampusConfigService,
) {}
// ...
private async h5Base(ctx: RequestContext): Promise<string | undefined> {
    try {
        const cfg = await this.campusConfig.getConfig(ctx);
        return (cfg as any)?.h5BaseUrl ?? undefined;
    } catch { return undefined; }
}
```

对应单测 makeJob 构造器多传 `{ getConfig: vi.fn().mockResolvedValue({ h5BaseUrl: null }) }`，取消通知断言保持 `undefined` 尾参。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd d:\zhao\vendure; npx vitest run packages/campus-delivery-plugin/src/payment-timeout.job.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src/payment-timeout.entity.ts packages/campus-delivery-plugin/src/payment-timeout.job.ts packages/campus-delivery-plugin/src/payment-timeout.job.spec.ts
git commit -m "feat(campus): 待付款提醒/超时取消定时任务（到点复查 + 先释放库存再取消）"
```

---

### Task 13: 插件接线——实体注册 + 补偿任务 + 4 类事件订阅 + 建表 SQL

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\campus-delivery.plugin.ts`
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\migrations\create-campus-tables.ts`

- [ ] **Step 1: 建表 SQL**

`create-campus-tables.ts` SQL 串追加：

```sql
CREATE TABLE IF NOT EXISTS payment_timeout_task (
  id SERIAL PRIMARY KEY, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(),
  "orderId" int NOT NULL, "channelId" int NOT NULL, type varchar(255) NOT NULL,
  "dueAt" timestamptz NOT NULL, status varchar(255) DEFAULT 'PENDING',
  "expectedState" varchar(255) NOT NULL, "retryCount" int DEFAULT 0, "lastError" varchar(255));
```

- [ ] **Step 2: 插件注册与订阅接线**

`campus-delivery.plugin.ts`：

1. entities 数组加 `PaymentTimeoutTask`；providers 加 `PaymentTimeoutJob`（import 同）
2. `configuration` 钩子幂等注册补偿任务（照抄 OrderTimeoutPlugin 模式）：

```ts
const PAYMENT_TIMEOUT_COMPENSATION = 'payment-timeout-compensation';
const paymentTimeoutCompensation = new ScheduledTask({
    id: PAYMENT_TIMEOUT_COMPENSATION,
    description: 'Scan overdue PaymentTimeoutTask records and re-enqueue them',
    schedule: cron => cron.every(5).minutes(),
    async execute({ injector }) {
        await injector.get(PaymentTimeoutJob).runCompensation();
    },
});
// configuration 内：
config.schedulerOptions.tasks = config.schedulerOptions.tasks ?? [];
if (!config.schedulerOptions.tasks.some(t => t.id === PAYMENT_TIMEOUT_COMPENSATION)) {
    config.schedulerOptions.tasks.push(paymentTimeoutCompensation);
}
```

3. `onApplicationBootstrap`（L587-602 区）接线：

```ts
// 启动 JobQueue
void this.injector.get(PaymentTimeoutJob).init();

// 下单成功通知（waimai 流程下单即支付完成；进大厅逻辑同源）
this.eventBus.ofType(OrderPlacedEvent).subscribe(({ ctx, order }) => {
    this.hallService.onOrderPlaced(ctx, order).catch(e => Logger.error(String(e), 'CampusHall'));
    this.notify.user(ctx, order.id, 'orderPlaced');
});

// 状态流转：进/离 ArrangingPayment 登记与作废；终态取消通知（过滤用户本人取消）
this.eventBus.ofType(OrderStateTransitionEvent).subscribe(e => {
    this.r4TagService.tagR4(e).catch(err => Logger.error(`R4 tag failed: ${String(err)}`, 'CampusR4Tag'));
    if (e.toState === 'Cancelled') {
        this.hallService.exitHall(e.ctx, e.order).catch(err => Logger.error(`Hall exit failed: ${String(err)}`, 'CampusHall'));
        // 用户本人主动取消不推（ctx.activeUserId 存在即本人操作）；商家/系统/超时取消才推
        if (!e.ctx.activeUserId) {
            this.notify.user(e.ctx, e.order.id, 'orderCancelled');
        }
    }
    if (e.fromState === 'ArrangingPayment' && e.toState !== 'ArrangingPayment') {
        void this.paymentTimeout.cancelForOrder(e.order.id).catch(err => Logger.warn(String(err), 'PaymentTimeout'));
    }
    if (e.toState === 'ArrangingPayment') {
        void this.paymentTimeout.scheduleForOrder(e.ctx, e.order.id, e.ctx.channelId, e.toState)
            .catch(err => Logger.warn(`schedule payment timeout failed: ${String(err)}`, 'PaymentTimeout'));
    }
});

// 售后进度：Approved / Refunded / RefundFailed 三个用户侧节点
this.eventBus.ofType(AfterSalesStateTransitionEvent).subscribe(e => {
    const text = e.toState === 'Approved' ? '售后审核通过'
        : e.toState === 'Refunded' ? '退款已到账'
        : e.toState === 'RefundFailed' ? '退款失败，请联系客服'
        : null;
    if (!text) return;
    this.notify.user(e.ctx, e.orderId, 'afterSales', text);
});
```

4. 构造器注入 `private notify: CampusNotifyService`、`private paymentTimeout: PaymentTimeoutJob`（若 CampusNotifyService 已在 providers 且未注入则补；import 区补 `AfterSalesStateTransitionEvent`（来自 `@vendure/after-sales-plugin`）与 `ScheduledTask`）。

- [ ] **Step 3: 回归 + 构建 + 提交**

Run: `cd d:\zhao\vendure; npx vitest run packages/campus-delivery-plugin`，Expected: 全绿
Run: `cd d:\zhao\vendure; npm run build`
```powershell
cd d:\zhao\vendure
git add packages/campus-delivery-plugin/src packages/campus-delivery-plugin/lib
git commit -m "feat(campus): 插件接线——待付款任务注册 + 订单域 4 事件订阅"
```

---

### Task 14: waimai 即将开始 tab 接入

**Files:**
- Modify: `d:\zhao\waimai\src\api\queries\coupon.ts`
- Modify: `d:\zhao\waimai\src\pkg-promotion\pages\coupon-centre.vue`

- [ ] **Step 1: queries/coupon.ts 加查询**

```ts
/** 领券中心「即将开始」：startsAt 在未来的券模板 */
export async function getCouponCentreUpcoming() {
    const client = getGraphQLClient();
    const query = `query CouponCentreUpcoming { couponCentreUpcoming { ${COUPON_TEMPLATE_FIELDS} } }`;
    return client.request(query);
}
```

- [ ] **Step 2: coupon-centre.vue 接数据**

`load()` 内 load 后补：

```ts
try {
    const up = await getCouponCentreUpcoming();
    upcomingList.value = up?.couponCentreUpcoming ?? [];
} catch { upcomingList.value = []; }
```

- [ ] **Step 3: 验证 + 提交**

Run: dev:h5 看两 tab 数据。
```powershell
cd d:\zhao\waimai
git add src/api/queries/coupon.ts src/pkg-promotion/pages/coupon-centre.vue
git commit -m "feat(coupon): 领券中心接入即将开始 tab"
```

---

### Task 15: 部署 + 生产冒烟 + 手机截图 + 操作手册

- [ ] **Step 1: 本地构建（部署铁律：绝不在服务器构建）**

Run: `cd d:\zhao\vendure; npm run build`; `cd d:\zhao\waimai; npm run build:h5`; web-admin 构建（执行时查 web-admin 既有 deploy 脚本惯例）

- [ ] **Step 2: 提交推送 + 部署**

```powershell
cd d:\zhao\vendure; git push
# 服务器：git pull --ff-only + pm2 restart vendure（启动 ~6 分钟，ss -tln | grep 3020 确认）
cd d:\zhao\waimai; node .secrets/deploy-waimai.mjs
# web-admin 走其 deploy.mjs 惯例
```

- [ ] **Step 3: 公众号模板 ID 配置（运维项）**

在 web-admin campus 配置页为每个店铺渠道填 4 个新模板 ID（下单成功/待付款提醒/取消通知/售后进度）+ h5BaseUrl。**提醒用户：需先在公众号后台申领 4 个订单类模板，把模板 ID 填入。**

- [ ] **Step 4: 生产冒烟（幂等可重跑，`scripts/_smoke_coupon.py`）**

链路 A（券）：登录 smoke 账号 → 领券中心领券 → profile 角标 +1 → 加购 → checkout 自动试挂 → 换券/不使用 → 支付（ ArrangingPayment 正常流转）→ 券转 USED → 角标减少。
链路 B（推送）：创建测试单停在待支付 → +10min 收 paymentPending 推送 → +15min 订单被自动取消并收 orderCancelled 推送（需真实公众号配置；无手机验证则用 pm2 日志 `PaymentTimeout`/`CampusNotify` 关键字确认发送调用）。

- [ ] **Step 5: 手机截图（390×844 dpr=2）逐张目检入库操作手册**

- [ ] **Step 6: 操作手册**

`vshop/docs/waimai-操作手册.md` 追加「优惠券」「订单通知」两章：功能入口截图 + 公众号模板 ID 配置指引 + h5BaseUrl 说明。

- [ ] **Step 7: 收尾一气呵成**

```powershell
cd d:\zhao\vshop; git add docs; git commit -m "docs: waimai 操作手册补优惠券/订单通知章节"; git push
cd d:\zhao\waimai; git add -A; git status; git commit -m "chore: 优惠券里程碑收尾"; git push
```

（waimai `git add -A` 前先 `git status` 逐项确认，只提交本计划相关文件，不夹带并行会话在途变更。）

---

## Self-Review 记录

1. **Spec 覆盖**：§3.1 两页（Task 3/4）、§3.2 四处改造（Task 5/6/7、order-detail 零改动）、§3.3 数据流（Task 7 + Task 1 纯函数）、§3.4 i18n（按仓库惯例硬编码中文，spec 偏差已在关键事实注明）、§4.1 四事件（Task 9/13）、§4.2 三节点（Task 13）、§4.3 定时任务（Task 12/13，含库存释放修正）、§5 错误处理（各 Task 内嵌）、§7 测试交付（Task 8/15）。「即将开始」tab 数据源补在 Task 11/14（spec 偏差：`couponCentre` 只返回已开始券）。
2. **占位符扫描**：Task 5/6 有两处「执行时找挂载点」——已给出锚点线索（既有 onShow/商品加载收口）与完整代码，属插入定位而非设计缺口；Task 12 h5Base 占位实现已当场给出正确版本与说明。
3. **类型一致性**：`CampusNotifyEvent` 新值/`TEMPLATE_FIELD`/`STATUS_TEXT` 三表一致（Task 9=Task 13）；`notifyTemplate*` 5 字段命名在实体/migration/CRUD/SDL/web-admin 五处一致；`PaymentTimeoutType/Status` 与 job/entity 一致；`estimateDiscountFen` 签名与 Task 7 调用一致。
