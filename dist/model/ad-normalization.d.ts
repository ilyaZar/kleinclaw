import { AdDefaults, AutoPriceReductionConfig, type AutoPriceReductionConfigInput } from "./ad-defaults-config.js";
export declare const MIN_TITLE_LENGTH = 10;
export declare const MAX_TITLE_LENGTH = 65;
export declare const MAX_DESCRIPTION_LENGTH = 4000;
export interface ContactInput {
    name?: string | null;
    street?: string | null;
    zipcode?: number | string | null;
    location?: string | null;
    phone?: string | null;
}
export interface AdInput extends Record<string, unknown> {
    active?: boolean | null;
    type?: "OFFER" | "WANTED" | null;
    title?: string | null;
    description?: string | null;
    description_prefix?: string | null;
    description_suffix?: string | null;
    category?: string | null;
    special_attributes?: Record<string, string> | null;
    price?: number | null;
    price_type?: "FIXED" | "NEGOTIABLE" | "GIVE_AWAY" | "NOT_APPLICABLE" | null;
    auto_price_reduction?: AutoPriceReductionConfigInput | null;
    shipping_type?: "PICKUP" | "SHIPPING" | "NOT_APPLICABLE" | null;
    shipping_costs?: number | string | unknown[] | null;
    shipping_options?: string[] | null;
    sell_directly?: boolean | null;
    images?: string[] | null;
    contact?: ContactInput | null;
    republication_interval?: number | null;
    id?: number | string | null;
    created_on?: string | Date | null;
    updated_on?: string | Date | null;
    content_hash?: string | null;
    repost_count?: number | null;
    price_reduction_count?: number | null;
}
export interface Ad {
    active: boolean;
    type: "OFFER" | "WANTED";
    title: string;
    description: string;
    descriptionPrefix: string;
    descriptionSuffix: string;
    category: string;
    specialAttributes: Record<string, string> | null;
    price: number | null;
    priceType: "FIXED" | "NEGOTIABLE" | "GIVE_AWAY" | "NOT_APPLICABLE";
    autoPriceReduction: AutoPriceReductionConfig;
    shippingType: "PICKUP" | "SHIPPING" | "NOT_APPLICABLE";
    shippingCosts: number | null;
    shippingOptions: string[] | null;
    sellDirectly: boolean;
    images: string[];
    contact: {
        name: string;
        street: string;
        zipcode: number | string;
        location: string;
        phone: string;
    };
    republicationInterval: number;
    id: number | null;
    createdOn: Date | null;
    updatedOn: Date | null;
    contentHash: string | null;
    repostCount: number;
    priceReductionCount: number;
}
export declare function toAd(input: AdInput, defaults?: AdDefaults): Ad;
