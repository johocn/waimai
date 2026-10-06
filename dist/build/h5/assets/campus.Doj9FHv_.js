import{g as e}from"./index.DgJnUqKX.js";import{V as r}from"./index-BvArvVre.js";const d=e`
    mutation campusSetDeliveryTarget($zoneId: ID!, $buildingId: ID!, $route: String, $slotId: Int) {
        campusSetDeliveryTarget(zoneId: $zoneId, buildingId: $buildingId, route: $route, slotId: $slotId) {
            id
            customFields { buildingId campusZone fulfillmentRoute deliverySlotId deliverySlotText }
        }
    }
`,t=e`
    query campusZones { campusZones { id name fee } }
`,i=e`
    query campusBuildings($zoneId: ID) { campusBuildings(zoneId: $zoneId) { id name detail zoneId } }
`,u=e`
    query campusShopSlots { campusShopSlots { id slotDate startTime endTime capacity lockedCount active } }
`,n=e`
    query campusOrderRider($orderId: ID!) { campusOrderRider(orderId: $orderId) { realName credit } }
`,o=e`
    query myRiderProfile {
        myRiderProfile {
            customerId riderStatus riderRealName riderStudentNo riderCampus riderCredit
        }
    }
`;function s(e){return r().request(d,e)}function l(){return r().request(t).then(e=>(null==e?void 0:e.campusZones)??[])}function a(e){return r().request(i,{zoneId:e}).then(e=>(null==e?void 0:e.campusBuildings)??[])}function m(){return r().request(u).then(e=>(null==e?void 0:e.campusShopSlots)??[])}function c(e){return r().request(n,{orderId:e}).then(e=>null==e?void 0:e.campusOrderRider)}function I(){return r().request(o).then(e=>null==e?void 0:e.myRiderProfile)}export{a,l as b,m as c,c as d,I as f,s};
