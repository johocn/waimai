import { getGraphQLClient } from '../client';

export async function getActiveCustomer() {
    const client = getGraphQLClient();
    return client.request(`query {
        activeCustomer {
            id firstName lastName emailAddress phoneNumber
            customFields { avatarUrl invoiceTitles referralCode }
            addresses {
                id fullName streetLine1 streetLine2 city province postalCode country { name } phoneNumber defaultShippingAddress defaultBillingAddress
                customFields { zoneId buildingId route }
            }
        }
    }`);
}

export async function getEligiblePaymentMethods() {
    const client = getGraphQLClient();
    return client.request(`query { eligiblePaymentMethods { id name code description isEligible eligibilityMessage } }`);
}