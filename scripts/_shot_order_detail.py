# -*- coding: utf-8 -*-
"""waimai plan2 手机视口截图（order-detail 时间线/骑手卡）。
视口 390x844 dpr=2（iPhone 12/13/14 标准视口）。登录态通过 localStorage 注入 vendure session token。
运行：python scripts/_shot_order_detail.py
"""
import os
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5181/waimai/index.html"
TOKEN = os.environ.get(
    "WM_TOKEN",
    "0a7b8ec52c0704b41d43e93ea94e686c0c74f4acfd642efd9c5c74569a6d09cb",
)
CODE = os.environ.get("WM_CODE", "NUW37AE9JYCHSRU5")
OUT = os.environ.get(
    "SHOT_OUT",
    r"d:\zhao\waimai\docs\screenshots\plan2",
)

PAGES = [
    ("2-7-order-detail", f"{BASE}?t=shot#/pkg-order/pages/order-detail?code={CODE}"),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        )
        # 先开首页注入登录态（sessionStorage sso_provider 与 localStorage token 同源持久）
        page = ctx.new_page()
        page.goto(BASE + "?t=init#/pages/home/index", wait_until="networkidle")
        page.evaluate(
            "t => localStorage.setItem('vendure_session_token', t)", TOKEN
        )
        for name, url in PAGES:
            pg = ctx.new_page()
            pg.goto(url, wait_until="networkidle")
            pg.wait_for_timeout(2500)
            path = os.path.join(OUT, name + ".png")
            pg.screenshot(path=path, full_page=True)
            print("saved:", path)
            pg.close()
        browser.close()


if __name__ == "__main__":
    main()
