import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

/** 附近有货：跨仓/门店查同款 SKU 的可售库存（按距离升序） */
export const VARIANT_NEARBY_STOCK = gql`
    query VariantNearbyStock($productId: ID!, $variantId: ID, $lat: Float, $lng: Float, $city: String) {
        variantNearbyStock(productId: $productId, variantId: $variantId, lat: $lat, lng: $lng, city: $city) {
            distanceKm
            location {
                id
                name
                description
                lat
                lng
                serviceCities
            }
            variants {
                variantId
                variantName
                sku
                stockOnHand
                stockAllocated
                stockAvailable
            }
        }
    }
`;

export interface NearbyStockItem {
    distanceKm: number;
    location: { id: string; name: string; description?: string; lat?: number; lng?: number; serviceCities?: string[] };
    variants: Array<{ variantId: string; variantName: string; sku: string; stockOnHand: number; stockAllocated: number; stockAvailable: number }>;
}

/** 后端无坐标时返回 Number.MAX_SAFE_INTEGER（脏距离哨兵值） */
export const DISTANCE_UNKNOWN = 100000;

export function isDistanceKnown(km: number): boolean {
    return Number.isFinite(km) && km >= 0 && km < DISTANCE_UNKNOWN;
}

export async function fetchNearbyStock(params: {
    productId: string;
    variantId?: string;
    lat?: number;
    lng?: number;
    city?: string;
}): Promise<NearbyStockItem[]> {
    const res: any = await getGraphQLClient().request(VARIANT_NEARBY_STOCK, {
        productId: params.productId,
        variantId: params.variantId || null,
        lat: params.lat ?? null,
        lng: params.lng ?? null,
        city: params.city || null,
    });
    return (res?.variantNearbyStock ?? []) as NearbyStockItem[];
}
