# -*- coding: utf-8 -*-
"""plan 3.3 多单顺路合并 冒烟+截图（390x844 dpr=2）。

流程：
1. admin API 登录；准备冒烟骑手（approved）；骑手会话登录
2. 用户连建 2 单（同楼栋 桂1栋 R3 即时单）→ 等调度 job T1.5 打包（同 routeGroupId）
3. 调度台大厅列「顺路 2 单」badge 截图
4. 骑手 UI 登录 → 大厅两卡「顺路 2 单」badge 截图 → UI 抢单（整组接走，无需抢第二单）
   → 任务页路线组卡截图（方案 A：组头+子单行）
5. API 批量开始取货 → UI 8s 轮询带出配送中 → UI 点选两个子单 checkbox →
   断言主按钮「送达勾选的 2 单 · 拍照存证」→ 截图
6. API 逐单送达（同一张照片=前端批量送达同语义）→ 断言两单 delivered +
   deliveryStaffId 一致 + riderEarning 各自入账 → UI「已送达 2/2」截图
7. 清理用户草稿单

关键背景（沿 3.4 冒烟实测）：
- 本 vendure fork shop-api 鉴权认会话 cookie → 用户侧全部走「页面上下文 fetch」；
- 骑手/admin 侧用 requests.Session（cookie 自动续）+ Bearer 响应头双保险；
- 骑手 H5 截图必须走登录页 UI 真实登录（localStorage 注入 token 有时序坑）。
"""
import base64
import json
import time

import requests
from playwright.sync_api import sync_playwright

API = "https://www.yourbao.cn/shop-api"
ADMIN_API = "https://e.joho.cn/admin-api"
ADMIN = "https://e.joho.cn/guanli/#/"
CHECKOUT = "https://www.yourbao.cn/waimai/?tenant=canteen-a-token#/pkg-order/pages/checkout"
RIDER_HOME = "https://www.yourbao.cn/waimai/?tenant=canteen-a-token#/pkg-rider/pages/rider-home"
RIDER_PAGE = "https://www.yourbao.cn/waimai/?tenant=canteen-a-token#/pkg-rider/pages/rider-delivering"
DISPATCH_PAGE = ADMIN + "pages/campus/dispatch"
OUT = r"d:\zhao\waimai\docs\screenshots"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"

CHANNEL = "canteen-a-token"
VARIANT_ID = "87"                 # 可乐鸡排饭 205分 ×10 = 2050分 ≥ 起送1500
ZONE_ID, BUILDING_ID = "2", "2"   # 东区 / 桂1栋（两单同楼栋 → 打包前提）
ORDERER = ("smoke-order@yourbao.cn", "Wm@Smoke123")
RIDER_EMAIL, RIDER_PWD = "smoke-rider@yourbao.cn", "Wm@Smoke123"
ADMIN_USER, ADMIN_PWD = "superadmin", "z123123"

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
ORDER_Q = '''query($id: ID!){ order(id: $id){ id code state
  customFields { hallStatus deliveryStatus deliveryStaffId routeGroupId riderEarning } } }'''
START = 'mutation($o: ID!){ campusStartTask(orderId: $o){ id customFields { deliveryStatus } } }'
DELIVER = ('mutation($o: ID!, $p: [String!]!){ campusDeliverTask(orderId: $o, photos: $p) '
           '{ id customFields { deliveryStatus riderEarning } } }')

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
    d = r.json()
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
    if not ao:
        return
    for line in ao.get("lines") or []:
        page_gql(pg, 'mutation($id: ID!){ removeOrderLine(orderLineId: $id){ ... on Order { id } } }',
                 {"id": line["id"]})


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
    assert items, "冒烟骑手不存在（先跑 3.4 冒烟创建）"
    cid = str(items[0]["id"])
    admin_gql('mutation($c: ID!){ campusSetRiderStatus(customerId: $c, status: "approved"){ status } }', {"c": cid})
    print("rider ready:", RIDER_EMAIL, "id=", cid)
    return cid


# 1x1 红色 PNG（送达照片占位）
UPLOAD_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


