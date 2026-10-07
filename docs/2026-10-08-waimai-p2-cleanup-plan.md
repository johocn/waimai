# waimai 二期收尾包实施计划（提现防重 + 三项验证收口）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐骑手提现防重申请缺口（唯一代码改动），并对提现/JSAPI/调度三项完成生产验证收口（E2E + 手机截图 + 手册 + 提交推送）。

**Architecture:** 防重加在 vendure campus-delivery-plugin `RiderWalletService.riderWithdraw`（申请前查 PENDING 存在即拒绝）；E2E 复用 `.secrets/rider-withdraw-e2e.cjs` 扩防重用例；截图用 Playwright token 注入（localStorage `auth_token`，避开生产 SSO 登录跳转）；调度核验走 admin-api `campusConfig`。

**Tech Stack:** Vendure 3.6.4 插件（TypeScript + vitest + tsc）、uniapp H5（waimai）、web-admin（uniapp H5）、Node 原生 fetch 脚本、Playwright。

**对应 spec:** `docs/2026-10-08-waimai-p2-cleanup-design.md`（v2 收口口径）。

**执行环境注意（PowerShell）:** 不支持 `&&`（用 `;` 分条）；`git commit` 多行 message 用 `-F 临时文件`；ssh 远程命令整段 base64 编码传递。

---

### Task 1: 防重申请——先写失败单测

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\rider-wallet.service.spec.ts`（`make()` 内 repo mock，约 L25-32；describe 末尾约 L92 后追加用例）

- [ ] **Step 1: repo mock 增加 count**

将 `make()` 中的 repo 定义（原代码）：

```ts
    const repo = {
        save: vi.fn().mockImplementation((v: any) => {
            saved.push(v);
            return Promise.resolve(v);
        }),
        findOne: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
    };
```

改为（新增 `count` 一行）：

```ts
    const repo = {
        save: vi.fn().mockImplementation((v: any) => {
            saved.push(v);
            return Promise.resolve(v);
        }),
        findOne: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
    };
```

- [ ] **Step 2: 追加防重失败测试**

在 `describe('RiderWalletService', ...)` 末尾（「管理端跨渠道可审核」用例之后、收尾 `});` 之前）追加：

```ts
    it('withdraw 已有 PENDING 申请时拒绝（防重复申请）', async () => {
        const { svc, repo } = make();
        repo.count.mockResolvedValue(1);
        mocks.port.getBalance.mockResolvedValue(50000);
        await expect(svc.riderWithdraw(ctx, { amount: 2000, channel: '支付宝', account: 'a@b.c' })).rejects.toThrow(
            '您有审核中的提现申请',
        );
        expect(mocks.port.deductBalance).not.toHaveBeenCalled();
    });
```

- [ ] **Step 3: 运行确认失败**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run rider-wallet`
Expected: 新用例 **FAIL**（收到的是成功结果而非「您有审核中的提现申请」），其余 5 个 PASS。

### Task 2: 防重实现 + 构建 + 提交

**Files:**
- Modify: `d:\zhao\vendure\packages\campus-delivery-plugin\src\rider-wallet.service.ts:67-88`（`riderWithdraw` 函数整体替换）

- [ ] **Step 1: 实现 PENDING 拦截**

将 `riderWithdraw` 函数（原 L67-88）整体替换为：

```ts
    /** 提现申请：校验骑手 + ≥¥10 + 无在途申请 + ≤可提现 → 扣款冻结 → PENDING 申请 */
    async riderWithdraw(ctx: RequestContext, input: { amount: number; channel: string; account: string }) {
        const rider = await this.riderService.assertApprovedRider(ctx);
        const amount = Math.floor(input.amount);
        if (!amount || amount < MIN_WITHDRAW_AMOUNT) throw new UserInputError('最低提现金额为 ¥10');
        if (!input.channel?.trim()) throw new UserInputError('请选择收款渠道');
        if (!input.account?.trim()) throw new UserInputError('请填写收款账号');
        const pc = await this.platformCtx();
        const port = getCouponBalancePort();
        if (!port) throw new UserInputError('余额功能未开通');
        const pending = await this.connection
            .getRepository(pc, RiderWithdrawalRequest)
            .count({ where: { customerId: rider.id, status: 'PENDING' } });
        if (pending > 0) throw new UserInputError('您有审核中的提现申请，请等待审核完成');
        const available = await port.getBalance(pc, rider.id as number);
        if (amount > available) throw new UserInputError('超过可提现余额');
        await port.deductBalance(pc, rider.id as number, amount);
        return this.connection.getRepository(pc, RiderWithdrawalRequest).save({
            customerId: rider.id,
            channelId: pc.channelId,
            amount,
            channel: input.channel.trim(),
            account: input.account.trim(),
            status: 'PENDING',
        } as any);
    }
```

