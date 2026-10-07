# -*- coding: utf-8 -*-
"""waimai 骑手端生产截图（F1 定时器泄漏修复回归用）：大厅页 + 配送任务页。
视口 390x844 dpr=2（硬规范）。登录态走页面上下文 login 注入 session token（避 SSO 跳转）。
运行：python scripts/_shot_rider.py
"""
import os
import time

from playwright.sync_api import sync_playwright

BASE = "https://www.yourbao.cn/waimai/?tenant=canteen-a-token"
CHANNEL = "canteen-a-token"
EMAIL, PWD = "smoke-rider@yourbao.cn", "Wm@Smoke123"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
OUT = os.environ.get("SHOT_OUT", r"d:\zhao\waimai\docs\screenshots\audit-f1-fix")


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
    # rider 页鉴权读 auth store（auth_token/auth_userId），API 会话读 vendure_session_token
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
        # 整页 reload 让 App.onLaunch 重跑 restoreSession，把注入的 auth_token 读进 auth store
        page.reload(wait_until="networkidle")
        time.sleep(2)
        # 骑手大厅（rider-home，onShow 起轮询）
        page.goto(BASE + "#/pkg-rider/pages/rider-home", wait_until="networkidle")
        page.wait_for_timeout(3000)
        page.screenshot(path=os.path.join(OUT, "rider-home.png"))
        # 配送任务页（rider-delivering，8s 轮询 + 10s 定位上报）
        page.goto(BASE + "#/pkg-rider/pages/rider-delivering", wait_until="networkidle")
        page.wait_for_timeout(3000)
        page.screenshot(path=os.path.join(OUT, "rider-delivering.png"))
        browser.close()
        print("saved:", OUT)


if __name__ == "__main__":
    main()
