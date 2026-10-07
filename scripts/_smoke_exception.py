# -*- coding: utf-8 -*-
"""plan 3.4 异常赔付流程 冒烟+截图（390x844 dpr=2）。

流程：
0. admin API 登录；准备冒烟骑手（无则创建+approved）；骑手会话登录
1. 路径A 退差价：建单(10×2.05, R3, COD) → 入大厅(商家确认模式则先接单+出餐) → 强派骑手
   → 骑手上报异常 → H5 黄条截图 + 调度台处置卡截图 → refund_diff 50分
   → 断言 customFields 留痕 + Refund(total=50, Settled) → H5 绿条截图
2. 路径B 发券：同上 → coupon 发补偿券（无可用券模板则自建）→ 断言留痕
3. 路径C 全额退单：同上 → refund_all → 断言 Cancelled + campusCause=exception_refund + 全额退款
4. 路径D 重派：同上 → reassign → 断言回大厅(hallStatus=open, deliveryStatus=null)
   → 立即重新强派+再上报 → refund_all 收尾（防调度自动派单/真实骑手抢单骚扰）
5. 调度台「异常处置记录」留痕区截图；清理用户草稿单

关键背景（沿 3.2/3.1 实测）：
- 本 vendure fork shop-api 鉴权认会话 cookie → 用户侧全部走「页面上下文 fetch」；
- 骑手/admin 侧用 requests.Session（cookie 自动续）+ Bearer 响应头双保险；
- admin-api 同源 https://e.joho.cn/admin-api，渠道上下文头 vendure-token=canteen-a-token。
"""
import base64
import json
import time

import requests
from playwright.sync_api import sync_playwright

API = "https://www.yourbao.cn/shop-api"
ADMIN_API = "https://e.joho.cn/admin-api"
ADMIN = "https://e.joho.cn/guanli/#/"
H5_DETAIL = "https://www.yourbao.cn/waimai/?tenant=%s#/pkg-order/pages/order-detail?code=%%s" % "canteen-a-token"
CHECKOUT = "https://www.yourbao.cn/waimai/?tenant=canteen-a-token#/pkg-order/pages/checkout"
RIDER_PAGE = "https://www.yourbao.cn/waimai/?tenant=canteen-a-token#/pkg-rider/pages/rider-delivering"
DISPATCH_PAGE = ADMIN + "pages/campus/dispatch"
OUT = r"d:\zhao\waimai\docs\screenshots"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"

CHANNEL = "canteen-a-token"
VARIANT_ID = "87"                 # 可乐鸡排饭 205分 ×10 = 2050分 ≥ 起送1500
ZONE_ID, BUILDING_ID = "2", "2"   # 东区(运费2元) / 桂1栋
ORDERER = ("smoke-order@yourbao.cn", "Wm@Smoke123")
RIDER_EMAIL, RIDER_PWD = "smoke-rider@yourbao.cn", "Wm@Smoke123"
ADMIN_USER, ADMIN_PWD = "superadmin", "z123123"
EXC_NOTE = "冒烟：联系不上收件人"

ADD_ITEM = ('mutation($v: ID!, $q: Int!){ addItemToOrder(productVariantId: $v, quantity: $q) '
            '{ ... on Order { id } ... on ErrorResult { errorCode message } } }')
SET_TARGET = ('mutation($z: ID!, $b: ID!){ campusSetDeliveryTarget(zoneId: $z, buildingId: $b, route: "R3") '
              '{ id customFields { campusZone fulfillmentRoute } } }')
ELIGIBLE = "query { eligibleShippingMethods { id code priceWithTax } }"
SET_SHIP = ('mutation($id: [ID!]!){ setOrderShippingMethod(shippingMethodId: $id) '
            '{ ... on Order { id } ... on ErrorResult { errorCode message } } }')
TRANSITION = ('mutation { transitionOrderToState(state: "ArrangingPayment") '
              '{ ... on Order { id state } ... on ErrorResult { errorCode message } } }')