- [ ] **Step 2: 运行目标测试确认通过**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run rider-wallet`
Expected: **6 passed**

- [ ] **Step 3: 插件全量回归**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; npx vitest --config vitest.config.mts --run`
Expected: 全部 PASS，0 failed（基线 107 + 新增 1）

- [ ] **Step 4: 本地构建（严禁服务器构建）**

Run: `cd d:\zhao\vendure\packages\campus-delivery-plugin; pnpm build`
Expected: 无编译错误；`lib/src/rider-wallet.service.js` 更新后包含「审核中的提现申请」字符串（可用 `Select-String -Path lib\src\rider-wallet.service.js -Pattern "审核中的提现申请"` 验证，应有 1 条命中）

- [ ] **Step 5: 提交（含 lib 编译产物）**

```powershell
$msg = @'
fix(rider): 提现防重——同骑手存在 PENDING 申请时拒绝再次申请

riderWithdraw 前置校验同骑手 PENDING 单存在即抛业务错误，
防止余额充足时重复申请建多笔在途单（waimai P2 收尾 spec §2.2）。
'@
Set-Content -Path $env:TEMP\vm-msg.txt -Value $msg -Encoding utf8
git -C d:\zhao\vendure add packages/campus-delivery-plugin/src/rider-wallet.service.ts packages/campus-delivery-plugin/src/rider-wallet.service.spec.ts packages/campus-delivery-plugin/lib
git -C d:\zhao\vendure commit -F $env:TEMP\vm-msg.txt
```

Expected: 1 file changed 数量 > 2（src 2 个 + lib 编译产物）

### Task 3: E2E 脚本扩防重用例（.secrets 不入库）

**Files:**
- Modify: `d:\zhao\waimai\.secrets\rider-withdraw-e2e.cjs`（L107-109 之间，req2 创建与 approve 之间）

- [ ] **Step 1: 插入防重用例**

原代码：

```js
    // 7) 再申请 → 通过打款（留痕）
    const req2 = (await gql(SHOP_API, `mutation { riderWithdraw(amount: ${W1}, channel: "微信", account: "smoke-wechat") { id status } }`, null, RH)).riderWithdraw;
    const paid = (await gql(ADMIN_API, `mutation($id: ID!) { approveRiderWithdraw(id: $id, remark: "冒烟打款") { id status reviewedAt } }`, { id: req2.id }, ADM0)).approveRiderWithdraw;
```

改为（req2 创建后、approve 前插入一行）：

```js
    // 7) 再申请 → 通过打款（留痕）
    const req2 = (await gql(SHOP_API, `mutation { riderWithdraw(amount: ${W1}, channel: "微信", account: "smoke-wechat") { id status } }`, null, RH)).riderWithdraw;
    // 7.5) 防重：req2 在途（PENDING）时再次申请必须被拒
    ok('withdraw.duplicateBlock', await expectReject(1000, '审核中的提现申请'));
    const paid = (await gql(ADMIN_API, `mutation($id: ID!) { approveRiderWithdraw(id: $id, remark: "冒烟打款") { id status reviewedAt } }`, { id: req2.id }, ADM0)).approveRiderWithdraw;
```

- [ ] **Step 2: 语法检查**

Run: `node --check d:\zhao\waimai\.secrets\rider-withdraw-e2e.cjs`
Expected: 无输出（语法 OK）

### Task 4: vendure 推送部署 + 生产双回归

- [ ] **Step 1: 推送 vendure**

Run: `git -C d:\zhao\vendure push origin master; git -C d:\zhao\vendure status -sb`
Expected: `## master...origin/master`（无 ahead）

- [ ] **Step 2: 服务器拉取 + 重启（仅 pull + restart，严禁服务器构建）**

```powershell
$cmd = @'
cd /www/vendure && git pull && pm2 restart vendure && sleep 3 && pm2 logs vendure --lines 20 --nostream
'@; $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($cmd)); ssh joho "echo $encoded | base64 -d | bash"
```

Expected: git pull 显示新提交；pm2 restart 成功；日志无启动报错（如 `CreateCampusTablesMigration` 类错误）

- [ ] **Step 3: 提现 E2E 回归（含防重用例）**

