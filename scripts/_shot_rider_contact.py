# -*- coding: utf-8 -*-
"""P2-6 骑手侧「联系顾客」号码保护截图（线上 smoke-rider 账号 + 局部 shop-api mock）。
仅 mock联系方式接口，任务列表走线上真实数据，保证页面真实渲染。
视口 390x844 dpr=2（硬规范）。
运行：python scripts/_shot_rider_contact.py
"""
import json
import os
import time

from playwright.sync_api import sync_playwright

BASE = "https://www.yourbao.cn/waimai/?tenant=canteen-a-token"
CHANNEL = "canteen-a-token"
EMAIL, PWD = "smoke-rider@yourbao.cn", "Wm@Smoke123"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
OUT = os.environ.get("SHOT_OUT", r"d:\zhao\waimai\docs\screenshots\waimai\p20-rider-contact")

ORDER = {
    "id": "2400001",
    "code": "A2400001",
    "createdAt": "2026-10-27T12:01:00.000Z",
    "shipping": 200,
    "customFields": {
        "deliveryStatus": "in_progress",
        "deliveryStaffId": "9",
        "campusZone": "东区",
        "buildingId": "301",
        "fulfillmentRoute": "direct",
        "riderEarning": 450,
        "urged": True,
        "tip": 100,
    },
    "channelToken": CHANNEL,
}

CONTACT = {
    "protected": True,
    "display": "1700001234",
    "callable": "1700001234",
    "provider": "mock",
    "expiresAt": "2026-10-27T13:00:00.000Z",
    "note": "mock 虚拟号仅本地演示，不会真实转接",
}


def login(page) -> bool:
    r = page.evaluate(
        "async ([u, p, ch]) => { const r = await fetch('/shop-api', { method: 'POST',"
        " headers: {'Content-Type':'application/json','vendure-token': ch},"
        " body: JSON.stringify({query: 'mutation($u:String!,$p:String!){ login(username: $u, password: $p) { ... on CurrentUser { id } } }',"
        " variables: {u, p} }) });"
        " return { token: r.headers.get('vendure-auth-token'), body: await r.json() }; }",
        [EMAIL, PWD, CHANNEL],
    )
    token = r.get("token")
    uid = (r.get("body", {}).get("data", {}).get("login", {}) or {}).get("id", "")
    if not token or not uid:
        return False
    page.evaluate(
        "([t, id]) => { localStorage.setItem('vendure_session_token', t);"
        " localStorage.setItem('auth_token', t); localStorage.setItem('auth_userId', String(id)); }",
        [token, uid],
    )
    return True


def handle(route):
    body = route.request.post_data or ""
    # 跨渠道聚合：仅对 canteen-a 渠道返回任务，其余渠道返回空，避免同一 mock 单重复拼接
    token = route.request.headers.get("vendure-token", "")
    if "campusMyTasks" in body:
        orders = [ORDER] if token == CHANNEL else []
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps({"data": {"campusMyTasks": orders}}))
        return
    if "campusRiderCustomerContact" in body:
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps({"data": {"campusRiderCustomerContact": CONTACT}}))
        return
    route.continue_()


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROME, headless=True)
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            locale="zh-CN",
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        )
        page = ctx.new_page()
        page.goto(BASE + "#/pages/login/index", wait_until="networkidle")
        if not login(page):
            raise SystemExit("login failed")
        page.reload(wait_until="networkidle")
        time.sleep(2)
        page.route("**/shop-api", handle)
        page.goto(BASE + "#/pkg-rider/pages/rider-delivering", wait_until="networkidle")
        page.wait_for_timeout(3000)
        page.screenshot(path=os.path.join(OUT, "01-rider-delivering-contact-entry.png"))
        # 点「联系顾客」→ 号码保护弹窗
        btn = page.locator("text=联系顾客").first
        btn.click()
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(OUT, "02-rider-contact-protected-modal.png"))
        browser.close()
        print("saved:", OUT)


if __name__ == "__main__":
    main()
