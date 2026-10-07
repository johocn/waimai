# -*- coding: utf-8 -*-
"""个人中心生产冒烟：地址簿 CRUD+默认预选+开票幂等（幂等可重复跑）。截图 390x844 dpr=2。

要点（沿 _smoke_aftersale.py 实测姿势）：
- 本 vendure fork shop-api 鉴权认会话 cookie → 用户侧全部走「页面上下文 fetch」；
- 渠道上下文需显式带 vendure-token 头（campusZones/campusBuildings 按渠道隔离）；
- 前端页面登录态读 localStorage 'vendure_session_token'（src/api/client.ts SESSION_TOKEN_KEY），
  该 token 取自 login 响应头 vendure-auth-token。
"""
import json, os, sys, time
from playwright.sync_api import sync_playwright

BASE = "https://www.yourbao.cn/waimai/?tenant=canteen-a-token"
API = "https://www.yourbao.cn/shop-api"
CHANNEL = "canteen-a-token"
EMAIL, PWD = "smoke-order@yourbao.cn", "Wm@Smoke123"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
SHOTS_DIR = "C:/tmp/waimai_shots"
results, shots = [], []

def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(detail) if detail and not ok else ""))

def gql(page, query, variables=None):
    return page.evaluate(
        "async ([q, v, ch]) => { const r = await fetch('/shop-api', { method: 'POST',"
        " headers: {'Content-Type':'application/json','vendure-token': ch},"
        " body: JSON.stringify({query: q, variables: v}) }); return r.json(); }",
        [query, variables or {}, CHANNEL],
    )