PAY = ('mutation($m: String!){ addPaymentToOrder(input: { method: $m, metadata: {} }) '
       '{ ... on Order { id code state customFields { hallStatus } } ... on ErrorResult { errorCode message } } }')
LOGIN = 'mutation($u: String!, $p: String!){ login(username: $u, password: $p) { ... on CurrentUser { id } } }'

ADMIN_LOGIN = 'mutation($u: String!, $p: String!){ login(username: $u, password: $p) { ... on CurrentUser { id } } }'
ORDER_Q = '''query($id: ID!){ order(id: $id){ id code state total
  payments { id amount state refunds { id total state } }
  customFields { hallStatus deliveryStatus campusCause exceptionType exceptionNote exceptionPhotos
    exceptionAction exceptionCompensation exceptionCouponTemplateId exceptionHandledNote exceptionHandledBy } } }'''
BOARD_Q = '''query { campusDispatchBoard { alerts { orderId orderCode type detail exceptionNote exceptionPhotos }
  hallOrders { id code } activeOrders { id code }
  handledOrders { orderCode exceptionType action compensation couponTemplateId note handledAt handledBy } } }'''

# —— 会话容器 ——
adm = requests.Session()
adm.headers["Content-Type"] = "application/json"
rs = requests.Session()
rider_tok = [None]


def must(d, key):
    data = (d.get("data") or {}).get(key)
    assert data, f"{key} 失败: {json.dumps(d, ensure_ascii=False)[:260]}"
    return data


def gql_err(d):
    return json.dumps(d.get("errors") or d, ensure_ascii=False)[:260]


def admin_gql(query, variables=None):
    r = adm.post(ADMIN_API, json={"query": query, "variables": variables or {}}, timeout=20)
    try:
        d = r.json()
    except Exception:
        raise AssertionError(f"admin-api 非 JSON: {r.text[:200]}")
    assert not d.get("errors"), "admin GQL 错误: " + gql_err(d)
    return d["data"]


def rider_gql(query, variables=None):
    hdrs = {"vendure-token": CHANNEL}
    if rider_tok[0]:
        hdrs["Authorization"] = "Bearer " + rider_tok[0]
    r = rs.post(API, json={"query": query, "variables": variables or {}},
                headers={"Content-Type": "application/json", **hdrs}, timeout=20)
    t = r.headers.get("vendure-auth-token")
    if t:
        rider_tok[0] = t
    try:
        d = r.json()
    except Exception:
        raise AssertionError(f"shop-api 非 JSON: {r.text[:200]}")
    assert not d.get("errors"), "rider GQL 错误: " + gql_err(d)
    return d["data"]


def page_gql(pg, query, variables=None):
    """页面上下文同源 fetch（用户会话 cookie 生效的唯一通道）。"""
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
    if not ao:
        return
    for line in ao.get("lines") or []:
        page_gql(pg, 'mutation($id: ID!){ removeOrderLine(orderLineId: $id){ ... on Order { id } } }',
                 {"id": line["id"]})
    print("  cleaned leftover order lines")


def wait_ready(pg, texts, tries=25):
    body = ""
    for _ in range(tries):
        pg.wait_for_timeout(1000)
        body = pg.inner_text("body")
        if all(t in body for t in texts):
            return body
    return body


def order_admin(order_id):
    return admin_gql(ORDER_Q, {"id": order_id})["order"]


def ensure_rider():
    d = admin_gql('query($o: CustomerListOptions){ customers(options: $o){ items { id emailAddress } totalItems } }',
                  {"o": {"filter": {"emailAddress": {"eq": RIDER_EMAIL}}, "take": 1}})
    items = d["customers"]["items"]
    if items:
        cid = str(items[0]["id"])
        print("rider exists:", RIDER_EMAIL, "id=", cid)
    else:
        created = admin_gql(
            'mutation($i: CreateCustomerInput!, $p: String!){ createCustomer(input: $i, password: $p){ id } }',
            {"i": {"emailAddress": RIDER_EMAIL, "firstName": "冒烟", "lastName": "骑手"}, "p": RIDER_PWD})
        cid = str(created["createCustomer"]["id"])
        print("rider created:", RIDER_EMAIL, "id=", cid)
    admin_gql('mutation($c: ID!){ campusSetRiderStatus(customerId: $c, status: "approved"){ status } }', {"c": cid})
    return cid


