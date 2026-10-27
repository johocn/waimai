# -*- coding: utf-8 -*-
"""P3-4 配送费阶梯计价 线上取证 + 截图（390x844 dpr=2）。

流程：
1. web-admin 拾光达配置页：canteen-a 加两档「满20→1.00 / 满30→0.50」保存并截图
2. waimaiStoreList 断言 deliveryFeeTiers 透出 JSON
3. H5 checkout 三态：
   商品 1636（未达档）→ 运费 ¥2.00（分区原价）
   商品 2046（命中满20档）→ 运费 ¥1.00 + 提示「满 ¥20.00 本单配送费 ¥1.00」
   商品 3070（命中满30档）→ 运费 ¥0.50 + 提示「满 ¥30.00 本单配送费 ¥0.50」
4. 清理：清阶梯保存为 null、清空草稿单
"""
import json
import os
import time

import requests
from playwright.sync_api import sync_playwright

BASE = "https://www.yourbao.cn/waimai/#/"
ADMIN = "https://e.joho.cn/guanli/#/"
API = "https://www.yourbao.cn/shop-api"
ADMIN_API = "https://www.yourbao.cn/admin-api"
OUT = r"D:\zhao\waimai-v39\docs\screenshots\p23-fee-tiers"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
CHANNEL = "canteen-a-token"
CHECKOUT = f"https://www.yourbao.cn/waimai/?tenant={CHANNEL}#/pkg-order/pages/checkout"
VARIANT_ID = "87"                 # 可乐鸡排饭 205分
ZONE_ID, BUILDING_ID = "2", "2"   # 东区(运费2元) / 桂1栋
TIERS = [{"minAmount": 2000, "fee": 100}, {"minAmount": 3000, "fee": 50}]
# R1 已开通但 canteen-a 无交接点 → 后台保存会被「交接点必填」拦下，先临时预置一个，取证后清空
HANDOVER_POINT = {"route": "R1", "name": "冒烟测试交接点", "address": None, "phone": None,
                  "lat": 30.5, "lng": 114.3, "isDefault": True}
ORDERER = ("smoke-ft@yourbao.cn", "Wm@Smoke123")
ADMIN_USER, ADMIN_PWD = "superadmin", "z123123"

ADD_ITEM = ('mutation($v: ID!, $q: Int!){ addItemToOrder(productVariantId: $v, quantity: $q) '
            '{ ... on Order { id } ... on ErrorResult { errorCode message } } }')
SET_TARGET = ('mutation($z: ID!, $b: ID!){ campusSetDeliveryTarget(zoneId: $z, buildingId: $b, route: "R1") '
              '{ id customFields { campusZone fulfillmentRoute } } }')
ELIGIBLE = "query { eligibleShippingMethods { id code price priceWithTax } }"
SET_SHIP = ('mutation($id: [ID!]!){ setOrderShippingMethod(shippingMethodId: $id) '
            '{ ... on Order { id } ... on ErrorResult { errorCode message } } }')
MONEY = ("query { activeOrder { subTotalWithTax shippingWithTax "
         "shippingLines { priceWithTax shippingMethod { code } } } }")
LOGIN = 'mutation($u: String!, $p: String!){ login(username: $u, password: $p) { ... on CurrentUser { id } } }'


def page_gql(pg, query, variables=None):
    """页面上下文同源 fetch（会话 cookie 生效的唯一通道）。"""
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


def must(d, key):
    data = (d.get("data") or {}).get(key)
    assert data, f"{key} 失败: {json.dumps(d, ensure_ascii=False)[:220]}"
    return data


def clean_active_order(pg):
    d = page_gql(pg, "query { activeOrder { id lines { id } } }")
    ao = (d.get("data") or {}).get("activeOrder")
    if not ao:
        return
    for line in ao.get("lines") or []:
        page_gql(pg, 'mutation($id: ID!){ removeOrderLine(orderLineId: $id){ ... on Order { id } } }',
                 {"id": line["id"]})
    print("cleaned order lines")


