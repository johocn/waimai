import{g as n}from"./index.DJFzyN-d.js";import{Q as e}from"./index-Dd_xe2mm.js";const t=n`
    query waimaiStoreList {
        waimaiStoreList {
            channelId channelToken name logo tags monthlySales promoText paused routesEnabled
        }
    }
`;async function a(){const n=await e().request(t);return(null==n?void 0:n.waimaiStoreList)??[]}async function o(){var n;const t=e(),a=await t.request("\n        query MenuProducts {\n            products(options: { take: 100, sort: { name: ASC } }) {\n                items {\n                    id name slug description\n                    featuredAsset { preview }\n                    variants { id name priceWithTax stockLevel options { id name code } }\n                    collections { id name slug parent { name } }\n                }\n            }\n        }\n    ");return(null==(n=null==a?void 0:a.products)?void 0:n.items)??[]}export{o as a,a as f};
