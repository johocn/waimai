# -*- coding: utf-8 -*-
"""售后全链路 冒烟+截图（390x844 dpr=2）。

流程：
0. admin API 登录；准备冒烟骑手（无则创建+approved）；骑手会话登录
1. 单1 全链路（S1-S8）：下单(variant87×10, R1, COD+settle) → 指派骑手 → 开始任务 → 送达
   (deliveryStatus=delivered, deliveredAt 非空) → 学生传凭证 → 部分退款100分建单(Pending)
   → 重复创建报 already exists → 商家拒绝(Rejected) → 学生申诉(Appealed)
   → 平台仲裁同意(Refunded, actualRefundAmount=100, order.customFields.afterSalesStatus=Refunded)
2. 单2 停在 Appealed（S1-S7）→ web-admin 售后详情仲裁页截图
3. 截图：C端创建页 / 售后详情已退款态 / 订单详情售后卡 / admin 仲裁页

关键背景（沿 _smoke_exception.py 实测姿势）：
- 本 vendure fork shop-api 鉴权认会话 cookie → 用户侧全部走「页面上下文 fetch」；
- 骑手/admin 侧用 requests.Session + Bearer 响应头双保险；
- admin-api 同源 https://e.joho.cn/admin-api，渠道上下文头 vendure-token=canteen-a-token。
"""
import base64
import json
import os
import time

import requests
from playwright.sync_api import sync_playwright

API = "https://www.yourbao.cn/shop-api"
ADMIN_API = "https://e.joho.cn/admin-api"
ADMIN = "https://e.joho.cn/guanli/#/"
H5 = "https://www.yourbao.cn/waimai/?tenant=%s#/%%s" % "canteen-a-token"
CHECKOUT = H5 % "pkg-order/pages/checkout"
OUT = r"d:\zhao\waimai\docs\screenshots\aftersale"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"

CHANNEL = "canteen-a-token"
VARIANT_ID = "87"                 # 可乐鸡排饭 205分 ×10 = 2050分 ≥ 起送1500
ZONE_ID, BUILDING_ID = "2", "2"   # 东区(运费2元) / 桂1栋
ORDERER = ("smoke-order@yourbao.cn", "Wm@Smoke123")
RIDER_EMAIL, RIDER_PWD = "smoke-rider@yourbao.cn", "Wm@Smoke123"
ADMIN_USER, ADMIN_PWD = "superadmin", "z123123"
PART_REFUND = 100                 # 1 元部分退

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
       '{ ... on Order { id code state customFields { hallStatus } } ... on ErrorResult { errorCode message } } }')
LOGIN = 'mutation($u: String!, $p: String!){ login(username: $u, password: $p) { ... on CurrentUser { id } } }'

ADMIN_LOGIN = 'mutation($u: String!, $p: String!){ login(username: $u, password: $p) { ... on CurrentUser { id } } }'
ORDER_Q = '''query($id: ID!){ order(id: $id){ id code state total
  payments { id amount state refunds { id total state } }
  customFields { hallStatus deliveryStatus deliveredAt afterSalesStatus } } }'''

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
    d = page_gql_raw(pg, query, variables)
    assert not d.get("errors"), "user GQL 错误: " + gql_err(d)
    return d


def page_gql_raw(pg, query, variables=None):
    """同 page_gql 但不抛错（供断言错误用例使用）。"""
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
    return pg.evaluate(js, {"q": query, "v": variables})


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


def create_order(pa, tag):
    """用户建单：10×2.05 → R1 配送目标 → campus-errand 运费 → COD 支付+结算 → 等入大厅。"""
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
    cf = {}
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


def assign_and_deliver(o, tag, rider_cid):
    """强派 → 骑手开始任务 → 送达（photos 必填）；断言 deliveryStatus=delivered + deliveredAt 落库。"""
    ok = admin_gql('mutation($o: ID!, $r: ID!){ campusAssignOrder(orderId: $o, riderCustomerId: $r){ assigned } }',
                   {"o": o["id"], "r": rider_cid})["campusAssignOrder"]["assigned"]
    assert ok, f"[{tag}] 强派失败（订单可能被抢）"
    tasks = rider_gql("query { campusMyTasks { id } }")["campusMyTasks"]
    assert any(str(t["id"]) == o["id"] for t in tasks), f"[{tag}] 骑手任务列表未见订单 {o['code']}"
    rider_gql('mutation($o: ID!){ campusStartTask(orderId: $o){ id } }', {"o": o["id"]})
    rider_gql('mutation($o: ID!, $p: [String!]!){ campusDeliverTask(orderId: $o, photos: $p, note: "冒烟送达"){ id } }',
              {"o": o["id"], "p": ["/static/x.webp"]})
    cf = order_admin(o["id"])["customFields"]
    assert cf["deliveryStatus"] == "delivered" and cf["deliveredAt"], \
        f"[{tag}] 送达落库异常: {json.dumps(cf, ensure_ascii=False)[:260]}"
    print(f"[{tag}] delivered ok (deliveredAt={cf['deliveredAt']})")


