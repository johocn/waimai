# -*- coding: utf-8 -*-
"""优惠券里程碑1 生产截图：券中心/券包/profile角标/menu券chip(Task6直领)/checkout选券弹层。
390x844 dpr=2 移动视口；登录沿 _smoke_profile.py 会话姿势。资源404豁免（数据问题），pageerror 严格 FAIL。
"""
import json, time
from playwright.sync_api import sync_playwright

BASE = "https://www.yourbao.cn/waimai/?tenant=canteen-a-token"
CHANNEL = "canteen-a-token"
EMAIL, PWD = "smoke-order@yourbao.cn", "Wm@Smoke123"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
SHOTS_DIR = "C:/tmp/waimai_shots"
TPL_NAME = "商品专享券-冒烟"
results, shots = [], []

def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(detail) if detail and not ok else ""))

def shot(page, name):
    page.screenshot(path=f"{SHOTS_DIR}/{name}")
    shots.append(name)

def main():
    errors, notfound = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True)
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                  is_mobile=True, has_touch=True, locale="zh-CN",
                                  user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15")
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("response", lambda r: notfound.append(r.url) if r.status == 404 else None)

        page.goto(BASE + "#/pages/login/index", wait_until="networkidle")
        r = page.evaluate(
            "async ([u, p, ch]) => { const r = await fetch('/shop-api', { method: 'POST',"
            " headers: {'Content-Type':'application/json','vendure-token': ch},"
            " body: JSON.stringify({query: 'mutation($u:String!,$p:String!){ login(username: $u, password: $p) { ... on CurrentUser { id } } }',"
            " variables: {u, p} }) });"
            " return { body: await r.json(), token: r.headers.get('vendure-auth-token') }; }",
            [EMAIL, PWD, CHANNEL])
        ok = bool(r.get("body", {}).get("data", {}).get("login", {}).get("id")) and bool(r.get("token"))
        if ok:
            uid = str(r["body"]["data"]["login"]["id"])
            # 两个存储层：vendure_session_token=API client Bearer；auth_token/auth_userId=auth store（requireLogin 门）
            page.evaluate(
                "([t, uid]) => { localStorage.setItem('vendure_session_token', t);"
                " localStorage.setItem('auth_token', t); localStorage.setItem('auth_userId', uid); }",
                [r["token"], uid])
        check("login", ok, r)
        # SPA hash 导航不重挂载：setItem 后必须整页 reload，auth store 才能恢复登录态
        page.reload(wait_until="networkidle")
        time.sleep(1.5)

        # 1. 领券中心（可领取 tab：票卡 + 立即领取）
        page.goto(BASE + "#/pkg-promotion/pages/coupon-centre", wait_until="networkidle")
        time.sleep(2)
        tickets = page.locator(".ticket")
        check("券中心票卡", tickets.count() >= 1, f"count={tickets.count()}")
        shot(page, "coupon_centre.png")

        # 2. 领取「商品专享券-冒烟」→ 按钮转已领取
        card = page.locator(".ticket", has_text=TPL_NAME).first
        btn = card.locator(".ticket__btn")
        if btn.count():
            btn.click(timeout=5000)
            time.sleep(1.5)
            try:
                txt = btn.inner_text(timeout=5000)
            except Exception as ex:
                txt = f"<locator lost: {type(ex).__name__} url={page.url}>"
            check("领券成功(按钮转已领取)", "已领取" in txt, txt)
        else:
            check("领券按钮存在", False, "ticket__btn not found")
        shot(page, "coupon_centre_claimed.png")

        # 3. 我的券包（未使用 tab：券卡 + 去使用）
        page.goto(BASE + "#/pkg-promotion/pages/my-coupons", wait_until="networkidle")
        time.sleep(2)
        check("券包未使用券卡", page.locator(".ticket", has_text=TPL_NAME).count() >= 1)
        shot(page, "my_coupons.png")

        # 4. 个人中心资产区入口 + 角标
        page.goto(BASE + "#/pages/profile/index", wait_until="networkidle")
        time.sleep(2)
        badge = page.locator(".asset-item__badge")
        check("profile优惠券角标", badge.count() >= 1 and badge.first.inner_text().strip() != "", 
              badge.first.inner_text() if badge.count() else "no badge")
        shot(page, "profile_coupon_entry.png")

        # 5. 店铺菜单页：商品行券 chip（Task 6）——遍历分类找到含 chip 的商品卡
        page.goto(BASE + "#/pages/shop/menu?token=" + CHANNEL + "&name=" + "%E9%A3%9F%E5%A0%82", wait_until="networkidle")
        time.sleep(3)
        chip = None
        cats = page.locator(".cat")
        for i in range(cats.count()):
            cats.nth(i).click()
            time.sleep(1.2)
            if page.locator(".good-coupon").count():
                chip = page.locator(".good-coupon").first
                break
        check("商品行券chip渲染", chip is not None and "券" in chip.inner_text(),
              chip.inner_text() if chip else "未找到 chip")
        if chip:
            shot(page, "menu_coupon_chip.png")
            chip.click()   # Task6 直领：claimProductCoupon
            time.sleep(1.5)
            check("chip直领转已领取", "已领取" in chip.inner_text(), chip.inner_text())
            shot(page, "menu_coupon_chip_claimed.png")
            # 6. 加购可乐鸡排饭 → checkout → 选券弹层（自动试挂最优）
            good = page.locator(".good", has_text="可乐鸡排饭").first
            good.locator(".add-btn").first.click()
            time.sleep(1.5)
            page.locator(".checkout-btn").first.click()
            time.sleep(3)
            row = page.locator(".summary-row--coupon")
            check("checkout优惠券行", row.count() >= 1)
            if row.count():
                row.first.click()
                time.sleep(1.2)
                check("选券弹层打开", page.locator(".coupon-sheet").count() >= 1)
                shot(page, "checkout_coupon_sheet.png")

        browser.close()

    real_err = [e for e in errors if "Failed to load resource" not in e]
    check("pageerror", len(real_err) == 0, real_err[:3])
    print("\n== 截图清单 ==")
    for s in shots:
        print("  " + s)
    print("\n404 资源(豁免): " + json.dumps(sorted(set(notfound))[:5], ensure_ascii=False))
    print("E2E SHOT " + ("PASS" if all(ok for _, ok, _ in results) else "FAIL"))
    fails = [n for n, ok, _ in results if not ok]
    if fails:
        print("FAIL items: " + ", ".join(fails))

if __name__ == "__main__":
    main()
