// waimai plan2 Task6/7 提交链路端到端验证（全新账号、干净购物车）
// 前置：campusErrandCalculator 已扩展支持 fulfillmentRoute R1/R3（e74ae30ec 已部署重启）
const base = 'https://e.joho.cn';
const CHANNEL = 'cnx87ezvmjx8nn3bth6c';

async function gql(token, query, variables) {
    const headers = { 'Content-Type': 'application/json', 'vendure-token': CHANNEL };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const r = await fetch(base + '/shop-api', { method: 'POST', headers, body: JSON.stringify({ query, variables: variables || {} }) });
    const j = await r.json();
    if (j.errors) throw new Error('GQL: ' + JSON.stringify(j.errors));
    return j.data;
}

async function main() {
    // 1. 注册新账号（公开端点）拿 access_token
    const reg = await fetch('https://h.joho.cn/api/zhao-sso/v1/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'waimai_e2e_' + Date.now(), password: 'Wm123456', app_code: 'vendure-youshop' }),
    }).then(r => r.json());
    // 2. SSO token 直验换 Vendure 会话
    const prov = await gql(null, '{ ssoProviders { providerKey } }');
    // node fetch 不受 CORS 限制，可直接读 vendure-auth-token 响应头
    const authRes = await fetch(base + '/shop-api', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'vendure-token': CHANNEL },
        body: JSON.stringify({
            query: `mutation($t: String!){ authenticate(input:{ sso:{ providerKey:"${prov.ssoProviders[0].providerKey}", accessToken: $t } }){ ... on CurrentUser { id } ... on ErrorResult { errorCode message } } }`,
            variables: { t: reg.access_token },
        }),
    });
    const authToken = authRes.headers.get('vendure-auth-token');
    const authBody = await authRes.json();
    if (!authToken) throw new Error('authenticate 未返回 session token: ' + JSON.stringify(authBody).slice(0, 300));
    const me = await gql(authToken, '{ me { id identifier } }');
    console.log('1. 登录 OK', JSON.stringify(me.me));

    // 3. 查店铺渠道第一个可售商品 variant
    const prod = await gql(authToken, '{ search(input:{ take: 1 }) { items { ... on SearchResult { productVariantId productName priceWithTax { ... on SinglePrice { value } } } } } }');
    const variantId = prod.search.items[0]?.productVariantId;
    console.log('2. 商品', JSON.stringify(prod.search.items[0]));
    if (!variantId) throw new Error('渠道无商品');

    // 4. 加购 → 写配送目标 → 验证 campus method eligible（关键断言）
    await gql(authToken, 'mutation($v: ID!){ addItemToOrder(productVariantId: $v, quantity: 1){ ... on Order { id state totalQuantity } ... on ErrorResult { errorCode message } } }', { v: variantId });
    const zones = await gql(authToken, '{ campusZones { id name fee } campusBuildings { id name zoneId } }');
    const z = zones.campusZones[0], b = zones.campusBuildings.find(x => x.zoneId === z.id);
    const target = await gql(authToken, 'mutation($z: ID!,$b: ID!){ campusSetDeliveryTarget(zoneId:$z, buildingId:$b, route:"R3"){ id state customFields { fulfillmentRoute campusZone orderKind } } }', { z: z.id, b: b.id });
    console.log('3. setDeliveryTarget', JSON.stringify(target.campusSetDeliveryTarget));
    if (target.campusSetDeliveryTarget.customFields.orderKind === 'errand') throw new Error('orderKind 意外为 errand，验证无效');

    const elig = await gql(authToken, '{ eligibleShippingMethods { id code priceWithTax } }');
    const campus = elig.eligibleShippingMethods.find(m => m.code?.startsWith('campus-errand'));
    console.log('4. campus method eligible:', JSON.stringify(campus || 'MISSING —— calculator 未生效'));
    if (!campus) throw new Error('campus method 未出现在 eligible');

    // 5. 选方式 → transition → 支付 → 订单 code
    const sm = await gql(authToken, 'mutation($m: [ID!]!){ setOrderShippingMethod(shippingMethodId: $m){ ... on Order { id state shippingWithTax shippingLines { shippingMethod { code } } } ... on ErrorResult { errorCode message } } }', { m: [campus.id] });
    console.log('5a. setShippingMethod', JSON.stringify(sm.setOrderShippingMethod ?? sm));
    const addr = await gql(authToken, 'mutation { setOrderShippingAddress(input: { fullName: "测", streetLine1: "A区1栋", city: "桂林", province: "广西", countryCode: "CN" }){ ... on Order { id state } ... on ErrorResult { errorCode message } } }');
    console.log('5b. setAddress', JSON.stringify(addr.setOrderShippingAddress ?? addr));
    const tr = await gql(authToken, 'mutation { transitionOrderToState(state: "ArrangingPayment"){ ... on Order { id state } ... on ErrorResult { errorCode message } } }');
    console.log('5c. transition', JSON.stringify(tr.transitionOrderToState));
    const pay = await gql(authToken, 'mutation { addPaymentToOrder(input:{ method: "cash-on-delivery", metadata: {} }){ ... on Order { id code state totalWithTax } ... on ErrorResult { errorCode message } } }');
    console.log('6. pay', JSON.stringify(pay.addPaymentToOrder));
    if (pay.addPaymentToOrder?.errorCode) throw new Error('支付失败');

    // 6. 验证订单 customFields + hallStatus 已入厅（hallEnteredAt/hallStatus）
    const od = await gql(authToken, `query($c: String!){ orderByCode(code: $c){ code state customFields { fulfillmentRoute campusZone hallStatus hallEnteredAt deliveryStatus } shippingWithTax } }`, { c: pay.addPaymentToOrder.code });
    console.log('7. 订单', JSON.stringify(od.orderByCode));
}

main().then(() => console.log('=== E2E PASS ===')).catch(e => { console.error('=== E2E FAIL ===\n' + e.message); process.exit(1); });
