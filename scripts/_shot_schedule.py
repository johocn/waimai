# -*- coding: utf-8 -*-
"""plan 3.1 预约单收尾截图（390x844 dpr=2）：
1. 用户端 checkout 未来日期时段选择（明天 tab + 时段 chip + 预约提示）
2. 用户端订单详情预约态时间线（「预约单 · 到点前30分钟自动进入调度」+ 送达时段）
3. web-admin 商家工作台「预约单」tab（订单卡片在列）
前置：订单 279 hallStatus='scheduled' + scheduledFor=明天 11:00（dbtool 构造）；
      smoke-order 名下无进行中草稿单（脚本先 API 建草稿）。
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
ORDER_CODE = "8F97CQVXREKKLE9X"
ORDER_DETAIL = f"https://www.yourbao.cn/waimai/?tenant={CHANNEL}#/pkg-order/pages/order-detail?code={ORDER_CODE}"
ORDERER = ("smoke-order@yourbao.cn", "Wm@Smoke123", "160")
ADMIN_USER, ADMIN_PWD = "superadmin", "z123123"


def gql(query, token=None, channel=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if channel:
        headers["vendure-token"] = channel
    r = requests.post(API, json={"query": query}, headers=headers, timeout=15)
    return r.json()


def login_shop():
    d = gql('mutation { login(username: "%s", password: "%s") { ... on CurrentUser { id } } }'
            % ORDERER[:2])
    return d.get("data", {}).get("login", {}).get("id")


def ensure_draft_order(token):
    """给 smoke-order 建一笔 canteen-a 草稿单（ checkout 页需要 activeOrder）。"""
    d = gql('mutation { addItemToOrder(productVariantId: "87", quantity: 2) { ... on Order { id code } '
            '... on ErrorResult { errorCode message } } }', token=token, channel=CHANNEL)
    item = d["data"]["addItemToOrder"]
    print("draft order:", json.dumps(item, ensure_ascii=False)[:160])
    assert "id" in item, f"建草稿单失败: {item}"


def inject(pg, token):
    pg.add_init_script(
        "localStorage.setItem('auth_token', %s); localStorage.setItem('auth_userId', '%s');"
        % (json.dumps(token), ORDERER[2])
    )


def dismiss_modal(page):
    try:
        page.evaluate(
            'document.querySelectorAll(".uni-modal__btn").forEach(b=>{if(b.innerText.includes("取消"))b.click()})'
        )
        time.sleep(0.6)
    except Exception:
        pass


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

    # —— 1. checkout 未来日期时段选择 ——
    uid = login_shop()
    assert uid, "smoke-order 登录失败"
    ensure_draft_order(uid)

    ctx_a = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pa = ctx_a.new_page()
    inject(pa, uid)
    pa.goto(CHECKOUT)
    body = wait_ready(pa, ["尽快送", "明天"], tries=20)
    print("checkout chips:", "尽快送" in body, "| 明天:", "明天" in body)
    pa.locator(".chip", has_text="明天").first.click()
    pa.wait_for_timeout(1500)
    body = pa.inner_text("body")
    m = re.search(r"11:00-11:30", body)
    print("slot chips:", bool(m))
    assert m, "明天时段未渲染: " + body[:400]
    pa.locator(".chip", has_text="11:00-11:30").first.click()
    pa.wait_for_timeout(1500)
    body = pa.inner_text("body")
    hint = "预约单将在送达时段前 30 分钟自动进入配送调度" in body
    print("schedule hint:", hint)
    assert hint, "预约提示未出现"
    pa.screenshot(path=f"{OUT}\\wa-checkout-schedule.png", full_page=True)

    # —— 2. 订单详情预约态时间线 ——
    pa.goto(ORDER_DETAIL)
    body = wait_ready(pa, ["预约单", ORDER_CODE], tries=20)
    ok_tl = "预约单 · 到点前30分钟自动进入调度" in body
    ok_slot = "送达时段" in body
    print("detail scheduled-timeline:", ok_tl, "| slot-text:", ok_slot)
    pa.wait_for_timeout(1500)
    pa.screenshot(path=f"{OUT}\\wa-order-detail-scheduled.png", full_page=True)

    # —— 3. web-admin 商家工作台「预约单」tab ——
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
    dismiss_modal(pb)
    pb.evaluate("t => { localStorage.setItem('wa_channel_token', t); }", CHANNEL)
    pb.goto(ADMIN + "pages/campus/merchant", wait_until="networkidle", timeout=60000)
    body = wait_ready(pb, ["待接单", "预约单"], tries=25)
    print("admin board tabs:", "预约单" in body)
    pb.locator(".tab", has_text="预约单").first.click()
    time.sleep(3)
    body = pb.inner_text("body")
    ok_card = ORDER_CODE in body
    print("admin scheduled card:", ok_card)
    pb.screenshot(path=f"{OUT}\\wa-admin-merchant-scheduled.png", full_page=True)

    browser.close()
print("[DONE] shots ->", OUT)
