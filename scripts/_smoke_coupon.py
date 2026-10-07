# -*- coding: utf-8 -*-
"""优惠券里程碑1 生产冒烟截图（390x844 dpr=2）。幂等可重复跑。

要点（沿 _smoke_profile.py / _smoke_freeship.py 实测姿势）：
- 本 vendure fork shop-api 鉴权只认会话 cookie → 用户侧全部走「页面上下文 fetch」；
- 前端页面登录态读 localStorage 'vendure_session_token'（src/api/client.ts SESSION_TOKEN_KEY），
  该 token 取自 login 响应头 vendure-auth-token；
- dev:h5 (localhost:5181) 的 /shop-api 经 vite 代理到真实后端（.env.development VITE_API_PROXY），
  登录 Set-Cookie 为 host-only → localhost 源可用，页面应用与脚本操作共享同一会话；
- 截图落 vshop/docs/screenshots/waimai/（不进 waimai 仓库，里程碑收口统一处理）；
- 已知空态（数据侧实况，非缺陷）：①「即将开始」tab 恒空（couponCentreUpcoming 里程碑2 上线）；
  ②冒烟账号无已使用/已过期券 → 两 tab 均空态；③券中心唯一模板「冒烟补偿券-勿动」不领取不挂单。
- 菜单 chip：可乐鸡排饭已绑定 ¥1 券（productCoupons 需登录态可查，匿名探测为空）。
"""
import json
import os
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = os.environ.get("SMOKE_BASE", "http://localhost:5181/waimai/index.html?tenant=canteen-a-token")
CHANNEL = os.environ.get("SMOKE_CHANNEL", "canteen-a-token")
EMAIL, PWD = "smoke-order@yourbao.cn", "Wm@Smoke123"
VARIANT_ID = os.environ.get("SMOKE_VARIANT", "87")    # 可乐鸡排饭 205分（沿 _smoke_freeship.py）
ZONE_ID = os.environ.get("SMOKE_ZONE", "2")           # 东区
BUILDING_ID = os.environ.get("SMOKE_BUILDING", "2")   # 桂1栋
CHROME_FALLBACK = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
OUT = r"d:\zhao\vshop\docs\screenshots\waimai"
results, shots = [], []

LOGIN = ('mutation($u:String!,$p:String!){ login(username: $u, password: $p) '
         '{ ... on CurrentUser { id } } }')
ADD_ITEM = ('mutation($v: ID!, $q: Int!){ addItemToOrder(productVariantId: $v, quantity: $q) '
            '{ ... on Order { id } ... on ErrorResult { errorCode message } } }')
SET_TARGET = ('mutation($z: ID!, $b: ID!){ campusSetDeliveryTarget(zoneId: $z, buildingId: $b, route: "R1") '
              '{ id customFields { campusZone fulfillmentRoute } } }')
ELIGIBLE = "query { eligibleShippingMethods { id code priceWithTax } }"
SET_SHIP = ('mutation($id: [ID!]!){ setOrderShippingMethod(shippingMethodId: $id) '
            '{ ... on Order { id } ... on ErrorResult { errorCode message } } }')
CLEAR_COUPON = 'mutation { clearCouponFromOrder { ... on Order { id } } }'


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(detail) if (detail and not ok) else ""))


def page_gql(pg, query, variables=None):
    """页面上下文同源 fetch（会话 cookie 生效的唯一通道，沿先例）。"""
    return pg.evaluate(
        "async ([q, v, ch]) => { const r = await fetch('/shop-api', { method: 'POST',"
        " headers: {'Content-Type':'application/json','vendure-token': ch},"
        " body: JSON.stringify({query: q, variables: v}) }); return r.json(); }",
        [query, variables or {}, CHANNEL],
    )


def must(d, key):
    data = (d.get("data") or {}).get(key)
    assert data, f"{key} 失败: {json.dumps(d, ensure_ascii=False)[:220]}"
    return data