def ensure_coupon_template():
    d = admin_gql('query { couponTemplates(options: { skip: 0, take: 20 }){ items { id name enabled } totalItems } }')
    items = d["couponTemplates"]["items"]
    enabled = [t for t in items if t.get("enabled")]
    if enabled:
        print("coupon template:", enabled[0]["id"], enabled[0]["name"])
        return enabled[0]["id"], enabled[0]["name"]
    c = admin_gql('mutation($i: CreateCouponTemplateInput!){ createCouponTemplate(input: $i){ id } }',
                  {"i": {"name": "冒烟补偿券-勿动", "type": "FULL", "discountValue": 100, "enabled": True,
                         "totalCount": 10, "perUserLimit": 1, "validDays": 30}})
    print("coupon template created:", c["createCouponTemplate"]["id"])
    return c["createCouponTemplate"]["id"], "冒烟补偿券-勿动"


def create_order(pa, tag):
    """用户建单：10×2.05 → R3 配送目标 → campus-errand 运费 → COD 支付 → 等入大厅。"""
    clean_active_order(pa)
    must(page_gql(pa, ADD_ITEM, {"v": VARIANT_ID, "q": 10}), "addItemToOrder")
    must(page_gql(pa, SET_TARGET, {"z": ZONE_ID, "b": BUILDING_ID}), "campusSetDeliveryTarget")
    methods = must(page_gql(pa, ELIGIBLE), "eligibleShippingMethods") or []
    campus = next((m for m in methods if (m.get("code") or "").startswith("campus-errand")), None)
    assert campus, "eligible 无 campus-errand 方式: " + json.dumps(methods, ensure_ascii=False)[:200]
    must(page_gql(pa, SET_SHIP, {"id": [campus["id"]]}), "setOrderShippingMethod")
    must(page_gql(pa, TRANSITION), "transitionOrderToState")
    pay = must(page_gql(pa, PAY, {"m": "cod-payment-template"}), "addPaymentToOrder")
    oid, code = str(pay["id"]), pay["code"]
    print(f"[{tag}] order {code} paid, state={pay['state']}, hallStatus={pay['customFields']['hallStatus']}")
    # COD 模板只授权不结算：授权单不可退（REFUND_ORDER_STATE_ERROR），先结算支付
    paid = admin_gql('query($id: ID!){ order(id: $id){ state payments { id amount state } } }', {"id": oid})["order"]
    paym = paid["payments"][0]
    if paym["state"] != "Settled":
        admin_gql('mutation($i: ID!){ settlePayment(id: $i){ ... on Payment { id state } '
                  '... on ErrorResult { errorCode message } } }', {"i": paym["id"]})
        print(f"[{tag}] payment settled (COD authorize-only)")
    wait_hall_open(oid, tag)
    return {"id": oid, "code": code}


def wait_hall_open(oid, tag, tries=40):
    """等入大厅；商家确认模式则先接单+出餐。"""
    for i in range(tries):
        cf = order_admin(oid)["customFields"]
        hs = cf["hallStatus"]
        if hs == "open":
            print(f"[{tag}] hallStatus=open after {i}s")
            return
        if hs == "pending_merchant":
            admin_gql('mutation($o: ID!){ campusMerchantAcceptOrder(orderId: $o){ ok } }', {"o": oid})
            admin_gql('mutation($o: ID!){ campusMerchantCookingDone(orderId: $o){ ok } }', {"o": oid})
            print(f"[{tag}] merchant accepted + cookingDone")
        time.sleep(1.5)
    raise AssertionError(f"[{tag}] 60s 未入大厅: {json.dumps(cf, ensure_ascii=False)[:200]}")


