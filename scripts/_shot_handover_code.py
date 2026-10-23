# -*- coding: utf-8 -*-
"""交接码（P1-D）生产截图：骑手取餐码弹层 / 学生订单详情 / 商家工作台，390x844 dpr=2。

流程（真实链路，非 mock）：
1. admin 登录 → 给 canteen-a-token 渠道临时配 R1 校园交接点
2. 用户建 R1 单 → 商家接单 + 出餐 → 商家标记「已送达交接点」→ 生成 4 位交接码、进接力大厅
3. 骑手抢单（assigned）→ 骑手 UI 点「开始取货」→ 弹出取餐码输入层 → 截图
4. 学生订单详情展示交接码 → 截图
5. 商家工作台展示交接码 → 截图
6. 还原渠道交接点配置（清空）

运行：python scripts/_shot_handover_code.py
"""
import json
import os
import time

import requests
from playwright.sync_api import sync_playwright

API = "https://www.yourbao.cn/shop-api"
ADMIN_API = "https://e.joho.cn/admin-api"
ADMIN = "https://e.joho.cn/guanli/#/"
CHANNEL = "canteen-a-token"
H5 = f"https://www.yourbao.cn/waimai/?tenant={CHANNEL}#/"
CHECKOUT = H5 + "pkg-order/pages/checkout"
RIDER_HOME = H5 + "pkg-rider/pages/rider-home"
RIDER_PAGE = H5 + "pkg-rider/pages/rider-delivering"
OUT = r"d:\zhao\vshop\docs\screenshots\waimai"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"

VARIANT_ID = "87"
ZONE_ID, BUILDING_ID = "2", "2"
ORDERER = ("smoke-hc@yourbao.cn", "Wm@Smoke123")
RIDER_EMAIL, RIDER_PWD = "smoke-rider@yourbao.cn", "Wm@Smoke123"
ADMIN_USER, ADMIN_PWD = "superadmin", "z123123"

ADD_ITEM = ('mutation($v: ID!, $q: Int!){ addItemToOrder(productVariantId: $v, quantity: $q) '
            '{ ... on Order { id } ... on ErrorResult { errorCode message } } }')
SET_TARGET = ('mutation($z: ID!, $b: ID!){ campusSetDeliveryTarget(zoneId: $z, buildingId: $b, route: "R1") '
              '{ id customFields { campusZone fulfillmentRoute } } }')
ELIGIBLE = "query { eligibleShippingMethods { id code priceWithTax } }"
SET_SHIP = ('mutation($id: [ID!]!){ setOrderShippingMethod(shippingMethodId: $id) '
            '{ ... on Order { id } ... on ErrorResult { errorCode message } } }')
TRANSITION = ('mutation { transitionOrderToState(state: "ArrangingPayment") '
              '{ ... on Order { id state } ... on ErrorResult { errorCode message } } }')
PAY = ('mutation($m: String!){ addPaymentToOrder(input: { method: $m, metadata: {} }) '
       '{ ... on Order { id code state customFields { hallStatus deliveryPlan } } '
       '... on ErrorResult { errorCode message } } }')
LOGIN = 'mutation($u: String!, $p: String!){ login(username: $u, password: $p) { ... on CurrentUser { id } } }'
ORDER_Q = '''query($id: ID!){ order(id: $id){ id code state
  customFields { hallStatus deliveryStatus deliveryStaffId deliveryPlan fulfillmentRoute handoverAt handoverCode } } }'''
GRAB = 'mutation($o: ID!){ campusGrabOrder(orderId: $o){ id customFields { deliveryStatus } } }'

adm = requests.Session()
adm.headers["Content-Type"] = "application/json"
rider = requests.Session()
rider_tok = [None]


def gql_err(d):
    return json.dumps(d.get("errors") or d, ensure_ascii=False)[:300]


def must(d, key):
    data = (d.get("data") or {}).get(key)
    assert data, f"{key} 失败: {gql_err(d)}"
    return data


