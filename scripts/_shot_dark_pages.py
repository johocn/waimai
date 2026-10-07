# -*- coding: utf-8 -*-
"""暗色主题补全 · 多页暗色截图抽查（订单详情/售后详情/首页）

前置：部署含暗色方案 A 补全（2026-10-07）。铁律 390x844 dpr2。
退出码：0=PASS；1=FAIL；2=环境不可用
"""
import time

from playwright.sync_api import sync_playwright

H5 = "https://www.yourbao.cn/waimai/?tenant=%s#/%%s" % "canteen-a-token"
CHANNEL = "canteen-a-token"
ORDERER = ("smoke-order@yourbao.cn", "Wm@Smoke123")
ORDER_CODE = "6CBGCT4A2GVXLLHV"   # 售后 #27 对应订单（Appealed）
AS_ID = "27"
SHOTS = "C:/tmp/waimai_shots"

GQL = """
async (args) => {
    const r = await fetch('/shop-api', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'vendure-token': '%s'},
        body: JSON.stringify({query: args.q, variables: args.v || {}}),
    });
    return await r.json();
}
""" % CHANNEL

FAILS = []


def check(name, ok, detail=''):
    print('%s %s %s' % ('  OK  ' if ok else '  FAIL', name, detail))
    if not ok:
        FAILS.append(name)


def goto_dark(pg, path, settle=5.0):
    url = H5 % path
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    time.sleep(settle)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR:%s' % e))
        pg.on('console', lambda m: errs.append('CONSOLE:%s' % m.text) if m.type == 'error' else None)
        not_found = []
        pg.on('response', lambda r: not_found.append('%s %s' % (r.status, r.url)) if r.status == 404 else None)

        # 登录（cookie 会话）
        pg.goto(H5 % 'pages/home/index', wait_until='networkidle', timeout=60000)
        r = pg.evaluate(GQL, {"q": "mutation($u:String!,$p:String!){ login(username:$u,password:$p){ ... on CurrentUser { id } } }",
                               "v": {"u": ORDERER[0], "p": ORDERER[1]}})
        uid = ((r.get('data') or {}).get('login') or {}).get('id')
        check('H5 登录', bool(uid), str(r)[:120])

        # 暗色开启（reload 后 App onLaunch initTheme 读 storage）
        pg.evaluate("() => { localStorage.setItem('waimai_theme', 'dark'); }")
        dark_on = pg.evaluate("""() => { location.reload(); return true; }""")
        time.sleep(3)

        # 1. 订单详情（暗色）
        goto_dark(pg, 'pkg-order/pages/order-detail?code=%s' % ORDER_CODE, 6)
        body = pg.evaluate('document.body.innerText')
        check('订单详情渲染', len(body.strip()) > 50, body[:60].replace('\\n', ' '))
        pg.screenshot(path=SHOTS + '/dark_order_detail.png')

        # 2. 售后详情（暗色）
        goto_dark(pg, 'pkg-order/pages/after-sale-detail?id=%s' % AS_ID, 6)
        pg.screenshot(path=SHOTS + '/dark_after_sale.png')

        # 3. 首页（暗色，原生支持页）
        goto_dark(pg, 'pages/home/index', 5)
        pg.screenshot(path=SHOTS + '/dark_home.png')

        # 恢复明亮（避免影响后续会话）
        pg.evaluate("() => { localStorage.setItem('waimai_theme', 'light'); }")

        # 资源 404（含其 console 报错）属数据问题不判 FAIL；pageerror（JS 异常）仍严格判定
        real_errs = [e for e in errs if 'favicon' not in e and 'Failed to load resource' not in e]
        # 404 资源缺失（如商品图未上传）属数据问题，不判主题失败；打印供排查
        check('0 pageerror/console.error', len(real_errs) == 0, '; '.join(real_errs[:3]))
        if not_found:
            print('  .. 404 资源（数据问题不判 FAIL）: ' + ' | '.join(not_found[:5]))

        b.close()
    print('PASS' if not FAILS else 'FAIL(%d)' % len(FAILS))
    raise SystemExit(0 if not FAILS else 1)


if __name__ == '__main__':
    main()
