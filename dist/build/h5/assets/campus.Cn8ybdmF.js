import{g as e}from"./index.5OOg3TMX.js";import{Z as r}from"./index-BFaTdkBU.js";const t=e`
    mutation campusSetDeliveryTarget($zoneId: ID!, $buildingId: ID!, $route: String, $slotId: Int) {
        campusSetDeliveryTarget(zoneId: $zoneId, buildingId: $buildingId, route: $route, slotId: $slotId) {
            id
            customFields { buildingId campusZone fulfillmentRoute deliverySlotId deliverySlotText }
        }
    }
`,d=e`
    query campusZones { campusZones { id name fee } }
`,n=e`
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
`;function i(e){return r().request(t,e)}function s(){return r().request(d).then(e=>(null==e?void 0:e.campusZones)??[])}function l(e){return r().request(n,{zoneId:e}).then(e=>(null==e?void 0:e.campusBuildings)??[])}function c(){return r().request(u).then(e=>(null==e?void 0:e.campusShopSlots)??[])}function m(e){return r().request(a,{orderId:e}).then(e=>null==e?void 0:e.campusOrderRider)}function p(){return r().request(o).then(e=>null==e?void 0:e.myRiderProfile)}const I=e`
    mutation campusMarkArrived($orderId: ID!) { campusMarkArrived(orderId: $orderId) { leg1Status } }
`,$=e`
    query campusR2Relay($orderId: ID!) {
        campusR2Relay(orderId: $orderId) { orderId orderCode state hallStatus deliveryStatus errandTo tip totalWithTax }
    }
`,f=e`
    query campusErrandVariant { campusErrandVariant { variantId sku errandBaseFee } }
`,y=e`
    query campusCapacityCheck { campusCapacityCheck { paused ridersOnline } }
`,q=e`
    mutation campusSetErrandInfo($input: CampusErrandInput!) { campusSetErrandInfo(input: $input) { orderId } }
`;function g(e){return r().request(I,{orderId:e}).then(e=>null==e?void 0:e.campusMarkArrived)}function v(e){return r().request($,{orderId:e}).then(e=>(null==e?void 0:e.campusR2Relay)??null)}function h(){return r().request(f).then(e=>null==e?void 0:e.campusErrandVariant)}function S(){return r().request(y).then(e=>null==e?void 0:e.campusCapacityCheck)}function R(e){return r().request(q,{input:e}).then(e=>null==e?void 0:e.campusSetErrandInfo)}const C=e`
    mutation campusRiderReportLocation($orderId: ID!, $lat: Float!, $lng: Float!) {
        campusRiderReportLocation(orderId: $orderId, lat: $lat, lng: $lng) { id }
    }
`;function D(e,t,d){return r().request(C,{orderId:e,lat:t,lng:d})}const k=e`
    mutation campusUrgeOrder($orderId: ID!) { campusUrgeOrder(orderId: $orderId) { id } }
`;function z(e){return r().request(k,{orderId:e})}export{l as a,s as b,c,v as d,m as e,p as f,S as g,R as h,h as i,g as m,D as r,i as s,z as u};
