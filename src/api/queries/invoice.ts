import { getGraphQLClient } from '../client';

/** 我的发票年列表 */
export async function getMyInvoices() {
    const client = getGraphQLClient();
    const query = `
        query GetMyInvoices {
            myInvoices {
                id invoiceType status title taxNumber email amount
                orderIds invoiceNo pdfUrl issuedAt createdAt lastError
            }
        }
    `;
    return client.request(query);
}

/** 下载/刷新发票 PDF：ISSUED 状态可用，返回带 pdfUrl 的发票 */
export async function downloadInvoicePdf(id: string) {
    const client = getGraphQLClient();
    const query = `
        mutation DownloadInvoicePdf($id: ID!) {
            downloadInvoicePdf(id: $id) { id status pdfUrl lastError }
        }
    `;
    return client.request(query, { id });
}

/** 为订单申请开票（invoiceInfo 为 JSON 字符串） */
export async function applyOrderInvoice(orderId: string, invoiceInfo: string) {
    const client = getGraphQLClient();
    const query = `
        mutation ApplyOrderInvoice($orderId: ID!, $invoiceInfo: String!) {
            applyOrderInvoice(orderId: $orderId, invoiceInfo: $invoiceInfo)
        }
    `;
    return client.request(query, { orderId, invoiceInfo });
}
