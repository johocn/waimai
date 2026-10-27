# -*- coding: utf-8 -*-
"""P3-1 口味偏好云端同步截图（线上真实 shop-api，不 mock）。
流程：登录 → 打开「我的口味」→ 直接调 mutation 上行 → query 读回校验 → 刷新页面确认渲染。
视口 390x844 dpr=2（硬规范）。
运行：python scripts/_shot_taste_cloud.py
"""
import json
import os
import time

from playwright.sync_api import sync_playwright

BASE = "https://www.yourbao.cn/waimai/?tenant=canteen-a-token"
CHANNEL = "canteen-a-token"
EMAIL, PWD = "smoke-rider@yourbao.cn", "Wm@Smoke123"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
OUT = os.environ.get("SHOT_OUT", r"d:\zhao\waimai\docs\screenshots\waimai\p21-taste-cloud")

# 与 C 端 utils/taste-profile.ts 同结构
PROFILE = {"spicy": "mild", "avoid": ["coriander", "onion"], "allergens": ["peanut"], "tableware": 2}


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


def gql(page, query: str, variables=None):
    return page.evaluate(
        "async ([q, v, ch]) => { const t = localStorage.getItem('auth_token') || '';"
        " const r = await fetch('/shop-api', { method: 'POST', headers: {'Content-Type':'application/json',"
        " 'vendure-token': ch, ...(t ? {'Authorization': 'Bearer ' + t} : {})},"
        " body: JSON.stringify({query: q, variables: v}) }); return await r.json(); }",
        [query, variables or {}, CHANNEL],
    )


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

        # 1) 上行：保存口味偏好到云端
        saved = gql(
            page,
            "mutation($input:String!){ campusUpdateTasteProfile(input:$input) }",
            {"input": json.dumps(PROFILE, ensure_ascii=False)},
        )
        print("save:", json.dumps(saved, ensure_ascii=False)[:200])

        # 2) 读回：证明物理列已存在且可往返
        back = gql(page, "query { campusMyTasteProfile }")
        print("read:", json.dumps(back, ensure_ascii=False)[:300])
        cloud = (back.get("data") or {}).get("campusMyTasteProfile") or ""
        if not cloud:
            raise SystemExit("campusMyTasteProfile empty -> cloud column missing?")

        # 3) 刷新页面：云端值应回填到设置页（截图证明 UI 一致）
        page.goto(BASE + "#/pkg-user/pages/taste-profile", wait_until="networkidle")
        page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(OUT, "01-taste-profile-cloud-restored.png"))

        # 4) 结算页：口味摘要应带出「微辣 / 忌口 / 过敏原」
        page.goto(BASE + "#/pkg-order/pages/checkout", wait_until="networkidle")
        page.wait_for_timeout(2500)
        page.screenshot(path=os.path.join(OUT, "02-checkout-taste-restored.png"))
        browser.close()
        print("saved:", OUT)


if __name__ == "__main__":
    main()
