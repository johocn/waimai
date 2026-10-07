import { getGraphQLClient } from '../client';

/** 资料编辑：昵称/电话/头像（Task 5 消费） */
export function updateCustomerProfile(input: { firstName?: string; phoneNumber?: string; avatarUrl?: string }) {
    const customFields: any = {};
    if (input.avatarUrl !== undefined) customFields.avatarUrl = input.avatarUrl;
    return getGraphQLClient().request(`mutation UpdateCustomerProfile($firstName: String, $phoneNumber: String, $customFields: JSON) {
        updateCustomer(input: { firstName: $firstName, phoneNumber: $phoneNumber, customFields: $customFields }) {
            ...on Customer { id }
            ...on ErrorResult { errorCode message }
        }
    }`, { firstName: input.firstName, phoneNumber: input.phoneNumber, customFields });
}

/** 发票抬头保存（整列表写回，Task 8 消费） */
export function updateInvoiceTitles(titlesJson: string) {
    return getGraphQLClient().request(`mutation UpdateInvoiceTitles($customFields: JSON) {
        updateCustomer(input: { customFields: $customFields }) {
            ...on Customer { id customFields { invoiceTitles } }
            ...on ErrorResult { errorCode message }
        }
    }`, { customFields: { invoiceTitles: titlesJson } });
}

/** 地址簿：Address.customFields 随 Create/UpdateAddressInput 的 customFields: JSON 直写 */
export function createCustomerAddress(input: {
    fullName: string; phoneNumber: string; streetLine1: string;
    zoneId: string; buildingId: string; defaultShipping?: boolean;
}) {
    return getGraphQLClient().request(`mutation CreateAddress($input: CreateAddressInput!) {
        createCustomerAddress(input: $input) { id }
    }`, {
        input: {
            fullName: input.fullName, phoneNumber: input.phoneNumber, streetLine1: input.streetLine1,
            countryCode: 'CN', // 本 fork CreateAddressInput 必填（availableCountries 仅 CN）
            defaultShippingAddress: !!input.defaultShipping,
            customFields: { zoneId: input.zoneId, buildingId: input.buildingId },
        },
    });
}

export function updateCustomerAddress(input: {
    id: string; fullName: string; phoneNumber: string; streetLine1: string;
    zoneId: string; buildingId: string; defaultShipping?: boolean;
}) {
    return getGraphQLClient().request(`mutation UpdateAddress($input: UpdateAddressInput!) {
        updateCustomerAddress(input: $input) { id }
    }`, {
        input: {
            id: input.id, fullName: input.fullName, phoneNumber: input.phoneNumber, streetLine1: input.streetLine1,
            countryCode: 'CN',
            defaultShippingAddress: !!input.defaultShipping,
            customFields: { zoneId: input.zoneId, buildingId: input.buildingId },
        },
    });
}

export function deleteCustomerAddress(id: string) {
    return getGraphQLClient().request(`mutation DeleteAddress($id: ID!) { deleteCustomerAddress(id: $id) { success } }`, { id });
}

/** 订单开票申请（Task 11 消费；后端 mutation 见 vendure campus-invoice.resolver.ts） */
export function applyOrderInvoice(orderId: string, invoiceInfo: string) {
    return getGraphQLClient().request(`mutation ApplyOrderInvoice($orderId: ID!, $invoiceInfo: String!) {
        applyOrderInvoice(orderId: $orderId, invoiceInfo: $invoiceInfo)
    }`, { orderId, invoiceInfo });
}
