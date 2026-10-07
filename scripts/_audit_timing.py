# -*- coding: utf-8 -*-
"""waimai 生产首屏计时体检：首页/店铺页/订单页 load+networkidle 计时（3 次取中位）。
视口 390x844 dpr=2（硬规范）。订单页需登录态：页面上下文 login 后注入 session token。
运行：python scripts/_audit_timing.py
"""
import json
import statistics
import time

from playwright.sync_api import sync_playwright

PROD = "https://www.yourbao.cn/waimai/?tenant=canteen-a-token"
API = "https://www.yourbao.cn/shop-api"
CHANNEL = "canteen-a-token"
EMAIL, PWD = "smoke-order@yourbao.cn", "Wm@Smoke123"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
RUNS = 3


def perf_summary(page):
    """导航耗时 + 首屏传输体积（transferSize 来自 performance API）。"""
    return page.evaluate(
        """() => {
            const nav = performance.getEntriesByType('navigation')[0];
            const res = performance.getEntriesByType('resource') || [];
            const transfer = res.reduce((s, r) => s + (r.transferSize || 0), 0)
                + (nav ? (nav.transferSize || 0) : 0);
            return {
                ttfb: Math.round(nav?.responseStart ?? 0),
                load: Math.round(nav?.loadEventEnd ?? 0),
                domInteractive: Math.round(nav?.domInteractive ?? 0),
                transferKB: Math.round(transfer / 1024),
                reqCount: res.length,
            };
        }"""
    )


def time_page(page, url, runs=RUNS):
    loads, idles, perfs = [], [], []
    for _ in range(runs):
        t0 = time.time()
        page.goto(url, wait_until="load")
        loads.append(round((time.time() - t0) * 1000))
        t1 = time.time()
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        idles.append(round((time.time() - t1) * 1000))
        perfs.append(perf_summary(page))
        time.sleep(0.5)
    return {
        "load_ms": int(statistics.median(loads)),
        "networkidle_ms": int(statistics.median(idles)),
        "perf": perfs[-1],
        "perf_load_median": int(statistics.median([p["load"] for p in perfs])),
    }


def main():
    out = {}
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

        # 1) 首页（公开页，冷启动近似：首次带缓存禁用不太可行，取 3 次中位）
        out["home"] = time_page(page, PROD + "&t=" + str(int(time.time())) + "#/pages/home/index")

        # 2) 店铺页：从首页点第一家店
        page.goto(PROD + "#/pages/home/index", wait_until="networkidle")
        page.wait_for_timeout(2500)
        t0 = time.time()
        page.locator(".card").first.tap()
        page.wait_for_load_state("networkidle", timeout=15000)
        page.wait_for_timeout(1500)
        out["shop_tap_ms"] = round((time.time() - t0) * 1000)
        out["shop_perf"] = perf_summary(page)

        # 3) 订单页：登录态后直达
        r = page.evaluate(
            "async ([u, p, ch]) => { const r = await fetch('/shop-api', { method: 'POST',"
            " headers: {'Content-Type':'application/json','vendure-token': ch},"
            " body: JSON.stringify({query: 'mutation($u:String!,$p:String!){ login(username: $u, password: $p) { ... on CurrentUser { id } } }',"
            " variables: {u, p} }) });"
            " return { token: r.headers.get('vendure-auth-token') }; }",
            [EMAIL, PWD, CHANNEL],
        )
        token = r.get("token")
        page.evaluate("t => { localStorage.setItem('vendure_session_token', t); }", token)
        time.sleep(0.5)
        out["orders"] = time_page(page, PROD + "#/pages/orders/index")

        # 4) 关键接口耗时（页面上下文 fetch，带渠道头）
        gql = "query { waimaiStoreList { totalItems items { id name } } campusZones { id name } }"
        t0 = time.time()
        page.evaluate(
            "async ([q, ch]) => { const r = await fetch('/shop-api', { method: 'POST',"
            " headers: {'Content-Type':'application/json','vendure-token': ch},"
            " body: JSON.stringify({query: q}) }); return r.json(); }",
            [gql, CHANNEL],
        )
        out["api_storelist_zones_ms"] = round((time.time() - t0) * 1000)

        browser.close()
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