def login(pg):
    """页面上下文登录：会话 cookie 自动建立，同时把响应头 token 写进前端登录态存储键。"""
    r = pg.evaluate(
        "async ([u, p, ch]) => { const r = await fetch('/shop-api', { method: 'POST',"
        " headers: {'Content-Type':'application/json','vendure-token': ch},"
        " body: JSON.stringify({query: 'mutation($u:String!,$p:String!){ login(username: $u, password: $p)"
        " { ... on CurrentUser { id } } }', variables: {u, p} }) });"
        " return { body: await r.json(), token: r.headers.get('vendure-auth-token') }; }",
        [EMAIL, PWD, CHANNEL],
    )
    body, token = r.get("body", {}), r.get("token")
    uid = str((body.get("data", {}).get("login", {}) or {}).get("id") or "")
    ok = bool(uid) and bool(token)
    if ok:
        # vendure_session_token = API 会话兜底（client.ts）；auth_token/auth_userId =
        # auth store 登录态（restoreSession 在每次整页加载的 onLaunch 重读 → 角标/requireLogin 生效）
        pg.evaluate(
            "o => { localStorage.setItem('vendure_session_token', o.t);"
            " localStorage.setItem('auth_token', o.t); localStorage.setItem('auth_userId', o.u); }",
            {"t": token, "u": uid},
        )
    check("login", ok, {"body": body, "token": token})
    return ok


def wait_ready(pg, texts, tries=25):
    body = ""
    for _ in range(tries):
        pg.wait_for_timeout(1000)
        body = pg.inner_text("body")
        if any(t in body for t in texts):
            return body
    return body


def clean_active_order(pg):
    """清理冒烟购物车（先摘券再删行，恢复会话原状）。"""
    d = page_gql(pg, "query { activeOrder { id couponCodes lines { id } } }")
    ao = (d.get("data") or {}).get("activeOrder")
    if not ao:
        return
    if ao.get("couponCodes"):
        page_gql(pg, CLEAR_COUPON)
    for line in ao.get("lines") or []:
        page_gql(pg, 'mutation($id: ID!){ removeOrderLine(orderLineId: $id){ ... on Order { id } } }',
                 {"id": line["id"]})
    print("cleaned active order")


def prep_cart(pg, qty):
    """checkout 场景造车：加购 → 写配送目标 → 应用 campus-errand 运费（沿 _smoke_freeship.py）。"""
    clean_active_order(pg)
    must(page_gql(pg, ADD_ITEM, {"v": VARIANT_ID, "q": qty}), "addItemToOrder")
    must(page_gql(pg, SET_TARGET, {"z": ZONE_ID, "b": BUILDING_ID}), "campusSetDeliveryTarget")
    methods = must(page_gql(pg, ELIGIBLE), "eligibleShippingMethods") or []
    campus = next((m for m in methods if (m.get("code") or "").startswith("campus-errand")), None)
    assert campus, "eligible 无 campus-errand 方式: " + json.dumps(methods, ensure_ascii=False)[:200]
    must(page_gql(pg, SET_SHIP, {"id": [campus["id"]]}), "setOrderShippingMethod")
    return campus


def shot(pg, name, full_page=False):
    path = os.path.join(OUT, name)
    pg.screenshot(path=path, full_page=full_page)
    shots.append(name)
    print("shot:", name)


