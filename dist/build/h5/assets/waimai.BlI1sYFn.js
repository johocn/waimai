import{g as e}from"./index.DgJnUqKX.js";import{V as n}from"./index-BvArvVre.js";const t=e`
    query waimaiStoreList {
        waimaiStoreList {
            channelId channelToken name logo tags monthlySales promoText paused routesEnabled
            deliveryMinutes minOrderAmount deliveryFee storeAddress storePhone storeNotice
        }
    }
`;async function o(){const e=await n().request(t);return(null==e?void 0:e.waimaiStoreList)??[]}async function s(){var e;const t=n(),o=await t.request("\n        query MenuProducts {\n            products(options: { take: 100, sort: { name: ASC } }) {\n                items {\n                    id name slug description\n                    featuredAsset { preview }\n                    variants { id name priceWithTax stockLevel options { id name code } }\n                    collections { id name slug parent { name } }\n                }\n            }\n        }\n    ");return(null==(e=null==o?void 0:o.products)?void 0:e.items)??[]}export{s as a,o as f};
