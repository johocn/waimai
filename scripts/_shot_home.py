# -*- coding: utf-8 -*-
"""waimai 首页改版手机视口截图（方案 B 轻量版）。
视口 390x844 dpr=2（iPhone 12/13/14 标准视口）。首页为公开页无需登录态。
运行：python scripts/_shot_home.py
"""
import os
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5181/waimai/index.html"
OUT = os.environ.get(
    "SHOT_OUT",
    r"d:\zhao\waimai\docs\screenshots\home-revamp",
)


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
        page.goto(BASE + "?t=shot#/pages/home/index", wait_until="networkidle")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUT, "1-home-default.png"))
        page.screenshot(path=os.path.join(OUT, "2-home-full.png"), full_page=True)
        # 校园公告弹窗
        page.get_by_text("校园公告").first.tap()
        page.wait_for_timeout(600)
        page.screenshot(path=os.path.join(OUT, "3-home-notice-modal.png"))
        page.get_by_text("知道了").tap()
        page.wait_for_timeout(400)
        # 快捷入口跳转：骑手加入
        page.get_by_text("传信者加入").first.tap()
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(OUT, "4-quick-rider-join.png"), full_page=True)
        # ── 暗色主题：注入 localStorage 后刷新（waimai_theme=dark） ──
        page.goto(BASE + "?t=dark#/pages/home/index", wait_until="networkidle")
        page.evaluate("localStorage.setItem('waimai_theme','dark')")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUT, "5-home-dark.png"))
        page.screenshot(path=os.path.join(OUT, "6-home-dark-full.png"), full_page=True)
        # 点 ☀️ 切回亮色，验证 toggle 交互 + 持久化
        page.locator(".theme-btn").tap()
        page.wait_for_timeout(600)
        page.screenshot(path=os.path.join(OUT, "7-dark-toggle-to-light.png"))
        print("storage after toggle:", page.evaluate("localStorage.getItem('waimai_theme')"))
        browser.close()
        print("saved:", OUT)


if __name__ == "__main__":
    main()