def goto(pg, route, extra_wait=2000):
    pg.goto(BASE + route, wait_until="networkidle")
    pg.wait_for_timeout(extra_wait)


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=True)
        except Exception:
            browser = p.chromium.launch(executable_path=CHROME_FALLBACK, headless=True)
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                  is_mobile=True, has_touch=True, locale="zh-CN",
                                  user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
                                             "AppleWebKit/605.1.15")
        pg = ctx.new_page()
        # 生产登录页会自动跳 SSO（h.joho.cn，跨源 fetch 失效）→ 生产模式落首页执行登录 fetch；
        # dev 沿用登录页（与先例一致）
        entry = "#/pages/home/index" if os.environ.get("SMOKE_BASE") else "#/pages/login/index"
        goto(pg, entry, extra_wait=2500)
        if not login(pg):
            browser.close()
            report()
            return
        # hash 路由间 goto 是同文档导航（onLaunch 不重跑）→ 必须 reload 一次让
        # restoreSession() 读入 auth_token，内存登录态（角标/requireLogin）才生效
        pg.reload(wait_until="networkidle")
        pg.wait_for_timeout(1500)

        # 生产模式：先领一张 TEST 冒烟券（SMOKE_CLAIM_TEMPLATE，默认 78=无门槛减3），
        # 保证 profile 角标与 checkout 试挂有素材；已领过/模板不存在则幂等跳过
        if os.environ.get("SMOKE_BASE"):
            tpl = os.environ.get("SMOKE_CLAIM_TEMPLATE", "78")
            try:
                d = page_gql(pg, 'mutation($t: ID!){ claimCoupon(templateId: $t) { id } }',
                             {"t": tpl})
                print("claim:", json.dumps(d, ensure_ascii=False)[:160])
            except Exception as e:
                print("claim skipped:", str(e)[:120])

        # ① 券中心-可领取 tab
        goto(pg, "#/pkg-promotion/pages/coupon-centre", extra_wait=3000)
        body = wait_ready(pg, ["可领取", "立即领取", "暂无可领取"])
        check("券中心-可领取渲染", ("可领取" in body) and ("立即领取" in body), body[:200])
        shot(pg, "coupon-centre-claimable.png")

        # ② 券中心-即将开始 tab（里程碑1 恒空态：couponCentreUpcoming 未上线）
        pg.locator(".cc-tab").nth(1).tap()
        pg.wait_for_timeout(1200)
        shot(pg, "coupon-centre-upcoming-empty.png")

        # ③④ 我的券包：未使用 / 已使用空态 / 已过期空态
        goto(pg, "#/pkg-promotion/pages/my-coupons", extra_wait=3000)
        body = wait_ready(pg, ["未使用", "暂无可用优惠券", "去领券中心"])
        check("券包-未使用渲染", ("未使用" in body) and ("去使用" in body), body[:200])
        shot(pg, "my-coupons-unused.png")
        pg.locator(".mc-tab").nth(1).tap()
        pg.wait_for_timeout(1200)
        shot(pg, "my-coupons-used-empty.png")
        pg.locator(".mc-tab").nth(2).tap()
        pg.wait_for_timeout(1200)
        shot(pg, "my-coupons-expired-empty.png")

        # ⑤ checkout：造车 → 优惠券行（自动试挂可能挂上最优券）→ 选券弹层
        prep_cart(pg, 25)  # 25×205分=5125（¥51.25 ≥ 满50减10 门槛）
        goto(pg, "#/pkg-order/pages/checkout", extra_wait=3500)
        body = wait_ready(pg, ["商品总额", "优惠券"])
        check("checkout 优惠券行渲染", ("商品总额" in body) and ("优惠券" in body), body[:300])
        shot(pg, "checkout-coupon-row.png", full_page=True)
        pg.locator(".summary-row--coupon").tap()
        try:
            pg.wait_for_selector(".coupon-sheet", timeout=5000)
            pg.wait_for_timeout(800)
            check("选券弹层渲染", True)
            shot(pg, "checkout-coupon-sheet.png")
        except Exception as e:
            check("选券弹层渲染", False, str(e)[:200])

        # ⑥ 店铺菜单页商品行 chip（可乐鸡排饭已绑定 ¥1 券）
        goto(pg, "#/pages/shop/menu?token=" + CHANNEL + "&name=canteen-a", extra_wait=3500)
        body = wait_ready(pg, ["可乐鸡排饭", "全部"])
        check("店铺菜单页渲染", "可乐鸡排饭" in body, body[:200])
        shot(pg, "shop-menu-coupon-chip.png")
        check("商品行 chip 渲染", "领取" in pg.inner_text("body"), "商品行未出现 领取 chip")

        # ⑦ profile 优惠券入口激活态（未使用角标 = UNUSED 数；auth_token 需整页加载后 restoreSession 生效）
        goto(pg, "#/pages/profile/index", extra_wait=3000)
        wait_ready(pg, ["优惠券", "常用地址"])
        badge_count = 0
        for _ in range(10):
            badge_count = pg.locator(".asset-item__badge").count()
            if badge_count > 0:
                break
            pg.wait_for_timeout(1000)
        body = pg.inner_text("body")
        check("profile 优惠券入口+角标", ("优惠券" in body) and badge_count > 0,
              f"badge_count={badge_count} body={body[:200]}")
        shot(pg, "profile-coupon-entry.png")

        # 清理：恢复冒烟会话购物车原状
        pg.goto(BASE + "#/pages/home/index", wait_until="domcontentloaded")
        pg.wait_for_timeout(2000)
        clean_active_order(pg)
        check("清理购物车", True)

        browser.close()
    report()


def report():
    fails = [r for r in results if not r[1]]
    print(f"\nE2E SMOKE {'PASS' if not fails else 'FAIL'} ({len(results)-len(fails)}/{len(results)}) "
          f"shots={shots} -> {OUT}")
    sys.exit(1 if fails else 0)


def wait_dev_server(timeout=180):
    url = "http://localhost:5181/waimai/index.html"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(2)
    return False


if __name__ == "__main__":
    # SMOKE_BASE 设置后为生产模式（如 https://www.yourbao.cn/waimai/index.html），
    # 跳过本地 dev:h5 等待；生产只领不下单，脚本自身不下单（结束时清理购物车恢复原状）。
    if not os.environ.get("SMOKE_BASE") and not wait_dev_server():
        print("FAIL dev:h5 (localhost:5181) 未就绪")
        sys.exit(1)
    main()