def login(page):
    """页面上下文登录：会话 cookie 自动建立，同时把响应头 token 写进前端登录态存储键。"""
    r = page.evaluate(
        "async ([u, p, ch]) => { const r = await fetch('/shop-api', { method: 'POST',"
        " headers: {'Content-Type':'application/json','vendure-token': ch},"
        " body: JSON.stringify({query: 'mutation($u:String!,$p:String!){ login(username: $u, password: $p) { ... on CurrentUser { id } } }',"
        " variables: {u, p} }) });"
        " return { body: await r.json(), token: r.headers.get('vendure-auth-token') }; }",
        [EMAIL, PWD, CHANNEL],
    )
    body, token = r.get("body", {}), r.get("token")
    ok = bool(body.get("data", {}).get("login", {}).get("id")) and bool(token)
    if ok:
        page.evaluate("t => { localStorage.setItem('vendure_session_token', t); }", token)
    check("login", ok, {"body": body, "token": token})
    return ok

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True)
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                  is_mobile=True, has_touch=True, locale="zh-CN",
                                  user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15")
        page = ctx.new_page()
        page.goto(BASE + "#/pages/login/index", wait_until="networkidle")
        if not login(page):
            browser.close(); report()
        time.sleep(1)

        # 版式 B 个人中心
        page.goto(BASE + "#/pages/profile/index", wait_until="networkidle")
        time.sleep(2)
        page.screenshot(path=f"{SHOTS_DIR}/profile_b.png")
        shots.append("profile_b.png")

        # 1. 地址：清理旧冒烟地址后重建（含默认+customFields）
        cust = gql(page, "query { activeCustomer { id addresses { id fullName defaultShippingAddress customFields { zoneId buildingId } } } }")
        addrs = cust.get("data", {}).get("activeCustomer", {}).get("addresses", [])
        zones = gql(page, "query { campusZones { id name fee } }").get("data", {}).get("campusZones", [])
        check("campusZones 可用", len(zones) > 0, zones)
        zid = str(zones[0]["id"])
        blds = gql(page, "query($z: ID){ campusBuildings(zoneId: $z){ id name zoneId } }", {"z": zid}).get("data", {}).get("campusBuildings", [])
        check("campusBuildings 可用", len(blds) > 0, blds)
        bid = str(blds[0]["id"])
        for a in addrs:
            if a.get("fullName") == "冒烟收货人":
                gql(page, "mutation($id: ID!){ deleteCustomerAddress(id: $id){ success } }", {"id": a["id"]})
        ca = gql(page, """mutation($input: CreateAddressInput!){ createCustomerAddress(input: $input){ id customFields { zoneId buildingId } } }""",
                 {"input": {"fullName": "冒烟收货人", "phoneNumber": "13800001234", "streetLine1": "502",
                            "countryCode": "CN", "defaultShippingAddress": True,
                            "customFields": {"zoneId": zid, "buildingId": bid}}})
        new_addr = ca.get("data", {}).get("createCustomerAddress")
        check("创建地址+customFields 落库", bool(new_addr and new_addr["customFields"]["zoneId"] == zid), ca)

        # 2. 地址簿渲染 + 默认徽标
        page.goto(BASE + "#/pkg-user/pages/address-book", wait_until="networkidle")
        time.sleep(2)
        page.screenshot(path=f"{SHOTS_DIR}/address_book.png")
        shots.append("address_book.png")
        body = page.evaluate("() => document.body.innerText")
        check("地址簿渲染默认徽标", ("默认" in body) and ("冒烟收货人" in body), body[:200])

        # 3. 发票抬头：写一条（个人）→ 抬头管理页渲染
        title_json = json.dumps([{"type": "personal", "name": "冒烟抬头", "email": EMAIL}], ensure_ascii=False)
        ut = gql(page, "mutation($c: UpdateCustomerInput!){ updateCustomer(input: $c) { id customFields { invoiceTitles } } }",
                 {"c": {"customFields": {"invoiceTitles": title_json}}})
        check("抬头 JSON 写回", (ut.get("data", {}).get("updateCustomer", {}).get("customFields", {}) or {}).get("invoiceTitles") == title_json, ut)

        # 3.5 邀请码：SSO 侧生成的码，冒烟账号为后台直建无码 → 幂等注入等价值（仅测试账号）
        ur = gql(page, "mutation($c: UpdateCustomerInput!){ updateCustomer(input: $c) { id customFields { referralCode } } }",
                 {"c": {"customFields": {"referralCode": "SMOKE160"}}})
        rc = (ur.get("data", {}).get("updateCustomer", {}).get("customFields", {}) or {}).get("referralCode")
        check("邀请码注入可写", rc == "SMOKE160", ur)

        # 4. 开票：取最近已支付订单 applyOrderInvoice，重复调必须 INVOICE_ALREADY_APPLIED（幂等可重跑）
        orders = gql(page, 'query { myOrders(options: {take: 10, sort: {createdAt: DESC}}) { items { id state customFields { invoiceApplied } } } }')
        if orders.get("errors"):
            check("开票冒烟", False, orders)
            items = []
        else:
            items = orders.get("data", {}).get("myOrders", {}).get("items", [])
        eligible = [o for o in items if o["state"] in ("PaymentAuthorized", "PaymentSettled", "Shipped", "Delivered")]
        if not eligible:
            check("开票冒烟", False, "无已支付订单，先跑 waimai-e2e-smoke.cjs 造单")
        else:
            oid = eligible[0]["id"]
            snapshot = json.dumps({"titleType": "personal", "titleName": "冒烟抬头", "taxNo": "", "email": EMAIL, "appliedAt": "smoke"}, ensure_ascii=False)
            r1 = gql(page, "mutation($o: ID!, $i: String!){ applyOrderInvoice(orderId: $o, invoiceInfo: $i) }", {"o": oid, "i": snapshot})
            already = str(r1).find("INVOICE_ALREADY_APPLIED") >= 0
            check("applyOrderInvoice 首调成功或已申请(幂等重跑)", (r1.get("data") or {}).get("applyOrderInvoice") is True or already, r1)
            r2 = gql(page, "mutation($o: ID!, $i: String!){ applyOrderInvoice(orderId: $o, invoiceInfo: $i) }", {"o": oid, "i": snapshot})
            check("重复申请被拒 INVOICE_ALREADY_APPLIED", str(r2).find("INVOICE_ALREADY_APPLIED") >= 0, r2)

        # 5. 其余页面截图（含暗色抽查）
        for path, name in [("#/pkg-user/pages/invoice-titles", "invoice_titles.png"),
                           ("#/pkg-user/pages/invite", "invite.png"),
                           ("#/pkg-user/pages/about", "about.png"),
                           ("#/pkg-user/pages/profile-edit", "profile_edit.png")]:
            page.goto(BASE + path, wait_until="networkidle"); time.sleep(1.5)
            page.screenshot(path=f"{SHOTS_DIR}/{name}"); shots.append(name)

        page.goto(BASE + "#/pkg-user/pages/invite", wait_until="networkidle"); time.sleep(1.5)
        inv_body = page.evaluate("() => document.body.innerText")
        check("邀请页渲染邀请码", "SMOKE160" in inv_body, inv_body[:150])

        page.evaluate("() => { localStorage.setItem('waimai_theme', 'dark'); }")
        page.goto(BASE + "#/pages/profile/index", wait_until="networkidle"); time.sleep(2)
        page.screenshot(path=f"{SHOTS_DIR}/profile_dark.png"); shots.append("profile_dark.png")
        page.evaluate("() => { localStorage.setItem('waimai_theme', 'light'); }")

        browser.close()
    report()

def report():
    fails = [r for r in results if not r[1]]
    print(f"\nE2E SMOKE {'PASS' if not fails else 'FAIL'} ({len(results)-len(fails)}/{len(results)}) shots={shots}")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    os.makedirs(SHOTS_DIR, exist_ok=True)
    main()
