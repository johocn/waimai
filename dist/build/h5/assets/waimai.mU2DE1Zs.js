import{g as e}from"./index.DJZT5_k5.js";import{R as n}from"./index-BiuAv7rU.js";const t=e`
    query waimaiStoreList {
        waimaiStoreList {
            channelId channelToken name logo tags monthlySales promoText paused routesEnabled
            deliveryMinutes minOrderAmount deliveryFee storeAddress storePhone storeNotice errandBaseFee
        }
    }
`;async function s(){const e=await n().request(t);return(null==e?void 0:e.waimaiStoreList)??[]}async function o(){var e;const t=n(),s=await t.request("\n        query MenuProducts {\n            products(options: { take: 100, sort: { name: ASC } }) {\n                items {\n                    id name slug description\n                    featuredAsset { preview }\n                    variants { id name priceWithTax stockLevel options { id name code } }\n                    collections { id name slug parent { name } }\n                }\n            }\n        }\n    ");return(null==(e=null==s?void 0:s.products)?void 0:e.items)??[]}export{o as a,s as f};
