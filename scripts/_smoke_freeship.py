# -*- coding: utf-8 -*-
"""plan 3.2 满X免配送费 冒烟+截图（390x844 dpr=2）。

关键背景（本次实测）：
- 本 vendure fork 鉴权只认会话 cookie（Authorization Bearer 头被忽略，勿再依赖）；
- activeOrder 为用户级（新会话登录后可见旧会话订单），但匿名会话看不到；
- 故所有 shop-api 操作在「页面上下文」fetch 内完成（同一会话），页面应用与操作共享登录态。

流程：
1. web-admin 拾光达配置页：canteen-a 填 满X元免配送费=20 保存（截图 wa-admin-freeship-config.png）
2. waimaiStoreList 验证 freeShippingThreshold=2000
3. H5 checkout 未达标（8×2.05-促销=1636 <2000 ≥起送1500）：运费预显 ¥2.00 + 差价提示
   （截图 wa-checkout-freeship-short.png）
4. H5 checkout 达标（10×2.05-促销 ≥2000）：运费行划线 ¥2.00 + ¥0.00 + 标签
   （截图 wa-checkout-freeship-on.png）；calculator 出价 0 e2e
5. 清理 smoke-order 草稿单
"""
import json
import re
import time

import requests
from playwright.sync_api import sync_playwright

BASE = "https://www.yourbao.cn/waimai/#/"
ADMIN = "https://e.joho.cn/guanli/#/"
API = "https://www.yourbao.cn/shop-api"
OUT = r"d:\zhao\waimai\docs\screenshots"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
CHANNEL = "canteen-a-token"
CHECKOUT = f"https://www.yourbao.cn/waimai/?tenant={CHANNEL}#/pkg-order/pages/checkout"
VARIANT_ID = "87"                 # 可乐鸡排饭 205分
ZONE_ID, BUILDING_ID = "2", "2"   # 东区(运费2元) / 桂1栋
THRESHOLD_FEN = 2000              # 满 ¥20
ORDERER = ("smoke-order@yourbao.cn", "Wm@Smoke123")
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


def wait_threshold(fen, tries=20):
    for _ in range(tries):
        r = requests.post(API, json={"query": "{ waimaiStoreList { channelToken freeShippingThreshold } }"},
                          headers={"Content-Type": "application/json"}, timeout=15)
        for s in r.json()["data"]["waimaiStoreList"]:
            if s["channelToken"] == CHANNEL and s["freeShippingThreshold"] == fen:
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


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True)

    # —— 1. admin 配置满免门槛 = 20 ——
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
    pb.goto(ADMIN + "pages/campus/config", wait_until="networkidle", timeout=60000)
    body = wait_ready(pb, ["canteen-a"], tries=25)
    assert "canteen-a" in body, "配置页未加载: " + body[:200]
    pb.locator(".head", has_text="canteen-a").first.click()
    time.sleep(1.5)
    cell = pb.locator(".cell", has_text="满X元免配送费").first
    cell.locator("input").fill("20")
    time.sleep(0.5)
    pb.locator("uni-button.save").first.click()
    print("admin saved clicked")
    ok = wait_threshold(THRESHOLD_FEN)
    assert ok, "waimaiStoreList 未透出 threshold=2000"
    print("waimaiStoreList threshold: 2000 OK")
    time.sleep(1.5)
    pb.screenshot(path=f"{OUT}\\wa-admin-freeship-config.png", full_page=True)

    # —— 2. H5 会话内登录 + 未达标态 ——
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
    print("short state:", json.dumps(money), "| campus quote:", campus["priceWithTax"])
    assert goods < THRESHOLD_FEN and money["shippingWithTax"] == 200, "未达标运费应为 200"
    short_fen = THRESHOLD_FEN - goods
    expect_hint = f"满 ¥20.00 免配送费，再买 ¥{short_fen / 100:.2f} 即免"

    pa.reload()
    body = wait_ready(pa, ["商品总额", "满 ¥20.00"], tries=25)
    ok_short = (expect_hint in body and "¥2.00" in body)
    print("short hint:", ok_short, "| expect:", expect_hint)
    assert ok_short, "未达标提示未渲染: " + body[:500]
    pa.screenshot(path=f"{OUT}\\wa-checkout-freeship-short.png", full_page=True)

    # —— 3. 达标态 ——
    add_item(pa, 2)                        # 累计毛额 2050（≥2000）
    campus = set_target_and_ship(pa)
    money = order_money(pa)
    goods = money["subTotalWithTax"]
    print("free state:", json.dumps(money), "| campus quote:", campus["priceWithTax"])
    assert goods >= THRESHOLD_FEN, f"构造达标态失败: goods={goods}"
    assert campus["priceWithTax"] == 0 and money["shippingWithTax"] == 0, "达标运费应为 0（calculator 满免）"

    pa.reload()
    body = wait_ready(pa, ["商品总额", "满¥20.00免配送费"], tries=25)
    ok_free = ("满¥20.00免配送费" in body and "¥0.00" in body and "¥2.00" in body and "再买" not in body)
    print("free tag:", ok_free)
    assert ok_free, "达标减免明细未渲染: " + body[:500]
    pa.screenshot(path=f"{OUT}\\wa-checkout-freeship-on.png", full_page=True)

    # —— 4. 清理 ——
    clean_active_order(pa)

    browser.close()
print("[DONE] shots ->", OUT)
