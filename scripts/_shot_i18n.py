# -*- coding: utf-8 -*-
"""F11 深化：用户端全量 i18n 迁移生产目检（zh/en 双语言手机视口截图）。
视口 390x844 dpr=2。en 视图经 localStorage wm_locale=en 注入后刷新。
运行：python scripts/_shot_i18n.py
"""
import os
from playwright.sync_api import sync_playwright

BASE = "https://www.yourbao.cn/waimai/index.html"
OUT = r"d:\zhao\waimai\docs\screenshots\i18n-deepening"


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            has_touch=True,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        )
        page = ctx.new_page()

        # ── zh-Hans 默认视图 ──
        page.goto(BASE + "?t=i18n#/pages/home/index", wait_until="networkidle")
        page.evaluate("localStorage.removeItem('wm_locale')")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(OUT, "1-zh-home-tabbar.png"))

        page.goto(BASE + "?t=i18n#/pages/profile/index", wait_until="networkidle")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUT, "2-zh-profile-lang-entry.png"), full_page=True)

        page.goto(BASE + "?t=i18n#/pages/login/index", wait_until="networkidle")
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUT, "3-zh-login.png"))

        # ── en 视图（wm_locale=en 注入） ──
        page.goto(BASE + "?t=i18n-en#/pages/home/index", wait_until="domcontentloaded")
        page.evaluate("localStorage.setItem('wm_locale','en')")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(OUT, "4-en-home-tabbar.png"))

        page.goto(BASE + "?t=i18n-en#/pages/profile/index", wait_until="networkidle")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUT, "5-en-profile-lang-entry.png"), full_page=True)

        page.goto(BASE + "?t=i18n-en#/pages/login/index", wait_until="networkidle")
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUT, "6-en-login.png"))

        # ── en 恢复 zh（语言记忆回退验证） ──
        page.goto(BASE + "?t=i18n-back#/pages/home/index", wait_until="domcontentloaded")
        page.evaluate("localStorage.setItem('wm_locale','zh-Hans')")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUT, "7-back-zh-home.png"))

        browser.close()
        print("saved:", OUT)


if __name__ == "__main__":
    main()