def set_target_and_ship(pg):
    """checkout 提交同款链路：写配送目标 → campus-errand 出价 → 应用运费方式。"""
    must(page_gql(pg, SET_TARGET, {"z": ZONE_ID, "b": BUILDING_ID}), "campusSetDeliveryTarget")
    methods = must(page_gql(pg, ELIGIBLE), "eligibleShippingMethods") or []
    campus = next((m for m in methods if (m.get("code") or "").startswith("campus-errand")), None)
    assert campus, "eligible 无 campus-errand 方式: " + json.dumps(methods, ensure_ascii=False)[:200]
    must(page_gql(pg, SET_SHIP, {"id": [campus["id"]]}), "setOrderShippingMethod")
    return campus


def add_item(pg, qty):
    must(page_gql(pg, ADD_ITEM, {"v": VARIANT_ID, "q": qty}), "addItemToOrder")


def order_money(pg):
    return must(page_gql(pg, MONEY), "activeOrder")


def admin_api_update(input_extra, tries=3):
    """直接走 admin-api 写配置（会话 cookie）：用于预置/清理，不依赖后台 UI。"""
    for _ in range(tries):
        s = requests.Session()
        h = {"Content-Type": "application/json"}
        s.post(ADMIN_API, json={"query": 'mutation{ login(username:"superadmin",password:"z123123")'
                                         '{ ... on CurrentUser{ id } } }'}, headers=h, timeout=30)
        q = s.post(ADMIN_API, json={"query": "{ campusStoreConfigs { channelId channelToken routesEnabled } }"},
                   headers=h, timeout=30).json()
        cfg = next((c for c in (q.get("data") or {}).get("campusStoreConfigs", [])
                    if c["channelToken"] == CHANNEL), None)
        if not cfg:
            time.sleep(2)
            continue
        m = ('mutation($id:ID!,$input:CampusStoreConfigInput!){ campusUpdateStoreConfig(channelId:$id,input:$input) '
             '{ deliveryFeeTiers } }')
        payload = {"routesEnabled": cfg["routesEnabled"]}
        payload.update(input_extra)
        r = s.post(ADMIN_API, json={"query": m, "variables": {"id": cfg["channelId"], "input": payload}},
                   headers=h, timeout=30).json()
        if (r.get("data") or {}).get("campusUpdateStoreConfig"):
            return True
        print("admin api update failed:", json.dumps(r, ensure_ascii=False)[:300])
        time.sleep(2)
    return False


def first_coupon_id():
    """取一个可用券模板 id：canteen-a 的「超时赔付」已开启但未配券，后台前端会拦下保存。"""
    s = requests.Session()
    h = {"Content-Type": "application/json"}
    s.post(ADMIN_API, json={"query": 'mutation{ login(username:"superadmin",password:"z123123")'
                                     '{ ... on CurrentUser{ id } } }'}, headers=h, timeout=30)
    r = s.post(ADMIN_API, json={"query": "{ couponTemplates(options:{take:1}) { items { id name } } }"},
               headers=h, timeout=30).json()
    items = ((r.get("data") or {}).get("couponTemplates") or {}).get("items") or []
    assert items, "无可用券模板"
    return str(items[0]["id"])



def wait_tiers(expect, tries=20):
    """expect: 期望档位列表（按门槛升序）或 None；按解析后的 JSON 比较，容忍键顺序差异。"""
    for _ in range(tries):
        r = requests.post(API, json={"query": "{ waimaiStoreList { channelToken deliveryFeeTiers } }"},
                          headers={"Content-Type": "application/json"}, timeout=15)
        for s in r.json()["data"]["waimaiStoreList"]:
            if s["channelToken"] != CHANNEL:
                continue
            raw = s["deliveryFeeTiers"]
            got = None
            if raw:
                try:
                    got = sorted(json.loads(raw), key=lambda t: t["minAmount"])
                except Exception:
                    got = "bad-json"
            if got == expect:
                return True
        time.sleep(1.5)
    return False


def wait_ready(pg, texts, tries=25):
    body = ""
    for _ in range(tries):
        pg.wait_for_timeout(1000)
        body = pg.inner_text("body")
        if any(t in body for t in texts):
            return body
    return body


