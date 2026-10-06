import{g as e}from"./index.Dv_5WnkF.js";import{T as r}from"./index-Cxb1bz7H.js";const t=e`
    mutation campusSetDeliveryTarget($zoneId: ID!, $buildingId: ID!, $route: String, $slotId: Int) {
        campusSetDeliveryTarget(zoneId: $zoneId, buildingId: $buildingId, route: $route, slotId: $slotId) {
            id
            customFields { buildingId campusZone fulfillmentRoute deliverySlotId deliverySlotText }
        }
    }
`,u=e`
    query campusZones { campusZones { id name fee } }
`,n=e`
    query campusBuildings($zoneId: ID) { campusBuildings(zoneId: $zoneId) { id name detail zoneId } }
`,d=e`
    query campusShopSlots { campusShopSlots { id slotDate startTime endTime capacity lockedCount active } }
`,a=e`
    query campusOrderRider($orderId: ID!) { campusOrderRider(orderId: $orderId) { realName credit } }
`,i=e`
    query myRiderProfile {
        myRiderProfile {
            customerId riderStatus riderRealName riderStudentNo riderCampus riderCredit
        }
    }
`;function o(e){return r().request(t,e)}function s(){return r().request(u).then(e=>(null==e?void 0:e.campusZones)??[])}function l(e){return r().request(n,{zoneId:e}).then(e=>(null==e?void 0:e.campusBuildings)??[])}function c(){return r().request(d).then(e=>(null==e?void 0:e.campusShopSlots)??[])}function m(e){return r().request(a,{orderId:e}).then(e=>null==e?void 0:e.campusOrderRider)}function p(){return r().request(i).then(e=>null==e?void 0:e.myRiderProfile)}const I=e`
    mutation campusMarkArrived($orderId: ID!) { campusMarkArrived(orderId: $orderId) { leg1Status } }
`,f=e`
    query campusR2Relay($orderId: ID!) {
        campusR2Relay(orderId: $orderId) { orderId orderCode state hallStatus deliveryStatus errandTo tip totalWithTax }
    }
`,y=e`
    query campusErrandVariant { campusErrandVariant { variantId sku errandBaseFee } }
`,v=e`
    query campusCapacityCheck { campusCapacityCheck { paused ridersOnline } }
`,h=e`
    mutation campusSetErrandInfo($input: CampusErrandInput!) { campusSetErrandInfo(input: $input) { orderId } }
`;function q(e){return r().request(I,{orderId:e}).then(e=>null==e?void 0:e.campusMarkArrived)}function S(e){return r().request(f,{orderId:e}).then(e=>(null==e?void 0:e.campusR2Relay)??null)}function $(){return r().request(y).then(e=>null==e?void 0:e.campusErrandVariant)}function R(){return r().request(v).then(e=>null==e?void 0:e.campusCapacityCheck)}function g(e){return r().request(h,{input:e}).then(e=>null==e?void 0:e.campusSetErrandInfo)}export{l as a,s as b,c,S as d,m as e,p as f,R as g,g as h,$ as i,q as m,o as s};
