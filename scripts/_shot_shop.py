# -*- coding: utf-8 -*-
"""waimai 店铺内页改版手机视口截图（三 Tab + 双主题）。
从首页点第一家店铺进入；评论/商家 Tab + 暗色 + SKU 弹层（存在多规格时）。
运行：python scripts/_shot_shop.py
"""
import os
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5181/waimai/index.html"
OUT = os.environ.get(
    "SHOT_OUT",
    r"d:\zhao\waimai\docs\screenshots\shop-revamp",
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
        # 首页进店
        page.goto(BASE + "?t=shop#/pages/home/index", wait_until="networkidle")
        page.wait_for_timeout(2500)
        page.locator(".card").first.tap()
        page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(OUT, "1-shop-goods-light.png"))
        # 评论 / 商家 Tab
        page.locator(".tb").nth(1).tap()
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(OUT, "2-shop-reviews-light.png"))
        page.locator(".tb").nth(2).tap()
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(OUT, "3-shop-merchant-light.png"))
        # 暗色主题
        page.evaluate("localStorage.setItem('waimai_theme','dark')")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(OUT, "4-shop-goods-dark.png"))
        page.locator(".tb").nth(2).tap()
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(OUT, "5-shop-merchant-dark.png"))
        # SKU 弹层（存在多规格商品时）
        page.locator(".tb").nth(0).tap()
        page.wait_for_timeout(400)
        try:
            page.locator(".add-btn.spec").first.tap(timeout=3000)
            page.wait_for_timeout(800)
            page.screenshot(path=os.path.join(OUT, "6-shop-sku-dark.png"))
            print("sku sheet captured")
        except Exception:
            print("no multi-spec goods, skip sku shot")
        browser.close()
        print("saved:", OUT)


if __name__ == "__main__":
    main()