def open_admin_config(browser):
    ctx_b = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                is_mobile=True, has_touch=True, locale="zh-CN")
    pb = ctx_b.new_page()
    for i in range(4):
        pb.goto(ADMIN + "pages/login/index", wait_until="networkidle", timeout=60000)
        pb.wait_for_selector('input[type="text"]', timeout=30000)
        pb.fill('input[type="text"]', ADMIN_USER)
        pb.fill('input[type="password"]', ADMIN_PWD)
        pb.wait_for_timeout(300)
        pb.click("text=登 录")
        try:
            pb.wait_for_load_state("networkidle", timeout=30000)
        except Exception:
            pass
        pb.wait_for_timeout(2500)
        if "登录失败" not in pb.inner_text("body"):
            print(f"admin login ok (attempt {i + 1})")
            break
        print(f"admin login attempt {i + 1} failed, retry")
        time.sleep(2)
    else:
        raise AssertionError("后台登录多次失败")
    pb.evaluate("t => { localStorage.setItem('wa_channel_token', t); }", CHANNEL)
    pb.goto(ADMIN + "pages/campus/config", wait_until="networkidle", timeout=60000)
    body = wait_ready(pb, ["canteen-a"], tries=25)
    assert "canteen-a" in body, "配置页未加载: " + body[:200]
    # 只操作 canteen-a 这张卡片（页面有 2 个保存按钮，必须限定在卡片内）
    card = pb.locator(".card", has_text="canteen-a").first
    card.locator(".head").first.click()
    time.sleep(1.5)
    return pb, card


def fill_tiers(card, rows):
    """rows: [(minYuan, feeYuan)]；先收敛行数（多删少加）再逐行填值。"""
    sec = card.locator(".sec-t", has_text="配送费阶梯").first
    sec.scroll_into_view_if_needed()
    time.sleep(0.4)
    while card.locator(".tier-row").count() > len(rows):
        card.locator(".tier-del").last.click()
        time.sleep(0.2)
    while card.locator(".tier-row").count() < len(rows):
        card.locator(".tier-add").first.click()
        time.sleep(0.2)
    for i, (mn, fee) in enumerate(rows):
        row = card.locator(".tier-row").nth(i)
        row.locator("input").nth(0).fill(mn)
        row.locator("input").nth(1).fill(fee)
    time.sleep(0.4)


def save_config(card):
    """点该卡片的保存；失败（校验/会话）时把 toast 打出来便于定位。"""
    btn = card.locator("uni-button.save").first
    if btn.count() == 0:
        raise AssertionError("卡片内未找到保存按钮")
    btn.click()
    time.sleep(1.5)
    toast = card.page.locator("uni-toast .uni-toast__content")
    if toast.count() and toast.first.is_visible():
        print("save toast:", toast.first.inner_text())