def admin_gql(query, variables=None):
    r = adm.post(ADMIN_API, json={"query": query, "variables": variables or {}}, timeout=25)
    d = r.json()
    assert not d.get("errors"), "admin GQL 错误: " + gql_err(d)
    return d["data"]


def rider_gql(query, variables=None):
    hdrs = {"vendure-token": CHANNEL}
    if rider_tok[0]:
        hdrs["Authorization"] = "Bearer " + rider_tok[0]
    r = rider.post(API, json={"query": query, "variables": variables or {}},
                   headers={"Content-Type": "application/json", **hdrs}, timeout=25)
    t = r.headers.get("vendure-auth-token")
    if t:
        rider_tok[0] = t
    d = r.json()
    assert not d.get("errors"), "rider GQL 错误: " + gql_err(d)
    return d["data"]


def page_gql(pg, query, variables=None):
    js = """
    async (args) => {
        const r = await fetch('/shop-api', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'vendure-token': '%s'},
            body: JSON.stringify({query: args.q, variables: args.v || {}}),
        });
        return await r.json();
    }
    """ % CHANNEL
    d = pg.evaluate(js, {"q": query, "v": variables})
    assert not d.get("errors"), "user GQL 错误: " + gql_err(d)
    return d


def clean_active_order(pg):
    d = page_gql(pg, "query { activeOrder { id lines { id } } }")
    ao = (d.get("data") or {}).get("activeOrder")
    for line in (ao or {}).get("lines") or []:
        page_gql(pg, 'mutation($id: ID!){ removeOrderLine(orderLineId: $id){ ... on Order { id } } }',
                 {"id": line["id"]})


def order_admin(oid):
    return admin_gql(ORDER_Q, {"id": oid})["order"]


def wait_ready(pg, texts, tries=25):
    body = ""
    for _ in range(tries):
        pg.wait_for_timeout(1000)
        body = pg.inner_text("body")
        if all(t in body for t in texts):
            return body
    return body


def set_handover_points(points):
    return admin_gql(
        'mutation($c: ID!, $i: CampusStoreConfigInput!){ campusUpdateStoreConfig(channelId: $c, input: $i) '
        '{ channelId handoverPoints { route name } } }',
        {"c": CHANNEL_ID, "i": {"routesEnabled": ["R1", "R3", "R4", "R5"], "handoverPoints": points}},
    )


def ui_login(page, email, pwd):
    r = page.evaluate(
        "async ([u, p, ch]) => { const r = await fetch('/shop-api', { method: 'POST',"
        " headers: {'Content-Type':'application/json','vendure-token': ch},"
        " body: JSON.stringify({query: 'mutation($u:String!,$p:String!){ login(username: $u, password: $p) { ... on CurrentUser { id } } }',"
        " variables: {u, p} }) });"
        " return { token: r.headers.get('vendure-auth-token'), body: await r.json() }; }",
        [email, pwd, CHANNEL],
    )
    token = r.get("token")
    uid = ((r.get("body") or {}).get("data", {}).get("login") or {}).get("id", "")
    assert token and uid, "UI 登录失败: " + json.dumps(r)[:200]
    page.evaluate(
        "([t, id]) => { localStorage.setItem('vendure_session_token', t); localStorage.setItem('auth_token', t);"
        " localStorage.setItem('auth_userId', String(id)); }",
        [token, uid],
    )


CHANNEL_ID = ""


