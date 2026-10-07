import{g as a}from"./index.CRu8rtg-.js";import{c as e}from"./rider.B3aX18jC.js";import{f as n}from"./waimai.Bptvld5t.js";const t=a`
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
`;async function o(){return(await n().catch(()=>[])).filter(a=>!a.paused)}async function u(){const a=await o();return(await Promise.all(a.map(a=>e(a.channelToken).request(t).then(e=>(e.campusHall??[]).map(e=>({...e,channelToken:a.channelToken,channelName:a.name}))).catch(()=>[])))).flat()}async function c(a,n){return e(n).request(s,{orderId:a}).then(a=>a.campusGrabOrder)}async function l(a){const n=await o();return(await Promise.all(n.map(n=>e(n.channelToken).request(r,{status:a}).then(a=>(a.campusMyTasks??[]).map(a=>({...a,channelToken:n.channelToken,channelName:n.name}))).catch(()=>[])))).flat()}async function d(){const a=await o(),n=await Promise.all(a.map(a=>e(a.channelToken).request(i,{}).catch(()=>({campusBuildings:[]})))),t={};for(const e of n)for(const a of e.campusBuildings??[])t[String(a.id)]=a.name;return t}export{u as a,l as b,d as f,c as g};
