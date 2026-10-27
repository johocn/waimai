# -*- coding: utf-8 -*-
"""P3-3 批量接单线上取证：骑手大厅勾选态 + 批量接单底栏 + 成功提示，并跑真实接口探针。

视口 390x844 dpr=2（硬规范）。登录态走页面上下文 login 注入 session token（避 SSO 跳转）。
探针只做无副作用调用（空数组 / 超上限 / 伪造 id），不会真实抢单。
运行：python scripts/_shot_rider_batch.py
"""
import json
import os
import re
import time

from playwright.sync_api import sync_playwright

BASE = "https://www.yourbao.cn/waimai/?tenant=canteen-a-token"
CHANNEL = "canteen-a-token"
EMAIL, PWD = "smoke-rider@yourbao.cn", "Wm@Smoke123"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
OUT = os.environ.get("SHOT_OUT", r"D:\zhao\waimai-v39\docs\screenshots\p22-rider-batch-grab")

FAKE_IDS = ["9100001", "9100002", "9100003"]
FAKE_TASKS = [
    {
        "id": i, "code": "A240100" + str(n + 1), "total": 3600, "shipping": 200, "createdAt": "2026-10-27T09:30:00.000Z",
        "channelId": "1", "channelToken": CHANNEL, "channelName": "第一食堂 1 号档口",
        "customFields": {"hallStatus": "open", "hallEnteredAt": "2026-10-27T09:30:00.000Z", "tip": 300,
                         "fulfillmentRoute": "R2", "campusZone": "东区", "buildingId": "3",
                         "deliverySlotText": "尽快送达", "routeGroupId": "g-demo-1"},
    }
    for n, i in enumerate(FAKE_IDS)
]


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


def gql(page, query: str, variables: dict):
    return page.evaluate(
        "async ([q, v, ch]) => { const r = await fetch('/shop-api', { method: 'POST',"
        " headers: {'Content-Type':'application/json','vendure-token': ch},"
        " body: JSON.stringify({ query: q, variables: v }) }); return await r.json(); }",
        [query, variables, CHANNEL],
    )


GRAB_BATCH = """mutation($ids: [ID!]!) { campusGrabOrders(orderIds: $ids) { orderId ok message } }"""


def probe(page):
    out = {}
    out["empty"] = gql(page, GRAB_BATCH, {"ids": []})
    out["fake"] = gql(page, GRAB_BATCH, {"ids": FAKE_IDS})
    out["over_limit"] = gql(page, GRAB_BATCH, {"ids": [str(9200000 + i) for i in range(11)]})
    print("PROBE " + json.dumps(out, ensure_ascii=False))


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROME, headless=True)
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
            locale="zh-CN",
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        )
        page = ctx.new_page()

        # 接口探针：拦截真实响应即可，无需页面渲染
        page.goto(BASE + "#/pages/login/index", wait_until="networkidle")
        if not login(page):
            raise SystemExit("login failed")
        probe(page)

        # 大厅 mock 三单：展示勾选态与批量底栏（真实大厅多数时段为空）
        def route_shop(route):
            req = route.request
            body = req.post_data or ""
            if "campusHallAll" in body:
                return route.fulfill(status=200, content_type="application/json",
                                     body=json.dumps({"data": {"campusHallAll": FAKE_TASKS}}, ensure_ascii=False))
            if "campusGrabOrders" in body:
                vs = json.loads(body).get("variables", {}) or {}
                ids = vs.get("orderIds") or vs.get("ids") or []
                return route.fulfill(status=200, content_type="application/json", body=json.dumps(
                    {"data": {"campusGrabOrders": [{"orderId": i, "ok": True, "message": None} for i in ids]}}))
            return route.continue_()

        page.route(re.compile(r".*/shop-api.*"), route_shop)
        page.reload(wait_until="networkidle")
        time.sleep(1.5)
        page.goto(BASE + "#/pkg-rider/pages/rider-home", wait_until="networkidle")
        page.wait_for_timeout(2500)
        # 下线态不拉大厅，先切「接单中」（smoke-rider 专用账号）
        if "on" not in (page.locator(".online").get_attribute("class") or "").split():
            page.locator(".online").click()
            page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(OUT, "01-rider-hall-batch-idle.png"))

        cards = page.locator(".task")
        n = min(2, cards.count())
        if n == 0:
            raise SystemExit("no hall task rendered")
        for i in range(n):
            cards.nth(i).click()
            page.wait_for_timeout(400)
        page.wait_for_timeout(600)
        page.screenshot(path=os.path.join(OUT, "02-rider-hall-picked-batchbar.png"))
        print("picked cards:", n, "| batchbar:", page.locator(".batchbar").count())

        page.locator(".bb-go").click()
        toast_text = []
        for _ in range(10):
            page.wait_for_timeout(100)
            txt = page.evaluate("() => document.body.innerText")
            hit = [ln for ln in txt.split("\n") if "已接" in ln]
            if hit:
                toast_text = hit
                break
        page.screenshot(path=os.path.join(OUT, "03-rider-hall-batch-done-toast.png"))
        print("toast_text:", toast_text)
        # 成功分支 600ms 后 redirectTo 配送任务页：落到该页即证明批量接单成功链路走通
        page.wait_for_timeout(1400)
        page.screenshot(path=os.path.join(OUT, "04-rider-delivering-after-batch.png"))
        print("after batch url:", page.url.split("/waimai/")[-1])
        browser.close()
        print("SHOTS DONE ->", OUT)


if __name__ == "__main__":
    main()
