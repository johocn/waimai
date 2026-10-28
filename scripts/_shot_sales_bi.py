# -*- coding: utf-8 -*-
"""P4-1 经营 BI：后台「经营分析」页线上取证（390x844 dpr=2）。"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

ADMIN = "https://e.joho.cn/guanli/#/"
OUT = r"D:\zhao\waimai-v39\docs\screenshots\p24-sales-bi"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
CHANNEL = "canteen-a-token"
ADMIN_USER, ADMIN_PWD = "superadmin", "z123123"

os.makedirs(OUT, exist_ok=True)


def wait_ready(pg, texts, tries=30):
    body = ""
    for _ in range(tries):
        body = pg.inner_text("body")
        if all(t in body for t in texts):
            return body
        pg.wait_for_timeout(800)
    return body


def state(pg):
    body = pg.inner_text("body")
    return {
        "hasTitle": "经营分析" in body,
        "hasKpi": "GMV" in body,
        "ranges": [t for t in ("今日", "近 7 日", "近 30 日") if t in body],
        "error": "失败" in body or "重试" in body,
        "empty": "暂无" in body,
        "excerpt": body.replace("\n", " | ")[:420],
    }


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                              is_mobile=True, has_touch=True, locale="zh-CN")
    pg = ctx.new_page()
    for i in range(4):
        pg.goto(ADMIN + "pages/login/index", wait_until="networkidle", timeout=60000)
        pg.wait_for_selector('input[type="text"]', timeout=30000)
        pg.fill('input[type="text"]', ADMIN_USER)
        pg.fill('input[type="password"]', ADMIN_PWD)
        pg.wait_for_timeout(300)
        pg.click("text=登 录")
        try:
            pg.wait_for_load_state("networkidle", timeout=30000)
        except Exception:  # noqa: BLE001
            pass
        pg.wait_for_timeout(2500)
        if "登录失败" not in pg.inner_text("body"):
            print(f"admin login ok (attempt {i + 1})")
            break
        time.sleep(2)
    else:
        raise AssertionError("后台登录多次失败")

    pg.evaluate("t => { localStorage.setItem('wa_channel_token', t); }", CHANNEL)
    pg.goto(ADMIN + "pages/campus/sales", wait_until="networkidle", timeout=60000)
    body = wait_ready(pg, ["经营分析", "GMV"], tries=30)
    print("01 state", state(pg))
    assert "经营分析" in body, "经营分析页未加载: " + body[:200]

    for idx, label in [(1, "今日"), (2, "近 7 日"), (3, "近 30 日")]:
        try:
            pg.click(f"text={label}", timeout=8000)
            pg.wait_for_timeout(1800)
            print(f"switch {label} ok")
        except Exception as exc:  # noqa: BLE001
            print(f"switch {label} failed: {exc}")
        name = {1: "today", 2: "7d", 3: "30d"}[idx]
        print(f"0{idx + 3} state", {**state(pg), "range": name})
        pg.screenshot(path=os.path.join(OUT, f"{idx + 1:02d}-admin-sales-{name}.png"), full_page=True)

    # P4-1-4 导出 CSV：捕获下载并校验内容
    with pg.expect_download(timeout=20000) as dl_info:
        pg.click("text=导出 CSV", timeout=8000)
    dl = dl_info.value
    csv_path = os.path.join(OUT, "05-admin-sales-products.csv")
    dl.save_as(csv_path)
    with open(csv_path, encoding="utf-8-sig") as f:
        lines = [ln.rstrip("\n") for ln in f.readlines()]
    print("export state", {"file": dl.suggested_filename, "rows": len(lines) - 1,
                           "header": lines[0] if lines else "", "first": lines[1] if len(lines) > 1 else ""})
    assert len(lines) > 1 and lines[0].count(",") == 3, "CSV 内容异常"

    browser.close()

print("SHOTS DONE ->", OUT)