# 1x1 红色 PNG（存证照片占位，验证 multipart 上传 + 处置卡照片透出链路）
UPLOAD_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


def rider_upload_asset():
    """骑手会话 multipart 上传存证照片（graphql-upload 规范：文件字段名 0 = map 键）。"""
    ops = {"query": 'mutation($file: Upload!){ uploadCustomerAsset(file: $file){ id source preview } }',
           "variables": {"file": None}}
    r = rs.post(API, data={"operations": json.dumps(ops), "map": json.dumps({"0": ["variables.file"]})},
                files={"0": ("evidence.png", UPLOAD_PNG, "image/png")},
                headers={"vendure-token": CHANNEL}, timeout=20)
    d = r.json()
    asset = (d.get("data") or {}).get("uploadCustomerAsset")
    assert asset and asset.get("source"), "uploadCustomerAsset 失败: " + json.dumps(d, ensure_ascii=False)[:260]
    src = str(asset["source"]).replace("\\", "/")
    print("evidence uploaded:", src)
    return src


def assign_and_report(o, tag, rider_cid, note=EXC_NOTE, exc_type="no_recipient", photos=None):
    ok = admin_gql('mutation($o: ID!, $r: ID!){ campusAssignOrder(orderId: $o, riderCustomerId: $r){ assigned } }',
                   {"o": o["id"], "r": rider_cid})["campusAssignOrder"]["assigned"]
    assert ok, f"[{tag}] 强派失败（订单可能被抢）"
    tasks = rider_gql("query { campusMyTasks { id } }")["campusMyTasks"]
    assert any(str(t["id"]) == o["id"] for t in tasks), f"[{tag}] 骑手任务列表未见订单 {o['code']}"
    rider_gql('mutation($o: ID!, $t: String!, $p: [String!]!, $n: String){ '
              'campusReportException(orderId: $o, type: $t, photos: $p, note: $n){ id } }',
              {"o": o["id"], "t": exc_type, "p": photos or [], "n": note})
    cf = order_admin(o["id"])["customFields"]
    assert cf["deliveryStatus"] == "exception", f"[{tag}] 上报后 deliveryStatus={cf['deliveryStatus']}"
    print(f"[{tag}] exception reported ok (type={exc_type}, photos={len(photos or [])})")