Run: `node d:\zhao\waimai\.secrets\rider-withdraw-e2e.cjs`
Expected: 每行 PASS，末行 `RIDER-WITHDRAW-E2E PASS`，且包含 `PASS [withdraw.duplicateBlock]`

- [ ] **Step 4: waimai 全链路冒烟回归**

Run: `node d:\zhao\vshop\docs\verify\waimai-e2e-smoke.cjs`
Expected: S1-S8 全 PASS，末行 `E2E SMOKE PASS`

### Task 5: 手机截图目检（390×844 dpr=2，逐张人工目检）

**Files:**
- Create: `d:\zhao\waimai\.secrets\p2-cleanup-shots.cjs`（gitignore 不入库）
- Output: `d:\zhao\vshop\docs\screenshots\waimai\p2-cleanup\`（5 张 png）

- [ ] **Step 1: 写截图脚本**

```js
// P2 收尾手机截图（5 张）：收入页入口 / 钱包余额 / 提现记录 / 申请页 / web-admin 审核页
// 登录方式：API 拿 token 注入 localStorage（auth_token），避开生产 SSO 登录跳转
const { chromium } = require('playwright');
const fs = require('fs');
const SHOP_API = 'https://e.joho.cn/shop-api';
const ADMIN_API = 'https://e.joho.cn/admin-api';
const RIDER = { email: 'smoke-rider@yourbao.cn', password: 'Wm@Smoke123' };
const OUT = 'd:/zhao/vshop/docs/screenshots/waimai/p2-cleanup';

async function riderToken() {
    const res = await fetch(SHOP_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `mutation { login(username: "${RIDER.email}", password: "${RIDER.password}") { ... on CurrentUser { id identifier } } }` }),
    });
    await res.json();
    const t = res.headers.get('vendure-auth-token');
    if (!t) throw new Error('rider login failed');
    return t;
}
async function adminToken() {
    const res = await fetch(ADMIN_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `mutation { login(username: "superadmin", password: "z123123") { ... on CurrentUser { id } } }` }),
    });
    await res.json();
    const t = res.headers.get('vendure-auth-token');
    if (!t) throw new Error('admin login failed');
    return t;
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1 MicroMessenger/8.0.38',
    });
    const rt = await riderToken();
    const page = await ctx.newPage();
    await page.addInitScript(t => localStorage.setItem('auth_token', t), rt);

    // 1) 收入页（含「去提现」入口卡）
    await page.goto('https://www.yourbao.cn/waimai/#/pkg-rider/pages/rider-earning');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: OUT + '/01-rider-earning.png' });

    // 2) 钱包页（余额卡 + 收入明细 tab）
    await page.goto('https://www.yourbao.cn/waimai/#/pkg-rider/pages/rider-wallet');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: OUT + '/02-rider-wallet.png' });

    // 3) 钱包页提现记录 tab（点击「提现记录」切 tab）
    await page.getByText('提现记录', { exact: true }).first().tap().catch(() => page.tap('text=提现记录'));
    await page.waitForTimeout(2500);
    await page.screenshot({ path: OUT + '/03-rider-withdraw-list.png' });

    // 4) 申请提现页（金额/渠道/账号表单）
    await page.goto('https://www.yourbao.cn/waimai/#/pkg-rider/pages/rider-withdraw');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: OUT + '/04-rider-withdraw-form.png' });

    // 5) web-admin 提现审核页（token 注入方式同源为准，失败则按该站登录页 UI 登录后截图）
    const at = await adminToken();
    const ap = await ctx.newPage();
    await ap.addInitScript(t => localStorage.setItem('vendure-auth-token', t), at);
    await ap.goto('https://e.joho.cn/guanli/#/pages/rider/withdraw/index');
    await ap.waitForTimeout(5000);
    await ap.screenshot({ path: OUT + '/05-web-admin-review.png' });

    await browser.close();
    console.log('SHOTS DONE -> ' + OUT);
})().catch(e => { console.error('SHOTS ERROR:', e.message); process.exit(1); });
```

（注：web-admin 的 token 存储 key 以 `web-admin/src/stores` 实际实现为准——运行前可 `Select-String -Path d:\zhao\vshop\web-admin\src\stores\*.ts -Pattern "setStorageSync|auth_token|token"` 核对，若 key 不同则修正脚本第 5 段的 `setItem` 键名；登录态失败时页面会跳登录页，截图一眼可辨。）

- [ ] **Step 2: 运行脚本**

Run: `node d:\zhao\waimai\.secrets\p2-cleanup-shots.cjs`
Expected: 输出 `SHOTS DONE -> d:/zhao/vshop/docs/screenshots/waimai/p2-cleanup`，目录下 5 张 780×1688 png

- [ ] **Step 3: 逐张人工目检（主会话 Read 图片，子代理 PASS 汇报不可信）**

目检清单：
1. `01-rider-earning.png`：KPI 卡 + 「骑手钱包/去提现」入口卡 + 分成流水列表
2. `02-rider-wallet.png`：可提现余额/审核中/累计收入三数 + 申请提现按钮（余额<¥10 时按钮置灰+「满 ¥10 可提现」）
3. `03-rider-withdraw-list.png`：提现记录行含状态标签（审核中=橙 / 已打款=绿 / 已驳回=红）+ 驳回备注
4. `04-rider-withdraw-form.png`：金额输入 + 支付宝/微信渠道选择 + 收款账号 + 提交按钮
5. `05-web-admin-review.png`：四 tab（待审核/已打款/已驳回/全部）+ 申请卡（金额/收款渠道/账号/操作按钮）

### Task 6: web-admin 线上核验

- [ ] **Step 1: 浏览器打开 `https://e.joho.cn/guanli/`，登录 superadmin（凭据见 .secrets 惯例 z123123），进「骑手管理」相关入口确认「骑手提现审核」页可访问且能用（结合 Task 5 第 5 张截图判断）**
Expected: 审核页四 tab 正常加载；若 404/旧版无该页 → 执行 `cd d:\zhao\vshop\web-admin; node scripts/deploy.mjs`（本地构建上传 guanli 目录，同 waimai 机制）后复验

