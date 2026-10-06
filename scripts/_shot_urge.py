# -*- coding: utf-8 -*-
"""plan 2.2/2.4 阶段二收尾截图（390x844 dpr=2）：
1. 用户端订单详情-催单按钮态（urged=false）
2. requests 走线上 API 催单（真实链路，含频控验证）
3. 用户端订单详情-已催单态（催单标签+骑手地图+联系商家）
4. 骑手端配送页催单提醒横幅（8s 轮询带出）
前置：订单 261 in_progress + 骑手坐标 + urged=false（dbtool 构造）。
"""
import json
import requests
from playwright.sync_api import sync_playwright

BASE = "https://www.yourbao.cn/waimai/#/"
API = "https://www.yourbao.cn/shop-api"
OUT = r"d:\zhao\waimai\docs\screenshots"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
ORDER_CODE = "PF8RMLU8MZDMJZCQ"
ORDER_DETAIL = BASE + "pkg-order/pages/order-detail?code=" + ORDER_CODE
RIDER_DELIVERING = BASE + "pkg-rider/pages/rider-delivering"
ORDERER = ("smoke-order@yourbao.cn", "Wm@Smoke123", "160")
RIDER = ("smoke-rider@yourbao.cn", "Wm@Smoke123", "161")


def gql(query, token=None, channel=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if channel:
        headers["vendure-token"] = channel
    r = requests.post(API, json={"query": query}, headers=headers, timeout=15)
    return r.json(), r.headers


def login(account):
    _, hdrs = gql('mutation { login(username: "%s", password: "%s") { ... on CurrentUser { id } } }'
                  % (account[0], account[1]))
    return hdrs.get("vendure-auth-token")


def inject(pg, account, token):
    """uni-app H5 localStorage 注入登录态。"""
    pg.add_init_script(
        "localStorage.setItem('auth_token', %s); localStorage.setItem('auth_userId', '%s');"
        % (json.dumps(token), account[2])
    )


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True)

    # —— 1. 用户端-催单按钮态 ——
    order_token = login(ORDERER)
    assert order_token, "smoke-order 登录失败"
    ctx_a = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pa = ctx_a.new_page()
    inject(pa, ORDERER, order_token)
    pa.goto(ORDER_DETAIL)
    pa.wait_for_timeout(7000)
    body = pa.inner_text("body")
    pa.screenshot(path=f"{OUT}\\wa-order-detail-urge-btn.png", full_page=True)
    print("btn-urge:", "催单" in body, "| urged-tag absent:", "已催单" not in body,
          "| contact:", "联系商家" in body)

    # —— 2. 线上 API 催单（真实链路） ——
    data, _ = gql('mutation { campusUrgeOrder(orderId: "261") { id } }', token=order_token,
                  channel="canteen-a-token")
    print("urge #1:", json.dumps(data)[:120])

    # —— 3. 用户端-已催单态 ——
    pa.goto(ORDER_DETAIL)
    pa.wait_for_timeout(7000)
    body = pa.inner_text("body")
    pa.screenshot(path=f"{OUT}\\wa-order-detail-urged.png", full_page=True)
    print("urged-tag:", "已催单" in body, "| map:", pa.locator("map, uni-map").count())

    # —— 4. 骑手端-催单提醒横幅 ——
    rider_token = login(RIDER)
    assert rider_token, "smoke-rider 登录失败"
    ctx_b = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pb = ctx_b.new_page()
    inject(pb, RIDER, rider_token)
    pb.goto(RIDER_DELIVERING)
    pb.wait_for_timeout(10000)  # 覆盖 8s 轮询周期
    body = pb.inner_text("body")
    pb.screenshot(path=f"{OUT}\\wa-rider-delivering-urge.png", full_page=True)
    print("rider banner:", "用户已催单" in body, "| in_progress card:", "已取货" in body or "到店" in body)

    browser.close()
