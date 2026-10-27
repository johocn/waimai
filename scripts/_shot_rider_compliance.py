# -*- coding: utf-8 -*-
"""P2-5 骑手端合规截图（线上 smoke-rider 账号）：接单大厅合规提醒 + 入驻页合规资料只读展示。
视口 390x844 dpr=2（硬规范）。登录态走页面上下文 login 注入 session token（避 SSO 跳转）。
运行：python scripts/_shot_rider_compliance.py
"""
import os
import time

from playwright.sync_api import sync_playwright

BASE = "https://www.yourbao.cn/waimai/?tenant=canteen-a-token"
CHANNEL = "canteen-a-token"
EMAIL, PWD = "smoke-rider@yourbao.cn", "Wm@Smoke123"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
OUT = os.environ.get("SHOT_OUT", r"d:\zhao\waimai\docs\screenshots\waimai\p19-rider-compliance")


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
        # 接单大厅：合规提醒 banner（健康证/保险/背调异常时出现）
        page.goto(BASE + "#/pkg-rider/pages/rider-home", wait_until="networkidle")
        page.wait_for_timeout(3000)
        page.screenshot(path=os.path.join(OUT, "04-rider-home-compliance-banner.png"))
        # 入驻页（已通过态）：合规资料只读展示
        page.goto(BASE + "#/pkg-rider/pages/rider-join", wait_until="networkidle")
        page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(OUT, "05-rider-join-compliance.png"))
        browser.close()
        print("saved:", OUT)


if __name__ == "__main__":
    main()
