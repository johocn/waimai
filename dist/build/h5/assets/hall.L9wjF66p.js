import{g as a}from"./index.DnymzRLK.js";import{c as e}from"./rider.DZXWd4DQ.js";import{f as t}from"./waimai.3KbXHgMh.js";const n=a`
    query campusHall {
        campusHall {
            id code total shipping createdAt
            customFields { hallStatus hallEnteredAt tip fulfillmentRoute campusZone buildingId deliverySlotText routeGroupId }
        }
    }
`,s=a`
    mutation campusGrabOrder($orderId: ID!) { campusGrabOrder(orderId: $orderId) { id code } }
`,r=a`
    query campusMyTasks($status: String) {
        campusMyTasks(status: $status) {
            id code total shipping createdAt
            customFields { deliveryStatus fulfillmentRoute campusZone buildingId deliverySlotText tip riderEarning urged routeGroupId }
        }
    }
`,i=a`
    query campusBuildings($zoneId: ID) { campusBuildings(zoneId: $zoneId) { id name zoneId } }
`;async function o(){return(await t().catch(()=>[])).filter(a=>!a.paused)}async function u(){const a=await o();return(await Promise.all(a.map(a=>e(a.channelToken).request(n).then(e=>(e.campusHall??[]).map(e=>({...e,channelToken:a.channelToken,channelName:a.name}))).catch(()=>[])))).flat()}async function c(a,t){return e(t).request(s,{orderId:a}).then(a=>a.campusGrabOrder)}async function l(a){const t=await o();return(await Promise.all(t.map(t=>e(t.channelToken).request(r,{status:a}).then(a=>(a.campusMyTasks??[]).map(a=>({...a,channelToken:t.channelToken,channelName:t.name}))).catch(()=>[])))).flat()}async function d(){const a=await o(),t=await Promise.all(a.map(a=>e(a.channelToken).request(i,{}).catch(()=>({campusBuildings:[]})))),n={};for(const e of t)for(const a of e.campusBuildings??[])n[String(a.id)]=a.name;return n}export{u as a,l as b,d as f,c as g};