# 1x1 红色 PNG data URL（售后凭证占位）
EVIDENCE_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def create_pending_request(pa, o, tag):
    """学生传凭证 + 部分退款建单 → Pending；返回售后单 id。"""
    d = must(page_gql(pa, 'mutation($i: [String!]!){ uploadAfterSalesEvidence(images: $i) }',
                      {"i": [EVIDENCE_DATA_URL]}), "uploadAfterSalesEvidence")
    assert d and d[0], f"[{tag}] 凭证上传返回空: {json.dumps(d, ensure_ascii=False)[:200]}"
    print(f"[{tag}] evidence uploaded:", d[0])
    req = must(page_gql(pa, '''mutation($i: CreateAfterSalesRequestInput!){ createAfterSalesRequest(input: $i)
        { id state refundAmount type reason } }''',
        {"i": {"orderId": o["id"], "type": "refund_only", "reason": "少送",
               "description": "部分退款：可乐鸡排饭×1", "evidenceImages": d, "refundAmount": PART_REFUND}}),
        "createAfterSalesRequest")
    assert req["state"] == "Pending", f"[{tag}] 建单态={req['state']}"
    assert req["refundAmount"] == PART_REFUND, f"[{tag}] refundAmount={req['refundAmount']}"
    print(f"[{tag}] after-sales #{req['id']} created (Pending, {PART_REFUND}分)")
    return str(req["id"])


def assert_duplicate_rejected(pa, o, tag):
    """重复建单 → UserInputError contains 'already exists'。"""
    d = page_gql_raw(pa, '''mutation($i: CreateAfterSalesRequestInput!){ createAfterSalesRequest(input: $i){ id } }''',
                     {"i": {"orderId": o["id"], "type": "refund_only", "reason": "少送", "refundAmount": PART_REFUND}})
    errs = d.get("errors") or []
    assert errs and "already exists" in json.dumps(errs, ensure_ascii=False), \
        f"[{tag}] 重复建单未被拒: {json.dumps(d, ensure_ascii=False)[:260]}"
    print(f"[{tag}] duplicate rejected ok")


def refunded_sum(o):
    oa = order_admin(o["id"])
    total = 0
    for p in oa["payments"] or []:
        for rf in p.get("refunds") or []:
            total += rf["total"]
    return oa, total