def main():
    os.makedirs(OUT, exist_ok=True)
    global CHANNEL_ID

    # —— 0. admin 登录 + 定位渠道 + 临时配 R1 交接点 ——
    lr = adm.post(ADMIN_API, json={"query": LOGIN, "variables": {"u": ADMIN_USER, "p": ADMIN_PWD}}, timeout=25)
    tok = lr.headers.get("vendure-auth-token")
    assert tok, "admin 登录未返回 token"
    adm.headers["Authorization"] = "Bearer " + tok
    adm.headers["vendure-token"] = CHANNEL
    chans = admin_gql("query { channels(options: { take: 100 }) { items { id code token } } }")["channels"]["items"]
    ch = next((c for c in chans if c.get("token") == CHANNEL), None)
    assert ch, f"未找到渠道 {CHANNEL}"
    CHANNEL_ID = str(ch["id"])
    print("channel", CHANNEL_ID, ch.get("code"))

    set_handover_points([{"route": "R1", "name": "桂1栋驿站", "address": "桂1栋一层", "lat": 30.5, "lng": 114.3, "isDefault": True}])
    print("R1 handover point set")

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True)

        # —— 1. 用户建 R1 单 ——
        ctx_u = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                    is_mobile=True, has_touch=True, locale="zh-CN")
        pu = ctx_u.new_page()
        pu.goto(CHECKOUT, wait_until="domcontentloaded", timeout=60000)
        pu.wait_for_timeout(2500)
        must(page_gql(pu, LOGIN, {"u": ORDERER[0], "p": ORDERER[1]}), "login")
        clean_active_order(pu)
        must(page_gql(pu, ADD_ITEM, {"v": VARIANT_ID, "q": 10}), "addItemToOrder")
        must(page_gql(pu, SET_TARGET, {"z": ZONE_ID, "b": BUILDING_ID}), "campusSetDeliveryTarget")
        methods = must(page_gql(pu, ELIGIBLE), "eligibleShippingMethods") or []
        campus = next((m for m in methods if (m.get("code") or "").startswith("campus-errand")), None)
        assert campus, "无 campus-errand 配送方式"
        must(page_gql(pu, SET_SHIP, {"id": [campus["id"]]}), "setOrderShippingMethod")
        must(page_gql(pu, TRANSITION), "transitionOrderToState")
        pay = must(page_gql(pu, PAY, {"m": "cod-payment-template"}), "addPaymentToOrder")
        oid, code = str(pay["id"]), pay["code"]
        print("order", code, "state=", pay["state"], "plan=", (pay["customFields"] or {}).get("deliveryPlan"))

        paid = admin_gql('query($id: ID!){ order(id: $id){ payments { id state } } }', {"id": oid})["order"]
        paym = paid["payments"][0]
        if paym["state"] != "Settled":
            admin_gql('mutation($i: ID!){ settlePayment(id: $i){ ... on Payment { id state } '
                      '... on ErrorResult { errorCode message } } }', {"i": paym["id"]})

        # 结算后履约快照异步写入，轮询等待
        snap = {}
        for _ in range(15):
            snap = order_admin(oid)["customFields"] or {}
            if snap.get("hallStatus"):
                break
            time.sleep(1)
        print("snapshot", json.dumps(snap, ensure_ascii=False)[:200])
        assert snap.get("hallStatus") == "pending_merchant", f"R1 应待商家接单: {snap}"
        assert snap.get("deliveryPlan") == "merchant", f"R1 第一段应为商户（交接点已配）: {snap}"

        # —— 2. 商家接单/出餐 → 标记送达交接点（生成交接码） ——
        admin_gql('mutation($o: ID!){ campusMerchantAcceptOrder(orderId: $o){ ok } }', {"o": oid})
        admin_gql('mutation($o: ID!){ campusMerchantCookingDone(orderId: $o){ ok } }', {"o": oid})
        admin_gql('mutation($o: ID!){ campusMerchantMarkHandoverArrived(orderId: $o){ ok } }', {"o": oid})

        handover = None
        for _ in range(15):
            cf = order_admin(oid)["customFields"] or {}
            if cf.get("handoverCode"):
                handover = cf
                break
            time.sleep(1)
        assert handover and handover.get("hallStatus") == "open", f"未生成交接码/未入大厅: {handover}"
        print("handoverCode", handover.get("handoverCode"))

        # —— 3. 骑手抢单 + UI 取餐码弹层截图 ——
        rider_gql(LOGIN, {"u": RIDER_EMAIL, "p": RIDER_PWD})
        rider_gql(GRAB, {"o": oid})
        cf = order_admin(oid)["customFields"] or {}
        assert cf.get("deliveryStatus") == "assigned", f"抢单失败: {cf}"

        ctx_r = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                    is_mobile=True, has_touch=True, locale="zh-CN",
                                    user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1")
        pr = ctx_r.new_page()
        pr.goto(RIDER_HOME, wait_until="domcontentloaded", timeout=60000)
        wait_ready(pr, ["账号登录"])
        pr.click("text=账号登录")
        pr.fill('input[type="text"]', RIDER_EMAIL)
        pr.fill('input[type="password"]', RIDER_PWD)
        pr.locator(".login-page__submit:not([disabled])").first.click()
        wait_ready(pr, ["已下线"])
        pr.click(".online")
        pr.goto(RIDER_PAGE, wait_until="networkidle", timeout=60000)
        card = pr.locator(".task-card").filter(has_text=code)
        for _ in range(15):
            pr.wait_for_timeout(1000)
            if card.count():
                break
        assert card.count(), "骑手任务页未出现该单: " + pr.inner_text("body")[:300]
        # uni-app H5 的 button 渲染为 uni-button 自定义元素，按文案点击
        target = card.first.get_by_text("开始取货").first
        target.click()
        pr.wait_for_selector(".code-input", timeout=15000)
        pr.locator(".code-input").scroll_into_view_if_needed()
        pr.wait_for_timeout(600)
        pr.screenshot(path=os.path.join(OUT, "15-1-rider-handover-code.png"))
        pr.locator(".task-card").filter(has=pr.locator(".code-input")).first.screenshot(
            path=os.path.join(OUT, "15-1b-rider-code-dialog.png"))
        print("[shot] rider code dialog ok")

        # —— 4. 学生订单详情 ——
        pu.goto(f"{H5}pkg-order/pages/order-detail?code={code}", wait_until="domcontentloaded", timeout=60000)
        body = wait_ready(pu, ["取餐交接码", handover["handoverCode"]])
        assert "取餐交接码" in body and handover["handoverCode"] in body, "订单详情未展示交接码: " + body[:400]
        pu.wait_for_timeout(800)
        pu.screenshot(path=os.path.join(OUT, "15-2-order-handover-code.png"), full_page=True)
        print("[shot] order detail ok")

        # —— 5. 商家工作台 ——
        ctx_a = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                    is_mobile=True, has_touch=True, locale="zh-CN")
        pa = ctx_a.new_page()
        pa.goto(ADMIN + "pages/login/index", wait_until="networkidle", timeout=60000)
        pa.wait_for_selector('input[type="text"]', timeout=30000)
        pa.fill('input[type="text"]', ADMIN_USER)
        pa.fill('input[type="password"]', ADMIN_PWD)
        pa.click("text=登 录")
        try:
            pa.wait_for_load_state("networkidle", timeout=30000)
        except Exception:
            pass
        time.sleep(2)
        pa.evaluate("t => { localStorage.setItem('wa_channel_token', t); }", CHANNEL)
        pa.goto(ADMIN + "pages/campus/merchant", wait_until="domcontentloaded", timeout=60000)
        wait_ready(pa, ["待接单"], tries=25)
        # 该单已被骑手抢单（hallStatus=grabbed）→ 商家工作台「配送中」页签
        tabs = pa.locator(".tab")
        hit = None
        for i in range(tabs.count()):
            t = tabs.nth(i).inner_text().strip()
            if t.startswith("配送中"):
                hit = tabs.nth(i)
                break
        assert hit is not None, "未找到『配送中』页签: " + pa.inner_text("body")[:300]
        hit.click()
        body = wait_ready(pa, [code, "取餐交接码"], tries=25)
        assert code in body and "取餐交接码" in body, "商家工作台未展示交接码: " + body[:400]
        card = pa.locator(".card").filter(has_text=code).first
        card.scroll_into_view_if_needed()
        pa.wait_for_timeout(600)
        pa.screenshot(path=os.path.join(OUT, "15-3-merchant-handover-code.png"))
        card.screenshot(path=os.path.join(OUT, "15-3b-merchant-card.png"))
        print("[shot] merchant board ok")

        browser.close()

    # —— 6. 还原交接点配置 ——
    set_handover_points([])
    print("handover points cleared")
    print("DONE", OUT)


if __name__ == "__main__":
    main()