### Task 7: 调度配置生产核验

**Files:**
- Create: `d:\zhao\waimai\.secrets\p2-dispatch-check.cjs`（gitignore 不入库）

- [ ] **Step 1: 写核验脚本**

```js
// 调度配置核验：逐店铺渠道查 campusConfig 的 T2/T4 阈值与运力暂停开关
const ADMIN = 'https://e.joho.cn/admin-api';
(async () => {
    const l = await fetch(ADMIN, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `mutation { login(username: "superadmin", password: "z123123") { ... on CurrentUser { id } } }` }),
    });
    const at = l.headers.get('vendure-auth-token');
    const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at };
    const chs = (await (await fetch(ADMIN, { method: 'POST', headers: H, body: JSON.stringify({ query: `{ channels { id code token default } }` }) })).json()).data.channels;
    for (const c of chs.filter(c => !c.default)) {
        const b = await (await fetch(ADMIN, { method: 'POST', headers: { ...H, 'vendure-token': c.token },
            body: JSON.stringify({ query: `{ campusConfig { paused autoAssignMinutes autoRefundMinutes inProgressSlaMinutes } }` }) })).json();
        console.log(c.code, c.token, JSON.stringify(b.data?.campusConfig ?? b.errors));
    }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
```

- [ ] **Step 2: 运行**

Run: `node d:\zhao\waimai\.secrets\p2-dispatch-check.cjs`
Expected: 每个店铺渠道输出 `paused=false`、`autoAssignMinutes=10`、`autoRefundMinutes=30`、`inProgressSlaMinutes=45`（或运营已调的合理值）；若 `paused=true` 或阈值异常 → 用 `campusUpdateConfig` 修正（mutation：`mutation($input: JSON) { campusUpdateConfig(input: $input) { id } }`，input 传 `{ paused: false }` 等，头带对应 `vendure-token`），修正后重跑确认

- [ ] **Step 3: 大厅加急排序行为核验（结合 Task 5 截图 01）**

骑手大厅（rider-home）滞留 >5min 单应有「加急」徽标且排在最前（后端 `hall()` 已排序，前端 `isUrgent` 徽标）；生产冒烟 S6 已覆盖大厅链路，此处以截图 + 冒烟 PASS 为准，无需额外代码

### Task 8: JSAPI 支付真实验证（依赖用户商户平台操作，可与其他 Task 并行等待）

- [ ] **Step 1: 用户确认前置项——微信商户平台已为 JSAPI 支付追加 `/waimai/` 授权目录（唯一人工阻塞项，未配置则本 Task 挂起等待，不阻塞 Task 1-7 收尾）**
- [ ] **Step 2: 手机微信打开 `https://www.yourbao.cn/waimai/` → 选店加购 → 确认订单页选「微信支付」→ 提交 → 应拉起微信支付收银台 → 完成支付**
- [ ] **Step 3: 验证支付结果：pay-result 页显示支付成功（截图 `06-jsapi-pay-result.png` 存 `vshop/docs/screenshots/waimai/p2-cleanup/`）；订单列表/订单详情状态已流转为已支付**
- [ ] **Step 4: 异常排障：签名/目录/回调问题按 `vshop/docs/verify/2026-10-waimai-e2e.md` 流程定位；代码侧预期无改动，如确需改动先回报再动**