def ensure_tiers(pb, card, rows, expect, tries=3):
    """填档位 → 保存 → 校验服务端读回；最多重试 3 轮（容忍后台会话/瞬时抖动）。"""
    for i in range(tries):
        fill_tiers(card, rows)
        vals = [(card.locator(".tier-row").nth(j).locator("input").nth(0).input_value(),
                 card.locator(".tier-row").nth(j).locator("input").nth(1).input_value())
                for j in range(len(rows))]
        print(f"attempt {i + 1} rows={card.locator('.tier-row').count()} values={vals}")
        save_config(card)
        if wait_tiers(expect, tries=10):
            return True
        print("save not reflected yet, retry")
        time.sleep(2)
    return False


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True)
    os.makedirs(OUT, exist_ok=True)

    # —— 1. admin 配置两档阶梯 ——
    # 先修两处既有配置：R1 需交接点（否则「交接点必填」拦保存）；超时赔付已开启但未配券（前端会拦保存）
    coupon_id = first_coupon_id()
    print("prefill coupon template id:", coupon_id)
    assert admin_api_update({"handoverPoints": [HANDOVER_POINT],
                             "timeoutCompensationCouponTemplateId": coupon_id}), "预置前置配置失败"
    pb, card = open_admin_config(browser)

    def on_resp(resp):
        if "admin-api" in resp.url:
            try:
                if "campusUpdateStoreConfig" in (resp.request.post_data or ""):
                    body = resp.text()
                    print("save REQ:", (resp.request.post_data or "")[:900])
                    print("save RESP:", body[:500])
            except Exception:
                pass

    pb.on("response", on_resp)
    expect = sorted(TIERS, key=lambda t: t["minAmount"])
    assert ensure_tiers(pb, card, [("20", "1"), ("30", "0.5")], expect), "后台保存阶梯后服务端未生效"
    print("waimaiStoreList deliveryFeeTiers:", json.dumps(expect), "OK")
    time.sleep(1.5)
    card.locator(".sec-t", has_text="配送费阶梯").first.scroll_into_view_if_needed()
    time.sleep(0.5)
    pb.screenshot(path=f"{OUT}\\admin-fee-tiers-config.png", full_page=True)

    # —— 2. H5 会话内登录 + 三态 ——
    ctx_a = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pa = ctx_a.new_page()
    pa.goto(CHECKOUT, wait_until="domcontentloaded", timeout=60000)
    pa.wait_for_timeout(3000)
    uid = must(page_gql(pa, LOGIN, {"u": ORDERER[0], "p": ORDERER[1]}), "login")["id"]
    print("h5 session login ok, uid:", uid)

    clean_active_order(pa)
    add_item(pa, 8)                        # 毛额 1640，促销后 1636
    campus = set_target_and_ship(pa)
    money = order_money(pa)
    goods = money["subTotalWithTax"]
    print("state1 (below tiers):", json.dumps(money), "| campus quote:", campus["priceWithTax"])
    assert goods < 2000, f"构造未达档失败: goods={goods}"
    assert campus["priceWithTax"] == 200 and money["shippingWithTax"] == 200, "未达档应回退分区原价 200"

    pa.reload()
    body = wait_ready(pa, ["商品总额"], tries=25)
    assert "本单配送费" not in body, "未达最低档不应出现档位提示: " + body[:400]
    pa.screenshot(path=f"{OUT}\\checkout-tier-zone-original.png", full_page=True)

    # 命中满20档
    add_item(pa, 2)                        # 累计毛额 2050
    campus = set_target_and_ship(pa)
    money = order_money(pa)
    goods = money["subTotalWithTax"]
    print("state2 (hit 20):", json.dumps(money), "| campus quote:", campus["priceWithTax"])
    assert goods >= 2000 and goods < 3000, f"构造满20档失败: goods={goods}"
    assert campus["priceWithTax"] == 100, f"满20档运费应为 100，实际 {campus['priceWithTax']}"

    pa.reload()
    hint2 = "满 ¥20 本单配送费 ¥1"
    body = wait_ready(pa, ["商品总额", hint2], tries=25)
    ok2 = hint2 in body and "¥1.00" in body
    print("tier20 hint:", ok2)
    assert ok2, "满20档提示未渲染: " + body[:500]
    pa.screenshot(path=f"{OUT}\\checkout-tier-20.png", full_page=True)

    # 命中满30档
    add_item(pa, 5)                        # 累计毛额 3075
    campus = set_target_and_ship(pa)
    money = order_money(pa)
    goods = money["subTotalWithTax"]
    print("state3 (hit 30):", json.dumps(money), "| campus quote:", campus["priceWithTax"])
    assert goods >= 3000, f"构造满30档失败: goods={goods}"
    assert campus["priceWithTax"] == 50, f"满30档运费应为 50，实际 {campus['priceWithTax']}"

    pa.reload()
    hint3 = "满 ¥30 本单配送费 ¥0.5"
    body = wait_ready(pa, ["商品总额", hint3], tries=25)
    ok3 = hint3 in body and "¥0.50" in body
    print("tier30 hint:", ok3)
    assert ok3, "满30档提示未渲染: " + body[:500]
    pa.screenshot(path=f"{OUT}\\checkout-tier-30.png", full_page=True)

    # —— 3. 清理（配置走 admin API，避免 UI 会话过期导致清理失败）——
    clean_active_order(pa)
    assert admin_api_update({"deliveryFeeTiers": None, "handoverPoints": [],
                             "timeoutCompensationCouponTemplateId": None}), "清理配置失败"
    assert wait_tiers(None), "阶梯清理失败（应为 null）"
    print("cleaned deliveryFeeTiers -> null / handoverPoints -> [] / timeout coupon -> null")

    browser.close()
print("[DONE] shots ->", OUT)