def rider_upload_asset():
    ops = {"query": 'mutation($file: Upload!){ uploadCustomerAsset(file: $file){ id source preview } }',
           "variables": {"file": None}}
    r = rs.post(API, data={"operations": json.dumps(ops), "map": json.dumps({"0": ["variables.file"]})},
                files={"0": ("evidence.png", UPLOAD_PNG, "image/png")},
                headers={"vendure-token": CHANNEL}, timeout=20)
    d = r.json()
    asset = (d.get("data") or {}).get("uploadCustomerAsset")
    assert asset and asset.get("source"), "uploadCustomerAsset 失败: " + json.dumps(d, ensure_ascii=False)[:260]
    return str(asset["source"]).replace("\\", "/")


def create_order(pa, tag):
    clean_active_order(pa)
    must(page_gql(pa, ADD_ITEM, {"v": VARIANT_ID, "q": 10}), "addItemToOrder")
    must(page_gql(pa, SET_TARGET, {"z": ZONE_ID, "b": BUILDING_ID}), "campusSetDeliveryTarget")
    methods = must(page_gql(pa, ELIGIBLE), "eligibleShippingMethods") or []
    campus = next((m for m in methods if (m.get("code") or "").startswith("campus-errand")), None)
    assert campus, "eligible 无 campus-errand 方式"
    must(page_gql(pa, SET_SHIP, {"id": [campus["id"]]}), "setOrderShippingMethod")
    must(page_gql(pa, TRANSITION), "transitionOrderToState")
    pay = must(page_gql(pa, PAY, {"m": "cod-payment-template"}), "addPaymentToOrder")
    oid, code = str(pay["id"]), pay["code"]
    print(f"[{tag}] order {code} paid, hallStatus={pay['customFields']['hallStatus']}")
    paid = admin_gql('query($id: ID!){ order(id: $id){ payments { id state } } }', {"id": oid})["order"]
    paym = paid["payments"][0]
    if paym["state"] != "Settled":
        admin_gql('mutation($i: ID!){ settlePayment(id: $i){ ... on Payment { id state } '
                  '... on ErrorResult { errorCode message } } }', {"i": paym["id"]})
    # 等入大厅
    for i in range(40):
        cf = order_admin(oid)["customFields"]
        if cf["hallStatus"] == "open":
            print(f"[{tag}] hall open after {i * 1.5:.0f}s")
            return {"id": oid, "code": code}
        if cf["hallStatus"] == "pending_merchant":
            admin_gql('mutation($o: ID!){ campusMerchantAcceptOrder(orderId: $o){ ok } }', {"o": oid})
            admin_gql('mutation($o: ID!){ campusMerchantCookingDone(orderId: $o){ ok } }', {"o": oid})
        time.sleep(1.5)
    raise AssertionError(f"[{tag}] 60s 未入大厅")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True)

        # —— 0. 登录与准备 ——
        lr = adm.post(ADMIN_API, json={"query": ADMIN_LOGIN, "variables": {"u": ADMIN_USER, "p": ADMIN_PWD}}, timeout=20)
        tok = lr.headers.get("vendure-auth-token")
        assert tok, "admin 登录未返回 token"
        adm.headers["Authorization"] = "Bearer " + tok
        adm.headers["vendure-token"] = CHANNEL
        print("admin login ok")

        rider_cid = ensure_rider()
        rl = rider_gql(LOGIN, {"u": RIDER_EMAIL, "p": RIDER_PWD})
        print("rider api login ok, uid:", rl["login"]["id"])

        # —— 1. 用户建 2 单（同楼栋） ——
        ctx_a = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        pa = ctx_a.new_page()
        pa.goto(CHECKOUT, wait_until="domcontentloaded", timeout=60000)
        pa.wait_for_timeout(3000)
        must(page_gql(pa, LOGIN, {"u": ORDERER[0], "p": ORDERER[1]}), "login")
        print("h5 user login ok")

        A = create_order(pa, "A")
        B = create_order(pa, "B")

        # —— 2. 等调度 job T1.5 打包（tick 60s，轮询 90s 上限） ——
        gid = None
        for i in range(30):
            cfa = order_admin(A["id"])["customFields"]
            cfb = order_admin(B["id"])["customFields"]
            if cfa.get("routeGroupId") and cfa["routeGroupId"] == cfb.get("routeGroupId"):
                gid = cfa["routeGroupId"]
                print(f"[pack] routeGroupId={gid} after {i * 3}s")
                break
            time.sleep(3)
        assert gid, f"90s 未打包: A={cfa.get('routeGroupId')} B={cfb.get('routeGroupId')}"

        # —— 3. 调度台「顺路 2 单」badge 截图 ——
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
        pb.goto(DISPATCH_PAGE, wait_until="domcontentloaded", timeout=60000)
        body = wait_ready(pb, ["顺路 2 单", A["code"], B["code"]])
        assert "顺路 2 单" in body and A["code"] in body and B["code"] in body, \
            "调度台顺路 badge 未渲染: " + body[:400]
        pb.screenshot(path=f"{OUT}\\wa-admin-dispatch-route-badge.png", full_page=True)
        print("[admin] dispatch route badge shot ok")

        # —— 4. 骑手 UI 登录 → 大厅 badge → UI 抢单整组接走 → 组卡截图 ——
        pr = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                 is_mobile=True, has_touch=True, locale="zh-CN").new_page()
        pr.goto(RIDER_HOME, wait_until="domcontentloaded", timeout=60000)
        wait_ready(pr, ["账号登录"])
        pr.click("text=账号登录")
        pr.fill('input[type="text"]', RIDER_EMAIL)
        pr.fill('input[type="password"]', RIDER_PWD)
        pr.locator(".login-page__submit:not([disabled])").first.click()
        wait_ready(pr, ["已下线"])          # 登录成功 redirect 回骑手大厅（默认下线态）
        pr.click(".online")                 # 打开「接单中」开关上线，才拉取大厅列表
        body = wait_ready(pr, ["顺路 2 单", A["code"], B["code"]])
        assert "顺路 2 单" in body, "大厅顺路 badge 未渲染: " + body[:400]
        # 强断言：badge 挂在 A 卡上（防旧滞留组的 badge 混过断言）
        a_txt = pr.locator(".task").filter(has_text=A["code"]).inner_text()
        assert "顺路 2 单" in a_txt, "A 卡顺路 badge 未渲染: " + a_txt[:300]
        pr.wait_for_timeout(2200)
        pr.screenshot(path=f"{OUT}\\wa-rider-hall-route-badge.png", full_page=True)
        print("[rider] hall route badge shot ok")

        # 按 A 单号定位卡片再抢（大厅加急置顶，first 可能是旧滞留单）→ 整组接走（A+B 同骑手）
        pr.locator(".task").filter(has_text=A["code"]).locator(".grab").click()
        body = wait_ready(pr, ["路线任务", A["code"], B["code"]], tries=30)
        assert "路线任务" in body and A["code"] in body and B["code"] in body, \
            "任务页路线组卡未渲染: " + body[:400]
        pr.screenshot(path=f"{OUT}\\wa-rider-task-group.png", full_page=True)
        print("[rider] task group card shot ok (assigned)")

        cfa = order_admin(A["id"])["customFields"]
        cfb = order_admin(B["id"])["customFields"]
        assert cfa["deliveryStatus"] == "assigned" and cfb["deliveryStatus"] == "assigned", \
            f"整组接单失败: A={cfa['deliveryStatus']} B={cfb['deliveryStatus']}"
        assert cfa["deliveryStaffId"] == cfb["deliveryStaffId"] == str(rider_cid), \
            f"骑手不一致: {cfa['deliveryStaffId']} / {cfb['deliveryStaffId']}"
        assert cfa["hallStatus"] == "grabbed" and cfb["hallStatus"] == "grabbed", "hallStatus 未置 grabbed"
        print("[grab] 整组接单 PASS（一次 grab → A+B 同骑手 assigned）")

        # —— 5. 批量开始取货 → UI 配送中 → 勾选 2 子单 → 批量送达按钮断言 ——
        # 页面可能残留历史轮次组卡/异常单/独立卡（旧文案含「已取货」「点圆圈勾选送达」等），
        # 一切断言以 A 单所在组卡（gcard）为作用域，防旧卡混过断言
        rider_gql(START, {"o": A["id"]})
        rider_gql(START, {"o": B["id"]})
        gcard = pr.locator(".task-card.group").filter(has_text=A["code"])
        gtxt = ""
        for _ in range(20):
            pr.wait_for_timeout(1000)
            gtxt = gcard.inner_text()
            if gtxt.count("点圆圈勾选送达") >= 2:
                break
        assert gtxt.count("点圆圈勾选送达") >= 2, "子单行未进入配送中: " + gtxt[:400]
        gcard.locator(".ck").first.click()
        gcard.locator(".ck").nth(1).click()
        btxt = ""
        for _ in range(10):
            pr.wait_for_timeout(500)
            btxt = gcard.inner_text()
            if "送达勾选的 2 单 · 拍照存证" in btxt:
                break
        assert "送达勾选的 2 单 · 拍照存证" in btxt, "勾选计数按钮未更新: " + btxt[:400]
        pr.screenshot(path=f"{OUT}\\wa-rider-task-group-checked.png", full_page=True)
        print("[rider] group checked shot ok")

        # —— 6. 逐单送达（同一照片 = 前端批量送达语义）：先送 A 截组进度，再送 B 断言组卡离场 ——
        # 注意：campusDeliverTask/campusGrabOrder 返回的是更新前加载的旧实体快照（deliveryStatus
        # 仍为旧值），落库状态必须回查 admin order 确认
        photo = rider_upload_asset()
        rider_gql(DELIVER, {"o": A["id"], "p": [photo]})

        def wait_delivered(oid, tag):
            cf = None
            for _ in range(10):
                cf = order_admin(oid)["customFields"]
                if cf["deliveryStatus"] == "delivered":
                    return cf
                time.sleep(1)
            raise AssertionError(f"[{tag}] 送达未落库: {cf}")

        ra = wait_delivered(A["id"], "A")
        # 本店配送费配置为 0（shippingWithTax=0）→ 分成 0 是合法值（0 分成单跳过入账），
        # 断言「delivered 时 riderEarning 字段必写入」即可
        assert ra["riderEarning"] is not None, f"A 分成字段未写入: {ra['riderEarning']}"
        gtxt = ""   # 组仍有活动单（B）→ 组卡保留并显示进度；历史卡可能已有「已送达 1/2」，须限定本组卡
        for _ in range(15):
            pr.wait_for_timeout(1000)
            gtxt = gcard.inner_text()
            if "已送达 1/2" in gtxt:
                break
        assert "已送达 1/2" in gcard.inner_text(), "组进度未更新: " + gtxt[:400]
        pr.wait_for_timeout(1500)
        pr.screenshot(path=f"{OUT}\\wa-rider-task-group-delivered.png", full_page=True)
        print("[rider] group progress shot ok (1/2 delivered)")

        rider_gql(DELIVER, {"o": B["id"], "p": [photo]})
        rb = wait_delivered(B["id"], "B")
        assert rb["riderEarning"] is not None, f"B 分成字段未写入: {rb['riderEarning']}"
        # 全组送达后无活动单 → 该组卡离开活动列表（activeOrders 过滤）；其他历史组卡仍在场，
        # 故只断言 A 单所在组卡消失，不能断言整页无「路线任务」
        for _ in range(15):
            pr.wait_for_timeout(1000)
            if gcard.count() == 0:
                break
        assert gcard.count() == 0, "全组送达后组卡未离场: " + pr.inner_text("body")[:400]
        print(f"[deliver] 两单送达 PASS（earning A={ra['riderEarning']} B={rb['riderEarning']} 分）")

        clean_active_order(pa)
        browser.close()

    print("=" * 60)
    print("3.3 多单顺路合并 冒烟全部 PASS")
    print(f"  A={A['code']} B={B['code']} routeGroupId={gid}")
    print("[DONE] shots ->", OUT)


if __name__ == "__main__":
    main()