def refunded_sum(o):
    oa = order_admin(o["id"])
    total = 0
    for p in oa["payments"] or []:
        for rf in p.get("refunds") or []:
            total += rf["total"]
    return oa, total


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True)

        # —— 0. admin API 登录 + 骑手准备 ——
        lr = adm.post(ADMIN_API, json={"query": ADMIN_LOGIN, "variables": {"u": ADMIN_USER, "p": ADMIN_PWD}}, timeout=20)
        tok = lr.headers.get("vendure-auth-token")
        assert tok, "admin 登录未返回 token: " + lr.text[:200]
        adm.headers["Authorization"] = "Bearer " + tok
        adm.headers["vendure-token"] = CHANNEL
        me = admin_gql('query { me { id } }')
        print("admin login ok, uid:", me["me"]["id"])

        rider_cid = ensure_rider()
        rl = rider_gql(LOGIN, {"u": RIDER_EMAIL, "p": RIDER_PWD})
        print("rider login ok, uid:", rl["login"]["id"])

        coupon_tpl = ensure_coupon_template()

        # —— 用户/管理页两个手机视口 ——
        ctx_a = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        pa = ctx_a.new_page()
        pa.goto(CHECKOUT, wait_until="domcontentloaded", timeout=60000)
        pa.wait_for_timeout(3000)
        uid = must(page_gql(pa, LOGIN, {"u": ORDERER[0], "p": ORDERER[1]}), "login")["id"]
        print("h5 user login ok, uid:", uid)

        ctx_b = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                    is_mobile=True, has_touch=True, locale="zh-CN")
        pb = ctx_b.new_page()
        pb.goto(ADMIN + "pages/login/index", wait_until="networkidle", timeout=60000)
        pb.wait_for_selector('input[type="text"]', timeout=30000)
        pb.fill('input[type="text"]', ADMIN_USER)
        pb.fill('input[type="password"]', ADMIN_PWD)
        pb.click("text=登 录")
        try:
            pb.wait_for_load_state("networkidle", timeout=30000)
        except Exception:
            pass
        time.sleep(3)
        pb.evaluate("t => { localStorage.setItem('wa_channel_token', t); }", CHANNEL)
        print("admin UI login ok")

        codes = {}
        # ============ 路径A 退差价 ============
        A = create_order(pa, "A")
        assign_and_report(A, "A", rider_cid)

        pa.goto(H5_DETAIL % A["code"], wait_until="domcontentloaded", timeout=60000)
        body = wait_ready(pa, ["骑手上报异常，平台处理中"])
        assert "骑手上报异常，平台处理中" in body, "黄条未渲染: " + body[:400]
        pa.screenshot(path=f"{OUT}\\wa-order-exc-pending.png", full_page=True)
        print("[A] pending banner shot ok")

        admin_gql('mutation($o: ID!, $a: String!, $amt: Int, $n: String){ campusHandleException('
                  'orderId: $o, action: $a, amount: $amt, note: $n){ ok action } }',
                  {"o": A["id"], "a": "refund_diff", "amt": 50, "n": "冒烟：退差价0.5元"})
        oa, refunded = refunded_sum(A)
        cf = oa["customFields"]
        assert cf["exceptionAction"] == "refund_diff" and cf["exceptionCompensation"] == 50, \
            f"[A] 留痕异常: {json.dumps(cf, ensure_ascii=False)[:300]}"
        assert cf["hallStatus"] == "exception_final", f"[A] hallStatus={cf['hallStatus']}"
        assert refunded == 50 and all(
            rf["state"] == "Settled" for pay in oa["payments"] for rf in pay["refunds"]), \
            f"[A] 退款未结算: refunded={refunded}"
        print(f"[A] refund_diff PASS (refund={refunded}, handledBy={cf['exceptionHandledBy']})")

        # 同 hash URL goto 不会重载页面，必须 reload 才能重新拉取处置后数据
        pa.reload(wait_until="domcontentloaded")
        body = wait_ready(pa, ["异常已处理", "平台已赔付 ¥0.50（原路退回）"])
        assert "平台已赔付 ¥0.50（原路退回）" in body, "绿条未渲染: " + body[:400]
        pa.screenshot(path=f"{OUT}\\wa-order-exc-final.png", full_page=True)
        print("[A] final banner shot ok")
        codes["A"] = A["code"]

        # ============ 路径B 发券（food_spilled + 拍照存证，plan 3.4 补全） ============
        tpl_id, tpl_name = coupon_tpl
        B = create_order(pa, "B")
        photo = rider_upload_asset()
        assign_and_report(B, "B", rider_cid, note="冒烟：餐品洒漏损坏", exc_type="food_spilled", photos=[photo])
        assert order_admin(B["id"])["customFields"]["exceptionPhotos"] == [photo], "[B] exceptionPhotos 未落库"
        board = admin_gql(BOARD_Q)["campusDispatchBoard"]
        alert_b = next(a for a in board["alerts"] if a["orderCode"] == B["code"])
        assert alert_b["exceptionPhotos"] == [photo], \
            "[B] 调度墙异常卡照片未透出: " + json.dumps(alert_b, ensure_ascii=False)[:260]
        print(f"[B] food_spilled 照片透出 PASS ({tpl_name})")

        # 处置卡截图（此时 A/B 两单都在异常墙上，B 卡带存证照片）
        pb.goto(DISPATCH_PAGE, wait_until="domcontentloaded", timeout=60000)
        body = wait_ready(pb, ["异常待处理", A["code"], B["code"]])
        assert A["code"] in body and B["code"] in body and "异常待处理" in body, "处置卡未渲染: " + body[:400]
        pb.screenshot(path=f"{OUT}\\wa-admin-dispatch-exc-card.png", full_page=True)
        print("[B] dispatch exc-card shot ok")

        admin_gql('mutation($o: ID!, $a: String!, $t: ID, $n: String){ campusHandleException('
                  'orderId: $o, action: $a, couponTemplateId: $t, note: $n){ ok action } }',
                  {"o": B["id"], "a": "coupon", "t": tpl_id, "n": "冒烟：发券补偿"})
        cf = order_admin(B["id"])["customFields"]
        assert cf["exceptionAction"] == "coupon" and cf["exceptionCouponTemplateId"] == tpl_id, \
            f"[B] 留痕异常: {json.dumps(cf, ensure_ascii=False)[:300]}"
        assert cf["hallStatus"] == "exception_final", f"[B] hallStatus={cf['hallStatus']}"
        print(f"[B] coupon PASS (template={tpl_name})")
        codes["B"] = B["code"]

        # ============ 路径C 全额退单 ============
        C = create_order(pa, "C")
        assign_and_report(C, "C", rider_cid)
        paid_total = int(order_admin(C["id"])["payments"][0]["amount"])
        admin_gql('mutation($o: ID!, $a: String!, $n: String){ campusHandleException('
                  'orderId: $o, action: $a, note: $n){ ok action } }',
                  {"o": C["id"], "a": "refund_all", "n": "冒烟：全额退单"})
        oa, refunded = refunded_sum(C)
        cf = oa["customFields"]
        assert oa["state"] == "Cancelled", f"[C] state={oa['state']}"
        assert cf["campusCause"] == "exception_refund", f"[C] campusCause={cf['campusCause']}"
        assert cf["hallStatus"] == "exception_final", f"[C] hallStatus={cf['hallStatus']}"
        assert refunded == paid_total, f"[C] 退款 {refunded} != 支付 {paid_total}"
        print(f"[C] refund_all PASS (state={oa['state']}, refunded={refunded})")
        codes["C"] = C["code"]

        # ============ 路径D 重派 ============
        D = create_order(pa, "D")
        assign_and_report(D, "D", rider_cid)
        admin_gql('mutation($o: ID!, $a: String!, $n: String){ campusHandleException('
                  'orderId: $o, action: $a, note: $n){ ok action } }',
                  {"o": D["id"], "a": "reassign", "n": "冒烟：重新安排配送"})
        cf = order_admin(D["id"])["customFields"]
        assert cf["hallStatus"] == "open" and cf["deliveryStatus"] is None, \
            f"[D] 未回大厅: {json.dumps(cf, ensure_ascii=False)[:300]}"
        assert cf["exceptionAction"] == "reassign", f"[D] 留痕异常: {json.dumps(cf, ensure_ascii=False)[:300]}"
        print("[D] reassign PASS (back to hall)")
        codes["D"] = D["code"]

        # 收尾：立即重新强派+再上报 → refund_all（防调度自动派单/真实骑手抢单）
        assign_and_report(D, "D", rider_cid, note="冒烟：重派后收尾退单")
        admin_gql('mutation($o: ID!, $a: String!, $n: String){ campusHandleException('
                  'orderId: $o, action: $a, note: $n){ ok action } }',
                  {"o": D["id"], "a": "refund_all", "n": "冒烟：重派后收尾退单"})
        oa, refunded = refunded_sum(D)
        assert oa["state"] == "Cancelled", f"[D] 收尾 state={oa['state']}"
        print(f"[D] cleanup PASS (state={oa['state']}, refunded={refunded})")

        # ============ 路径E 骑手页内上报面板截图（plan 3.4 补全 UI） ============
        E = create_order(pa, "E")
        ok = admin_gql('mutation($o: ID!, $r: ID!){ campusAssignOrder(orderId: $o, riderCustomerId: $r){ assigned } }',
                       {"o": E["id"], "r": rider_cid})["campusAssignOrder"]["assigned"]
        assert ok, "[E] 强派失败"
        pr = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                 is_mobile=True, has_touch=True, locale="zh-CN").new_page()
        # UI 真实登录（无 token → 登录页 redirect=任务页；localStorage 注入被 hash 路由启动时序坑）
        pr.goto(RIDER_PAGE, wait_until="domcontentloaded", timeout=60000)
        wait_ready(pr, ["账号登录"])
        pr.click("text=账号登录")
        pr.fill('input[type="text"]', RIDER_EMAIL)
        pr.fill('input[type="password"]', RIDER_PWD)
        pr.locator(".login-page__submit:not([disabled])").first.click()
        body = wait_ready(pr, [E["code"]])   # 登录后 redirect 回任务页，8s 轮询窗口内出卡
        assert E["code"] in body, "[E] 骑手任务卡未渲染: " + body[:300]
        pr.click("text=异常上报")
        body = wait_ready(pr, ["商家无法出餐"])   # assigned 态 chips = 商家无法出餐/其他
        assert "商家无法出餐" in body and "联系不上收件人" not in body, "[E] assigned chips 过滤异常: " + body[:300]
        pr.wait_for_timeout(2200)   # 等登录 toast 消失再截图
        pr.screenshot(path=f"{OUT}\\wa-rider-exc-panel-assigned.png", full_page=True)
        pr.click("text=异常上报")   # 收起面板（避免下方 toggle 误关）
        # 状态推进走 API 代劳（UI 点击按钮受 toast/轮询竞态影响不稳定），面板交互仍走 UI
        rider_gql('mutation($o: ID!){ campusStartTask(orderId: $o){ id } }', {"o": E["id"]})
        body = wait_ready(pr, ["已取货，配送中"])   # UI 8s 轮询带出新状态
        assert "已取货，配送中" in body, "[E] startTask 后 UI 未刷新: " + body[:300]
        pr.click("text=异常上报")
        body = wait_ready(pr, ["餐品洒漏损坏"])   # in_progress 态 chips = 联系不上/洒漏/其他
        assert "餐品洒漏损坏" in body and "联系不上收件人" in body, "[E] in_progress chips 过滤异常: " + body[:300]
        pr.screenshot(path=f"{OUT}\\wa-rider-exc-panel-inprogress.png", full_page=True)
        print("[E] rider exc-panel shots ok (assigned + in_progress)")
        # 收尾：API 上报异常 → refund_all（UI 面板不真实提交，防脏单滞留）
        rider_gql('mutation($o: ID!, $t: String!, $p: [String!]!, $n: String){ '
                  'campusReportException(orderId: $o, type: $t, photos: $p, note: $n){ id } }',
                  {"o": E["id"], "t": "no_recipient", "p": [], "n": "冒烟：面板验证收尾"})
        admin_gql('mutation($o: ID!, $a: String!, $n: String){ campusHandleException('
                  'orderId: $o, action: $a, note: $n){ ok action } }',
                  {"o": E["id"], "a": "refund_all", "n": "冒烟：面板验证收尾"})
        print("[E] cleanup PASS")
        codes["E"] = E["code"]

        # ============ 留痕区截图 ============
        pb.reload(wait_until="domcontentloaded")
        body = wait_ready(pb, ["异常处置记录", codes["A"]])
        assert "异常处置记录" in body and codes["A"] in body, "留痕区未渲染: " + body[:400]
        pb.screenshot(path=f"{OUT}\\wa-admin-dispatch-handled.png", full_page=True)
        print("handled list shot ok")

        # ============ 清理 ============
        clean_active_order(pa)
        browser.close()

    print("=" * 60)
    print("四路径全部 PASS：")
    for k, v in codes.items():
        print(f"  [{k}] order {v}")
    print("[DONE] shots ->", OUT)


if __name__ == "__main__":
    main()
