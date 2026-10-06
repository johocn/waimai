# -*- coding: utf-8 -*-
"""3.1 冒烟·支付闸门：凑够起送价 → 设时段12 → 支付 → 断言 hallStatus='scheduled'。"""
import json
import requests

API = "https://www.yourbao.cn/shop-api"
CHANNEL = "canteen-a-token"
ZONE, BUILDING, SLOT = "2", "2", "12"


def gql(query, token=None, channel=CHANNEL):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if channel:
        headers["vendure-token"] = channel
    r = requests.post(API, json={"query": query}, headers=headers, timeout=15)
    try:
        return r.json(), r.headers
    except Exception:
        return {"raw": r.text[:200]}, r.headers


_, h = gql('mutation { login(username: "smoke-order@yourbao.cn", password: "Wm@Smoke123") { ... on CurrentUser { id } } }')
tok = h.get("vendure-auth-token")


def q(query):
    return gql(query, token=tok)[0]


# 1) 凑量：variant 87 单价 181 分，10 件 = 1810 分 >= 1500 分起送价
adj = q('mutation { adjustOrderLine(orderLineId: 365, quantity: 10) { ... on Order { id state subTotalWithTax lines { id quantity } } ... on ErrorResult { errorCode message } } }')
od = adj.get("data", {}).get("adjustOrderLine")
print("adjust:", json.dumps(od, ensure_ascii=False)[:250])

# 2) 设预约时段 12（明天 11:00）
tgt = q('mutation { campusSetDeliveryTarget(zoneId: "%s", buildingId: "%s", route: "R3", slotId: %s) { id customFields { deliverySlotId scheduledFor } } }' % (ZONE, BUILDING, SLOT))
cf = (tgt.get("data", {}).get("campusSetDeliveryTarget") or {}).get("customFields")
print("slot:", json.dumps(cf, ensure_ascii=False))

# 3) 运费：campus-errand-smoke id=35
sm = q('mutation { setOrderShippingMethod(shippingMethodId: ["35"]) { ... on Order { id state } ... on ErrorResult { errorCode message } } }')
print("setShip:", json.dumps(sm.get("data", {}).get("setOrderShippingMethod"), ensure_ascii=False)[:200])

# 4) 转移支付态
tr = q('mutation { transitionOrderToState(state: "ArrangingPayment") { ... on Order { id state } ... on ErrorResult { errorCode message } } }')
print("transition:", json.dumps(tr.get("data", {}).get("transitionOrderToState"), ensure_ascii=False)[:250])

# 5) 到店支付 cod
pay = q('mutation { addPaymentToOrder(input: { method: "cod-payment-template", metadata: {} }) { ... on Order { id code state customFields { hallStatus scheduledFor deliverySlotText } } ... on ErrorResult { errorCode message } } }')
print("pay:", json.dumps(pay.get("data", {}).get("addPaymentToOrder"), ensure_ascii=False)[:400])
