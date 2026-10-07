import{g as e}from"./index.CXbk3cRj.js";import{Z as t}from"./index-CjAIxZvS.js";const s="\n    id orderId orderLineId type state reason description evidenceImages\n    refundAmount rejectReason refundTransactionId actualRefundAmount refundedAt refundError\n    createdAt updatedAt messageCount\n    order { id code totalWithTax }\n",a=e`
    query myAfterSalesRequests($options: AfterSalesRequestListOptions) {
        myAfterSalesRequests(options: $options) { totalItems items { ${s} } }
    }
`,n=e`
    query afterSalesRequest($id: ID!) { afterSalesRequest(id: $id) { ${s} } }
`,i=e`
    query afterSalesMessages($id: ID!, $options: AfterSalesMessageListOptions) {
        afterSalesMessages(id: $id, options: $options) { totalItems items { id senderType senderName content images createdAt } }
    }
`,r=e`
    mutation createAfterSalesRequest($input: CreateAfterSalesRequestInput!) {
        createAfterSalesRequest(input: $input) { ${s} }
    }
`,o=e`
    mutation cancelAfterSalesRequest($id: ID!) { cancelAfterSalesRequest(id: $id) { ${s} } }
`,u=e`
    mutation appealAfterSalesRequest($id: ID!, $note: String!) {
        appealAfterSalesRequest(id: $id, note: $note) { ${s} }
    }
`,d=e`
    mutation addAfterSalesMessage($id: ID!, $content: String!, $images: [String!]) {
        addAfterSalesMessage(id: $id, content: $content, images: $images) { id content createdAt }
    }
`;async function l(){var e;const s=await t().request(a,{options:{skip:0,take:20}});return(null==(e=null==s?void 0:s.myAfterSalesRequests)?void 0:e.items)??[]}async function c(e){const s=await t().request(n,{id:e});return(null==s?void 0:s.afterSalesRequest)??null}async function f(e){var s;const a=await t().request(i,{id:e,options:{skip:0,take:50}});return(null==(s=null==a?void 0:a.afterSalesMessages)?void 0:s.items)??[]}async function p(e){const s=await t().request(r,{input:e});return null==s?void 0:s.createAfterSalesRequest}async function m(e){const s=await t().request(o,{id:e});return null==s?void 0:s.cancelAfterSalesRequest}async function q(e,s){const a=await t().request(u,{id:e,note:s});return null==a?void 0:a.appealAfterSalesRequest}async function S(e,s,a){const n=await t().request(d,{id:e,content:s,images:null});return null==n?void 0:n.addAfterSalesMessage}export{c as a,f as b,p as c,m as d,q as e,l as f,S as g};
