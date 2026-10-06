import{g as a}from"./index.DJFzyN-d.js";import{c as e}from"./rider.B47GYdFS.js";import{f as n}from"./waimai.BICTulK0.js";const t=a`
    query campusHall {
        campusHall {
            id code total shipping createdAt
            customFields { hallStatus hallEnteredAt tip fulfillmentRoute campusZone buildingId deliverySlotText }
        }
    }
`,s=a`
    mutation campusGrabOrder($orderId: ID!) { campusGrabOrder(orderId: $orderId) { id code } }
`,r=a`
    query campusMyTasks($status: String) {
        campusMyTasks(status: $status) {
            id code total shipping createdAt
            customFields { deliveryStatus fulfillmentRoute campusZone buildingId deliverySlotText tip riderEarning }
        }
    }
`,i=a`
    query campusBuildings($zoneId: ID) { campusBuildings(zoneId: $zoneId) { id name zoneId } }
`;async function c(){return(await n().catch(()=>[])).filter(a=>!a.paused)}async function o(){const a=await c();return(await Promise.all(a.map(a=>e(a.channelToken).request(t).then(e=>(e.campusHall??[]).map(e=>({...e,channelToken:a.channelToken,channelName:a.name}))).catch(()=>[])))).flat()}async function u(a,n){return e(n).request(s,{orderId:a}).then(a=>a.campusGrabOrder)}async function l(a){const n=await c();return(await Promise.all(n.map(n=>e(n.channelToken).request(r,{status:a}).then(a=>(a.campusMyTasks??[]).map(a=>({...a,channelToken:n.channelToken,channelName:n.name}))).catch(()=>[])))).flat()}async function d(){const a=await c(),n=await Promise.all(a.map(a=>e(a.channelToken).request(i,{}).catch(()=>({campusBuildings:[]})))),t={};for(const e of n)for(const a of e.campusBuildings??[])t[String(a.id)]=a.name;return t}export{o as a,l as b,d as f,u as g};