### Task 9: 操作手册补充 + 三仓库提交推送收尾

**Files:**
- Modify: `d:\zhao\vshop\docs\waimai-操作手册.md`（文末新增章节）
- 提交：vendure（Task 2 已提交，本 Task 推送）、vshop（手册+截图）、waimai（spec v2 + 本计划）

- [ ] **Step 1: 手册新增「骑手提现与审核」章节**

在 `d:\zhao\vshop\docs\waimai-操作手册.md` 文末追加：

```markdown
## 骑手提现与审核（2026-10-08 P2 收尾）

### 流程
1. 骑手端：收入页「去提现」→ 骑手钱包（可提现/审核中/累计收入）→ 申请提现（≥¥10，支付宝/微信 + 收款账号）。**提交即冻结**（available 减少、frozen 增加）；同骑手存在审核中申请时不可重复申请。
2. 管理后台（e.joho.cn/guanli）：骑手提现审核页（待审核/已打款/已驳回/全部四 tab）→ 通过（标记已打款，需线下微信/支付宝转账完成后操作，仅留痕）或 驳回（填备注，冻结金额自动退回骑手余额）。
3. 资金口径：申请冻结 = deductBalance；驳回退回 = addBalance；资金固定默认渠道上下文，管理端跨渠道可审核。

### 调度配置（campusConfig，admin-api/web-admin 配置页）
- `autoAssignMinutes`（默认 10）：大厅 open 单滞留超时 → T2 强派最佳在线骑手（信用分高者优先）
- `autoRefundMinutes`（默认 30）：无人接超时 → T4 全额原路退款 + 取消 + no_rider 标记 + 补偿券
- `inProgressSlaMinutes`（默认 45）：配送中 SLA 告警阈值
- 大厅排序：滞留 >5min「加急」置顶 → 小费降序 → 入厅时间升序；前端加急徽标自动显示
- `paused`：运力总开关（true 时暂停接单）

### 验证记录
- E2E：`node .secrets/rider-withdraw-e2e.cjs`（期望 RIDER-WITHDRAW-E2E PASS，含防重用例 withdraw.duplicateBlock）
- 截图：`vshop/docs/screenshots/waimai/p2-cleanup/`（5-6 张，390×844 dpr=2）
```

- [ ] **Step 2: vshop 提交推送（手册 + 截图）**

```powershell
git -C d:\zhao\vshop add docs/waimai-操作手册.md docs/screenshots/waimai/p2-cleanup
git -C d:\zhao\vshop commit -m "docs(waimai): 操作手册补骑手提现与审核章节 + P2 收尾截图"
git -C d:\zhao\vshop push origin master
```

Expected: push 成功

- [ ] **Step 3: 确认 vendure 已推送（Task 2 提交）**

Run: `git -C d:\zhao\vendure status -sb`
Expected: `## master...origin/master`（无 ahead）；若有 ahead → `git -C d:\zhao\vendure push origin master`

- [ ] **Step 4: waimai 提交推送（spec v2 + 本计划）**

```powershell
git -C d:\zhao\waimai add docs/2026-10-08-waimai-p2-cleanup-design.md docs/2026-10-08-waimai-p2-cleanup-plan.md
git -C d:\zhao\waimai commit -m "docs: P2 收尾包 spec v2（核实后转收口口径）+ 实施计划"
git -C d:\zhao\waimai push origin master
```

Expected: push 成功

---

## 验收对照（spec §6 口径）

| spec 项 | 覆盖任务 |
|---|---|
| §2.2 防重申请 | Task 1-3（TDD + E2E 用例） |
| §2.3 提现验证收口 | Task 3-6（E2E 回归 + 截图目检 + web-admin 核验） |
| §3 JSAPI 真实验证 | Task 8（依赖用户商户平台配置） |
| §4 调度核验收口 | Task 7（campusConfig 核验 + 截图 + 冒烟） |
| §5 0 分成回归确认 | Task 2 Step 3（vitest 含 0 分成单测）+ Task 4 Step 4（冒烟） |
| 手册 + 三仓库提交推送 | Task 9 |
