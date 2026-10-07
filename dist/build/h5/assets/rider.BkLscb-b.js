import{g as e}from"./index.D_pYUmjh.js";import{G as n,H as r,ah as t,a0 as a}from"./index-DDQgJEbc.js";function i(e){const i={"vendure-token":e||"cnx87ezvmjx8nn3bth6c"},s=n().token||r();return s&&(i.Authorization="Bearer "+s),new t(a(),{headers:i})}const s=e`
    mutation applyRider($realName: String!, $studentNo: String!, $campus: String!, $idImg: String) {
        applyRider(realName: $realName, studentNo: $studentNo, campus: $campus, idImg: $idImg) { status }
    }
`,u=e`
    query myRiderProfile {
        myRiderProfile { customerId riderStatus riderRealName riderStudentNo riderCampus riderCredit }
    }
`,o=e`
    mutation campusRiderOnline($online: Boolean!) { campusRiderOnline(online: $online) { online } }
`,d=e`
    mutation campusRiderHeartbeat { campusRiderHeartbeat { online } }
`;async function m(e){return i().request(s,e).then(e=>e.applyRider)}async function c(){return i().request(u).then(e=>e.myRiderProfile)}async function l(e){return i().request(o,{online:e}).then(e=>e.campusRiderOnline)}async function p(){return i().request(d).then(e=>e.campusRiderHeartbeat)}export{m as a,l as b,i as c,c as m,p as r};