def main():
    os.makedirs(OUT, exist_ok=True)
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

        # —— 用户/管理页两个手机视口 ——
        ctx_a = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                    is_mobile=True, has_touch=True, locale="zh-CN")
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

        # ============ 单1：全链路 S1-S8 ============
        A = create_order(pa, "A")
        assign_and_deliver(A, "A", rider_cid)
        req_id = create_pending_request(pa, A, "A")
        assert_duplicate_rejected(pa, A, "A")

        # S6 商家拒绝
        rej = admin_gql('mutation($i: ID!, $r: String!){ rejectAfterSalesRequest(id: $i, reason: $r){ id state rejectReason } }',
                        {"i": req_id, "r": "出餐记录正常"})["rejectAfterSalesRequest"]
        assert rej["state"] == "Rejected", f"[A] 拒绝态={rej['state']}"
        print("[A] rejected ok")
        # S7 学生申诉
        app = must(page_gql(pa, 'mutation($i: ID!, $n: String!){ appealAfterSalesRequest(id: $i, note: $n){ id state } }',
                            {"i": req_id, "n": "收到的餐品数量不对"}), "appealAfterSalesRequest")
        assert app["state"] == "Appealed", f"[A] 申诉态={app['state']}"
        print("[A] appealed ok")
        # S8 平台仲裁同意 → 链式退款
        arb = admin_gql('mutation($i: ID!, $n: String){ arbitrateAfterSales(id: $i, approve: true, note: $n){ id state actualRefundAmount } }',
                        {"i": req_id, "n": "冒烟：凭证有效，同意退款"})["arbitrateAfterSales"]
        assert arb["state"] == "Refunded", f"[A] 仲裁后态={arb['state']}"
        assert arb["actualRefundAmount"] == PART_REFUND, f"[A] 实退={arb['actualRefundAmount']}"
        oa, refunded = refunded_sum(A)
        assert refunded == PART_REFUND and all(
            rf["state"] == "Settled" for pay in oa["payments"] for rf in pay["refunds"]), \
            f"[A] 退款未结算: refunded={refunded}"
        assert oa["customFields"]["afterSalesStatus"] == "Refunded", \
            f"[A] afterSalesStatus={oa['customFields']['afterSalesStatus']}"
        print(f"[A] arbitrate→Refunded PASS (refund={refunded}, afterSalesStatus=Refunded)")

        # —— 截图1：C端售后创建页（整单/部分双模式）——
        pa.goto(H5 % f"pkg-order/pages/after-sale-create?code={A['code']}", wait_until="domcontentloaded", timeout=60000)
        body = wait_ready(pa, ["预计退款金额", "售后原因"])
        assert "预计退款金额" in body and "售后原因" in body, "创建页未渲染: " + body[:400]
        pa.wait_for_timeout(1500)
        pa.screenshot(path=f"{OUT}\\wa-as-create.png", full_page=True)
        print("[shot] wa-as-create.png ok")

        # —— 截图2：售后详情已退款态 ——
        pa.goto(H5 % f"pkg-order/pages/after-sale-detail?id={req_id}", wait_until="domcontentloaded", timeout=60000)
        body = wait_ready(pa, ["已退款", "退款信息"])
        assert "已退款" in body and "退款信息" in body, "售后详情未渲染: " + body[:400]
        pa.wait_for_timeout(1500)
        pa.screenshot(path=f"{OUT}\\wa-as-detail-refunded.png", full_page=True)
        print("[shot] wa-as-detail-refunded.png ok")

        # —— 截图3：订单详情售后状态卡 ——
        pa.goto(H5 % f"pkg-order/pages/order-detail?code={A['code']}", wait_until="domcontentloaded", timeout=60000)
        body = wait_ready(pa, ["售后 已退款"])
        assert "售后 已退款" in body, "订单详情售后卡未渲染: " + body[:400]
        pa.wait_for_timeout(1500)
        pa.screenshot(path=f"{OUT}\\wa-as-order-card.png", full_page=True)
        print("[shot] wa-as-order-card.png ok")

        # ============ 单2：停在 Appealed（admin 仲裁页截图素材）============
        B = create_order(pa, "B")
        assign_and_deliver(B, "B", rider_cid)
        req2 = create_pending_request(pa, B, "B")
        admin_gql('mutation($i: ID!, $r: String!){ rejectAfterSalesRequest(id: $i, reason: $r){ id state } }',
                  {"i": req2, "r": "出餐记录正常"})
        must(page_gql(pa, 'mutation($i: ID!, $n: String!){ appealAfterSalesRequest(id: $i, note: $n){ id state } }',
                      {"i": req2, "n": "冒烟：申请平台仲裁"}), "appealAfterSalesRequest")
        print(f"[B] after-sales #{req2} at Appealed")

        # —— 截图4：web-admin 售后详情仲裁页 ——
        pb.goto(ADMIN + f"pages/after-sale/detail/index?id={req2}", wait_until="domcontentloaded", timeout=60000)
        body = wait_ready(pb, ["平台仲裁中", "仲裁同意退款", "维持拒绝"])
        assert "平台仲裁中" in body and "仲裁同意退款" in body, "admin 仲裁页未渲染: " + body[:400]
        pb.wait_for_timeout(1500)
        pb.screenshot(path=f"{OUT}\\wa-as-admin-appealed.png", full_page=True)
        print("[shot] wa-as-admin-appealed.png ok")

        clean_active_order(pa)
        browser.close()

    print("=" * 60)
    print(f"AFTER-SALE SMOKE PASS  (order {A['code']} refunded; order {B['code']} appealed)")
    print("[DONE] shots ->", OUT)


if __name__ == "__main__":
    main()
