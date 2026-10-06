import{g as e}from"./index.Bcs2hJSo.js";import{T as r}from"./index-BA8BaUu7.js";const t=e`
    mutation campusSetDeliveryTarget($zoneId: ID!, $buildingId: ID!, $route: String, $slotId: Int) {
        campusSetDeliveryTarget(zoneId: $zoneId, buildingId: $buildingId, route: $route, slotId: $slotId) {
            id
            customFields { buildingId campusZone fulfillmentRoute deliverySlotId deliverySlotText }
        }
    }
`,n=e`
    query campusZones { campusZones { id name fee } }
`,d=e`
    query campusBuildings($zoneId: ID) { campusBuildings(zoneId: $zoneId) { id name detail zoneId } }
`,u=e`
    query campusShopSlots { campusShopSlots { id slotDate startTime endTime capacity lockedCount active } }
`,a=e`
    query campusOrderRider($orderId: ID!) { campusOrderRider(orderId: $orderId) { realName credit location { lat lng } } }
`,o=e`
    query myRiderProfile {
        myRiderProfile {
            customerId riderStatus riderRealName riderStudentNo riderCampus riderCredit
        }
    }
`;function i(e){return r().request(t,e)}function s(){return r().request(n).then(e=>(null==e?void 0:e.campusZones)??[])}function l(e){return r().request(d,{zoneId:e}).then(e=>(null==e?void 0:e.campusBuildings)??[])}function c(){return r().request(u).then(e=>(null==e?void 0:e.campusShopSlots)??[])}function m(e){return r().request(a,{orderId:e}).then(e=>null==e?void 0:e.campusOrderRider)}function p(){return r().request(o).then(e=>null==e?void 0:e.myRiderProfile)}const I=e`
    mutation campusMarkArrived($orderId: ID!) { campusMarkArrived(orderId: $orderId) { leg1Status } }
`,f=e`
    query campusR2Relay($orderId: ID!) {
        campusR2Relay(orderId: $orderId) { orderId orderCode state hallStatus deliveryStatus errandTo tip totalWithTax }
    }
`,$=e`
    query campusErrandVariant { campusErrandVariant { variantId sku errandBaseFee } }
`,y=e`
    query campusCapacityCheck { campusCapacityCheck { paused ridersOnline } }
`,q=e`
    mutation campusSetErrandInfo($input: CampusErrandInput!) { campusSetErrandInfo(input: $input) { orderId } }
`;function v(e){return r().request(I,{orderId:e}).then(e=>null==e?void 0:e.campusMarkArrived)}function h(e){return r().request(f,{orderId:e}).then(e=>(null==e?void 0:e.campusR2Relay)??null)}function S(){return r().request($).then(e=>null==e?void 0:e.campusErrandVariant)}function g(){return r().request(y).then(e=>null==e?void 0:e.campusCapacityCheck)}function R(e){return r().request(q,{input:e}).then(e=>null==e?void 0:e.campusSetErrandInfo)}const C=e`
    mutation campusRiderReportLocation($orderId: ID!, $lat: Float!, $lng: Float!) {
        campusRiderReportLocation(orderId: $orderId, lat: $lat, lng: $lng) { id }
    }
`;function D(e,t,n){return r().request(C,{orderId:e,lat:t,lng:n})}export{l as a,s as b,c,h as d,m as e,p as f,g,R as h,S as i,v as m,D as r,i as s};
